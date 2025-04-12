# NextJS Image Processor

A powerful web application that allows you to download, process, and standardize images from various sources. This tool helps you create consistent 1500x1500px images with proper positioning based on the image content.

## 📋 Features

- **Multiple Image Sources**: Upload local files or scrape images from webpages
- **Intelligent Processing**: Automatically resize and position images to 1500x1500px based on content
- **Batch Processing**: Process multiple images at once with filtering by size
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
| `NEXT_PUBLIC_DEBUG` | Enable debug logging | false |

## 🏗️ Architecture

### Components

The application consists of two main components:

1. **Main Application**: A Next.js application that handles image processing
2. **Cleanup Service**: A service that runs every minute to delete uploaded files older than 1 hour

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

### Running tests locally

```bash
docker exec -it nextjs-image-processor-dev sh -c "cd /app && NODE_ENV=test-node npx jest __tests__/api/images.test.js --testEnvironment=node --detectOpenHandles --forceExit"
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
