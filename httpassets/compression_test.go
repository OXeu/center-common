package httpassets

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/gin-gonic/gin"
)

func TestAcceptsGzip(t *testing.T) {
	for _, test := range []struct {
		header string
		want   bool
	}{
		{"", false},
		{"br, gzip", true},
		{"gzip;q=0", false},
		{"*;q=1, gzip;q=0", false},
		{"gzip;q=0.5", true},
		{"gzip;q=invalid", false},
		{"gzip;q=NaN", false},
		{"*;q=0.8", true},
		{"br", false},
	} {
		if got := AcceptsGzip(test.header); got != test.want {
			t.Errorf("AcceptsGzip(%q) = %v", test.header, got)
		}
	}
}

func TestServeFileFallbackAndETag(t *testing.T) {
	gin.SetMode(gin.TestMode)
	assets := fstest.MapFS{
		"app.js":        {Data: []byte("console.log(1)")},
		"bundle.css":    {Data: []byte("body{}")},
		"bundle.css.gz": {Data: []byte("gz-body")},
		"icon.webp":     {Data: []byte("RIFFxxxxWEBP")},
	}

	// Falls back to uncompressed asset when .gz is absent even with Accept-Encoding: gzip.
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodGet, "/app.js", http.NoBody)
	c.Request.Header.Set("Accept-Encoding", "gzip")
	ServeFile(c, assets, "app.js")
	if rec.Code != http.StatusOK || rec.Body.String() != "console.log(1)" || rec.Header().Get("Content-Encoding") != "" {
		t.Fatalf("unexpected fallback response: status=%d encoding=%q body=%q", rec.Code, rec.Header().Get("Content-Encoding"), rec.Body.String())
	}
	etag := rec.Header().Get("ETag")
	if etag == "" {
		t.Fatal("expected ETag header")
	}

	// Conditional request with matching ETag returns 304.
	rec304 := httptest.NewRecorder()
	c304, _ := gin.CreateTestContext(rec304)
	c304.Request = httptest.NewRequest(http.MethodGet, "/app.js", http.NoBody)
	c304.Request.Header.Set("If-None-Match", etag)
	ServeFile(c304, assets, "app.js")
	if rec304.Code != http.StatusNotModified {
		t.Fatalf("status = %d, want 304", rec304.Code)
	}

	// Serves precompressed .gz when present.
	recGz := httptest.NewRecorder()
	cGz, _ := gin.CreateTestContext(recGz)
	cGz.Request = httptest.NewRequest(http.MethodGet, "/bundle.css", http.NoBody)
	cGz.Request.Header.Set("Accept-Encoding", "gzip")
	ServeFile(cGz, assets, "bundle.css")
	if recGz.Code != http.StatusOK || recGz.Header().Get("Content-Encoding") != "gzip" || recGz.Body.String() != "gz-body" {
		t.Fatalf("unexpected gzip response: status=%d encoding=%q body=%q", recGz.Code, recGz.Header().Get("Content-Encoding"), recGz.Body.String())
	}

	// Explicit WebP content type.
	recWebp := httptest.NewRecorder()
	cWebp, _ := gin.CreateTestContext(recWebp)
	cWebp.Request = httptest.NewRequest(http.MethodGet, "/icon.webp", http.NoBody)
	ServeFile(cWebp, assets, "icon.webp")
	if recWebp.Header().Get("Content-Type") != "image/webp" {
		t.Fatalf("content-type = %q, want image/webp", recWebp.Header().Get("Content-Type"))
	}
}
