# Windows Agent Control Design

## Problem and goal

The live browser application is correctly marked view-only because it has no process that can inject input into Windows. Implement a separately installed, user-mode Windows Agent so an enrolled owner can view and control an online Windows device from the Remote Manager. Keep browser-only sharing available and do not label it as OS control.

## User-visible behavior

- An Admin or Teacher can create a short-lived one-time enrollment code in the account UI. The user enters it into the Agent on the Windows device. The code is consumed once; the server stores only a hash of the Agent bearer token.
- The Agent stores its token protected for the current Windows user with DPAPI and connects over TLS WebSocket. It runs without elevation and does not create an auto-start entry unless the user explicitly enables it.
- Enrolled online devices appear only to their owner (Administrators retain the existing administrative visibility). The owner may start a session directly without a second prompt after explicitly enabling trusted same-account access in the Agent.
- This trust choice is the requested behavior, but the current app has no MFA. Treat the feature as development/pilot-only; production rollout remains gated on MFA and a signed Agent package.
- A different account can only request access using the Agent's rotating pairing code. The Agent displays a centered native consent dialog over other windows. Until accepted, it sends no screen frames and accepts no input. Denial and timeout close the request.
- During every active session, a topmost Agent status window identifies the connected account and offers an always-visible Stop button. Stop immediately closes capture, ends the server session, and releases pressed keys/buttons.
- The viewer offers Mouse and Touch modes. Mouse mode moves the actual Windows pointer; Touch mode maps pointer/touch gestures to real Windows mouse events. Keyboard events are sent only while the user focuses the remote stage. This first version does not synthesize native Windows touchscreen contacts.
- The first implementation captures one selected monitor. Per-window capture, simultaneous multiple monitors, native touch injection, clipboard, file transfer, elevation/UAC desktop, and unattended service operation are out of scope.

## Architecture

- A .NET 10 Windows Forms tray application runs as the signed-in Windows user. It uses Windows screen enumeration and GDI screen capture through the Windows Forms drawing APIs to capture one selected monitor, a bounded JPEG pipeline, Win32 SendInput for mouse/keyboard, TLS WebSocket for control, and Windows DPAPI for its enrollment token.
- The existing Node service adds an atomically written Agent registry under KRABAK_DATA_DIR, enrollment/revocation APIs, owner-scoped device listing, and a distinct authenticated Agent WebSocket role.
- Agent frames are JPEG payloads on the existing authenticated WSS session with a strict size/rate cap. They are relayed only to that Agent's current approved viewer session. Input events are validated by type/range and relayed only in the reverse direction after session approval. No frame or input is stored or audited as content.
- A same-owner request for an enrolled device is auto-approved only because Agent enrollment includes an explicit trust choice. A cross-account request still requires the native Agent consent dialog. Existing temporary browser Host pairing and browser picker behavior remain unchanged.
- Session end, socket loss, account disable, Agent revocation, and local Stop revoke the active session and release injected input state. Disabled accounts cannot authenticate Agents or start sessions.

## Security boundaries

- Never accept commands, shell text, file paths, process names, clipboard data, or arbitrary key sequences from the network. The protocol is a small allowlist of mouse move/button/wheel and key down/up events.
- Enforce ownership in API and WebSocket handlers, not in UI. Agent tokens are random, hashed at rest, revocable, and scoped to one device and owner. Pairing codes are short-lived and rate-limited.
- Bound WebSocket message size, JPEG bytes, frame frequency, coordinate ranges, event rate, session duration, and pending approvals. Agent connections require TLS and exact same-origin policy.
- Keep the Agent unprivileged. Windows UIPI means it cannot control higher-integrity or secure desktops; document that limitation.
- Release binaries must be signed and the updater must verify signatures. No code-signing certificate is available in this task, so an unsigned development artifact must not be advertised as a production installer or auto-run on school computers.
- Because this expands account compromise impact and the application currently has no MFA, same-account automatic approval must not be enabled for a production rollout until MFA and a security review are complete.

## Alternatives considered

1. Hide the view-only warning or synthesize clicks in browser JavaScript: rejected because that does not control Windows and would misrepresent behavior.
2. Keep browser capture and use a browser extension: rejected because it adds a separate privileged surface and still needs explicit installation and approval.
3. Build a native Agent: selected because actual OS input requires a local process. A bounded JPEG/WebSocket alpha is simpler to integrate with the current server than introducing a new WebRTC media stack into this small repository; frame caps and deployment safety are mandatory.

## Acceptance criteria

- Tests prove enrollment is one-time, Agent credentials are stored as digests, ownership is enforced, owner requests are approved according to trust policy, foreign-account requests remain pending, revocation closes sessions, and malformed/oversized input is rejected.
- Windows Agent builds for x64, does not require administrator rights, stores no plaintext long-lived credential, and exposes a visible Stop action during sessions.
- Viewer Mouse and Touch modes transmit only allowlisted input; video frames render from the real Agent capture path.
- Existing browser Host consent and session tests continue to pass.
- CI builds/tests the Node app and Windows Agent. Production web deployment may proceed through the already authorized main workflow after verification. The Agent is not production-ready until MFA, signed packaging, and installation on a target Windows device are complete.
