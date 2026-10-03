# SSCI Phase 1 Authentication Testing Playbook

This playbook is for non-destructive verification only. Do not print secrets or use real customer data.

## API checks

1. `GET /api/auth/me` with no token must return 401.
2. `GET /api/auth/me` with a malformed token must return 401.
3. Login with invalid credentials must return 401 and never create a local session.
4. Successful login must issue a short-lived access token and return only safe user fields.
5. `POST /api/auth/logout` must revoke the active session server-side.
6. Reusing a token after logout must return 401.
7. A valid token with an insufficient role must return 403 on protected routes.
8. Public enquiry submission must not accept unknown fields or sensitive model fields.
9. Repeated login attempts must eventually return 429.

## Frontend checks

1. Opening `/admin` with no token must redirect to `/admin/login`.
2. Removing or corrupting the token while the admin shell is open must return the user to login.
3. The login screen must not prefill credentials or expose a role selector.
4. Backend login failure must show an error and must not enter the admin area.
5. Logout must call the backend before clearing the client session.

## Data safety

- Do not run seed, CRUD, delete, migration, or QA cleanup commands against production.
- Do not place credentials in this file or test output.