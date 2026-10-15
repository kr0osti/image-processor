import { NextResponse, type NextRequest } from 'next/server'
import { createRateLimiter } from '../../../utils/rate-limit.js'
import { checkProcessAuth, errorResponse as error } from '@/lib/process-api'
import { MAX_UPLOAD_BYTES, SESSION_IDLE_MS, UploadError, chunkChars, uploads } from '@/lib/chunked-upload'

export const runtime = 'nodejs'

const rateLimiter = createRateLimiter({
  limit: 30,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many uploads started. Please try again later.',
  name: 'process-upload-start',
})

/**
 * Starts a chunked upload, for clients that can't send a request body.
 *
 * Headers: `Authorization: Bearer <PROCESS_API_KEY>`, `X-Upload-Size` (image
 * size in bytes) and optionally `X-Upload-Name` (file name, used to name a
 * stored result). Returns the upload `id` and `chunkChars`, the most base64
 * characters one chunk may carry.
 *
 * Then: POST /api/process/uploads/{id}/chunks/{index} once per chunk, and
 * POST /api/process/uploads/{id}/process to get the processed image.
 */
export async function POST(request: NextRequest) {
  if (!process.env.PROCESS_API_KEY) return checkProcessAuth(request)

  const rateLimitResponse = await rateLimiter(request)
  if (rateLimitResponse) return rateLimitResponse

  const authResponse = checkProcessAuth(request)
  if (authResponse) return authResponse

  try {
    const size = Number(request.headers.get('x-upload-size'))
    const name = request.headers.get('x-upload-name')?.slice(0, 255) || undefined
    const id = uploads.start(size, name)
    return NextResponse.json(
      {
        success: true,
        id,
        chunkChars: chunkChars(),
        maxBytes: MAX_UPLOAD_BYTES,
        idleTimeoutSeconds: SESSION_IDLE_MS / 1000,
      },
      { status: 201 },
    )
  } catch (err) {
    if (err instanceof UploadError) return error(err.status, err.message)
    throw err
  }
}
