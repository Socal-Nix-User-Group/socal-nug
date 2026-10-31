{
  description = "Southern California Nix User Group Site";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    flake-compat.url = "https://flakehub.com/f/edolstra/flake-compat/1.tar.gz";
  };

  outputs =
    inputs:
    inputs.flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = inputs.self.legacyPackages.${system};
      in
      {

        legacyPackages = import inputs.nixpkgs {
          inherit system;
          overlays = [ ];
          config = {
            allowAliases = false;
            allowUnfree = true;
          };
        };

        packages = rec {
          socalNixSite = pkgs.stdenv.mkDerivation {
            name = "socal-nix-site";
            src = ./.;
            buildInputs = [
              pkgs.zola
            ];
            # zola >= 0.23 panics at startup without a CA bundle (reqwest client in load_data)
            SSL_CERT_FILE = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
            buildCommand = ''
              cd $src
              mkdir -p $out
              zola build --output-dir $out/public
            '';
          };

          default = socalNixSite;
        };

        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.act
            pkgs.alejandra
            pkgs.zola
            (pkgs.python3.withPackages (ps: [
              ps.toml
              ps.pip
              ps.click
              ps.jsonschema
              ps.icalendar
              ps.pytz
            ]))
          ];
        };

      }
    );
}
