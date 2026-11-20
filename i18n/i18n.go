package i18n

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"sort"
	"strconv"
	"strings"
)

// Default is used when the request carries no supported language.
const Default = "en"

// Catalog is an immutable set of message tables, one per language.
type Catalog struct {
	messages map[string]map[string]string
	tags     []string
}

// Language describes one available language for the switcher.
type Language struct {
	Tag   string
	Label string
}

// Load reads every JSON locale file in dir from localeFS named after its language tag.
func Load(localeFS fs.FS, dir string) (*Catalog, error) {
	if dir == "" {
		dir = "locales"
	}
	entries, err := fs.ReadDir(localeFS, dir)
	if err != nil {
		return nil, fmt.Errorf("read locales: %w", err)
	}
	c := &Catalog{messages: make(map[string]map[string]string, len(entries))}
	for _, entry := range entries {
		name, found := strings.CutSuffix(entry.Name(), ".json")
		if !found {
			continue
		}
		c.tags = append(c.tags, name)
	}
	for _, tag := range c.tags {
		raw, err := fs.ReadFile(localeFS, dir+"/"+tag+".json")
		if err != nil {
			return nil, fmt.Errorf("read locale %q: %w", tag, err)
		}
		var table map[string]string
		if err := json.Unmarshal(raw, &table); err != nil {
			return nil, fmt.Errorf("decode locale %q: %w", tag, err)
		}
		c.messages[tag] = table
	}
	sort.Strings(c.tags)
	if _, ok := c.messages[Default]; !ok {
		return nil, fmt.Errorf("default locale %q: %w", Default, fs.ErrNotExist)
	}
	return c, nil
}

// Languages lists the enabled languages, default first.
func (c *Catalog) Languages(enabled []string) []Language {
	out := make([]Language, 0, len(c.tags))
	for _, tag := range c.tags {
		if !contains(enabled, tag) {
			continue
		}
		out = append(out, Language{Tag: tag, Label: c.messages[tag]["language"]})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Tag == Default && out[j].Tag != Default })
	return out
}

// Supported reports whether tag is an enabled language.
func (c *Catalog) Supported(tag string, enabled []string) bool {
	if _, ok := c.messages[tag]; !ok {
		return false
	}
	return contains(enabled, tag)
}

// Resolve picks the first acceptable language from enabled and the given
// preferences. It is used by the Accept-Language negotiation and the switcher.
func (c *Catalog) Resolve(enabled []string, preferred ...string) string {
	for _, p := range preferred {
		tag := exactOrBase(p, c, enabled)
		if tag != "" {
			return tag
		}
	}
	for _, tag := range enabled {
		if c.Supported(tag, enabled) {
			return tag
		}
	}
	return Default
}

// Messages returns the table for tag, filled in from the default language for
// keys the translation lacks.
func (c *Catalog) Messages(tag string) map[string]string {
	out := make(map[string]string, len(c.messages[Default]))
	for k, v := range c.messages[Default] {
		out[k] = v
	}
	if tag == Default {
		return out
	}
	for k, v := range c.messages[tag] {
		out[k] = v
	}
	return out
}

// Negotiate resolves the Accept-Language header (highest q-value first).
func (c *Catalog) Negotiate(enabled []string, header string) string {
	prefs := ParseAcceptLanguage(header)
	return c.Resolve(enabled, prefs...)
}

// ParseAcceptLanguage returns the language tags of the header, best first.
func ParseAcceptLanguage(header string) []string {
	type weighted struct {
		tag   string
		q     float64
		order int
	}
	var list []weighted
	for i, part := range strings.Split(header, ",") {
		tag, params, _ := strings.Cut(strings.TrimSpace(part), ";")
		if tag == "" || tag == "*" {
			continue
		}
		q := 1.0
		if _, value, ok := strings.Cut(params, "q="); ok {
			parsed, parseErr := strconv.ParseFloat(strings.TrimSpace(value), 64)
			if parseErr == nil {
				q = parsed
			}
		}
		list = append(list, weighted{tag: tag, q: q, order: i})
	}
	sort.SliceStable(list, func(i, j int) bool {
		if list[i].q != list[j].q {
			return list[i].q > list[j].q
		}
		return list[i].order < list[j].order
	})
	tags := make([]string, 0, len(list))
	for _, item := range list {
		tags = append(tags, item.tag)
	}
	return tags
}

func exactOrBase(tag string, c *Catalog, enabled []string) string {
	if c.Supported(tag, enabled) {
		return tag
	}
	base, _, _ := strings.Cut(tag, "-")
	for _, candidate := range enabled {
		if c.Supported(candidate, enabled) {
			candidateBase, _, _ := strings.Cut(candidate, "-")
			if strings.EqualFold(candidateBase, base) {
				return candidate
			}
		}
	}
	return ""
}

func contains(list []string, want string) bool {
	for _, item := range list {
		if item == want {
			return true
		}
	}
	return false
}

// Translator renders messages for one request.
type Translator struct {
	lang     string
	messages map[string]string
}

// Translator returns the translator for tag.
func (c *Catalog) Translator(tag string) *Translator {
	if tag == "" {
		tag = Default
	}
	return &Translator{lang: tag, messages: c.Messages(tag)}
}

// T returns the message for id, or the id itself when it is missing.
func (t *Translator) T(id string) string {
	if msg, ok := t.messages[id]; ok {
		return msg
	}
	return id
}

// Lang is the language tag this translator renders.
func (t *Translator) Lang() string {
	return t.lang
}
