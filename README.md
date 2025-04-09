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

# Start the application with Docker Compose
docker compose up
```

The application will be available at http://localhost:3000

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