package apikey

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
)

const keyBytes = 32

// ErrMalformed is returned for headers that do not carry a valid Bearer credential.
var ErrMalformed = errors.New("malformed api key header")

// Codec generates, hashes, displays and parses prefixed API keys.
type Codec struct {
	Prefix string
}

// New creates a Codec for the given token prefix (for example "ac_" or "cc_").
func New(prefix string) Codec {
	return Codec{Prefix: prefix}
}

// Generate returns a plaintext bearer token and the digest persisted with it.
func (c Codec) Generate() (token string, digest [32]byte, err error) {
	return Generate(c.Prefix)
}

// Display returns a short non-secret identifier used in listings.
func (c Codec) Display(token string) string {
	return Display(c.Prefix, token)
}

// ParseHeader extracts the token from an `Authorization: Bearer <token>` header.
func (c Codec) ParseHeader(header string) (string, error) {
	return ParseHeader(c.Prefix, header)
}

// Generate returns a plaintext bearer token with prefix and its SHA-256 digest.
func Generate(prefix string) (token string, digest [32]byte, err error) {
	buf := make([]byte, keyBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", digest, fmt.Errorf("read random bytes: %w", err)
	}
	token = prefix + base64.RawURLEncoding.EncodeToString(buf)
	return token, Hash(token), nil
}

// Hash derives the stored SHA-256 digest of a token.
func Hash(token string) [32]byte {
	return sha256.Sum256([]byte(token))
}

// Display returns a short non-secret identifier used in listings.
func Display(prefix, token string) string {
	if len(token) <= len(prefix)+6 {
		return token
	}
	return token[:len(prefix)+6] + "…"
}

// ParseHeader extracts a prefixed token from an `Authorization: Bearer <token>` header.
func ParseHeader(prefix, header string) (string, error) {
	scheme, rest, ok := strings.Cut(strings.TrimSpace(header), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return "", ErrMalformed
	}
	token := strings.TrimSpace(rest)
	if !strings.HasPrefix(token, prefix) || len(token) == len(prefix) || strings.ContainsAny(token, " \t\r\n") {
		return "", ErrMalformed
	}
	return token, nil
}
