# Security Headers Fix Plan

## Changes

- `serve.js` — Attach security headers to every response handler before sending payload.

## Verification goals

- [x] Response headers include `X-Content-Type-Options: nosniff`.
- [x] Response headers include `X-Frame-Options: DENY`.
- [x] Response headers include `Referrer-Policy: strict-origin-when-cross-origin`.
- [x] Response headers include `Content-Security-Policy`.
- [x] Application loads styles, fonts, and scripts properly without browser console CSP blocks.
