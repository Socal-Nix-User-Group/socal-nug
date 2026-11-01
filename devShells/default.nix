inputs:
inputs.nixpkgs.lib.mapAttrs (system: pkgs: {
  default = pkgs.mkShellNoCC {
    packages = [
      inputs.self.formatter.${system}
      pkgs.zola
      pkgs.socal-nug-make-event-ical
      pkgs.socal-nug-verify-post
      pkgs.socal-nug-test-site
      pkgs.socal-nug-logos
      pkgs.netlify-cli
      pkgs.zizmor
      pkgs.pinact
    ];
  };
}) inputs.self.legacyPackages
