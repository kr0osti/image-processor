import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';

// The server and the tests share the environment in CI (see .github/workflows/e2e.yml)
const KEY = process.env.PROCESS_API_KEY;
const fixture = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures', 'import', name));
const pngSize = (body: Buffer) => [body.readUInt32BE(16), body.readUInt32BE(20)];

test.describe('POST /api/process', () => {
  test.skip(!KEY, 'PROCESS_API_KEY is not set for this run');

  const auth = () => ({ Authorization: `Bearer ${KEY}` });

  test('rejects requests without the API key', async ({ request }) => {
    const response = await request.post('/api/process', {
      multipart: { file: { name: 'product.jfif', mimeType: 'image/jpeg', buffer: fixture('product.jfif') } },
    });
    expect(response.status()).toBe(401);
  });

  for (const [name, mimeType] of [
    ['product.jfif', 'image/jpeg'],
    ['product.webp', 'image/webp'],
    ['product.avif', 'image/avif'],
    ['product.tiff', 'image/tiff'],
    ['logo-margins.svg', 'image/svg+xml'],
  ] as const) {
    test(`processes ${name} into a 1500x1500 PNG`, async ({ request }) => {
      const response = await request.post('/api/process', {
        headers: auth(),
        multipart: { file: { name, mimeType, buffer: fixture(name) } },
      });
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toBe('image/png');
      const body = await response.body();
      expect([...body.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(pngSize(body)).toEqual([1500, 1500]);
    });
  }

  test('applies parameters and can store the result for download and deletion', async ({ request }) => {
    const response = await request.post('/api/process?pngQuality=100', {
      headers: auth(),
      multipart: {
        file: { name: `api-${Date.now()}.webp`, mimeType: 'image/webp', buffer: fixture('product.webp') },
        padding: '0',
        whiteBackground: 'on',
        response: 'json',
      },
    });
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ success: true, width: 1500, height: 1500, whiteBackground: true });
    expect(data.settings).toMatchObject({ padding: 0, pngQuality: 100 });

    const download = await request.get(data.url);
    expect(download.status()).toBe(200);
    expect(pngSize(await download.body())).toEqual([1500, 1500]);

    const removed = await request.delete('/api/images', {
      data: { files: [{ filename: data.filename, token: data.deleteToken }] },
    });
    expect(await removed.json()).toMatchObject({ deleted: 1 });
    expect((await request.get(data.url)).status()).toBe(404);
  });

  test('explains formats only the web UI can read', async ({ request }) => {
    const response = await request.post('/api/process', {
      headers: auth(),
      multipart: { file: { name: 'product.pdf', mimeType: 'application/pdf', buffer: fixture('product.pdf') } },
    });
    expect(response.status()).toBe(415);
    expect((await response.json()).error).toMatch(/web UI/);
  });
});
