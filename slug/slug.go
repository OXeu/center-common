package slug

import (
	"errors"
	"regexp"
)

var (
	// ErrInvalid is returned for slugs outside [a-z0-9][a-z0-9-]{0,62}.
	ErrInvalid = errors.New("slug must be 1-63 lowercase letters, digits or dashes, starting with a letter or digit")

	// ErrInvalidKey is returned for configuration keys that are not portable.
	ErrInvalidKey = errors.New("key must be 1-191 chars of letters, digits or . _ : / - and start with a letter or digit")

	pattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,62}$`)
	key     = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:/-]{0,190}$`)
)

// Validate checks a project, domain or environment slug.
func Validate(s string) error {
	if !pattern.MatchString(s) {
		return ErrInvalid
	}
	return nil
}

// ValidateKey checks a portable configuration key.
func ValidateKey(s string) error {
	if !key.MatchString(s) {
		return ErrInvalidKey
	}
	return nil
}
