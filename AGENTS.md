# AGENTS.md

This repository contains shared infrastructure for configcenter, authcenter and certcenter.

- Keep application models, permissions, routes, translations and secrets in consumers. Shared APIs take explicit configuration.
- Never copy shared implementations back into consumers. Test changes against all three projects with local linking, then advance their common.lock.json revisions deliberately.
- Put every build, test and scratch artifact under the repository root `.tmp/`; never use `/tmp`. Set TMPDIR before Go commands. Keep node_modules and build caches ignored.
- Use Vue 3 script setup, native dialog focus behavior, shared dropdowns and checkbox components. Preserve keyboard behavior and CSP handling.
- Handle and wrap Go errors, pass context explicitly, never read application environment variables here. Comments only document exports or external constraints.
- Run `make check`. Commit functional changes separately using English Conventional Commits; descriptions must be imperative and at most 72 characters.
