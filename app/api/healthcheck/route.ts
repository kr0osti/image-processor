import { NextResponse } from 'next/server';

/**
 * API route handler for health checking the application
 *
 * This endpoint provides a simple health check that returns a 200 status code
 * and the current timestamp. It can be used by monitoring tools to verify
 * that the application is running and responsive.
 *
 * @returns {Promise<NextResponse>} JSON response with status and timestamp
 */
export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() }, { status: 200 });
}