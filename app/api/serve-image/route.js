import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

/**
 * API route handler for serving images from the uploads directory
 * @param {Request} request - The incoming HTTP request
 * @returns {Promise<NextResponse>} Response containing the image file or error
 * @throws {Error} If file cannot be read or doesn't exist
 */
export async function GET(request) {
  try {
    // Get the image filename from the URL
    const url = new URL(request.url);
    const rawFilename = url.searchParams.get('file');
    
    if (!rawFilename) {
      return NextResponse.json({ error: 'No filename provided' }, { status: 400 });
    }
    
    // Sanitize filename to prevent path traversal
    const filename = path.basename(rawFilename);

    // Construct the file path
    const filePath = path.join(process.cwd(), 'public', 'uploads', filename);
    
    // Check if the file exists
    if (!existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    
    // Read the file
    const fileBuffer = await readFile(filePath);
    
    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.webp') contentType = 'image/webp';
    
    // ?download=1 asks the browser to save the file instead of showing it,
    // e.g. for a link opened from a script that can't save files itself
    const download = ['1', 'true', 'yes'].includes((url.searchParams.get('download') || '').toLowerCase());
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400'
    };
    if (download) {
      // Plain ASCII fallback for old clients, the real name as RFC 5987 UTF-8
      // (which also forbids the ' ( ) * that encodeURIComponent leaves as is)
      const asciiName = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
      const utf8Name = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
      headers['Content-Disposition'] = `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`;
    }

    // Return the file
    return new NextResponse(fileBuffer, { headers });
  } catch (error) {
    console.error('Error serving image:', error);
    return NextResponse.json({ error: 'Failed to serve image' }, { status: 500 });
  }
}
