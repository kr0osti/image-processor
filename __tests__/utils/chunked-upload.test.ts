/**
 * @jest-environment node
 */
import { MAX_UPLOAD_BYTES, SESSION_IDLE_MS, UploadStore, chunkChars, decodeUploadName } from '@/lib/chunked-upload'

const split = (data: Buffer, size: number) => {
  const text = data.toString('base64')
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return chunks
}

describe('UploadStore', () => {
  const image = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256))

  it('reassembles chunks sent in order', () => {
    const store = new UploadStore()
    const id = store.start(image.length, 'shoe.png')
    split(image, 400).forEach((chunk, index) => store.addChunk(id, index, chunk))
    const { buffer, name } = store.take(id)
    expect(buffer.equals(image)).toBe(true)
    expect(name).toBe('shoe.png')
  })

  it('accepts a resent last chunk once', () => {
    const store = new UploadStore()
    const id = store.start(image.length)
    const chunks = split(image, 400)
    store.addChunk(id, 0, chunks[0])
    expect(store.addChunk(id, 0, chunks[0]).received).toBe(300)
    chunks.slice(1).forEach((chunk, i) => store.addChunk(id, i + 1, chunk))
    expect(store.take(id).buffer.equals(image)).toBe(true)
  })

  it('does not mistake a different chunk of the same length for a retry', () => {
    const store = new UploadStore()
    const id = store.start(image.length)
    const chunks = split(image, 400)
    store.addChunk(id, 0, chunks[0])
    expect(() => store.addChunk(id, 0, 'A'.repeat(chunks[0].length))).toThrow(expect.objectContaining({ status: 409 }))
  })

  it('rejects padding before the last chunk', () => {
    const store = new UploadStore()
    const id = store.start(4)
    // Each byte encoded on its own: the first chunk ends the base64 text early
    expect(() => store.addChunk(id, 0, Buffer.alloc(1).toString('base64'))).toThrow(
      expect.objectContaining({ status: 400 }),
    )
    store.addChunk(id, 0, Buffer.alloc(3).toString('base64'))
    store.addChunk(id, 1, Buffer.alloc(1).toString('base64'))
    expect(store.take(id).buffer.length).toBe(4)
  })

  it('rejects chunks out of order', () => {
    const store = new UploadStore()
    const id = store.start(image.length)
    expect(() => store.addChunk(id, 1, 'AAAA')).toThrow(expect.objectContaining({ status: 409 }))
  })

  it('rejects data that is not base64 quads', () => {
    const store = new UploadStore()
    const id = store.start(image.length)
    expect(() => store.addChunk(id, 0, 'AAA')).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => store.addChunk(id, 0, 'A*AA')).toThrow(expect.objectContaining({ status: 400 }))
  })

  it('rejects more bytes than announced', () => {
    const store = new UploadStore()
    const id = store.start(3)
    expect(() => store.addChunk(id, 0, Buffer.alloc(6).toString('base64'))).toThrow(
      expect.objectContaining({ status: 413 }),
    )
  })

  it('refuses to hand out an incomplete upload', () => {
    const store = new UploadStore()
    const id = store.start(image.length)
    store.addChunk(id, 0, split(image, 400)[0])
    expect(() => store.take(id)).toThrow(expect.objectContaining({ status: 409 }))
  })

  it('consumes the upload when taken', () => {
    const store = new UploadStore()
    const id = store.start(3)
    store.addChunk(id, 0, Buffer.alloc(3).toString('base64'))
    store.take(id)
    expect(() => store.take(id)).toThrow(expect.objectContaining({ status: 404 }))
  })

  it('validates the announced size', () => {
    const store = new UploadStore()
    expect(() => store.start(0)).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => store.start(Number.NaN)).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => store.start(MAX_UPLOAD_BYTES + 1)).toThrow(expect.objectContaining({ status: 413 }))
  })

  it('caps the memory held by open uploads', () => {
    const store = new UploadStore()
    for (let i = 0; i < 8; i++) store.start(MAX_UPLOAD_BYTES)
    expect(() => store.start(MAX_UPLOAD_BYTES)).toThrow(expect.objectContaining({ status: 503 }))
  })

  it('drops uploads left idle', () => {
    let now = 0
    const store = new UploadStore(() => now)
    const id = store.start(3)
    now = SESSION_IDLE_MS + 1
    expect(() => store.addChunk(id, 0, 'AAAA')).toThrow(expect.objectContaining({ status: 404 }))
  })

  it('ignores malformed and unknown ids', () => {
    const store = new UploadStore()
    expect(() => store.take('../etc')).toThrow(expect.objectContaining({ status: 404 }))
    expect(() => store.cancel('nope')).not.toThrow()
  })
})

describe('chunkChars', () => {
  afterEach(() => {
    delete process.env.UPLOAD_CHUNK_CHARS
  })

  it('fits under the default 16 KB header limit, in base64 quads', () => {
    expect(chunkChars()).toBe(12288)
  })

  it('can be lowered for a reverse proxy', () => {
    process.env.UPLOAD_CHUNK_CHARS = '6001'
    expect(chunkChars()).toBe(6000)
  })
})

describe('decodeUploadName', () => {
  it('keeps plain names and drops empty ones', () => {
    expect(decodeUploadName('shoe.png')).toBe('shoe.png')
    expect(decodeUploadName('')).toBeUndefined()
    expect(decodeUploadName(null)).toBeUndefined()
  })

  it('decodes percent-encoded names', () => {
    expect(decodeUploadName(encodeURIComponent('chaussure bleue é.png'))).toBe('chaussure bleue é.png')
  })

  it('recovers UTF-8 sent raw, which arrives as Latin-1', () => {
    expect(decodeUploadName(Buffer.from('é.png', 'utf8').toString('latin1'))).toBe('é.png')
  })

  it('keeps names that are not valid percent-encoding', () => {
    expect(decodeUploadName('100%.png')).toBe('100%.png')
  })
})
