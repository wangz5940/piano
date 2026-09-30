#!/usr/bin/env python3
"""Compare reviewed PDF transcription tokens with the downstream score document."""
import argparse
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--output", required=True)
parser.add_argument("--live", action="store_true", help="Verify written public assets instead of staged assets")
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
output = root / args.output
report = json.loads((output / "report.json").read_text())
checked = notes = measures = 0


def read_source(path):
    source = json.loads(path.read_text())
    if "files" in source:
        fragments = [read_source(path.parent / file) for file in source["files"]]
        source["sections"] = [section for fragment in fragments for section in fragment["sections"]]
    return source


for result in report["results"]:
    source_path = root / "scripts/textbook-transcriptions" / f"{result['id']}.json"
    assert source_path.exists(), f"Missing PDF transcription: {result['id']}"
    source = read_source(source_path)
    material, sequence = result["id"].split(".segment.")
    public = root / "public" if args.live else output / "staged/public"
    project = json.loads((public / "materials/calibration" /
                          material / f"{sequence}.json").read_text())["project"]
    expected_bars = [(section, bar) for section in source["sections"]
                     for line in section["lines"] for bar in line]
    assert len(expected_bars) == len(project["document"]["measures"]), result["id"]
    previous_section = None
    clefs = {}
    for number, ((section, bar), measure) in enumerate(
            zip(expected_bars, project["document"]["measures"]), 1):
        label = f"{result['id']} PDF{section['page']} bar {number}"
        if section is not previous_section:
            clefs = {"right": section.get("right_clef", "treble"),
                     "left": section.get("left_clef", "bass")}
            previous_section = section
        for hand in clefs:
            clefs[hand] = bar.get(f"{hand}_clef", clefs[hand])
        expected_meter = dict(zip(("beats", "beat_unit"), section["meter"]))
        if section.get("unmetered"):
            expected_meter.update(unmetered=True, beats=bar["quarters"])
        assert measure["meter"] == expected_meter, label
        expected = []
        voices = [(hand, bar.get(hand, "")) for hand in ("right", "left")]
        voices += [("right" if voice["staff"] == 1 else "left", voice["notes"])
                   for voice in bar.get("voices", [])]
        for hand, text in voices:
            onset = 0
            for token in text.split():
                if token in ("@bass", "@treble"):
                    clefs[hand] = token[1:]
                    continue
                base, *marks = re.split(r"([~!^])", token)
                fields = base.split("/")
                # Transcription durations use quarters; ScoreDocument beats
                # use the denominator of the measure's written time signature.
                pitch = fields[0]
                triplet = fields[1].endswith("t")
                grace = fields[1].endswith("g")
                written = float(fields[1].rstrip("tg"))
                duration = 0 if grace else written * (2 / 3 if triplet else 1) * section["meter"][1] / 4
                annotation = dict(zip(marks[::2], marks[1::2]))
                annotation["clef"] = clefs[hand]
                if grace:
                    annotation["grace"] = {"slash": True, "written_quarters": written}
                fingers = fields[2].split(",") if len(fields) > 2 else []
                if pitch != "s":
                    midis = []
                    for spelling in [] if pitch in ("r", "R") else pitch.split("+"):
                        letter, accidental, octave = re.fullmatch(
                            r"([A-G])([#bn]?)(-?\d)", spelling).groups()
                        midi = (int(octave) + 1) * 12 + {
                            "C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11,
                        }[letter] + {"": 0, "n": 0, "#": 1, "b": -1}[accidental]
                        midis.append(midi)
                    expected.append((hand, onset, duration, midis, fingers, annotation))
                onset += duration
        actual = measure["events"]
        assert len(expected) == len(actual), (label, len(expected), len(actual))
        for hand, onset, duration, midis, fingers, annotation in expected:
            matches = [event for event in actual if event["hand"] == hand
                       and abs(event["onset_beats"] - onset) < 1e-8
                       and abs(event["duration_beats"] - duration) < 1e-8
                       and [note["midi"] for note in event["notes"]] == midis]
            assert len(matches) == 1, (label, hand, onset)
            event = matches[0]
            metadata = project["event_metadata"][event["id"]]
            assert abs(event["duration_beats"] - duration) < 1e-8, (label, event)
            assert [note["midi"] for note in event["notes"]] == midis, (label, midis, event)
            if fingers:
                assert [note.get("finger") for note in event["notes"]] == list(map(int, fingers)), label
            assert metadata["source_page"] == section["page"], label
            assert metadata["clef"] == annotation["clef"], (label, metadata["clef"], annotation["clef"])
            assert event.get("tie", "none") == annotation.get("~", "none"), label
            assert event.get("grace") == annotation.get("grace"), label
            if "^" in annotation:
                assert metadata["slur"] == annotation["^"], label
            if "!" in annotation:
                mark = annotation["!"]
                assert (metadata.get("fermata") == "upright" if mark == "fermata"
                        else metadata["articulation"] == mark), (label, mark, metadata)
            notes += len(midis)
        measures += 1
    checked += 1
assert checked, "No reviewed transcriptions found in this output"
print(f"Verified PDF transcriptions: {checked} segments, {measures} bars, {notes} notes; "
      "pitch, rhythm, rests, hands, printed fingers, ties, slurs, articulation and source pages.")
