package oauth

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestFinishReportsTokenResponseErrors(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		status int
		body   string
		want   string
	}{
		{
			name:   "provider error with success status",
			status: http.StatusOK,
			body:   `{"error":"invalid_grant","error_description":"authorization code expired"}`,
			want:   "authorization code expired",
		},
		{
			name:   "provider error with failure status",
			status: http.StatusBadRequest,
			body:   `{"error":"invalid_client","error_description":"client authentication failed"}`,
			want:   "client authentication failed",
		},
		{
			name:   "empty success response",
			status: http.StatusOK,
			body:   `{}`,
			want:   "server response missing access_token",
		},
		{
			name:   "non-json failure response",
			status: http.StatusBadGateway,
			body:   `upstream unavailable`,
			want:   "502 Bad Gateway",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			t.Cleanup(srv.Close)
			c := New(Config{}, srv.Client())
			c.remember(Discovery{TokenEndpoint: srv.URL})
			blob, err := json.Marshal(stateCookie{State: "state", Verifier: "verifier", Nonce: "nonce"})
			if err != nil {
				t.Fatalf("marshal state: %v", err)
			}
			stateBlob, err := encodeState(blob)
			if err != nil {
				t.Fatalf("encode state: %v", err)
			}

			_, err = c.Finish(context.Background(), "code", "state", stateBlob)
			if !errors.Is(err, ErrInvalidToken) || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("Finish() error = %v, want %q", err, tc.want)
			}
			if errors.Is(err, ErrNoIDToken) {
				t.Fatalf("Finish() error = %v, must not enter userinfo fallback", err)
			}
		})
	}
}

func TestUserinfoReportsMissingInputs(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name        string
		meta        *Discovery
		accessToken string
		want        string
	}{
		{
			name:        "access token",
			meta:        &Discovery{UserinfoEndpoint: "https://idp.example.com/userinfo"},
			accessToken: "",
			want:        "missing access token",
		},
		{
			name:        "endpoint",
			meta:        &Discovery{},
			accessToken: "token",
			want:        "userinfo endpoint is not configured",
		},
		{
			name:        "metadata",
			meta:        nil,
			accessToken: "token",
			want:        "userinfo endpoint is not configured",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			c := New(Config{}, nil)
			if tc.meta != nil {
				c.remember(*tc.meta)
			}
			_, err := c.userinfo(context.Background(), tc.accessToken)
			if !errors.Is(err, ErrInvalidToken) || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("userinfo() error = %v, want %q", err, tc.want)
			}
		})
	}
}

func TestTokenExchangeAuthentication(t *testing.T) {
	t.Parallel()
	for _, style := range []string{"basic", "form"} {
		t.Run(style, func(t *testing.T) {
			t.Parallel()
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if err := r.ParseForm(); err != nil {
					http.Error(w, "bad form", http.StatusBadRequest)
					return
				}
				id, secret, basic := r.BasicAuth()
				valid := basic && id == "client" && secret == "secret"
				if style == "form" {
					valid = !basic && r.PostForm.Get("client_id") == "client" &&
						r.PostForm.Get("client_secret") == "secret"
				}
				w.Header().Set("Content-Type", "application/json")
				if !valid {
					w.WriteHeader(http.StatusUnauthorized)
					_, _ = w.Write([]byte(`{"error":"invalid_client"}`))
					return
				}
				if r.PostForm.Get("code_verifier") != "verifier" ||
					r.PostForm.Get("code") != "code" ||
					r.PostForm.Get("grant_type") != "authorization_code" ||
					r.PostForm.Get("redirect_uri") != "https://app.example/callback" {
					http.Error(w, "invalid exchange parameters", http.StatusBadRequest)
					return
				}
				_, _ = w.Write([]byte(`{"access_token":"access","token_type":"Bearer","id_token":"identity"}`))
			}))
			t.Cleanup(srv.Close)
			c := New(Config{
				ClientID: "client", ClientSecret: "secret",
				RedirectURL: "https://app.example/callback",
			}, srv.Client())
			id, access, err := c.token(t.Context(), Discovery{TokenEndpoint: srv.URL}, "code", "verifier")
			if err != nil || id != "identity" || access != "access" {
				t.Fatalf("token exchange: id=%q access=%q error=%v", id, access, err)
			}
		})
	}
}

func TestJWKSKeyRotationAndRS384Verification(t *testing.T) {
	t.Parallel()
	oldKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate old key: %v", err)
	}
	newKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate new key: %v", err)
	}
	now := time.Date(2026, 4, 1, 12, 0, 0, 0, time.UTC)
	var rotated atomic.Bool
	var jwksHits atomic.Int32
	var srvURL string

	encodeJWK := func(kid string, pub *rsa.PublicKey) map[string]string {
		return map[string]string{
			"kid": kid,
			"kty": "RSA",
			"alg": "RS384",
			"use": "sig",
			"n":   base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
			"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pub.E)).Bytes()),
		}
	}

	signRS384 := func(kid string, key *rsa.PrivateKey) string {
		header, _ := json.Marshal(map[string]string{"alg": "RS384", "kid": kid})
		payload, _ := json.Marshal(map[string]any{
			"iss":   srvURL,
			"sub":   "user-1",
			"aud":   "client-1",
			"exp":   now.Add(10 * time.Minute).Unix(),
			"iat":   now.Unix(),
			"nonce": "nonce-1",
			"email": "user@example.com",
		})
		signingInput := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(payload)
		digest := sha512.Sum384([]byte(signingInput))
		sig, signErr := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA384, digest[:])
		if signErr != nil {
			t.Fatalf("sign token: %v", signErr)
		}
		return signingInput + "." + base64.RawURLEncoding.EncodeToString(sig)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/jwks", func(w http.ResponseWriter, _ *http.Request) {
		jwksHits.Add(1)
		w.Header().Set("Content-Type", "application/json")
		if rotated.Load() {
			_ = json.NewEncoder(w).Encode(map[string]any{"keys": []any{encodeJWK("k2", &newKey.PublicKey)}})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []any{encodeJWK("k1", &oldKey.PublicKey)}})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		tok := signRS384("k2", newKey)
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "acc", "token_type": "Bearer", "id_token": tok})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	srvURL = srv.URL

	c := New(Config{IssuerURL: srv.URL, ClientID: "client-1", ClientSecret: "secret-1"}, srv.Client())
	c.SetClock(func() time.Time { return now })
	c.remember(Discovery{Issuer: srv.URL, TokenEndpoint: srv.URL + "/token", JWKSURI: srv.URL + "/jwks"})

	if _, err := c.keySets(t.Context()); err != nil {
		t.Fatalf("prime keySets: %v", err)
	}
	rotated.Store(true)
	now = now.Add(15 * time.Second)

	blob, _ := json.Marshal(stateCookie{State: "st", Verifier: "ver", Nonce: "nonce-1"})
	stateBlob, _ := encodeState(blob)
	claims, err := c.Finish(t.Context(), "code", "st", stateBlob)
	if err != nil {
		t.Fatalf("Finish() after key rotation failed: %v", err)
	}
	if claims.Sub != "user-1" || jwksHits.Load() != 2 {
		t.Fatalf("claims=%+v jwksHits=%d, want sub=user-1 and 2 jwks fetches", claims, jwksHits.Load())
	}
}
