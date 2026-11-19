# Implementation Plan: Production MFA

> **For Codex:** Follow this plan sequentially. Preserve the existing working tree and do not stage unrelated `.planning/` files.

**Goal:** Enforce TOTP MFA for every web account, add safe recovery, and add a fail-closed signed Windows Agent release path.

**Architecture:** Node `crypto` implements TOTP and AES-256-GCM without a runtime dependency. MFA challenges are short-lived and separate from authenticated sessions. Admin/teacher files keep encrypted TOTP material and recovery-code hashes. The frontend handles enrollment, challenge, and one-time recovery codes. GitHub Actions publishes a stable-tag production Agent only after Microsoft Artifact Signing, Authenticode trust-chain, and timestamp verification.

**Stack:** Node.js 20+, Vite/Vanilla JS, .NET 10 WinForms, GitHub Actions.

## Steps

1. Add unit coverage for TOTP vectors, skew, one-time recovery hashes, and secret encryption round-trip.
2. Extend admin and teacher stores with MFA enrollment, recovery-code rotation, and reset behavior.
3. Change password login into a five-minute challenge flow; add enrollment, verification, cancel, and recovery-code rotation APIs with rate limits.
4. Add login/enrollment/recovery UI and account security settings.
5. Update Agent text/docs and add stable-tag signing workflow with Microsoft Artifact Signing over GitHub OIDC and signature/timestamp verification.
6. Run targeted authentication tests, the existing Node test suite, Vite build, and Windows Agent build if the SDK is available. Review the diff, commit, push to the authorized deploy branch, and inspect CI/deployment status.

## Guardrails

- Do not log or persist plaintext TOTP/recovery secrets outside the initial API response.
- Do not change pairing consent, trusted-access policy, UFW, production domains, or auto-start behavior.
- Do not label an unsigned artifact production-ready.
- Do not stage the pre-existing untracked `.planning/` directory.
