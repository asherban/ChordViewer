#!/usr/bin/python3
"""Fixed-purpose VPS dump preparation and unprivileged append-only transfer."""
import datetime as dt
import fcntl
import gzip
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import select
import shutil
import subprocess
import sys
import time

BASE = Path('/var/lib/chordviewer-backup')
INPUT = BASE / 'input'
STATE = BASE / 'worker'
CONFIG = Path('/etc/chordviewer-backup/config.json')
CV = '/usr/local/sbin/chordviewer'
RESTIC = '/usr/local/lib/chordviewer-backup/restic'
SQL = Path('/usr/local/lib/chordviewer-backup/table-digest.sql').read_text()

def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def write_json(path, value, mode=0o600):
    tmp = path.with_suffix(path.suffix + '.tmp')
    with tmp.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(tmp, mode)
    os.replace(tmp, path)

def run(args, **kwargs):
    return subprocess.run(args, check=True, timeout=1800, **kwargs)

def identity():
    ids = run([CV, 'ps', '-q', 'database', 'api', 'gateway'], capture_output=True, text=True).stdout.split()
    if len(ids) != 3:
        raise RuntimeError('Expected three application containers')
    raw = run(['docker', 'inspect', '--format', '{{json .}}', *ids], capture_output=True, text=True).stdout
    result = []
    for line in raw.splitlines():
        item = json.loads(line)
        if not item['State']['Running'] or item['State'].get('Health', {}).get('Status') != 'healthy':
            raise RuntimeError('An application container is not healthy')
        result.append({'name': item['Name'], 'id': item['Id'], 'image': item['Image'], 'started': item['State']['StartedAt']})
    return sorted(result, key=lambda x: x['name'])

def discard_owned_input(path):
    # Fixed root-owned staging paths only; never follow a client-controlled path.
    if path not in (INPUT, BASE / '.preparing') or path.is_symlink() or path.parent.resolve() != BASE:
        raise RuntimeError('Refusing unsafe staging cleanup')
    if path.exists():
        if path.stat().st_uid != 0:
            raise RuntimeError('Unexpected staging owner')
        shutil.rmtree(path)

def upload_and_verify():
    subprocess.run(['systemctl', 'start', 'chordviewer-backup-upload.service'], check=True, timeout=10300)
    status = json.loads((STATE / 'last-success.json').read_text())
    if status['manifestSha256'] != digest(INPUT / 'SHA256SUMS'):
        raise RuntimeError('Upload receipt does not match the prepared bundle')
    if not re.fullmatch('[0-9a-f]{64}', status['snapshotId']):
        raise RuntimeError('Invalid uploaded snapshot ID')
    return status

def prepare():
    if os.geteuid() != 0:
        raise RuntimeError('Preparation requires root')
    lock = open('/run/lock/chordviewer-backup.lock', 'w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    if INPUT.exists():
        # Retry a prior incomplete transfer before replacing its only local source.
        upload_and_verify()
        discard_owned_input(INPUT)
    pending = BASE / '.preparing'
    if pending.exists():
        discard_owned_input(pending)  # An interrupted, unpublished local dump.
    if shutil.disk_usage(BASE).free < 5 * 1024**3:
        raise RuntimeError('Insufficient staging headroom (5 GiB required)')
    account = pwd.getpwnam('cvbackup-transfer')
    pending.mkdir(mode=0o700)
    release = Path('/srv/chordviewer/current').resolve(strict=True)
    if release.parent != Path('/srv/chordviewer/releases'):
        raise RuntimeError('Unexpected release path')
    release_config = Path('/srv/chordviewer/config/release.env')
    config_hash = digest(release_config)
    before = identity()
    # Keep a transaction open so the dump and content fingerprints share one snapshot.
    session = subprocess.Popen([CV, 'exec', '-T', 'database', 'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'chordviewer'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)
    def query(sql):
        session.stdin.write(sql + '\n')
        session.stdin.flush()
        if not select.select([session.stdout], [], [], 90)[0]:
            raise RuntimeError('Database snapshot query timed out')
        value = session.stdout.readline().strip()
        if not value:
            raise RuntimeError('Database snapshot query failed')
        return value
    try:
        snapshot = query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot();')
        if not re.fullmatch('[0-9A-Fa-f-]+', snapshot):
            raise RuntimeError('Unexpected database snapshot identifier')
        tables = json.loads(query("SELECT coalesce(json_agg(tablename ORDER BY tablename),'[]'::json) FROM pg_tables WHERE schemaname='public';"))
        fingerprints = {}
        for table in tables:
            quoted = '"' + table.replace('"', '""') + '"'
            fingerprints[table] = json.loads(query(SQL.replace('__TABLE__', 'public.' + quoted)))
        with (pending / 'database.dump').open('xb') as output:
            run([CV, 'exec', '-T', 'database', 'pg_dump', '-U', 'postgres', '-d', 'chordviewer', '-Fc', '--snapshot=' + snapshot], stdout=output, stderr=subprocess.DEVNULL)
        if (pending / 'database.dump').stat().st_size == 0:
            raise RuntimeError('Empty database dump')
        version = query('SHOW server_version;')
    finally:
        if session.poll() is None:
            try:
                session.stdin.write('ROLLBACK;\n\\q\n')
                session.stdin.flush()
                session.communicate(timeout=20)
            except (BrokenPipeError, subprocess.TimeoutExpired):
                session.kill()
                session.wait()
    for name in ['compose.yaml', 'initialize-database.sh', 'tls-public.caddy', 'chordviewer.sh', 'backup.sh']:
        source = release / name
        if source.is_symlink() or not source.is_file():
            raise RuntimeError('Missing or unsafe release file: ' + name)
        shutil.copyfile(source, pending / name)
    shutil.copyfile(release / 'manifest.json', pending / 'release-manifest.json')
    # Release archives may be incremental. Export the complete live image set,
    # cached by immutable identities, so recovery never depends on older releases.
    image_ids = sorted({item['image'] for item in before})
    image_key = hashlib.sha256('\n'.join(image_ids).encode()).hexdigest()
    image_dir = BASE / 'images'
    image_dir.mkdir(mode=0o700, exist_ok=True)
    archive = image_dir / (image_key + '.tar.gz')
    checksum = image_dir / (image_key + '.sha256')
    if not archive.exists():
        temporary = image_dir / (image_key + '.partial')
        if temporary.exists():
            if temporary.is_symlink() or temporary.stat().st_uid != 0:
                raise RuntimeError('Unsafe image export staging file')
            temporary.unlink()
        export = subprocess.Popen(['docker', 'image', 'save', *image_ids], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            with gzip.open(temporary, 'wb', compresslevel=1) as output:
                shutil.copyfileobj(export.stdout, output, 1024 * 1024)
            if export.wait(timeout=1800):
                raise RuntimeError('Image export failed')
        finally:
            if export.poll() is None:
                export.kill()
                export.wait()
        temporary.rename(archive)
        checksum.write_text(digest(archive) + '\n')
    if archive.is_symlink() or digest(archive) != checksum.read_text().strip():
        raise RuntimeError('Image archive cache checksum mismatch')
    shutil.copyfile(archive, pending / 'release-images.tar.gz')
    for source in release.glob('*.apk'):
        if source.is_symlink():
            raise RuntimeError('Unexpected APK symlink')
        shutil.copyfile(source, pending / source.name)
    shutil.copyfile(release_config, pending / 'release.env')
    shutil.copyfile('/usr/local/lib/chordviewer-backup/table-digest.sql', pending / 'table-digest.sql')
    shutil.copyfile('/usr/local/lib/chordviewer-backup/RECOVERY.txt', pending / 'RECOVERY.txt')
    if Path('/srv/chordviewer/current').resolve() != release or digest(release_config) != config_hash or identity() != before:
        raise RuntimeError('Application release changed during backup')
    write_json(pending / 'backup-manifest.json', {'format': 1, 'created': utc(), 'release': release.name, 'postgresVersion': version, 'containers': before, 'imageArchiveSource': 'complete-live-image-export', 'tableFingerprints': fingerprints})
    files = sorted(pending.iterdir())
    if sum(p.stat().st_size for p in files) > 10 * 1024**3:
        raise RuntimeError('Bundle exceeds the 10 GiB staging bound')
    (pending / 'SHA256SUMS').write_text(''.join(digest(p) + '  ' + p.name + '\n' for p in files))
    for item in pending.iterdir():
        os.chown(item, 0, account.pw_gid)
        os.chmod(item, 0o440)
    os.chown(pending, 0, account.pw_gid)
    os.chmod(pending, 0o550)
    pending.rename(INPUT)
    status = upload_and_verify()
    write_json(BASE / 'last-success.json', status)
    print(json.dumps({'result': 'verified', 'snapshotId': status['snapshotId'], 'completed': status['completed']}))

def upload():
    if os.geteuid() != pwd.getpwnam('cvbackup-transfer').pw_uid:
        raise RuntimeError('Transfer requires the dedicated backup identity')
    config = json.loads(CONFIG.read_text())
    secret_dir = Path(os.environ['CREDENTIALS_DIRECTORY'])
    auth = json.loads((secret_dir / 'rest-auth').read_text())
    env = {'PATH': '/usr/bin:/bin', 'HOME': str(STATE), 'RESTIC_REPOSITORY': config['repository'], 'RESTIC_PASSWORD_FILE': str(secret_dir / 'restic-password'), 'RESTIC_REST_USERNAME': auth['username'], 'RESTIC_REST_PASSWORD': auth['password'], 'RESTIC_CACHE_DIR': str(STATE / 'cache'), 'GOMAXPROCS': '1', 'GOMEMLIMIT': '384MiB'}
    def restic(args):
        result = subprocess.run([RESTIC, '--retry-lock', '2m', *args], cwd=INPUT, env=env, capture_output=True, text=True, timeout=1800)
        if result.returncode:
            # Never print upstream diagnostics that might contain URLs or filenames.
            raise RuntimeError('restic ' + args[0] + ' failed with exit ' + str(result.returncode))
        return result.stdout
    for attempt in range(3):
        try:
            if json.loads(restic(['cat', 'config']))['id'] != config['repositoryId']:
                raise RuntimeError('Repository identity mismatch')
            run(['sha256sum', '--check', '--status', 'SHA256SUMS'], cwd=INPUT)
            output = restic(['backup', '--json', '--host', 'chordviewer-production', '--tag', 'production', str(INPUT)])
            summaries = [j for line in output.splitlines() if (j := json.loads(line)).get('message_type') == 'summary']
            if len(summaries) != 1:
                raise RuntimeError('Missing backup summary')
            short = summaries[0]['snapshot_id']
            snapshots = json.loads(restic(['snapshots', '--json', short]))
            if len(snapshots) != 1:
                raise RuntimeError('Ambiguous uploaded snapshot')
            snapshot_id = snapshots[0]['id']
            # Structural checks alone do not verify uploaded data; read every pack.
            restic(['check', '--read-data'])
            restored_sums = restic(['dump', snapshot_id, '/var/lib/chordviewer-backup/input/SHA256SUMS'])
            if restored_sums != (INPUT / 'SHA256SUMS').read_text():
                raise RuntimeError('Remote bundle checksum manifest differs')
            status = {'snapshotId': snapshot_id, 'completed': utc(), 'manifestSha256': digest(INPUT / 'SHA256SUMS'), 'repositoryId': config['repositoryId'], 'fullDataCheck': True}
            write_json(STATE / 'last-success.json', status)
            print(json.dumps(status))
            return
        except (RuntimeError, subprocess.SubprocessError) as error:
            print(str(error), file=sys.stderr)
            if attempt == 2:
                raise
            time.sleep(60 * (attempt + 1))

if __name__ == '__main__':
    os.umask(0o077)
    try:
        {'prepare': prepare, 'upload': upload}[sys.argv[1]]()
    except Exception as error:
        print('Backup failed: ' + type(error).__name__ + ': ' + str(error), file=sys.stderr)
        sys.exit(1)
