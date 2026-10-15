import crypto from 'crypto';

/**
 * Name for a saved processed image: the original name, sanitized (safe
 * characters only, no leading dots), with "-processed" before the extension.
 * Without an original name a random hex name is used.
 *
 * @param {unknown} originalFilename - Name of the uploaded or fetched file, if known
 * @param {string} ext - Extension of the saved file
 * @returns {string} A plain filename, safe to join to the uploads directory
 */
export function processedFilename(originalFilename, ext) {
  if (typeof originalFilename === 'string' && originalFilename) {
    const sanitized = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
    const nameWithoutExt = sanitized.replace(/\.[^/.]+$/, '').slice(0, 200) || 'image';
    return `${nameWithoutExt}-processed.${ext}`;
  }
  return `${crypto.randomBytes(16).toString('hex')}.${ext}`;
}
