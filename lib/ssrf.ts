import net from 'net';
import dns from 'dns';
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';

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

// IPv6 unspecified, loopback, discard, unique-local, link-local, multicast and documentation
// ranges, plus 6to4 and Teredo, which can tunnel to arbitrary IPv4 addresses
([
  ['::', 128],
  ['::1', 128],
  ['100::', 64],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['2001::', 32],
] as const).forEach(([address, prefix]) => blockList.addSubnet(address, prefix, 'ipv6'));

// Lets self-hosted setups fetch from their own network on purpose
const allowInternalNetwork = () => process.env.ALLOW_INTERNAL_NETWORK_FETCHING === 'true';

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

    if (allowInternalNetwork()) return true;

    let hostname = parsed.hostname.toLowerCase();

    // Remove brackets from IPv6 hostnames for net.isIP
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      hostname = hostname.substring(1, hostname.length - 1);
    }

    // Additional string checks for common local hostnames
    if (hostname === 'localhost' || hostname === 'loopback') {
      return false;
    }

    // Early check of ALL resolved addresses (and IP literals) for a clear error.
    // This alone does not stop DNS rebinding, since fetch resolves the name again;
    // safeLookup re-checks the addresses actually connected to.
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
    } catch {
      // If DNS lookup fails, we block it for security.
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/**
 * dns.lookup replacement used when opening connections. It refuses to return
 * private or reserved addresses, so a socket can only connect to an address
 * that passed the check. This closes the DNS-rebinding gap where a hostname
 * resolves to a public IP for isSafeUrl and to an internal one for the request.
 */
export function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      callback(err, '', 0);
      return;
    }
    const list = addresses as dns.LookupAddress[];
    const blocked = list.find(({ address }) => isPrivateIP(address));
    if (blocked && !allowInternalNetwork()) {
      const error: NodeJS.ErrnoException = new Error(
        `SSRF Blocked: ${hostname} resolves to private address ${blocked.address}`,
      );
      error.code = 'ESSRFBLOCKED';
      callback(error, '', 0);
      return;
    }
    if (options?.all) {
      callback(null, list);
    } else {
      callback(null, list[0].address, list[0].family);
    }
  });
}

// Connection pool whose DNS lookups go through safeLookup
const safeAgent = new Agent({ connect: { lookup: safeLookup } });

/**
 * A wrapper around fetch that prevents SSRF: the URL and every redirect are
 * validated with isSafeUrl, and connections can only be made to addresses
 * that pass safeLookup. Uses undici's fetch directly so the dispatcher is
 * honoured (Next.js patches the global fetch).
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
    const response = (await undiciFetch(currentUrl, {
      ...(options as UndiciRequestInit),
      redirect: 'manual',
      dispatcher: safeAgent,
    })) as unknown as Response;

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
