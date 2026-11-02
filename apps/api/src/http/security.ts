import { randomBytes } from 'node:crypto';

export const newNonce = () => randomBytes(18).toString('base64');

// The app's own pages: scripts and styles only from our origin or with this request's nonce.
// No 'unsafe-inline', no third-party hosts. Emotion receives the nonce for the style tags it writes.
export function pageCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
    'report-uri /api/csp-report',
  ].join('; ');
}

export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

export const COMMON_HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'x-robots-tag': 'noindex, nofollow',
};
