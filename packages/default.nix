inputs:
inputs.nixpkgs.lib.mapAttrs (_system: pkgs: {
  default = pkgs.socal-nug-site;
  inherit (pkgs)
    socal-nug-site
    socal-nug-make-event-ical
    socal-nug-verify-post
    socal-nug-braid-data
    socal-nug-test-site
    socal-nug-logos
    zizmor
    pinact
    ;
}) inputs.self.legacyPackages
