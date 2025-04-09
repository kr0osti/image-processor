"use server"

import * as cheerio from "cheerio"

// Add this interface to define image metadata
export interface ImageMetadata {
  url: string;
  width?: number;
  height?: number;
  size?: 'small' | 'medium' | 'large' | 'unknown';
  estimatedFileSize?: string;
  filename: string;
}

export async function fetchImagesFromUrl(url: string, customBaseUrl?: string) {
  const logs: string[] = []
  const imageMetadata: ImageMetadata[] = []

  try {
    logs.push(`Starting to fetch URL: ${url}`)

    // Determine base URL for resolving relative paths
    let baseUrl: string
    try {
      baseUrl = customBaseUrl || new URL(url).origin
      logs.push(`Using base URL: ${baseUrl}`)
    } catch (e) {
      logs.push(`Error parsing URL: ${e}. Using URL as is.`)
      baseUrl = url
    }

    // Fetch the HTML content from the URL
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1"
      },
    })

    logs.push(`Response status: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      return {
        error: `Failed to fetch URL: ${response.statusText} (${response.status})`,
        logs,
      }
    }

    const html = await response.text()
    logs.push(`HTML content length: ${html.length} characters`)

    if (html.length < 100) {
      logs.push(`Warning: Very short HTML content: ${html}`)
    }

    // Parse HTML to extract image URLs
    const $ = cheerio.load(html)
    const imageUrls: string[] = []

    // Look for standard img tags
    logs.push("Searching for <img> tags...")
    $("img").each((_, element) => {
      const src = $(element).attr("src")
      const dataSrc = $(element).attr("data-src")
      const srcset = $(element).attr("srcset")
      const alt = $(element).attr("alt") || "no-alt"

      logs.push(
        `Found img tag: alt="${alt}", src=${src ? "yes" : "no"}, data-src=${dataSrc ? "yes" : "no"}, srcset=${srcset ? "yes" : "no"}`,
      )

      if (src) {
        addImageUrl(src, baseUrl, imageUrls, logs)
      }

      // Check for lazy-loaded images
      if (dataSrc) {
        addImageUrl(dataSrc, baseUrl, imageUrls, logs)
      }

      // Handle srcset if present
      if (srcset) {
        const srcsetUrls = srcset
          .split(",")
          .map((s) => s.trim().split(" ")[0])
          .filter(Boolean)
        for (const srcsetUrl of srcsetUrls) {
          addImageUrl(srcsetUrl, baseUrl, imageUrls, logs)
        }
      }
    })

    // Look for background images in style attributes
    logs.push("Searching for background images in style attributes...")
    $("[style*='background']").each((_, element) => {
      const style = $(element).attr("style") || ""
      const matches = style.match(/url$$['"]?([^'"()]+)['"]?$$/g)

      if (matches) {
        logs.push(`Found background image in style: ${style}`)
        matches.forEach((match) => {
          const bgUrl = match.replace(/url$$['"]?([^'"()]+)['"]?$$/, "$1")
          addImageUrl(bgUrl, baseUrl, imageUrls, logs)
        })
      }
    })

    // Look for picture elements with source tags
    logs.push("Searching for <picture> elements...")
    $("picture source").each((_, element) => {
      const srcset = $(element).attr("srcset")
      if (srcset) {
        logs.push(`Found picture source with srcset: ${srcset}`)
        const srcsetUrls = srcset
          .split(",")
          .map((s) => s.trim().split(" ")[0])
          .filter(Boolean)
        for (const srcsetUrl of srcsetUrls) {
          addImageUrl(srcsetUrl, baseUrl, imageUrls, logs)
        }
      }
    })

    if (imageUrls.length === 0) {
      logs.push("No images found on the page")
      return { error: "No images found on the page", logs }
    }

    // Create metadata for each image
    imageUrls.forEach((url, index) => {
      const filename = url.split("/").pop()?.split("?")[0] || `image-${index + 1}`
      imageMetadata.push({
        url,
        size: 'unknown', // Will be determined client-side after loading
        filename
      })
    })

    logs.push(`Found ${imageUrls.length} unique images`)
    return { imageUrls, imageMetadata, logs }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    logs.push(`Error in fetchImagesFromUrl: ${errorMessage}`)
    console.error("Error in fetchImagesFromUrl:", error)
    return { error: `Failed to fetch images from the URL: ${errorMessage}`, logs }
  }
}

function addImageUrl(src: string, baseUrl: string, imageUrls: string[], logs: string[]) {
  try {
    // Skip data URLs and SVGs
    if (src.startsWith("data:") || src.endsWith(".svg")) {
      logs.push(`Skipping ${src.startsWith("data:") ? "data URL" : "SVG"}: ${src.substring(0, 30)}...`)
      return
    }

    let fullUrl: string

    // Handle relative URLs
    if (src.startsWith("/")) {
      try {
        const urlObj = new URL(baseUrl)
        fullUrl = `${urlObj.origin}${src}`
        logs.push(`Converted relative URL: ${src} -> ${fullUrl}`)
      } catch (e) {
        logs.push(`Invalid base URL for relative path: ${baseUrl}, ${e}`)
        return
      }
    } else if (!src.startsWith("http")) {
      // Handle URLs that don't start with http
      try {
        fullUrl = new URL(src, baseUrl).toString()
        logs.push(`Converted relative URL: ${src} -> ${fullUrl}`)
      } catch (e) {
        logs.push(`Invalid URL combination: ${baseUrl} + ${src}, ${e}`)
        return
      }
    } else {
      fullUrl = src
    }

    // Check if it's a valid image URL (common image extensions)
    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff"]
    const hasImageExtension = imageExtensions.some((ext) => fullUrl.toLowerCase().includes(ext))

    if (!hasImageExtension) {
      // If no extension, check if URL contains image-related paths
      const imageKeywords = ["image", "img", "photo", "picture", "asset"]
      const containsImageKeyword = imageKeywords.some((keyword) => fullUrl.toLowerCase().includes(keyword))

      if (!containsImageKeyword) {
        logs.push(`Skipping URL without image extension or keyword: ${fullUrl}`)
        return
      }
    }

    // Add to the list if not already present
    if (!imageUrls.includes(fullUrl)) {
      imageUrls.push(fullUrl)
      logs.push(`Added image URL: ${fullUrl}`)
    } else {
      logs.push(`Skipping duplicate URL: ${fullUrl}`)
    }
  } catch (error) {
    logs.push(`Error processing URL ${src}: ${error}`)
  }
}
