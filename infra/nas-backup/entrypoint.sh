#!/bin/sh
set -eu
umask 007
# The setgid socket directory grants the Tailscale group connection access.
# Both writable mounts stay inside the existing backup share storage quota.
# Rest-server explicitly creates repository directories/files as 0700/0600.
# A stale Unix socket may remain after an unclean stop.
if [ -e /run/receiver/receiver.sock ] || [ -S /run/receiver/receiver.sock ]; then
  [ -S /run/receiver/receiver.sock ] || { echo 'Unexpected socket-path file; refusing startup.' >&2; exit 1; }
  rm /run/receiver/receiver.sock
fi
exec /usr/local/bin/rest-server \
  --path /data \
  --htpasswd-file /run/secrets/receiver.htpasswd \
  --listen unix:/run/receiver/receiver.sock \
  --append-only --private-repos --max-size 90000000000
