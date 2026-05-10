import { isSafeUrl, safeFetch } from '../../lib/ssrf';
import dns from 'dns';

jest.mock('dns', () => ({
  lookup: jest.fn(),
}));

// Mock global fetch
global.fetch = jest.fn();

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
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true
    });

    const response = await safeFetch('https://example.com');
    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ redirect: 'manual' }));
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

    (global.fetch as jest.Mock)
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
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://example.com/new', expect.any(Object));
  });

  it('should block unsafe redirects', async () => {
    (dns.lookup as unknown as jest.Mock).mockImplementation((hostname, options, callback) => {
      if (hostname === 'example.com') {
        callback(null, [{ address: '93.184.216.34' }]);
      } else {
        callback(null, [{ address: '127.0.0.1' }]);
      }
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      status: 301,
      headers: new Map([['location', 'http://localhost/secret']])
    });

    await expect(safeFetch('https://example.com/redirect-to-internal')).rejects.toThrow('SSRF Blocked: Unsafe URL: http://localhost/secret');
  });
});
