# NextJS Image Processor

A powerful web application that allows you to download, process, and standardize images from various sources. This tool helps you create consistent 1500x1500px images with proper positioning based on the image content.

## 📋 Features

- **Multiple Image Sources**: Upload local files or scrape images from webpages
- **Many Import Formats**: PNG, JPEG/JFIF, WebP, AVIF, GIF, BMP, ICO, TIFF and HEIC/HEIF photos, plus SVG, PDF and Illustrator (`.ai`) vectors, up to 50 MB each. Vectors are rendered at output size, so they stay sharp; EPS and PSD are not supported
- **Intelligent Processing**: Automatically resize and position images to 1500x1500px based on content
- **Batch Processing**: Process multiple images at once with filtering by size
- **Adjustable Layout**: A settings page sets the white-background padding (default 150px per side), the white-detection threshold and the PNG quality (default 80), saved per browser in a cookie
- **Low-Resolution Warning**: Images that had to be upscaled are flagged with their source size and upscale factor
- **Languages**: English, French, Spanish and German, picked from the browser language or the header switcher
- **Light & Dark Themes**: Follows the system setting, with a toggle in the header
- **Compressed PNG Output**: Processed images are always PNG (the save API rejects other formats), compressed by colour quantization; the PNG quality is set on the settings page (100 = lossless)
- **Download Options**: Download individual images or as a ZIP archive
- **Deleting**: The ✕ on a processed image and "Delete All Files" also delete the saved files from the server; files saved before a restart (without `UPLOAD_TOKEN_SECRET`) are left to the cleanup job
- **CORS Handling**: Creates placeholders for images that can't be loaded due to CORS restrictions
- **Automatic Cleanup**: A background job deletes processed files on the `CLEANUP_CRON_SCHEDULE` (by default every 30 minutes, removing files older than one interval)
- **Rate Limiting**: The API endpoints are rate limited per client IP to prevent abuse (see the table below)

## 🚀 Quick Start

### Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/kr0osti/image-processor.git
cd image-processor

# Create a .env file from the example
cp .env.example .env

# Start the application with Docker Compose
docker compose up -d
```

The application will be available at http://localhost:6060

To update, pull the latest code and image and recreate the container. Every push to `main` publishes a new `latest` image to `ghcr.io/kr0osti/image-processor/nextjs-app` (set `VERSION` in `.env` to pin a release, e.g. `0.7.0`):

```bash
git pull
docker compose pull
docker compose up -d
```

### Local Development

```bash
# Clone the repository
git clone https://github.com/kr0osti/image-processor.git
cd image-processor

# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

The application will be available at http://localhost:3000

## 🔧 Configuration

### Environment Variables

Customize the application by setting these environment variables in your `.env` file:

| Variable | Description | Default |
|----------|-------------|---------|
| `VERSION` | Docker image version to use | latest |
| `NEXT_PUBLIC_SITE_NAME` | The name of your site, shown in the header and page title | Image Processor |
| `NEXT_PUBLIC_SITE_DESCRIPTION` | Site description for search engines and link previews | Translated default description |
| `NEXT_PUBLIC_SITE_URL` | Your site's URL | https://yourdomain.com |
| `NEXT_PUBLIC_SITE_THEME_COLOR` | Theme color (hex) | #000000 |
| `NEXT_PUBLIC_SITE_BACKGROUND_COLOR` | Background color (hex) | #ffffff |
| `CLEANUP_API_KEY` | API key for `/api/cleanup` (**required**: the endpoint returns 500 when it is unset) | (none) |
| `CLEANUP_CRON_SCHEDULE` | Cron schedule for the cleanup job; files older than one interval are deleted | */30 * * * * |
| `NEXT_PUBLIC_DEBUG` | Enable debug logging | false |
| `PROCESS_API_KEY` | Enables `POST /api/process` (server-side processing); callers send it as `Authorization: Bearer …`. Unset = endpoint disabled | (none) |
| `UPLOAD_TOKEN_SECRET` | Key for signing delete tokens. Optional; without it a random key is used, so tokens issued before a restart stop working (those files are still removed by the cleanup job) | (random per start) |
| `ALLOWED_DEV_ORIGINS` | Comma-separated hosts allowed to open `next dev` from another machine (e.g. a LAN IP) | (none) |

### Translations

UI text lives in `messages/<locale>.json` (`en` is the source; `fr`, `es` and `de` are translations). The active language comes from the `NEXT_LOCALE` cookie, or from the browser's `Accept-Language` header on a first visit.

To update a translation, edit the matching file and keep every key, `{placeholder}` and `<tag>` from `en.json`; `pnpm test` fails if one is missing. Plurals use ICU syntax, e.g. `{count, plural, one {# image} other {# images}}`. To add a language, add its code to `i18n/config.ts` and create `messages/<code>.json`.

### Icons

The favicon, Apple touch icon and web-app icons are generated from the SVG masters in `scripts/icons/`:

| Source | Used for |
|--------|----------|
| `icon.svg` | `app/icon.svg`, `app/favicon.ico` (16/32/48 px), `public/icons/icon-192.png` and `icon-512.png` |
| `icon-square.svg` | `app/apple-icon.png` (180 px, opaque; iOS rounds the corners) |
| `icon-maskable.svg` | `public/icons/icon-maskable-192.png` and `icon-maskable-512.png` (glyph inside the 80% safe zone) |

To change the icons, edit the SVGs and re-render them all:

```bash
pnpm exec playwright install chromium   # once
node scripts/icons/render.mjs
```

Next.js picks up the files in `app/` automatically; `app/manifest.ts` points at `public/icons/`. The logo in the header (`components/site-header.tsx`) is drawn inline, so update it too if the glyph changes.

## 🏗️ Architecture

### Components

A single Next.js application:

- **Browser**: uploads are decoded in the browser (`lib/image-import.ts`: native formats as-is; SVG, PDF/AI, HEIC and TIFF rendered to PNG first), laid out on a canvas (`app/page.tsx`, helpers in `lib/image-layout.ts`), then compressed (`lib/png-compress.ts`) and uploaded as 1500×1500 PNGs.
- **Server**: API routes save and serve the processed images, proxy remote images past CORS (with SSRF protection in `lib/ssrf.ts`: private and reserved addresses are refused both when the URL is checked and when the connection is opened, so DNS rebinding can't slip through) and scrape webpages for images (`app/actions.ts`).
- **Background job**: a cron job started from `instrumentation.ts` deletes old files from `public/uploads`.

### API Endpoints

| Endpoint | Method | Description | Rate Limit |
|----------|--------|-------------|------------|
| `/api/process` | POST | Process an image on the server (see below); requires `PROCESS_API_KEY` | 30 req/min |
| `/api/images` | POST | Save an image already processed by the web UI (JSON data URL); returns its `filename` and a `deleteToken` | 300 req/min |
| `/api/images` | DELETE | Delete saved images: `{ files: [{ filename, token }] }`, each with the token returned when it was saved | 30 req/min |
| `/api/proxy` | GET | Proxy for fetching images to avoid CORS issues | 500 req/min |
| `/api/serve-image` | GET | Serve processed images from the server | — |
| `/api/cleanup` | GET | Delete uploads older than `maxAge` minutes (default 60); requires `?key=<CLEANUP_API_KEY>` | 5 req/min |
| `/api/healthcheck` | GET | Check if the application is running | 30 req/min |

### Processing API

`POST /api/process` does on the server what the web UI does in the browser, so images can be processed from scripts. It is off until `PROCESS_API_KEY` is set.

Send the image as a multipart `file`, as a `url` (multipart or JSON; fetched with the same SSRF protection as the proxy), or as the raw request body with an `image/*` content type. Accepted formats: PNG, JPEG, WebP, AVIF, GIF, TIFF and SVG, up to 25 MB. HEIC and PDF/AI only work in the web UI.

Parameters can be sent as form/JSON fields or in the query string (fields win); missing ones use the settings-page defaults:

| Parameter | Values | Default |
|-----------|--------|---------|
| `padding` | 0–600 px per side for white-background images | 150 |
| `whiteThreshold` | 50–99 % of sampled pixels that must be white | 85 |
| `pngQuality` | 1–100; 100 is lossless | 80 |
| `whiteBackground` | `auto`, `on` or `off` | `auto` |
| `trimPadding` | `true` / `false`: crop the source's white margin first | `false` |
| `response` | `png` (the image) or `json` (store it and return its URL) | `png` |

```bash
# Get the processed PNG back directly
curl -H "Authorization: Bearer $PROCESS_API_KEY" \
  -F file=@shoe.jpg -F padding=100 -F pngQuality=90 \
  https://images.example.com/api/process -o shoe-processed.png

# Process a remote image and store the result
curl -H "Authorization: Bearer $PROCESS_API_KEY" -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/logo.svg", "response": "json"}' \
  https://images.example.com/api/process
# → { "url": "/api/serve-image?file=logo-processed.png", "filename": "...", "deleteToken": "...",
#     "whiteBackground": true, "upscale": 1, "sourceWidth": 1500, "sourceHeight": 862, ... }
```

PNG responses carry the details in headers (`X-White-Background`, `X-Trimmed`, `X-Upscale`, `X-Source-Size`). Stored results are removed by the cleanup job like other uploads, or earlier with `DELETE /api/images` and the returned `deleteToken`.

## 🧪 Testing

This project includes comprehensive test coverage with Jest for unit/integration tests and Playwright for end-to-end tests.

```bash
# Run all Jest tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Generate test coverage report
pnpm test:coverage

# Run end-to-end tests
pnpm test:e2e
```

### Running tests without a local Node.js

The tests run as-is in a throwaway Node container; nothing needs to be copied into the app container:

```bash
docker run --rm -v "$PWD":/app -w /app node:24-alpine \
  sh -c "corepack enable && pnpm install --frozen-lockfile && pnpm test"

# Run a single file or directory
docker run --rm -v "$PWD":/app -w /app node:24-alpine \
  sh -c "corepack enable && pnpm install --frozen-lockfile && pnpm test __tests__/api/"
```

## 📦 Dependency Management

This project uses pnpm (the version is pinned in `package.json` and enabled with `corepack enable`). Dependabot opens weekly update PRs; minor and patch updates merge automatically once CI passes.

```bash
# Update dependencies within their ranges and refresh the lockfile
pnpm update

# Regenerate the lockfile only, e.g. after editing package.json by hand
pnpm install --lockfile-only
```

## 🔄 Docker Development

For development with Docker (hot reload, source mounted into the container):

```bash
# Start the development environment on http://localhost:4576
pnpm docker:dev

# Stop it
pnpm docker:dev:down
```

To open the dev server from another machine, set `ALLOWED_DEV_ORIGINS` to the host you use (e.g. `192.168.1.10`).

## 🛠️ Troubleshooting

### Permission Issues

In Docker, the entrypoint fixes ownership of the mounted `public/uploads` directory on start and then runs the app as user `1001`. If saving images still fails, check the container logs and that the host directory is writable by UID 1001:

```bash
sudo chown -R 1001:1001 public/uploads
```

When running locally without Docker, `public/uploads` must be writable by your user.

### Rate Limiting

If you encounter HTTP 429 errors, you've exceeded the rate limit for an API endpoint. Wait a minute before trying again.

### Healthcheck Failures

If Docker healthchecks fail:

1. Check container logs: `docker logs nextjs-image-processor`
2. Verify the application is running: `curl http://localhost:6060/api/healthcheck`
3. Restart the container: `docker compose restart app`

## 🙏 Acknowledgements

- [Next.js](https://nextjs.org/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [JSZip](https://stuk.github.io/jszip/)
- [Cheerio](https://cheerio.js.org/)
