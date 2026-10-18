# Error Handling Fix Plan

## Changes

- `serve.js` — Update error handlers to send generic client responses while logging details to server console only.

## Verification goals

- [x] Client receives generic `500 Internal Server Error` without OS error codes.
- [x] Directory access without index file returns clean 404/403.
