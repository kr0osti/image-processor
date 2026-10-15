import { NextResponse, type NextRequest } from 'next/server'
import { checkProcessAuth } from '@/lib/process-api'
import { uploads } from '@/lib/chunked-upload'

export const runtime = 'nodejs'

/**
 * Abandons a chunked upload and frees its memory. A POST rather than a
 * DELETE, for clients limited to GET and POST. Unknown ids succeed too.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResponse = checkProcessAuth(request)
  if (authResponse) return authResponse

  uploads.cancel((await params).id)
  return NextResponse.json({ success: true })
}
