package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

const maxUserinfoBytes = 1 << 20

// userinfo fetches the profile of the access token. Plain OAuth servers
// (GitHub) answer with their own field names, which are normalized to the
// OIDC ones before the claims are returned.
func (c *Client) userinfo(ctx context.Context, accessToken string) (Claims, error) {
	c.mu.RLock()
	meta := c.meta
	c.mu.RUnlock()
	if accessToken == "" {
		return Claims{}, fmt.Errorf("fetch userinfo: %w: missing access token", ErrInvalidToken)
	}
	if meta == nil || meta.UserinfoEndpoint == "" {
		return Claims{}, fmt.Errorf("fetch userinfo: %w: userinfo endpoint is not configured", ErrInvalidToken)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, meta.UserinfoEndpoint, http.NoBody)
	if err != nil {
		return Claims{}, fmt.Errorf("build userinfo request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return Claims{}, fmt.Errorf("fetch userinfo: %w", err)
	}
	defer func() { _ = resp.Body.Close() }() //nolint:errcheck // a close error cannot be reported after the body was consumed
	if resp.StatusCode != http.StatusOK {
		return Claims{}, fmt.Errorf("fetch userinfo: %w", fmt.Errorf("status %d", resp.StatusCode))
	}
	var body map[string]json.RawMessage
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxUserinfoBytes)).Decode(&body); err != nil {
		return Claims{}, fmt.Errorf("decode userinfo: %w", err)
	}
	profile, err := normalizeUserinfo(body, c.cfg.GroupsClaim)
	if err != nil {
		return Claims{}, err
	}
	if strings.EqualFold(issuerHost(c.cfg.IssuerURL), "github.com") && (profile.Email == "" || c.cfg.VerifyGitHubEmail) {
		email, emailErr := c.githubEmail(ctx, accessToken)
		if emailErr != nil {
			return Claims{}, emailErr
		}
		profile.Email = email
		profile.EmailVerified = email != ""
	}
	profile.Issuer = c.cfg.IssuerURL
	return profile, nil
}

// normalizeUserinfo accepts OIDC (`sub`, `preferred_username`) and GitHub
// (`id`, `name`, `login`) profile shapes.
func normalizeUserinfo(body map[string]json.RawMessage, groupsClaim string) (Claims, error) {
	str := func(key string) string {
		var value string
		if raw, ok := body[key]; ok && json.Unmarshal(raw, &value) == nil {
			return value
		}
		return ""
	}
	claims := Claims{
		Sub:     str("sub"),
		Email:   str("email"),
		Name:    str("name"),
		Picture: pictureURL(str("picture")),
		Issuer:  "",
	}
	if claims.Picture == "" {
		claims.Picture = pictureURL(str("avatar_url"))
	}
	if claims.Sub == "" {
		if raw, ok := body["id"]; ok {
			var id json.Number
			if err := json.Unmarshal(raw, &id); err == nil {
				claims.Sub = id.String()
			}
		}
	}
	if claims.Sub == "" {
		return Claims{}, fmt.Errorf("decode userinfo: %w", fmt.Errorf("%w: no subject", ErrInvalidToken))
	}
	if claims.Name == "" {
		claims.Name = str("preferred_username")
	}
	if claims.Name == "" {
		claims.Name = str("login")
	}
	groups, err := parseStringList(body[groupsClaim])
	if err != nil {
		return Claims{}, err
	}
	claims.Groups = groups
	return claims, nil
}

// githubEmail reads the primary verified email, which GitHub omits from /user
// when the profile hides it.
func (c *Client) githubEmail(ctx context.Context, accessToken string) (string, error) {
	target := "https://api.github.com/user/emails"
	if u, err := url.Parse(c.cfg.IssuerURL); err == nil && u.Hostname() != "github.com" {
		target = "https://" + issuerHost(c.cfg.IssuerURL) + "/api/v3/user/emails"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, http.NoBody)
	if err != nil {
		return "", fmt.Errorf("build email request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch email: %w", err)
	}
	defer func() { _ = resp.Body.Close() }() //nolint:errcheck // a close error cannot be reported after the body was consumed
	if resp.StatusCode != http.StatusOK {
		return "", nil
	}
	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxUserinfoBytes)).Decode(&emails); err != nil {
		return "", fmt.Errorf("decode email: %w", err)
	}
	for _, candidate := range emails {
		if candidate.Primary && candidate.Verified {
			return strings.ToLower(candidate.Email), nil
		}
	}
	return "", nil
}

func pictureURL(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil {
		return ""
	}
	return u.String()
}
