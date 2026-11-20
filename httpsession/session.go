package httpsession

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"time"
)

// ErrCSRFMismatch is returned when a state-changing request fails CSRF validation.
var ErrCSRFMismatch = errors.New("csrf token mismatch")

// RandomToken returns a URL-safe base64 token derived from n cryptographic random bytes.
func RandomToken(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("read random bytes: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// VerifyCSRF compares expected and actual tokens in constant time.
func VerifyCSRF(expected, actual string) error {
	if expected == "" || subtle.ConstantTimeCompare([]byte(expected), []byte(actual)) != 1 {
		return ErrCSRFMismatch
	}
	return nil
}

// SetCookie writes an HTTP-only Lax session cookie to w.
func SetCookie(w http.ResponseWriter, name, value string, expires time.Time, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		Expires:  expires,
	})
}

// ClearCookie expires the named session cookie on w.
func ClearCookie(w http.ResponseWriter, name string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// SweepExpired periodically invokes sweep until ctx is canceled.
func SweepExpired(ctx context.Context, interval time.Duration, sweep func(ctx context.Context)) {
	if sweep == nil || interval <= 0 {
		return
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				sweep(ctx)
			}
		}
	}()
}
