{
  writeShellApplication,
  python3,
  zola,
  cacert,
}:
writeShellApplication {
  name = "socal-nug-test-site";
  runtimeInputs = [
    python3
    zola
  ];
  # zola 0.23 builds an HTTP client at startup and panics in the sandbox without a CA bundle.
  runtimeEnv.SSL_CERT_FILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";
  text = ''
    exec python3 ${./test_site.py} "$@"
  '';
}
