package httpassets

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"io/fs"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// AcceptsGzip reports whether the request accepts gzip encoding.
func AcceptsGzip(value string) bool {
	wildcard := false
	for _, item := range strings.Split(value, ",") {
		parts := strings.Split(item, ";")
		coding := strings.TrimSpace(parts[0])
		quality := 1.0
		for _, parameter := range parts[1:] {
			key, value, ok := strings.Cut(strings.TrimSpace(parameter), "=")
			if ok && strings.EqualFold(key, "q") {
				q, err := strconv.ParseFloat(value, 64)
				if err != nil || !(q >= 0 && q <= 1) {
					quality = 0
				} else {
					quality = q
				}
			}
		}
		if strings.EqualFold(coding, "gzip") {
			return quality > 0
		}
		if coding == "*" {
			wildcard = quality > 0
		}
	}
	return wildcard
}

// ServeFile serves embedded assets with negotiated precompressed responses.
func ServeFile(c *gin.Context, filesystem fs.FS, name string) {
	contentType := ""
	compressible := false
	switch path.Ext(name) {
	case ".js", ".mjs":
		contentType = "text/javascript; charset=utf-8"
		compressible = true
	case ".css":
		contentType = "text/css; charset=utf-8"
		compressible = true
	case ".svg":
		contentType = "image/svg+xml"
		compressible = true
	case ".json", ".map":
		contentType = "application/json"
		compressible = true
	case ".html":
		contentType = "text/html; charset=utf-8"
		compressible = true
	case ".txt", ".md":
		contentType = "text/plain; charset=utf-8"
		compressible = true
	case ".webp":
		contentType = "image/webp"
	case ".png":
		contentType = "image/png"
	case ".ico":
		contentType = "image/x-icon"
	case ".woff2":
		contentType = "font/woff2"
	}
	var (
		data       []byte
		err        error
		compressed bool
	)
	if compressible {
		c.Writer.Header().Add("Vary", "Accept-Encoding")
		if AcceptsGzip(c.GetHeader("Accept-Encoding")) && c.GetHeader("Range") == "" {
			if gzData, gzErr := fs.ReadFile(filesystem, name+".gz"); gzErr == nil {
				data = gzData
				compressed = true
			}
		}
	}
	if !compressed {
		data, err = fs.ReadFile(filesystem, name)
		if err != nil {
			c.Header("Cache-Control", "no-store")
			c.Status(http.StatusNotFound)
			return
		}
	}
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}
	c.Header("Content-Type", contentType)
	sum := sha256.Sum256(data)
	suffix := ""
	if compressed {
		c.Header("Content-Encoding", "gzip")
		suffix = "-gzip"
	}
	c.Header("ETag", `"`+hex.EncodeToString(sum[:8])+suffix+`"`)
	http.ServeContent(c.Writer, c.Request, name, time.Time{}, bytes.NewReader(data))
	c.Writer.WriteHeaderNow()
}
