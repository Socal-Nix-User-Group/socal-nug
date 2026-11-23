{
  lib,
  stdenvNoCC,
  esbuild,
}:
stdenvNoCC.mkDerivation {
  pname = "socal-nug-braid-js";
  version = "0-unstable";

  # The engine, its tests, and the node declarations the typecheck needs for
  # them. `src` is exposed so the braid-engine check can compile the tests
  # from the same tree the bundle is built from.
  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./src
      ./test
      ./smoke
      ./types
    ];
  };

  nativeBuildInputs = [ esbuild ];

  buildPhase = ''
    runHook preBuild
    mkdir -p "$out"
    esbuild src/main.ts \
      --bundle --minify --format=esm --target=es2022 \
      --outfile="$out/braid.js"
    runHook postBuild
  '';

  dontInstall = true;

  meta = {
    description = "Layout engine for the SoCal NUG Origins braid";
    platforms = lib.platforms.all;
  };
}
