package slug

import (
	"errors"
	"strings"
	"testing"
)

func TestValidate(t *testing.T) {
	t.Parallel()
	for _, valid := range []string{"a", "prod-1", "0-test", strings.Repeat("a", 63)} {
		if err := Validate(valid); err != nil {
			t.Fatalf("Validate(%q) = %v, want nil", valid, err)
		}
	}
	for _, invalid := range []string{"", "-abc", "Abc", "a_b", strings.Repeat("a", 64)} {
		if err := Validate(invalid); !errors.Is(err, ErrInvalid) {
			t.Fatalf("Validate(%q) = %v, want ErrInvalid", invalid, err)
		}
	}
}

func TestValidateKey(t *testing.T) {
	t.Parallel()
	for _, valid := range []string{"APP_PORT", "db.host:5432/main-1", strings.Repeat("k", 191)} {
		if err := ValidateKey(valid); err != nil {
			t.Fatalf("ValidateKey(%q) = %v, want nil", valid, err)
		}
	}
	for _, invalid := range []string{"", ".hidden", "-dash", "bad space", strings.Repeat("k", 192)} {
		if err := ValidateKey(invalid); !errors.Is(err, ErrInvalidKey) {
			t.Fatalf("ValidateKey(%q) = %v, want ErrInvalidKey", invalid, err)
		}
	}
}
