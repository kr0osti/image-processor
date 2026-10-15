/**
 * @jest-environment node
 */
import sharp from 'sharp'
import { NextRequest } from 'next/server'
import { POST } from '../../app/api/process/route'
import { isValidDeleteToken } from '../../app/utils/delete-token'
import { safeFetch } from '@/lib/ssrf'

// Use the global `jest` so SWC hoists these mocks above the imports
jest.mock('../../app/utils/rate-limit.js', () => ({
  createRateLimiter: jest.fn(() => jest.fn(() => null)),
}))

jest.mock('fs/promises', () => ({
  writeFile: jest.fn(() => Promise.resolve()),
  mkdir: jest.fn(() => Promise.resolve()),
}))

jest.mock('@/lib/ssrf', () => {
  const actual = jest.requireActual('@/lib/ssrf')
  return { ...actual, safeFetch: jest.fn() }
})

jest.setTimeout(30_000)

const KEY = 'test-process-key'
const auth = { authorization: `Bearer ${KEY}` }

// A product shot: small dark product on a large white margin
const productPng = () =>
  sharp({ create: { width: 800, height: 800, channels: 3, background: '#ffffff' } })
    .composite([{ input: { create: { width: 200, height: 200, channels: 3, background: '#1e3a8a' } }, left: 300, top: 300 }])
    .png()
    .toBuffer()

const multipart = async (fields: Record<string, string | Blob>, query = '', headers: Record<string, string> = auth) => {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  return new NextRequest(`http://localhost/api/process${query}`, { method: 'POST', body: form, headers })
}

const fileField = async (name = 'shoe.png') => new File([new Uint8Array(await productPng())], name, { type: 'image/png' })

const decode = async (response: Response) => sharp(Buffer.from(await response.arrayBuffer())).metadata()

describe('POST /api/process', () => {
  const { writeFile } = require('fs/promises')

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.PROCESS_API_KEY = KEY
  })

  afterAll(() => {
    delete process.env.PROCESS_API_KEY
  })

  describe('access', () => {
    it('is disabled (503) until PROCESS_API_KEY is set', async () => {
      delete process.env.PROCESS_API_KEY
      const response = await POST(await multipart({ file: await fileField() }))
      expect(response.status).toBe(503)
    })

    it('rejects missing or wrong keys with 401', async () => {
      const missing = await POST(await multipart({ file: await fileField() }, '', {}))
      expect(missing.status).toBe(401)
      expect(missing.headers.get('www-authenticate')).toBe('Bearer')
      const wrong = await POST(await multipart({ file: await fileField() }, '', { authorization: 'Bearer nope' }))
      expect(wrong.status).toBe(401)
    })
  })

  describe('input and output', () => {
    it('returns the processed PNG for a multipart upload', async () => {
      const response = await POST(await multipart({ file: await fileField('shoe.png') }))
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/png')
      expect(response.headers.get('content-disposition')).toBe('attachment; filename="shoe-processed.png"')
      expect(response.headers.get('x-white-background')).toBe('true')
      const meta = await decode(response)
      expect([meta.format, meta.width, meta.height]).toEqual(['png', 1500, 1500])
      expect(writeFile).not.toHaveBeenCalled()
    })

    it('accepts the raw image as the request body', async () => {
      const request = new NextRequest('http://localhost/api/process', {
        method: 'POST',
        body: new Uint8Array(await productPng()),
        headers: { ...auth, 'content-type': 'image/png' },
      })
      const response = await POST(request)
      expect(response.status).toBe(200)
      expect((await decode(response)).width).toBe(1500)
    })

    it('fetches a URL given as JSON, through the SSRF-safe fetch', async () => {
      ;(safeFetch as jest.Mock).mockResolvedValue(new Response(new Uint8Array(await productPng()), { status: 200 }))
      const request = new NextRequest('http://localhost/api/process', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com/products/boot.png' }),
        headers: { ...auth, 'content-type': 'application/json' },
      })
      const response = await POST(request)
      expect(response.status).toBe(200)
      expect(safeFetch).toHaveBeenCalledWith('https://example.com/products/boot.png', expect.anything())
      expect(response.headers.get('content-disposition')).toContain('boot-processed.png')
    })

    it('stores the result and returns its URL and delete token with response=json', async () => {
      const response = await POST(await multipart({ file: await fileField('shoe.png') }, '?response=json'))
      const data = await response.json()
      expect(response.status).toBe(200)
      expect(data).toMatchObject({
        success: true,
        filename: 'shoe-processed.png',
        url: '/api/serve-image?file=shoe-processed.png',
        width: 1500,
        height: 1500,
        whiteBackground: true,
      })
      expect(isValidDeleteToken('shoe-processed.png', data.deleteToken)).toBe(true)
      expect(writeFile).toHaveBeenCalledWith(expect.stringMatching(/public\/uploads\/shoe-processed\.png$/), expect.any(Buffer))
    })
  })

  describe('parameters', () => {
    it('reads them from form fields, falling back to the query string', async () => {
      const response = await POST(
        await multipart({ file: await fileField(), padding: '0', response: 'json' }, '?pngQuality=100&padding=300&trimPadding=true'),
      )
      const data = await response.json()
      expect(data.settings).toMatchObject({ padding: 0, pngQuality: 100, trimPadding: true })
      expect(data.trimmed).toBe(true)
    })

    it('forces the layout with whiteBackground=off', async () => {
      const response = await POST(await multipart({ file: await fileField(), whiteBackground: 'off' }))
      expect(response.headers.get('x-white-background')).toBe('false')
    })

    it('rejects invalid values with 400', async () => {
      const response = await POST(await multipart({ file: await fileField(), whiteBackground: 'sometimes' }))
      expect(response.status).toBe(400)
      expect((await response.json()).error).toMatch(/whiteBackground/)
    })
  })

  describe('errors', () => {
    it('rejects files that are not images with 415', async () => {
      const response = await POST(await multipart({ file: new File(['hello'], 'notes.txt', { type: 'text/plain' }) }))
      expect(response.status).toBe(415)
    })

    it('needs a file or url', async () => {
      const response = await POST(await multipart({ padding: '10' }))
      expect(response.status).toBe(400)
    })

    it('reports URLs blocked by the SSRF protection as 403', async () => {
      ;(safeFetch as jest.Mock).mockRejectedValue(new Error('SSRF Blocked: Unsafe URL: http://127.0.0.1/'))
      const response = await POST(await multipart({ url: 'http://127.0.0.1/' }))
      expect(response.status).toBe(403)
    })

    it('rejects declared bodies over 25 MB with 413 before reading them', async () => {
      const request = new NextRequest('http://localhost/api/process', {
        method: 'POST',
        body: 'x',
        headers: { ...auth, 'content-type': 'image/png', 'content-length': String(30 * 1024 * 1024) },
      })
      expect((await POST(request)).status).toBe(413)
    })
  })
})
