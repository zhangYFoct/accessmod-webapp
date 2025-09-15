/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://backend:5000/api/:path*',
      },
    ];
  },
  // Increase timeout for long-running analysis requests
  experimental: {
    proxyTimeout: 600000, // 10 minutes timeout for proxy requests
  },
  // Custom server configuration for better timeout handling
  serverRuntimeConfig: {
    // Increase body parser limit and timeout
    bodyParser: {
      sizeLimit: '10mb',
    },
    timeout: 600000, // 10 minutes
  },
};

module.exports = nextConfig;