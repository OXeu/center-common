.PHONY: check fmt
export TMPDIR := $(CURDIR)/.tmp

check:
	mkdir -p .tmp
	golangci-lint run --config config/golangci.yml ./...
	go test ./...
	npm run lint
	npm run typecheck
	npm test -- --run
	node --test web/ui/__tests__/bootstrap.test.mjs

fmt:
	mkdir -p .tmp
	golangci-lint fmt --config config/golangci.yml ./...
	npm run fmt
