# Mobile Controller Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow phones to act as viewers/controllers while preventing them from sharing a screen or registering as a remote-control target.

**Architecture:** Add shared browser mobile detection and independent server request classification. Keep viewer/session APIs unchanged; block only Host creation and Host WebSocket roles, and remove mobile share affordances.

**Tech Stack:** Vanilla JavaScript, Node.js HTTP/WebSocket server, `node:test`, Vite.

**Spec:** `docs/superpowers/specs/2026-11-19-mobile-controller-only-design.md`

## Global Constraints
- Mobile viewers can request and control desktop Windows Agents after the existing Host consent.
- Mobile devices cannot register a browser Host, enroll as a Windows Agent target, or open a Host WebSocket role.
- Desktop browser sharing and Windows Agent behavior remain available.
- Do not weaken consent or alter login/session security.

## Review Focus
- iPadOS Safari desktop UA must still be detected from MacIntel plus touch points; test this signature.
- Mobile viewer WebSocket/session access must remain allowed; test a mobile viewer receiving a Host invite.
- A mobile Host must be rejected even when it bypasses hidden UI; test API and WebSocket paths.
- Desktop browser and Windows Agent enrollment must remain functional; retain existing suite coverage.
- Mobile-only headers must not accidentally change ordinary viewer API requests; test allowed pairing from mobile.

---

### Task 1: Server Host policy

**Files:**
- Create: `server/mobile-policy.mjs`
- Modify: `server/index.mjs`
- Test: `server/auth-flow.test.mjs`

**Interfaces:**
- Produces `isMobileRequest(req)` using `x-krabak-device-class`, `sec-ch-ua-mobile`, and mobile User-Agent patterns.

- [x] Add tests proving mobile browser Host registration and mobile Agent enrollment return 403.
- [x] Add a WebSocket test proving mobile `agent-hello`/`host-hello` cannot become a Host, while mobile `viewer-hello` can receive a pairing invite.
- [x] Run the focused tests and confirm expected failures.
- [x] Implement the server predicate and guards for `/api/host/register`, `/api/agents/enroll`, and Host WebSocket roles.
- [x] Run the focused tests, then `npm test`.

### Task 2: Browser mobile detection and UI

**Files:**
- Create: `src/device-class.js`
- Modify: `src/main.js`
- Test: `server/mobile-policy.test.mjs`

**Interfaces:**
- Produces `isMobileBrowser(navigatorLike)` and mobile request headers for browser API calls.

- [x] Add unit cases for Android, iPhone, iPadOS desktop-UA/touch, and desktop.
- [x] Run tests and confirm the new mobile/iPad cases fail before implementation.
- [x] Hide browser Host navigation/actions on mobile and show a short viewer-only note on the Host route.
- [x] Guard `startHost()` on mobile and mark mobile requests for server enforcement.
- [x] Run the complete test suite and `npm run build`.

### Task 3: Deploy and verify

- [ ] Review the diff and confirm no secrets or unrelated files are staged.
- [ ] Commit the change and push to `main` under the already authorized Auto Deploy flow.
- [ ] Verify GitHub Actions deployment, VPS service health, and the production frontend response.
- [ ] Keep the browser on the device page; request a fresh Agent pairing attempt from the user to verify the consent dialog and live video.
