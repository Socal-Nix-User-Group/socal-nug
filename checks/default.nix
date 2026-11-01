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

}) inputs.self.legacyPackages
