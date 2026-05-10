import net from 'net';
import dns from 'dns';
import { promisify } from 'util';

const lookup = promisify(dns.lookup);

/**
 * Checks if an IP address is private or reserved.
 */
function isPrivateIP(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);

    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 127) return true;
    if (ip === '0.0.0.0') return true;

    return false;
  }

  if (net.isIPv6(ip)) {
    const lowerIp = ip.toLowerCase();
    // Normalize IPv6 by removing leading zeros in groups if necessary
    // node's dns.lookup generally returns canonicalized or near-canonicalized forms
    // but we check for common patterns.

    // Loopback: ::1
    if (lowerIp === '::1' || lowerIp.replace(/^0+:|:0+/g, ':') === '::1') return true;

    // Link-local: fe80::/10
    if (lowerIp.startsWith('fe80:')) return true;

    // Unique Local: fc00::/7
    if (lowerIp.startsWith('fc00:') || lowerIp.startsWith('fd00:')) return true;

    // Unspecified: ::
    if (lowerIp === '::' || lowerIp.replace(/^[0:]+$/g, '::') === '::') return true;

    return false;
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
