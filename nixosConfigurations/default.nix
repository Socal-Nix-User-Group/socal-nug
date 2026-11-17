inputs: {
  nixos-anywhere-test1 = inputs.nixpkgs.lib.nixosSystem {
    modules = [
      inputs.disko.nixosModules.disko
      ./nixos-anywhere-test1
    ];
  };
}
