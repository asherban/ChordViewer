# Synology backup receiver

This directory contains the NAS receiver from [ADR 0022](../../docs/ADRs/0022-use-an-offline-nas-backup-receiver.md) and the production backup implementation from [ADR 0024](../../docs/ADRs/0024-encrypt-production-backups-with-independent-recovery.md). It does not modify the Tailscale policy or configure alerts.

Installed and accepted on 2026-10-31: private HTTPS, rejected unauthorized access, append-only enforcement, encrypted workstation backup/full check/restore, and receiver restart verification passed. The separately approved VPS grant now permits only NAS TCP 8443, with trusted IPv4/IPv6 HTTPS and isolation verified under [ADR 0023](../../docs/ADRs/0023-limit-vps-access-to-nas-backup-https.md). See the [runbook](../../docs/deployment/runbook.md) for image IDs and evidence. Production credentials, encrypted transfer and independent application restore have passed. The nightly midnight-UTC timer is enabled; NAS maintenance is installed and its full check, immutable snapshot coverage and receiver recovery passed; daily 06:00 maintenance and boot recovery are enabled, and the saved recovery task passed a manual run. See the [production verification](../../docs/deployment/production-backup-2026-11-01.md) for current state and remaining work.

The container has `network_mode: none`. Tailscale Serve terminates HTTPS on the NAS's private tailnet port 8443 and connects to a Unix socket in a dedicated directory inside the quota-controlled backup share. There are no published Docker ports. The dedicated deactivated DSM identity `cv-backup` (1028:100) can write only the mounted repository and socket directory, while an administrator controls the password verifier. Keep the existing Btrfs folder quota and immutable snapshots enabled.

Synology runs Tailscale as package UID/GID `165290:165290`. `prepare-socket.sh` grants that account non-inheriting traversal only on the backup share. The socket directory has owner/group `1028:165290` and mode `2710`; setgid makes the socket inherit the package group, and the receiver's umask `007` gives the socket mode `0770`. The package can connect but cannot list or write the directory, access repository files, read credentials or traverse Docker storage. Rest-server explicitly creates repository directories with `0700` and files with `0600`, independently of this socket umask.

## Build inputs

Resolved and scanned on 2026-10-31:

- Upstream rest-server v0.14.0 commit `ad130de02124c445300f149fa4f8e826dfdd0e3f`.
- [Source archive](https://codeload.github.com/restic/rest-server/tar.gz/ad130de02124c445300f149fa4f8e826dfdd0e3f), SHA256 `7d65f332c4f3894c23eb946141e164ca10dab72fc2271a6b41716c43d45c6e8f`.
- Go 1.27.3, `CGO_ENABLED=0`, `GOOS=linux`, `GOARCH=amd64`.
- The checked-in `go.mod` and `go.sum` replace upstream's versions, updating x/crypto to 0.58.0 and x/sys to 0.49.0. Run `go mod download` and `go mod verify`.
- Alpine 3.24.3 index digest `sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a`, pinned in the Dockerfile.

In the extracted upstream source, build the server:

```sh
go build -buildvcs=false -mod=readonly -trimpath \
  -ldflags '-s -w -X main.version=0.14.0-cv.20261031' \
  -o rest-server ./cmd/rest-server
```

Build `auth-init.go` with the same toolchain and module lock files:

```sh
go build -buildvcs=false -mod=readonly -trimpath -ldflags '-s -w' \
  -o cv-auth-init auth-init.go
```

Scan the pinned base and both executable files before staging. On Windows, Trivy needs an explicit `gobinary` file pattern to recognize Linux binaries; an empty results array is not a successful binary scan. Retain dated reports privately. A clean scan does not establish absence of all vulnerabilities or fix the NAS host kernel.

## One-time installation

Prepare a bundle with `Dockerfile`, `.dockerignore`, `compose.yaml`, `entrypoint.sh`, `install.sh`, `prepare-socket.sh`, `verify.sh`, both Linux executables, and a 3072-bit RSA public key named `recovery-public.pem`. Keep the corresponding private key only in the owner's protected workstation directory. Generate `SHA256SUMS` over exactly these ten files. Stage these nonsecret artifacts at `/volume1/docker/chordviewer-backup-setup`; pin the manifest's SHA256 separately in the DSM task before running anything as root. The `.dockerignore` allowlist excludes credentials from any later image build context.

The disabled, manually run DSM task verifies the manifest and all files, then invokes `install.sh <manifest-sha256>`. Capture its nonsecret output to a new `install-result.txt` in the staging folder using shell noclobber. Do not log credentials or enable shell tracing. DSM requires the owner's administrator password to save a root task. The owner performs the final Run action that creates the new receiver credential.

The installer refuses pre-existing receiver directories, containers, socket volumes or Serve configuration. It verifies the service identity, copies the bundle to root-only `/volume1/@chordviewer-backup`, builds the image, generates authentication, creates the repository subdirectory, and starts the restricted receiver. Failure stops only the receiver created by this installer and removes only its attempted Serve listener; files remain for diagnosis. Do not blindly rerun a partial installation or erase repositories to make it pass.

`client.json` remains root-only on the NAS and is not mounted into the receiver. `receiver.htpasswd` is a read-only bcrypt verifier. `receiver-recovery.enc` contains RSA-OAEP/SHA256 ciphertext with label `chordviewer-nas-receiver-v1`; the installer exports only this ciphertext to the staging folder. Decrypt it privately on the workstation. These credentials authenticate REST access; they are not the restic repository encryption key.

`verify.sh` checks effective identity, network mode, mounts, resource limits, capabilities, no-new-privileges, AppArmor and unauthenticated HTTP 401 both as root and as the Tailscale package account. It also verifies the package's denied filesystem access. It queries no-new-privileges through BusyBox `setpriv --dump`: the NAS kernel supports the kernel query but predates the Linux 4.10 `/proc` status field. The installer also restarts this container and repeats verification. Workstation acceptance must additionally prove trusted HTTPS, invalid-credential and cross-namespace rejection, append-only protection, encrypted backup, full repository check and checksum-matching restore. A NAS reboot requires an agreed maintenance window.

## Repair the initial socket location

The first installation used a tmpfs volume below Docker's private storage. Local root checks passed, but the restricted Tailscale package could not traverse that path, causing HTTP 502. Do not rerun the installer or regenerate credentials to fix this.

Stage a separate bundle at `/volume1/docker/chordviewer-backup-socket-fix` containing `repair-socket-access.sh`, `prepare-socket.sh`, `verify.sh`, `compose.yaml`, `Dockerfile`, `.dockerignore`, `entrypoint.sh`, and the unchanged `rest-server` executable. Pin a new manifest over these eight files. Run the verified repair script with that manifest digest through the disabled DSM root task. It preserves existing credentials and repositories, builds wrapper revision `0.14.0-cv.20261031.2`, grants socket-only access, changes the receiver mount and Serve target, and validates a receiver restart. On failure after changes begin, it stops the receiver, disables only Serve port 8443 and attempts to remove only the new traversal ACL. Files remain for diagnosis; review any partial repair before retrying. The old socket volume is left unused.

The initial repair stopped while attempting to remove Synology ACL metadata from the newly created empty socket directory. The corrected helper sets ownership and mode directly and validates effective access instead. For this specific interruption only, `resume-socket-access.sh` requires the old container stopped, Serve disabled, the original Compose file unchanged, and an empty root-owned `0700` socket directory. Stage it with `prepare-socket.sh`, `verify.sh`, `compose.yaml`, `Dockerfile`, `.dockerignore` and `entrypoint.sh` at `/volume1/docker/chordviewer-backup-socket-resume`, with a separately pinned seven-file manifest. It verifies the existing image's wrapper and binary hashes before applying the same approved permission change. Capture a fresh `resume-result.txt`; do not reuse either bootstrap after a partial run without inspecting the state.

## Operation

Run `verify.sh served` as NAS administrator for diagnostics. Use the private Compose file for maintenance. To stop this receiver, turn off only `tailscale serve --https=8443 off` and stop `chordviewer-backup-receiver`; do not reset all Serve settings or remove repository volumes.

The kernel has no pids controller or CPU CFS quota support. `nproc=128` applies to the dedicated UID, CPU affinity limits execution to CPU 0, and 512 MiB memory plus equal memory-swap limits prevent additional swap. Seccomp was not reported and is not claimed. AppArmor is mandatory and validated. Keep container logs bounded to three 10 MiB files. The 100 GB share quota bounds live repository and socket-directory data, while snapshots can consume additional volume space.

The server permits new objects, reads and lock deletion but denies deleting or replacing existing backup objects. The VPS will not receive deletion/retention credentials. Keep independent recovery keys and NAS administration outside the VPS. Monitor free space, snapshot protection, backup age and failures separately; they are not provided by this receiver alone.
