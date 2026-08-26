import type { NextConfig } from "next";

// Ver plan Fase 6: la mitigación real para la API key guardada en el
// browser es el CSP, no el cifrado -- connect-src solo permite Anthropic,
// script-src no admite terceros ni inline. Solo en producción: el modo
// dev de Next necesita 'unsafe-eval' para Fast Refresh, y la key nunca
// está en riesgo real corriendo en localhost.
const CSP_PRODUCTION = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.anthropic.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP_PRODUCTION },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
