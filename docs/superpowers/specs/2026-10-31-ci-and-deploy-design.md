# CI and deploy rework

Date: 2026-10-31, revised 2026-11-01 after adversarial review. Branch `ci-rework`, based on `main`
after the dark-mode PR (#97) merged.

## Intent

Make the Nix flake the single definition of how the site is built, checked and deployed. Today
there are three: the flake (devShell and package), Netlify's own build (its Zola binary plus a
Python script with `requirements.txt`), and GitHub Actions (pip installs, a Zola tarball). They
drift, and the Zola 0.13 to 0.23 gap that surfaced during the dark-mode work was the result.

After this change:

- `nix flake check` is the whole test suite, locally and in CI.
- `nix build .#socal-nug-site` is the deployable site, byte for byte what production serves.
- GitHub Actions deploys that build to Netlify. Netlify hosts and does not build.
- The repo follows the conventions of the maintainer's `theonecfg` repository: no flake-utils or
  flake-compat, one directory per flake output, tools as derivations in an overlay, pinned and
  audited workflows, dependabot.

## Goals

- One build definition (the flake), one check command (`nix flake check`), one deploy path (CI).
- Production deploys on push to `main`; preview deploys for pull requests from this repository.
- Workflows that pass zizmor (regular persona) and pinact, with least-privilege permissions.
- Dependabot keeps GitHub Actions and flake inputs current.
- Local developer experience: `nix develop`, then `zola serve`, `nix flake check`, `nix build`.

## Non-goals

- Formatting Python, SCSS, HTML or templates. treefmt covers Nix, shell and Markdown only.
- Changing the site's content, templates or styles.
- Multi-system CI. Checks run on `x86_64-linux`; the flake stays multi-system.
- Replacing Netlify as the host.

## Anti-goals

- A preview mechanism that hands secrets to code from forks, or uses `pull_request_target`.
- A Netlify configuration that silently keeps building the site alongside CI.
- A `nix flake check` that passes while the deployed site would differ from the package.
- A production credential reachable from any pull-request job.

## Constraints

- Netlify cannot run Nix, so it must stop building; the maintainer does this in the Netlify UI.
- Zola bakes `base_url` into permalinks, sitemaps and social tags, so previews must be built with
  their own URL.
- Zola 0.23 panics in the Nix sandbox without a CA bundle. Every derivation or wrapper that runs
  zola (the site package and the `socal-nug-test-site` tool) sets `SSL_CERT_FILE` from `cacert`.
- A `pull_request` workflow runs the workflow file from the PR branch. For a same-repo PR that
  code runs with the repository's Actions secrets, so any collaborator with push access can read a
  secret exposed to PR jobs without a review. Secrets exposed to PR jobs must therefore be
  limited in scope, and the production credential must never be one of them.
- The `nix` dependabot ecosystem supports version updates only, not security updates.
- The build-output tests write a temporary profile into `content/about/`; inside a derivation
  they must run against a writable copy of the source.
- The Netlify CLI walks `--dir` with `lstat`, so a symlink such as `result` deploys nothing.
  Deploy commands always pass the resolved store path.
- Nix flakes only see files tracked by git; new files must be staged before any `nix` command.

## Decisions

### Flake layout

`flake.nix` declares inputs `nixpkgs` (nixos-unstable) and `treefmt-nix`, and
`outputs = inputs: { checks; devShells; formatter; formatterModule; legacyPackages; overlays; packages; }`,
each `import ./<name> inputs`. `legacyPackages` instantiates nixpkgs per supported system with
`overlays.default` applied and `config = { allowAliases = false; allowUnfree = true; }`.
`packages` exposes the overlay's `socal-nug-*` attributes per system plus the CI tools, with
`default` being the site. flake-utils and flake-compat are removed along with `shell.nix` and
`default.nix`.

### Overlay packages

`overlays/default.nix` composes one package per directory under `overlays/topLevel/`, each a
`package.nix` taking `callPackage` arguments, loaded with `packagesFromDirectoryRecursive`
(theonecfg's layout).

- `socal-nug-site`: `stdenvNoCC.mkDerivation`. Native build inputs: zola and
  `socal-nug-make-event-ical`. Argument `baseUrl` defaulting to `https://socal-nug.com`. Build
  phase runs `zola build --base-url $baseUrl --output-dir $out`, then the ical generator over
  `content/events/20*.md` into `$out/events/`. An install check asserts `events/calendar.ics`
  exists. This is the only build of the site anywhere.
- `socal-nug-make-event-ical`: `writers.writePython3Bin` with icalendar, pytz and click,
  wrapping the current `make_event_ical.py` (switched to the standard library's `tomllib`). The
  source moves into the package directory. The writer supplies the interpreter line, so the
  script's own shebang is removed.
- `socal-nug-verify-post`: `writePython3Bin` with jsonschema and click, wrapping `verify_post.py`,
  same shebang rule. The JSON schemas move alongside it and are exposed as `passthru.schemas`.
- `socal-nug-test-site`: `writeShellApplication` running the build-output tests with zola and
  python3 as runtime inputs and `SSL_CERT_FILE` set; takes the site source directory as an
  argument so it can run on a copy.
- `socal-nug-logos`: `writeShellApplication` around the logo pipeline with potrace, ImageMagick and
  python3 as runtime inputs. The pipeline's artwork and compose script move into the package
  directory; it runs from the repository root and writes to `static/siblings/`. The shell script
  keeps its shebang so shellcheck can lint it standalone.

The `scripts/` directory is removed once everything has moved. The `adding-events` skill under
`.claude/skills/` references the validator and schema under `scripts/`; it is updated to the new
tool and schema locations.

### Checks

`checks/default.nix` produces, per system:

- `site`: the `socal-nug-site` package. Building it is the check.
- `frontmatter`: `runCommand` running `socal-nug-verify-post` with each schema over the event and
  profile content.
- `test-site`: `runCommand` copying the source to a writable directory and running
  `socal-nug-test-site` against it.
- `formatting`: treefmt-nix's check with nixfmt, shellcheck and mdformat (with the GFM plugin),
  `projectRootFile = "flake.nix"`. mdformat is scoped to repository documentation only:
  `README.md`, `docs/**` and READMEs under `overlays/`, set through the program's own `includes`
  option (the per-formatter `settings` list merges with the default `*.md` and would not narrow
  it). `content/**` and `.claude/**` are excluded globally: the reviewer ran mdformat over the
  tree and it corrupts TOML front matter (`[[extra.gallery]]` becomes `\[[extra.gallery]\]`),
  escapes the component calls in the anniversary post, and strips the YAML front matter from the
  `adding-events` skill. Site content is a non-goal of this change, so those files are never
  formatted.

`formatter` is the treefmt wrapper for the same configuration, so `nix fmt` fixes what the check
reports. The one-time reformat of the covered Nix, shell and Markdown files is committed before
the formatter and its check, so every commit passes the checks that exist at that point.

### Workflows

All actions are pinned to commit SHAs with version comments. Every checkout uses
`persist-credentials: false`. Top-level `permissions` are `contents: read` or `{}`; jobs add only
what they need. Values from the event payload reach `run` steps through `env`, never through
`${{ }}` inside the script. `run` scripts whose text contains `: ` are written as block scalars.

- `.github/actions/setup-nix/action.yml`: composite action, `cachix/install-nix-action` plus
  `nix-community/cache-nix-action` keyed on `flake.lock`, copied from theonecfg. Referenced as
  `$/.github/actions/setup-nix`; GitHub documents `$/` as the self-repository reference, and
  actionlint does not know it, so actionlint runs with that diagnostic ignored.
- `.github/workflows/ci.yml`, one workflow on `pull_request`, `push` to `main` and
  `workflow_dispatch`, with a per-PR concurrency group that cancels in progress for pull requests
  and never cancels a production deploy:
  - `nix-checks`: `nix flake check -L`.
  - `workflow-security`: `nix run .#zizmor -- .github/` with `GH_TOKEN: ${{ github.token }}` and
    `nix run .#pinact -- run --check` with `GITHUB_TOKEN: ${{ github.token }}`. Without the token
    zizmor silently runs offline and skips its online audits.
  - `preview`: pull requests only, and only when
    `github.event.pull_request.head.repo.full_name == github.repository`. This includes
    Dependabot PRs, which receive Dependabot secrets rather than repository secrets. Builds the
    site with `baseUrl` set to `https://pr-<number>--socal-nug.netlify.app` and captures the
    store path with `nix build --no-link --print-out-paths`, deploys it with
    `netlify deploy --no-build --dir <store path> --alias pr-<number> --site socal-nug`, and
    maintains one sticky comment on the PR with the URL (job permission `pull-requests: write`).
    Uses the preview credential described below.
  - `deploy`: `push` to `main`, or `workflow_dispatch` on `main` for recovery,
    `needs: [nix-checks, workflow-security]`, so a red check never deploys. Runs in the GitHub
    Environment `production`, whose deployment-branch policy allows only `main`, so its secret is
    unreachable from pull-request jobs. Builds `.#socal-nug-site`, captures the store path, and
    runs `netlify deploy --no-build --prod --dir <store path> --site socal-nug`. A single workflow
    is used instead of a separate `deploy.yml` so the gating is expressed with `needs` rather than
    relying on branch protection.

  The site is addressed by name in the workflow file; the name is not sensitive.

  Recommended but outside this repository: add `nix-checks` and `workflow-security` as required
  status checks in branch protection for `main`, which currently requires one review and no
  checks.

- `.github/workflows/zizmor.yml`: pedantic SARIF report uploaded to code scanning, on pushes to
  `main` touching `.github/**` or `flake.lock`. Not on pull requests: a fork PR's read-only token
  cannot upload SARIF, and the blocking gate is the regular-persona run in `ci.yml`.
- `.github/dependabot.yml`: `github-actions` for `/` and `/.github/actions/*`, and `nix` for `/`,
  weekly, 7-day cooldown.
- `.github/workflows/main.yml` is deleted.

zizmor, pinact and the Netlify CLI come from nixpkgs through the flake's packages so
`nix run .#<tool>` works in CI and locally.

### Credentials

Two Netlify credentials, so that the one reachable from pull-request jobs cannot touch
production:

- Production: `NETLIFY_AUTH_TOKEN` stored only in the GitHub Environment `production`.
- Preview: `NETLIFY_AUTH_TOKEN` stored as a repository Actions secret and as a repository
  Dependabot secret. Its scope is decided by the open question below.

Netlify personal access tokens act for the whole account that created them, and they can be given
an expiry. The expiry choice is recorded in the repository README's deploy section. Recovery after
an expired or rotated token: update the secret, then re-run the failed run or dispatch `ci.yml` on
`main`.

### Netlify

`netlify.toml` and `requirements.txt` are deleted. The Netlify site is named `socal-nug`. The
maintainer, outside this repository, in this order:

1. Before the `preview` job can pass on this branch's PR: create the preview credential and store
   it as the Actions secret and the Dependabot secret `NETLIFY_AUTH_TOKEN`; create the
   `production` Environment with deployment branches limited to `main` and store the production
   credential in it as `NETLIFY_AUTH_TOKEN`.
2. Once the PR's `preview` job has deployed successfully, and before merging: in the Netlify
   site's Build & deploy settings, stop builds. Netlify keeps serving the last deploy, and CLI
   deploys keep working with builds stopped. Doing this before the merge avoids a race between
   Netlify's git build (now with no `netlify.toml`) and the Actions deploy on the merge commit.
3. After the merge: confirm in Netlify's deploy log that the production deploy came from the CLI,
   and that `socal-nug.com` serves the new build.

On this branch's PR, Netlify's own deploy preview will fail or be wrong once `netlify.toml` is
gone; that is expected and the PR description says so.

### Developer workflow

`README.md` is rewritten around `nix develop`, `zola serve`, `nix flake check`, `nix fmt` and
`nix build`, with a deploy section covering the credentials and recovery. `act` and `alejandra`
leave the devShell (replaced by `nix flake check` and nixfmt); the devShell contains zola, the
overlay tools, treefmt, zizmor, pinact and the Netlify CLI.

### Commits

Separate commits, in roughly this order: flake re-architecture; tools moved into the overlay;
checks; the one-time reformat, then the formatter and its check; workflows and dependabot; Netlify
removal and README. Each commit passes the checks that exist at that point.

## Open question for the maintainer

Scope of the preview credential. Because same-repo PR jobs run PR-authored workflow code with the
repository's secrets, any of the repository's collaborators can read the preview token by opening a
PR. Options:

1. Accept that exposure: the preview token is a personal access token for the maintainer's Netlify
   account, and the collaborator list is trusted. Cheapest; one account to manage.
2. Create a separate Netlify user (or team member) with access only to the `socal-nug` site, and
   use that user's token for previews. Exposure is then limited to that site.
3. Put the preview job in a GitHub Environment `preview` with required reviewers, so a maintainer
   approves each preview deploy after seeing the PR. No exposure without a human, at the cost of a
   click per PR, including Dependabot PRs.

## Left to the builder

- Exact attribute names within the conventions above.
- How `socal-nug-test-site` receives the source path and how the check copies the tree.
- The sticky-comment mechanism (a marker string searched with `gh`, or an action if a pinned
  one is clearly better).
- Which systems `legacyPackages` enumerates.
- Cache sizing and purge settings in `setup-nix`.
- `writers.writePython3Bin` runs flake8 over the wrapped script; the existing scripts have long
  lines and trailing whitespace. Prefer cleaning the scripts over disabling the check.

## Verification

- `nix flake check` passes locally on the final branch.
- `nix build .#socal-nug-site` output matches a `zola build` plus ical run on the same source.
- zizmor regular persona (with a token) and pinact pass locally on `.github/`.
- The PR for this branch exercises `nix-checks`, `workflow-security` and `preview` for real; the
  preview URL works and its links stay on the preview host; `deploy` is skipped.
- The `deploy` job is exercised by the merge to `main`; Netlify's deploy log shows a CLI deploy
  and `socal-nug.com` serves the new build.

Versions verified in the locked nixpkgs at the time of writing: zola 0.23.6, netlify-cli 23.15.0,
zizmor 1.31.1, pinact 5.0.0.
