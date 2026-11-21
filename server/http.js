export const securityHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self'", "connect-src 'self'",
    "worker-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'",
    "frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com"
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

export function withSecurityHeaders(result, https = false) {
  const headers = new Headers(result.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  if (https) headers.set('Strict-Transport-Security', 'max-age=31536000');
  return new Response(result.body, { status: result.status, statusText: result.statusText, headers });
}
