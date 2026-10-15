import { NextResponse } from 'next/server'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { timingSafeEqual } from 'crypto'
import { createDeleteToken } from '../app/utils/delete-token.js'
import { processedFilename } from '../app/utils/processed-filename.js'
import type { ProcessParams, ProcessResult } from './process-image'

/** Helpers shared by POST /api/process and the chunked upload routes */

export const errorResponse = (status: number, message: string, headers?: HeadersInit) =>
  NextResponse.json({ success: false, error: message }, { status, headers })

const safeEqual = (a: string, b: string) => {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

/**
 * Checks `Authorization: Bearer <PROCESS_API_KEY>`. Returns the error response
 * to send (503 while the key is unset, 401 for a missing or wrong key), or
 * null when the request may go on.
 */
export function checkProcessAuth(request: Request): NextResponse | null {
  const apiKey = process.env.PROCESS_API_KEY
  if (!apiKey) {
    return errorResponse(503, 'The processing API is disabled. Set PROCESS_API_KEY on the server to enable it.')
  }
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : ''
  if (!token || !safeEqual(token, apiKey)) {
    return errorResponse(401, 'Missing or invalid API key. Send "Authorization: Bearer <PROCESS_API_KEY>".', {
      'WWW-Authenticate': 'Bearer',
    })
  }
  return null
}

/** Stores a processed PNG in public/uploads; returns its URL and delete token */
export async function saveResult(png: Buffer, originalName: string | undefined) {
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
  await mkdir(uploadsDir, { recursive: true })
  const filename = processedFilename(originalName, 'png')
  await writeFile(path.join(uploadsDir, filename), png)
  return { filename, url: `/api/serve-image?file=${filename}`, deleteToken: createDeleteToken(filename) }
}

/** Details of a processing result, as returned in JSON responses */
export const resultMeta = (result: ProcessResult, params: ProcessParams) => ({
  width: 1500,
  height: 1500,
  bytes: result.png.length,
  whiteBackground: result.whiteBackground,
  trimmed: result.trimmed,
  hasWhitePadding: result.hasWhitePadding,
  vector: result.vector,
  sourceWidth: result.sourceWidth,
  sourceHeight: result.sourceHeight,
  upscale: Math.round(result.upscale * 100) / 100,
  settings: params,
})
