#!/bin/python3
"""Install a hash-pinned maintenance bundle; never export plaintext credentials."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

SOURCE = Path('/volume1/@chordviewer-backup/production-install-v1')
BASE = Path('/volume1/@chordviewer-backup/production')
IMAGE_TAG = 'chordviewer/restic-maintenance:0.19.1-cv.20261031'
IMAGE_ID = 'sha256:0b7e02514d444d4b9aaf35b675a6b47455b16ba9c29a5eff6b5fd7e77f0be125'
RECEIVER_ID = '04f468929e27db8e02bce195cf98d55d9b0ccc16af77e19a17ca1acc9fdcd8ad'
REPO_ID = '16a2643ec81a3c59bbccbbc04ad9c6547ab4b80222b1c6764032867290ef8395'
BASELINE = '56591e6a59bf103cd0b6a54efe666f2d79c91e514e98a78405248d7d91650baa'

def run(args, **kwargs):
    return subprocess.run(args, check=True, timeout=300, **kwargs)

def capture(args):
    return run(args, capture_output=True, text=True).stdout.strip()

def main():
    if os.geteuid() != 0 or len(sys.argv) != 2 or not re.fullmatch('[0-9a-f]{64}', sys.argv[1]):
        raise RuntimeError('Root and independently pinned manifest hash required')
    os.umask(0o077)
    manifest_file = SOURCE / 'manifest.json'
    if manifest_file.is_symlink() or hashlib.sha256(manifest_file.read_bytes()).hexdigest() != sys.argv[1]:
        raise RuntimeError('Staged manifest changed')
    manifest = json.loads(manifest_file.read_text())
    expected = {'install-maintenance.py', 'run-maintenance.py', 'snapshot-guard.py', 'maintenance-image.tar', 'maintenance.enc.json', 'config.json'}
    if set(manifest) != expected:
        raise RuntimeError('Unexpected installation artifact set')
    for name, sha in manifest.items():
        source = SOURCE / name
        if source.is_symlink() or not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest() != sha:
            raise RuntimeError('Staged artifact changed: ' + name)
    settings = json.loads((SOURCE / 'config.json').read_text())
    if settings != {'repositoryId': REPO_ID, 'baselineSnapshotId': BASELINE}:
        raise RuntimeError('Unexpected repository configuration')
    receiver = json.loads(capture(['docker', 'inspect', 'chordviewer-backup-receiver']))[0]
    if receiver['Id'] != RECEIVER_ID or not receiver['State']['Running']:
        raise RuntimeError('Expected running receiver unavailable')
    if BASE.parent.is_symlink() or BASE.parent.stat().st_uid != 0 or BASE.parent.stat().st_mode & 0o077:
        raise RuntimeError('Private administrator directory is unsafe')
    if BASE.exists():
        saved = json.loads((BASE / 'installation.json').read_text())
        if saved.get('manifestSha256') != sys.argv[1]:
            raise RuntimeError('Existing installation differs; explicit migration required')
        for name in ['run-maintenance.py', 'snapshot-guard.py', 'config.json']:
            if hashlib.sha256((BASE / name).read_bytes()).hexdigest() != manifest[name]:
                raise RuntimeError('Installed file changed')
        print('Preserved existing maintenance configuration and credential')
    else:
        run(['docker', 'load', '-i', str(SOURCE / 'maintenance-image.tar')], stdout=subprocess.DEVNULL)
        actual_image = capture(['docker', 'image', 'inspect', IMAGE_TAG, '--format', '{{.Id}}'])
        if actual_image != IMAGE_ID:
            raise RuntimeError('Loaded maintenance image identity mismatch')
        BASE.mkdir(mode=0o700)
        for name in ['run-maintenance.py', 'snapshot-guard.py']:
            shutil.copyfile(SOURCE / name, BASE / name)
            os.chmod(BASE / name, 0o500)
        shutil.copyfile(SOURCE / 'config.json', BASE / 'config.json')
        os.chown(BASE / 'config.json', 1028, 100)
        os.chmod(BASE / 'config.json', 0o400)
        (BASE / 'state').mkdir(mode=0o700)
        os.chown(BASE / 'state', 1028, 100)
        (BASE / 'guard').mkdir(mode=0o700)
        # Only this short-lived offline container sees the existing root-only
        # REST credential. Its output is captured privately and never logged.
        args = ['docker', 'run', '--rm', '--user', '0:0', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--security-opt', 'apparmor=docker-default', '--memory', '128m', '--memory-swap', '128m', '--cpuset-cpus', '0', '--ulimit', 'nproc=128:128', '--ulimit', 'nofile=1024:1024', '--mount', 'type=bind,source=/volume1/@chordviewer-backup/client.json,target=/auth/client.json,readonly', '--mount', 'type=bind,source=' + str(SOURCE / 'maintenance.enc.json') + ',target=/input/maintenance.enc.json,readonly', IMAGE_ID, 'decrypt']
        secret = run(args, capture_output=True).stdout
        if not re.fullmatch(rb'[A-Za-z0-9_-]{43}\n', secret):
            raise RuntimeError('Invalid decrypted maintenance credential')
        with (BASE / 'maintenance.password').open('xb') as stream:
            stream.write(secret)
            stream.flush()
            os.fsync(stream.fileno())
        del secret
        os.chown(BASE / 'maintenance.password', 1028, 100)
        os.chmod(BASE / 'maintenance.password', 0o400)
        (BASE / 'runtime.json').write_text(json.dumps({'imageId': IMAGE_ID, 'receiverId': RECEIVER_ID}) + '\n')
        (BASE / 'installation.json').write_text(json.dumps({'manifestSha256': sys.argv[1], 'artifacts': manifest, 'imageId': IMAGE_ID, 'repositoryId': REPO_ID, 'receiverId': RECEIVER_ID}, indent=2) + '\n')
    run(['/bin/python3', str(BASE / 'snapshot-guard.py'), str(BASE / 'guard/snapshot.json')])
    guard = json.loads((BASE / 'guard/snapshot.json').read_text())
    if not guard['protected']:
        raise RuntimeError('Immutable production snapshot coverage not verified; no cleanup scheduled')
    # Neither initial run nor future runs remove snapshots younger than 35 days.
    subprocess.run(['/bin/python3', str(BASE / 'run-maintenance.py'), 'maintain'], check=True, timeout=3500)
    summary = json.loads((BASE / 'state/last-success.json').read_text())
    if summary['deleted'] != 0 or not summary['fullDataCheck']:
        raise RuntimeError('Unexpected initial maintenance result')
    if (BASE / 'receiver-paused.json').exists():
        raise RuntimeError('Receiver recovery remains pending')
    after = json.loads(capture(['docker', 'inspect', 'chordviewer-backup-receiver']))[0]
    if after['Id'] != RECEIVER_ID or not after['State']['Running']:
        raise RuntimeError('Receiver did not recover')
    print(json.dumps({'installed': True, 'guard': guard, 'maintenance': summary, 'receiverRunning': True, 'runtimeIsolation': json.loads((BASE / 'isolation-verification.json').read_text()), 'schedulesPending': True}, indent=2))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # No captured subprocess output is interpolated: it could be credential data.
        print('NAS maintenance installation stopped: ' + type(error).__name__ + ': ' + str(error), file=sys.stderr)
        sys.exit(1)
