# GitHub Actions deployment to Serva

This repository builds and tests the PWA and Node service on pull requests and pushes to `main`. The production job is deliberately gated by the repository variable `PRODUCTION_DEPLOY_ENABLED`. If it is absent or not the exact string `true`, no SSH connection to the VPS is made.

## One-time setup

1. Create the GitHub repository as **private** and push the reviewed source to `main`.
2. Run `deploy/prepare-server-layout.sh` once as root on the VPS. It copies the current working app into an immutable baseline release and adds a systemd drop-in that runs from `/opt/krabak-remote-manager/current`. It preserves the existing environment file, admin data, Nginx configuration, and UFW rules.
3. Create a dedicated, passwordless CI-only Ed25519 keypair. Do not reuse the Windows SSH key. Send only its public key to `deploy/setup-deploy-account.sh` on the VPS. The private key belongs only in the GitHub `production` environment secret named `DEPLOY_SSH_KEY`.
4. Keep `PRODUCTION_DEPLOY_ENABLED` unset until the source and first release are approved. Setting it to `true` enables automatic deploys for later successful pushes to `main`; it is a repository variable, not a secret.

The workflow pins the VPS ED25519 host-key fingerprint and rejects any mismatch. SSH accepts only the fixed `deploy` command through a forced-command key with `restrict`; the deploy account cannot obtain a shell, PTY, port forwarding, agent forwarding, or X11 forwarding.

## Release receiver

The runner sends a tar archive containing only `dist/`, `server/`, and `package.json`, preceded by the commit SHA and SHA-256 digest. `deploy/deploy_release.py` rejects path traversal, symlinks, hardlinks, special files, hidden paths, unexpected top-level paths, oversized archives, missing entrypoints, and checksum mismatches. It extracts as root into a new immutable release, atomically switches `current`, restarts only `krabak-remote.service`, and checks `/api/status`. If the new release is unhealthy, it switches back to the previous release and checks it again.

The app environment (`/etc/krabak-remote/remote.env`) and persistent data (`/var/lib/krabak-remote`) are outside the release archive and are never overwritten by the workflow.

## CI scope

- Node.js dependencies are installed from `package-lock.json`.
- `npm test`, production dependency audit, `npm run build`, and Python archive-safety tests must pass before a release artifact is created.
- Vite is a build-time dependency and is not deployed as a runtime package. The full development dependency tree has a known `picomatch` advisory with no upstream fix listed; the workflow audits runtime dependencies separately and does not expose the Vite dev server.
