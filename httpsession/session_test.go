package httpsession

import (
	"context"
	"errors"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestSessionHelpers(t *testing.T) {
	t.Parallel()
	tok, err := RandomToken(32)
	if err != nil || len(tok) < 40 {
		t.Fatalf("RandomToken(32) = %q, %v", tok, err)
	}
	if err := VerifyCSRF(tok, tok); err != nil {
		t.Fatalf("VerifyCSRF matching failed: %v", err)
	}
	if err := VerifyCSRF("", ""); !errors.Is(err, ErrCSRFMismatch) {
		t.Fatalf("VerifyCSRF empty = %v, want ErrCSRFMismatch", err)
	}
	if err := VerifyCSRF(tok, "wrong"); !errors.Is(err, ErrCSRFMismatch) {
		t.Fatalf("VerifyCSRF mismatch = %v, want ErrCSRFMismatch", err)
	}

	rec := httptest.NewRecorder()
	SetCookie(rec, "cc_session", tok, time.Now().Add(time.Hour), true)
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != "cc_session" || !cookies[0].HttpOnly || !cookies[0].Secure {
		t.Fatalf("SetCookie cookies = %+v", cookies)
	}

	recClear := httptest.NewRecorder()
	ClearCookie(recClear, "cc_session", false)
	cleared := recClear.Result().Cookies()
	if len(cleared) != 1 || cleared[0].MaxAge != -1 {
		t.Fatalf("ClearCookie cookies = %+v", cleared)
	}

	ctx, cancel := context.WithCancel(t.Context())
	var count atomic.Int32
	SweepExpired(ctx, 5*time.Millisecond, func(context.Context) {
		if count.Add(1) >= 2 {
			cancel()
		}
	})
	<-ctx.Done()
	if count.Load() < 2 {
		t.Fatalf("SweepExpired count = %d, want >= 2", count.Load())
	}
}
