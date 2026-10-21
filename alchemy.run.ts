// Stage `main` is the production deployment of the Convex project of this
// repository. Any other stage is a preview deployment named after the pull
// request branch (GITHUB_HEAD_REF, or else the stage), which `alchemy destroy`
// deletes. The push is the `deploy` script: convex-hosting builds the site,
// sets the Convex Auth keys, uploads the site, and pushes the functions.
//
// The stack is named after the repository, `owner/name`, and its Convex
// project after `name`. The state of every stage is in the `alchemy-state`
// project of the team, which Convex.state() creates on the first run. Every
// run needs the team token CONVEX_ACCESS_TOKEN, or a Convex CLI login
// (`npx convex login`) on a laptop; it mints the deploy keys itself.
import { execFileSync } from "node:child_process";
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import * as GitHub from "alchemy/GitHub";
import * as Output from "alchemy/Output";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/** The Convex team that holds the project and the state. */
const team = "nicu";

/** The GitHub repository, `owner/name`: GITHUB_REPOSITORY in Actions, else the origin remote. */
const repository =
  process.env["GITHUB_REPOSITORY"] ??
  /[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(
    execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim(),
  )?.[1];
if (repository === undefined) {
  throw new Error("Set GITHUB_REPOSITORY to owner/name: the origin remote names no repository.");
}

export default Alchemy.Stack(
  repository,
  {
    providers: Layer.mergeAll(GitHub.providers(), Convex.providers()),
    state: Convex.state({ team }),
  },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    // scripts/ensure-convex-auth.ts selects a preview by GITHUB_HEAD_REF.
    const name = process.env["GITHUB_HEAD_REF"] || stage;
    const source = {
      path: "./convex",
      command: ["node", "--run", "deploy"],
      // The build inputs. The functions, package.json, and the lockfile are always hashed.
      include: ["src/**", "public/**", "scripts/**", "vite.config.ts", "tsconfig*.json"],
    } satisfies Convex.Source;
    // The stage `main` owns the project, and `alchemy destroy --stage main` deletes it with
    // every deployment. A preview stage reads the project from the state of `main`.
    const project =
      stage === "main"
        ? yield* Convex.Project("Project", {
            team,
            name: repository.slice(repository.indexOf("/") + 1),
          }).pipe(RemovalPolicy.destroy())
        : yield* Convex.Project.ref("Project", { stage: "main" });
    const deployment =
      stage === "main"
        ? yield* Convex.Deployment("Deployment", { project, type: "prod", source })
        : yield* Convex.Deployment("Deployment", { project, type: "preview", name, source }).pipe(
            RemovalPolicy.destroy(),
          );

    const github = yield* GitHub.GitHubEnv;
    if (github?.pr) {
      // Retained: a closed pull request keeps the comment, as a record of what was deployed; the
      // preview's URL stops answering when the stage is destroyed.
      yield* GitHub.Comment("PreviewComment", {
        owner: github.owner,
        repository: github.repository,
        issueNumber: github.pr,
        body: Output.interpolate`Preview \`${name}\`: ${deployment.siteUrl}`,
      }).pipe(RemovalPolicy.retain());
    }
    return { url: deployment.siteUrl };
  }),
);
