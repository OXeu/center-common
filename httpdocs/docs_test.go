package httpdocs

import (
	"html/template"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/gin-gonic/gin"
)

func TestDocsRoutes(t *testing.T) {
	t.Parallel()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	sourceFS := fstest.MapFS{
		"docs/index.md": {Data: []byte("# Overview\n")},
		"docs/api.md":   {Data: []byte("# API\n")},
	}
	renderedFS := fstest.MapFS{
		".tmp/docs/index.html": {Data: []byte("<h1>Overview</h1>")},
		".tmp/docs/api.html":   {Data: []byte("<h1>API</h1>")},
		".tmp/docs/shiki.css":  {Data: []byte(".shiki{}")},
	}
	var rendered gin.H
	Mount(r, Config{
		SourceFS:   sourceFS,
		RenderedFS: renderedFS,
		Pages:      []string{"index", "api"},
		Render: func(c *gin.Context, status int, data gin.H) {
			rendered = data
			c.String(status, string(data["DocumentHTML"].(template.HTML)))
		},
	})
	r.GET("/static/docs/shiki.css", StylesHandler(renderedFS))

	recRedirect := httptest.NewRecorder()
	r.ServeHTTP(recRedirect, httptest.NewRequest(http.MethodGet, "/docs", http.NoBody))
	if recRedirect.Code != http.StatusMovedPermanently || recRedirect.Header().Get("Location") != "/docs/" {
		t.Fatalf("redirect = %d %q", recRedirect.Code, recRedirect.Header().Get("Location"))
	}

	recHTML := httptest.NewRecorder()
	r.ServeHTTP(recHTML, httptest.NewRequest(http.MethodGet, "/docs/", http.NoBody))
	if recHTML.Code != http.StatusOK || recHTML.Body.String() != "<h1>Overview</h1>" || rendered["DocPage"] != "index" {
		t.Fatalf("html response = %d %q (%v)", recHTML.Code, recHTML.Body.String(), rendered)
	}

	recRaw := httptest.NewRecorder()
	r.ServeHTTP(recRaw, httptest.NewRequest(http.MethodGet, "/docs/api.md", http.NoBody))
	if recRaw.Code != http.StatusOK || recRaw.Body.String() != "# API\n" {
		t.Fatalf("raw response = %d %q", recRaw.Code, recRaw.Body.String())
	}

	rec404 := httptest.NewRecorder()
	r.ServeHTTP(rec404, httptest.NewRequest(http.MethodGet, "/docs/unknown", http.NoBody))
	if rec404.Code != http.StatusNotFound {
		t.Fatalf("unknown page status = %d, want 404", rec404.Code)
	}
}
