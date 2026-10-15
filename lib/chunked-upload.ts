import http from 'http'
import { randomBytes } from 'crypto'

/**
 * In-memory store for images uploaded in small base64 pieces, one per request.
 *
 * Some clients can't send a request body at all: the Affinity scripting SDK
 * only sets URL and headers. They upload the image as base64 chunks carried
 * in a request header, then ask for the assembled image to be processed.
 * Sessions live in this process only and expire when left idle.
 */

// Largest image accepted, same as POST /api/process
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
// Total bytes held by all sessions at once
const MAX_TOTAL_BYTES = 200 * 1024 * 1024
const MAX_SESSIONS = 32
// A session is dropped when no chunk arrived for this long
export const SESSION_IDLE_MS = 10 * 60 * 1000
// Bound on the chunk size the server advertises, whatever the header limit
const MAX_CHUNK_CHARS = 1024 * 1024
// Room left in the header block for the request line and the other headers
const HEADER_OVERHEAD = 4096

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/
const SESSION_ID = /^[a-f0-9]{32}$/

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message)
    this.name = 'UploadError'
  }
}

interface Session {
  size: number
  name?: string
  chunks: Buffer[]
  received: number
  // Length of the last chunk, so a retried chunk can be recognised
  lastChunkChars: number
  touchedAt: number
}

/**
 * Base64 characters per chunk: what fits in one header under Node's header
 * size limit (16 KB by default, raised with --max-http-header-size), rounded
 * down to whole base64 quads. UPLOAD_CHUNK_CHARS can lower it, e.g. to match
 * a reverse proxy's header buffer.
 */
export function chunkChars(): number {
  const fromHeaderLimit = Math.max(1024, http.maxHeaderSize - HEADER_OVERHEAD)
  const configured = Number(process.env.UPLOAD_CHUNK_CHARS)
  const chars = Math.min(
    MAX_CHUNK_CHARS,
    fromHeaderLimit,
    Number.isFinite(configured) && configured > 0 ? configured : Infinity,
  )
  return Math.max(4, Math.floor(chars / 4) * 4)
}

export class UploadStore {
  private sessions = new Map<string, Session>()

  constructor(private now: () => number = Date.now) {}

  private totalBytes() {
    let total = 0
    for (const session of this.sessions.values()) total += session.size
    return total
  }

  private dropExpired() {
    const limit = this.now() - SESSION_IDLE_MS
    for (const [id, session] of this.sessions) {
      if (session.touchedAt < limit) this.sessions.delete(id)
    }
  }

  private get(id: string): Session {
    this.dropExpired()
    const session = SESSION_ID.test(id) ? this.sessions.get(id) : undefined
    if (!session) throw new UploadError('Unknown or expired upload.', 404)
    return session
  }

  /** Opens a session for an image of `size` bytes and returns its id */
  start(size: number, name?: string): string {
    if (!Number.isInteger(size) || size <= 0) {
      throw new UploadError('"X-Upload-Size" must be the image size in bytes.')
    }
    if (size > MAX_UPLOAD_BYTES) {
      throw new UploadError(`The image is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`, 413)
    }
    this.dropExpired()
    if (this.sessions.size >= MAX_SESSIONS || this.totalBytes() + size > MAX_TOTAL_BYTES) {
      throw new UploadError('Too many uploads in progress. Please try again later.', 503)
    }
    const id = randomBytes(16).toString('hex')
    this.sessions.set(id, { size, name, chunks: [], received: 0, lastChunkChars: 0, touchedAt: this.now() })
    return id
  }

  /**
   * Adds chunk `index` (0-based, in order). Resending the last chunk is
   * accepted and ignored, so a client can retry after a lost response.
   * Every chunk but the last must be a whole number of base64 quads.
   */
  addChunk(id: string, index: number, data: string): { received: number; size: number } {
    const session = this.get(id)
    const next = session.chunks.length

    if (!Number.isInteger(index) || index < 0) throw new UploadError('The chunk index must be a whole number.')
    if (index === next - 1 && data.length === session.lastChunkChars) {
      session.touchedAt = this.now()
      return { received: session.received, size: session.size }
    }
    if (index !== next) throw new UploadError(`Expected chunk ${next}, got ${index}.`, 409)

    if (!data || data.length % 4 !== 0 || !BASE64.test(data)) {
      throw new UploadError('"X-Chunk-Data" must be base64 with a length that is a multiple of 4.')
    }
    if (data.length > chunkChars()) throw new UploadError(`Chunks are limited to ${chunkChars()} characters.`, 413)

    const bytes = Buffer.from(data, 'base64')
    if (session.received + bytes.length > session.size) {
      throw new UploadError('The chunks are larger than the announced image size.', 413)
    }
    session.chunks.push(bytes)
    session.received += bytes.length
    session.lastChunkChars = data.length
    session.touchedAt = this.now()
    return { received: session.received, size: session.size }
  }

  /** Removes the session and returns the assembled image, once it is complete */
  take(id: string): { buffer: Buffer; name?: string } {
    const session = this.get(id)
    if (session.received !== session.size) {
      throw new UploadError(`The upload is incomplete: ${session.received} of ${session.size} bytes received.`, 409)
    }
    this.sessions.delete(id)
    return { buffer: Buffer.concat(session.chunks), name: session.name }
  }

  /** Drops a session; unknown ids are ignored */
  cancel(id: string): void {
    this.sessions.delete(id)
  }
}

// One store per server process, kept across hot reloads in development
const globalStore = globalThis as unknown as { __chunkedUploads?: UploadStore }
export const uploads = (globalStore.__chunkedUploads ??= new UploadStore())
