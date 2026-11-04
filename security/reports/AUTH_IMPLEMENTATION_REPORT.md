# Auth & Access Implementation Report

Date: 2026-10-26 (updated 2026-11-04: admin dashboard removed)

## Scope

This report covers the new authentication and access-tracking layer added to Robot Math Lab:

- Vercel Functions under `api/`
- Neon Postgres schema in `db/schema.sql`
- Username/password registration and login for students
- Session presence tracking for ~100 concurrent users
- Consent capture and open registration (class code not required)

The admin dashboard and `/api/admin/*` endpoints have been removed. The schemas keep legacy role values for compatibility, but the current app only self-registers students.

The older reports in this folder describe the pre-auth static build. Where they say “no database / no accounts / no passwords”, those statements are superseded by this report.

---

## Status summary

| Control | Status | Evidence |
|---|---|---|
| Password hashing | PASS | `scrypt` (N=16384, r=8, p=1), random 16-byte salt, 64-byte key, `timingSafeEqual` |
| Session tokens | PASS | 32 random bytes, SHA-256 hash stored in `auth_sessions`, raw token only in cookie |
| Cookie hardening | PASS | `HttpOnly`, `Secure` on Vercel, `SameSite=Lax`, `__Host-` prefix in production |
| CSRF | PASS | `Origin`/host check for public POSTs; `X-CSRF-Token` stored server-side for authenticated mutations |
| SQL injection | PASS | `postgres` tagged-template parameters; no user-controlled SQL concatenation |
| Access control | PASS | Student-only auth endpoints; no admin dashboard or admin API is exposed |
| Rate limiting | PASS | Postgres fixed-window counters: login per username/IP, register per IP/class, heartbeat per account |
| Username enumeration (login) | PASS | Generic credential error; dummy scrypt verification for unknown usernames |
| Account status | PASS | `status='active'` required; disabled accounts cannot create sessions |
| Input validation | PASS | Username regex, optional class-code regex, display-name length, password length, consent required |
| XSS in display name | PASS | Server strips `<>`; UI uses `textContent`/escaping; feedback modal sanitises names |
| Secrets | PASS | `.env` ignored; Vercel environment variables; `.vercelignore` excludes local scripts/schema/docs |
| Security headers | PASS | Vercel headers: nosniff, frame deny, referrer policy, permissions policy |
| CORS | PASS | Same-origin only; no wildcard credential sharing |
| Data minimisation | PARTIAL | No email/phone for students; IP stored as peppered hash; consent version stored |
| Client gate as security boundary | NOT CLAIMED | Static app can be loaded; API/session remains the protection boundary |

---

## Verification performed

- `npm test` — 14/14 unit tests (password hashing, validation, join-code generation, HTML delimiter stripping, kinematics).
- `node test-track-flow.js` — all task-flow regression checks passed.
- `node test-splash-welcome.js` — all start-screen checks passed.
- Postgres schema executed against PGlite/Postgres-compatible engine: 16 statements, 6 tables.
- `scripts/migrate.mjs` executed against a Postgres-compatible socket: 16 statements applied.
- `scripts/seed.mjs` executed: demo class created/reused with expected join code; no admin account.
- API integration (PGlite socket + real handlers): health, unauthenticated `/me`, registration without class code, duplicate username, optional invalid class code, cross-origin rejection, login success/failure, rate limit, heartbeat, logout, and post-logout unauthenticated check.
- Browser integration with a mock API: login gate, register tab, registration → app unlock, inert background, settings account panel, logout → gate.

---

## Residual risks and next steps

1. **Client-side gate is UX, not access control.** The static HTML/JS can still be downloaded; server data requires a valid session. If strict app access is required, add Vercel Middleware or move to server-rendered pages.
2. **Shared classroom devices.** New journal entries carry `accountId` and the journal filters by the signed-in account; legacy entries without `accountId` are hidden. However, `localStorage` remains readable via developer tools. For stronger protection, sync and clear local logs on logout.
3. **Learning log sync is not implemented yet.** This phase records accounts, login events, sessions and presence. PS1–PS11 learning events are still local-only; add `learning_sessions`/`learning_events` and a batch endpoint next.
4. **Password reset is administrative.** `npm run user:reset-password -- <username> <password>` resets and revokes sessions; there is no self-service email flow (students have no email).
5. **No CAPTCHA/approval.** Registration is open and protected only by rate limits; a class code is no longer required. If abuse becomes a problem, add a required class code or an approval step.
6. **Third-party data location.** Neon/Vercel regions should be chosen to satisfy the school’s data-residency policy; document this in the research ethics file.
7. **No immutable audit trail yet.** `login_events` records authentication; there is no admin dashboard or export UI. Add an `audit_logs` table if required by the research protocol.

---

## Operational checklist

- [ ] `DATABASE_URL` uses the Neon **pooled** endpoint.
- [ ] `IP_HASH_PEPPER` is set and backed up.
- [ ] `.env.local` is not committed.
- [ ] `/api/health` returns `db: true`.
- [ ] `/api/auth/register` without a class code succeeds.
- [ ] `/api/admin/*` returns 404 (admin surface removed).
- [ ] `/lib/*`, `/db/*`, `/docs/*`, `/security/*` are not publicly served.
- [ ] Cookie flags verified in DevTools.
- [ ] Neon backup/branch policy documented.
- [ ] Consent version recorded for every student.
