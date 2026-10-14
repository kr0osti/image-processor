# NextJS Image Processor

A powerful web application that allows you to download, process, and standardize images from various sources. This tool helps you create consistent 1500x1500px images with proper positioning based on the image content.

## 📋 Features

- **Multiple Image Sources**: Upload local files or scrape images from webpages
- **Intelligent Processing**: Automatically resize and position images to 1500x1500px based on content
- **Batch Processing**: Process multiple images at once with filtering by size
- **Adjustable Layout**: A settings page sets the white-background padding (default 150px per side) and the white-detection threshold, saved per browser in a cookie
- **Low-Resolution Warning**: Images that had to be upscaled are flagged with their source size and upscale factor
- **Languages**: English, French, Spanish and German, picked from the browser language or the header switcher
- **Light & Dark Themes**: Follows the system setting, with a toggle in the header
- **Download Options**: Download individual images or as a ZIP archive
- **CORS Handling**: Creates placeholders for images that can't be loaded due to CORS restrictions
- **Automatic Cleanup**: Uploaded files are automatically deleted after 1 hour
- **Rate Limiting**: All API endpoints are protected with rate limiting to prevent abuse

## 🚀 Quick Start

### Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/yourusername/nextjs-image-processor.git
cd nextjs-image-processor

# Create a .env file from the example
cp .env.example .env

# Start the application with Docker Compose
docker compose up -d
```

The application will be available at http://localhost:6060

### Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/nextjs-image-processor.git
cd nextjs-image-processor

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
| `NEXT_PUBLIC_SITE_NAME` | The name of your site | NextJS Image Processor |
| `NEXT_PUBLIC_SITE_DESCRIPTION` | Site description | A powerful web application... |
| `NEXT_PUBLIC_SITE_URL` | Your site's URL | https://yourdomain.com |
| `NEXT_PUBLIC_SITE_THEME_COLOR` | Theme color (hex) | #000000 |
| `NEXT_PUBLIC_SITE_BACKGROUND_COLOR` | Background color (hex) | #ffffff |
| `CLEANUP_API_KEY` | API key for the cleanup endpoint | change-this-to-a-secure-key |
| `CLEANUP_CRON_SCHEDULE` | Cron schedule for the cleanup job | */30 * * * * |
| `NEXT_PUBLIC_DEBUG` | Enable debug logging | false |
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

The application consists of two main components:

1. **Main Application**: A Next.js application that handles image processing and runs a background cleanup cron job

### API Endpoints

| Endpoint | Method | Description | Rate Limit |
|----------|--------|-------------|------------|
| `/api/images` | POST | Upload and process images | 300 req/min |
| `/api/proxy` | GET | Proxy for fetching images to avoid CORS issues | 500 req/min |
| `/api/serve-image` | GET | Serve processed images from the server | 120 req/min |
| `/api/cleanup` | GET | Trigger cleanup of old uploads (requires API key) | 5 req/min |
| `/api/healthcheck` | GET | Check if the application is running | 30 req/min |

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

This project uses pnpm for dependency management. To update dependencies:

```bash
# Update dependencies and regenerate lockfile
pnpm update-lockfile
```

## 🔄 Docker Development

For development with Docker:

```bash
# Start the development environment
cd docker && docker-compose -f docker-compose-dev.yml up -d

# Stop the development environment
cd docker && docker-compose -f docker-compose-dev.yml down
```

## 🛠️ Troubleshooting

### Permission Issues

If you encounter permission errors when uploading images, ensure the `public/uploads` directory has proper permissions:

```bash
mkdir -p public/uploads
chmod -R 777 public/uploads
```

### Rate Limiting

If you encounter HTTP 429 errors, you've exceeded the rate limit for an API endpoint. Wait a minute before trying again.

### Healthcheck Failures

If Docker healthchecks fail:

1. Check container logs: `docker logs nextjs-image-processor`
2. Verify the application is running: `curl http://localhost:6060/api/healthcheck`
3. Restart the container: `docker compose restart app`

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgements

- [Next.js](https://nextjs.org/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [JSZip](https://stuk.github.io/jszip/)
- [Cheerio](https://cheerio.js.org/)
