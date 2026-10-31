#!/bin/sh
set -eu
if [ "$(id -u)" -ne 0 ]; then echo 'Run with sudo; release credentials are root-only.' >&2; exit 1; fi
cd /srv/chordviewer/current
test -f /srv/chordviewer/config/release.env
exec docker compose -p chordviewer --env-file /srv/chordviewer/config/release.env -f compose.yaml "$@"
