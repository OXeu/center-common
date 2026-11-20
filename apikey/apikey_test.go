package apikey

import (
	"errors"
	"strings"
	"testing"
)

func TestCodecLifecycle(t *testing.T) {
	t.Parallel()
	codec := New("cc_")
	token, digest, err := codec.Generate()
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if !strings.HasPrefix(token, "cc_") {
		t.Fatalf("token = %q, want prefix cc_", token)
	}
	if Hash(token) != digest {
		t.Fatal("Hash(token) did not match returned digest")
	}
	display := codec.Display(token)
	if !strings.HasPrefix(display, "cc_") || !strings.HasSuffix(display, "…") {
		t.Fatalf("Display(%q) = %q", token, display)
	}
	if got := codec.Display("cc_123"); got != "cc_123" {
		t.Fatalf("short Display = %q, want cc_123", got)
	}
	parsed, err := codec.ParseHeader("bearer " + token)
	if err != nil || parsed != token {
		t.Fatalf("ParseHeader() = %q, %v", parsed, err)
	}
	for _, invalid := range []string{"", "Basic abc", "Bearer ", "Bearer cc_", "Bearer ac_other", "Bearer cc_a b"} {
		if _, err := codec.ParseHeader(invalid); !errors.Is(err, ErrMalformed) {
			t.Fatalf("ParseHeader(%q) error = %v, want ErrMalformed", invalid, err)
		}
	}
}
