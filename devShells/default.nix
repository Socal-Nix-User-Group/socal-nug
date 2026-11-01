inputs:
inputs.nixpkgs.lib.mapAttrs (_system: pkgs: {
  default = pkgs.mkShellNoCC {
    packages = [
      pkgs.zola
      pkgs.socal-nug-make-event-ical
      pkgs.socal-nug-verify-post
    ];
  };
}) inputs.self.legacyPackages
