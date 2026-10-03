# SSCI Education Suite — Product Requirements Document (Living)

## Original problem statement
Evolve the existing SSCI (Sri Shanmukha Computer Institute) website + Admin CMS + CRM
into a polished, secure, reliable, production-level education-management +
admissions-CRM software product. Three strict implementation phases: Phase 1
(Security + Architecture + Core CRM), Phase 2 (Online Classes + Students +
Placements + Business Operations), Phase 3 (Product Experience + Public Website +
Reporting + Performance + Final QA). DO NOT rebuild from scratch, DO NOT delete
production data, DO NOT migrate frameworks blindly.

## Technology partner
UGS IT Solutions (product provider). SSCI is the organization/client.

## Current architecture (as of 2026-02-03)
- Frontend: React 19 + TypeScript + Vite 8 + Tailwind 4 (`/app/frontend`, port 3000)
- Backend: Node.js + Express 4 + Mongoose 8 (`/app/backend/server/`, port 8002)
- Platform bridge: FastAPI ASGI reverse proxy (`/app/backend/server.py`, uvicorn on 8001)
  that spawns the Node Express child process on 8002 and forwards every request.
  Required because the platform supervisor is read-only and expects
  `uvicorn server:app --port 8001`.
- Database: MongoDB (local platform-provisioned), DB name `ssci_dev`
- Auth: JWT (15m access token), bcrypt, role-based middleware

## User personas
- Super Admin: full system access, user management, audit log review
- Admin: operational management, CMS, CRM, batches, students, certificates
- Counsellor: leads/enquiries, follow-ups, lead → student conversion
- Content Manager: courses, batches, blog, website content, trainers
- Trainer: assigned students read-only (future)
- Placement Manager: placements (Phase 2)
- Viewer: read-only (future)

## Core requirements (static)
1. Server-authoritative authentication; no local/client fallback paths
2. Role-based access control enforced server-side on every protected endpoint
3. Public enquiries must persist to MongoDB before any success feedback
4. Courses, batches, enquiries, student records, certificates are CMS-managed
5. All CMS mutations immediately reflect on the public site
6. Secrets never leave `.env`; QA creds live only in `/app/memory/test_credentials.md`
7. No destructive database operations without explicit confirmation

## What's been implemented (Phase 1 — 2026-02-03)
- Backup: original Emergent CRA/FastAPI template preserved at `/app/_backup_pre_migration/`
- Workspace migrated: SSCI Vite+Express app now lives in `/app/frontend` + `/app/backend`
- ASGI reverse-proxy bridges uvicorn:8001 → Node Express:8002 and lifecycle-manages Node
- Env contract: `MONGO_URL`, `DB_NAME=ssci_dev`, `JWT_SECRET` (randomly generated), seed admin env-only
- Local admin fallback bypass removed; `AdminLayout` enforces real `/api/auth/me` check
- Login enforces bcrypt + rate-limit (10 / 15 min); 15-min access tokens with sessionVersion revocation support
- RBAC: all protected endpoints return 401 (missing/invalid token) and 403 (role mismatch); `SUPER ADMIN` wildcard
- `/api/leads` POST: whitelist-based mass-assignment protection, validator for name/phone/email, 15/min rate limit
- `/api/leads/:id/convert`: transactional on replica-set Mongo, graceful fallback with compensating cleanup on standalone
- `/api/auth/me`: trimmed response (no `_id`, `sessionVersion`, `password`, `__v`)
- Global mongoose plugin strips `_id`, `__v`, `password`, `sessionVersion` from all JSON responses
- CORS allowlist (preview URL, prod domains, localhost); permissive-only when `NODE_ENV !== 'production'`
- Security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy)
- Data-testids added to admin login + public enquiry form
- QA regression suite committed at `/app/backend/tests/test_ssci_backend.py` (33/33 pass)
- QA admin credentials: see `/app/memory/test_credentials.md`

## Known deferred items (Phase 2 backlog)
- Online course / curriculum / module / topic management
- Online batch management with scheduling + attendance
- Student roster + student portal foundation
- Placement module (companies, opportunities, applications, status)
- Certificate issuance refactor (revoke/update endpoints, PDF generation)
- Secure file management (MIME/size validation, private storage, auth checks)
- Notifications collection + in-app delivery

## Known deferred items (Phase 3 backlog)
- Advanced admin UX (toast system, consistent skeletons/empty/error states, mobile tables)
- Filtered Excel / CSV / PDF exports with role-sensitive columns
- Real database-driven dashboard analytics (currently hardcoded)
- Public website polish, placement showcase, technology-logo showcase
- Performance (lazy routes, image optimization, index review, measured baselines)
- Accessibility + full 320–1920 responsive QA
- Final production regression + QA record cleanup

## Prioritised backlog
P0 — none open
P1 — split `server/index.js` into route modules; replace local in-memory rate limiter
     with persistent one before horizontal scaling; httpOnly cookie delivery for JWT
P2 — online classes module; student portal foundation; placement CRM; filtered exports
P3 — dashboard aggregations; UX polish; a11y + full responsive QA

## File inventory (changed in Phase 1)
- /app/frontend/package.json, /app/frontend/.env, /app/frontend/vite.config.ts
- /app/frontend/src/** (migrated from audit_source + fixes)
- /app/backend/server.py (new, ASGI proxy)
- /app/backend/package.json, /app/backend/requirements.txt, /app/backend/.env
- /app/backend/server/** (migrated + fixes to index.js, config/db.js, seedData.js)
- /app/memory/test_credentials.md (QA creds — never commit)
- /app/memory/SSCI_CURRENT_STATE_AUDIT.md (Phase 0 audit)
- /app/backend/tests/test_ssci_backend.py (regression suite)

## Files that must NOT be touched casually
- /app/memory/_backup_pre_migration/** (recovery snapshot)
- /app/memory/SSCI_CURRENT_STATE_AUDIT.md (historical record)
- Any production MongoDB cluster or production environment values
