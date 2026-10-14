/**
 * SSRF-safe fetch utility
 *
 * Only allows http(s) URLs whose host resolves to a public IP address.
 * Redirects are followed manually so every hop is re-validated.
 */

import { lookup } from 'dns/promises';
import net from 'net';

const blockList = new net.BlockList();

// IPv4 private, loopback, link-local, CGNAT, reserved and multicast ranges
[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([address, prefix]) => blockList.addSubnet(address, prefix, 'ipv4'));

// IPv6 unspecified, loopback, unique-local, link-local, multicast and documentation ranges
[
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
].forEach(([address, prefix]) => blockList.addSubnet(address, prefix, 'ipv6'));

/**
 * Checks whether an IP address is private, loopback or otherwise non-public
 * @param {string} address - IPv4 or IPv6 address
 * @returns {boolean} True if the address must not be fetched
 */
export function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    return blockList.check(address, 'ipv4');
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) addresses: check the embedded IPv4
    const embedded = lower.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
    if (embedded) {
      return blockList.check(embedded[1], 'ipv4');
    }
    if (lower.startsWith('::ffff:') || lower.startsWith('64:ff9b::')) {
      return true;
    }
    return blockList.check(address, 'ipv6');
  }
  return true;
}

/**
 * Validates that a URL uses http(s) and that its host resolves only to public addresses
 * @param {string} rawUrl - The URL to validate
 * @returns {Promise<URL>} The parsed URL
 * @throws {Error} If the URL is invalid or points to a non-public address
 */
export async function assertPublicUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true, verbatim: true });

  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('URL points to a private or reserved address');
  }

  return url;
}

/**
 * Fetches a URL after validating it (and every redirect target) with assertPublicUrl
 * @param {string} rawUrl - The URL to fetch
 * @param {RequestInit} [init] - Fetch options
 * @param {number} [maxRedirects=5] - Maximum number of redirects to follow
 * @returns {Promise<Response>} The final response
 * @throws {Error} If any hop is not allowed or there are too many redirects
 */
export async function safeFetch(rawUrl, init = {}, maxRedirects = 5) {
  let currentUrl = rawUrl;

  for (let i = 0; i <= maxRedirects; i++) {
    const url = await assertPublicUrl(currentUrl);
    const response = await fetch(url, { ...init, redirect: 'manual' });

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      currentUrl = new URL(location, url).toString();
      continue;
    }

    return response;
  }

  throw new Error('Too many redirects');
}

/**
 * Reads a response body, aborting if it exceeds the given size
 * @param {Response} response - The response to read
 * @param {number} maxBytes - Maximum allowed body size in bytes
 * @returns {Promise<ArrayBuffer>} The body bytes
 * @throws {Error} If the body is larger than maxBytes
 */
export async function readBodyWithLimit(response, maxBytes) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (declaredLength > maxBytes) {
    throw new Error('Response too large');
  }

  if (!response.body) {
    return new ArrayBuffer(0);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('Response too large');
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}
