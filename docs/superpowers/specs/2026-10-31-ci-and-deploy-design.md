# CI and deploy rework

Date: 2026-10-31, revised 2026-11-01 after adversarial review, and again 2026-11-14 when the
deploy model changed. Branch `ci-rework`, based on `main` after the dark-mode PR (#97) merged.

Revision of 2026-11-14: the branch first made GitHub Actions deploy the Nix-built site to Netlify
with the Netlify CLI, which needs a Netlify personal access token in the repository. Those tokens
act for the whole account that created them, the account is a member's personal one, and the
group expects to self-host before investing in a Netlify team. So Netlify builds and deploys the
site itself again, from `netlify.toml`, and the repository holds no deploy credential. Everything
else below stands; the sections on workflows, credentials and Netlify describe the revised design.

## Intent

Make the Nix flake the definition of how the site is built and checked. Before this change there
were three: the flake (devShell and package), Netlify's own build (its Zola binary plus a Python
script with `requirements.txt`), and GitHub Actions (pip installs, a Zola tarball). They drifted,
and the Zola 0.13 to 0.23 gap that surfaced during the dark-mode work was the result.

After this change:

- `nix flake check` is the whole test suite, locally and in CI.
- `nix build .#socal-nug-site` is the deployable site, what Netlify's build should produce.
- Netlify builds and deploys from `netlify.toml`, whose build command is the package's build
  phase, and a flake check keeps its Zola pin equal to the flake's zola.
- The repo follows the conventions of the maintainer's `theonecfg` repository: no flake-utils or
  flake-compat, one directory per flake output, tools as derivations in an overlay, pinned and
  audited workflows, dependabot.

## Goals

- One build definition (the flake) that Netlify's build mirrors, one check command
  (`nix flake check`), and a check that fails when the two disagree on the Zola version.
- Production deploys on push to `main`; deploy previews for pull requests, both by Netlify.
- Workflows that pass zizmor (regular persona) and pinact, with least-privilege permissions.
- Dependabot keeps GitHub Actions, flake inputs and `requirements.txt` current.
- Local developer experience: `nix develop`, then `zola serve`, `nix flake check`, `nix build`.

## Non-goals

- Formatting Python, SCSS, HTML or templates. treefmt covers Nix, shell and Markdown only.
- Changing the site's content, templates or styles.
- Multi-system CI. Checks run on `x86_64-linux`; the flake stays multi-system.
- Replacing Netlify as the host. Self-hosting is a later project; the flake's site package is the
  piece it will need.

## Anti-goals

- Any deploy credential in the repository: no Netlify token as an Actions, Environment or
  Dependabot secret, and no `pull_request_target`.
- A `nix flake check` that passes while Netlify would build the site with a different Zola.

## Constraints

- Netlify cannot run Nix. Its build uses the Zola binary selected by `ZOLA_VERSION` and a Python
  selected by `PYTHON_VERSION`, and installs `requirements.txt` with pip before the build command.
  The calendar script uses `tomllib`, so Python 3.11 or newer.
- Zola bakes `base_url` into permalinks, sitemaps and social tags, so deploy previews are built
  with `--base-url $DEPLOY_PRIME_URL`.
- Zola 0.23 panics in the Nix sandbox without a CA bundle. Every derivation or wrapper that runs
  zola (the site package and the `socal-nug-test-site` tool) sets `SSL_CERT_FILE` from `cacert`.
- The `nix` dependabot ecosystem supports version updates only, not security updates.
- The build-output tests write a temporary profile into `content/about/`; inside a derivation
  they must run against a writable copy of the source.
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
  exists. Netlify's build command performs the same two steps.
- `socal-nug-make-event-ical`: `writers.writePython3Bin` with icalendar, pytz and click,
  wrapping the current `make_event_ical.py` (switched to the standard library's `tomllib`). The
  source moves into the package directory. The writer supplies the interpreter line, so the
  script's own shebang is removed. Netlify runs the same file with its own Python.
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
- `netlify-zola-version`: `runCommand` comparing `build.environment.ZOLA_VERSION` from
  `netlify.toml` (read with `builtins.fromTOML`) against `zola.version` from the flake's nixpkgs,
  failing with both values in the message. A nixpkgs update that changes zola therefore fails CI
  until the pin follows.
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

- `.github/workflows/ci.yml`, one workflow on `pull_request` and `push` to `main`, with a
  per-PR (or per-ref) concurrency group that cancels superseded runs:

  - `nix-checks`: `nix flake check -L`.
  - `workflow-security`: `nix run .#zizmor -- .github/` with `GH_TOKEN: ${{ github.token }}` and
    `nix run .#pinact -- run --check` with `GITHUB_TOKEN: ${{ github.token }}`. Without the token
    zizmor silently runs offline and skips its online audits.

  No job deploys, needs a secret, or needs more than `contents: read`.

  Recommended but outside this repository: add `nix-checks` and `workflow-security` as required
  status checks in branch protection for `main`, which currently requires one review and no
  checks. Netlify's `deploy-preview` status is a candidate too.

- `.github/workflows/zizmor.yml`: pedantic SARIF report uploaded to code scanning, on pushes to
  `main` touching `.github/**` or `flake.lock`. Not on pull requests: a fork PR's read-only token
  cannot upload SARIF, and the blocking gate is the regular-persona run in `ci.yml`.

- `.github/dependabot.yml`: `github-actions` for `/` and `/.github/actions/*`, `nix` for `/`, and
  `pip` for `/` (the `requirements.txt` Netlify installs), weekly, 7-day cooldown.

- `.github/workflows/main.yml` is deleted.

zizmor and pinact come from nixpkgs through the flake's packages so `nix run .#<tool>` works in
CI and locally.

### Credentials

None in the repository. Netlify deploys through its own GitHub App integration, which the Netlify
site already has; GitHub Actions uses only the per-job `github.token`.

The earlier design's GitHub Environments `preview` and `production` and their secrets are not
used. The `preview` Environment that the first run of the earlier workflow created should be
deleted, as should any `NETLIFY_AUTH_TOKEN` secret, so that no account-wide Netlify token sits
in the repository unused.

### Netlify

`netlify.toml` configures the build:

- `[build]`: `publish = "public"`, `command` is `zola build` followed by
  `python3 overlays/topLevel/socal-nug-make-event-ical/make_event_ical.py --output public/events/ content/events/20*.md`.
- `[build.environment]`: `ZOLA_VERSION` equal to the flake's zola (enforced by the
  `netlify-zola-version` check) and `PYTHON_VERSION = "3.13"`, which satisfies `tomllib`.
- `[context.deploy-preview]`: the same command with `zola build --base-url $DEPLOY_PRIME_URL`.

`requirements.txt` lists click, icalendar and pytz, pinned to the versions in the flake's nixpkgs
at the time of writing; dependabot's `pip` ecosystem keeps them current.

Nothing changes in the Netlify UI: the site named `socal-nug` keeps building from `main` and
building deploy previews for pull requests, as it did before this branch.

### Developer workflow

`README.md` is rewritten around `nix develop`, `zola serve`, `nix flake check`, `nix fmt` and
`nix build`, with a deploy section explaining that Netlify builds from `netlify.toml`, that the
repository holds no deploy credential, and how the Zola pin is kept in step. `act` and `alejandra`
leave the devShell (replaced by `nix flake check` and nixfmt); the devShell contains zola, the
overlay tools, treefmt, zizmor and pinact.

### Commits

Separate commits, in roughly this order: flake re-architecture; tools moved into the overlay;
checks; the one-time reformat, then the formatter and its check; workflows and dependabot; the
Netlify changes and README. Each commit passes the checks that exist at that point.

## Left to the builder

- Exact attribute names within the conventions above.
- How `socal-nug-test-site` receives the source path and how the check copies the tree.
- Which systems `legacyPackages` enumerates.
- Cache sizing and purge settings in `setup-nix`.
- `writers.writePython3Bin` runs flake8 over the wrapped script; the existing scripts have long
  lines and trailing whitespace. Prefer cleaning the scripts over disabling the check.

## Verification

- `nix flake check` passes locally on the final branch, and `netlify-zola-version` fails when
  the pin is deliberately wrong.
- `nix build .#socal-nug-site` output matches `netlify.toml`'s build command run with the flake's
  zola and a pip-installed `requirements.txt` on the same source, and the deploy-preview command
  produces a sitemap on the preview host only.
- zizmor regular persona (with a token) and pinact pass locally on `.github/`.
- The PR for this branch exercises `nix-checks` and `workflow-security` for real, and Netlify's
  deploy preview for the PR builds and serves the branch.
- The merge to `main` is deployed by Netlify's production build as before.

Versions verified in the locked nixpkgs at the time of writing: zola 0.23.6, zizmor 1.31.1,
pinact 5.0.0, click 8.4.2, icalendar 7.2.2, pytz 2026.3.post1.
