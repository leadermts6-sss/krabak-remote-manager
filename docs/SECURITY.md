# Security notes — read before opening to the Internet

## What is implemented

- Single admin login with scrypt hashing and random salt; secure HttpOnly SameSite Strict cookie (Secure when HTTPS proxy reports HTTPS)
- Session token random 256 bits; in-memory, expires in 8 hours idle
- Origin checked on POST/WS; bounded JSON/WS messages; login/host registration rate limits
- Host registration requires 8-char random pairing code, expires after ~15 minutes; host must confirm every browser share
- Viewer can only access session whose admin account issued the request; host can end or reject
- WebRTC DTLS-SRTP media; WebRTC DataChannel for files; no media file storage by backend
- Backend defaults to localhost port 8787. **Do not expose port 8787 publicly**
- No default admin account/password
- Source does not include user credentials or private keys

## NOT yet production-ready for unattended remote administration

- No MFA/RBAC/per-device ACL, no durable device identity, no per-user audit retention, no distributed session store
- Same-IP brute-force rate limiting is in-memory; use WAF/reverse-proxy rate limits and fail2ban policy
- No separate Windows EXE/Agent for true OS input control. The web demo must never be misrepresented as an installed remote desktop service
- No OS clipboard integration; no host file-system access
- No load balancing or HA; one Node process, sessions lost on restart
- WebSocket protocol supports small JSON frames only, not binary/continuations. Bulk files intentionally use RTC DataChannel
- Stun-only cross-network connections can fail. Configure `coturn` for TURN before large-scale use
- For TURN, use `KRABAK_TURN_SECRET` with coturn `use-auth-secret` and time-limited credentials, **not long-lived static password exposed in public /api/status**
- Browser screen capture requires HTTPS and active user gesture; never bypass permission prompts
- Be careful with secure desktop/UAC/credential prompts; do not implement bypasses

## Checklist before production

1. Create a new dedicated domain; enable valid HTTPS with aaPanel's SSL and HTTP→HTTPS redirect
2. Create unprivileged Linux user; store `.local-data` outside web root; protect with `0700` and `0600`
3. Set systemd environment including `KRABAK_PUBLIC_ORIGIN` and `KRABAK_TRUST_PROXY=1`, pin Node LTS
4. Run threat modeling, penetration testing, code audit, and dependency updates
5. Add MFA, per-device grants, admin and device revocation, short access tokens, persistent Postgres/MariaDB for audit
6. Run TURN with network egress limits/quotas and rotate shared secret; block abuse
7. Add stricter frontend CSP after removing inline style attributes and dynamic styles; use SRI for any external libraries
8. Add consent banner and visible disclosure on every connected Windows device
9. Add backup of admin config, database, audit, restore drills; avoid storing password in scripts
10. Restrict panel/admin endpoints via VPN or IP allowlist; aaPanel port 21537 remains separate
11. Configure log retention, error alerts and outage detection without logging device secrets/session codes
12. If deploying Agent, signed builds, user permission, per-app grants, uninstall, update signature validation

## Threat model

A pairing code is a temporary invitation, not a permanent device identity; anyone who learns the code *and* has admin login can issue a request, but Host must approve and choose a source. Do not implement unattended access by disabling consent. Avoid recording or monitoring users without their knowledge.
