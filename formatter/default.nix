inputs:
inputs.nixpkgs.lib.mapAttrs (
  _system: module: module.config.build.wrapper
) inputs.self.formatterModule
