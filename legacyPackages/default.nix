inputs:
inputs.nixpkgs.lib.genAttrs
  [
    "x86_64-linux"
    "aarch64-linux"
    "x86_64-darwin"
    "aarch64-darwin"
  ]
  (
    system:
    import inputs.nixpkgs {
      inherit system;
      overlays = [ inputs.self.overlays.default ];
      config = {
        allowAliases = false;
        allowUnfree = true;
      };
    }
  )
