inputs:
let
  # One package per directory under ./topLevel, each a package.nix taking callPackage arguments.
  topLevel =
    final: _prev:
    inputs.nixpkgs.lib.filesystem.packagesFromDirectoryRecursive {
      inherit (final) callPackage;
      directory = ./topLevel;
    };
in
{
  inherit topLevel;
  default = topLevel;
}
