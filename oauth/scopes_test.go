package oauth

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestAuthorizationScopesFollowProviderCapabilities(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name      string
		supported []string
		scopes    []string
		want      string
		nonce     bool
	}{
		{"plain OAuth", []string{"profile", "email"}, []string{"profile", "email"}, "profile email", false},
		{"legacy OIDC settings", []string{"profile", "email"}, []string{"openid", "profile", "email", "openid"}, "profile email", false},
		{"OIDC", []string{"openid", "profile", "email"}, []string{"profile", "email"}, "openid profile email", true},
		{"missing scope metadata", nil, []string{"profile", "email"}, "openid profile email", true},
		{"empty scope metadata", []string{}, nil, "", false},
		{"unadvertised custom scope", []string{"openid", "profile"}, []string{"profile", "groups", "profile", ""}, "openid profile groups", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var issuer string
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/.well-known/openid-configuration" {
					http.NotFound(w, r)
					return
				}
				metadata := map[string]any{
					"issuer": issuer, "authorization_endpoint": issuer + "/authorize",
					"token_endpoint": issuer + "/token",
				}
				if tc.supported != nil {
					metadata["scopes_supported"] = tc.supported
				}
				if err := json.NewEncoder(w).Encode(metadata); err != nil {
					t.Error(err)
				}
			}))
			t.Cleanup(srv.Close)
			issuer = srv.URL
			client := New(Config{IssuerURL: issuer, Scopes: tc.scopes}, srv.Client())
			redirect, blob, err := client.Start(t.Context())
			if err != nil {
				t.Fatal(err)
			}
			location, err := url.Parse(redirect)
			if err != nil {
				t.Fatal(err)
			}
			query := location.Query()
			if query.Get("scope") != tc.want || (query.Get("nonce") != "") != tc.nonce {
				t.Fatalf("scope=%q nonce=%q, want scope=%q nonce=%v", query.Get("scope"), query.Get("nonce"), tc.want, tc.nonce)
			}
			state, err := DecodeState(blob)
			if err != nil {
				t.Fatal(err)
			}
			digest := sha256.Sum256([]byte(state.Verifier))
			if query.Get("state") != state.State || query.Get("code_challenge_method") != "S256" ||
				query.Get("code_challenge") != base64.RawURLEncoding.EncodeToString(digest[:]) {
				t.Fatal("authorization request lost state or PKCE binding")
			}
			if tc.nonce && query.Get("nonce") != state.Nonce {
				t.Fatal("OIDC nonce does not match stored state")
			}
		})
	}
}
