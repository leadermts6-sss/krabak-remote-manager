#!/bin/bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "SETUP_FAILED=must_run_as_root" >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_USER="krabak-deploy"
DEPLOY_HOME="/var/lib/krabak-deploy"
SUDOERS_FILE="/etc/sudoers.d/krabak-remote-deploy"

IFS= read -r public_key || [[ -n "${public_key:-}" ]]
if IFS= read -r extra_line; then
  echo "SETUP_FAILED=expected_one_public_key_line" >&2
  exit 1
fi

if [[ ! "${public_key:-}" =~ ^ssh-ed25519[[:space:]]+([A-Za-z0-9+/]+={0,2})([[:space:]].*)?$ ]]; then
  echo "SETUP_FAILED=invalid_public_key" >&2
  exit 1
fi
key_data="${BASH_REMATCH[1]}"
if ! printf '%s' "$key_data" | base64 --decode >/dev/null 2>&1; then
  echo "SETUP_FAILED=invalid_public_key" >&2
  exit 1
fi

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$DEPLOY_HOME" --shell /bin/sh "$DEPLOY_USER"
else
  existing_home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
  existing_shell="$(getent passwd "$DEPLOY_USER" | cut -d: -f7)"
  if [[ "$existing_home" != "$DEPLOY_HOME" || "$existing_shell" != "/bin/sh" ]]; then
    echo "SETUP_FAILED=existing_deploy_user_mismatch" >&2
    exit 1
  fi
fi

install -o root -g root -m 0755 "$SCRIPT_DIR/deploy_ssh_wrapper.sh" /usr/local/sbin/krabak-remote-deploy-ssh
install -o root -g root -m 0755 "$SCRIPT_DIR/deploy_release.py" /usr/local/sbin/krabak-remote-deploy

if [[ -e "$SUDOERS_FILE" ]]; then
  if ! grep -Fxq "$DEPLOY_USER ALL=(root) NOPASSWD: /usr/local/sbin/krabak-remote-deploy \"\"" "$SUDOERS_FILE"; then
    echo "SETUP_FAILED=sudoers_file_already_exists" >&2
    exit 1
  fi
else
  sudoers_tmp="$(mktemp)"
  printf '%s ALL=(root) NOPASSWD: /usr/local/sbin/krabak-remote-deploy ""\n' "$DEPLOY_USER" > "$sudoers_tmp"
  chmod 0440 "$sudoers_tmp"
  visudo -cf "$sudoers_tmp" >/dev/null
  install -o root -g root -m 0440 "$sudoers_tmp" "$SUDOERS_FILE"
  rm -f -- "$sudoers_tmp"
fi

install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0700 "$DEPLOY_HOME/.ssh"
authorized_keys="$DEPLOY_HOME/.ssh/authorized_keys"
if [[ ! -e "$authorized_keys" ]]; then
  install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0600 /dev/null "$authorized_keys"
fi
if ! grep -Fq "$key_data" "$authorized_keys"; then
  printf 'restrict,command="/usr/local/sbin/krabak-remote-deploy-ssh" %s krabak-github-actions\n' "$public_key" >> "$authorized_keys"
fi
chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_HOME" "$DEPLOY_HOME/.ssh" "$authorized_keys"
chmod 0700 "$DEPLOY_HOME/.ssh"
chmod 0600 "$authorized_keys"
visudo -cf "$SUDOERS_FILE" >/dev/null
echo "DEPLOY_SSH_USER_READY=krabak-deploy"
