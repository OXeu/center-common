package i18n

import (
	"testing"
	"testing/fstest"
)

func TestCatalogNegotiateAndFallback(t *testing.T) {
	t.Parallel()
	fsys := fstest.MapFS{
		"locales/en.json":    {Data: []byte(`{"language":"English","greeting":"Hello","onlyEn":"Fallback"}`)},
		"locales/zh-CN.json": {Data: []byte(`{"language":"简体中文","greeting":"你好"}`)},
	}
	catalog, err := Load(fsys, "locales")
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	enabled := []string{"zh-CN", "en"}
	langs := catalog.Languages(enabled)
	if len(langs) != 2 || langs[0].Tag != "en" || langs[1].Tag != "zh-CN" {
		t.Fatalf("Languages() = %+v", langs)
	}
	if got := catalog.Negotiate(enabled, "fr-FR, zh-Hans;q=0.9, en;q=0.8"); got != "zh-CN" {
		t.Fatalf("Negotiate() = %q, want zh-CN", got)
	}
	if got := catalog.Resolve([]string{"zh-CN"}, "fr"); got != "zh-CN" {
		t.Fatalf("Resolve() fallback to enabled = %q, want zh-CN", got)
	}
	tr := catalog.Translator("zh-CN")
	if tr.Lang() != "zh-CN" || tr.T("greeting") != "你好" || tr.T("onlyEn") != "Fallback" || tr.T("missing") != "missing" {
		t.Fatalf("Translator unexpected output: lang=%q greeting=%q onlyEn=%q", tr.Lang(), tr.T("greeting"), tr.T("onlyEn"))
	}
}
