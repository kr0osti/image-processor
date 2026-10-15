import { NextResponse, type NextRequest } from 'next/server'
import { createRateLimiter } from '../../utils/rate-limit.js'
import { processedFilename } from '../../utils/processed-filename.js'
import { checkProcessAuth, errorResponse as error, resultMeta, saveResult } from '@/lib/process-api'
import { readBodyWithLimit, safeFetch } from '@/lib/ssrf'
import {
  InvalidParamError,
  UnsupportedImageError,
  parseProcessParams,
  processImageBuffer,
} from '@/lib/process-image'

// sharp is a native module
export const runtime = 'nodejs'

// Largest input image accepted, uploaded or fetched
const MAX_INPUT_BYTES = 25 * 1024 * 1024
const FETCH_TIMEOUT_MS = 20_000

const rateLimiter = createRateLimiter({
  limit: 30,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many processing requests. Please try again later.',
  name: 'process',
})

class InputError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message)
  }
}

interface Input {
  buffer: Buffer
  // Original file name, used to name the stored result
  name?: string
  // Request values that can carry parameters (form fields or JSON body)
  fields: (name: string) => string | null | undefined
}

/** File name from the last path segment of a URL, if it has one */
const nameFromUrl = (url: string) => {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() || '') || undefined
  } catch {
    return undefined
  }
}

async function fetchImage(url: string): Promise<Buffer> {
  let response: Response
  try {
    response = await safeFetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('SSRF Blocked')) {
      throw new InputError('The provided URL is not allowed for security reasons.', 403)
    }
    throw new InputError('Could not fetch the image URL.', 502)
  }
  if (!response.ok) throw new InputError(`Fetching the image URL failed with status ${response.status}.`, 502)
  try {
    return Buffer.from(await readBodyWithLimit(response, MAX_INPUT_BYTES))
  } catch {
    throw new InputError(`The image at the URL is larger than ${MAX_INPUT_BYTES / 1024 / 1024} MB.`, 413)
  }
}

/**
 * The image and its parameters from any of the supported request shapes:
 * multipart (`file` or `url` field), JSON (`url`), or the raw image as the body.
 */
async function readInput(request: NextRequest): Promise<Input> {
  const contentType = request.headers.get('content-type') || ''
  if (Number(request.headers.get('content-length')) > MAX_INPUT_BYTES + 64 * 1024) {
    throw new InputError(`The image is larger than ${MAX_INPUT_BYTES / 1024 / 1024} MB.`, 413)
  }

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const field = (name: string) => {
      const value = form.get(name)
      return typeof value === 'string' ? value : undefined
    }
    const file = form.get('file')
    if (file && typeof file === 'object') {
      if (file.size > MAX_INPUT_BYTES) throw new InputError(`The image is larger than ${MAX_INPUT_BYTES / 1024 / 1024} MB.`, 413)
      return { buffer: Buffer.from(await file.arrayBuffer()), name: file.name, fields: field }
    }
    const url = field('url')
    if (url) return { buffer: await fetchImage(url), name: nameFromUrl(url), fields: field }
    throw new InputError('Send the image as a "file" field or its address as a "url" field.')
  }

  if (contentType.includes('application/json')) {
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      throw new InputError('Invalid JSON body.')
    }
    const field = (name: string) => (body[name] == null ? undefined : String(body[name]))
    const url = field('url')
    if (!url) throw new InputError('Send the image address as "url", or upload the image as multipart "file".')
    return { buffer: await fetchImage(url), name: nameFromUrl(url), fields: field }
  }

  if (contentType.startsWith('image/')) {
    const buffer = Buffer.from(await readBodyWithLimit(request as unknown as Response, MAX_INPUT_BYTES).catch(() => {
      throw new InputError(`The image is larger than ${MAX_INPUT_BYTES / 1024 / 1024} MB.`, 413)
    }))
    return { buffer, fields: () => undefined }
  }

  throw new InputError('Unsupported content type. Use multipart/form-data, application/json or an image/* body.', 415)
}

/**
 * Processes one image on the server, like the web UI does in the browser.
 *
 * Requires `Authorization: Bearer <PROCESS_API_KEY>`. Parameters (padding,
 * whiteThreshold, pngQuality, whiteBackground, trimPadding, response) can be
 * sent as form/JSON fields or in the query string. Returns the PNG itself, or
 * with `response=json` stores it and returns its URL and delete token.
 */
export async function POST(request: NextRequest) {
  // A disabled API answers 503 before any rate limiting, as before
  if (!process.env.PROCESS_API_KEY) return checkProcessAuth(request)

  const rateLimitResponse = await rateLimiter(request)
  if (rateLimitResponse) return rateLimitResponse

  const authResponse = checkProcessAuth(request)
  if (authResponse) return authResponse

  const query = request.nextUrl.searchParams
  try {
    const input = await readInput(request)
    // Request fields win over query parameters
    const param = (name: string) => input.fields(name) ?? query.get(name)
    const params = parseProcessParams(param)
    const result = await processImageBuffer(input.buffer, params)

    const meta = resultMeta(result, params)

    if ((param('response') || '').toLowerCase() === 'json') {
      const saved = await saveResult(result.png, input.name)
      return NextResponse.json({ success: true, ...saved, ...meta })
    }

    const filename = processedFilename(input.name, 'png')
    return new NextResponse(new Uint8Array(result.png), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(result.png.length),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-White-Background': String(result.whiteBackground),
        'X-Trimmed': String(result.trimmed),
        'X-Upscale': String(meta.upscale),
        'X-Source-Size': `${result.sourceWidth}x${result.sourceHeight}`,
      },
    })
  } catch (err) {
    if (err instanceof InputError) return error(err.status, err.message)
    if (err instanceof InvalidParamError) return error(400, err.message)
    if (err instanceof UnsupportedImageError) return error(415, err.message)
    console.error('Process API error:', err)
    return error(500, 'Failed to process the image.')
  }
}
