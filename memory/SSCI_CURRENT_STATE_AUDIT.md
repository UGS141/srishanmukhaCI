# SSCI Current-State Audit

**Audit date:** 2026-10-03  
**Source:** Uploaded `sscomputer-main` ZIP, extracted to `/app/audit_source/sscomputer-main`  
**Scope:** Phase 0 inspection and documentation only. No application code, environment values, database, or production data was modified.

## Audit status and evidence boundaries

This report is based on source inspection of the uploaded project. Runtime behavior, deployed configuration, MongoDB contents, Render, Vercel, and Atlas connectivity are **NOT VERIFIED** because no production credentials were used and no destructive or live-database operation was performed. Findings marked “working” mean the source contains an implementation path, not that the path has passed end-to-end QA.

## 1. Current architecture

- Single repository containing a Vite React TypeScript frontend and a Node.js Express backend.
- MongoDB access uses Mongoose and a fixed `ssci` database name in `server/config/db.js`.
- Frontend uses React Router, a singleton `CMSStore`, browser `localStorage`, and a thin REST client in `src/services/api.ts`.
- Backend endpoints and models are concentrated in `server/index.js`; there is no separate service/controller/repository layer.
- Public content has two competing sources: MongoDB API data and bundled TypeScript seed/static data.
- Admin, CMS, CRM, analytics, and media screens are implemented as frontend routes under `/admin`.

## 2. Frontend architecture

- React 19 + TypeScript + Vite 8, Tailwind CSS 4, React Router 7, Framer Motion, Lucide icons.
- Public routes include home, about, courses, course details, learning paths, batches, projects, trainers, blog, contact, certificate verification, and student portal information.
- Admin routes include dashboard, courses, batches, enquiries, students, trainers, blog/content, certificates, website, SEO, analytics, settings, media, and audit logs.
- State is primarily held in `cmsStore.ts`; it initializes bundled defaults, loads local storage, then asynchronously refreshes selected collections from the API.
- Authentication state is persisted in local storage as a JWT and serialized user, while the store also has a local login path.
- Error boundary and basic loading/error messages exist, but there is no consistent request state, retry, timeout, or error contract across pages.
- Responsive layouts and SEO metadata are broadly present. The required `data-testid` coverage is not present across interactive/critical elements.

## 3. Backend architecture

- Express server starts on `process.env.PORT || 5000`, binds to `0.0.0.0`, and exits if JWT or MongoDB configuration is missing.
- CORS allows configured domains plus every `*.vercel.app` origin and, outside production, effectively any origin.
- JSON parsing, an in-memory IP rate limiter, JWT authentication, role middleware, MongoDB models, and a global error handler are present.
- Authentication endpoints: login and `/api/auth/me`; there is no server logout, refresh-token, password-change, user-management, or session-revocation endpoint.
- CRUD-like APIs exist for courses, batches, leads/status, certificates, website content, blog, trainers, students, floating skills, announcements, and audit-log reads.
- There is no central input validation library, schema-based request validation, pagination layer, export service, file service, or structured application logging.

## 4. Database architecture

### Collections/models found

`AdminUser`, `Course`, `Batch`, `Lead`, `Student`, `Trainer`, `BlogPost`, `CertificateRecord`, `SiteSettings`, `HeroContent`, `Announcement`, `FloatingSkill`, and `AuditLog`.

### Positive controls

- Unique/indexed business identifiers exist for admin email, course slug, batch ID, lead ID, student ID, trainer ID, certificate number, and several status fields.
- Mongoose validators and timestamps are used on most models.
- Lead notes and timeline are embedded, which is adequate for an initial CRM but may grow without bounds.

### Integrity risks

- No soft-delete fields or deletion audit metadata; delete endpoints permanently remove documents.
- Course/batch/trainer/student relationships are mostly strings rather than references or validated foreign keys.
- Lead ID generation uses latest record plus count and is race-prone under concurrent submissions; it also has no atomic counter.
- Most lists query all records with no pagination or projection. Responses pass Mongoose documents directly, so serialization and field exposure are not centrally controlled.
- Dates are stored as strings in leads, students, batches, certificates, and blog posts, making date filtering/reporting unreliable.
- No documented migration/versioning strategy, backup check, orphan scan, or duplicate reconciliation process exists.
- Seed data includes identifiable-looking sample names, phones, emails, student records, and certificates; provenance and production-data policy are not documented.

## 5. Authentication findings

### Existing implementation

- Login compares bcrypt hashes and issues a JWT with a 24-hour expiry.
- Missing, invalid, expired, and deleted-user tokens are rejected by `authenticateToken` with 401.
- Role middleware returns 403 when the authenticated user lacks an allowed role, while always allowing `SUPER ADMIN`.
- A login limiter exists in process memory.

### P0/P1 findings

- **P0:** `AdminLoginPage.tsx` intentionally falls back to a local login when the backend is unavailable or login fails for the hardcoded default email/password. `cmsStore.login()` grants a selected role and `permissions: ['all']` without server authentication. This is an authentication bypass and fail-open authorization path.
- **P0:** `AdminLayout` does not enforce a redirect when there is no authenticated user. It reads a default `currentUser` from the client store, so protected admin routes can be rendered without a valid backend session.
- **P1:** The login page pre-populates a default admin email and password in source. The seed script also contains fallback admin credentials. **SECRET FOUND — ROTATION REQUIRED** for any real credentials that may have been committed or reused.
- **P1:** JWTs are stored in local storage, increasing impact from XSS. There is no refresh rotation, revocation, inactivity timeout, password policy enforcement, account lockout, or session/device management.
- **P1:** Authorization is endpoint-specific but incomplete; there is no permission matrix enforcement, no resource-level ownership/assignment check, and no server-side user/role administration.

## 6. RBAC architecture

Roles declared: `SUPER ADMIN`, `ADMIN`, `COUNSELLOR`, `CONTENT MANAGER`, `TRAINER`, and `VIEWER`.

Source-indicated access is inconsistent with the intended product matrix:

| Area | Current server access | Audit assessment |
|---|---|---|
| Courses, batches | Super Admin, Admin, Content Manager | Reasonable starting point; no field-level checks |
| Leads | Super Admin, Admin, Counsellor | Missing assignment scoping and assignment/reassignment API |
| Students | Super Admin, Admin, Counsellor | Trainer/viewer access not modeled |
| Certificates | Super Admin, Admin, Counsellor | Issuance permission may be too broad; no revoke API |
| Trainers | Super Admin, Admin, Content Manager | Trainer self/assigned access absent |
| Audit logs | Super Admin, Admin | No export or immutable-read policy |
| Website/content | Super Admin, Admin, Content Manager | No granular content permissions |
| Viewer | No meaningful server read-only route coverage | Declared but not productized |

The frontend hides or shows navigation based on presentation only; server authorization must remain the source of truth.

## 7. Public website data flow

- Courses, batches, blog posts, trainers, hero, settings, announcements, floating skills, and leads have public/API paths.
- The store first loads static data/local storage and then refreshes selected collections from MongoDB.
- Some public pages also call the API directly, but the home page and several sections continue to import bundled data.
- Blog detail is definitively static: `BlogDetailPage.tsx` reads `src/data/blog.ts` and does not call the declared `getBlogPostBySlug` API method. The backend also has no public GET `/api/blog/:slug` route.
- The enquiry modal sends to `POST /api/leads` and only displays success after the API returns `success`; this is source-indicated genuine persistence. However, `cmsStore.addLead()` remains a local-only path and can be used by other UI code.

## 8. Admin CMS data flow

- Course/batch/blog/trainer/content mutations generally await backend responses before updating the store.
- The store then writes the response and a local audit entry to local storage.
- Backend audit logs are created for many mutations, but the frontend audit log is a separate local-only history and can diverge from the database.
- Settings save shows success immediately without awaiting or checking `cmsStore.updateSettings()`.
- Some CMS pages rely on static defaults when API calls fail, which can present stale content as current.

## 9. Enquiry/CRM findings

### Existing capabilities

- Public lead submission with name/phone checks, source tagging, status, notes, embedded timeline, and a rate limiter.
- Admin lead list with search/status tabs, details drawer, phone/WhatsApp links, note entry, status updates, and local conversion to student.

### Missing or unsafe capabilities

- No lead update/delete endpoint, assignment/reassignment endpoint, follow-up-date endpoint, contact-method endpoint, or activity endpoint.
- `followUpDate` is displayed/derived but not actually scheduled or persisted through a dedicated flow; dashboard “today”/overdue logic is not implemented.
- `convertLeadToStudent()` creates a student locally only; it does not call `POST /api/students`, so conversion can be lost or conflict with the database.
- No server-side filtering, pagination, date filtering, counsellor filtering, or status-history collection.
- Lead payload is spread directly into a Mongoose create operation after only name/phone checks, creating mass-assignment and unbounded-input risk.
- Public duplicate detection is absent; repeated submissions create new leads.

## 10. Export findings

- No XLSX, CSV, or PDF dependency, endpoint, browser export implementation, filtered export contract, or report generator was found.
- Required exports for enquiries/leads, students, courses, batches, and reports are **NOT IMPLEMENTED / NOT VERIFIED**.

## 11. File management findings

- The Media page is a simulated upload: it does not send the file anywhere and replaces the uploaded URL with `/ssci-logo.png`.
- No backend upload/download/delete route, MIME validation, extension validation, file-size enforcement, malware scanning, private access control, or object storage integration exists.
- Media is held in the client store/local storage and is not a database-backed asset registry.
- Certificate “Download Certificate Copy” is an alert placeholder and does not generate a file.

## 12. Dashboard and analytics findings

- Dashboard counts are based on the client store, not a dedicated aggregated API.
- The dashboard trend SVG and course-demand bars contain hardcoded values, not database-derived metrics.
- Analytics page calculates only a client-side conversion percentage and counts; no date/course/batch/counsellor filters exist.
- Notification badge is initialized to a hardcoded count and the notification list is derived from local leads; there is no notification collection or delivery workflow.
- Analytics event tracking only forwards to existing `dataLayer`/`gtag`; no configured analytics provider was verified.

## 13. Student, trainer, certificate, and placement findings

- Students, trainers, and certificates have basic models and admin/public views.
- Student portal is explicitly an information page; student authentication and self-service are not implemented.
- Trainer model does not include trainer account/access, assignments, attendance, or feedback.
- Certificates support public verification and issue/list APIs, but no server revoke/update/delete API; frontend revoke is local-only.
- No placement model, placement API, placement CMS, or placement data flow was found. Placement claims should not be added without client-provided data.

## 14. Deployment findings

- Render configuration deploys the Node server on a free web service with `/health`; Vercel rewrites all paths to `index.html`.
- The project uses `MONGODB_URI`, `JWT_SECRET`, `PORT`, `NODE_ENV`, and `VITE_API_URL`; this differs from the host environment contract used by the current workspace and must be resolved during implementation, not assumed.
- Render defines `FRONTEND_URL` but the uploaded `.env` key inventory does not include it; effective CORS behavior in the deployed service is **NOT VERIFIED**.
- CORS wildcard acceptance of any `*.vercel.app` origin is a production risk.
- No Dockerfile, CI pipeline, migration job, backup job, or release smoke-test script was found.
- `.env` exists in the uploaded artifact. **SECRET FOUND — ROTATION REQUIRED.** Values are intentionally not reproduced.

## 15. Performance findings

- Many list endpoints load all documents and return full documents.
- The frontend refreshes multiple endpoints in parallel on store construction, including `/api/leads` without an authenticated token; this predictably fails for the public visitor and is silently swallowed.
- Local storage serializes the full CMS state, including lead/student/certificate-looking records, on every notification.
- No request deduplication, caching policy, pagination, query indexes for common compound filters, lazy route loading, or measured performance baseline exists.
- In-memory rate limiting is not shared across Render instances and is lost on restart.

## 16. UX and accessibility findings

- The visual identity is coherent and responsive patterns are present, but loading, empty, retry, unauthorized, forbidden, and network-error states are inconsistent.
- Several actions use browser `alert`/`confirm`; there is no consistent confirmation/toast system.
- Tables are horizontally scrollable on small screens rather than having a dedicated mobile presentation.
- Interactive and critical elements generally lack the required unique `data-testid` attributes.
- Admin route access is not visibly gated at the layout level.
- The static fallback can make stale content appear authoritative.
- Source still contains Vite starter CSS in `App.css`, indicating cleanup debt, though it is not necessarily active.

## 17. P0/P1/P2/P3 priority list

### P0 — Critical/security/data-loss

1. Remove local admin fallback and hardcoded default login path.
2. Enforce server-backed authentication at the admin route boundary; no default client admin user.
3. Rotate any exposed/reused secrets from the uploaded `.env` and verify repository history/hosting variables.
4. Prevent mass assignment and validate all public/admin request bodies.
5. Stop local-only conversion/revoke/lead mutation paths from presenting persisted success.

### P1 — Production blockers

1. Establish one API source of truth and remove public static fallbacks for CMS-managed entities.
2. Add server-side pagination/filtering, safe response schemas/projections, and reliable date types.
3. Complete CRM assignment, follow-up, status history, notes/activity, and conversion persistence.
4. Implement permission matrix and resource-level authorization for every admin operation.
5. Replace simulated media/certificate downloads with secure storage/file workflows or explicitly remove them.
6. Restrict CORS, add security headers, improve distributed rate limiting, and add request IDs/structured logs.
7. Add missing routes such as public blog detail or remove unused API declarations.
8. Add end-to-end tests against a disposable QA database and real preview/deployed environments.

### P2 — Important product improvements

1. Filtered Excel/CSV/PDF export service with role-sensitive columns.
2. Operational dashboard with actual aggregation, filters, follow-up queues, and counsellor workload.
3. Reliable refresh/retry/error boundaries and mutation refetching.
4. User administration, password policy, session revocation, and audit-log hardening.
5. Data migration plan for string dates, references, soft deletion, and duplicate records.

### P3 — Enhancement/polish

1. Student self-service portal, attendance/progress, assessments, and trainer workflows.
2. Placement foundations based only on real SSCI data.
3. Accessibility improvements, richer mobile table views, route-level code splitting, and test IDs.

## 18. Proposed phased implementation plan

### Phase A — Security and access control

Document and approve the permission matrix, remove fail-open client login, enforce protected admin routes, add request validation, tighten CORS, rotate secrets, and add auth regression tests. Do not migrate data.

### Phase B — Reliability and API contract

Create a typed API contract, standard response/error format, safe projections, pagination, filters, timeouts, retry states, and refetch-after-mutation behavior. Reconcile environment names without changing protected production values blindly.

### Phase C — CRM and admissions

Extend leads safely with assignment, follow-up scheduling, activities, status history, duplicate handling, conversion transaction/workflow, and counsellor-scoped access. Preserve existing lead records and produce a migration plan first.

### Phase D — Exports and reporting

Add server-side filtered exports for approved roles, with CSV/XLSX first and branded PDF reports after the data contract is stable. Test filters against QA records only.

### Phase E — Files and documents

Choose approved object storage, implement MIME/size/name checks and private access, add audit events, and replace placeholder uploads/downloads. No public predictable private URLs.

### Phase F — Dashboard and notifications

Build actual aggregation endpoints, date/course/batch/counsellor filters, follow-up queues, and persisted in-app notifications.

### Phase G — Student/trainer foundations

Model only the student/trainer/placement capabilities already approved by SSCI. Keep placement claims data-driven and avoid destructive schema changes.

### Phase H — UX/performance and regression QA

Add consistent loading/error/empty/retry states, mobile table behavior, test IDs, accessibility checks, route splitting, index review, and full public/admin regression tests.

## 19. Files/modules that should be changed in controlled phases

- `server/index.js`: split routes/services gradually; add validation, pagination, CRM, export, file, and health behavior.
- `server/middleware/auth.js`: strengthen token/session and permission handling.
- `server/config/db.js`: only after approved environment/database plan; do not change database identity casually.
- `server/models/*.js`: additive schema changes and indexes only after migration design.
- `server/seed.js` and `server/seedData.js`: remove unsafe defaults and separate QA seed data from production seed data.
- `src/services/api.ts`: typed, consistent request/error handling.
- `src/admin/cmsStore.ts`: remove local authoritative persistence and local-only mutations.
- `src/admin/AdminLayout.tsx`, `src/admin/pages/*`: route authorization, reliable state handling, CRM/reporting UX.
- `src/pages/*` and `src/components/common/*`: CMS source-of-truth alignment, public form reliability, and error states.
- Deployment files only after the environment contract and live deployment configuration are confirmed.

## 20. Files/modules that should not be touched casually

- Existing MongoDB production data and collections.
- Protected environment values and deployment credentials.
- Working course and batch business fields until API/DB regression tests exist.
- Public branding assets and SSCI visual identity.
- Existing SEO routes/schema behavior unless tested against the public site.
- Certificate records and lead records; changes require migration/backup/rollback planning.

## 21. Test plan

### Authentication/RBAC

Test valid login, invalid login, absent/invalid/expired token, deleted user, logout/revocation, each role against each endpoint, direct URL access, and client/server disagreement.

### Core CMS

Create/read/update/delete or approved non-destructive equivalents for courses and batches; verify public sync, validation, duplicate handling, concurrent writes, and regression against existing content.

### Enquiries/CRM

Submit public QA enquiry, confirm MongoDB persistence before success, fetch as authorized roles, filter/paginate, assign, add activity/note, schedule follow-up, change status, convert through the backend, and verify no local-only success remains.

### Exports/files

Verify CSV/XLSX/PDF filters, role-sensitive fields, empty results, dates, large data, upload MIME/size rejection, private download authorization, deletion, and audit logging.

### Public/admin UX

Test routes and critical flows at 320, 375, 390, 430, 768, 1024, 1280, 1440, and 1920 pixels; check no overflow, modal clipping, broken links, stale CMS fallback, and keyboard/focus behavior.

### Data policy

Use records named `QA TEST - DELETE ME`, never real customer data. Before any destructive QA cleanup, obtain explicit confirmation; after cleanup, verify QA records are gone and production/configuration records remain.

## 22. Database cleanup and migration plan

1. Do not delete or alter production data during this audit.
2. Take/verify a backup before any migration.
3. Inventory collection counts, duplicates, null/invalid references, date formats, orphaned batches/trainers, and seeded/sample PII.
4. Propose additive migrations for normalized timestamps, assignment identifiers, activity history, soft deletion, and indexes.
5. Run migrations only in a disposable/staging database first, then obtain explicit approval for production execution.
6. Maintain a rollback or restore procedure and record migration version/timestamp in the release notes.

## 23. Final production-readiness checklist

- [ ] No client-side authentication bypass or fail-open admin access
- [ ] Secrets rotated and absent from source/history; values never exposed in reports
- [ ] Auth/session expiry, revocation, password policy, and RBAC verified end-to-end
- [ ] CORS, HTTPS, headers, rate limits, validation, and safe errors verified in deployed environment
- [ ] Courses, batches, leads, students, certificates, CMS, and public sync regression-tested
- [ ] CRM assignment/follow-up/activity/conversion backed by MongoDB and permission-checked
- [ ] Exports and file management implemented, filtered, private, and audited
- [ ] Dashboard metrics sourced from database aggregation, not hardcoded values
- [ ] Pagination, indexes, projections, date filtering, and performance measured
- [ ] Loading/error/empty/retry/unauthorized/forbidden states covered
- [ ] Responsive checks completed at all required widths
- [ ] QA records cleaned only after confirmation; backup and restore verified
- [ ] Real deployed website → API → MongoDB flow tested

**Conclusion:** The uploaded project is a substantial working prototype with a coherent public site, CMS surface, MongoDB models, lead form, certificate verification, and basic JWT/RBAC scaffolding. It is **NOT VERIFIED as production-ready**. The highest-risk blockers are the local authentication fallback/default credentials, client-authoritative state, incomplete CRM persistence, simulated file workflows, hardcoded analytics, absent exports, and insufficient server-side validation/authorization.