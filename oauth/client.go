package oauth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
)

const (
	maxDiscoveryBytes = 1 << 20
	leeway            = 60 * time.Second
)

// ErrInvalidToken is returned for callbacks that fail validation.
var ErrInvalidToken = errors.New("invalid oauth token")

var errIssuerMismatch = errors.New("issuer mismatch")

// Discovery is the subset of OIDC metadata the client needs.
type Discovery struct {
	Issuer                string   `json:"issuer"`
	AuthorizationEndpoint string   `json:"authorization_endpoint"`
	TokenEndpoint         string   `json:"token_endpoint"`
	JWKSURI               string   `json:"jwks_uri"`
	ClaimsSupported       []string `json:"claims_supported"`
	UserinfoEndpoint      string   `json:"userinfo_endpoint"`
}

// Config describes the upstream identity provider.
type Config struct {
	VerifyGitHubEmail bool
	IssuerURL         string
	ClientID          string
	ClientSecret      string
	Scopes            []string
	RedirectURL       string
	GroupsClaim       string
}

// Client is an OAuth 2.0 authorization-code + PKCE client for any OIDC issuer.
type Client struct {
	cfg    Config
	http   *http.Client
	now    func() time.Time
	mu     sync.RWMutex
	meta   *Discovery
	keys   *keySet
	loaded time.Time
}

// New builds a client. Metadata is fetched lazily on first use and refetched
// at most once per hour; ctx bounds the lifetime of the client.
func New(cfg Config, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	if cfg.GroupsClaim == "" {
		cfg.GroupsClaim = "groups"
	}
	return &Client{cfg: cfg, http: httpClient, now: func() time.Time { return time.Now().UTC() }}
}

// Issuer exposes the configured issuer URL.
func (c *Client) Issuer() string { return c.cfg.IssuerURL }

// ErrNoIDToken is returned by providers that only implement userinfo-based OIDC.
var ErrNoIDToken = errors.New("id_token not issued")

// Claims is the verified identity of a logged-in user.
type Claims struct {
	EmailVerified bool
	Issuer        string
	Sub           string
	Email         string
	Name          string
	Picture       string
	Groups        []string
}

// Name returns the host of the issuer, used on the login page.
func (c *Client) Name() string {
	u, err := url.Parse(c.cfg.IssuerURL)
	if err != nil || u.Host == "" {
		return "identity provider"
	}
	return u.Host
}

// Start returns the redirect URL and the state stored in the browser cookie.
func (c *Client) Start(ctx context.Context) (redirectURL, state string, err error) {
	redirectURL, state, err = c.begin(ctx)
	if err != nil {
		return "", "", fmt.Errorf("oauth start: %w", err)
	}
	return redirectURL, state, nil
}

// Finish validates the callback and issues the claims.
func (c *Client) Finish(ctx context.Context, code, state, stateBlob string) (Claims, error) {
	claims, err := c.exchange(ctx, code, state, stateBlob)
	if err != nil {
		return Claims{}, fmt.Errorf("oauth exchange: %w", err)
	}
	return claims, nil
}

func (c *Client) begin(ctx context.Context) (redirect, stateBlob string, err error) {
	meta, err := c.Metadata(ctx)
	if err != nil {
		return "", "", err
	}
	verifier, err := randomString(32)
	if err != nil {
		return "", "", err
	}
	state, err := randomString(16)
	if err != nil {
		return "", "", err
	}
	nonce, err := randomString(16)
	if err != nil {
		return "", "", err
	}
	blob, err := json.Marshal(stateCookie{State: state, Verifier: verifier, Nonce: nonce})
	if err != nil {
		return "", "", fmt.Errorf("encode state: %w", err)
	}
	conf := c.oauthConfig(meta)
	var opts []oauth2.AuthCodeOption
	if !c.isGitHub() {
		opts = append(opts, oauth2.SetAuthURLParam("nonce", nonce), oauth2.S256ChallengeOption(verifier))
	}
	redirect = conf.AuthCodeURL(state, opts...)
	stateBlob, err = encodeState(blob)
	if err != nil {
		return "", "", err
	}
	return redirect, stateBlob, nil
}

type stateCookie = StateCookie

// Exchange validates the callback and returns the user's verified claims.
// When the provider issues no id_token (plain OAuth servers), the userinfo
// endpoint is used instead and the subject is then trusted as-is.
func (c *Client) exchange(ctx context.Context, code, state, stateBlob string) (Claims, error) {
	sc, err := decodeState(stateBlob)
	if err != nil {
		return Claims{}, err
	}
	if state == "" || subtleEqual(sc.State, state) != nil {
		return Claims{}, fmt.Errorf("%w: state mismatch", ErrInvalidToken)
	}
	meta, err := c.Metadata(ctx)
	if err != nil {
		return Claims{}, err
	}
	raw, accessToken, err := c.token(ctx, meta, code, sc.Verifier)
	if errors.Is(err, ErrNoIDToken) {
		info, infoErr := c.userinfo(ctx, accessToken)
		if infoErr != nil {
			return Claims{}, infoErr
		}
		if info.Sub == "" {
			return Claims{}, fmt.Errorf("%w: userinfo without subject", ErrInvalidToken)
		}
		return info, nil
	}
	if err != nil {
		return Claims{}, err
	}
	sets, err := c.keySets(ctx)
	if err != nil {
		return Claims{}, err
	}
	claims, err := verifyIDToken(raw, c.cfg.IssuerURL, c.cfg.ClientID, sc.Nonce, c.cfg.GroupsClaim, sets, c.now())
	if err != nil {
		return Claims{}, err
	}
	if claims.Picture == "" && accessToken != "" && meta.UserinfoEndpoint != "" {
		info, infoErr := c.userinfo(ctx, accessToken)
		if infoErr == nil && info.Sub == claims.Sub {
			claims.Picture = info.Picture
		}
	}
	return claims, nil
}

// Metadata fetches and caches the discovery document for one hour.
func (c *Client) Metadata(ctx context.Context) (Discovery, error) {
	c.mu.RLock()
	if c.meta != nil && c.now().Sub(c.loaded) < time.Hour {
		meta := *c.meta
		c.mu.RUnlock()
		return meta, nil
	}
	c.mu.RUnlock()

	if strings.EqualFold(issuerHost(c.cfg.IssuerURL), "github.com") {
		meta := githubDiscovery()
		c.remember(meta)
		return meta, nil
	}
	endpoint := discoveryURL(c.cfg.IssuerURL)
	status, resp, err := c.fetchDiscovery(ctx, endpoint)
	if err != nil {
		return Discovery{}, err
	}
	defer func() { _ = resp.Body.Close() }() //nolint:errcheck // a close error cannot be reported after the body was consumed
	if status != http.StatusOK {
		return Discovery{}, fmt.Errorf("fetch discovery: %w", fmt.Errorf("%s returned status %d", endpoint, status))
	}
	var meta Discovery
	dec := json.NewDecoder(io.LimitReader(resp.Body, maxDiscoveryBytes))
	if err := dec.Decode(&meta); err != nil {
		return Discovery{}, fmt.Errorf("decode discovery: %w", err)
	}
	if !sameIssuer(meta.Issuer, c.cfg.IssuerURL) {
		return Discovery{}, fmt.Errorf("decode discovery: %w", errIssuerMismatch)
	}
	if meta.AuthorizationEndpoint == "" || meta.TokenEndpoint == "" {
		return Discovery{}, fmt.Errorf("decode discovery: %w", errors.New("incomplete metadata"))
	}

	c.remember(meta)
	return meta, nil
}

// fetchDiscovery performs the discovery request; a non-200 status is
// reported so callers can decide whether a fallback applies.
func (c *Client) fetchDiscovery(ctx context.Context, endpoint string) (int, *http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, http.NoBody)
	if err != nil {
		return 0, nil, fmt.Errorf("build discovery request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("fetch discovery: %w", err)
	}
	return resp.StatusCode, resp, nil
}

func (c *Client) remember(meta Discovery) {
	c.mu.Lock()
	c.meta = &meta
	c.loaded = c.now()
	c.mu.Unlock()
}

// discoveryURL builds the discovery URL: OIDC Discovery 1.0 puts a path
// issuer after the well-known segment. GitHub publishes neither form, hence
// the plain-OAuth fallback in Metadata.
func discoveryURL(issuer string) string {
	origin := strings.TrimRight(issuer, "/")
	u, err := url.Parse(origin)
	if err != nil || strings.Trim(u.Path, "/") == "" {
		return origin + "/.well-known/openid-configuration"
	}
	return u.Scheme + "://" + u.Host + "/.well-known/openid-configuration/" + strings.Trim(u.Path, "/")
}

// sameIssuer accepts the configured issuer with or without its trailing
// slash, and providers whose discovery document publishes the origin instead
// of the issuer path. Unmatched hosts are always rejected; the caller fetched
// discovery from the configured issuer itself.
func sameIssuer(discovered, configured string) bool {
	d := strings.TrimRight(discovered, "/")
	c := strings.TrimRight(configured, "/")
	if d == c {
		return true
	}
	u, err := url.Parse(c)
	if err != nil {
		return false
	}
	return u.Path != "" && u.Host != "" && (u.Scheme+"://"+u.Host) == d
}

func issuerHost(issuer string) string {
	u, err := url.Parse(issuer)
	if err != nil {
		return ""
	}
	return u.Hostname()
}

// githubDiscovery is GitHub's OAuth 2.0 configuration, which GitHub documents
// but does not publish at a discovery URL.
func githubDiscovery() Discovery {
	return Discovery{
		Issuer:                "https://github.com",
		AuthorizationEndpoint: "https://github.com/login/oauth/authorize",
		TokenEndpoint:         "https://github.com/login/oauth/access_token",
		UserinfoEndpoint:      "https://api.github.com/user",
		ClaimsSupported:       []string{"id", "login", "name", "email", "avatar_url"},
	}
}

// exchangeCode returns the access token of a finished authorization; id tokens
// are not issued by plain OAuth servers.
func (c *Client) exchangeCode(ctx context.Context, meta Discovery, code, verifier string) (string, error) {
	_, accessToken, err := c.token(ctx, meta, code, verifier)
	if errors.Is(err, ErrNoIDToken) {
		return accessToken, nil
	}
	if err != nil {
		return "", err
	}
	return accessToken, nil
}

func (c *Client) token(ctx context.Context, meta Discovery, code, verifier string) (idToken, accessToken string, err error) {
	conf := c.oauthConfig(meta)
	var opts []oauth2.AuthCodeOption
	if !c.isGitHub() {
		opts = append(opts, oauth2.VerifierOption(verifier))
	}
	ctx = context.WithValue(ctx, oauth2.HTTPClient, c.http)
	token, err := conf.Exchange(ctx, code, opts...)
	if err != nil {
		return "", "", fmt.Errorf("exchange code: %w: %w", ErrInvalidToken, err)
	}
	idToken, ok := token.Extra("id_token").(string)
	if !ok || idToken == "" {
		return "", token.AccessToken, ErrNoIDToken
	}
	return idToken, token.AccessToken, nil
}

func (c *Client) oauthConfig(meta Discovery) *oauth2.Config {
	endpoint := oauth2.Endpoint{
		AuthURL:  meta.AuthorizationEndpoint,
		TokenURL: meta.TokenEndpoint,
	}
	if c.isGitHub() {
		endpoint.AuthStyle = github.Endpoint.AuthStyle
	}
	return &oauth2.Config{
		ClientID:     c.cfg.ClientID,
		ClientSecret: c.cfg.ClientSecret,
		RedirectURL:  c.cfg.RedirectURL,
		Scopes:       c.scopes(),
		Endpoint:     endpoint,
	}
}

func (c *Client) isGitHub() bool {
	return strings.EqualFold(issuerHost(c.cfg.IssuerURL), "github.com")
}

func (c *Client) scopes() []string {
	if c.isGitHub() {
		// GitHub has no openid scope and fails on unknown ones.
		seen := map[string]bool{}
		out := make([]string, 0, len(c.cfg.Scopes))
		for _, s := range c.cfg.Scopes {
			lower := strings.ToLower(s)
			if s == "" || lower == "openid" || lower == "groups" || seen[s] {
				continue
			}
			seen[s] = true
			out = append(out, s)
		}
		return out
	}
	out := make([]string, 0, len(c.cfg.Scopes)+1)
	seen := map[string]bool{}
	for _, s := range append([]string{"openid"}, c.cfg.Scopes...) {
		if s != "" && !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

func randomString(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("read random bytes: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func subtleEqual(a, b string) error {
	if a == "" || subtle.ConstantTimeCompare([]byte(a), []byte(b)) != 1 {
		return errors.New("value mismatch")
	}
	return nil
}

func encodeState(blob []byte) (string, error) {
	return base64.RawURLEncoding.EncodeToString(blob), nil
}

// StateCookie is the browser-side half of an in-flight login.
type StateCookie struct {
	State    string `json:"state"`
	Verifier string `json:"verifier"`
	Nonce    string `json:"nonce"`
}

// DecodeState parses the opaque blob stored during Start.
func DecodeState(blob string) (StateCookie, error) {
	sc, err := decodeState(blob)
	if err != nil {
		return StateCookie{}, fmt.Errorf("decode oauth state: %w", err)
	}
	return sc, nil
}

func decodeState(blob string) (stateCookie, error) {
	raw, err := base64.RawURLEncoding.DecodeString(blob)
	if err != nil {
		return stateCookie{}, fmt.Errorf("%w: state cookie is not base64", ErrInvalidToken)
	}
	var sc stateCookie
	if err := json.Unmarshal(raw, &sc); err != nil {
		return stateCookie{}, fmt.Errorf("%w: state cookie is malformed", ErrInvalidToken)
	}
	if sc.State == "" || sc.Verifier == "" {
		return stateCookie{}, fmt.Errorf("%w: state cookie is incomplete", ErrInvalidToken)
	}
	return sc, nil
}
