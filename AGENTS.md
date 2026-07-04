# AGENTS.md

## Project Basics

- This repository uses `develop` as the default branch.
- The main application lives under `web-app/`.
- Use pnpm for Node.js package management.
- Before submitting changes, run the relevant checks from `web-app/`.

## Commands

```sh
cd web-app
pnpm install
pnpm run check:ci
pnpm run typecheck
```

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
- TanStack Query usage, query keys, caching, invalidation, mutations, and Router integration

Do not blindly apply Next.js, React Router, Remix, or older React Query patterns unless they are explicitly compatible with the installed TanStack packages.
