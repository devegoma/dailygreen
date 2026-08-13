# AGENTS.md

## Project Basics

- This repository uses `develop` as the development base branch.
- The main application lives under `web-app/`.
- Use pnpm for Node.js package management and the Node version declared by `web-app/.node-version` / `web-app/package.json`.
- Before editing code or tests, read `docs/coding-conventions.md` and the task-relevant specification documents.

## Start Every Task

1. Start from the latest `develop`. Create a fresh branch for each pull request; do not reuse a branch from a merged or closed PR.
2. Inspect the existing implementation, tests, and relevant docs before choosing an implementation approach.
3. Before substantial implementation, establish a task contract in your working notes:
   - **Goal**: observable outcome to achieve.
   - **Invariants**: behavior, API, data, security, or UX contracts that must remain true.
   - **Non-goals**: nearby work intentionally excluded.
   - **Acceptance criteria**: externally observable completion conditions.
   - **Verification**: deterministic tests/checks proving those conditions.
4. Resolve ambiguity from current specs and code first. Ask for user judgment only when materially different product semantics remain possible.

## Validation

Run the relevant commands from `web-app/`.

For ordinary application changes, the minimum local gate is:

```sh
cd web-app
pnpm test
pnpm run check:ci
pnpm run typecheck
pnpm run build
```

For database schema, migration, transaction, or persistence-contract changes, also run the applicable database gates:

```sh
cd web-app
pnpm run db:check
pnpm run db:generate
pnpm run db:migrate
pnpm run test:integration
```

After `db:generate`, verify that generated migration/schema output contains only the intended change. If a local PostgreSQL test database is unavailable, state that explicitly and treat the GitHub Actions `migration-test` job as a required completion gate rather than substituting self-review.

For production-runtime or Docker changes, verify the production image in addition to the application build when practical:

```sh
cd web-app
docker build --target runner --tag dailygreen:ci .
```

Do not add redundant checks when an existing CI gate already deterministically enforces the same invariant.

## Quality Ownership

When implementation or review reveals a repeatable failure mode, fix both the instance and the cheapest reliable prevention layer:

1. behavioral regression/integration test for observable contracts;
2. database/schema constraint or migration check for data invariants;
3. formatter/linter/type/static check for mechanical rules;
4. `AGENTS.md` for agent decisions that cannot be encoded reliably elsewhere;
5. architecture boundary when the invalid state should be impossible by construction.

Prefer machine rejection over asking a future agent to remember a review comment. Tests should verify behavior and externally observable contracts, not implementation trivia.

## Pull Request Rules

- Write pull request titles and descriptions in Japanese.
- Do not add tool or agent prefixes such as `[codex]` to pull request titles.
- Keep one coherent concern per PR; split unrelated refactors or policy changes.
- In the PR body, state the goal, important invariants/non-goals, and the verification actually performed. Do not claim a local check ran when it only ran in CI.

## TanStack Guidance

This project uses TanStack Start, TanStack Router, and TanStack Query.

Before editing files for a substantial TanStack-related task:

1. Run the following from `web-app/` to see available local TanStack skills:

```sh
npx @tanstack/intent@latest list
```

2. If a listed skill matches the task, load it before changing files:

```sh
npx @tanstack/intent@latest load <package>#<skill>
```

3. Prefer the installed package's local skill over model memory or examples from unrelated frameworks.

Typical areas where TanStack skills should be checked:

- TanStack Start server functions, server routes, middleware, deployment, and request handling
- TanStack Router file-based routing, route tree generation, params, search params, loaders, navigation, auth guards, and error/not-found handling

TanStack Query does not currently ship a package-local Intent skill. For Query-related changes, consult the official documentation and the installed package version instead of relying on model memory.

Do not blindly apply Next.js, React Router, Remix, or older React Query patterns unless they are explicitly compatible with the installed TanStack packages.
