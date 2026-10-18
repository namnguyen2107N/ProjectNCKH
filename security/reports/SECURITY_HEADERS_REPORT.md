# Security Headers Report

## Status: MEDIUM (Fixed to PASS)

## Findings

1. `serve.js` previously set no security response headers whatsoever.
2. The responses were missing:
   - `Content-Security-Policy` (CSP)
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: strict-origin-when-cross-origin`
3. `index.html` loads Google Fonts (`https://fonts.googleapis.com`, `https://fonts.gstatic.com`) and data URIs for favicons/SVGs. A proper CSP policy must accommodate these without opening wildcard script sources.

## What's at risk

- MIME type sniffing attacks where untrusted files are executed as JavaScript.
- Clickjacking attacks embedding the application in malicious iframes.
- Unrestricted script execution if injection occurs.

## What's already secure

- External CDNs are minimal and limited to Google Fonts for typography.

## Recommendations

1. Add comprehensive HTTP security headers in `serve.js`:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Content-Security-Policy`:
     `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; media-src 'self'; connect-src 'self';`
