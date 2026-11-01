{
  lib,
  stdenvNoCC,
  zola,
  cacert,
  baseUrl ? "https://socal-nug.com",
}:
stdenvNoCC.mkDerivation {
  pname = "socal-nug-site";
  version = "0-unstable";

  # Only the inputs zola reads, so changes to CI, docs or tooling do not rebuild the site.
  src = lib.fileset.toSource {
    root = ../../..;
    fileset = lib.fileset.unions [
      ../../../config.toml
      ../../../content
      ../../../sass
      ../../../static
      ../../../templates
    ];
  };

  nativeBuildInputs = [ zola ];

  # zola 0.23 builds an HTTP client at startup and panics in the sandbox without a CA bundle.
  SSL_CERT_FILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";

  buildPhase = ''
    runHook preBuild
    zola build --base-url ${lib.escapeShellArg baseUrl} --output-dir "$out"
    runHook postBuild
  '';

  dontInstall = true;

  passthru = {
    inherit baseUrl;
  };

  meta = {
    description = "The Southern California Nix User Group website";
    homepage = "https://socal-nug.com";
    platforms = lib.platforms.all;
  };
}
