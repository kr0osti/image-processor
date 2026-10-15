/**
 * @jest-environment node
 */
import sharp from 'sharp'
import { NextRequest } from 'next/server'
import { POST as start } from '../../app/api/process/uploads/route'
import { POST as chunk } from '../../app/api/process/uploads/[id]/chunks/[index]/route'
import { POST as finish } from '../../app/api/process/uploads/[id]/process/route'
import { POST as cancel } from '../../app/api/process/uploads/[id]/cancel/route'
import { isValidDeleteToken } from '../../app/utils/delete-token'

jest.mock('../../app/utils/rate-limit.js', () => ({
  createRateLimiter: jest.fn(() => jest.fn(() => null)),
}))

jest.mock('fs/promises', () => ({
  writeFile: jest.fn(() => Promise.resolve()),
  mkdir: jest.fn(() => Promise.resolve()),
}))

jest.setTimeout(30_000)

const KEY = 'test-process-key'
const auth = { authorization: `Bearer ${KEY}` }

const productPng = () =>
  sharp({ create: { width: 800, height: 800, channels: 3, background: '#ffffff' } })
    .composite([{ input: { create: { width: 200, height: 200, channels: 3, background: '#1e3a8a' } }, left: 300, top: 300 }])
    .png()
    .toBuffer()

// Requests as a body-less client sends them: everything in the URL and headers
const post = (path: string, headers: Record<string, string> = auth) =>
  new NextRequest(`http://localhost/api/process/uploads${path}`, { method: 'POST', headers })

const startUpload = async (size: number, name = 'shoe.png') => {
  const response = await start(post('', { ...auth, 'x-upload-size': String(size), 'x-upload-name': name }))
  return { response, body: await response.json() }
}

const sendChunks = async (id: string, image: Buffer, chunkChars: number) => {
  const text = image.toString('base64')
  for (let i = 0, index = 0; i < text.length; i += chunkChars, index++) {
    const response = await chunk(post(`/${id}/chunks/${index}`, { ...auth, 'x-chunk-data': text.slice(i, i + chunkChars) }), {
      params: Promise.resolve({ id, index: String(index) }),
    })
    expect(response.status).toBe(200)
  }
}

const process_ = (id: string, query = '') =>
  finish(post(`/${id}/process${query}`), { params: Promise.resolve({ id }) })

describe('chunked upload API', () => {
  const { writeFile } = require('fs/promises')

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.PROCESS_API_KEY = KEY
  })

  afterAll(() => {
    delete process.env.PROCESS_API_KEY
  })

  it('is disabled (503) until PROCESS_API_KEY is set', async () => {
    delete process.env.PROCESS_API_KEY
    const { response } = await startUpload(100)
    expect(response.status).toBe(503)
  })

  it('rejects a missing key with 401 on every step', async () => {
    expect((await start(post('', { 'x-upload-size': '10' }))).status).toBe(401)
    const params = { params: Promise.resolve({ id: 'a'.repeat(32), index: '0' }) }
    expect((await chunk(post('/x/chunks/0', {}), params)).status).toBe(401)
    expect((await finish(post('/x/process', {}), params)).status).toBe(401)
    expect((await cancel(post('/x/cancel', {}), params)).status).toBe(401)
  })

  it('advertises a chunk size that fits in a header', async () => {
    const { response, body } = await startUpload(100)
    expect(response.status).toBe(201)
    expect(body.id).toMatch(/^[a-f0-9]{32}$/)
    expect(body.chunkChars).toBe(12288)
  })

  it('processes an image sent in chunks and returns it as base64', async () => {
    const image = await productPng()
    const { body } = await startUpload(image.length)
    // Small chunks so the test covers many of them
    await sendChunks(body.id, image, 1000)

    const response = await process_(body.id, '?padding=100')
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result).toMatchObject({ success: true, filename: 'shoe-processed.png', width: 1500, whiteBackground: true })
    expect(result.settings.padding).toBe(100)
    expect(result.url).toBeUndefined()
    const meta = await sharp(Buffer.from(result.png, 'base64')).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 1500, 1500])
    expect(writeFile).not.toHaveBeenCalled()

    // The upload is consumed
    expect((await process_(body.id)).status).toBe(404)
  })

  it('stores the result with store=true', async () => {
    const image = await productPng()
    const { body } = await startUpload(image.length)
    await sendChunks(body.id, image, body.chunkChars)

    const result = await (await process_(body.id, '?store=true')).json()
    expect(result.url).toBe('/api/serve-image?file=shoe-processed.png')
    expect(isValidDeleteToken('shoe-processed.png', result.deleteToken)).toBe(true)
    expect(writeFile).toHaveBeenCalledTimes(1)
  })

  it('keeps the upload when a parameter is invalid', async () => {
    const image = await productPng()
    const { body } = await startUpload(image.length)
    await sendChunks(body.id, image, body.chunkChars)

    expect((await process_(body.id, '?whiteBackground=maybe')).status).toBe(400)
    expect((await process_(body.id)).status).toBe(200)
  })

  it('refuses to process an incomplete upload', async () => {
    const { body } = await startUpload(1000)
    expect((await process_(body.id)).status).toBe(409)
  })

  it('answers 415 for data that is not an image', async () => {
    const data = Buffer.from('definitely not an image')
    const { body } = await startUpload(data.length)
    await sendChunks(body.id, data, body.chunkChars)
    expect((await process_(body.id)).status).toBe(415)
  })

  it('reports chunk errors with their status', async () => {
    const { body } = await startUpload(100)
    const response = await chunk(post(`/${body.id}/chunks/3`, { ...auth, 'x-chunk-data': 'AAAA' }), {
      params: Promise.resolve({ id: body.id, index: '3' }),
    })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('Expected chunk 0, got 3.')
  })

  it('cancels an upload', async () => {
    const { body } = await startUpload(100)
    const params = { params: Promise.resolve({ id: body.id }) }
    expect((await cancel(post(`/${body.id}/cancel`), params)).status).toBe(200)
    expect((await process_(body.id)).status).toBe(404)
  })
})
