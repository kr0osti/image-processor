import net from 'net';
import dns from 'dns';
import { promisify } from 'util';

const lookup = promisify(dns.lookup);

const blockList = new net.BlockList();

// IPv4 private, loopback, link-local, CGNAT, reserved and multicast ranges
([
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
] as const).forEach(([address, prefix]) => blockList.addSubnet(address, prefix, 'ipv4'));

// IPv6 unspecified, loopback, unique-local, link-local, multicast and documentation ranges
([
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
] as const).forEach(([address, prefix]) => blockList.addSubnet(address, prefix, 'ipv6'));

/**
 * Checks if an IP address is private or reserved.
 */
function isPrivateIP(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return blockList.check(ip, 'ipv4');
  }

  if (net.isIPv6(ip)) {
    const lowerIp = ip.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) addresses: check the embedded IPv4
    const embedded = lowerIp.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
    if (embedded) {
      return blockList.check(embedded[1], 'ipv4');
    }
    if (lowerIp.startsWith('::ffff:') || lowerIp.startsWith('64:ff9b::')) {
      return true;
    }
    return blockList.check(ip, 'ipv6');
  }

  return true;
}

/**
 * Validates a URL to prevent Server-Side Request Forgery (SSRF) attacks.
 * This checks if the URL uses a safe protocol and doesn't point to
 * internal/private network addresses, including DNS resolution check.
 *
 * @param urlStr The URL to validate
 * @returns true if the URL is considered safe to fetch from the server
 */
export async function isSafeUrl(urlStr: string): Promise<boolean> {
  try {
    const parsed = new URL(urlStr);

    // Only allow http and https protocols
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const allowInternal = process.env.ALLOW_INTERNAL_NETWORK_FETCHING === 'true';
    if (allowInternal) return true;

    let hostname = parsed.hostname.toLowerCase();

    // Remove brackets from IPv6 hostnames for net.isIP
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      hostname = hostname.substring(1, hostname.length - 1);
    }

    // Additional string checks for common local hostnames
    if (hostname === 'localhost' || hostname === 'loopback') {
      return false;
    }

    // DNS Resolution check to prevent DNS Rebinding and validate IP literals
    // Using { all: true } to check ALL resolved addresses
    try {
      // dns.lookup handles IP literals correctly by returning them as is.
      const addresses = await new Promise<dns.LookupAddress[]>((resolve, reject) => {
        dns.lookup(hostname, { all: true }, (err, addrs) => {
          if (err) reject(err);
          else resolve(addrs);
        });
      });

      for (const { address } of addresses) {
        if (isPrivateIP(address)) {
          return false;
        }
      }
    } catch (dnsErr) {
      // If DNS lookup fails, we block it for security.
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * A wrapper around fetch that prevents SSRF by validating the URL
 * and all redirects against isSafeUrl.
 */
export async function safeFetch(
  url: string,
  options: RequestInit = {},
  maxRedirects: number = 5
): Promise<Response> {
  let currentUrl = url;
  let redirects = 0;

  while (true) {
    if (!(await isSafeUrl(currentUrl))) {
      throw new Error(`SSRF Blocked: Unsafe URL: ${currentUrl}`);
    }

    // Disable automatic redirects to validate each step in the redirect chain
    const response = await fetch(currentUrl, { ...options, redirect: 'manual' });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirects >= maxRedirects) return response;

      currentUrl = new URL(location, currentUrl).toString();
      redirects++;
      continue;
    }

    return response;
  }
}

/**
 * Reads a response body, aborting if it exceeds the given size.
 *
 * @param response The response to read
 * @param maxBytes Maximum allowed body size in bytes
 * @returns The body bytes
 * @throws Error if the body is larger than maxBytes
 */
export async function readBodyWithLimit(response: Response, maxBytes: number): Promise<ArrayBuffer> {
  const declaredLength = Number(response.headers?.get('content-length'));
  if (declaredLength > maxBytes) {
    throw new Error('Response too large');
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      throw new Error('Response too large');
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
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
