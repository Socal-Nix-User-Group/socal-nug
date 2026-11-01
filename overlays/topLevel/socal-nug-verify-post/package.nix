{ writers, python3Packages }:
(writers.writePython3Bin "socal-nug-verify-post" {
  libraries = with python3Packages; [
    click
    jsonschema
  ];
} (builtins.readFile ./verify_post.py)).overrideAttrs
  (_: {
    # The schemas the content is validated against; checks reference them from here.
    passthru.schemas = ./schemas;
  })
