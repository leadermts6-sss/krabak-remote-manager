#!/bin/sh
set -eu

if [ "${SSH_ORIGINAL_COMMAND:-}" != "deploy" ]; then
  exit 64
fi

exec /usr/bin/sudo -n /usr/local/sbin/krabak-remote-deploy
