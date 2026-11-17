// Package httpui provides the transport for consumer-owned page data.
package httpui

import (
	"encoding/json"

	"github.com/gin-gonic/gin"
)

// ServePageData handles navigation requests after the consumer has authorized and encoded its page.
func ServePageData(c *gin.Context, status int, title string, data json.RawMessage) bool {
	c.Writer.Header().Add("Vary", "X-Center-Navigation")
	c.Header("Cache-Control", "no-store")
	if c.GetHeader("X-Center-Navigation") != "1" {
		return false
	}
	c.JSON(status, gin.H{"title": title, "data": data})
	return true
}
