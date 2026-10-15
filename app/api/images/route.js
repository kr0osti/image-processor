import { NextResponse } from 'next/server';
import { writeFile, mkdir, unlink } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { cleanupOldUploads } from '../../utils/cleanup';
import { createRateLimiter } from '../../utils/rate-limit.js';
import { createDeleteToken, isValidDeleteToken } from '../../utils/delete-token.js';
import { processedFilename } from '../../utils/processed-filename.js';

// Run cleanup on server start (will run when this file is first imported)
(async () => {
  try {
    await cleanupOldUploads();
  } catch (error) {
    console.error('Error during initial cleanup:', error);
  }
})();

// Ensure uploads directory exists
/**
 * Ensures the uploads directory exists and is writable
 * @returns {Promise<string>} Path to the uploads directory
 * @throws {Error} If directory cannot be created or is not writable
 */
async function ensureUploadsDir() {
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  try {
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    // Log the directory for debugging

    // Check if directory is writable
    try {
      const testFile = path.join(uploadsDir, '.test-write');
      await writeFile(testFile, 'test');
      await unlink(testFile);
    } catch (writeError) {
      console.error('Uploads directory is not writable:', writeError);
    }

    return uploadsDir;
  } catch (error) {
    console.error('Error creating uploads directory:', error);
    throw error;
  }
}

// Allowed image MIME types and the file extension used when saving them
// Processed images are always stored as lossless PNG
const ALLOWED_IMAGE_TYPES = {
  'image/png': 'png',
};

// Maximum size of a single saved image (25 MB)
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

// Maximum request body size (allows a 25 MB image as base64 plus JSON overhead)
const MAX_REQUEST_BYTES = Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 64 * 1024;

// Requests still running after this long get a 504 response
const REQUEST_TIMEOUT_MS = 60 * 1000;

class RequestTimeoutError extends Error {
  constructor(ms) {
    super(`Request processing timed out after ${ms / 1000} seconds`);
    this.name = 'RequestTimeoutError';
  }
}

// Create a rate limiter for the images endpoint
// Allow 300 requests per minute per IP address
const rateLimiter = createRateLimiter({
  limit: 300,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many image upload requests. Please try again later.',
  name: 'images'
});

/**
 * API route handler for processing and saving images
 *
 * This endpoint processes and saves images from various sources including
 * data URLs, form uploads, and web URLs. It includes rate limiting to prevent abuse.
 * The handler implements a 60-second timeout to prevent long-running requests.
 *
 * Rate limited to 300 requests per minute per IP address.
 *
 * @param {Request} request - The incoming HTTP request
 * @returns {Promise<NextResponse>} JSON response with processing results
 * @throws {Error} If image processing fails
 * @timeout 60 seconds - Requests still running after 60 seconds get a 504 response
 */
export async function POST(request) {
  // Check rate limit before processing the request
  const rateLimitResponse = await rateLimiter(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  /**
   * Race the handler against a timer so a request that hangs gets a 504
   * instead of tying up the client. JavaScript can't cancel the handler, so
   * it may still finish in the background; its result is then ignored.
   */
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new RequestTimeoutError(REQUEST_TIMEOUT_MS)), REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([handleRequest(request), timeout]);
  } catch (error) {
    console.error('Error processing images:', error);

    // Check if this is a timeout error
    if (error instanceof RequestTimeoutError) {
      return NextResponse.json(
        {
          success: false,
          message: 'Request timed out. The server took too long to process your request.',
          error: error.message
        },
        { status: 504 } // Gateway Timeout
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to process images',
        error: error.message
      },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Handles a POST request once it has passed the rate limiter.
 *
 * @param {Request} request - The incoming HTTP request
 * @returns {Promise<NextResponse>} JSON response with processing results
 */
async function handleRequest(request) {
  const contentType = request.headers.get('content-type') || '';

  // Reject oversized requests before reading the body
  const contentLength = Number(request.headers.get('content-length'));
  if (contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({
      success: false,
      message: 'Request too large'
    }, { status: 413 });
  }

  // Handle JSON request (dataUrl)
  if (contentType.includes('application/json')) {
    const body = await request.json();
    const { dataUrl, originalFilename } = body;

    if (!dataUrl || typeof dataUrl !== 'string') {
      return NextResponse.json({
        success: false,
        message: 'No data URL provided'
      }, { status: 400 });
    }

    /**
     * Log the size of the received data URL for debugging and monitoring
     * This helps identify potential issues with large payloads
     * Size is converted from bytes to kilobytes for readability
     */

    // Extract the base64 data from the data URL
    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

    if (!matches || matches.length !== 3 || !ALLOWED_IMAGE_TYPES[matches[1].toLowerCase()]) {
      return NextResponse.json({
        success: false,
        message: 'Invalid data URL format'
      }, { status: 400 });
    }

    if (matches[2].length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3)) {
      return NextResponse.json({
        success: false,
        message: 'Image too large'
      }, { status: 413 });
    }

    const uploadsDir = await ensureUploadsDir();
    const fileExt = ALLOWED_IMAGE_TYPES[matches[1].toLowerCase()];

    // Named after the original file when known, otherwise random
    const filename = processedFilename(originalFilename, fileExt);
    
    const filePath = path.join(uploadsDir, filename);

    try {
      // Convert base64 to buffer and save to file
      const buffer = Buffer.from(matches[2], 'base64');
      await writeFile(filePath, buffer);


      // Verify file exists after saving
      if (existsSync(filePath)) {
      } else {
        console.error(`File was not found after saving: ${filePath}`);
      }

      // The URL should be relative to the public directory
      const publicUrl = `/uploads/${filename}`;
      const apiUrl = `/api/serve-image?file=${filename}`;

      // After saving the file


      return NextResponse.json({
        success: true,
        message: 'Image saved successfully',
        url: publicUrl,
        apiUrl: apiUrl,
        filename,
        // Lets this client delete the file again (see DELETE below)
        deleteToken: createDeleteToken(filename)
      });
    } catch (writeError) {
      console.error(`Error writing file: ${writeError.message}`);


      return NextResponse.json({
        success: false,
        message: 'Failed to save image'
      }, { status: 500 });
    }
  }
  // Handle unsupported content type
  else {
    return NextResponse.json({
      success: false,
      message: 'Unsupported content type',
      error: `Content type '${contentType}' is not supported. This endpoint saves already processed images sent as JSON; to process an image on the server, use POST /api/process.`
    }, { status: 400 });
  }
}

// Most files a single DELETE request may remove
const MAX_DELETE_FILES = 500;

// Plain filenames only: no paths, no hidden files
const SAFE_FILENAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

const deleteRateLimiter = createRateLimiter({
  limit: 30,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many delete requests. Please try again later.',
  name: 'images-delete'
});

/**
 * Deletes processed images the client saved earlier.
 *
 * Body: { files: [{ filename, token }] }, where each token is the deleteToken
 * returned when the file was saved. Files with an invalid token or name are
 * skipped and reported as rejected; files that are already gone count as missing.
 *
 * @param {Request} request - The incoming HTTP request
 * @returns {Promise<NextResponse>} JSON with deleted, missing and rejected counts
 */
export async function DELETE(request) {
  const rateLimitResponse = await deleteRateLimiter(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let files;
  try {
    ({ files } = await request.json());
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(files) || files.length > MAX_DELETE_FILES) {
    return NextResponse.json(
      { success: false, message: `Expected "files" to be an array of at most ${MAX_DELETE_FILES} entries` },
      { status: 400 }
    );
  }

  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  let deleted = 0;
  let missing = 0;
  let rejected = 0;

  for (const entry of files) {
    const filename = entry?.filename;
    if (
      typeof filename !== 'string' ||
      !SAFE_FILENAME.test(filename) ||
      path.basename(filename) !== filename ||
      !isValidDeleteToken(filename, entry?.token)
    ) {
      rejected++;
      continue;
    }

    try {
      await unlink(path.join(uploadsDir, filename));
      deleted++;
    } catch (error) {
      if (error?.code === 'ENOENT') {
        missing++;
      } else {
        console.error(`Error deleting ${filename}:`, error);
        rejected++;
      }
    }
  }

  return NextResponse.json({ success: rejected === 0, deleted, missing, rejected });
}
