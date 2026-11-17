# Center Common guide

Button sizes, variants, content modes and enforcement are documented in [Shared buttons](buttons.md).

Center Common supplies shared infrastructure for ConfigCenter, AuthCenter and CertCenter. Each consumer keeps its own Git history, data models, permissions, translations, routes, secrets and deployment lifecycle. Shared APIs receive explicit configuration.

| Directory          | Responsibility                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `oauth/`           | OAuth 2.0, OIDC, PKCE, discovery, token verification, user information and GitHub adaptation |
| `httpassets/`      | Embedded static resources, gzip negotiation and range requests                               |
| `ui/`              | CheckboxField, DropdownMenu, DropdownSelect, positioning and theme tokens                    |
| `tools/`           | Vite configuration, development proxy, assets, lint and toolchain checks                     |
| `config/`          | Go lint settings and consumer Make targets                                                   |
| `.github/actions/` | Shared setup, checks and build workflows                                                     |

## Client navigation and state

`ui/application.ts` creates a Vue application with isolated Vue Router and Pinia instances. Consumers pass their route records, initial page payload, loader, error reporter and document-title callback; the returned `pinia` and `usePageStore` provide application-scoped state.

`NavigationLink` uses client navigation for registered internal routes and keeps native links for server-owned routes marked `meta.document`. Keep login, OAuth, language changes and server-rendered documentation on document navigation, including links leaving a documentation page.

Navigation loads JSON from the existing authorized page URL using `X-Center-Navigation: 1`. Call `httpui.ServePageData` after authorization and payload encoding to return `{ title, data }`; ordinary requests still render the HTML shell, and the development proxy forwards the navigation header.

Keep the initial document's CSP nonce when adapting new page data, while accepting the fresh CSRF token and permissions from the server. The shared Pinia store is memory-only, holds the current page snapshot and pending state, and does not persist credentials or cache business data.

Pending navigation preserves the current view and shows a progress indicator. A later navigation cancels its predecessor; failed requests leave the current page intact, while redirects and non-success HTTP responses return control to the server through a document navigation.

Route commits remount the consumer page component, focus the application content and update the title through the supplied callback. Vue Router owns browser history and scroll restoration, while consumer components retain their existing lifecycle cleanup.

## Enforced navigation and state

`npm run lint` checks application dependencies, the mounted bootstrap, TypeScript bindings and Vue templates. The shared Vite configuration runs the same architecture checks during startup, production builds and hot updates.

- Declare Vue Router and Pinia directly, and create, await and mount the same `createPageApplication` instance.
- Use `NavigationLink`, `RouterLink` and Router actions. Raw anchors, native history, browser-location writes, meta refresh and native form submission are rejected; application forms use `@submit.prevent`.
- Put shared reactive state in Pinia. Module-level Vue reactivity, mutable state exports, reactive provide/inject substitutes and alternative state libraries are rejected; setup-local state, local form factories and explicitly readonly configuration remain valid.
- Keep browser persistence inside Pinia stores. The shared theme adapter retains its narrowly scoped preference-storage boundary.
- Authentication handoffs use `navigateDocument(url, reason)` and exact entries in each consumer's `tools/navigation-policy.json`. Each entry specifies a fixed target or a server-provided `.redirect`; wildcard paths, missing reasons and unused exceptions fail lint.

The checker resolves ordinary imported and local aliases using the TypeScript AST. These rules enforce the supported source patterns; they are not a security boundary against deliberately obfuscated JavaScript.

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
