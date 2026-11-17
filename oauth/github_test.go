package oauth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestIssuerPathsFollowDiscoverySpec(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		"https://github.com":                "https://github.com/.well-known/openid-configuration",
		"https://idp.example.com/tenant/1/": "https://idp.example.com/.well-known/openid-configuration/tenant/1",
	}
	for issuer, want := range cases {
		origin := strings.TrimRight(issuer, "/")
		got := discoveryURL(issuer)
		if got != want {
			t.Fatalf("%s -> %s, want %s (origin %s)", issuer, got, want, origin)
		}
	}
}

func TestGitHubDiscoveryFallbackAndUserinfo(t *testing.T) {
	t.Parallel()
	var sawCredentials bool
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	})
	mux.HandleFunc("/login/oauth/access_token", func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		sawCredentials = r.PostForm.Get("client_id") == "id" &&
			r.PostForm.Get("client_secret") == "secret" &&
			r.Header.Get("Authorization") == ""
		if !sawCredentials {
			http.Error(w, "invalid client credentials", http.StatusUnauthorized)
			return
		}
		if r.PostForm.Get("code_verifier") != "" {
			http.Error(w, "pkce sent", http.StatusBadRequest)
			return
		}
		if r.PostForm.Get("code") != "code" {
			http.Error(w, "bad code", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "gho_token", "token_type": "bearer"})
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer gho_token" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"id": 42, "login": "octo", "name": "Octo Cat", "avatar_url": "https://avatars.githubusercontent.com/u/42"})
	})
	mux.HandleFunc("/user/emails", func(w http.ResponseWriter, _ *http.Request) {
		json.NewEncoder(w).Encode([]map[string]any{{"email": "verified@example.com", "primary": true, "verified": true}})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	// The fallback only applies to github.com, so the test drives the pieces
	// that are host specific and points userinfo at the fake server.
	client := srv.Client()
	client.Transport = githubTestTransport{target: srv.URL, base: client.Transport}
	c := New(Config{VerifyGitHubEmail: true, IssuerURL: "https://github.com", ClientID: "id", ClientSecret: "secret", RedirectURL: "http://cc/cb", Scopes: []string{"openid", "groups", "read:user"}}, client)
	meta := githubDiscovery()
	meta.TokenEndpoint = srv.URL + "/login/oauth/access_token"
	meta.UserinfoEndpoint = srv.URL + "/user"
	c.remember(meta)

	if got := c.scopes(meta); len(got) != 1 || got[0] != "read:user" {
		t.Fatalf("scopes = %v; GitHub must not receive openid or groups", got)
	}
	accessToken, err := c.exchangeCode(context.Background(), meta, "code", "verifier")
	if err != nil || accessToken != "gho_token" {
		t.Fatalf("token exchange: %v (%q)", err, accessToken)
	}

	claims, err := c.userinfo(context.Background(), "gho_token")
	if err != nil {
		t.Fatalf("userinfo: %v", err)
	}
	if !claims.EmailVerified || claims.Email != "verified@example.com" || claims.Sub != "42" || claims.Name != "Octo Cat" || claims.Picture != "https://avatars.githubusercontent.com/u/42" {
		t.Fatalf("claims = %+v", claims)
	}
	if !sawCredentials {
		t.Fatal("token request must send client credentials in the form")
	}
}

func TestSameIssuerAcceptsOriginAfterPath(t *testing.T) {
	t.Parallel()
	cases := []struct {
		discovered, configured string
		want                   bool
	}{
		{"https://github.com", "https://github.com/login/oauth", true},
		{"https://idp.example.com", "https://idp.example.com/", true},
		{"https://idp.example.com", "https://idp.example.com/tenant", true},
		{"https://evil.example.com", "https://github.com/login/oauth", false},
	}
	for _, c := range cases {
		if got := sameIssuer(c.discovered, c.configured); got != c.want {
			t.Fatalf("sameIssuer(%q, %q) = %v, want %v", c.discovered, c.configured, got, c.want)
		}
	}
}

type unavailableDiscoveryTransport struct {
	calls int
}

func (t *unavailableDiscoveryTransport) RoundTrip(_ *http.Request) (*http.Response, error) {
	t.calls++
	return nil, errors.New("network unavailable")
}

func TestGitHubMetadataWithoutNetwork(t *testing.T) {
	t.Parallel()
	for _, issuer := range []string{"https://github.com", "https://github.com/login/oauth/", "https://GITHUB.com"} {
		t.Run(issuer, func(t *testing.T) {
			transport := &unavailableDiscoveryTransport{}
			client := New(Config{IssuerURL: issuer}, &http.Client{Transport: transport})
			meta, err := client.Metadata(t.Context())
			if err != nil {
				t.Fatal(err)
			}
			if transport.calls != 0 {
				t.Fatal("GitHub metadata must not require network discovery")
			}
			if meta.AuthorizationEndpoint != "https://github.com/login/oauth/authorize" ||
				meta.TokenEndpoint != "https://github.com/login/oauth/access_token" {
				t.Fatalf("unexpected GitHub endpoints: %+v", meta)
			}
		})
	}
	transport := &unavailableDiscoveryTransport{}
	client := New(Config{IssuerURL: "https://github.com.example.org"}, &http.Client{Transport: transport})
	if _, err := client.Metadata(t.Context()); err == nil || transport.calls != 1 {
		t.Fatal("other providers must still use discovery")
	}
}

type githubTestTransport struct {
	target string
	base   http.RoundTripper
}

func (t githubTestTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	if r.URL.Host == "api.github.com" {
		r = r.Clone(r.Context())
		target, err := url.Parse(t.target + r.URL.Path)
		if err != nil {
			return nil, err
		}
		r.URL = target
	}
	return t.base.RoundTrip(r)
}
