import nextConfig from '../../../next.config';

describe('next config headers', () => {
  it('does not set immutable cache headers for Next static assets outside production', async () => {
    const headers = typeof nextConfig.headers === 'function' ? await nextConfig.headers() : [];

    expect(headers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/_next/static/:path*',
          headers: expect.arrayContaining([
            expect.objectContaining({
              key: 'Cache-Control',
              value: expect.stringContaining('immutable'),
            }),
          ]),
        }),
      ]),
    );
  });
});

describe('next config redirects', () => {
  it('keeps legacy driver gains and history links on the matching activity tab', async () => {
    const redirects = typeof nextConfig.redirects === 'function' ? await nextConfig.redirects() : [];

    expect(redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/driver/gains',
          destination: '/driver/activite?tab=gains',
        }),
        expect.objectContaining({
          source: '/driver/historique',
          destination: '/driver/activite?tab=historique',
        }),
      ]),
    );
  });
});
