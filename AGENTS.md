# AGENTS.md

## Project Basics

- This repository uses `develop` as the default branch.
- The main application lives under `web-app/`.
- Use pnpm for Node.js package management.
- Before editing code or tests, read `docs/coding-conventions.md`.
- Before submitting changes, run the relevant checks from `web-app/`.

## Commands

```sh
cd web-app
pnpm install
pnpm test
pnpm run check:ci
pnpm run typecheck
pnpm run build
```

## Pull Request Rules

- Write pull request titles and descriptions in Japanese.
- Do not add tool or agent prefixes such as `[codex]` to pull request titles.

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
