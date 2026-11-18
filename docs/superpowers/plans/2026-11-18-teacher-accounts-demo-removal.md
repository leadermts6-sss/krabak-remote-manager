# Teacher Accounts and Demo Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add admin-provisioned teacher accounts with one-time activation, clear login/logout UI, real-account scoping, and remove demo data from production UI.

**Architecture:** Keep the existing single-process Node service and admin credential. Add a protected teacher account store in KRABAK_DATA_DIR, hashed one-time activation tokens, and role-aware authenticated API routes. Bind temporary Host registrations and audit events to account identity; replace frontend fixtures with backend-backed active Host data and truthful empty states. A pending Host request opens a centered approval dialog on any app route while preserving the user's explicit approval and browser source picker.

**Tech Stack:** Node.js ESM, built-in `node:test`, Vite, Vanilla JavaScript, existing scrypt/cookie/HTTP/WebSocket implementation; no new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-11-18-teacher-accounts-and-demo-removal-design.md`

## Global Constraints

- Preserve the existing administrator credential file and allow its existing password format unchanged.
- Teacher passwords are 12–128 ASCII letters/digits, requiring at least one of each; do not accept symbols or spaces.
- Activation code is random, stored only as a hash, displayed once, single-use, and expires after 24 hours.
- Do not add public self-registration or email/SMTP delivery.
- Store account records only under the protected `KRABAK_DATA_DIR`; never log plaintext passwords or activation codes.
- Keep current secure HttpOnly/SameSite cookie behavior, eight-hour idle session expiry, and in-memory sessions.
- Show a centered consent dialog for Host requests on any app route; Host approval and the browser source picker remain required.
- Admin can manage accounts and see all active Hosts/audit; a teacher can see only their own active Hosts/audit and cannot manage accounts.
- Require a signed-in user to register a Host; bind active Host records to that account. Preserve Host approval and browser share prompts.
- Remove fictional device/activity/chat/file/desktop content and demo actions; never synthesize offline devices.
- Keep backend on localhost and preserve current SSH, UFW, Nginx, and other school websites.
- Push the completed source to `main` only after verification; the already enabled production workflow deploys only after CI succeeds.

## Review Focus

1. Activation email casing, a guessed/reused/expired code, or simultaneous activation attempts must not create duplicate accounts or disclose whether an account exists. Pin to Task 1 and Task 2 tests.
2. Empty, Unicode, symbol-containing, missing-letter, missing-digit, too-short, and too-long passwords must follow the stated teacher-only policy without changing admin validation. Pin to Task 1 and Task 2 tests.
3. Disabled teachers and logged-out users must lose authenticated access; logout must invalidate the session immediately. Pin to Task 2 tests.
4. A teacher must not read another teacher's active Host list or audit events, and must not call account-management endpoints. Pin to Task 2 tests.
5. When there are no active Hosts or real audit events, the dashboard and device/activity pages must show empty states and never fall back to sample data. Pending activation codes can be reissued; partial resource-load failures do not leave the app stuck. Pin to Task 3, Task 4, and account recovery tests.

---

### Task 1: Teacher account and activation storage

**Files:**
- Create: `server/accounts.mjs`
- Create: `server/accounts.test.mjs`
- Modify: `server/auth.mjs` only if a shared validation/hash helper is needed; keep `writeAdmin()` behavior intact.

**Interfaces:**
- `validateTeacherPassword(password) -> { ok: boolean, reason?: string }`
- `createTeacher(email) -> { user, activationCode, expiresAt }`
- `activateTeacher(email, activationCode, password) -> user`
- `listTeachers() -> public user records`
- `disableTeacher(userId) -> boolean`
- `reissueActivation(userId) -> { activationCode, expiresAt }` (active or pending teacher)

- [x] **Step 1: Add failing storage and password-policy tests.** Cover valid letters+digits, missing either class, symbols/spaces, lengths 11/12/128/129, invalid email, duplicate email ignoring case, simultaneous attempts to consume one code (exactly one succeeds), and that persisted records contain password/token hashes but never plaintext values.
- [x] **Step 2: Run the focused tests and confirm the expected failures.** Run: `node --test server/accounts.test.mjs`. Expected: failures because the account store and validation functions do not exist yet.
- [x] **Step 3: Add failing account lifecycle tests before implementation.** Test create → activate → duplicate activation rejection; invalid, reused, and expired codes; disable; reissue invalidates the prior code; and admin credential file remains untouched.
- [x] **Step 4: Run the lifecycle tests and confirm the expected failures.** Run: `node --test server/accounts.test.mjs`. Expected: all new lifecycle assertions fail because storage behavior is not implemented.
- [x] **Step 5: Implement account storage in `server/accounts.mjs`.** Store `users.json` below `KRABAK_DATA_DIR`, ensure directory/file modes `0700`/`0600`, normalize email, hash passwords with the existing `scrypt` helper, store only a SHA-256 digest of a cryptographically random activation token, and write records atomically. Make activation single-use with a 24-hour expiry.
- [x] **Step 6: Run the full focused account tests and verify they pass.** Run: `node --test server/accounts.test.mjs`. Expected: all account lifecycle and password-policy assertions pass.
- [x] **Step 7: Commit the account-store unit.** Commit message: `feat: add admin-managed teacher account store`.

### Task 2: Role-aware API and account-scoped resources

**Files:**
- Modify: `server/index.mjs`
- Create: `server/auth-flow.test.mjs`
- Create: `server/authorization.mjs`
- Create: `server/authorization.test.mjs`
- Reuse: `server/accounts.mjs`, `server/auth.mjs`

**Interfaces:**
- `POST /api/activate` accepts `{ email, activationCode, password }` and returns `{ ok: true }` without a session cookie; the teacher then signs in explicitly.
- `POST /api/login` accepts either the unchanged admin credential or an active teacher credential; `/api/me` returns `{ user: { email, role } }`.
- `POST /api/users` is admin-only and returns the activation code once; `GET /api/users` returns only safe metadata; `POST /api/users/:id/disable` disables a teacher; `POST /api/users/:id/activation` reissues activation/reset code and revokes prior access. These routes never return hashes.
- `POST /api/host/register` requires a session and records `ownerEmail`; `GET /api/hosts` returns owner-scoped active Hosts (admin sees all).
- `GET /api/audit` returns own events for teachers and all events for admin.

- [x] **Step 1: Add failing HTTP integration tests.** Spawn the service with a temporary `KRABAK_DATA_DIR` and a dynamically reserved port; seed an admin fixture by writing a test-only hashed record. Cover activation/login/me/logout, unchanged admin login (including an existing symbol-containing test password), generic failure for unknown email/wrong/expired/reused activation code, admin-only account routes, signed-in-only Host registration, disabled-user revocation, reissued-code password reset, and activation without an automatic session.
- [x] **Step 2: Run the focused integration tests and confirm they fail for missing/incorrect behavior.** Run: `node --test server/auth-flow.test.mjs`. Expected: current single-admin API rejects teacher activation/login and has no role-scoped Host/user routes.
- [x] **Step 3: Add failing unit tests for pure ownership/audit filters.** Create `server/authorization.test.mjs` for teacher sees only their Host/audit rows, admin sees all, and missing/unknown roles are denied.
- [x] **Step 4: Run `node --test server/authorization.test.mjs` and confirm the expected failures.** Expected: the role/ownership helpers do not exist yet.
- [x] **Step 5: Implement role-aware authentication and endpoints in `server/index.mjs`; implement `canManageUsers(user)`, `visibleHosts(hosts, user)`, and `visibleAudit(events, user)` in `server/authorization.mjs`.** Keep existing request-size/origin/rate-limit checks; use generic login/activation errors; add a separate activation rate limit; assign role to sessions; enforce admin checks server-side; revoke sessions, active viewer connections, and owned temporary Hosts when an account is disabled or reset; filter hosts/audit by account.
- [x] **Step 6: Run the focused tests and verify they pass.** Run: `node --test server/auth-flow.test.mjs server/authorization.test.mjs`. Expected: all authentication, authorization, Host, and audit cases pass without changing current Host consent behavior.
- [x] **Step 7: Commit the API unit.** Commit message: `feat: add teacher activation and role-scoped APIs`.

### Task 3: First-visit login, activation, admin account UI, and visible logout

**Files:**
- Modify: `src/main.js`
- Modify: `src/styles.css`
- Modify: `src/icons.js` only if a missing icon is needed.

**Interfaces:**
- Add explicit `login`, `activate`, and admin-only `users` routes/views.
- On startup, resolve `/api/status` with the current session identity; unauthenticated initialized deployments route to login, not dashboard/demo.
- Login and activation forms call the API from Task 2. Profile/topbar exposes a directly visible logout button.

- [x] **Step 1: Implement login and first-use activation views.** Provide email/password login, an obvious “เปิดใช้บัญชี” route, password-rule guidance, and inline generic errors; never persist passwords/activation codes in localStorage.
- [x] **Step 2: Implement the admin account-management view.** Admin can create an email, view/copy a newly issued activation code once, list only safe account status, disable users, and reissue activation/reset codes. Teachers must not see the management navigation or view.
- [x] **Step 3: Add a visible logout action beside the signed-in identity.** After logout, clear account state, call `/api/logout`, and navigate to login; handle network failure without leaving the UI appearing signed in.
- [x] **Step 4: Prevent unauthenticated dashboard flash.** Render a loading state until `/api/status` resolves; send unauthenticated users to login, and show a backend-unavailable state rather than a demo page.
- [x] **Step 5: Run `npm run build`.** Expected: Vite build succeeds with no missing route/module references.
- [x] **Step 6: Commit the auth UI unit.** Commit message: `feat: add teacher login activation and logout UI`.

### Task 4: Replace demo fixtures with real active Host data and empty states

**Files:**
- Modify: `src/main.js`
- Delete: `src/data.js`
- Modify: `src/styles.css`
- Create: `server/demo-content.test.mjs`

- [x] **Step 1: Add an explicit source scan/check for fake fixture identifiers and demo-only action labels.** Pin that `KRABAK-OFFICE-01`, `KRABAK-TEACHER-02`, sample student rows, “DEMO MODE”, and demo-remote entry points are absent from the production client source/build.
- [x] **Step 2: Run the check and confirm it fails against the current fixtures.** Expected: it finds the sample device IDs/labels and fake desktop data.
- [x] **Step 3: Replace fixture-backed devices and activities with `/api/hosts` and real server audit events.** Show only currently connected real Host registrations. Remove the unused static app metadata module along with all fictional inventory.
- [x] **Step 4: Remove demo-only screen, fake chat/files, fake activity, synthetic counts, and demo labels/actions.** Preserve actual browser Host/Viewer share, real consent, and pairing-code flow.
- [x] **Step 5: Add honest empty states.** When no active Host or audit event exists, show no device/activity rows plus the real “share this device”/“pair using code” actions. Never create fake offline history.
- [x] **Step 6: Re-run the fixture check and `npm run build`.** Expected: the named demo records/actions are absent from the compiled client and Vite succeeds.
- [x] **Step 7: Commit the production UI cleanup.** Commit message: `feat: remove demo content from production interface`.

### Task 5: Documentation and end-to-end acceptance

**Files:**
- Modify: `README_TH.md`
- Modify: `docs/SECURITY.md`
- Modify: `docs/FEATURE_MATRIX.md`
- Modify: `docs/ARCHITECTURE.md`

- [x] **Step 1: Update docs.** Describe admin-provisioned teacher activation, roles, password policy, 24-hour one-time code, session lifetime, active-only Host inventory, no public signup/SMTP, no demo UI, and the remaining Windows Agent limitation.
- [x] **Step 2: Run `npm run build`, `npm test`, and the deploy receiver tests.** Expected: all tests and production build pass.
- [x] **Step 3: Run local acceptance checks.** A hidden browser tab confirmed the login-first page and accessible account controls; backend integration tests cover admin login compatibility, teacher create/activate/login/logout, role isolation, Host registration/consent, and revocation using test-only credentials. No production credentials were used.
- [x] **Step 4: Review all diffs and secrets.** Confirm existing admin credential data is not in the repository, no activation/password values are in logs/files, and only the design/plan/source/docs in this scope changed.
- [x] **Step 5: Commit documentation and acceptance updates.** Commit message: `docs: document teacher accounts and demo-free app`.
- [x] **Step 6: Push the completed feature to `main` as explicitly requested.** GitHub Actions must run verification/build and the production deploy job; confirm both job results and verify the live HTTPS app and VPS service afterward. If verification fails, do not claim deployment succeeded.

## Execution notes

- Keep all implementation changes scoped to the approved design and this repo.
- The design file is currently untracked alongside this plan; include both in the final reviewed change set.
- Do not edit VPS files manually for this feature; use the approved GitHub Actions deployment path.
- The currently live source has the earlier proxy-IP fix even though that earlier Actions run skipped Deploy. A successful feature run will deploy the full current `main` artifact.
