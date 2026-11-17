# Center Common guide

Center Common supplies shared infrastructure for ConfigCenter, AuthCenter and CertCenter. Each consumer keeps its own Git history, data models, permissions, translations, routes, secrets and deployment lifecycle. Shared APIs receive explicit configuration.

| Directory          | Responsibility                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `oauth/`           | OAuth 2.0, OIDC, PKCE, discovery, token verification, user information and GitHub adaptation |
| `httpassets/`      | Embedded static resources, gzip negotiation and range requests                               |
| `ui/`              | CheckboxField, DropdownMenu, DropdownSelect, positioning and theme tokens                    |
| `tools/`           | Vite configuration, development proxy, assets, lint and toolchain checks                     |
| `config/`          | Go lint settings and consumer Make targets                                                   |
| `.github/actions/` | Shared setup, checks and build workflows                                                     |

## Local integration

Keep the four repositories beside each other. In a consumer, run:

```sh
make common-local COMMON_DIR=../center-common
make bootstrap
make check build
```

`.tmp/common-local` records the local selection and `.tmp/common` points to the common checkout. npm's `file:.tmp/common` dependency and Go's `replace => ./.tmp/common` use that same source, including uncommitted edits. Vue can hot-reload shared components; Go changes require rebuilding. Run `make bootstrap` after dependency changes, and restart the development server after build-configuration changes.

Common installs its own dependencies from its own package lock. `check-consumer.ts` checks declared toolchain versions and shared Vue/Vite resolutions. Do not copy implementations into consumers; `tools/common.ts`, the pre-bootstrap loader synchronized with `tools/bootstrap.ts`, is the documented bootstrap exception.

## Pinned builds and deployment

Each consumer commits `common.lock.json` with a repository URL and a full 40-character commit SHA. For an independent checkout:

```sh
CI=true make bootstrap
CI=true make check build
```

The loader fetches the exact revision into `.tmp/common-cache/<SHA>` and selects it through `.tmp/common`. A modified cache, missing revision or failed fetch stops the build. CI ignores local overrides and rejects `--local`. `node tools/common.ts --locked` selects the pinned checkout for that operation without removing the local preference; apply `CI=true` to the entire command for a pinned build. `make scf-package` also selects the locked source.

The shared setup/check actions come from the same pinned revision. Database services, production settings and deployment steps remain in consumers. The Go binary embeds frontend assets; deployed processes do not fetch common at runtime.

Private repository access can use existing local Git credentials, a dedicated read-only `COMMON_REPO_SSH_KEY` deploy key, or a repository-scoped `COMMON_REPO_TOKEN`. The bootstrap pins GitHub's Ed25519 host key, writes SSH credentials under `.tmp/` with mode 0600 and removes them after Git finishes. Tokens are passed only to Git subprocesses. Pull requests remain subject to GitHub's secret-availability rules.

## Upgrades and rollback

1. Implement shared behavior here and keep application adapters in consumers.
2. Run common's `make check` and all three consumers' `make check build` with local linking.
3. Commit and publish common, then deliberately advance each consumer's lockfile to that commit.
4. Synchronize affected manifests and package locks when dependencies change.
5. Validate pinned builds and commit the consumer adaptation together with its lockfile.

Rollback restores the previous lockfile and the matching adaptation. Consumers may stay on an older revision until ready to migrate.

## Repository conventions

`npm run lint` runs `tools/lint-files.ts` before Oxlint. It checks tracked files and unignored new files, including hidden directories. JavaScript/TypeScript source must use `.ts`; every Vue script block must declare `lang="ts"`. Dependencies and build output remain ignored.

`no-restricted-files` permits documentation in top-level `docs/`, `.github/`, and the root `README.md`, `README_zh.md`, `AGENTS.md` and `LICENSE`. Temporary reports and explanations belong in the conversation or ignored `.tmp/`. Both README files must satisfy the [README format contract](readme-format.md).

All build and scratch output belongs in `.tmp/`. Set `TMPDIR` before direct Go commands; Make does this automatically. Retain `.tmp/common*`, `.tmp/ui`, `.tmp/docs` and binaries for subsequent builds, and clean temporary test fixtures.
