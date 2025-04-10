# NextJS Image Processor

A powerful web application that allows you to download, process, and standardize images from various sources.

![NextJS Image Processor](https://via.placeholder.com/1200x630/0a0a0a/FFFFFF?text=NextJS+Image+Processor)

## 🌟 Features

- **Multiple Image Sources**: Upload local files, process direct image URLs, or scrape images from webpages
- **Standardized Processing**: Automatically resize and position images to 1500x1500px
- **Batch Processing**: Process multiple images at once
- **Download Options**: Download individual images or as a ZIP archive
- **CORS Handling**: Creates placeholders for images that can't be loaded due to CORS restrictions
- **Detailed Logging**: Real-time logs of all processing steps

## 🔍 How It Works

The application uses a combination of client-side and server-side technologies:

1. **Image Acquisition**:
   - Direct uploads using the browser's File API
   - URL fetching with server-side actions
   - Web scraping using Cheerio for HTML parsing

2. **Image Processing**:
   - Canvas API for image manipulation
   - Automatic positioning based on image dimensions
   - Placeholder generation for failed images

3. **Output Generation**:
   - Direct downloads as PNG files
   - ZIP archive creation using JSZip

## 🚀 Getting Started

### Running with Docker

The easiest way to run the application is using Docker:

```bash
# Clone the repository
git clone https://github.com/yourusername/nextjs-image-processor.git
cd nextjs-image-processor

# Set up proper permissions for the uploads directory
chmod +x setup-permissions.sh
./setup-permissions.sh

# Start the application with Docker Compose
docker compose up
```

The application will be available at http://localhost:6060

> **Important**: If you encounter permission errors when uploading images, make sure the `public/uploads` directory has write permissions for the Docker container. You can fix this by running the `setup-permissions.sh` script.

### 🎨 Customizing Your Installation

#### Custom Icons and Branding

You can customize the application's icons and branding by:

1. Creating a `custom-icons` directory on your host machine
2. Adding the following files to that directory:
   - `favicon.ico` - The website favicon
   - `icon-16x16.png` - Small icon (16x16 pixels)
   - `icon-32x32.png` - Medium icon (32x32 pixels)
   - `icon-192x192.png` - Large icon for PWA (192x192 pixels)
   - `icon-512x512.png` - Extra large icon for PWA (512x512 pixels)
   - `icon-maskable-192x192.png` - Maskable icon for Android (192x192 pixels)
   - `icon-maskable-512x512.png` - Maskable icon for Android (512x512 pixels)
   - `apple-icon.png` - Icon for Apple devices (180x180 pixels)
   - `safari-pinned-tab.svg` - SVG icon for Safari pinned tabs

3. Mount this directory in your docker-compose.yaml:
   ```yaml
   volumes:
     - ./custom-icons:/app/public/custom-icons
   ```

#### Environment Variables

You can customize the application metadata by setting these environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_SITE_NAME` | The name of your site | NextJS Image Processor |
| `NEXT_PUBLIC_SITE_DESCRIPTION` | Site description | A powerful web application... |
| `NEXT_PUBLIC_SITE_URL` | Your site's URL | https://yourdomain.com |
| `NEXT_PUBLIC_SITE_THEME_COLOR` | Theme color (hex) | #000000 |
| `NEXT_PUBLIC_SITE_BACKGROUND_COLOR` | Background color (hex) | #ffffff |

### Troubleshooting Docker Builds

If you encounter issues with the Docker build process:

1. Ensure your `next.config.js` file includes the `output: 'standalone'` setting:
   ```javascript
   /** @type {import('next').NextConfig} */
   const nextConfig = {
     // Other settings...
     output: 'standalone',
   }
   ```

2. Check that your Docker volumes are properly configured in `docker-compose.yaml`:
   ```yaml
   volumes:
     - ./custom-icons:/app/public/custom-icons
     - ./public/uploads:/app/public/uploads
   ```

3. If you have multiple Next.js config files (e.g., `next.config.js` and `next.config.mjs`), be aware that `next.config.js` takes precedence.

### Manual Setup

If you prefer to run the application without Docker:

```bash
# Clone the repository
git clone https://github.com/yourusername/nextjs-image-processor.git
cd nextjs-image-processor

# Install dependencies
pnpm install

# Run the development server
pnpm dev
```

## 🛠️ Development

### Prerequisites

- Node.js 22.x or later
- pnpm package manager

### Setup Development Environment

```bash
# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

### Project Structure

- `/app`: Next.js App Router components and pages
- `/components`: Reusable UI components
- `/lib`: Utility functions and shared code
- `/public`: Static assets

### Building for Production

```bash
# Build the application
pnpm build

# Start the production server
pnpm start
```

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add some amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgements

- [Next.js](https://nextjs.org/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [JSZip](https://stuk.github.io/jszip/)
- [Cheerio](https://cheerio.js.org/)


