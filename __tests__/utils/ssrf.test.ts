/**
 * @jest-environment node
 */
import { isSafeUrl, safeFetch, safeLookup } from '../../lib/ssrf';
import dns from 'dns';
import { fetch as undiciFetch } from 'undici';

jest.mock('dns', () => ({
  lookup: jest.fn(),
}));

// safeFetch uses undici's fetch with a pinned-DNS agent
jest.mock('undici', () => ({
  Agent: jest.fn(),
  fetch: jest.fn(),
}));

describe('isSafeUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should allow valid public URLs', async () => {
    (dns.lookup as unknown as jest.Mock).mockImplementation((hostname, options, callback) => {
      callback(null, [{ address: '93.184.216.34' }]); // example.com
    });
    expect(await isSafeUrl('https://example.com')).toBe(true);
  });

  it('should block non-http/https protocols', async () => {
    expect(await isSafeUrl('file:///etc/passwd')).toBe(false);
  });

  it('should block localhost and loopback by default', async () => {
    (dns.lookup as unknown as jest.Mock).mockImplementation((hostname, options, callback) => {
      callback(null, [{ address: '127.0.0.1' }]);
    });
    expect(await isSafeUrl('http://localhost')).toBe(false);
    expect(await isSafeUrl('http://127.0.0.1')).toBe(false);
  });

  it('should block private IPv4 addresses by default', async () => {
    (dns.lookup as unknown as jest.Mock).mockImplementation((hostname, options, callback) => {
      callback(null, [{ address: '10.0.0.1' }]);
    });
    expect(await isSafeUrl('http://10.0.0.1')).toBe(false);
  });

  it('should block domains that resolve to private IPs by default', async () => {
    (dns.lookup as unknown as jest.Mock).mockImplementation((hostname, options, callback) => {
      callback(null, [{ address: '127.0.0.1' }]);
    });
    expect(await isSafeUrl('http://malicious.com')).toBe(false);
  });

  it('should block domains with multiple IPs if any is private', async () => {
    (dns.lookup as unknown as jest.Mock).mockImplementation((hostname, options, callback) => {
      callback(null, [
        { address: '93.184.216.34' },
        { address: '10.0.0.1' }
      ]);
    });
    expect(await isSafeUrl('http://mixed-records.com')).toBe(false);
  });

  describe('with ALLOW_INTERNAL_NETWORK_FETCHING=true', () => {
    beforeEach(() => {
      process.env.ALLOW_INTERNAL_NETWORK_FETCHING = 'true';
    });

    it('should allow localhost and loopback', async () => {
      expect(await isSafeUrl('http://localhost')).toBe(true);
      expect(await isSafeUrl('http://127.0.0.1')).toBe(true);
    });

    it('should still block non-http/https protocols', async () => {
      expect(await isSafeUrl('file:///etc/passwd')).toBe(false);
    });
  });
});

describe('safeFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch safe URLs', async () => {
    (dns.lookup as unknown as jest.Mock).mockImplementation((hostname, options, callback) => {
      callback(null, [{ address: '93.184.216.34' }]);
    });
    (undiciFetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true
    });

    const response = await safeFetch('https://example.com');
    expect(response.status).toBe(200);
    expect(undiciFetch).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ redirect: 'manual' }));
  });

  it('should block unsafe initial URLs', async () => {
    (dns.lookup as unknown as jest.Mock).mockImplementation((hostname, options, callback) => {
      callback(null, [{ address: '127.0.0.1' }]);
    });

    await expect(safeFetch('http://127.0.0.1')).rejects.toThrow('SSRF Blocked');
  });

  it('should follow safe redirects', async () => {
    (dns.lookup as unknown as jest.Mock).mockImplementation((hostname, options, callback) => {
      callback(null, [{ address: '93.184.216.34' }]);
    });

    (undiciFetch as jest.Mock)
      .mockResolvedValueOnce({
        status: 301,
        headers: new Map([['location', 'https://example.com/new']])
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true
      });

    const response = await safeFetch('https://example.com/old');
    expect(response.status).toBe(200);
    expect(undiciFetch).toHaveBeenCalledTimes(2);
    expect(undiciFetch).toHaveBeenNthCalledWith(2, 'https://example.com/new', expect.any(Object));
  });

  it('should block unsafe redirects', async () => {
    (dns.lookup as unknown as jest.Mock).mockImplementation((hostname, options, callback) => {
      if (hostname === 'example.com') {
        callback(null, [{ address: '93.184.216.34' }]);
      } else {
        callback(null, [{ address: '127.0.0.1' }]);
      }
    });

    (undiciFetch as jest.Mock).mockResolvedValueOnce({
      status: 301,
      headers: new Map([['location', 'http://localhost/secret']])
    });

    await expect(safeFetch('https://example.com/redirect-to-internal')).rejects.toThrow('SSRF Blocked: Unsafe URL: http://localhost/secret');
  });
});

describe('safeLookup', () => {
  const lookupMock = dns.lookup as unknown as jest.Mock;
  const run = (options: dns.LookupOptions) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address: unknown; family?: number }>((resolve) =>
      safeLookup('example.com', options, (err, address, family) => resolve({ err, address, family })),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ALLOW_INTERNAL_NETWORK_FETCHING;
  });

  it('returns public addresses', async () => {
    lookupMock.mockImplementation((hostname, options, callback) => callback(null, [{ address: '93.184.216.34', family: 4 }]));
    expect(await run({})).toEqual({ err: null, address: '93.184.216.34', family: 4 });
    expect(await run({ all: true })).toEqual({ err: null, address: [{ address: '93.184.216.34', family: 4 }], family: undefined });
  });

  it.each(['127.0.0.1', '10.1.2.3', '169.254.169.254', '::1', '::ffff:127.0.0.1', '2002:7f00:1::1', '2001::1', '100::1'])(
    'refuses to connect to %s',
    async (address) => {
      lookupMock.mockImplementation((hostname, options, callback) => callback(null, [{ address, family: address.includes(':') ? 6 : 4 }]));
      const { err } = await run({});
      expect(err?.code).toBe('ESSRFBLOCKED');
    },
  );

  it('passes DNS errors through', async () => {
    const dnsError = Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    lookupMock.mockImplementation((hostname, options, callback) => callback(dnsError));
    expect((await run({})).err).toBe(dnsError);
  });

  it('allows private addresses when ALLOW_INTERNAL_NETWORK_FETCHING=true', async () => {
    process.env.ALLOW_INTERNAL_NETWORK_FETCHING = 'true';
    lookupMock.mockImplementation((hostname, options, callback) => callback(null, [{ address: '10.0.0.5', family: 4 }]));
    expect(await run({})).toEqual({ err: null, address: '10.0.0.5', family: 4 });
  });

  it('blocks DNS rebinding: a name that passes isSafeUrl but resolves privately on connect', async () => {
    // First resolution (isSafeUrl) is public, the second (when connecting) is internal
    lookupMock
      .mockImplementationOnce((hostname, options, callback) => callback(null, [{ address: '93.184.216.34', family: 4 }]))
      .mockImplementationOnce((hostname, options, callback) => callback(null, [{ address: '127.0.0.1', family: 4 }]));

    expect(await isSafeUrl('https://rebind.example')).toBe(true);
    expect((await run({})).err?.code).toBe('ESSRFBLOCKED');
  });
});

describe('safeFetch dispatcher', () => {
  it('sends every request through the pinned-DNS agent', async () => {
    (dns.lookup as unknown as jest.Mock).mockImplementation((hostname, options, callback) =>
      callback(null, [{ address: '93.184.216.34', family: 4 }]),
    );
    (undiciFetch as jest.Mock).mockResolvedValue({ status: 200, ok: true });

    await safeFetch('https://example.com');
    expect(undiciFetch).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ dispatcher: expect.anything() }));
  });
});

