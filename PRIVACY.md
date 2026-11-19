# Privacy notice

This notice describes the KRABAK Remote Manager website and Windows Agent. The source of truth is the public repository and its [security documentation](docs/SECURITY.md).

## Data handled by the service

When a user operates the hosted KRABAK service, the backend processes account email addresses, authentication/MFA state, device names and enrollment metadata, session requests, consent decisions, connection status, and audit events needed to operate the service and enforce access policy. Credential secrets are stored using the controls described in the security documentation.

The Windows Agent connects only to the service URL configured by the user (the public release is documented for https://remote.krabak.ac.th). Enrollment sends the one-time enrollment code, device name, and account session to that service. After enrollment, the Agent stores its device token using Windows DPAPI for the current Windows account and uses it to authenticate to the same service.

## Remote session data

The Agent sends screen frames to the selected viewer and receives allowlisted mouse or keyboard input only during a remote session. Requests from another account require approval in a native Windows consent window. The Agent displays an active-session window with a stop control. The service uses WebSocket/WebRTC signaling and session metadata to establish the connection. The backend does not persist screen media or transferred files.

## Collection and sharing

The project does not include analytics or advertising telemetry in the Windows Agent. Session data is not sent to an unrelated analytics service. The service operator and network providers may process connection metadata according to their own policies. Users should review the policy of the hosting provider and any explicitly configured TURN/STUN provider when those services are used.

## User control

Users choose the service URL, enroll and revoke devices, initiate or approve remote sessions, and can stop an active Agent session. The Agent does not run as a Windows service and does not start automatically. Use it only on computers you own or are authorized to control.
