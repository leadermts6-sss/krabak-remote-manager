#!/bin/bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "PREPARE_FAILED=must_run_as_root" >&2
  exit 1
fi

APP_ROOT="/opt/krabak-remote-manager"
RELEASES="$APP_ROOT/releases"
CURRENT="$APP_ROOT/current"
DROPIN_DIR="/etc/systemd/system/krabak-remote.service.d"
DROPIN="$DROPIN_DIR/20-ci-release-layout.conf"
NODE_BIN="/opt/node-v26.13.1-linux-x64/bin/node"

if [[ ! -d "$APP_ROOT" || -L "$APP_ROOT" || ! -x "$NODE_BIN" ]]; then
  echo "PREPARE_FAILED=expected_app_or_node_runtime_missing" >&2
  exit 1
fi
if [[ ! -d "$APP_ROOT/dist" || ! -d "$APP_ROOT/server" || ! -f "$APP_ROOT/server/index.mjs" || ! -f "$APP_ROOT/package.json" ]]; then
  echo "PREPARE_FAILED=existing_app_layout_incomplete" >&2
  exit 1
fi

mkdir -p -- "$RELEASES"
chown root:root "$RELEASES"
chmod 0755 "$RELEASES"

if [[ -L "$CURRENT" ]]; then
  current_target="$(readlink -f -- "$CURRENT")"
  case "$current_target" in
    "$RELEASES"/baseline-*) ;;
    *) echo "PREPARE_FAILED=current_link_is_not_managed_baseline" >&2; exit 1 ;;
  esac
  if [[ ! -f "$current_target/dist/index.html" || ! -f "$current_target/server/index.mjs" || ! -f "$current_target/package.json" ]]; then
    echo "PREPARE_FAILED=baseline_release_incomplete" >&2
    exit 1
  fi
elif [[ -e "$CURRENT" ]]; then
  echo "PREPARE_FAILED=current_path_is_not_a_symlink" >&2
  exit 1
else
  baseline="$RELEASES/baseline-$(date -u +%Y%m%dT%H%M%SZ)"
  if [[ -e "$baseline" ]]; then
    echo "PREPARE_FAILED=baseline_path_already_exists" >&2
    exit 1
  fi
  install -d -o root -g root -m 0755 "$baseline"
  cp -a -- "$APP_ROOT/dist" "$APP_ROOT/server" "$APP_ROOT/package.json" "$baseline/"
  chown -R root:root "$baseline"
  find "$baseline" -type d -exec chmod 0755 {} +
  find "$baseline" -type f -exec chmod 0644 {} +
  ln -s -- "releases/${baseline##*/}" "$APP_ROOT/.current-initial"
  mv -T -- "$APP_ROOT/.current-initial" "$CURRENT"
fi

mkdir -p -- "$DROPIN_DIR"
expected_dropin="$(mktemp)"
cat > "$expected_dropin" <<EOF
[Service]
WorkingDirectory=$APP_ROOT/current
ExecStart=
ExecStart=$NODE_BIN $APP_ROOT/current/server/index.mjs
EOF
chmod 0644 "$expected_dropin"

if [[ -e "$DROPIN" ]]; then
  if cmp -s -- "$expected_dropin" "$DROPIN" && systemctl is-active --quiet krabak-remote.service; then
    rm -f -- "$expected_dropin"
    echo "DEPLOY_LAYOUT_READY=already_configured"
    exit 0
  fi
  rm -f -- "$expected_dropin"
  echo "PREPARE_FAILED=systemd_dropin_already_exists" >&2
  exit 1
fi

install -o root -g root -m 0644 "$expected_dropin" "$DROPIN"
rm -f -- "$expected_dropin"
if ! systemd-analyze verify /etc/systemd/system/krabak-remote.service; then
  rm -f -- "$DROPIN"
  echo "PREPARE_FAILED=systemd_verify_failed" >&2
  exit 1
fi
systemctl daemon-reload
if ! systemctl restart krabak-remote.service; then
  rm -f -- "$DROPIN"
  systemctl daemon-reload
  systemctl restart krabak-remote.service || true
  echo "PREPARE_FAILED=service_restart_failed_legacy_path_restored" >&2
  exit 1
fi

for _ in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 2 http://127.0.0.1:8787/api/status 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("ok") is True and d.get("initialised") is True else 1)' >/dev/null 2>&1; then
    echo "DEPLOY_LAYOUT_READY=baseline_active"
    exit 0
  fi
  sleep 1
done

rm -f -- "$DROPIN"
systemctl daemon-reload
systemctl restart krabak-remote.service || true
echo "PREPARE_FAILED=health_check_failed_legacy_path_restored" >&2
exit 1
