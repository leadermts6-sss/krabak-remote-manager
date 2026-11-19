# Code signing policy

## Current status

KRABAK Windows Agent v0.1.0 is unsigned. The project does not currently have an active SignPath subscription or a SignPath Foundation certificate. The application has not been submitted yet. No signature is claimed for the released executable.

The attribution required if a SignPath Foundation subscription is approved is:

> Free code signing provided by SignPath.io, certificate by SignPath Foundation

This attribution is prospective and does not mean signing is active. Windows users should verify the SHA-256 checksum published with each release and should not disable SmartScreen or endpoint protection.

## Project and release responsibilities

The public source of truth is [leadermts6-sss/krabak-remote-manager](https://github.com/leadermts6-sss/krabak-remote-manager). The project is maintained by the repository owner, [leadermts6-sss](https://github.com/leadermts6-sss).

- **Authors:** leadermts6-sss may commit source changes to the repository.
- **Reviewers:** leadermts6-sss reviews contributions from people without direct commit access before merge.
- **Approver:** leadermts6-sss will manually approve or reject each signing request if SignPath is approved and configured.
- Only binaries built by the repository's GitHub Actions from this source repository may be considered for signing. Locally built or third-party binaries will not be submitted.
- Before enabling signing, every maintainer with GitHub or SignPath access must have MFA enabled on both services; this status must be verified.

## Build and release

The release workflow validates the source, builds the production-channel Windows x64 Agent on a GitHub-hosted runner, records the source commit, and publishes the ZIP and SHA-256 checksum to [GitHub Releases](https://github.com/leadermts6-sss/krabak-remote-manager/releases). Each release requires a manual project-owner approval before a SignPath signing request could be made.

The released v0.1.0 executable is unsigned. If the project is accepted by SignPath Foundation, signing will be enabled only after the project account, artifact metadata restrictions, workflow integration, MFA, and approval policy are configured and verified.

## Privacy

See the [Privacy notice](PRIVACY.md) and [security documentation](docs/SECURITY.md). The Agent sends data only to the KRABAK service URL selected in the Agent. Screen frames and control input are exchanged only during an explicitly requested session under the consent policy described in the Privacy notice.
