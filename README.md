# Samebase app

A small, complete app base: guest sign-in, real-time data, sharing, and deploys, without services
that a new app might not need.

The Convex deployment runs the backend and also serves the app's files through
[convex-hosting](https://github.com/samebase/convex-hosting). [Alchemy](https://alchemy.run) with
[@samebase/alchemy-convex](https://github.com/samebase/alchemy-convex) deploys it: `main` to the
production deployment, each pull request to a preview. This repository deploys itself the same way:
https://ideal-dolphin-15.convex.site is its `main`. The same app without Alchemy is
[samebase/base-hosting](https://github.com/samebase/base-hosting), and on Cloudflare Workers
[samebase/base](https://github.com/samebase/base).

## Stack

- React 19 and TanStack Start, with pages rendered on the server
- Convex for the real-time backend and database, and Convex Auth 2.0.0-beta.0 for guest sign-in
  with the session in an httpOnly cookie, so the server renders signed-in pages
- convex-hosting for delivery from the Convex deployment, with Cloudflare's rules for the files
- shadcn/ui primitives for the user interface
- Vite+ for development, formatting, linting, tests, and builds
- Node.js 24 for application and automation code

Convex Auth is pinned to 2.0.0-beta.0 exactly because the adapter reaches its cookie-session
provider through a file that beta.0 does not export; see the
[adapter changelog](https://github.com/samebase/convex-hosting/blob/main/packages/convex-hosting-tanstack-start/CHANGELOG.md).

The example app is a public todo list. Guests can sign in without an external identity provider,
create todos, see real-time updates, and scan a QR code to open the same list on another device.

## Start

1. Select **Use this template** and create your repository.
2. Clone it, then install Vite+ and the dependencies as described in
   [Local development](#local-development).
3. Run `pnpm run dev`. Convex asks you to sign in and creates a project with its development
   deployment. On a fresh clone, the first push fails until the first deploy; see
   [First run](#first-run).
4. Set `team` in `alchemy.run.ts` to the slug of your Convex team (the first segment of the
   project URL in the Convex dashboard), and add one repository secret with the
   [GitHub CLI](https://cli.github.com/): `CONVEX_ACCESS_TOKEN`, a team access token. Generate it
   in the Convex dashboard (the team, **Settings**, **Access Tokens**), copy it, and run
   `gh secret set CONVEX_ACCESS_TOKEN`, which asks for the pasted value without showing it. The
   token creates the Convex project of the repository, the state project `alchemy-state` of the
   team, and the short-lived deploy keys of each run. No deploy key is stored anywhere.
5. Push to `main`, or run `alchemy.yml` from the **Actions** tab. The first run creates the
   project, named after the repository, with its production deployment, pushes to it, and keeps the
   state of the stage `main` in `alchemy-state`. Each push to `main` deploys from then on, and each
   pull request deploys a preview. The run's log ends with the site URL,
   `https://<deployment>.convex.site`. When the team has a project with the name of the repository
   already, such as one that `pnpm run dev` created, the first run stops: run `alchemy.yml` once
   with **adopt** (`gh workflow run alchemy.yml -f adopt=true`) to take it over.

## Local development

Install the [Vite+](https://viteplus.dev/guide/) global CLI; it selects the Node.js version from
`.node-version` on its own, and `vp env install` installs it. Run `corepack enable` once to make the
pinned pnpm version available.

```sh
corepack enable
pnpm install
pnpm run dev
```

The development command starts Convex and TanStack Start together. In a linked Git worktree, the
same command automatically uses an isolated local backend. Convex writes `VITE_CONVEX_URL` to
`.env.local`; do not set it manually.

To force the isolated backend outside a linked worktree, use:

```sh
pnpm run dev:worktree
```

### First run

On a fresh clone, the first push of `pnpm run dev` fails: `convex/convex.config.ts` requires the
Convex Auth keys `AUTH_PRIVATE_KEY` and `AUTH_JWKS`, and `convex/http.ts` imports
`.convex-hosting/version.js` and the server build `dist/server/server.js`. Only a deploy creates
them. Keep `pnpm run dev` running and run this in a second terminal:

```sh
pnpm run deploy:dev
```

It builds the app, creates the Convex Auth keys, uploads the files to the development deployment,
writes the version file, and pushes. Then stop `pnpm run dev` and start it again; it works as usual
from then on.

The core workflow runs on macOS, Linux, and Windows. See
[`docs/local-setup.md`](./docs/local-setup.md) for the local Convex setup and troubleshooting steps.

## Checks, builds, and deploys

| Command               | Purpose                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `pnpm run check`      | Format, lint, type-check, and test                                |
| `pnpm run build`      | Run the checks and build the app into `dist/client`               |
| `pnpm run deploy:dev` | Build, upload, and push to the development deployment             |
| `pnpm run deploy`     | Build, upload, and push to production, or to the key's deployment |

The build prerenders `/about` with the Convex client, so it needs `VITE_CONVEX_URL` in `.env.local`,
which the first `pnpm run dev` writes; CI passes a placeholder.

## Deployment contract

`alchemy.run.ts` is the stack. The stage `main` is the production deployment; any other stage is a
preview deployment named after the pull request branch, which `alchemy destroy` deletes. The push
is the `deploy` package script, run by the Convex deployment resource when the functions, the
build inputs, `package.json`, or the lockfile change; an unchanged checkout deploys nothing.
`.github/workflows/alchemy.yml` deploys each push to `main`, deploys each pull request from this
repository to a stage made from its branch, and destroys that stage when the pull request closes,
all with the team token `CONVEX_ACCESS_TOKEN`. The stack is named after the repository,
`owner/name` (`GITHUB_REPOSITORY`, or the origin remote on a laptop), and so is its Convex
project. Every run, in CI or local, keeps the state of its stage in the `alchemy-state` project of
the team, which the first run creates, under the stack name; the stage `main` owns the project,
and `alchemy destroy --stage main` deletes it. The state has no lock, so the workflow runs one
deploy of a stage at a time. A local run uses `npx convex login` when `CONVEX_ACCESS_TOKEN` is not
set:

```sh
pnpm exec alchemy deploy --stage my-preview
pnpm exec alchemy destroy --stage my-preview
```

`pnpm run deploy` runs `npx convex deploy` with the checks, the build, and the upload as its
`--cmd`, so a failed check stops the release before the push switches the site. Inside that build,
`scripts/ensure-convex-auth.ts` creates the Convex Auth keys on a new deployment or preview and
keeps existing keys; it stops the deploy when the deployment it selects is not the one that the
deploy targets. Deploy with `pnpm run deploy`, never with a plain `npx convex deploy`: a plain
push serves the files of the last deploy from this checkout, often another deployment's.

`convex/http.ts` answers each path as a Cloudflare Worker with static assets does: a file of the
build, else the page that the server build of `src/server.ts` renders, including the 404 page. The
build prerenders `/about` into a file, served at `/about` (`--html-handling drop-trailing-slash`).
The files follow Cloudflare's static asset rules. See the
[convex-hosting documentation](https://github.com/samebase/convex-hosting#documentation) for custom
domains, headers, and the deploy options.

## Important files

- `package.json` defines the supported development, check, build, and deploy commands.
- `vite.config.ts` builds the server for Convex with `convexSsr()` and prerenders `/about`.
- `src/server.ts` is the server entry: it answers the `/auth` sign-in, refresh, and sign-out routes
  and renders each page with the session of the request's cookies.
- `convex/convex.config.ts` mounts the Convex Auth and convex-hosting components, and
  `convex/http.ts` routes every path to the site.
- `src/routes/_authed/` holds the pages that need a session; without one they redirect to
  `/signin`.
- `alchemy.run.ts` and `.github/workflows/alchemy.yml` deploy production and previews.
- `convex/` contains the backend, schema, authentication, and generated Convex bindings.
- `src/` contains the React application and routes.

## Generated and managed files

- `src/routeTree.gen.ts` is generated by TanStack Router.
- `convex/_generated/api.*`, `dataModel.d.ts`, and `server.*` are generated by Convex.
- `.convex-hosting/` is written by each deploy and ignores itself. Do not commit it.
- `convex/_generated/ai/`, `.agents/skills/`, `skills-lock.json`, and the marked Convex sections in
  `AGENTS.md` and `CLAUDE.md` are managed by `npx convex ai-files install`.
- The marked Vite+ section in `AGENTS.md` is generated by `vp config`. The package `prepare`
  command uses `--no-agent`, so installs do not rewrite it.

Do not hand-edit generated files when their source tool can update them.
When a Convex AI-file update changes the installed source snapshot, confirm its distribution license
and update `THIRD_PARTY_NOTICES.md` when its third-party material changes.

## License

Licensed under the [Apache License 2.0](./LICENSE). See
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) for included third-party material.
