package oauth

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"
)

type jwk struct {
	KID string `json:"kid"`
	Kty string `json:"kty"`
	Alg string `json:"alg"`
	Use string `json:"use"`
	N   string `json:"n"`
	E   string `json:"e"`
}

type keySet struct {
	keys map[string]*rsa.PublicKey
}

func (c *Client) keySets(ctx context.Context) (map[string]*rsa.PublicKey, error) {
	c.mu.RLock()
	if c.keys != nil && c.now().Sub(c.loaded) < time.Hour {
		keys := c.keys.keys
		c.mu.RUnlock()
		return keys, nil
	}
	c.mu.RUnlock()

	meta, err := c.Metadata(ctx)
	if err != nil {
		return nil, err
	}
	if meta.JWKSURI == "" {
		return map[string]*rsa.PublicKey{}, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, meta.JWKSURI, http.NoBody)
	if err != nil {
		return nil, fmt.Errorf("build jwks request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch jwks: %w", err)
	}
	defer func() { _ = resp.Body.Close() }() //nolint:errcheck // a close error cannot be reported after the body was consumed
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch jwks: %w", fmt.Errorf("status %d", resp.StatusCode))
	}
	var body struct {
		Keys []jwk `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("decode jwks: %w", err)
	}
	set := &keySet{keys: make(map[string]*rsa.PublicKey, len(body.Keys))}
	for _, k := range body.Keys {
		if k.Kty != "RSA" || (k.Alg != "" && k.Alg != "RS256") {
			continue
		}
		n, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil {
			return nil, fmt.Errorf("decode jwks modulus: %w", err)
		}
		e, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil {
			return nil, fmt.Errorf("decode jwks exponent: %w", err)
		}
		set.keys[k.KID] = &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(new(big.Int).SetBytes(e).Int64())}
	}
	c.mu.Lock()
	c.keys = set
	c.mu.Unlock()
	return set.keys, nil
}

func verifyIDToken(raw, issuer, clientID, nonce, groupsClaim string, keys map[string]*rsa.PublicKey, now time.Time) (Claims, error) {
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return Claims{}, fmt.Errorf("%w: not a compact jws", ErrInvalidToken)
	}
	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return Claims{}, fmt.Errorf("%w: header is not base64url", ErrInvalidToken)
	}
	var header struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	if err := json.Unmarshal(headerJSON, &header); err != nil || header.Alg != "RS256" {
		return Claims{}, fmt.Errorf("%w: unsupported algorithm", ErrInvalidToken)
	}
	n, ok := keys[header.Kid]
	if !ok {
		return Claims{}, fmt.Errorf("%w: unknown signing key", ErrInvalidToken)
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return Claims{}, fmt.Errorf("%w: signature is not base64url", ErrInvalidToken)
	}
	if !verifyRS256([]byte(parts[0]+"."+parts[1]), sig, n) {
		return Claims{}, fmt.Errorf("%w: bad signature", ErrInvalidToken)
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Claims{}, fmt.Errorf("%w: payload is not base64url", ErrInvalidToken)
	}
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return Claims{}, fmt.Errorf("%w: payload is not json", ErrInvalidToken)
	}
	groupsRaw := envelope[groupsClaim]
	var claims struct {
		Iss           string          `json:"iss"`
		Sub           string          `json:"sub"`
		Aud           json.RawMessage `json:"aud"`
		Azp           string          `json:"azp"`
		Exp           int64           `json:"exp"`
		Iat           int64           `json:"iat"`
		Nonce         string          `json:"nonce"`
		Email         string          `json:"email"`
		EmailVerified *bool           `json:"email_verified"`
		Name          string          `json:"name"`
		Picture       string          `json:"picture"`
		PreferredName string          `json:"preferred_username"`
		Groups        json.RawMessage `json:"-"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return Claims{}, fmt.Errorf("%w: claims are malformed", ErrInvalidToken)
	}
	if err := checkClaims(claims.Iss, claims.Aud, claims.Azp, claims.Exp, claims.Iat, claims.Nonce, claims.EmailVerified, claims.Sub, issuer, clientID, nonce, now); err != nil {
		return Claims{}, err
	}

	out := Claims{EmailVerified: claims.EmailVerified != nil && *claims.EmailVerified, Issuer: claims.Iss, Sub: claims.Sub, Email: claims.Email, Name: claims.Name, Picture: pictureURL(claims.Picture)}
	if out.Name == "" {
		out.Name = claims.PreferredName
	}
	if out.Email == "" {
		out.Email = claims.Sub + "@" + strings.TrimPrefix(strings.TrimPrefix(issuer, "https://"), "http://")
	}
	if groups, err := parseStringList(groupsRaw); err == nil {
		out.Groups = groups
	}
	return out, nil
}

func checkClaims(iss string, aud json.RawMessage, azp string, exp, iat int64, nonce string, verified *bool, sub, issuer, clientID, expectedNonce string, now time.Time) error {
	if strings.TrimRight(iss, "/") != strings.TrimRight(issuer, "/") {
		return fmt.Errorf("%w: wrong issuer", ErrInvalidToken)
	}
	if !audienceContains(aud, clientID) {
		return fmt.Errorf("%w: wrong audience", ErrInvalidToken)
	}
	if azp != "" && azp != clientID {
		return fmt.Errorf("%w: wrong authorized party", ErrInvalidToken)
	}
	if time.Unix(exp, 0).Before(now.Add(-leeway)) {
		return fmt.Errorf("%w: token expired", ErrInvalidToken)
	}
	if iat != 0 && time.Unix(iat, 0).After(now.Add(leeway)) {
		return fmt.Errorf("%w: token issued in the future", ErrInvalidToken)
	}
	if nonce != expectedNonce || nonce == "" {
		return fmt.Errorf("%w: nonce mismatch", ErrInvalidToken)
	}
	if verified != nil && !*verified {
		return fmt.Errorf("%w: email not verified", ErrInvalidToken)
	}
	if sub == "" {
		return fmt.Errorf("%w: missing subject", ErrInvalidToken)
	}
	return nil
}

func audienceContains(raw json.RawMessage, want string) bool {
	list, err := parseStringList(raw)
	if err != nil {
		return false
	}
	for _, v := range list {
		if v == want {
			return true
		}
	}
	return false
}

func parseStringList(raw json.RawMessage) ([]string, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	var one string
	if err := json.Unmarshal(raw, &one); err == nil {
		return []string{one}, nil
	}
	var many []string
	if err := json.Unmarshal(raw, &many); err != nil {
		return nil, fmt.Errorf("decode string list: %w", err)
	}
	return many, nil
}

func verifyRS256(signingInput, sig []byte, key *rsa.PublicKey) bool {
	digest := sha256.Sum256(signingInput)
	return rsa.VerifyPKCS1v15(key, crypto.SHA256, digest[:], sig) == nil
}
