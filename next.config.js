/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Dev origins from env only — never hardcode IPs/tunnels
  ...(process.env.NODE_ENV === "development" && {
    allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(",") ?? [],
  }),

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "maps.googleapis.com" },
      { protocol: "https", hostname: "maps.gstatic.com" },
    ],
  },

  // Security + caching headers for static assets (middleware doesn't cover these)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(), geolocation=(self), accelerometer=(self), gyroscope=(self)",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
