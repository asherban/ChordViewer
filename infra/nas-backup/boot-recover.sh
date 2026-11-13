#!/bin/sh
# DSM boot task body: wait for Docker, then recover only our interrupted pause.
set -eu
umask 077
attempts=0
while ! docker info >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 60 ]; then
        logger -t chordviewer-backup 'Docker unavailable after five minutes; receiver recovery needs review'
        exit 1
    fi
    sleep 5
done
exec /bin/python3 /volume1/@chordviewer-backup/production/run-maintenance.py recover
