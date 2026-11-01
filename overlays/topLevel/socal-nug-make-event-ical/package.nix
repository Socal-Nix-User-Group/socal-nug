{ writers, python3Packages }:
writers.writePython3Bin "socal-nug-make-event-ical" {
  libraries = with python3Packages; [
    click
    icalendar
    pytz
  ];
} (builtins.readFile ./make_event_ical.py)
