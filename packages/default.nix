inputs:
inputs.nixpkgs.lib.mapAttrs (_system: pkgs: {
  default = pkgs.socal-nug-site;
  inherit (pkgs) socal-nug-site;
}) inputs.self.legacyPackages
