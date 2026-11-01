inputs:
inputs.nixpkgs.lib.mapAttrs (_system: pkgs: {

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
