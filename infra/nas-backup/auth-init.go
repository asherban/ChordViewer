// Creates receiver authentication once and encrypts its recovery copy for the
// owner's workstation. Neither the password nor its hash is written to stdout.
package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/crypto/bcrypt"
)

func exclusive(path string, contents []byte, mode os.FileMode) error {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return err
	}
	if _, err = f.Write(contents); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

func run() error {
	if len(os.Args) != 4 {
		return fmt.Errorf("expected public-key-file, private-directory, encrypted-recovery-file")
	}
	keyBytes, err := os.ReadFile(os.Args[1])
	if err != nil {
		return err
	}
	block, _ := pem.Decode(keyBytes)
	if block == nil {
		return fmt.Errorf("invalid public key")
	}
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return err
	}
	publicKey, ok := parsed.(*rsa.PublicKey)
	if !ok || publicKey.N.BitLen() < 3072 {
		return fmt.Errorf("RSA public key must have at least 3072 bits")
	}
	for _, name := range []string{"client.json", "receiver.htpasswd"} {
		if _, err := os.Lstat(filepath.Join(os.Args[2], name)); !os.IsNotExist(err) {
			return fmt.Errorf("refusing to overwrite existing authentication files")
		}
	}
	if _, err := os.Lstat(os.Args[3]); !os.IsNotExist(err) {
		return fmt.Errorf("refusing to overwrite recovery file")
	}
	randomBytes := make([]byte, 32)
	if _, err = rand.Read(randomBytes); err != nil {
		return err
	}
	password := base64.RawURLEncoding.EncodeToString(randomBytes)
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return err
	}
	credentials, err := json.Marshal(map[string]string{"url": "https://sherbannas.asymptote-harmonic.ts.net:8443/chordviewer/", "username": "chordviewer", "password": password})
	if err != nil {
		return err
	}
	encrypted, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, publicKey, credentials, []byte("chordviewer-nas-receiver-v1"))
	if err != nil {
		return err
	}
	if err = exclusive(filepath.Join(os.Args[2], "client.json"), append(credentials, '\n'), 0600); err != nil {
		return err
	}
	if err = exclusive(filepath.Join(os.Args[2], "receiver.htpasswd"), []byte("chordviewer:"+string(hash)+"\n"), 0400); err != nil {
		return err
	}
	if err = exclusive(os.Args[3], []byte(base64.StdEncoding.EncodeToString(encrypted)+"\n"), 0600); err != nil {
		return err
	}
	fmt.Println("Receiver authentication created; encrypted recovery copy written.")
	return nil
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
