inputs:
inputs.nixpkgs.lib.mapAttrs (
  _system: pkgs:
  {
    default = pkgs.socal-nug-site;
    inherit (pkgs)
      socal-nug-site
      socal-nug-make-event-ical
      socal-nug-verify-post
      socal-nug-braid-data
      socal-nug-braid-js
      socal-nug-test-site
      socal-nug-logos
      zizmor
      pinact
      ;
  }
  # Drives Chromium, which nixpkgs does not package for macOS. Left out there rather than listed
  # and broken: `nix flake check` evaluates every package it is shown.
  // inputs.nixpkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
    inherit (pkgs) socal-nug-braid-browser;
  }
) inputs.self.legacyPackages
