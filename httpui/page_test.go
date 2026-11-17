package httpui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestServePageData(t *testing.T) {
	for _, marker := range []string{"", "0", "1"} {
		t.Run("marker="+marker, func(t *testing.T) {
			response := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(response)
			c.Request = httptest.NewRequest(http.MethodGet, "/projects", http.NoBody)
			c.Request.Header.Set("X-Center-Navigation", marker)
			served := ServePageData(c, http.StatusOK, "Projects", json.RawMessage(`{"page":"projects","csrf":"token"}`))
			if served != (marker == "1") {
				t.Fatalf("served = %v", served)
			}
			if response.Header().Get("Cache-Control") != "no-store" || !strings.Contains(response.Header().Get("Vary"), "X-Center-Navigation") {
				t.Fatalf("unsafe cache headers: %v", response.Header())
			}
			if !served {
				if response.Body.Len() != 0 {
					t.Fatal("document response was written")
				}
				return
			}
			var payload struct {
				Title string `json:"title"`
				Data  struct {
					Page string `json:"page"`
					CSRF string `json:"csrf"`
				} `json:"data"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode page response: %v", err)
			}
			if payload.Title != "Projects" || payload.Data.Page != "projects" || payload.Data.CSRF != "token" {
				t.Fatalf("unexpected payload: %+v", payload)
			}
		})
	}
}
