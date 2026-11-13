#!/bin/python3
"""NAS root coordination only; repository parsing runs in an isolated container."""
import datetime
import fcntl
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import signal
import shutil
import subprocess
import sys

BASE = Path('/volume1/@chordviewer-backup/production')
RECEIVER = 'chordviewer-backup-receiver'
MAINTENANCE = 'chordviewer-backup-maintenance'
MARKER = BASE / 'receiver-paused.json'
LOG = logging.getLogger('chordviewer-maintenance')

def run(args, **kwargs):
    return subprocess.run(args, check=True, timeout=120, **kwargs)

def inspect(name):
    result = subprocess.run(['docker', 'inspect', name], capture_output=True, text=True, timeout=20)
    if result.returncode:
        if 'No such' in result.stderr:
            return None
        raise RuntimeError('Cannot inspect container state')
    return json.loads(result.stdout)[0]

def stop_own_maintenance(config):
    item = inspect(MAINTENANCE)
    if item:
        if item['Image'] != config['imageId'] or item['Config']['Labels'].get('com.chordviewer.role') != 'backup-maintenance':
            raise RuntimeError('Unexpected maintenance container; refusing removal')
        run(['docker', 'rm', '-f', MAINTENANCE], stdout=subprocess.DEVNULL)

def restore_receiver(config):
    if not MARKER.exists():
        return
    marker = json.loads(MARKER.read_text())
    if marker['receiverId'] != config['receiverId']:
        raise RuntimeError('Unexpected interrupted-maintenance marker')
    stop_own_maintenance(config)
    item = inspect(RECEIVER)
    if not item or item['Id'] != config['receiverId']:
        raise RuntimeError('Receiver identity changed; operator review required')
    if not item['State']['Running']:
        run(['docker', 'start', RECEIVER], stdout=subprocess.DEVNULL)
    if not inspect(RECEIVER)['State']['Running']:
        raise RuntimeError('Receiver did not restart')
    MARKER.unlink()
    LOG.info('Receiver running; maintenance marker cleared')

def verify_container(config):
    item = inspect(MAINTENANCE)
    host = item['HostConfig']
    assert item['Image'] == config['imageId'] and item['Config']['User'] == '1028:100'
    assert host['NetworkMode'] == 'none' and host['ReadonlyRootfs']
    assert set(host['CapDrop']) == {'ALL'} and not host.get('CapAdd') and not host['Privileged']
    assert 'no-new-privileges:true' in host['SecurityOpt'] and 'apparmor=docker-default' in host['SecurityOpt']
    assert host['Memory'] == host['MemorySwap'] == 512 * 1024**2 and host['CpusetCpus'] == '0'
    limits = {entry['Name']: (entry['Soft'], entry['Hard']) for entry in host['Ulimits']}
    assert limits['nproc'] == (128, 128) and limits['nofile'] == (1024, 1024)
    expected = {'/repo': True, '/state': True, '/secret/maintenance.password': False, '/config/config.json': False, '/guard/snapshot.json': False}
    binds = {entry['Destination']: entry['RW'] for entry in item['Mounts'] if entry['Type'] == 'bind'}
    assert binds == expected
    report = {'imageId': item['Image'], 'user': item['Config']['User'], 'network': host['NetworkMode'], 'readOnlyRoot': True, 'capabilitiesDropped': host['CapDrop'], 'securityOptions': host['SecurityOpt'], 'memoryBytes': host['Memory'], 'memorySwapBytes': host['MemorySwap'], 'cpuAffinity': host['CpusetCpus'], 'limits': limits, 'bindMountsWritable': binds}
    (BASE / 'isolation-verification.json').write_text(json.dumps(report, indent=2) + '\n')

def main():
    if os.geteuid() != 0:
        raise RuntimeError('Run through the root-owned NAS task')
    os.umask(0o077)
    config = json.loads((BASE / 'runtime.json').read_text())
    with (BASE / 'maintenance.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        restore_receiver(config)
        if len(sys.argv) == 2 and sys.argv[1] == 'recover':
            print('Interrupted-maintenance recovery check passed')
            return
        if len(sys.argv) != 2 or sys.argv[1] != 'maintain':
            raise RuntimeError('Expected maintain or recover')
        receiver = inspect(RECEIVER)
        if not receiver or receiver['Id'] != config['receiverId'] or not receiver['State']['Running']:
            raise RuntimeError('Expected running receiver is unavailable')
        if inspect(MAINTENANCE):
            raise RuntimeError('Maintenance container already exists without a recovery marker')
        if shutil.disk_usage('/volume1').free < 5 * 1024**3:
            raise RuntimeError('NAS volume has less than 5 GiB free; operator review required')
        # The separate guard only reads Synology protection metadata. Missing proof
        # leaves protected=false, which prevents deletion in the unprivileged helper.
        guard = BASE / 'guard'
        guard.mkdir(mode=0o700, exist_ok=True)
        run(['/bin/python3', str(BASE / 'snapshot-guard.py'), str(guard / 'snapshot.json')])
        with MARKER.open('x') as stream:
            json.dump({'receiverId': receiver['Id'], 'started': datetime.datetime.now(datetime.timezone.utc).isoformat()}, stream)
            stream.flush()
            os.fsync(stream.fileno())
        def terminated(signum, frame):
            raise RuntimeError('Maintenance interrupted by signal ' + str(signum))
        signal.signal(signal.SIGTERM, terminated)
        signal.signal(signal.SIGINT, terminated)
        try:
            run(['docker', 'stop', '--time', '30', RECEIVER], stdout=subprocess.DEVNULL)
            args = ['docker', 'create', '--name', MAINTENANCE, '--label', 'com.chordviewer.role=backup-maintenance', '--user', '1028:100', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--security-opt', 'apparmor=docker-default', '--memory', '512m', '--memory-swap', '512m', '--cpuset-cpus', '0', '--ulimit', 'nproc=128:128', '--ulimit', 'nofile=1024:1024', '--log-driver', 'json-file', '--log-opt', 'max-size=5m', '--log-opt', 'max-file=2', '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m']
            for source, target, readonly in [
                (Path('/volume1/ChordViewerBackups/repositories/chordviewer/production-v1'), '/repo', False),
                (BASE / 'state', '/state', False),
                (BASE / 'maintenance.password', '/secret/maintenance.password', True),
                (BASE / 'config.json', '/config/config.json', True),
                (guard / 'snapshot.json', '/guard/snapshot.json', True),
            ]:
                if source.is_symlink() or not source.exists():
                    raise RuntimeError('Missing or unsafe maintenance mount')
                args.extend(['--mount', 'type=bind,source=' + str(source) + ',target=' + target + (',readonly' if readonly else '')])
            args.extend([config['imageId'], 'maintain'])
            run(args, stdout=subprocess.DEVNULL)
            verify_container(config)
            result = subprocess.run(['docker', 'start', '--attach', MAINTENANCE], capture_output=True, text=True, timeout=3300)
            finished = inspect(MAINTENANCE)
            LOG.info('Maintenance output: %s', result.stdout[-20000:])
            if result.returncode or not finished or finished['State']['ExitCode'] != 0:
                LOG.error('Maintenance diagnostics: %s', result.stderr[-20000:])
                raise RuntimeError('Repository maintenance failed; see the private task log')
        finally:
            restore_receiver(config)

if __name__ == '__main__':
    os.umask(0o077)
    handler = RotatingFileHandler(str(BASE / 'maintenance.log'), maxBytes=1024*1024, backupCount=2)
    handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
    LOG.addHandler(handler)
    LOG.setLevel(logging.INFO)
    try:
        LOG.info('Starting %s', ' '.join(sys.argv[1:]))
        main()
        LOG.info('Completed successfully')
    except Exception as error:
        LOG.exception('Maintenance failed')
        print('NAS backup maintenance failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
