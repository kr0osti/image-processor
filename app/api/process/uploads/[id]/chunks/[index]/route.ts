import { NextResponse, type NextRequest } from 'next/server'
import { createRateLimiter } from '../../../../../../utils/rate-limit.js'
import { checkProcessAuth, errorResponse as error } from '@/lib/process-api'
import { UploadError, uploads } from '@/lib/chunked-upload'

export const runtime = 'nodejs'

// A 25 MB image is about 2,300 chunks at the default 12 KB per chunk
const rateLimiter = createRateLimiter({
  limit: 6000,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many upload chunks. Please try again later.',
  name: 'process-upload-chunk',
})

/**
 * Adds one chunk to a chunked upload. The chunk is base64 in the
 * `X-Chunk-Data` header; chunks are numbered from 0 and sent in order.
 * Resending the last chunk is harmless. Returns the bytes received so far.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; index: string }> }) {
  if (!process.env.PROCESS_API_KEY) return checkProcessAuth(request)

  const rateLimitResponse = await rateLimiter(request)
  if (rateLimitResponse) return rateLimitResponse

  const authResponse = checkProcessAuth(request)
  if (authResponse) return authResponse

  const { id, index } = await params
  try {
    const data = (request.headers.get('x-chunk-data') || '').trim()
    const progress = uploads.addChunk(id, /^\d+$/.test(index) ? Number(index) : -1, data)
    return NextResponse.json({ success: true, ...progress })
  } catch (err) {
    if (err instanceof UploadError) return error(err.status, err.message)
    throw err
  }
}
