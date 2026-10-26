# Password Hashing Security Report

> **Update 2026-10-26:** students now have username/password accounts. Passwords are hashed with `scrypt` (N=16384, r=8, p=1), a random salt and constant-time verification. See [AUTH_IMPLEMENTATION_REPORT.md](AUTH_IMPLEMENTATION_REPORT.md).

## Status: PASS (N/A — pre-auth baseline)

## Findings

The application has no user accounts, passwords, or authentication system. Students only input an optional display name stored locally in browser `localStorage`.

## What's at risk

None.

## What's already secure

No passwords stored or hashed.
