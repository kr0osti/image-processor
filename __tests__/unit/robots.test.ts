import robots from '../../app/robots';

describe('robots', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return robots configuration with default site URL when NEXT_PUBLIC_SITE_URL is not set', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const result = robots();

    expect(result).toEqual({
      rules: {
        userAgent: '*',
        allow: '/',
        disallow: '/api/',
      },
      sitemap: 'https://yourdomain.com/sitemap.xml',
    });
  });

  it('should return robots configuration with custom site URL when NEXT_PUBLIC_SITE_URL is set', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    const result = robots();

    expect(result).toEqual({
      rules: {
        userAgent: '*',
        allow: '/',
        disallow: '/api/',
      },
      sitemap: 'https://example.com/sitemap.xml',
    });
  });
});
