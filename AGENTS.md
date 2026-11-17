# AGENTS.md

This repository contains shared infrastructure for configcenter, authcenter and certcenter.

- Keep application models, permissions, routes, translations and secrets in consumers. Shared APIs take explicit configuration.
- Never copy shared implementations back into consumers. Test changes against all three projects with local linking, then advance their common.lock.json revisions deliberately.
- Put every build, test and scratch artifact under the repository root `.tmp/`; never use `/tmp`. Set TMPDIR before Go commands. Keep node_modules and build caches ignored.
- Use Vue 3 script setup, native dialog focus behavior, shared dropdowns and checkbox components. Preserve keyboard behavior and CSP handling.
- Use `.ts` for JavaScript/TypeScript scripts and `lang="ts"` for every Vue script block. Repository lint rejects other script extensions, including `.mjs`.
- `no-restricted-files` permits documentation only in `docs/`, `.github/`, and the root `README.md`, `README_zh.md`, `AGENTS.md` and `LICENSE`. Keep temporary explanations, plans and reports under ignored `.tmp/`; do not add them to the root or source directories.
- `readme-layout` requires English `README.md` and Chinese `README_zh.md`, with centered logo/h3/one-sentence introduction, language links, documentation navigation, badges, Preview/Gallery, optional Features/Why, Install/Quick Start, Star History graph and LICENSE, in that order. Keep real deployment commands and valid local links; link the Apache-2.0 `LICENSE` file in both READMEs.
- Handle and wrap Go errors, pass context explicitly, never read application environment variables here. Comments only document exports or external constraints.
- Run `make check`. Commit functional changes separately using English Conventional Commits; descriptions must be imperative and at most 72 characters.
