{
  writeShellApplication,
  imagemagick,
  potrace,
  python3,
}:
writeShellApplication {
  name = "socal-nug-logos";
  runtimeInputs = [
    imagemagick
    potrace
    python3
  ];
  # String interpolation copies the files into the store; a bare path would stringify to the
  # repository path, which does not exist where the wrapper runs.
  runtimeEnv = {
    artwork = "${./artwork/gateway-cities.png}";
    compose = "${./compose.py}";
  };
  text = builtins.readFile ./build.sh;
}
