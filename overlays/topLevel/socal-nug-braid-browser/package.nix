{
  lib,
  writeShellApplication,
  runCommand,
  esbuild,
  nodejs,
  chromium,
  socal-nug-braid-js,
  socal-nug-site,
}:
let
  # The check and its two helpers as one file node can run. Same compile as
  # the braid-engine and braid-smoke checks use, for the same reason: no npm.
  bundle = runCommand "socal-nug-braid-browser-bundle" { nativeBuildInputs = [ esbuild ]; } ''
    mkdir -p "$out"
    esbuild ${socal-nug-braid-js.src}/browser/check.ts \
      --bundle --format=esm --platform=node --target=node22 \
      --outfile="$out/check.mjs"
  '';
in
# How the Origins page behaves in a real browser: scrolling, clicking, tabbing, tapping. Run by
# hand after changing the page's script, stylesheet or template, and deliberately not part of
# `nix flake check`: nothing a content change does can break what it looks at, and Chromium is
# a 1.7 GiB closure to put in front of every event post.
#
# With no argument it checks the site as this flake builds it. Given a directory, it checks the
# built site there instead.
writeShellApplication {
  name = "socal-nug-braid-browser";
  runtimeInputs = [
    nodejs
    chromium
  ];
  text = ''
    exec node ${bundle}/check.mjs "''${1:-${socal-nug-site}}"
  '';
  # nixpkgs has no Chromium for macOS.
  meta.platforms = lib.platforms.linux;
}
