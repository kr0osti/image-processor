import { NextResponse, type NextRequest } from 'next/server'
import { createRateLimiter } from '../../../../../utils/rate-limit.js'
import { processedFilename } from '../../../../../utils/processed-filename.js'
import { checkProcessAuth, errorResponse as error, resultMeta, saveResult } from '@/lib/process-api'
import { UploadError, uploads } from '@/lib/chunked-upload'
import {
  InvalidParamError,
  UnsupportedImageError,
  parseProcessParams,
  processImageBuffer,
} from '@/lib/process-image'

export const runtime = 'nodejs'

// Same name as POST /api/process, so both share one processing budget
const rateLimiter = createRateLimiter({
  limit: 30,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many processing requests. Please try again later.',
  name: 'process',
})

/**
 * Processes a completed chunked upload, like POST /api/process.
 *
 * Parameters go in the query string (padding, whiteThreshold, pngQuality,
 * whiteBackground, trimPadding). The response is JSON with the PNG as base64
 * in `png`, since clients without request bodies may not read binary
 * responses either. With `store=true` the result is also saved and the
 * response adds its `url`, `filename` and `deleteToken`.
 * The upload is consumed, even when processing fails.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.PROCESS_API_KEY) return checkProcessAuth(request)

  const rateLimitResponse = await rateLimiter(request)
  if (rateLimitResponse) return rateLimitResponse

  const authResponse = checkProcessAuth(request)
  if (authResponse) return authResponse

  const { id } = await params
  const query = request.nextUrl.searchParams
  try {
    // Check the parameters before consuming the upload, so a typo can be retried
    const settings = parseProcessParams(name => query.get(name))
    const input = uploads.take(id)
    const result = await processImageBuffer(input.buffer, settings)
    const store = ['1', 'true', 'yes', 'on'].includes((query.get('store') || '').toLowerCase())
    const saved = store
      ? await saveResult(result.png, input.name)
      : { filename: processedFilename(input.name, 'png') }

    return NextResponse.json(
      { success: true, ...saved, ...resultMeta(result, settings), png: result.png.toString('base64') },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    if (err instanceof UploadError) return error(err.status, err.message)
    if (err instanceof InvalidParamError) return error(400, err.message)
    if (err instanceof UnsupportedImageError) return error(415, err.message)
    console.error('Chunked process error:', err)
    return error(500, 'Failed to process the image.')
  }
}
