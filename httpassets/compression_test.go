package httpassets

import "testing"

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
