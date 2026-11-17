package oauth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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
