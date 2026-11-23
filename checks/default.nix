inputs:
inputs.nixpkgs.lib.mapAttrs (system: pkgs: {

  # The site builds, with its calendar files.
  site = pkgs.socal-nug-site;

  # Nix, shell and documentation Markdown are formatted (see formatterModule).
  formatting = inputs.self.formatterModule.${system}.config.build.check inputs.self;

  # The build-output tests, run against a writable copy of the source because the
  # about-page ordering test writes a temporary profile into content/about/.
  test-site =
    pkgs.runCommand "socal-nug-test-site-check"
      {
        nativeBuildInputs = [ pkgs.socal-nug-test-site ];
      }
      ''
        cp -r ${inputs.self} src
        chmod -R u+w src
        socal-nug-test-site ./src
        touch "$out"
      '';

  # Every event post and member profile validates against its JSON schema.
  frontmatter =
    pkgs.runCommand "socal-nug-frontmatter"
      {
        nativeBuildInputs = [ pkgs.socal-nug-verify-post ];
      }
      ''
        cd ${inputs.self}
        socal-nug-verify-post --schema ${pkgs.socal-nug-verify-post.schemas}/event.json content/events/20*.md
        socal-nug-verify-post --schema ${pkgs.socal-nug-verify-post.schemas}/profiles.json content/about/*.md
        touch "$out"
      '';

  # Netlify builds the site with its own Zola, pinned in netlify.toml; the pin must match the
  # flake's zola so a Netlify build does not differ from the package.
  netlify-zola-version =
    pkgs.runCommand "socal-nug-netlify-zola-version"
      {
        pinned = (builtins.fromTOML (builtins.readFile ../netlify.toml)).build.environment.ZOLA_VERSION;
        flake = pkgs.zola.version;
      }
      ''
        if [ "$pinned" != "$flake" ]; then
          echo "netlify.toml pins ZOLA_VERSION = $pinned but the flake's zola is $flake" >&2
          exit 1
        fi
        touch "$out"
      '';

  # The layout engine's unit tests. esbuild compiles each test file and its imports to ESM, and
  # node's built-in runner executes them. No npm, no test-runner dependency.
  braid-engine =
    pkgs.runCommand "socal-nug-braid-engine-check"
      {
        nativeBuildInputs = [
          pkgs.esbuild
          pkgs.nodejs
        ];
      }
      ''
        # The source is a read-only store path, so compile out of it into the build dir.
        # .mjs so node loads the ESM output as ESM; a bare .js would be read as CommonJS.
        esbuild ${pkgs.socal-nug-braid-js.src}/test/*.test.ts \
          --bundle --format=esm --platform=node --target=node22 \
          --out-extension:.js=.mjs --outdir=compiled
        node --test compiled/*.test.mjs
        touch "$out"
      '';

  # esbuild strips types without checking them, so TypeScript would be documentation only
  # without this. tsc comes from nixpkgs and needs no npm.
  braid-types =
    pkgs.runCommand "socal-nug-braid-types"
      {
        nativeBuildInputs = [ pkgs.typescript ];
      }
      ''
        cp -r ${pkgs.socal-nug-braid-js.src}/. .
        chmod -R u+w .
        # Tests too, not just src: esbuild strips types without checking them,
        # so a test file outside tsc's reach has no types at all. Adding a
        # required field to an interface then surfaces as a confusing test
        # failure rather than an error naming every fixture that needs it.
        # types/node.d.ts covers what the tests import from node.
        tsc --noEmit --strict \
          --target es2022 --module esnext --moduleResolution bundler \
          --allowImportingTsExtensions --skipLibCheck \
          types/*.d.ts src/*.ts test/*.ts
        touch "$out"
      '';

  # Netlify cannot run esbuild, so the bundle is committed and served as a static asset. This
  # fails when the committed file and a fresh build of src/ disagree, the same shape as the
  # netlify-zola-version check. Both can be deleted once the site is self-hosted.
  braid-bundle-fresh = pkgs.runCommand "socal-nug-braid-bundle-fresh" { } ''
    committed=${inputs.self}/static/js/braid.js
    fresh=${pkgs.socal-nug-braid-js}/braid.js
    if ! cmp -s "$committed" "$fresh"; then
      echo "static/js/braid.js is stale." >&2
      echo "  committed: $committed" >&2
      echo "  fresh    : $fresh" >&2
      echo "Rebuild with: nix build .#socal-nug-braid-js && cp result/braid.js static/js/braid.js" >&2
      exit 1
    fi
    touch "$out"
  '';

  # The layout engine the page loads is a vendored copy of a pinned upstream release, so a
  # self-hosted site needs no CDN. This fails if what is committed is not that release, byte
  # for byte, which is the only way a vendored file stays honest about where it came from.
  elk-vendored =
    let
      upstream = pkgs.fetchurl {
        url = "https://cdn.jsdelivr.net/npm/elkjs@0.12.1/lib/elk.bundled.js";
        hash = "sha256-sQMrfP0qV8VMbw6DaddmXhmleZVPfNIKba4o8ZEuoNc=";
      };
    in
    pkgs.runCommand "socal-nug-elk-vendored" { } ''
      if ! cmp -s ${inputs.self}/static/js/vendor/elk.bundled.js ${upstream}; then
        echo "static/js/vendor/elk.bundled.js is not elkjs 0.12.1's lib/elk.bundled.js" >&2
        exit 1
      fi
      touch "$out"
    '';

  # The engine run against the repository's real data and the template's merge, rather than
  # against fixtures. Without this, a plausible typo in data/moments.toml draws nonsense with
  # the rest of the suite green.
  braid-smoke =
    pkgs.runCommand "socal-nug-braid-smoke"
      {
        nativeBuildInputs = [
          pkgs.esbuild
          pkgs.nodejs
        ];
      }
      ''
        # The layout engine is the vendored copy the page loads, left outside the
        # bundle and put beside it, so the check runs exactly what ships.
        cp ${inputs.self}/static/js/vendor/elk.bundled.js .
        esbuild ${pkgs.socal-nug-braid-js.src}/smoke/smoke.ts \
          --bundle --format=esm --platform=node --target=node22 \
          --external:./elk.bundled.js \
          --outfile=smoke.mjs
        node smoke.mjs ${pkgs.socal-nug-site}
        touch "$out"
      '';

  # The repository's moments file validates, and the validator rejects each way a moment can be
  # malformed. Fixtures resolve their person and event slugs against the real content.
  braid-data =
    pkgs.runCommand "socal-nug-braid-data-check"
      {
        nativeBuildInputs = [ pkgs.socal-nug-braid-data ];
      }
      ''
        cd ${inputs.self}
        fixtures="${inputs.self}/overlays/topLevel/socal-nug-braid-data/tests"

        run() {
          socal-nug-braid-data "$1" --about content/about --events content/events 2>&1
        }

        expect_fail() {
          if result=$(run "$fixtures/$1"); then
            echo "FAIL: $1 was accepted but should have been rejected" >&2
            exit 1
          fi
          case "$result" in
            *"$2"*) echo "ok (rejected): $1" ;;
            *)
              echo "FAIL: $1 rejected without mentioning '$2'; got: $result" >&2
              exit 1
              ;;
          esac
        }

        expect_warn() {
          if ! result=$(run "$fixtures/$1"); then
            echo "FAIL: $1 was rejected but should only warn: $result" >&2
            exit 1
          fi
          case "$result" in
            *"$2"*) echo "ok (warned): $1" ;;
            *)
              echo "FAIL: $1 did not warn with '$2'; got: $result" >&2
              exit 1
              ;;
          esac
        }

        expect_clean() {
          if ! result=$(run "$fixtures/$1"); then
            echo "FAIL: $1 was rejected: $result" >&2
            exit 1
          fi
          case "$result" in
            *warning* | *error*)
              echo "FAIL: $1 should be silent; got: $result" >&2
              exit 1
              ;;
            *) echo "ok (clean): $1" ;;
          esac
        }

        socal-nug-braid-data data/moments.toml --about content/about --events content/events

        expect_fail unknown-slug.toml           nobody-here
        expect_fail both-date-and-event.toml    both
        expect_fail neither-date-nor-event.toml neither
        expect_fail bad-date.toml               2023-4-1
        expect_fail duplicate-id.toml           twice
        expect_fail unknown-event.toml          1999-01-01
        expect_fail no-trunk.toml               trunk
        expect_fail bad-links.toml              'links[0]'
        expect_warn trunk-is-earliest.toml      warning
        expect_clean valid.toml

        touch "$out"
      '';

}) inputs.self.legacyPackages
