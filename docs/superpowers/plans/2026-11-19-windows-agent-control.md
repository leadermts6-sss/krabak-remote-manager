# Implementation Plan: Windows Agent Control

**Target repository:** leadermts6-sss/krabak-remote-manager
**Branch:** codex/windows-agent-control
**Design:** docs/superpowers/specs/2026-11-19-windows-agent-control-design.md

## 1. Establish tests and protocol limits

- Add focused Node tests for Agent registry persistence, random enrollment token digest, one-time enrollment, expiry/rate limit, device ownership, revoke, and cross-account access policy.
- Add WebSocket flow tests for Agent authentication, same-owner auto approval, foreign-owner pending approval, owner-only input/frame relay, session end, revocation, oversized frame rejection, malformed input rejection, and existing browser Host consent regression.
- Keep each test failing before its implementation. Use small pure validation helpers for device tokens and input frames.

## 2. Implement persistent Agent identity

- Add server/agents.mjs with atomic JSON writes under KRABAK_DATA_DIR, restrictive directory/file modes, random 256-bit bearer tokens stored only as SHA-256 digests, one-time 10-minute enrollment codes, owner-scoped listing, token lookup, and revocation.
- Add enrollment start/activate and owner/admin revoke API routes. Enrollment activation must be usable by a native client without a browser cookie, be Origin-restricted/rate-limited, and return the long-lived token only once.
- Merge online Agents into GET /api/hosts without exposing token digests or pairing secrets. Preserve the existing browser Host route and cross-account consent semantics.

## 3. Add authenticated Agent sessions and bounded relay

- Extend server WebSocket auth with an Agent-only role authenticated by its token digest. Require TLS in production and retain existing Origin validation.
- Allow owner sessions only to the enrolled owner after explicit Agent trust enrollment; allow another account only through that Agent's temporary code and require a native Agent decision.
- Route JPEG frames only from the authenticated Agent to its one approved viewer; enforce exact encoded-size and frame-rate caps. Route only allowlisted pointer/button/wheel/key events from the approved viewer to the matching Agent; validate coordinate and key ranges server-side.
- End and clean sessions on socket loss, timeout, account disable, device revoke, browser logout, or Stop. Record session metadata, not screenshot/input content.

## 4. Add viewer and account UI

- Add Agent enrollment and revoke controls to the signed-in user's device page; show the one-time code only until dismissed and explain that it must be entered in the Agent.
- Show actual Agent vs Browser Host, owner, online state, and active session. Do not show sample devices or unowned device inventory.
- Let the same owner start an Agent session directly; retain pair-code request flow for foreign accounts and pending state until native consent.
- Render relayed JPEG frames in the existing remote stage; add Mouse/Touch mode controls and map browser pointer/touch and keyboard events into a strict allowlist. Keep Browser Host sessions labeled view-only.
- Ensure active session close/Stop clears the image and releases network state; never present browser-only sessions as OS control.

## 5. Build the Windows Agent

- Add a .NET 10 Windows Forms x64 project with first-run consent, enrollment-code flow, DPAPI-protected device token, monitor selector, visible connected status, and centered native approval popup for foreign accounts.
- Capture only the selected monitor at bounded resolution, JPEG quality, and frame rate. Send images only after the server signals an approved session.
- Implement only mouse move/button/wheel and keyboard key-down/up with Win32 SendInput; validate all incoming fields and release any held keys/buttons on stop/error/disconnect.
- Run in user context without elevation; no service, autostart, file transfer, clipboard, arbitrary command handler, or updater in this iteration.
- Add Windows CI build artifact labeled development/unsigned. Do not create a production download link while no signing certificate is configured.

## 6. Documentation and CI

- Update README_TH.md, SECURITY.md, ARCHITECTURE.md, FEATURE_MATRIX.md, and GitHub Actions deployment docs with actual Agent capabilities, account/consent behavior, limits, install/build instructions, signing/MFA rollout gates, and migration-free registry storage.
- Keep release receiver allowlist limited to the existing web artifact. Do not deploy executable Agent binaries through the Node web archive.
- Add a Windows runner job to build Agent, plus backend/frontend and Python release-receiver tests. Verify agent output is not accidentally included in production website archive.

## 7. Verify, publish, and inspect

- Run Node tests, release-receiver tests, frontend build, .NET restore/build/publish, static secret/artifact checks, and review full Git diff.
- Commit and push only target-repository files after all checks pass. Prior explicit authorization permits main auto-deploy; if deployment trigger or tests fail, stop and report rather than bypassing the workflow.
- Inspect workflow deployment result and validate the live app through the browser. Do not claim Windows control works on target computers without installing the Agent there and testing a real session.
- Only after verification, hibernate the Windows computer if available without risking unfinished work.

## Safety notes

- No edits to krabak.ac.th, school.krabak.ac.th, student.krabak.ac.th, school data, production site content, or databases.
- No Password Authentication/SSH/firewall changes.
- No unsigned production installer, no bypass of Host consent, no arbitrary shell or file execution over the network.
- Same-account unattended approval is a requested trust behavior but remains a production rollout blocker until MFA and security review are complete.
