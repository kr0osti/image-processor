// Compressed PNG encoding for processed images, using UPNG.js: lossless
// deflate optimisation at quality 100, otherwise colour quantization to a
// palette (the technique TinyPNG/pngquant use), which typically shrinks
// product shots on white several times over.

export const LOSSLESS_QUALITY = 100

/**
 * Palette size for a quality setting (1-100): 0 means lossless full colour,
 * otherwise 2-256 colours, scaling linearly with the quality.
 */
export const paletteSizeForQuality = (quality: number): number => {
  if (quality >= LOSSLESS_QUALITY) return 0
  return Math.min(256, Math.max(2, Math.round((256 * quality) / 100)))
}

/**
 * Encodes RGBA pixels as a compressed PNG.
 *
 * @param imageData - Pixels to encode, e.g. from CanvasRenderingContext2D.getImageData
 * @param quality - 1-100; 100 is lossless
 * @returns PNG file bytes
 */
export async function encodeCompressedPng(imageData: ImageData, quality: number): Promise<Blob> {
  const { default: UPNG } = await import('upng-js')
  const { data, width, height } = imageData
  // UPNG wants a standalone ArrayBuffer holding exactly the RGBA pixels
  const rgba = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  const png = UPNG.encode([rgba], width, height, paletteSizeForQuality(quality))
  return new Blob([png], { type: 'image/png' })
}

/** Reads a Blob as a data URL */
export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
