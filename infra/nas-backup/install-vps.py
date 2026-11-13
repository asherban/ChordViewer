#!/usr/bin/python3
"""Root installer. Receives credentials privately on stdin, never in argv."""
import hashlib
import grp
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import sys

if os.geteuid() != 0:
    raise SystemExit('Run as root')
os.umask(0o077)
data = json.load(sys.stdin)
source = Path('/home/asherban/.cvbackup-install')
binary_dir = Path('/usr/local/lib/chordviewer-backup')
config_dir = Path('/etc/chordviewer-backup')
base = Path('/var/lib/chordviewer-backup')
if config_dir.exists() or binary_dir.exists():
    raise SystemExit('Existing backup installation: inspect and update explicitly')
expected = {'production-backup.py', 'table-digest.sql', 'RECOVERY.txt', 'restic', 'chordviewer-backup.service', 'chordviewer-backup-upload.service', 'chordviewer-backup.timer'}
if set(data['artifacts']) != expected:
    raise SystemExit('Unexpected artifact list')
for name, sha in data['artifacts'].items():
    file = source / name
    if file.is_symlink() or hashlib.sha256(file.read_bytes()).hexdigest() != sha:
        raise SystemExit('Artifact checksum mismatch')
if data['repository'] != 'rest:https://sherbannas.asymptote-harmonic.ts.net:8443/chordviewer/production-v1/':
    raise SystemExit('Unexpected repository')
try:
    pwd.getpwnam('cvbackup-transfer')
    raise SystemExit('Account already exists: inspect before adopting it')
except KeyError:
    pass
try:
    pwd.getpwuid(61080)
    raise SystemExit('Reserved backup UID 61080 is already assigned')
except KeyError:
    pass
for process in Path('/proc').glob('[0-9]*/status'):
    try:
        fields = dict(line.split(':', 1) for line in process.read_text().splitlines() if ':' in line)
        if 61080 in map(int, fields['Uid'].split()):
            raise SystemExit('Reserved backup UID is used by a running process')
    except (FileNotFoundError, ProcessLookupError):
        pass
try:
    grp.getgrnam('cvbackup')
    raise SystemExit('Backup group already exists: inspect before adopting it')
except KeyError:
    subprocess.run(['groupadd', '--system', 'cvbackup'], check=True)
subprocess.run(['useradd', '--uid', '61080', '--gid', 'cvbackup', '--no-create-home', '--home-dir', '/nonexistent', '--shell', '/usr/sbin/nologin', 'cvbackup-transfer'], check=True)
account = pwd.getpwnam('cvbackup-transfer')
for directory in [binary_dir, config_dir, base]:
    directory.mkdir(mode=0o750)
    os.chown(directory, 0, account.pw_gid)
    os.chmod(directory, 0o750)
for name in ['production-backup.py', 'table-digest.sql', 'RECOVERY.txt', 'restic']:
    shutil.copyfile(source / name, binary_dir / name)
    os.chmod(binary_dir / name, 0o755 if name in ['restic', 'production-backup.py'] else 0o644)
for name in ['chordviewer-backup.service', 'chordviewer-backup-upload.service', 'chordviewer-backup.timer']:
    target = Path('/etc/systemd/system') / name
    if target.exists():
        raise SystemExit('Unexpected existing systemd unit')
    shutil.copyfile(source / name, target)
    os.chmod(target, 0o644)
(config_dir / 'operational.password').write_text(data['operationalPassword'].strip() + '\n')
(config_dir / 'rest-auth.json').write_text(json.dumps(data['restAuth']))
public = config_dir / 'config.json'
public.write_text(json.dumps({'repository': data['repository'], 'repositoryId': data['repositoryId']}, indent=2) + '\n')
os.chown(public, 0, account.pw_gid)
os.chmod(public, 0o440)
worker = base / 'worker'
worker.mkdir(mode=0o700)
os.chown(worker, account.pw_uid, account.pw_gid)
old = Path('/usr/local/sbin/chordviewer-backup')
old_sha = hashlib.sha256(old.read_bytes()).hexdigest()
if old_sha != '534e85fd764faaf45db976c9450b90705b77f7bbfc1587a52f89f433235f4de7':
    raise SystemExit('Existing backup command changed; inspect before replacing')
shutil.copyfile(old, binary_dir / 'backup-local.previous.sh')
os.chmod(binary_dir / 'backup-local.previous.sh', 0o700)
old.write_text('#!/bin/sh\nset -eu\n[ "$(id -u)" = 0 ] || { echo "Run with sudo." >&2; exit 1; }\nsystemctl start chordviewer-backup.service\ncat /var/lib/chordviewer-backup/last-success.json\n')
os.chmod(old, 0o755)
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemd-analyze', 'verify', '/etc/systemd/system/chordviewer-backup.service', '/etc/systemd/system/chordviewer-backup-upload.service', '/etc/systemd/system/chordviewer-backup.timer'], check=True)
state = {'installed': True, 'uid': account.pw_uid, 'gid': account.pw_gid, 'repositoryId': data['repositoryId'], 'artifacts': data['artifacts'], 'timerEnabled': False}
(config_dir / 'installation.json').write_text(json.dumps(state, indent=2) + '\n')
print(json.dumps(state))
