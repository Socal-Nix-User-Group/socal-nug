inputs:
inputs.nixpkgs.lib.mapAttrs (
  _system: pkgs:
  inputs.treefmt-nix.lib.evalModule pkgs {
    config = {
      projectRootFile = "flake.nix";
      enableDefaultExcludes = true;
      programs = {
        nixfmt.enable = true;
        shellcheck.enable = true;
        mdformat = {
          enable = true;
          plugins = ps: [ ps.mdformat-gfm ];
          # Repository documentation only. Site content is never formatted: mdformat corrupts
          # TOML front matter and the component calls in posts.
          includes = [
            "README.md"
            "docs/**/*.md"
            "overlays/**/*.md"
          ];
        };
      };
      settings.excludes = [
        "content/**"
        ".claude/**"
      ];
    };
  }
) inputs.self.legacyPackages
