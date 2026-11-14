{
  description = "Southern California Nix User Group Site";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    treefmt-nix.url = "github:numtide/treefmt-nix";
    treefmt-nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = inputs: {
    checks = import ./checks inputs;
    devShells = import ./devShells inputs;
    formatter = import ./formatter inputs;
    formatterModule = import ./formatterModule inputs;
    legacyPackages = import ./legacyPackages inputs;
    overlays = import ./overlays inputs;
    packages = import ./packages inputs;
  };
}
