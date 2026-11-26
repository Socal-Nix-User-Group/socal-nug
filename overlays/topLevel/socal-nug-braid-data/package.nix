{ writers, python3Packages }:
writers.writePython3Bin "socal-nug-braid-data" {
  libraries = with python3Packages; [
    click
  ];
} (builtins.readFile ./verify_moments.py)
