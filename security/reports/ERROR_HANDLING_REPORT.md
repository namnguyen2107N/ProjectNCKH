# Error Handling Security Report

## Status: LOW (Fixed to PASS)

## Findings

In `serve.js`:
```javascript
res.writeHead(500);
res.end(`Server Error: ${err.code}`);
```
If an internal filesystem error occurred (such as requesting a directory path `GET /css` returning `EISDIR` or `EACCES`), `serve.js` returned code `500` and echoed internal system error codes to the client.

## What's at risk

Information leakage regarding internal server filesystem structures and error states.

## Recommendations

1. Return clean, generic status messages (`404 Not Found` for missing or directory paths, `500 Internal Server Error`).
2. Log detailed error codes server-side only (`console.error`).
