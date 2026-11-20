package httpdocs

import (
	"html/template"
	"io/fs"
	"net/http"
	"slices"
	"strings"

	"github.com/OXeu/center-common/httpassets"
	"github.com/gin-gonic/gin"
)

// Config configures the embedded Markdown documentation routes.
type Config struct {
	SourceFS   fs.FS
	RenderedFS fs.FS
	Pages      []string
	Render     func(c *gin.Context, status int, data gin.H)
}

// Mount registers the `/docs` redirect and `/docs/*page` handler on r.
func Mount(r *gin.Engine, cfg Config) {
	r.GET("/docs", func(c *gin.Context) { c.Redirect(http.StatusMovedPermanently, "/docs/") })
	r.GET("/docs/*page", Handler(cfg))
}

// Handler serves either raw `.md` sources or build-time rendered HTML pages.
func Handler(cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		name := strings.TrimPrefix(c.Param("page"), "/")
		raw := strings.HasSuffix(name, ".md")
		name = strings.TrimSuffix(name, ".md")
		if name == "" {
			name = "index"
		}
		if !slices.Contains(cfg.Pages, name) {
			c.Status(http.StatusNotFound)
			return
		}
		source, err := fs.ReadFile(cfg.SourceFS, "docs/"+name+".md")
		if err != nil {
			c.Status(http.StatusInternalServerError)
			return
		}
		if raw {
			c.Data(http.StatusOK, "text/markdown; charset=utf-8", source)
			return
		}
		body, err := fs.ReadFile(cfg.RenderedFS, ".tmp/docs/"+name+".html")
		if err != nil {
			c.Status(http.StatusInternalServerError)
			return
		}
		cfg.Render(c, http.StatusOK, gin.H{
			"Page": "docs", "Title": "nav.docs", "DocPage": name,
			"DocumentHTML": template.HTML(body), //nolint:gosec // Only build-time rendered documentation is embedded; the Markdown renderer disables raw HTML.
		})
	}
}

// StylesHandler serves the pre-rendered Shiki stylesheet from renderedFS.
func StylesHandler(renderedFS fs.FS) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=3600")
		httpassets.ServeFile(c, renderedFS, ".tmp/docs/shiki.css")
	}
}
