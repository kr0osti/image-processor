import { NextResponse } from 'next/server';
import { cleanupOldUploads } from '@/app/utils/cleanup';

/**
 * API route handler for triggering cleanup of old uploads
 * @param {Request} request - The incoming HTTP request
 * @returns {Promise<NextResponse>} JSON response with cleanup results
 * @throws {Error} If cleanup process fails
 */
export async function GET(request) {
  try {
    // Get the API key from the request (for security)
    const url = new URL(request.url);
    const apiKey = url.searchParams.get('key');
    
    // Check if API key is provided and valid (you should use an environment variable for this)
    const validApiKey = process.env.CLEANUP_API_KEY || 'change-this-to-a-secure-key';
    
    if (!apiKey || apiKey !== validApiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get custom max age from query params (in minutes), default to 60 minutes (1 hour)
    const maxAgeMinutes = parseInt(url.searchParams.get('maxAge') || '60', 10);
    const maxAgeMs = maxAgeMinutes * 60 * 1000;
    
    // Run the cleanup
    const result = await cleanupOldUploads(maxAgeMs);
    
    return NextResponse.json({
      success: true,
      message: `Cleanup complete. Deleted ${result.deleted} files, encountered ${result.errors} errors.`,
      ...result
    });
  } catch (error) {
    console.error('Error in cleanup route:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to run cleanup',
      error: error.message 
    }, { status: 500 });
  }
}
