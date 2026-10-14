"use client";

import { useRef, useState, useMemo } from 'react';
import React from 'react';

// This is fine at module level - it's not a hook
const isBrowser = typeof window !== 'undefined';

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchImagesFromUrl } from "./actions"
import { Loader2, Globe, Upload, AlertTriangle, Download, Trash2, Filter, ChevronDown, X } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import JSZip from "jszip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { ImageMetadata } from "./actions"
import { Checkbox } from "@/components/ui/checkbox"
import { Copy } from "lucide-react"
import { toast } from "sonner"
import {
  BOUNDS_SCAN_SIZE,
  computeDrawRect,
  countWhitePixels,
  findContentBounds,
  getSampleRegions,
  hasSignificantPadding,
  isWhiteBackground,
  resolveWhiteBackground,
  scaleBounds,
  type Rect,
} from "@/lib/image-layout"

interface FetchResult {
  imageUrls?: string[];
  imageMetadata?: Array<{
    url: string;
    filename: string;
    size: 'small' | 'medium' | 'large' | 'unknown';
    width?: number;
    height?: number;
  }>;
  error?: string;
  logs?: string[];
}

interface ProcessedImage {
  // Stable key so removing one image doesn't shift the others
  id: number;
  url: string;
  // Source image the result was rendered from, kept so it can be reprocessed
  sourceUrl: string;
  // Whether the white-background (padded) layout was applied
  whiteBackground: boolean;
  // Whether the source has a significant white margin around its content
  hasWhitePadding: boolean;
  // Whether that margin was trimmed before layout
  trimPadding: boolean;
  // Placeholders for images that failed to load can't be reprocessed
  isPlaceholder: boolean;
  // Bumped on each reprocess to bust the browser cache (the server reuses the filename)
  version: number;
}

interface ProcessOptions {
  // Force the white-background layout on or off instead of auto-detecting it
  whiteBackground?: boolean;
  // Crop the source to its non-white content before layout
  trimPadding?: boolean;
}

export default function ImageProcessor() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState("")
  const [baseUrl, setBaseUrl] = useState("https://zhik.com")
  const [useCustomBaseUrl, setUseCustomBaseUrl] = useState(false)
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([])
  const [reprocessingIndex, setReprocessingIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState("")
  // Each uploaded file with the blob URL it is processed from
  const [uploadedFiles, setUploadedFiles] = useState<{ file: File; url: string }[]>([])
  const nextImageId = useRef(0)
  const [fetchedImages, setFetchedImages] = useState<string[]>([])
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [imageMetadata, setImageMetadata] = useState<ImageMetadata[]>([])

  const sizeCounts = useMemo(() => {
    const counts = { small: 0, medium: 0, large: 0, unknown: 0 };
    for (const m of imageMetadata) {
      if (m.size === 'small') counts.small++;
      else if (m.size === 'medium') counts.medium++;
      else if (m.size === 'large') counts.large++;
      else counts.unknown++;
    }
    return counts;
  }, [imageMetadata]);

  const [sizeFilter, setSizeFilter] = useState<('small' | 'medium' | 'large' | 'unknown')[]>(['large'])
  const [minWidth, setMinWidth] = useState<number | undefined>(undefined)
  const [minHeight, setMinHeight] = useState<number | undefined>(undefined)
  const [customSizeEnabled, setCustomSizeEnabled] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  // Original filename for each source URL; a ref so processing started in the same event sees new entries
  const imageUrlToFilename = useRef<Map<string, string>>(new Map())

  const addLog = (message: string) => {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      // eslint-disable-next-line no-console -- debug output, only when NEXT_PUBLIC_DEBUG is on
      console.log(`[${new Date().toLocaleTimeString()}] ${message}`)
    }
  }

  // Add this function to copy image URL to clipboard
  const copyImageUrl = (dataUrl: string) => {
    if (!isBrowser) {
      addLog("Cannot copy URL in server context")
      return
    }

    // Convert relative URL to absolute URL
    const absoluteUrl = new URL(dataUrl, window.location.origin).toString()

    if (!navigator.clipboard) {
      // Fallback for browsers that don't support the Clipboard API
      try {
        const textArea = document.createElement('textarea')
        textArea.value = absoluteUrl
        textArea.style.position = 'fixed'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        const successful = document.execCommand('copy')
        document.body.removeChild(textArea)

        if (successful) {
          toast.success("Full image URL copied to clipboard")
          addLog("Full image URL copied to clipboard (fallback method)")
        } else {
          toast.error("Failed to copy URL")
          addLog("Failed to copy URL (fallback method failed)")
        }
      } catch (err) {
        toast.error("Failed to copy URL")
        addLog(`Error copying URL: ${err}`)
      }
      return
    }

    // Modern clipboard API
    navigator.clipboard.writeText(absoluteUrl)
      .then(() => {
        toast.success("Full image URL copied to clipboard")
        addLog("Full image URL copied to clipboard")
      })
      .catch(err => {
        toast.error("Failed to copy URL")
        addLog(`Error copying URL: ${err}`)
      })
  }

  // Fetched images matching the size filters
  const filteredImages = useMemo(() => {
    if (fetchedImages.length > 0 && imageMetadata.length > 0) {
      return imageMetadata
        .filter(img => {
          // Filter by predefined sizes
          const matchesPresetSize = sizeFilter.includes(img.size || 'unknown');

          // Filter by custom dimensions if enabled
          const matchesCustomSize = customSizeEnabled ?
            (!minWidth || (img.width && img.width >= minWidth)) &&
            (!minHeight || (img.height && img.height >= minHeight)) :
            true;

          return matchesPresetSize || (customSizeEnabled && matchesCustomSize);
        })
        .map(img => img.url)
    }
    return fetchedImages
  }, [fetchedImages, imageMetadata, sizeFilter, minWidth, minHeight, customSizeEnabled])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return

    setLoading(true)
    setError("")
    setFetchedImages([])
    setSelectedImages([])
    setImageMetadata([])
    addLog(`Fetching images from URL: ${url}`)

    if (useCustomBaseUrl && baseUrl) {
      addLog(`Using custom base URL: ${baseUrl}`)
    }

    try {
      const result = await fetchImagesFromUrl(url, useCustomBaseUrl ? baseUrl : undefined) as FetchResult;

      if (result.logs) {
        result.logs.forEach((log) => addLog(log))
      }

      if (result.error) {
        setError(result.error)
        addLog(`Error: ${result.error}`)
      } else if (result.imageUrls) {
        addLog(`Found ${result.imageUrls.length} images on the page`)

        // Store initial metadata
        const metadata = result.imageMetadata || (result.imageUrls ? result.imageUrls.map((imgUrl, index) => {
          const filename = imgUrl.split("/").pop()?.split("?")[0] || `image-${index + 1}`
          return { url: imgUrl, filename, size: 'unknown' as const }
        }) : []);

        setImageMetadata(metadata)
        setFetchedImages(result.imageUrls)

        // Store filename mapping for fetched images, keeping earlier entries so
        // previously processed images can still be reprocessed under their name
        result.imageUrls.forEach((imgUrl, index) => {
          const filename = metadata[index]?.filename || imgUrl.split("/").pop()?.split("?")[0] || `image-${index + 1}`
          imageUrlToFilename.current.set(imgUrl, filename)
        })

        // Load images to determine their sizes
        addLog("Loading images to determine sizes...")
        loadImageSizes(result.imageUrls)
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred"
      setError(`An error occurred while fetching the images: ${errorMessage}`)
      addLog(`Exception: ${errorMessage}`)
      console.error(err)
    } finally {
      setLoading(false)
    }
  }


  const createPlaceholderForFailedImage = (imageUrl: string): Promise<string> => {
    if (!isBrowser) return Promise.resolve('')

    return new Promise((resolve) => {
      addLog(`Creating placeholder for failed image: ${imageUrl}`)

      // Extract filename from URL
      const filename = imageUrl.split("/").pop()?.split("?")[0] || "image"

      // Create a canvas for the placeholder
      const canvas = document.createElement("canvas")
      canvas.width = 800
      canvas.height = 1000

      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        addLog("Failed to get canvas context for placeholder")
        resolve("")
        return
      }

      // Draw placeholder
      ctx.fillStyle = "#f5f5f5"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Add border
      ctx.strokeStyle = "#dddddd"
      ctx.lineWidth = 2
      ctx.strokeRect(0, 0, canvas.width, canvas.height)

      // Add image icon
      ctx.fillStyle = "#aaaaaa"
      ctx.beginPath()
      // Draw a simple image icon
      const iconSize = 100
      const x = (canvas.width - iconSize) / 2
      const y = (canvas.height - iconSize) / 2 - 50

      // Draw mountain-like icon
      ctx.moveTo(x, y + iconSize)
      ctx.lineTo(x + iconSize * 0.3, y + iconSize * 0.5)
      ctx.lineTo(x + iconSize * 0.5, y + iconSize * 0.7)
      ctx.lineTo(x + iconSize * 0.7, y + iconSize * 0.3)
      ctx.lineTo(x + iconSize, y + iconSize)
      ctx.closePath()
      ctx.fill()

      // Add sun
      ctx.beginPath()
      ctx.arc(x + iconSize * 0.8, y + iconSize * 0.2, iconSize * 0.1, 0, Math.PI * 2)
      ctx.fill()

      // Add text
      ctx.fillStyle = "#666666"
      ctx.font = "bold 16px Arial"
      ctx.textAlign = "center"
      ctx.fillText("Image Not Available", canvas.width / 2, y + iconSize + 40)

      // Add filename
      ctx.font = "14px Arial"
      ctx.fillText(filename, canvas.width / 2, y + iconSize + 70)

      // Add reason
      ctx.font = "12px Arial"
      ctx.fillText("CORS Protection or Access Restricted", canvas.width / 2, y + iconSize + 100)

      // Add URL (truncated if too long)
      ctx.font = "10px Arial"
      const displayUrl = imageUrl.length > 60 ? imageUrl.substring(0, 57) + "..." : imageUrl
      ctx.fillText(displayUrl, canvas.width / 2, y + iconSize + 130)

      // Convert to data URL
      const dataUrl = canvas.toDataURL("image/png")
      addLog("Created placeholder for failed image")
      resolve(dataUrl)
    })
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files)
      // Allow picking the same file again later
      e.target.value = ""

      addLog(`Uploaded ${files.length} file(s)`)
      files.forEach((file) => {
        addLog(`File: ${file.name}, Size: ${(file.size / 1024).toFixed(2)} KB, Type: ${file.type}`)
      })

      addUploadedFiles(files)
    }
  }

  const triggerFileInput = () => {
    if (fileInputRef && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're actually leaving the drop zone
    // (not just moving between child elements)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const allFiles = Array.from(e.dataTransfer.files);
    const imageFiles = allFiles.filter((file) => 
      file.type.startsWith('image/')
    );

    if (imageFiles.length === 0) {
      addLog('No image files found in dropped files');
      toast.error('Please drop image files only');
      return;
    }

    if (imageFiles.length < allFiles.length) {
      const skippedCount = allFiles.length - imageFiles.length;
      addLog(`Skipped ${skippedCount} non-image file(s)`);
      toast.info(`Skipped ${skippedCount} non-image file(s)`);
    }


    addLog(`Uploaded ${imageFiles.length} file(s) via drag and drop`);
    imageFiles.forEach((file) => {
      addLog(`File: ${file.name}, Size: ${(file.size / 1024).toFixed(2)} KB, Type: ${file.type}`);
    });

    addUploadedFiles(imageFiles);
  }

  // Queue new uploads for processing; their results are appended to the existing ones
  const addUploadedFiles = (files: File[]) => {
    const fileUrls = files.map((file) => URL.createObjectURL(file))
    addLog(`Created object URLs for ${fileUrls.length} files`)

    setUploadedFiles((prev) => [...prev, ...files.map((file, index) => ({ file, url: fileUrls[index] }))])
    files.forEach((file, index) => imageUrlToFilename.current.set(fileUrls[index], file.name))
    processImages(fileUrls)
  }

  /**
   * Compresses an image data URL to reduce its size before sending to the server
   *
   * @param {string} dataUrl - The data URL of the image to compress
   * @returns {Promise<string>} A promise that resolves to the compressed data URL
   */
  const compressImageDataUrl = (dataUrl: string): Promise<string> => {
    if (!isBrowser) return Promise.resolve(dataUrl)

    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        // Create a canvas to draw the compressed image
        const canvas = document.createElement('canvas')

        // Set max dimensions to reduce size while maintaining quality
        const maxDimension = 1500
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
        canvas.width = img.width * scale
        canvas.height = img.height * scale

        // Get context and draw image
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          addLog("Failed to get canvas context for compression")
          resolve(dataUrl) // Return original if compression fails
          return
        }

        // Draw image with smoothing for better quality
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        // Convert to data URL with reduced quality (0.8 is a good balance)
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8)
        resolve(compressedDataUrl)
      }

      img.onerror = () => {
        addLog("Failed to load image for compression")
        resolve(dataUrl) // Return original if compression fails
      }

      img.src = dataUrl
    })
  }

  /**
   * Converts a data URL to a real URL by sending it to the server for processing
   * Includes timeout handling and error management
   *
   * @param {string} dataUrl - The data URL to convert
   * @param {string} [originalFilename] - Optional original filename to use for the processed file
   * @returns {Promise<string|null>} A promise that resolves to the URL of the saved image, or null if an error occurred
   */
  const convertDataUrlToRealUrl = async (dataUrl: string, originalFilename?: string): Promise<string | null> => {
    try {
      // Create an AbortController to handle timeouts
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

      addLog(`Sending image data to server (size: ${Math.round(dataUrl.length / 1024)} KB)`)

      const response = await fetch('/api/images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dataUrl, originalFilename }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const data = await response.json();

      // Clear the timeout
      clearTimeout(timeoutId);

      if (data.success) {
        // Return the API URL which should work more reliably
        addLog(`Image successfully saved to server`)
        return data.apiUrl || data.url;
      } else {
        throw new Error(data.message || 'Failed to save image');
      }
    } catch (error: unknown) {
      // Check if this was an abort error (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        addLog(`Request timed out after 60 seconds. The server might be overloaded or the image might be too large.`);
      } else if (error instanceof Error) {
        addLog(`Error saving image to server: ${error.message}`);
      } else {
        addLog(`Error saving image to server: Unknown error`);
      }
      console.error('Error converting data URL to real URL:', error);
      return null;
    }
  }

  /**
   * Runs one source image through the canvas pipeline and saves it to the server.
   *
   * @param {string} imageUrl - The source image URL (remote URL or blob URL)
   * @param {ProcessOptions} [options] - White-background override and padding trim
   * @param {boolean} [allowPlaceholder=true] - Save a placeholder when the source image fails to load
   * @returns {Promise<ProcessedImage|null>} The saved image, or null if it could not be processed or saved
   */
  const processAndSaveImage = async (
    imageUrl: string,
    options: ProcessOptions = {},
    allowPlaceholder = true,
  ): Promise<ProcessedImage | null> => {
    const result = await processImageWithCanvas(imageUrl, options)
    let processedImage = result?.dataUrl ?? null
    const isPlaceholder = !result

    // If image processing failed, create a placeholder
    if (!processedImage && allowPlaceholder) {
      addLog(`Creating placeholder for failed image: ${imageUrl}`)
      const placeholderDataUrl = await createPlaceholderForFailedImage(imageUrl)
      if (placeholderDataUrl) {
        // Process the placeholder with the same rules
        processedImage = await processPlaceholderAsImage(placeholderDataUrl)
        addLog(`Successfully created and processed placeholder for ${imageUrl}`)
      }
    }

    if (!processedImage) return null

    // Compress the image data before sending to server
    const compressedImage = await compressImageDataUrl(processedImage)
    addLog(`Compressed image from ${Math.round(processedImage.length / 1024)} KB to ${Math.round(compressedImage.length / 1024)} KB`)

    // Get original filename if available
    const originalFilename = imageUrlToFilename.current.get(imageUrl)

    // Convert data URL to real URL
    const realUrl = await convertDataUrlToRealUrl(compressedImage, originalFilename)
    if (realUrl === null) return null

    return {
      id: nextImageId.current++,
      url: realUrl,
      sourceUrl: imageUrl,
      whiteBackground: result?.whiteBackground ?? false,
      hasWhitePadding: result?.hasWhitePadding ?? false,
      trimPadding: result?.trimmed ?? false,
      isPlaceholder,
      version: 0,
    }
  }

  const processImages = async (urls: string[]) => {
    setProcessing(true)
    addLog(`Starting to process ${urls.length} images`)
    const processed: ProcessedImage[] = []

    for (const [index, imageUrl] of urls.entries()) {
      try {
        addLog(`Processing image ${index + 1}: ${imageUrl}`)
        const processedImage = await processAndSaveImage(imageUrl)
        if (processedImage) {
          processed.push(processedImage)
          addLog(`Successfully processed image ${index + 1}`)
        } else {
          addLog(`Failed to process image ${index + 1}`)
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        addLog(`Error processing image ${index + 1}: ${errorMessage}`)
      }
    }

    addLog(`Completed processing. Successfully processed ${processed.length} of ${urls.length} images`)
    // Append to earlier results instead of replacing them
    setProcessedImages((prev) => [...prev, ...processed])
    setProcessing(false)
    // Blob URLs are kept alive so images can be reprocessed; they are revoked when
    // the image is removed or when all files are deleted.
  }

  // Re-run processing for a single image with one of its settings changed
  const reprocessImage = async (index: number, changes: ProcessOptions) => {
    const target = processedImages[index]
    if (!target || target.isPlaceholder) return

    // Keep the image's current settings, so flipping one switch doesn't reset the other
    const options: Required<ProcessOptions> = {
      whiteBackground: target.whiteBackground,
      trimPadding: target.trimPadding,
      ...changes,
    }

    setReprocessingIndex(index)
    addLog(
      `Reprocessing image ${index + 1}: white background ${options.whiteBackground ? "on" : "off"}, trim padding ${options.trimPadding ? "on" : "off"}`,
    )

    try {
      // No placeholder fallback: it would overwrite the existing result on the server
      const result = await processAndSaveImage(target.sourceUrl, options, false)
      if (result) {
        // Matched by id, keeping the original id so the card stays in place
        setProcessedImages((prev) =>
          prev.map((img) => (img.id === target.id ? { ...result, id: img.id, version: img.version + 1 } : img)),
        )
      } else {
        toast.error(`Failed to reprocess image ${index + 1}`)
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      addLog(`Error reprocessing image ${index + 1}: ${errorMessage}`)
      toast.error(`Failed to reprocess image ${index + 1}`)
    } finally {
      setReprocessingIndex(null)
    }
  }

  // Revoke blob URLs from a previous upload before replacing them
  const revokeBlobUrls = (urls: string[]) => {
    urls.forEach((url) => {
      if (url.startsWith("blob:")) {
        URL.revokeObjectURL(url)
      }
    })
  }

  const processPlaceholderAsImage = (dataUrl: string): Promise<string | null> => {
    if (!isBrowser) return Promise.resolve(null)

    return new Promise((resolve) => {
      const img = new Image()

      img.onload = () => {
        const canvas = canvasRef.current
        if (!canvas) {
          addLog("Canvas reference not available")
          resolve(null)
          return
        }

        // Set canvas size to 1500x1500
        canvas.width = 1500
        canvas.height = 1500
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          addLog("Failed to get canvas context")
          resolve(null)
          return
        }

        // Fill canvas with white background
        ctx.fillStyle = "white"
        ctx.fillRect(0, 0, 1500, 1500)

        // Center the placeholder
        const scale = Math.min(1500 / img.width, 1500 / img.height)
        const newWidth = img.width * scale
        const newHeight = img.height * scale
        const x = (1500 - newWidth) / 2
        const y = (1500 - newHeight) / 2

        ctx.drawImage(img, x, y, newWidth, newHeight)

        // Convert canvas to data URL
        const finalDataUrl = canvas.toDataURL("image/png")
        resolve(finalDataUrl)
      }

      img.onerror = () => {
        addLog("Failed to load placeholder image")
        resolve(null)
      }

      img.src = dataUrl
    })
  }

  const getProxiedImageUrl = (imageUrl: string): string => {
    // Only proxy remote URLs, not data URLs or object URLs
    if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
      return imageUrl;
    }

    // Use our proxy API route
    return `/api/proxy?url=${encodeURIComponent(imageUrl)}`;
  };

  const processImageWithCanvas = (
    imageUrl: string,
    options: ProcessOptions = {},
  ): Promise<{ dataUrl: string; whiteBackground: boolean; hasWhitePadding: boolean; trimmed: boolean } | null> => {
    if (!isBrowser) return Promise.resolve(null)

    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = "anonymous" // Prevent CORS issues

      // Set up a timeout to handle cases where the image never loads
      const timeoutId = setTimeout(() => {
        addLog(`Timeout loading image: ${imageUrl}`)
        resolve(null)
      }, 15000) // 15 seconds timeout

      img.onload = () => {
        clearTimeout(timeoutId)
        addLog(`Image loaded: ${img.width}x${img.height}`)
        const canvas = canvasRef.current
        if (!canvas) {
          addLog("Canvas reference not available")
          resolve(null)
          return
        }

        // Set canvas size to 1500x1500
        canvas.width = 1500
        canvas.height = 1500
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          addLog("Failed to get canvas context")
          resolve(null)
          return
        }

        // Fill canvas with white background
        ctx.fillStyle = "white"
        ctx.fillRect(0, 0, 1500, 1500)

        // Determine if image has white background, unless the user forced it on or off
        const hasWhiteBackground = resolveWhiteBackground(options.whiteBackground, () => detectWhiteBorder(img))
        addLog(
          `Image background ${options.whiteBackground === undefined ? "detection" : "override"}: ${hasWhiteBackground ? "White background" : "No white background"}`,
        )

        // Find the non-white content so a significant white margin can be offered for trimming
        const contentBounds = detectContentBounds(img)
        const hasWhitePadding = hasSignificantPadding(contentBounds, img.width, img.height)
        addLog(`White padding detection: ${hasWhitePadding ? "Significant padding" : "No significant padding"}`)

        // Crop to the content when asked to; otherwise use the whole source image
        const trimmed = !!options.trimPadding && contentBounds !== null
        const source: Rect = trimmed && contentBounds
          ? contentBounds
          : { x: 0, y: 0, width: img.width, height: img.height }
        if (trimmed) {
          addLog(`Trimming padding to ${source.width}x${source.height} at (${source.x}, ${source.y})`)
        }

        // Padded for white backgrounds, otherwise fit to full width/height
        const rect = computeDrawRect(source.width, source.height, hasWhiteBackground)
        addLog(`Drawing at ${rect.width}x${rect.height}, position: (${rect.x}, ${rect.y})`)
        ctx.drawImage(img, source.x, source.y, source.width, source.height, rect.x, rect.y, rect.width, rect.height)

        // Convert canvas to data URL
        const dataUrl = canvas.toDataURL("image/png")
        addLog("Image processing completed successfully")
        resolve({ dataUrl, whiteBackground: hasWhiteBackground, hasWhitePadding, trimmed })
      }

      img.onerror = (e) => {
        clearTimeout(timeoutId)
        const errorEvent = e as ErrorEvent
        addLog(`Failed to load image: ${imageUrl}. Error: ${errorEvent.message || "Unknown error"}`)
        console.error(`Failed to load image: ${imageUrl}`, e)
        resolve(null)
      }

      addLog(`Loading image: ${imageUrl}`)
      img.src = getProxiedImageUrl(imageUrl)
    })
  }

  const detectWhiteBorder = (img: HTMLImageElement): boolean => {
    try {
      // Create a temporary canvas to analyze the image
      const tempCanvas = document.createElement("canvas")
      tempCanvas.width = img.width
      tempCanvas.height = img.height
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })
      if (!tempCtx) {
        addLog("Failed to get temporary canvas context for border detection")
        return false
      }

      // Draw the image on the temporary canvas
      tempCtx.drawImage(img, 0, 0, img.width, img.height)

      // Sample the edges and the center of the image
      let whitePixelCount = 0
      let totalPixels = 0
      for (const region of getSampleRegions(img.width, img.height)) {
        const imageData = tempCtx.getImageData(region.x, region.y, region.width, region.height)
        const { white, total } = countWhitePixels(imageData.data)
        whitePixelCount += white
        totalPixels += total
      }

      addLog(`Background detection: ${whitePixelCount}/${totalPixels} white pixels (${(whitePixelCount / totalPixels * 100).toFixed(2)}%)`)
      return isWhiteBackground(whitePixelCount, totalPixels)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      addLog(`Error in background detection: ${errorMessage}`)
      console.error("Error detecting white background:", error)
      return false
    }
  }

  // Bounding box of the image's non-white content, scanned on a downscaled copy for speed
  const detectContentBounds = (img: HTMLImageElement): Rect | null => {
    try {
      const scale = Math.min(1, BOUNDS_SCAN_SIZE / Math.max(img.width, img.height))
      const tempCanvas = document.createElement("canvas")
      tempCanvas.width = Math.max(1, Math.round(img.width * scale))
      tempCanvas.height = Math.max(1, Math.round(img.height * scale))
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })
      if (!tempCtx) {
        addLog("Failed to get temporary canvas context for padding detection")
        return null
      }

      tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height)
      const { data } = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height)
      const bounds = findContentBounds(data, tempCanvas.width, tempCanvas.height)
      return bounds && scaleBounds(bounds, img.width / tempCanvas.width, img.width, img.height)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      addLog(`Error in padding detection: ${errorMessage}`)
      return null
    }
  }

  // Helper function to extract filename from processed image URL
  const getFilenameFromUrl = (url: string, index: number): string => {
    try {
      // Handle absolute URLs by creating a URL object
      let urlObj: URL
      if (url.startsWith('http://') || url.startsWith('https://')) {
        urlObj = new URL(url)
      } else if (url.startsWith('/')) {
        // Relative URL, construct full URL
        urlObj = new URL(url, window.location.origin)
      } else {
        // Try to parse as-is
        urlObj = new URL(url, window.location.origin)
      }
      
      // If it's a server URL with query parameter
      if (urlObj.pathname.includes('/api/serve-image') || url.includes('/api/serve-image?file=')) {
        const filename = urlObj.searchParams.get('file')
        if (filename) return filename
      }
      
      // If it's a direct uploads URL
      if (urlObj.pathname.includes('/uploads/') || url.includes('/uploads/')) {
        const pathname = urlObj.pathname
        const filename = pathname.split('/uploads/')[1]?.split('?')[0] || 
                        url.split('/uploads/')[1]?.split('?')[0]
        if (filename) return filename
      }
      
      // If it's a data URL, we can't extract a filename, use default
      if (url.startsWith('data:')) {
        return `processed-image-${index}.png`
      }
      
      // Try to extract from any URL path
      const pathname = urlObj.pathname || url
      const pathParts = pathname.split('/')
      const lastPart = pathParts[pathParts.length - 1]?.split('?')[0]
      if (lastPart && lastPart.includes('.')) {
        return lastPart
      }
    } catch (error) {
      console.error('Error extracting filename from URL:', error)
      // Try simple string extraction as fallback
      if (url.includes('/api/serve-image?file=')) {
        const match = url.match(/[?&]file=([^&]+)/)
        if (match && match[1]) return match[1]
      }
      if (url.includes('/uploads/')) {
        const match = url.match(/\/uploads\/([^?]+)/)
        if (match && match[1]) return match[1]
      }
    }
    
    // Fallback to default filename
    return `processed-image-${index}.png`
  }

  const downloadImage = (dataUrl: string, index: number) => {
    const link = document.createElement("a")
    link.href = dataUrl
    const filename = getFilenameFromUrl(dataUrl, index)
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    addLog(`Downloaded image ${index}: ${filename}`)
  }

  const downloadAllImages = () => {
    if (processedImages.length === 0) return

    addLog(`Downloading all ${processedImages.length} processed images`)
    processedImages.forEach((img, index) => {
      setTimeout(() => {
        downloadImage(img.url, index + 1)
      }, index * 500) // Stagger downloads to prevent browser issues
    })
  }

  // Add this function after the downloadAllImages function
  const downloadAsZip = async () => {
    if (processedImages.length === 0) return

    addLog(`Creating zip file with ${processedImages.length} processed images`)
    setProcessing(true)

    try {
      const zip = new JSZip()

      // Process each image and add to the zip
      for (let index = 0; index < processedImages.length; index++) {
        const imageUrl = processedImages[index].url
        addLog(`Processing image ${index + 1} for zip: ${imageUrl.substring(0, 50)}...`)

        let blob: Blob

        // Check if it's a data URL or a server URL
        if (imageUrl.startsWith('data:')) {
          // It's a data URL, extract the base64 data
          const matches = imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)

          if (!matches || matches.length !== 3) {
            addLog(`Invalid data URL format for image ${index + 1}, skipping`)
            continue
          }

          try {
            const imageData = matches[2]
            const byteCharacters = atob(imageData)
            const byteArrays = []

            for (let offset = 0; offset < byteCharacters.length; offset += 512) {
              const slice = byteCharacters.slice(offset, offset + 512)

              const byteNumbers = new Array(slice.length)
              for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i)
              }

              const byteArray = new Uint8Array(byteNumbers)
              byteArrays.push(byteArray)
            }

            blob = new Blob(byteArrays, { type: matches[1] || "image/png" })
          } catch (error) {
            addLog(`Error processing data URL for image ${index + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`)
            continue
          }
        } else {
          // It's a server URL, fetch the image
          try {
            addLog(`Fetching image ${index + 1} from server: ${imageUrl}`)
            const response = await fetch(imageUrl)

            if (!response.ok) {
              addLog(`Failed to fetch image ${index + 1}: ${response.status} ${response.statusText}`)
              continue
            }

            blob = await response.blob()
            addLog(`Successfully fetched image ${index + 1} (${Math.round(blob.size / 1024)} KB)`)
          } catch (error) {
            addLog(`Error fetching image ${index + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`)
            continue
          }
        }

        // Add to zip with the correct filename
        const filename = getFilenameFromUrl(imageUrl, index + 1)
        zip.file(filename, blob)
        addLog(`Added image ${index + 1} to zip file: ${filename}`)
      }

      // Generate the zip file
      addLog('Generating zip file...')
      const content = await zip.generateAsync({ type: "blob" })
      addLog(`Zip file generated (${Math.round(content.size / 1024)} KB)`)

      // Create download link
      const link = document.createElement("a")
      link.href = URL.createObjectURL(content)
      link.download = "processed-images.zip"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Clean up
      URL.revokeObjectURL(link.href)
      addLog("Zip file created and download initiated")
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      addLog(`Error creating zip file: ${errorMessage}`)
      setError(`Failed to create zip file: ${errorMessage}`)
    } finally {
      setProcessing(false)
    }
  }

  // Remove one processed image, and its uploaded file if it came from an upload
  const removeProcessedImage = (id: number) => {
    const target = processedImages.find((img) => img.id === id)
    if (!target) return

    setProcessedImages((prev) => prev.filter((img) => img.id !== id))

    // Only drop the source if no other result was rendered from it
    if (!processedImages.some((img) => img.id !== id && img.sourceUrl === target.sourceUrl)) {
      revokeBlobUrls([target.sourceUrl])
      setUploadedFiles((prev) => prev.filter((upload) => upload.url !== target.sourceUrl))
    }
    addLog(`Removed processed image: ${target.url}`)
  }

  const deleteAllFiles = () => {
    // Clean up object URLs
    revokeBlobUrls(uploadedFiles.map((upload) => upload.url))

    // Reset all file-related state
    setUploadedFiles([])
    setProcessedImages([])
    setFetchedImages([])
    setSelectedImages([])

    addLog("All files deleted")
  }

  const processSelectedImages = () => {
    if (selectedImages.length === 0) {
      setError("Please select at least one image to process")
      addLog("No images selected for processing")
      return
    }

    addLog(`Processing ${selectedImages.length} selected images`)
    processImages(selectedImages)
  }

  const toggleImageSelection = (imageUrl: string) => {
    setSelectedImages((prev) =>
      prev.includes(imageUrl) ? prev.filter((url) => url !== imageUrl) : [...prev, imageUrl],
    )
  }

  const selectAllImages = () => {
    if (filteredImages.length === 0) return

    if (selectedImages.length === filteredImages.length) {
      // If all filtered images are selected, deselect all
      setSelectedImages([])
      addLog("Deselected all images")
    } else {
      // Otherwise select all filtered images
      setSelectedImages([...filteredImages])
      addLog(`Selected all ${filteredImages.length} filtered images`)
    }
  }

  // Add this function to determine image size category
  const determineImageSize = (width?: number, height?: number): 'small' | 'medium' | 'large' | 'unknown' => {
    if (!width || !height) return 'unknown'

    const area = width * height

    if (area < 90000) { // Less than 300x300
      return 'small'
    } else if (area < 360000) { // Less than 600x600
      return 'medium'
    } else {
      return 'large'
    }
  }

  // Add this function to load image sizes
  const loadImageSizes = (urls: string[]) => {
    let loaded = 0

    urls.forEach((url, index) => {
      const img = new Image()
      img.onload = () => {
        loaded++
        setImageMetadata(prev => {
          const updated = [...prev]
          const size = determineImageSize(img.width, img.height)

          if (updated[index]) {
            updated[index] = {
              ...updated[index],
              width: img.width,
              height: img.height,
              size
            }
          }

          if (loaded === urls.length) {
            const counts = { small: 0, medium: 0, large: 0, unknown: 0 };
            for (const m of updated) {
              if (m.size === 'small') counts.small++;
              else if (m.size === 'medium') counts.medium++;
              else if (m.size === 'large') counts.large++;
              else counts.unknown++;
            }

            addLog(`Image sizes: ${counts.small} small, ${counts.medium} medium, ${counts.large} large, ${counts.unknown} unknown`)
          }

          return updated
        })
      }

      img.onerror = () => {
        loaded++
        // Keep as unknown size
      }

      img.src = getProxiedImageUrl(url)
    })
  }

  // Add this function to toggle size filter
  const toggleSizeFilter = (size: 'small' | 'medium' | 'large' | 'unknown') => {
    setSizeFilter(prev =>
      prev.includes(size)
        ? prev.filter(s => s !== size)
        : [...prev, size]
    )
  }

  return (
    <div className="container mx-auto py-10">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <h1 className="text-2xl font-bold">Image Processor</h1>
          <CardDescription>Download and proccess images to 1500x1500px with appropriate positioning</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="upload">
            <TabsList className="mb-4">
              <TabsTrigger value="upload">
                <Upload className="mr-2 h-4 w-4" />
                Upload Images
              </TabsTrigger>
              <TabsTrigger value="webpage">
                <Globe className="mr-2 h-4 w-4" />
                From Webpage
              </TabsTrigger>
            </TabsList>

            <TabsContent value="webpage">
              <form onSubmit={handleSubmit} className="space-y-4">
                <Alert>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  <AlertDescription>
                    Images from websites may be protected by CORS. The app will create placeholders for images that
                    can&apos;t be loaded directly.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="url">Webpage URL</Label>
                  <Input
                    id="url"
                    type="url"
                    placeholder="https://example.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch id="use-custom-base" checked={useCustomBaseUrl} onCheckedChange={setUseCustomBaseUrl} />
                  <Label htmlFor="use-custom-base">Use custom base URL for relative paths</Label>
                </div>

                {useCustomBaseUrl && (
                  <div className="space-y-2">
                    <Label htmlFor="base-url">Base URL</Label>
                    <Input
                      id="base-url"
                      type="url"
                      placeholder="https://example.com"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                    />
                  </div>
                )}

                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Fetching
                    </>
                  ) : (
                    "Fetch Images"
                  )}
                </Button>
              </form>

              {fetchedImages.length > 0 && (
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={deleteAllFiles}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete All Files
                  </Button>
                </div>
              )}

              {fetchedImages.length > 0 && (
                <div className="mt-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium">Found Images ({fetchedImages.length})</h3>
                    <div className="flex space-x-2 items-center">
                      {/* Add Size Filter Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="flex items-center gap-1">
                            <Filter className="h-4 w-4" />
                            Size
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>Filter by Size</DropdownMenuLabel>
                          <DropdownMenuSeparator />

                          {/* Preset size filters */}
                          <div className="p-2">
                            <div className="flex items-center space-x-2 mb-2">
                              <Checkbox
                                id="size-small"
                                checked={sizeFilter.includes('small')}
                                onCheckedChange={() => toggleSizeFilter('small')}
                              />
                              <label htmlFor="size-small" className="text-sm">
                                Small ({sizeCounts.small})
                              </label>
                            </div>

                            <div className="flex items-center space-x-2 mb-2">
                              <Checkbox
                                id="size-medium"
                                checked={sizeFilter.includes('medium')}
                                onCheckedChange={() => toggleSizeFilter('medium')}
                              />
                              <label htmlFor="size-medium" className="text-sm">
                                Medium ({sizeCounts.medium})
                              </label>
                            </div>

                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="size-large"
                                checked={sizeFilter.includes('large')}
                                onCheckedChange={() => toggleSizeFilter('large')}
                              />
                              <label htmlFor="size-large" className="text-sm">
                                Large ({sizeCounts.large})
                              </label>
                            </div>
                          </div>

                          <DropdownMenuSeparator />

                          {/* Custom size filter */}
                          <div className="p-2">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="custom-size"
                                checked={customSizeEnabled}
                                onCheckedChange={(checked) => setCustomSizeEnabled(!!checked)}
                              />
                              <label htmlFor="custom-size" className="text-sm font-medium">
                                Custom Size
                              </label>
                            </div>

                            {customSizeEnabled && (
                              <div className="mt-2 space-y-2">
                                <div className="flex items-center space-x-2">
                                  <label htmlFor="min-width" className="text-xs w-20">Min Width:</label>
                                  <Input
                                    id="min-width"
                                    type="number"
                                    placeholder="px"
                                    className="h-7 text-xs"
                                    value={minWidth || ''}
                                    onChange={(e) => setMinWidth(e.target.value ? Number(e.target.value) : undefined)}
                                  />
                                </div>
                                <div className="flex items-center space-x-2">
                                  <label htmlFor="min-height" className="text-xs w-20">Min Height:</label>
                                  <Input
                                    id="min-height"
                                    type="number"
                                    placeholder="px"
                                    className="h-7 text-xs"
                                    value={minHeight || ''}
                                    onChange={(e) => setMinHeight(e.target.value ? Number(e.target.value) : undefined)}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Button variant="outline" size="sm" onClick={selectAllImages}>
                        {selectedImages.length === filteredImages.length ? "Deselect All" : "Select All"}
                      </Button>
                      <Button onClick={processSelectedImages} disabled={selectedImages.length === 0}>
                        Process Selected ({selectedImages.length})
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {/* Update to use filteredImages instead of fetchedImages */}
                    {filteredImages.map((imgUrl, index) => (
                      <div
                        key={index}
                        className={`border rounded-lg overflow-hidden cursor-pointer transition-all ${
                          selectedImages.includes(imgUrl) ? "ring-2 ring-primary" : ""
                        }`}
                        onClick={() => toggleImageSelection(imgUrl)}
                      >
                        <div className="relative h-[150px] w-full bg-gray-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getProxiedImageUrl(imgUrl) || "/placeholder.svg"}
                            alt={`Image ${index + 1}`}
                            className="object-contain w-full h-full"
                            onError={(e) => {
                              e.currentTarget.src = "/placeholder.svg?height=150&width=150";
                            }}
                          />
                          {/* Add size badge */}
                          {imageMetadata.find(m => m.url === imgUrl)?.size && (
                            <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                              {imageMetadata.find(m => m.url === imgUrl)?.size}
                              {imageMetadata.find(m => m.url === imgUrl)?.width && imageMetadata.find(m => m.url === imgUrl)?.height &&
                                ` (${imageMetadata.find(m => m.url === imgUrl)?.width}×${imageMetadata.find(m => m.url === imgUrl)?.height})`
                              }
                            </div>
                          )}
                        </div>
                        <div className="p-2 text-xs truncate">
                          {imageMetadata.find(m => m.url === imgUrl)?.filename || imgUrl.split('/').pop() || 'image'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="upload">
              <div className="space-y-4">
                <Alert>
                  <AlertDescription>
                    Upload your images directly to avoid CORS issues. This method works with any image file on your
                    device.
                  </AlertDescription>
                </Alert>

                <div
                  className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-12 cursor-pointer transition-colors ${
                    isDragging 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                      : 'border-border hover:bg-muted'
                  }`}
                  onClick={triggerFileInput}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <Upload className="h-8 w-8 mb-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-1">Click to upload or drag and drop</p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, WEBP, GIF up to 10MB</p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={handleFileUpload}
                  />
                </div>

                <Button
                  onClick={triggerFileInput}
                  className="mt-4"
                  role="button"
                  aria-label="Upload Images"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Images
                </Button>

                {uploadedFiles.length > 0 && (
                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-sm font-medium">Uploaded files:</p>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={deleteAllFiles}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete All Files
                      </Button>
                    </div>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {uploadedFiles.map(({ file, url }) => (
                        <li key={url}>
                          {file.name} ({(file.size / 1024).toFixed(2)} KB)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {error && <p className="text-red-500 mt-4">{error}</p>}

          {/* Hidden canvas for image processing */}
          <canvas
            ref={canvasRef}
            width={1500}
            height={1500}
            style={{ display: 'none' }}
          />

          {/* Logs panel */}
          {/* Removed logs panel section */}

          {processing && (
            <div className="flex items-center justify-center mt-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Processing images...</p>
            </div>
          )}

          {processedImages.length > 0 && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Processed Images ({processedImages.length})</h3>
                {processedImages.length > 1 && (
                  <div className="flex space-x-2">
                    <Button onClick={downloadAllImages} size="sm" variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      Download Individually
                    </Button>
                    <Button onClick={downloadAsZip} size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Download as ZIP
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {processedImages.map((img, index) => (
                  <div key={img.id} className="border rounded-lg overflow-hidden">
                    <div className="relative h-[300px] w-full bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url ? `${img.url}${img.version ? `${img.url.includes("?") ? "&" : "?"}v=${img.version}` : ""}` : "/placeholder.svg"}
                        alt={`Processed image ${index + 1}`}
                        className="object-contain w-full h-full"
                      />
                      {reprocessingIndex === index && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                      )}
                      <Button
                        size="icon"
                        variant="secondary"
                        className="absolute top-2 right-2 h-8 w-8"
                        aria-label={`Remove image ${index + 1}`}
                        disabled={processing || reprocessingIndex !== null}
                        onClick={() => removeProcessedImage(img.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {!img.isPlaceholder && (
                      <div className="px-3 pt-3 space-y-2">
                        <div className="flex items-center space-x-2">
                          <Switch
                            id={`white-bg-${index}`}
                            checked={img.whiteBackground}
                            disabled={processing || reprocessingIndex !== null}
                            onCheckedChange={(checked) => reprocessImage(index, { whiteBackground: checked })}
                          />
                          <Label htmlFor={`white-bg-${index}`} className="text-sm">
                            White background (padded)
                          </Label>
                        </div>
                        {(img.hasWhitePadding || img.trimPadding) && (
                          <div className="flex items-center space-x-2">
                            <Switch
                              id={`trim-padding-${index}`}
                              checked={img.trimPadding}
                              disabled={processing || reprocessingIndex !== null}
                              onCheckedChange={(checked) => reprocessImage(index, { trimPadding: checked })}
                            />
                            <Label htmlFor={`trim-padding-${index}`} className="text-sm">
                              Trim white padding from source
                            </Label>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="p-3 flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Image {index + 1}</span>
                      <div className="flex space-x-2">
                        <Button size="sm" variant="outline" onClick={() => copyImageUrl(img.url)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy URL
                        </Button>
                        <Button size="sm" onClick={() => downloadImage(img.url, index + 1)}>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="text-sm text-muted-foreground">
          All images will be processed to 1500x1500px with appropriate positioning
        </CardFooter>
      </Card>
    </div>
  )
}
