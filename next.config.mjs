export default {
  output: 'standalone',
  poweredByHeader: false,
  images: { unoptimized: true },
  serverExternalPackages: ['postgres', 'yauzl', 'sharp', 'nodemailer'],
  experimental: { cpus: 2 },
  async redirects() {
    return [
      {
        source: '/courses',
        has: [{ type: 'query', key: 'onglet', value: 'petit-dejeuner' }],
        destination: '/semaine?onglet=petit-dejeuner',
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
          },
        ],
      },
    ];
  },
};
