inputs:
inputs.nixpkgs.lib.mapAttrs (_system: pkgs: {
  default = pkgs.mkShellNoCC {
    packages = [
      pkgs.zola
    ];
  };
}) inputs.self.legacyPackages
