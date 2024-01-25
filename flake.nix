{
  description = "Southern California Nix User Group Site";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-23.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  inputs.flake-compat.url = "https://flakehub.com/f/edolstra/flake-compat/1.tar.gz";


  outputs = {
    self,
    nixpkgs,
    flake-utils,
    ...
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = nixpkgs.legacyPackages.${system};
      in {
        packages = with pkgs; rec {
          socalNixSite = stdenv.mkDerivation {
            name = "socal-nix-site";
            src = ./.;
            buildInputs = with pkgs; [
              zola
            ];
            buildCommand = ''
              cd $src
              mkdir -p $out
              zola build --output-dir $out/public
            '';
          };

          eventSchemaValidtor = stdenv.mkDerivation {
            name = "event-schema-validator";
            src = ./.;
            buildInputs = with pkgs; [
              python311
              python311Packages.jsonschema
            ];
            buildCommand = ''
              cd $src
              mkdir -p $out/bin
              cp event-schema-validator.py $out/bin/event-schema-validator
              chmod +x $out/bin/event-schema-validator
            '';
          };

          default = socalNixSite;
        };
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            zola
            alejandra
            python311
            python311Packages.jsonschema
          ];
        };
      }
    );
}
