import { NextResponse } from 'next/server';
import { writeFile, mkdir, unlink } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { existsSync } from 'fs';
import { cleanupOldUploads } from '../../utils/cleanup';
import { createRateLimiter } from '../../utils/rate-limit.js';

// Run cleanup on server start (will run when this file is first imported)
(async () => {
  try {
    console.log('Running initial cleanup of old uploads...');
    const result = await cleanupOldUploads();
    console.log(`Initial cleanup complete. Deleted ${result.deleted} files.`);
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
      console.log(`Created uploads directory at: ${uploadsDir}`);
    }

    // Log the directory for debugging
    console.log(`Using uploads directory: ${uploadsDir}`);

    // Check if directory is writable
    try {
      const testFile = path.join(uploadsDir, '.test-write');
      await writeFile(testFile, 'test');
      await unlink(testFile);
      console.log('Uploads directory is writable');
    } catch (writeError) {
      console.error('Uploads directory is not writable:', writeError);
    }

    return uploadsDir;
  } catch (error) {
    console.error('Error creating uploads directory:', error);
    throw error;
  }
}

// Create a rate limiter for the images endpoint
// Allow 300 requests per minute per IP address
const rateLimiter = createRateLimiter({
  limit: 300,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many image upload requests. Please try again later.'
});

/**
 * API route handler for processing and saving images
 *
 * This endpoint processes and saves images from various sources including
 * data URLs, form uploads, and web URLs. It includes rate limiting to prevent abuse.
 *
 * Rate limited to 300 requests per minute per IP address.
 *
 * @param {Request} request - The incoming HTTP request
 * @returns {Promise<NextResponse>} JSON response with processing results
 * @throws {Error} If image processing fails
 */
export async function POST(request) {
  // Check rate limit before processing the request
  const rateLimitResponse = await rateLimiter(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  try {
    const contentType = request.headers.get('content-type') || '';

    // Handle JSON request (dataUrl)
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const { dataUrl } = body;

      if (!dataUrl) {
        return NextResponse.json({
          success: false,
          message: 'No data URL provided'
        }, { status: 400 });
      }

      // Extract the base64 data from the data URL
      const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

      if (!matches || matches.length !== 3) {
        return NextResponse.json({
          success: false,
          message: 'Invalid data URL format'
        }, { status: 400 });
      }

      const uploadsDir = await ensureUploadsDir();
      const mimeType = matches[1];
      const fileExt = mimeType.split('/')[1] || 'png';
      const filename = `${crypto.randomBytes(16).toString('hex')}.${fileExt}`;
      const filePath = path.join(uploadsDir, filename);
      console.log(`Attempting to save file to: ${filePath}`);

      try {
        // Convert base64 to buffer and save to file
        const buffer = Buffer.from(matches[2], 'base64');
        await writeFile(filePath, buffer);

        console.log(`Successfully saved image to: ${filePath}`);

        // Verify file exists after saving
        if (existsSync(filePath)) {
          console.log(`Verified file exists at: ${filePath}`);
        } else {
          console.error(`File was not found after saving: ${filePath}`);
        }

        // The URL should be relative to the public directory
        const publicUrl = `/uploads/${filename}`;
        const apiUrl = `/api/serve-image?file=${filename}`;

        // After saving the file
        console.log(`Current working directory: ${process.cwd()}`);
        console.log(`Public directory: ${path.join(process.cwd(), 'public')}`);
        console.log(`Uploads directory: ${uploadsDir}`);
        console.log(`File saved to: ${filePath}`);
        console.log(`Public URL should be: ${publicUrl}`);

        return NextResponse.json({
          success: true,
          message: 'Image saved successfully',
          url: publicUrl,
          apiUrl: apiUrl,
          filePath: filePath,
          publicDir: path.join(process.cwd(), 'public')
        });
      } catch (writeError) {
        console.error(`Error writing file: ${writeError.message}`);
        return NextResponse.json({
          success: false,
          message: 'Failed to save image',
          error: writeError.message
        }, { status: 500 });
      }
    }
    // Handle form data
    else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();

      // Extract image data from the request
      const imageUrls = formData.getAll('imageUrls');
      const files = formData.getAll('files');
      const webUrl = formData.get('webUrl');

      // Process the images (placeholder implementation)
      const processedImages = [];

      if (imageUrls && imageUrls.length > 0) {
        console.log(`Processing ${imageUrls.length} image URLs`);
        // Process image URLs
        for (const url of imageUrls) {
          if (url) {
            processedImages.push({
              originalUrl: url,
              processedUrl: url,
              success: true
            });
          }
        }
      }

      if (files && files.length > 0) {
        console.log(`Processing ${files.length} uploaded files`);
        // Process uploaded files
        for (const file of files) {
          if (file) {
            // Save the file to the uploads directory
            const uploadsDir = await ensureUploadsDir();
            const fileExt = file.name.split('.').pop() || 'png';
            const filename = `${crypto.randomBytes(16).toString('hex')}.${fileExt}`;
            const filePath = path.join(uploadsDir, filename);
            const publicUrl = `/uploads/${filename}`;

            // Get file data as ArrayBuffer and save it
            const fileData = await file.arrayBuffer();
            await writeFile(filePath, Buffer.from(fileData));

            processedImages.push({
              originalName: file.name,
              processedUrl: publicUrl,
              success: true
            });
          }
        }
      }

      if (webUrl) {
        console.log(`Processing images from web URL: ${webUrl}`);
        processedImages.push({
          originalUrl: webUrl,
          processedUrl: null,
          success: false,
          message: 'Web scraping implementation pending'
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Images processed successfully',
        images: processedImages
      });
    }
    // Handle unsupported content type
    else {
      return NextResponse.json({
        success: false,
        message: 'Unsupported content type',
        error: `Content type '${contentType}' is not supported. Use 'application/json' or 'multipart/form-data'.`
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Error processing images:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to process images',
        error: error.message
      },
      { status: 500 }
    );
  }
}
