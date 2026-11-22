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
        expect_warn trunk-is-earliest.toml      warning
        expect_clean valid.toml

        touch "$out"
      '';

}) inputs.self.legacyPackages
