# Production Readiness and MFA Design

## Goal

Move KRABAK Remote Manager authentication from password-only to mandatory MFA for administrators and teachers, and make the Windows Agent release path capable of producing a verifiably signed production artifact. Keep the existing consent gates, user-mode execution, and trusted-access server flag unchanged.

## Decisions

- Use RFC 6238 TOTP with authenticator apps. Require setup on the first successful password login for every account, including the existing administrator.
- Issue ten random, single-use recovery codes after enrollment. Show them once, store only hashes, allow regeneration after a fresh TOTP check, allow MFA re-enrollment after proving a current TOTP or recovery code, and consume each code on successful use.
- Store TOTP secrets encrypted with AES-256-GCM under a random 32-byte key in the private data directory. Keep file permissions restricted and use the account email as authenticated context.
- Use a short-lived, HttpOnly MFA challenge cookie that cannot access normal APIs or WebSockets. Grant the normal session only after valid TOTP or recovery code.
- Keep the current consent requirements and leave `KRABAK_AGENT_TRUSTED_ACCESS_ENABLED` disabled. MFA alone does not enable unattended control.
- Keep pull-request/branch builds clearly marked as unsigned development builds and do not publish their binaries. Add a stable-tag-only production release job that fails closed unless Microsoft Artifact Signing Public Trust, GitHub OIDC, and protected environment values are configured. Verify the resulting Authenticode signature and timestamp before publishing a release.
- Do not claim a production signed binary until the Artifact Signing Public Trust profile is configured and the release job succeeds. No signed production Agent release is currently available.

## Authentication flow

1. Password verification creates a five-minute MFA challenge, never an authenticated session.
2. An account without MFA can only request a TOTP setup secret and verify the first code. The server then persists the encrypted secret and recovery-code hashes.
3. An enrolled account must provide a current TOTP or unused recovery code.
4. Successful verification creates the existing eight-hour HttpOnly session and clears the challenge cookie.
5. A recovery code is removed from storage atomically on use. Recovery-code replacement requires a fresh TOTP.
6. Reissuing a teacher activation resets that teacher's MFA state along with its password; the next password login requires MFA enrollment again.

## Data and security

- Existing `admin.json` and `users.json` remain outside the web root with mode `0600` in a mode `0700` data directory.
- New `mfa.key` is mode `0600` and must be backed up with `admin.json` and `users.json`; restore all three together. Losing `mfa.key` requires MFA re-enrollment.
- Do not log challenge tokens, TOTP secrets, recovery codes, or MFA request bodies.
- Apply bounded attempt limits to password login and MFA verification. Reject expired challenges and destroy a challenge after repeated failures.
- Authenticate TOTP comparisons in constant time and accept only the current 30-second step plus one adjacent step on either side.
- Persist recently used TOTP counters to prevent replay within the accepted time window.
- Keep the server's rate limits and session storage behavior otherwise unchanged; this change does not constitute an independent penetration test or full security certification.

## Production release path

- CI compiles an unsigned development build for code review only and does not publish that binary.
- A stable version tag builds the release binary with production metadata, signs it through Microsoft Artifact Signing using GitHub OIDC, verifies the public-trust Authenticode signature and RFC 3161 timestamp, and packages the signed executable.
- Protected environment `code-signing` requires `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` secrets; endpoint, account, and certificate-profile names are environment variables. The Entra federated credential and Certificate Profile Signer role must be restricted to this repository/environment.
- If these secrets are absent, a production-tag workflow fails before release publication. The app and docs must not offer an unsigned binary as a production build.

## Out of scope

- Creating/configuring an Artifact Signing Public Trust resource and its Entra/GitHub OIDC identity; this may incur Azure charges and requires identity validation.
- Enabling unattended same-account control, Windows auto-start, service mode, or bypassing host consent.
- Claiming touchscreen-native input, UAC/secure-desktop access, multi-monitor streaming, durable server-side audit, TURN, or a complete third-party security certification.

## Acceptance criteria

- Password alone never creates a regular web session.
- An existing admin and a new teacher are both forced through TOTP enrollment before seeing the app.
- Enrolled accounts cannot access the app or WebSocket using only the password challenge.
- TOTP login succeeds; invalid codes fail; each recovery code works once and then fails; old recovery codes stop working after rotation.
- A previously accepted TOTP time step cannot be replayed; MFA reset requires a current TOTP or unused recovery code and invalidates all sessions.
- MFA secrets are encrypted at rest; recovery codes are stored as hashes; MFA data is absent from API user listings.
- Teacher activation reissue clears that teacher's MFA material.
- UI offers first-time TOTP enrollment, login verification, one-time recovery-code display, and recovery-code rotation.
- Development builds remain labelled unsigned/development. Production artifacts require a successful signature verification.
