# Secrets Exposure Fix Plan

## Changes

- `.gitignore` — Append rules for `.env`, `.env.*`, `.env.local`.
- `serve.js` — Block access to hidden files/dotfiles (e.g. `.*`), prevent directory traversal, and only serve public static assets.

## New files

- `.env.example` — Template placeholder.

## Verification goals

- [x] `git check-ignore -v .env` confirms `.env` is ignored.
- [x] Requests to `http://localhost:3000/.git/config` return 403 Forbidden.
- [x] No secrets exist in tracked files.
