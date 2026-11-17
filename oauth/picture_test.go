package oauth

import (
	"encoding/json"
	"testing"
)

func TestProfilePictures(t *testing.T) {
	for _, tc := range []struct{ name, input, want string }{
		{"oidc", `{"sub":"one","picture":"https://images.example.com/one.png"}`, "https://images.example.com/one.png"},
		{"github", `{"id":42,"avatar_url":"https://avatars.githubusercontent.com/u/42"}`, "https://avatars.githubusercontent.com/u/42"},
		{"missing", `{"sub":"one"}`, ""},
		{"script", `{"sub":"one","picture":"javascript:alert(1)"}`, ""},
		{"credentials", `{"sub":"one","picture":"https://secret@images.example.com/a"}`, ""},
		{"relative", `{"sub":"one","picture":"//images.example.com/a"}`, ""},
		{"http", `{"sub":"one","picture":"http://images.example.com/a"}`, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var raw map[string]json.RawMessage
			if err := json.Unmarshal([]byte(tc.input), &raw); err != nil {
				t.Fatal(err)
			}
			claims, err := normalizeUserinfo(raw, "groups")
			if err != nil {
				t.Fatal(err)
			}
			if claims.Picture != tc.want {
				t.Fatalf("picture = %q, want %q", claims.Picture, tc.want)
			}
		})
	}
}
