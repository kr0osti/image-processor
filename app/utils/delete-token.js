import crypto from 'crypto';

/**
 * Delete tokens prove that a client saved a file, so "Delete All Files" can
 * remove a user's own uploads without letting anyone delete files by guessing
 * their names (filenames are derived from the original upload name).
 *
 * The key comes from UPLOAD_TOKEN_SECRET, or is generated per process. Tokens
 * from before a restart then stop working; those files are still removed by
 * the scheduled cleanup.
 */
const secret = process.env.UPLOAD_TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

/**
 * @param {string} filename - Name of a file in public/uploads
 * @returns {string} Hex HMAC of the filename
 */
export function createDeleteToken(filename) {
  return crypto.createHmac('sha256', secret).update(filename).digest('hex');
}

/**
 * @param {string} filename - Name of a file in public/uploads
 * @param {unknown} token - Token sent by the client
 * @returns {boolean} Whether the token was issued for this filename
 */
export function isValidDeleteToken(filename, token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
  return crypto.timingSafeEqual(Buffer.from(createDeleteToken(filename), 'hex'), Buffer.from(token, 'hex'));
}
