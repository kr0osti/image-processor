"use client";

import { useRef, useState, useMemo } from 'react';
import React from 'react';

// This is fine at module level - it's not a hook
const isBrowser = typeof window !== 'undefined';

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchImagesFromUrl } from "./actions"
import { Loader2, Globe, Upload, TriangleAlert, CircleAlert, Download, Trash2, Filter, ChevronDown, X, Check, Info, Sparkles, ImageIcon, Link2, Copy } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { readSettingsCookie } from "@/lib/settings"
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
  getUpscaleFactor,
  isUpscaled,
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
  // Size of the (possibly trimmed) source that was laid out, and how much it was enlarged
  sourceWidth: number;
  sourceHeight: number;
  upscale: number;
  // Server-side name of the saved file and the token that allows deleting it
  filename: string | null;
  deleteToken: string | null;
}

interface SavedImage {
  url: string;
  filename: string | null;
  deleteToken: string | null;
}

interface ProcessOptions {
  // Force the white-background layout on or off instead of auto-detecting it
  whiteBackground?: boolean;
  // Crop the source to its non-white content before layout
  trimPadding?: boolean;
}

export default function ImageProcessor() {
  const t = useTranslations("Home")
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
          toast.success(t("toasts.urlCopied"))
          addLog("Full image URL copied to clipboard (fallback method)")
        } else {
          toast.error(t("toasts.copyFailed"))
          addLog("Failed to copy URL (fallback method failed)")
        }
      } catch (err) {
        toast.error(t("toasts.copyFailed"))
        addLog(`Error copying URL: ${err}`)
      }
      return
    }

    // Modern clipboard API
    navigator.clipboard.writeText(absoluteUrl)
      .then(() => {
        toast.success(t("toasts.urlCopied"))
        addLog("Full image URL copied to clipboard")
      })
      .catch(err => {
        toast.error(t("toasts.copyFailed"))
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
      setError(t("errors.fetchFailed", { message: errorMessage }))
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
      toast.error(t('toasts.dropImagesOnly'));
      return;
    }

    if (imageFiles.length < allFiles.length) {
      const skippedCount = allFiles.length - imageFiles.length;
      addLog(`Skipped ${skippedCount} non-image file(s)`);
      toast.info(t('toasts.skippedFiles', { count: skippedCount }));
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
  const convertDataUrlToRealUrl = async (dataUrl: string, originalFilename?: string): Promise<SavedImage | null> => {
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
        return { url: data.apiUrl || data.url, filename: data.filename ?? null, deleteToken: data.deleteToken ?? null };
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
    const saved = await convertDataUrlToRealUrl(compressedImage, originalFilename)
    if (saved === null) return null

    return {
      id: nextImageId.current++,
      url: saved.url,
      sourceUrl: imageUrl,
      whiteBackground: result?.whiteBackground ?? false,
      hasWhitePadding: result?.hasWhitePadding ?? false,
      trimPadding: result?.trimmed ?? false,
      isPlaceholder,
      version: 0,
      sourceWidth: result?.sourceWidth ?? 0,
      sourceHeight: result?.sourceHeight ?? 0,
      upscale: result?.upscale ?? 1,
      filename: saved.filename,
      deleteToken: saved.deleteToken,
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
    const lowRes = processed.filter((img) => !img.isPlaceholder && isUpscaled(img.upscale)).length
    if (lowRes > 0) {
      toast.warning(t("toasts.upscaled", { count: lowRes }))
    }
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
        toast.error(t("toasts.reprocessFailed", { index: index + 1 }))
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      addLog(`Error reprocessing image ${index + 1}: ${errorMessage}`)
      toast.error(t("toasts.reprocessFailed", { index: index + 1 }))
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
  ): Promise<{
    dataUrl: string
    whiteBackground: boolean
    hasWhitePadding: boolean
    trimmed: boolean
    sourceWidth: number
    sourceHeight: number
    upscale: number
  } | null> => {
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

        // Padding and detection threshold from the settings page, read fresh for every image
        const settings = readSettingsCookie()

        // Determine if image has white background, unless the user forced it on or off
        const hasWhiteBackground = resolveWhiteBackground(
          options.whiteBackground,
          () => detectWhiteBorder(img, settings.whiteThreshold / 100),
        )
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
        const rect = computeDrawRect(source.width, source.height, hasWhiteBackground, undefined, settings.padding)
        addLog(`Drawing at ${rect.width}x${rect.height}, position: (${rect.x}, ${rect.y})`)
        const upscale = getUpscaleFactor(source.width, source.height, rect)
        if (isUpscaled(upscale)) {
          addLog(`Source ${source.width}x${source.height} is upscaled ${upscale.toFixed(2)}x`)
        }
        ctx.drawImage(img, source.x, source.y, source.width, source.height, rect.x, rect.y, rect.width, rect.height)

        // Convert canvas to data URL
        const dataUrl = canvas.toDataURL("image/png")
        addLog("Image processing completed successfully")
        resolve({
          dataUrl,
          whiteBackground: hasWhiteBackground,
          hasWhitePadding,
          trimmed,
          sourceWidth: source.width,
          sourceHeight: source.height,
          upscale,
        })
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

  const detectWhiteBorder = (img: HTMLImageElement, threshold: number): boolean => {
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
      return isWhiteBackground(whitePixelCount, totalPixels, threshold)
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
      setError(t("errors.zipFailed", { message: errorMessage }))
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

  const deleteAllFiles = async () => {
    // Files this session saved on the server, with the tokens that prove it
    const files = processedImages.flatMap((img) =>
      img.filename && img.deleteToken ? [{ filename: img.filename, token: img.deleteToken }] : [],
    )

    // Clean up object URLs
    revokeBlobUrls(uploadedFiles.map((upload) => upload.url))

    // Reset all file-related state right away; the server delete runs in the background
    setUploadedFiles([])
    setProcessedImages([])
    setFetchedImages([])
    setSelectedImages([])

    if (files.length === 0) {
      addLog("All files cleared")
      return
    }

    try {
      const response = await fetch('/api/images', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.rejected > 0) {
        throw new Error(data.message || `Server responded with ${response.status}`)
      }
      addLog(`Deleted ${data.deleted} files from the server (${data.missing} already gone)`)
      toast.success(t("toasts.filesDeleted", { count: data.deleted + data.missing }))
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      addLog(`Error deleting files from the server: ${errorMessage}`)
      toast.warning(t("toasts.deleteFailed"))
    }
  }

  const processSelectedImages = () => {
    if (selectedImages.length === 0) {
      setError(t("errors.selectImage"))
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

  const busy = processing || reprocessingIndex !== null
  const metaFor = (imgUrl: string) => imageMetadata.find(m => m.url === imgUrl)

  return (
    <main className="relative isolate">
      {/* Decorative backdrop: soft glow + fading dot grid */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] overflow-hidden">
        <div className="absolute left-1/2 top-[-220px] h-[460px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-r from-primary/25 via-fuchsia-500/15 to-sky-400/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(hsl(var(--foreground)/0.07)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
        <section className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {t("badge")}
          </span>
          <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 text-balance text-base text-muted-foreground sm:text-lg">
            {t("subtitle")}
          </p>
        </section>

        <div className="mt-10 rounded-2xl border bg-card/80 p-1.5 shadow-xl shadow-black/[0.04] backdrop-blur-sm dark:shadow-black/40">
          <Tabs defaultValue="upload">
            <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl p-1">
              <TabsTrigger value="upload" className="gap-2 rounded-lg py-2">
                <Upload className="hidden h-4 w-4 sm:block" />
                {t("tabs.upload")}
              </TabsTrigger>
              <TabsTrigger value="webpage" className="gap-2 rounded-lg py-2">
                <Globe className="hidden h-4 w-4 sm:block" />
                {t("tabs.webpage")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-0 p-4 sm:p-6">
              <div
                className={`group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
                  isDragging
                    ? 'border-primary bg-accent'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }`}
                onClick={triggerFileInput}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary/15 to-fuchsia-500/15 text-primary ring-1 ring-primary/20 transition-transform group-hover:scale-105">
                  <Upload className="h-6 w-6" />
                </div>
                <p className="text-base font-medium">{t("upload.dropTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("upload.dropHint")}</p>
                <Button
                  type="button"
                  className="mt-6 rounded-full px-5 shadow-sm shadow-primary/25"
                  onClick={(e) => {
                    e.stopPropagation()
                    triggerFileInput()
                  }}
                >
                  <Upload className="h-4 w-4" />
                  {t("upload.button")}
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                />
              </div>

              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                {t("upload.corsHint")}
              </p>

              {uploadedFiles.length > 0 && (
                <div className="mt-6 animate-fade-in">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">
                      {t("upload.uploadedFiles")} <span className="text-muted-foreground">({uploadedFiles.length})</span>
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={deleteAllFiles}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("deleteAll")}
                    </Button>
                  </div>
                  <ul className="flex flex-wrap gap-2">
                    {uploadedFiles.map(({ file, url }) => (
                      <li
                        key={url}
                        className="inline-flex max-w-full items-center gap-2 rounded-full border bg-muted/50 py-1 pl-2 pr-3 text-xs"
                      >
                        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{file.name}</span>
                        <span className="shrink-0 font-mono text-muted-foreground">{t("upload.fileSize", { size: (file.size / 1024).toFixed(1) })}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </TabsContent>

            <TabsContent value="webpage" className="mt-0 p-4 sm:p-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="url">{t("webpage.urlLabel")}</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                      <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="url"
                        type="url"
                        placeholder="https://example.com/product"
                        className="h-11 rounded-lg pl-9"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" disabled={loading} className="h-11 rounded-lg px-5 shadow-sm shadow-primary/25">
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t("webpage.fetching")}
                        </>
                      ) : (
                        t("webpage.fetch")
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch id="use-custom-base" checked={useCustomBaseUrl} onCheckedChange={setUseCustomBaseUrl} />
                  <Label htmlFor="use-custom-base" className="font-normal">{t("webpage.customBase")}</Label>
                </div>

                {useCustomBaseUrl && (
                  <div className="animate-fade-in space-y-2">
                    <Label htmlFor="base-url">{t("webpage.baseUrlLabel")}</Label>
                    <Input
                      id="base-url"
                      type="url"
                      placeholder="https://example.com"
                      className="h-11 rounded-lg"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                    />
                  </div>
                )}

                <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{t("webpage.corsWarning")}</p>
                </div>
              </form>

              {fetchedImages.length > 0 && (
                <div className="mt-8 animate-fade-in space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold tracking-tight">{t("found.title", { count: fetchedImages.length })}</h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="rounded-full">
                            <Filter className="h-4 w-4" />
                            {t("found.size")}
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 rounded-xl">
                          <DropdownMenuLabel>{t("found.filterTitle")}</DropdownMenuLabel>
                          <DropdownMenuSeparator />

                          <div className="space-y-2 p-2">
                            {(['small', 'medium', 'large'] as const).map((size) => (
                              <div key={size} className="flex items-center gap-2">
                                <Checkbox
                                  id={`size-${size}`}
                                  checked={sizeFilter.includes(size)}
                                  onCheckedChange={() => toggleSizeFilter(size)}
                                />
                                <label htmlFor={`size-${size}`} className="flex flex-1 justify-between text-sm">
                                  {t(`found.sizes.${size}`)}
                                  <span className="font-mono text-muted-foreground">{sizeCounts[size]}</span>
                                </label>
                              </div>
                            ))}
                          </div>

                          <DropdownMenuSeparator />

                          <div className="p-2">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="custom-size"
                                checked={customSizeEnabled}
                                onCheckedChange={(checked) => setCustomSizeEnabled(!!checked)}
                              />
                              <label htmlFor="custom-size" className="text-sm font-medium">
                                {t("found.customSize")}
                              </label>
                            </div>

                            {customSizeEnabled && (
                              <div className="mt-2 space-y-2">
                                <div className="flex items-center gap-2">
                                  <label htmlFor="min-width" className="w-20 text-xs">{t("found.minWidth")}</label>
                                  <Input
                                    id="min-width"
                                    type="number"
                                    placeholder="px"
                                    className="h-8 text-xs"
                                    value={minWidth || ''}
                                    onChange={(e) => setMinWidth(e.target.value ? Number(e.target.value) : undefined)}
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <label htmlFor="min-height" className="w-20 text-xs">{t("found.minHeight")}</label>
                                  <Input
                                    id="min-height"
                                    type="number"
                                    placeholder="px"
                                    className="h-8 text-xs"
                                    value={minHeight || ''}
                                    onChange={(e) => setMinHeight(e.target.value ? Number(e.target.value) : undefined)}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Button variant="outline" size="sm" className="rounded-full" onClick={selectAllImages}>
                        {selectedImages.length === filteredImages.length ? t("found.deselectAll") : t("found.selectAll")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={deleteAllFiles}
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("deleteAll")}
                      </Button>
                      <Button
                        size="sm"
                        className="rounded-full shadow-sm shadow-primary/25"
                        onClick={processSelectedImages}
                        disabled={selectedImages.length === 0}
                      >
                        {t("found.processSelected", { count: selectedImages.length })}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {filteredImages.map((imgUrl, index) => {
                      const meta = metaFor(imgUrl)
                      const selected = selectedImages.includes(imgUrl)
                      return (
                        <button
                          type="button"
                          key={index}
                          aria-pressed={selected}
                          className={`group overflow-hidden rounded-xl border bg-card text-left transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            selected ? "border-primary ring-2 ring-primary" : ""
                          }`}
                          onClick={() => toggleImageSelection(imgUrl)}
                        >
                          <div className="relative aspect-square w-full bg-checkerboard">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={getProxiedImageUrl(imgUrl) || "/placeholder.svg"}
                              alt={t("found.imageAlt", { index: index + 1 })}
                              className="h-full w-full object-contain p-2 transition-transform group-hover:scale-[1.03]"
                              onError={(e) => {
                                e.currentTarget.src = "/placeholder.svg?height=150&width=150";
                              }}
                            />
                            <span
                              aria-hidden="true"
                              className={`absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full border shadow-sm transition-colors ${
                                selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card/90 text-transparent"
                              }`}
                            >
                              <Check className="h-3.5 w-3.5" strokeWidth={3} />
                            </span>
                            {meta?.size && (
                              <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-white backdrop-blur">
                                {meta.size}
                                {meta.width && meta.height && ` · ${meta.width}×${meta.height}`}
                              </span>
                            )}
                          </div>
                          <div className="truncate border-t px-3 py-2 text-xs text-muted-foreground">
                            {meta?.filename || imgUrl.split('/').pop() || 'image'}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {error && (
          <div role="alert" className="mt-6 flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive dark:text-red-300">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Hidden canvas for image processing */}
        <canvas
          ref={canvasRef}
          width={1500}
          height={1500}
          style={{ display: 'none' }}
        />

        {processing && (
          <div role="status" className="mt-8 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {t("processing")}
            </div>
          </div>
        )}

        {processedImages.length > 0 && (
          <section className="mt-12 animate-fade-in">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">{t("processed.title", { count: processedImages.length })}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("processed.subtitle")}</p>
              </div>
              {processedImages.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={downloadAllImages} size="sm" variant="outline" className="rounded-full">
                    <Download className="h-4 w-4" />
                    {t("processed.downloadIndividually")}
                  </Button>
                  <Button onClick={downloadAsZip} size="sm" className="rounded-full shadow-sm shadow-primary/25">
                    <Download className="h-4 w-4" />
                    {t("processed.downloadZip")}
                  </Button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {processedImages.map((img, index) => (
                <article key={img.id} className="group overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-lg">
                  <div className="relative aspect-square w-full bg-checkerboard">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url ? `${img.url}${img.version ? `${img.url.includes("?") ? "&" : "?"}v=${img.version}` : ""}` : "/placeholder.svg"}
                      alt={t("processed.imageAlt", { index: index + 1 })}
                      className="h-full w-full object-contain"
                    />
                    {reprocessingIndex === index && (
                      <div className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-sm">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    )}
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute right-2 top-2 h-8 w-8 rounded-full border bg-card/90 shadow-sm backdrop-blur"
                      aria-label={t("processed.remove", { index: index + 1 })}
                      disabled={busy}
                      onClick={() => removeProcessedImage(img.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <span className="absolute bottom-2 left-2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-white backdrop-blur">
                      #{index + 1}
                    </span>
                    {!img.isPlaceholder && isUpscaled(img.upscale) && (
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-amber-400 px-1.5 py-0.5 text-[11px] font-semibold text-amber-950 shadow-sm">
                        <TriangleAlert className="h-3 w-3" />
                        {t("processed.lowResBadge")}
                      </span>
                    )}
                  </div>
                  {!img.isPlaceholder && isUpscaled(img.upscale) && (
                    <div
                      role="note"
                      className="flex gap-2 border-t border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200"
                    >
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <p>
                        {t.rich(img.whiteBackground ? "processed.lowResNotePadded" : "processed.lowResNote", {
                          width: img.sourceWidth,
                          height: img.sourceHeight,
                          factor: img.upscale.toFixed(1),
                          mono: (chunks) => <span className="font-mono">{chunks}</span>,
                        })}
                      </p>
                    </div>
                  )}
                  {!img.isPlaceholder && (
                    <div className="space-y-3 border-t px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor={`white-bg-${index}`} className="text-sm font-normal">
                          {t("processed.whiteBackground")}
                        </Label>
                        <Switch
                          id={`white-bg-${index}`}
                          checked={img.whiteBackground}
                          disabled={busy}
                          onCheckedChange={(checked) => reprocessImage(index, { whiteBackground: checked })}
                        />
                      </div>
                      {(img.hasWhitePadding || img.trimPadding) && (
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor={`trim-padding-${index}`} className="text-sm font-normal">
                            {t("processed.trimPadding")}
                          </Label>
                          <Switch
                            id={`trim-padding-${index}`}
                            checked={img.trimPadding}
                            disabled={busy}
                            onCheckedChange={(checked) => reprocessImage(index, { trimPadding: checked })}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 border-t p-3">
                    <Button size="sm" variant="outline" className="flex-1 rounded-lg" onClick={() => copyImageUrl(img.url)}>
                      <Copy className="h-4 w-4" />
                      {t("processed.copyUrl")}
                    </Button>
                    <Button size="sm" className="flex-1 rounded-lg" onClick={() => downloadImage(img.url, index + 1)}>
                      <Download className="h-4 w-4" />
                      {t("processed.download")}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-16 text-center text-xs text-muted-foreground">
          {t("footer")}
        </footer>
      </div>
    </main>
  )
}
