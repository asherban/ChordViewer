// NAS maintenance runs with no network, no capabilities, and only its repository,
// a separate state directory, and read-only credentials mounted into the container.
package main

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"time"
)

type Config struct {
	RepositoryID string `json:"repositoryId"`
	Baseline     string `json:"baselineSnapshotId"`
}
type Snapshot struct {
	ID    string    `json:"id"`
	Time  time.Time `json:"time"`
	Host  string    `json:"hostname"`
	Paths []string  `json:"paths"`
	Tags  []string  `json:"tags"`
}
type Receipt struct {
	FirstSeen    time.Time `json:"firstSeen"`
	SnapshotTime time.Time `json:"snapshotTime"`
}
type State struct {
	RepositoryID string             `json:"repositoryId"`
	LastRun      time.Time          `json:"lastRun"`
	Receipts     map[string]Receipt `json:"receipts"`
	NeedsPrune   bool               `json:"needsPrune"`
}
type Guard struct {
	Protected    bool      `json:"protected"`
	VerifiedAt   time.Time `json:"verifiedAt"`
	SnapshotTime time.Time `json:"snapshotTime"`
}

var identifier = regexp.MustCompile(`^[0-9a-f]{64}$`)

func readJSON(name string, value any) error {
	data, err := os.ReadFile(name)
	if err != nil {
		return err
	}
	if len(data) > 16*1024*1024 {
		return fmt.Errorf("JSON size exceeds safety bound")
	}
	return json.Unmarshal(data, value)
}
func saveJSON(name string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	tmp := name + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	if _, err = f.Write(append(data, '\n')); err != nil {
		f.Close()
		return err
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, name)
}

type limitedBuffer struct{ bytes.Buffer }

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if b.Len()+len(p) > 16*1024*1024 {
		return 0, fmt.Errorf("output exceeds safety bound")
	}
	return b.Buffer.Write(p)
}
func restic(args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, "/usr/local/bin/restic", append([]string{"--repo", "/repo", "--password-file", "/secret/maintenance.password", "--cache-dir", "/tmp/restic-cache", "--retry-lock", "2m"}, args...)...)
	cmd.Env = []string{"PATH=/usr/local/bin:/usr/bin:/bin", "HOME=/tmp", "GOMAXPROCS=1", "GOMEMLIMIT=384MiB"}
	var out limitedBuffer
	var stderr limitedBuffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("restic %s failed: %w (diagnostics withheld)", args[0], err)
	}
	return out.Bytes(), nil
}
func decrypt() error {
	var auth struct {
		Password string `json:"password"`
	}
	if err := readJSON("/auth/client.json", &auth); err != nil {
		return err
	}
	var wrapped struct {
		Salt       string `json:"salt"`
		Nonce      string `json:"nonce"`
		Ciphertext string `json:"ciphertext"`
	}
	if err := readJSON("/input/maintenance.enc.json", &wrapped); err != nil {
		return err
	}
	salt, err := base64.StdEncoding.DecodeString(wrapped.Salt)
	if err != nil {
		return err
	}
	nonce, err := base64.StdEncoding.DecodeString(wrapped.Nonce)
	if err != nil {
		return err
	}
	ciphertext, err := base64.StdEncoding.DecodeString(wrapped.Ciphertext)
	if err != nil {
		return err
	}
	if len(salt) != 32 || len(nonce) != 12 || len(auth.Password) < 32 {
		return fmt.Errorf("invalid credential envelope")
	}
	mac := hmac.New(sha256.New, []byte(auth.Password))
	mac.Write([]byte("chordviewer-maintenance-transfer-v1\x00"))
	mac.Write(salt)
	block, err := aes.NewCipher(mac.Sum(nil))
	if err != nil {
		return err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	plain, err := aead.Open(nil, nonce, ciphertext, []byte("production-v1"))
	if err != nil {
		return err
	}
	if !regexp.MustCompile(`^[A-Za-z0-9_-]{43}\n$`).Match(plain) {
		return fmt.Errorf("invalid maintenance password")
	}
	_, err = os.Stdout.Write(plain)
	return err
}
func maintain() error {
	now := time.Now().UTC()
	var config Config
	if err := readJSON("/config/config.json", &config); err != nil {
		return err
	}
	if !identifier.MatchString(config.RepositoryID) || !identifier.MatchString(config.Baseline) {
		return fmt.Errorf("missing pinned repository or recovery baseline")
	}
	data, err := restic("cat", "config")
	if err != nil {
		return err
	}
	var remote struct {
		ID string `json:"id"`
	}
	if err = json.Unmarshal(data, &remote); err != nil {
		return err
	}
	if remote.ID != config.RepositoryID {
		return fmt.Errorf("repository identity mismatch")
	}
	state := State{RepositoryID: config.RepositoryID, Receipts: map[string]Receipt{}}
	statePath := "/state/receipts.json"
	if err = readJSON(statePath, &state); err != nil && !os.IsNotExist(err) {
		return err
	}
	if state.RepositoryID != config.RepositoryID || state.Receipts == nil {
		return fmt.Errorf("invalid receipt ledger")
	}
	if !state.LastRun.IsZero() && (now.Before(state.LastRun.Add(-5*time.Minute)) || now.Sub(state.LastRun) > 48*time.Hour) {
		return fmt.Errorf("clock change or maintenance gap exceeds 48 hours; operator review required")
	}
	data, err = restic("snapshots", "--json")
	if err != nil {
		return err
	}
	var snapshots []Snapshot
	if err = json.Unmarshal(data, &snapshots); err != nil {
		return err
	}
	if len(snapshots) == 0 || len(snapshots) > 256 {
		return fmt.Errorf("unexpected snapshot count")
	}
	present := map[string]bool{}
	latest := time.Time{}
	newCount := 0
	var eligible []string
	for _, s := range snapshots {
		if !identifier.MatchString(s.ID) || s.Host != "chordviewer-production" || len(s.Paths) != 1 || s.Paths[0] != "/var/lib/chordviewer-backup/input" || len(s.Tags) != 1 || s.Tags[0] != "production" || s.Time.After(now.Add(5*time.Minute)) {
			return fmt.Errorf("unexpected snapshot metadata; retention stopped")
		}
		present[s.ID] = true
		if s.Time.After(latest) {
			latest = s.Time
		}
		receipt, known := state.Receipts[s.ID]
		if !known {
			if now.Sub(s.Time) > 48*time.Hour {
				return fmt.Errorf("unrecorded old snapshot; operator review required")
			}
			receipt = Receipt{now, s.Time}
			state.Receipts[s.ID] = receipt
			newCount++
		}
		if !receipt.SnapshotTime.Equal(s.Time) || receipt.FirstSeen.After(now.Add(5*time.Minute)) {
			return fmt.Errorf("receipt history mismatch")
		}
		if s.ID != config.Baseline && now.Sub(receipt.FirstSeen) >= 35*24*time.Hour && now.Sub(s.Time) >= 35*24*time.Hour {
			eligible = append(eligible, s.ID)
		}
	}
	if !present[config.Baseline] || newCount > 12 {
		return fmt.Errorf("baseline missing or abnormal number of new snapshots")
	}
	for id := range state.Receipts {
		if !present[id] {
			return fmt.Errorf("snapshot disappeared without approved maintenance")
		}
	}
	if _, err = restic("check", "--read-data"); err != nil {
		return err
	}
	state.LastRun = now
	if err = saveJSON(statePath, &state); err != nil {
		return err
	}
	sort.Strings(eligible)
	summary := map[string]any{"checkedAt": now, "fullDataCheck": true, "snapshots": len(snapshots), "newSnapshots": newCount, "eligible": eligible, "retentionDays": 35, "baselinePreserved": config.Baseline, "deleted": 0, "alertsConfigured": false}
	if len(eligible) > 0 || state.NeedsPrune {
		var guard Guard
		if err = readJSON("/guard/snapshot.json", &guard); err != nil {
			return fmt.Errorf("protected-snapshot guard unavailable: %w", err)
		}
		if !guard.Protected || now.Sub(guard.VerifiedAt) > 10*time.Minute || guard.VerifiedAt.After(now.Add(5*time.Minute)) || now.Sub(guard.SnapshotTime) > 26*time.Hour || guard.SnapshotTime.After(now.Add(5*time.Minute)) || now.Sub(latest) > 26*time.Hour {
			return fmt.Errorf("recent verified backup or immutable NAS snapshot required before deletion")
		}
		if len(eligible) > 0 {
			if _, err = restic(append([]string{"forget", "--dry-run"}, eligible...)...); err != nil {
				return err
			}
			if _, err = restic(append([]string{"forget"}, eligible...)...); err != nil {
				return err
			}
			for _, id := range eligible {
				delete(state.Receipts, id)
			}
			state.NeedsPrune = true
			if err = saveJSON(statePath, &state); err != nil {
				return err
			}
		}
		if _, err = restic("prune", "--max-repack-size", "256M"); err != nil {
			return err
		}
		if _, err = restic("check", "--read-data"); err != nil {
			return err
		}
		state.NeedsPrune = false
		if err = saveJSON(statePath, &state); err != nil {
			return err
		}
		summary["deleted"] = len(eligible)
	}
	if err = saveJSON("/state/last-success.json", summary); err != nil {
		return err
	}
	encoded, _ := json.Marshal(summary)
	fmt.Println(string(encoded))
	return nil
}
func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "Expected decrypt or maintain")
		os.Exit(1)
	}
	var err error
	switch os.Args[1] {
	case "decrypt":
		err = decrypt()
	case "maintain":
		err = maintain()
	default:
		err = fmt.Errorf("unknown mode %s", filepath.Base(os.Args[1]))
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "NAS maintenance failed:", err)
		os.Exit(1)
	}
}
