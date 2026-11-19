# KRABAK Windows Agent {{VERSION}}

This is the first public production-channel release of the Windows Agent. The ZIP is self-contained for Windows x64 and was built by GitHub Actions from the source commit listed below.

## What it does

- Shares one selected display with a signed-in controller.
- Sends real mouse and keyboard input through the Agent's allowlisted controls.
- Requires native Windows consent for requests from another account; the server's trusted same-account mode is disabled by default.
- Shows an active-session window with a stop action. It does not install a Windows service or start automatically.

## Current limits

- One display at a time; no native touch input, clipboard transfer, file transfer, UAC/secure desktop, or control of elevated applications.
- The Agent runs in the logged-in Windows user's session and requires the Agent process to be open.
- Browser-only screen sharing remains view-only.

## Security and signature status

The executable is not signed with Authenticode. Windows may show Unknown Publisher or a SmartScreen warning. Check SHA256SUMS.txt before extracting. Do not disable SmartScreen or endpoint protection. Use this Agent only on computers you own or are authorized to control.

Source commit: {{SOURCE_COMMIT}}

- [Code signing policy](https://github.com/leadermts6-sss/krabak-remote-manager/blob/main/CODE_SIGNING_POLICY.md)
- [Privacy notice](https://github.com/leadermts6-sss/krabak-remote-manager/blob/main/PRIVACY.md)
- [Source repository](https://github.com/leadermts6-sss/krabak-remote-manager)
