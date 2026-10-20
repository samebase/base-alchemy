// Stage `main` is the production deployment of the Convex project base-alchemy.
// Any other stage is a preview deployment named after the pull request branch
// (GITHUB_HEAD_REF, or else the stage), which `alchemy destroy` deletes. The
// push is the `deploy` script: convex-hosting builds the site, sets the Convex
// Auth keys, uploads the site, and pushes the functions. The state of every stage
// is in the alchemyState component of the production deployment, which
// convex/convex.config.ts mounts; every run needs CONVEX_STATE_DEPLOY_KEY.
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import * as GitHub from "alchemy/GitHub";
import * as Output from "alchemy/Output";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

// By id, so that a deploy key alone reaches the project.
const project = { projectId: 3245938 };

export default Alchemy.Stack(
  "BaseAlchemy",
  {
    providers: Layer.mergeAll(GitHub.providers(), Convex.providers()),
    state: Convex.state(),
  },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    // scripts/ensure-convex-auth.ts selects a preview by GITHUB_HEAD_REF.
    const name = process.env["GITHUB_HEAD_REF"] || stage;
    // A preview deploy key needs --preview-name. The deployment's own key, which the
    // provider makes from a Convex login, rejects it.
    const args = process.env["CONVEX_DEPLOY_KEY"]?.startsWith("preview:")
      ? ["--", "--preview-name", name]
      : [];
    const source = {
      path: "./convex",
      command: ["node", "--run", "deploy", ...args],
      // The build inputs. The functions, package.json, and the lockfile are always hashed.
      include: ["src/**", "public/**", "scripts/**", "vite.config.ts", "tsconfig*.json"],
    } satisfies Convex.Source;
    const deployment =
      stage === "main"
        ? yield* Convex.Deployment("Deployment", { project, type: "prod", source })
        : yield* Convex.Deployment("Deployment", { project, type: "preview", name, source }).pipe(
            RemovalPolicy.destroy(),
          );

    const github = yield* GitHub.GitHubEnv;
    if (github?.pr) {
      yield* GitHub.Comment("PreviewComment", {
        owner: github.owner,
        repository: github.repository,
        issueNumber: github.pr,
        body: Output.interpolate`Preview \`${name}\`: ${deployment.siteUrl}`,
      });
    }
    return { url: deployment.siteUrl };
  }),
);
