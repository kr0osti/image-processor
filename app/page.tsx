"use client";

import { useRef, useState, useEffect } from 'react';
import React from 'react';

// This is fine at module level - it's not a hook
const isBrowser = typeof window !== 'undefined';

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchImagesFromUrl } from "./actions"
import { Loader2, Globe, Upload, AlertTriangle, Info, Download, Trash2, Filter, ChevronDown } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Toggle } from "@/components/ui/toggle"
import JSZip from "jszip"
import { Check } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { ImageMetadata } from "./actions"
import { Checkbox } from "@/components/ui/checkbox"
import { Copy } from "lucide-react"
import { toast } from "sonner"

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

export default function ImageProcessor() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState("")
  const [baseUrl, setBaseUrl] = useState("https://zhik.com")
  const [useCustomBaseUrl, setUseCustomBaseUrl] = useState(false)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [processedImages, setProcessedImages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState("")
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [fetchedImages, setFetchedImages] = useState<string[]>([])
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [imageMetadata, setImageMetadata] = useState<ImageMetadata[]>([])
  const [sizeFilter, setSizeFilter] = useState<('small' | 'medium' | 'large' | 'unknown')[]>(['large'])
  const [filteredImages, setFilteredImages] = useState<string[]>([])
  const [minWidth, setMinWidth] = useState<number | undefined>(undefined)
  const [minHeight, setMinHeight] = useState<number | undefined>(undefined)
  const [customSizeEnabled, setCustomSizeEnabled] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  /**
   * Copies an image URL to the clipboard
   *
   * @param {string} dataUrl - The URL of the image to copy
   * @returns {void}
   */
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

  // Add this effect to update filtered images when size filter changes
  /**
   * Effect hook to update filtered images based on size criteria
   * 
   * This effect runs when the fetchedImages, imageMetadata, sizeFilter, minWidth, minHeight, or customSizeEnabled state changes.
   * It filters the images based on the selected size criteria and custom dimensions if enabled.
   * The filtered results are then set to the filteredImages state and a log message is added.
   * 
   * @effect
   * @dependencies [fetchedImages, imageMetadata, sizeFilter, minWidth, minHeight, customSizeEnabled]
   */
  useEffect(() => {
    if (fetchedImages.length > 0 && imageMetadata.length > 0) {
      const filtered = imageMetadata
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

      setFilteredImages(filtered)
      addLog(`Filtered to ${filtered.length} images based on size criteria`)
    } else {
      setFilteredImages(fetchedImages)
    }
  }, [fetchedImages, imageMetadata, sizeFilter, minWidth, minHeight, customSizeEnabled])

  /**
   * Effect hook to process images when imageUrls change
   * 
   * This effect runs whenever the imageUrls state is updated.
   * If there are any image URLs in the array, it triggers the processImages function.
   * 
   * @effect
   * @dependencies [imageUrls]
   */
  useEffect(() => {
    if (imageUrls.length > 0) {
      processImages(imageUrls)
    }
  }, [imageUrls])

  /**
   * Adds a log message to the console when debug mode is enabled
   *
   * @param {string} message - The message to log
   * @returns {void}
   */
  const addLog = (message: string) => {
    // Check if DEBUG is enabled - add more explicit logging to debug the issue
    console.log(`Debug setting: ${process.env.NEXT_PUBLIC_DEBUG}`)

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log(`[${new Date().toLocaleTimeString()}] ${message}`)
    }
  }

  /**
   * Handles the form submission to fetch images from a URL
   *
   * @param {React.FormEvent} e - The form submission event
   * @returns {Promise<void>}
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return

    setLoading(true)
    setError("")
    setProcessedImages([])
    setLogs([])
    setFetchedImages([])
    setFilteredImages([])
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
        setFilteredImages(result.imageUrls)

        // Load images to determine their sizes
        addLog("Loading images to determine sizes...")
        loadImageSizes(result.imageUrls)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred"
      setError(`An error occurred while fetching the images: ${errorMessage}`)
      addLog(`Exception: ${errorMessage}`)
      console.error(err)
    } finally {
      setLoading(false)
    }
  }


  /**
   * Processes an HTML image tag to create a placeholder image
   *
   * This function takes an HTML image element and its dimensions, creates a canvas-based
   * placeholder image with the same dimensions (up to a maximum size), and includes
   * relevant information such as dimensions, alt text, and source URL.
   *
   * @param {HTMLImageElement} imgElement - The HTML image element to process
   * @param {number} width - The width of the image
   * @param {number} height - The height of the image
   * @returns {void}
   */
  const processHtmlImageTag = (imgElement: HTMLImageElement, width: number, height: number) => {
    addLog("Creating placeholder image from HTML tag dimensions")

    // Get the canvas
    const canvas = canvasRef.current
    if (!canvas) {
      addLog("Canvas reference not available")
      return
    }

    // Set canvas size to match the image dimensions with a reasonable max size
    const maxDimension = 1000
    const scale = Math.min(1, maxDimension / Math.max(width, height))
    canvas.width = width * scale
    canvas.height = height * scale

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      addLog("Failed to get canvas context")
      return
    }

    // Draw a placeholder with the image dimensions
    ctx.fillStyle = "#f0f0f0" // Light gray background
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Add a border
    ctx.strokeStyle = "#cccccc"
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, canvas.width, canvas.height)

    // Add text with dimensions
    ctx.fillStyle = "#666666"
    ctx.font = "14px Arial"
    ctx.textAlign = "center"
    ctx.fillText(`Image Placeholder (${width}x${height})`, canvas.width / 2, canvas.height / 2 - 10)

    // Add alt text if available
    const alt = imgElement.getAttribute("alt")
    if (alt) {
      ctx.font = "12px Arial"
      ctx.fillText(
        `Alt: ${alt.substring(0, 50)}${alt.length > 50 ? "..." : ""}`,
        canvas.width / 2,
        canvas.height / 2 + 20,
      )
    }

    // Add source URL if available
    const src = imgElement.getAttribute("src")
    if (src) {
      ctx.font = "10px Arial"
      const displaySrc = src.length > 40 ? src.substring(0, 37) + "..." : src
      ctx.fillText(displaySrc, canvas.width / 2, canvas.height / 2 + 40)
    }

    // Convert to data URL and process
    const dataUrl = canvas.toDataURL("image/png")
    addLog("Created placeholder image from HTML tag")

    // Process this image
    processPlaceholderImage(dataUrl, width, height)
  }

  /**
   * Creates a placeholder image for failed image loads
   *
   * Generates a visual placeholder with an image icon, filename, and error information
   * when an image fails to load due to CORS or access restrictions.
   *
   * @param {string} imageUrl - The URL of the image that failed to load
   * @returns {Promise<string>} A Promise that resolves to a data URL of the generated placeholder image
   */
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

  /**
   * Processes a placeholder image to fit the standard 1500x1500 canvas
   *
   * Takes a data URL of a placeholder image and renders it on the canvas with proper
   * positioning based on the original image dimensions (portrait, landscape, or square).
   *
   * @param {string} dataUrl - The data URL of the placeholder image
   * @param {number} width - The original width of the image
   * @param {number} height - The original height of the image
   * @returns {void}
   */
  const processPlaceholderImage = (dataUrl: string, width: number, height: number) => {
    // Create a new canvas for the final 1500x1500 image
    const canvas = canvasRef.current
    if (!canvas) {
      addLog("Canvas reference not available")
      return
    }

    // Set canvas size to 1500x1500
    canvas.width = 1500
    canvas.height = 1500
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      addLog("Failed to get canvas context")
      return
    }

    // Fill canvas with white background
    ctx.fillStyle = "white"
    ctx.fillRect(0, 0, 1500, 1500)

    // Create an image from the data URL
    const img = new Image()
    img.onload = () => {
      // Determine if image is portrait, landscape, or square based on original dimensions
      const isPortrait = height > width
      const isLandscape = width > height
      const isSquare = width === height

      addLog(
        `Processing placeholder with orientation: ${isPortrait ? "portrait" : isLandscape ? "landscape" : "square"}`,
      )

      if (isSquare) {
        // Square image
        ctx.drawImage(img, 0, 0, 1500, 1500)
      } else if (isLandscape) {
        // Landscape image - take full width
        const newHeight = (img.height * 1500) / img.width
        const y = (1500 - newHeight) / 2
        ctx.drawImage(img, 0, y, 1500, newHeight)
      } else {
        // Portrait image - take full height
        const newWidth = (img.width * 1500) / img.height
        const x = (1500 - newWidth) / 2
        ctx.drawImage(img, x, 0, newWidth, 1500)
      }

      // Convert canvas to data URL
      const finalDataUrl = canvas.toDataURL("image/png")
      addLog("Placeholder image processing completed successfully")
      setProcessedImages([finalDataUrl])
    }

    img.src = dataUrl
  }

  /**
   * Handles file upload from the input element
   *
   * @param {React.ChangeEvent<HTMLInputElement>} e - The file input change event
   * @returns {void}
   */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files)
      setUploadedFiles(files)
      setProcessedImages([])
      setLogs([])

      addLog(`Uploaded ${files.length} file(s)`)
      files.forEach((file) => {
        addLog(`File: ${file.name}, Size: ${(file.size / 1024).toFixed(2)} KB, Type: ${file.type}`)
      })

      // Process uploaded files
      const fileUrls = files.map((file) => URL.createObjectURL(file))
      addLog(`Created object URLs for ${fileUrls.length} files`)
      setImageUrls(fileUrls)
    }
  }

  const triggerFileInput = () => {
    if (fileInputRef && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }

  /**
   * Resolves a relative URL to an absolute URL using a base URL
   *
   * @param {string} url - The URL to resolve (can be relative or absolute)
   * @param {string} base - The base URL to use for resolving relative URLs
   * @returns {string} The resolved absolute URL
   */
  const resolveUrl = (url: string, base: string): string => {
    try {
      // If it's already an absolute URL, return it
      if (url.startsWith("http")) {
        return url
      }

      // Handle relative URLs
      return new URL(url, base).toString()
    } catch (e) {
      addLog(`Error resolving URL ${url} with base ${base}: ${e}`)
      return url
    }
  }

  /**
   * Converts a data URL to a real URL by sending it to the server
   * 
   * @param {string} dataUrl - The data URL to convert
   * @returns {Promise<string | null>} A promise that resolves to the real URL or null if conversion fails
   */
  const convertDataUrlToRealUrl = async (dataUrl: string): Promise<string | null> => {
    try {
      const response = await fetch('/api/images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dataUrl }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        // Return the API URL which should work more reliably
        return data.apiUrl || data.url;
      } else {
        throw new Error(data.message || 'Failed to save image');
      }
    } catch (error) {
      console.error('Error converting data URL to real URL:', error);
      return null;
    }
  }

  /**
   * Processes a list of image URLs, converting them to 1500x1500 images
   *
   * @param {string[]} urls - Array of image URLs to process
   * @returns {Promise<void>}
   */
  const processImages = async (urls: string[]) => {
    setProcessing(true)
    addLog(`Starting to process ${urls.length} images`)
    const processed: string[] = []

    for (const [index, imageUrl] of urls.entries()) {
      try {
        addLog(`Processing image ${index + 1}: ${imageUrl}`)
        let processedImage = await processImageWithCanvas(imageUrl)

        // If image processing failed, create a placeholder
        if (!processedImage) {
          addLog(`Creating placeholder for failed image ${index + 1}`)
          const placeholderDataUrl = await createPlaceholderForFailedImage(imageUrl)
          if (placeholderDataUrl) {
            // Process the placeholder with the same rules
            processedImage = await processPlaceholderAsImage(placeholderDataUrl)
            addLog(`Successfully created and processed placeholder for image ${index + 1}`)
          }
        }

        if (processedImage) {
          // Convert data URL to real URL
          const realUrl = await convertDataUrlToRealUrl(processedImage)
          if (realUrl !== null) {
            processed.push(realUrl)
            addLog(`Successfully processed image ${index + 1}`)
          } else {
            addLog(`Failed to process image ${index + 1}`)
          }
        }
      } catch (error) {
        addLog(`Error processing image ${index + 1}: ${error}`)
      }
    }

    addLog(`Completed processing. Successfully processed ${processed.length} of ${urls.length} images`)
    setProcessedImages(processed)
    setProcessing(false)

    // Clean up object URLs when done
    if (uploadedFiles.length > 0) {
      urls.forEach((url) => {
        if (url.startsWith("blob:")) {
          URL.revokeObjectURL(url)
        }
      })
      addLog("Cleaned up object URLs")
    }
  }

  /**
   * Processes a placeholder image to fit the standard 1500x1500 canvas
   *
   * @param {string} dataUrl - The data URL of the placeholder image to process
   * @returns {Promise<string | null>} A Promise that resolves to the processed image's data URL, or null if processing failed
   */
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

  /**
   * Returns a proxied URL for the given image URL
   * 
   * This function checks if the provided URL is a remote URL that needs to be proxied.
   * It returns the original URL for data URLs and blob URLs, and a proxied URL for remote URLs.
   * 
   * @param {string} imageUrl - The original image URL
   * @returns {string} The proxied URL or the original URL if no proxy is needed
   */
  const getProxiedImageUrl = (imageUrl: string): string => {
    // Only proxy remote URLs, not data URLs or object URLs
    if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
      return imageUrl;
    }

    // Use our proxy API route
    return `/api/proxy?url=${encodeURIComponent(imageUrl)}`;
  };

  /**
   * Processes an image to standardize its size and format for the catalog
   *
   * This function loads an image from a URL, detects if it has a white background,
   * and resizes/positions it on a 1500x1500 canvas with appropriate padding.
   * Different processing is applied based on the image's aspect ratio and background.
   *
   * The function handles:
   * - CORS issues with cross-origin images
   * - Timeout for images that fail to load
   * - Different processing for images with/without white backgrounds
   * - Different processing for square, landscape, and portrait images
   *
   * @param {string} imageUrl - The URL of the image to process
   * @returns {Promise<string | null>} A Promise that resolves to the processed image's data URL, or null if processing failed
   */
  const processImageWithCanvas = (imageUrl: string): Promise<string | null> => {
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

        // Determine if image has white background
        const hasWhiteBackground = detectWhiteBorder(img, ctx)
        addLog(`Image background detection: ${hasWhiteBackground ? "White background" : "No white background"}`)

        // Process image based on orientation and background
        if (hasWhiteBackground) {
          // For small objects on white backgrounds, use more padding
          // Calculate the actual object size by estimating non-white area
          const objectSize = Math.max(img.width, img.height)
          const padding = 300 // Increased padding for small objects
          const maxSize = 1500 - (padding * 2)

          // Scale the image to fit within the padded area
          const scale = maxSize / objectSize
          const newWidth = img.width * scale
          const newHeight = img.height * scale
          const x = (1500 - newWidth) / 2
          const y = (1500 - newHeight) / 2

          addLog(`Resizing with padding: ${newWidth}x${newHeight}, position: (${x}, ${y})`)
          ctx.drawImage(img, x, y, newWidth, newHeight)
        } else {
          // For images without white background
          if (img.width === img.height) {
            // Square image
            addLog("Processing as square image")
            ctx.drawImage(img, 0, 0, 1500, 1500)
          } else if (img.width > img.height) {
            // Landscape image - take full width
            const newHeight = (img.height * 1500) / img.width
            const y = (1500 - newHeight) / 2
            addLog(`Processing as landscape image: 1500x${newHeight}, y-offset: ${y}`)
            ctx.drawImage(img, 0, y, 1500, newHeight)
          } else {
            // Portrait image - take full height
            const newWidth = (img.width * 1500) / img.height
            const x = (1500 - newWidth) / 2
            addLog(`Processing as portrait image: ${newWidth}x1500, x-offset: ${x}`)
            ctx.drawImage(img, x, 0, newWidth, 1500)
          }
        }

        // Convert canvas to data URL
        const dataUrl = canvas.toDataURL("image/png")
        addLog("Image processing completed successfully")
        resolve(dataUrl)
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

  /**
   * Detects if an image has a predominantly white background
   *
   * This function analyzes an image to determine if it has a white background by
   * sampling pixels from various regions of the image (edges and center). It creates
   * a temporary canvas to perform the analysis without modifying the original image.
   *
   * The detection works by:
   * 1. Creating a temporary canvas with the same dimensions as the image
   * 2. Sampling pixels from the edges and center of the image
   * 3. Counting pixels that are either white (RGB > 240) or transparent (alpha < 50)
   * 4. Calculating the ratio of white pixels to total sampled pixels
   * 5. Considering the image to have a white background if more than 85% of pixels are white
   *
   * @param {HTMLImageElement} img - The image element to analyze
   * @param {CanvasRenderingContext2D} ctx - The canvas context (not used in the function but kept for API consistency)
   * @returns {boolean} True if the image has a white background, false otherwise
   */
  const detectWhiteBorder = (img: HTMLImageElement, ctx: CanvasRenderingContext2D): boolean => {
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

      // Sample more pixels from the edges for better detection
      const sampleSize = Math.max(10, Math.floor(Math.min(img.width, img.height) * 0.05))

      // Check if the image has a predominantly white background
      // Sample pixels from various parts of the image, not just the edges
      let whitePixelCount = 0
      let totalPixels = 0

      // Sample from edges and interior
      const regions = [
        // Edges
        { x: 0, y: 0, width: img.width, height: sampleSize }, // top
        { x: 0, y: img.height - sampleSize, width: img.width, height: sampleSize }, // bottom
        { x: 0, y: sampleSize, width: sampleSize, height: img.height - (2 * sampleSize) }, // left
        { x: img.width - sampleSize, y: sampleSize, width: sampleSize, height: img.height - (2 * sampleSize) }, // right

        // Sample from center area too
        { x: img.width * 0.25, y: img.height * 0.25, width: img.width * 0.5, height: img.height * 0.5 }
      ]

      for (const region of regions) {
        const imageData = tempCtx.getImageData(region.x, region.y, region.width, region.height)
        const data = imageData.data

        for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel for performance
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const a = data[i + 3]

          // Consider transparent pixels as white too
          if ((r > 240 && g > 240 && b > 240) || a < 50) {
            whitePixelCount++
          }
          totalPixels++
        }
      }

      // If more than 85% of sampled pixels are white, consider it has a white background
      const whiteRatio = whitePixelCount / totalPixels
      addLog(`Background detection: ${whitePixelCount}/${totalPixels} white pixels (${(whiteRatio * 100).toFixed(2)}%)`)

      // For small objects on white backgrounds, we need a higher threshold
      return whiteRatio > 0.85
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      addLog(`Error in background detection: ${errorMessage}`)
      console.error("Error detecting white background:", error)
      return false
    }
  }

  /**
   * Downloads a processed image to the user's device
   *
   * Creates a temporary anchor element, sets its href to the data URL,
   * and triggers a download with a filename based on the index.
   *
   * @param {string} dataUrl - The data URL of the image to download
   * @param {number} index - The index of the image (used for filename)
   * @returns {void}
   */
  const downloadImage = (dataUrl: string, index: number) => {
    const link = document.createElement("a")
    link.href = dataUrl
    link.download = `processed-image-${index}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    addLog(`Downloaded image ${index}`)
  }

  /**
   * Downloads all processed images individually
   * 
   * This function iterates through all processed images and triggers a download for each one.
   * Downloads are staggered with a 500ms delay between each to prevent overwhelming the browser.
   * 
   * @returns {void}
   */
  const downloadAllImages = () => {
    if (processedImages.length === 0) return

    addLog(`Downloading all ${processedImages.length} processed images`)
    processedImages.forEach((img, index) => {
      setTimeout(() => {
        downloadImage(img, index + 1)
      }, index * 500) // Stagger downloads to prevent browser issues
    })
  }

  /**
   * Creates and downloads a zip file containing all processed images
   *
   * Converts all processed image data URLs to blobs, adds them to a zip file,
   * and triggers a download of the combined archive. This is more efficient
   * than downloading multiple individual files, especially for larger sets of images.
   *
   * The function handles data URL parsing, blob creation, zip file generation,
   * and browser download triggering. It also manages processing state and error handling.
   *
   * @returns {Promise<void>} A promise that resolves when the zip file has been created and download initiated
   */
  const downloadAsZip = async () => {
    if (processedImages.length === 0) return

    addLog(`Creating zip file with ${processedImages.length} processed images`)
    setProcessing(true)

    try {
      const zip = new JSZip()

      // Add each image to the zip
      processedImages.forEach((dataUrl, index) => {
        // Convert data URL to blob
        const imageData = dataUrl.split(",")[1]
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

        const blob = new Blob(byteArrays, { type: "image/png" })

        // Add to zip with a filename
        zip.file(`processed-image-${index + 1}.png`, blob)
      })

      // Generate the zip file
      const content = await zip.generateAsync({ type: "blob" })

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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      addLog(`Error creating zip file: ${errorMessage}`)
      setError(`Failed to create zip file: ${errorMessage}`)
    } finally {
      setProcessing(false)
    }
  }

  /**
   * Deletes all files and resets related state
   * 
   * This function performs the following actions:
   * 1. Cleans up object URLs to prevent memory leaks
   * 2. Resets all file-related state variables
   * 3. Logs the deletion action
   * 
   * @returns {void}
   */
  const deleteAllFiles = () => {
    // Clean up object URLs
    imageUrls.forEach((url) => {
      if (url.startsWith("blob:")) {
        URL.revokeObjectURL(url)
      }
    })

    // Reset all file-related state
    setUploadedFiles([])
    setImageUrls([])
    setProcessedImages([])
    setFetchedImages([])
    setSelectedImages([])

    addLog("All files deleted")
  }

  /**
   * Processes the selected images
   * 
   * This function checks if any images are selected, sets an error if none are,
   * and processes the selected images by updating the imageUrls state.
   * It also logs the number of images being processed.
   * 
   * @returns {void}
   */
  const processSelectedImages = () => {
    if (selectedImages.length === 0) {
      setError("Please select at least one image to process")
      addLog("No images selected for processing")
      return
    }

    addLog(`Processing ${selectedImages.length} selected images`)
    setImageUrls(selectedImages)
  }

  /**
   * Toggles the selection state of an individual image
   *
   * When an image is clicked, this function either adds it to the selection
   * if it wasn't already selected, or removes it from the selection if it was.
   * This allows users to build a custom selection of images for processing.
   *
   * @param {string} imageUrl - The URL of the image to toggle selection for
   * @returns {void}
   */
  const toggleImageSelection = (imageUrl: string) => {
    setSelectedImages((prev) =>
      prev.includes(imageUrl) ? prev.filter((url) => url !== imageUrl) : [...prev, imageUrl],
    )
  }

  /**
   * Toggles selection of all filtered images
   *
   * When called, this function either selects all currently filtered images
   * or deselects all images if all filtered images are already selected.
   * This provides a convenient way for users to quickly select or deselect
   * all images that match their current filter criteria.
   *
   * @returns {void}
   */
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

  /**
   * Categorizes an image into size categories based on dimensions
   *
   * Analyzes the width and height of an image and classifies it into one of three
   * size categories: small, medium, or large. This classification is used for filtering
   * and organizing images in the UI.
   *
   * The size categories are determined as follows:
   * - Small: Area < 90,000 pixels (e.g., 300x300 or smaller)
   * - Medium: Area between 90,000 and 360,000 pixels
   * - Large: Area > 360,000 pixels (e.g., 600x600 or larger)
   *
   * @param {number} [width] - The width of the image in pixels
   * @param {number} [height] - The height of the image in pixels
   * @returns {'small' | 'medium' | 'large' | 'unknown'} The size category of the image
   */
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
  /**
   * Loads and determines the sizes of images from given URLs
   * 
   * This function iterates through an array of image URLs, loads each image,
   * determines its size category, and updates the imageMetadata state with
   * the width, height, and size category of each image.
   * 
   * It also keeps track of how many images have been loaded and logs a summary
   * of image sizes once all images have been processed.
   * 
   * @param {string[]} urls - An array of image URLs to process
   */
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
            const counts = {
              small: updated.filter(m => m.size === 'small').length,
              medium: updated.filter(m => m.size === 'medium').length,
              large: updated.filter(m => m.size === 'large').length,
              unknown: updated.filter(m => m.size === 'unknown').length
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
  /**
   * Toggles the size filter for image selection
   * 
   * This function updates the sizeFilter state by either adding or removing
   * the specified size. If the size is already in the filter, it is removed;
   * otherwise, it is added.
   * 
   * @param {('small' | 'medium' | 'large' | 'unknown')} size - The size category to toggle
   * @returns {void}
   */
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
          <CardTitle>Image Processor</CardTitle>
          <CardDescription>Download and proccess images to 1500x1500px with appropriate positioning</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="webpage">
            <TabsList className="mb-4">
              <TabsTrigger value="webpage">
                <Globe className="mr-2 h-4 w-4" />
                From Webpage
              </TabsTrigger>
              <TabsTrigger value="upload">
                <Upload className="mr-2 h-4 w-4" />
                Upload Images
              </TabsTrigger>
            </TabsList>

            <TabsContent value="webpage">
              <form onSubmit={handleSubmit} className="space-y-4">
                <Alert>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  <AlertDescription>
                    Images from websites may be protected by CORS. The app will create placeholders for images that
                    can't be loaded directly.
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
                                Small ({imageMetadata.filter(m => m.size === 'small').length})
                              </label>
                            </div>

                            <div className="flex items-center space-x-2 mb-2">
                              <Checkbox
                                id="size-medium"
                                checked={sizeFilter.includes('medium')}
                                onCheckedChange={() => toggleSizeFilter('medium')}
                              />
                              <label htmlFor="size-medium" className="text-sm">
                                Medium ({imageMetadata.filter(m => m.size === 'medium').length})
                              </label>
                            </div>

                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="size-large"
                                checked={sizeFilter.includes('large')}
                                onCheckedChange={() => toggleSizeFilter('large')}
                              />
                              <label htmlFor="size-large" className="text-sm">
                                Large ({imageMetadata.filter(m => m.size === 'large').length})
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
                  className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-12 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={triggerFileInput}
                >
                  <Upload className="h-8 w-8 mb-4 text-gray-400" />
                  <p className="text-sm text-gray-500 mb-1">Click to upload or drag and drop</p>
                  <p className="text-xs text-gray-400">PNG, JPG, WEBP, GIF up to 10MB</p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={handleFileUpload}
                  />
                </div>

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
                    <ul className="text-sm text-gray-500 space-y-1">
                      {uploadedFiles.map((file, index) => (
                        <li key={index}>
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
                  <div key={index} className="border rounded-lg overflow-hidden">
                    <div className="relative h-[300px] w-full bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img || "/placeholder.svg"}
                        alt={`Processed image ${index + 1}`}
                        className="object-contain w-full h-full"
                      />
                    </div>
                    <div className="p-3 flex justify-between items-center">
                      <span className="text-sm text-gray-500">Image {index + 1}</span>
                      <div className="flex space-x-2">
                        <Button size="sm" variant="outline" onClick={() => copyImageUrl(img)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy URL
                        </Button>
                        <Button size="sm" onClick={() => downloadImage(img, index + 1)}>
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
        <CardFooter className="text-sm text-gray-500">
          All images will be processed to 1500x1500px with appropriate positioning
        </CardFooter>
      </Card>
    </div>
  )
}
