.PHONY: all build assets lint test check sdk-lint sdk-test run fmt scf-package
.DEFAULT_GOAL := all

BIN ?= .tmp/bin/$(PROJECT)
TMP_ROOT := $(CURDIR)/.tmp
export TMPDIR := $(TMP_ROOT)
COMMON := $(CURDIR)/.tmp/common
GO_LINT := golangci-lint run --config $(COMMON)/config/golangci.yml

all: check build

assets:
	node .tmp/common/tools/check-consumer.ts
	npm run --silent build

build: assets
	mkdir -p $(dir $(BIN))
	go build -o $(BIN) ./cmd/$(PROJECT)

fmt: assets
	golangci-lint fmt --config $(COMMON)/config/golangci.yml ./...
	npm run fmt

lint: assets
	$(GO_LINT) ./...
	npm run lint
	npm run typecheck
	npm test --silent

test: assets
	go test ./...

sdk-lint:
ifneq ($(SDK_DIR),)
	cd $(SDK_DIR) && golangci-lint run ./...
endif

sdk-test:
ifneq ($(SDK_DIR),)
	cd $(SDK_DIR) && go test ./...
endif

check: lint test sdk-lint sdk-test

run: build
	exec ./$(BIN)

scf-package: assets
	mkdir -p $(TMP_ROOT)/scf
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o $(TMP_ROOT)/scf/$(PROJECT) ./cmd/$(PROJECT)
	cp scf_bootstrap $(TMP_ROOT)/scf/scf_bootstrap
	chmod 755 $(TMP_ROOT)/scf/scf_bootstrap
