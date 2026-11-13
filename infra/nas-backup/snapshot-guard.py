#!/bin/python3
"""Read Synology protection metadata; fail closed without recent WORM coverage."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

BASE = Path('/volume1/@chordviewer-backup/production')
SNAPSHOTS = Path('/volume1/@sharesnap/ChordViewerBackups')
REPOSITORY = Path('/volume1/ChordViewerBackups/repositories/chordviewer/production-v1')
TOOL = '/usr/syno/sbin/synosharesnapshot'
NAME = re.compile(r'GMT([+-])(\d{2})(?::?(\d{2}))?-(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})')

def run(args):
    return subprocess.check_output(args, text=True, stderr=subprocess.PIPE, timeout=30)

def file_hash(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 1024 * 1024:
        raise RuntimeError('Missing or unsafe snapshot metadata file')
    return hashlib.sha256(path.read_bytes()).hexdigest()

def check(now):
    config = json.loads((BASE / 'config.json').read_text())
    baseline = config['baselineSnapshotId']
    if not re.fullmatch('[0-9a-f]{64}', baseline):
        raise RuntimeError('Invalid baseline identity')
    live_config_hash = file_hash(REPOSITORY / 'config')
    candidates = []
    for line in run([TOOL, 'list', 'ChordViewerBackups']).splitlines():
        match = NAME.fullmatch(line)
        if not match:
            continue
        sign, hours, minutes, stamp = match.groups()
        offset = (int(hours) * 60 + int(minutes or '0')) * (1 if sign == '+' else -1)
        created = dt.datetime.strptime(stamp, '%Y.%m.%d-%H.%M.%S').replace(tzinfo=dt.timezone(dt.timedelta(minutes=offset)))
        age = (now - created).total_seconds()
        if not -300 <= age <= 26 * 3600:
            continue
        location = SNAPSHOTS / line
        if location.is_symlink() or location.parent.resolve() != SNAPSHOTS:
            continue
        attrs = dict(row.split('=', 1) for row in run([TOOL, 'attr', 'list', 'ChordViewerBackups', line]).splitlines() if '=' in row)
        # WORM timestamps belong to Synology's independent tamper-proof clock,
        # not wall-clock UTC. Validate their duration, never convert to expiry UTC.
        duration = int(attrs.get('worm_lock_end', '0')) - int(attrs.get('worm_lock_begin', '0'))
        if attrs.get('worm_lock') != 'true' or int(attrs.get('worm_lock_day', '0')) < 7 or duration < 7 * 86400:
            continue
        detail = run(['/sbin/btrfs', 'subvolume', 'show', str(location)])
        if not re.search(r'^\s*Flags:\s+readonly\s*$', detail, re.M):
            continue
        snapshot_repo = location / 'repositories/chordviewer/production-v1'
        try:
            matches = file_hash(snapshot_repo / 'config') == live_config_hash and file_hash(snapshot_repo / 'snapshots' / baseline) == baseline
        except (RuntimeError, OSError):
            matches = False
        if not matches:
            continue
        candidates.append({'protected': True, 'verifiedAt': now.isoformat(), 'snapshotTime': created.astimezone(dt.timezone.utc).isoformat(), 'snapshotName': line, 'wormLock': True, 'wormDurationSeconds': duration, 'readOnly': True, 'repositoryConfigMatches': True, 'baselineSnapshotPresent': baseline})
    if not candidates:
        raise RuntimeError('No recent immutable snapshot contains the pinned production baseline')
    return max(candidates, key=lambda item: item['snapshotTime'])

def main():
    if os.geteuid() != 0 or len(sys.argv) != 2 or Path(sys.argv[1]) != BASE / 'guard/snapshot.json':
        raise RuntimeError('Use the fixed root-owned guard destination')
    now = dt.datetime.now(dt.timezone.utc)
    try:
        report = check(now)
    except Exception as error:
        report = {'protected': False, 'verifiedAt': now.isoformat(), 'reason': type(error).__name__ + ': ' + str(error)}
    target = Path(sys.argv[1])
    temporary = target.with_suffix('.new')
    # The root-private directory is not writable by receiver or maintenance UID.
    with temporary.open('w') as stream:
        json.dump(report, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.chown(temporary, 1028, 100)
    os.chmod(temporary, 0o400)
    os.replace(temporary, target)
    print(json.dumps(report))

if __name__ == '__main__':
    main()
