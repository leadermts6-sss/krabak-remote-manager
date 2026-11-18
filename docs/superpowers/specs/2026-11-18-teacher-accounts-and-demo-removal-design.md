# Teacher Accounts and Demo Removal — Approved Design

**Status:** Approved for implementation; feature branch implementation and verification are complete. Push and deployment are tracked in the execution plan.

## Intent

Make KRABAK Remote Manager usable by school staff with individual teacher accounts controlled by the administrator. Remove simulated/demo content from the production UI so that it never presents fictional computers, sessions, activity, or desktop images as real.

## What exists today

- The backend supports one administrator credential in `admin.json`; there are no teacher accounts or roles.
- Login sessions are random, HttpOnly cookies held in memory and expire after eight hours idle. A service restart requires users to sign in again.
- The current UI imports seven fictional devices and sample activity/chat data, provides a demo remote screen, and can render the dashboard before authentication.
- Live browser screen sharing exists, but it is view-only and requires the Host's browser consent. The backend does not keep a durable device inventory. There is no Windows Agent for OS mouse/keyboard control.

## Goals

1. Keep the existing administrator account and add administrator-managed teacher accounts.
2. Put sign-in on the first unauthenticated page, with no public self-registration.
3. Let an administrator create a teacher account using the teacher's email and a one-time activation code. The teacher uses the code once and chooses their own password.
4. Give the teacher an individual session identity and restrict teacher access to account-administration functions.
5. Make logout directly accessible beside the signed-in email/name in the top bar.
6. Remove all fictional data and demo-only controls from the production app. Use honest empty states until real data exists.
7. Show active real Host sessions belonging to the signed-in account; do not invent offline devices or persist an inventory in this phase.

## Non-goals for this change

- Windows Agent, OS-level mouse/keyboard/touch control, unattended access, persistent device inventory/offline-device history, or changing the current Host consent rules.
- Public account registration, email delivery/SMTP, password-reset email, MFA, tenant sales/billing, or multi-server session storage.
- Changing or replacing the existing administrator password/credential file.

The app must continue to describe browser screen sharing accurately as view-only. Same-account login must not bypass the Host's browser picker or consent prompt in this change.

## Approaches considered

1. **Admin issues a one-time activation code; teacher chooses a password — selected.** The admin controls which email may join but never learns the teacher's password. This matches the user's choice and avoids shared credentials.
2. Admin creates a temporary password and forces a password change. This is simpler initially, but the administrator handles a password that may be reused or exposed during handoff.
3. Open self-registration. Rejected because the user wants the administrator to create/approve every teacher account.

## Proposed behavior

### Login and logout

- Opening the site without a valid session shows the login page before any dashboard or device data.
- Login accepts the account email and password. On success, redirect to the dashboard and expose the signed-in email/name and a visible logout action in the top bar.
- Logout invalidates the current session server-side, clears the cookie, and returns to login.
- Admin and teacher sessions use the existing eight-hour idle timeout and secure cookie attributes. Sessions remain in memory for this phase; a VPS service restart will require re-login.

### Teacher account lifecycle

- Only the administrator can create, list, disable, and reissue activation for teacher accounts.
- Account creation records a normalized email and creates a cryptographically random activation code. Display the plaintext code to the administrator once; store only a hash. Do not email it because no mail service is configured.
- The teacher opens the visible activation option from the login page, enters their email and code, and sets a password. After activation, redirect to login so the teacher signs in explicitly. A code is single-use and expires after **24 hours** (approved default).
- The account record stores a salted password hash, role `teacher`, status, and timestamps under the protected server data directory with restrictive file permissions. No plaintext password or activation code is logged. Admin can issue a replacement code for pending or active accounts; a refresh failure must not hide a newly issued one-time code.
- Disabling an account revokes its active in-memory sessions, authenticated WebSockets, and temporary Host registrations. Reissuing activation invalidates any previous unused code. For password recovery, an administrator may reissue a code to an active account; the account becomes pending and its old sessions are revoked until the teacher sets a new password.
- The existing administrator login continues to use the existing credential record and validation; teacher password policy must not lock out or silently alter the admin account.

### Approved password rule

- For teacher passwords, accept only ASCII letters and digits (`A–Z`, `a–z`, `0–9`), require at least one letter and one digit, and reject spaces/symbols.
- Approved length: **12–128 characters**. The user asked for letters and numbers only; the minimum length is retained as a security requirement.
- Keep salted `scrypt` password hashing and generic login/activation errors. Apply rate limits to login and activation attempts.

### Administrator and teacher permissions

- Admin retains the existing system functions and gains a visible teacher-account management page.
- Teacher can sign in and use the existing authenticated viewer/session functions, but cannot create, disable, or manage accounts or access administrator-only operations.
- The session identity and audit actor must be the individual account email, not a shared administrator identity.
- Host registration requires a signed-in account and records that account as the temporary Host owner. `GET /api/hosts` returns only that teacher's currently connected Hosts; an administrator may view all currently connected Hosts. The list is ephemeral and disappears when the Host disconnects or the server restarts.
- Teachers see only their own audit events; administrators can see all audit events. This is the least-privilege policy for the current audit screen.
- Entering another user's pairing code still sends a request to the Host and requires the Host's approval. Same-account login does not bypass browser consent/picker prompts; unattended trusted access remains a Windows Agent phase.

### Remove demo content

- Remove the seven sample device records, fake device counts/activity, simulated chat/file records, fake remote-desktop preview/data, demo-mode labels, and buttons that open a demo session.
- Remove any sample student names or other example rows rendered as if they were a live desktop.
- Preserve real browser Host/Viewer sharing and real pairing-code flow. Empty device/activity views must say that no real devices/events are available; they must not fabricate offline or online records.
- This change does not add durable device inventory. The device page may remain empty except for active real browser hosts once they are actually registered; disconnected/offline devices will not persist until a later Agent/inventory phase.

## Constraints and safeguards

- Preserve the current admin account and data directory; deployment must not overwrite account data.
- Keep public self-registration disabled; never return activation codes from list APIs after creation.
- Keep Host consent and browser screen-capture prompts. Do not claim OS control until a signed Windows Agent exists.
- Do not alter VPS firewall, SSH, Nginx, or unrelated school websites.
- CI must cover account creation, one-time activation, password validation, role boundaries, login/logout, account revocation, and absence of demo fixtures. Deployment remains gated on successful CI and targets `main` only.

## Acceptance checks

- Unauthenticated visits land on a real login page; no demo dashboard or fake devices appear.
- Admin can create a teacher email and receives a code exactly once; valid activation works once before expiry, invalid/reused/expired codes fail.
- Teacher can sign in using the chosen password rule, receives a teacher role, and cannot access admin-only endpoints.
- Existing admin credentials continue working unchanged.
- Logout visibly ends the session; reloading the page returns to login.
- With no registered real device/activity, the app shows empty states, not synthetic data.
- Real browser sharing still requires the Host's current consent flow and remains view-only.

## Approved builder decisions

- Teacher password policy: 12–128 ASCII letters/digits, requiring both classes.
- Activation code expiry: 24 hours, single-use.
- Teacher account storage: protected file under `KRABAK_DATA_DIR`; database migration is deferred.

## Builder review decisions

The independent builder review identified two questions. They are resolved here using the prior request for same-account device lists and a least-privilege default:

- Host registration is account-authenticated and tagged to its owner; teachers see their own active Hosts, while admin can see all active Hosts.
- Audit visibility is per-teacher, with admin-wide visibility.

These decisions were approved for implementation. The later UX request also requires a centered Host consent popup when a request arrives on another app route; it must not bypass the browser source picker.
