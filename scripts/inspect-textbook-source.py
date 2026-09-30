#!/usr/bin/env python3
"""Read-only, compact MusicXML transcription indexed by original PDF page."""
import argparse
import json
from pathlib import Path
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument("material")
parser.add_argument("--page", type=int)
args = parser.parse_args()
catalog = json.loads(Path("public/materials/catalog.json").read_text())
for material in catalog["materials"]:
    if material["id"] != args.material:
        continue
    for segment in material["segments"]:
        if args.page and args.page not in segment["source_pages"]:
            continue
        root = ET.parse(Path("public") / segment["musicxml_url"].lstrip("/")).getroot()
        print("\n" + segment["id"])
        for part in root.findall("part"):
            page_index, system, divisions = 0, 1, 1
            for index, measure in enumerate(part.findall("measure")):
                layout = measure.find("print")
                if layout is not None:
                    if layout.get("new-page") == "yes":
                        page_index += 1
                        system = 1
                    elif layout.get("new-system") == "yes":
                        system += 1
                page = segment["source_pages"][min(page_index, len(segment["source_pages"]) - 1)]
                divisions = float(measure.findtext("attributes/divisions", str(divisions))) or divisions
                if args.page and page != args.page:
                    continue
                tokens = []
                for node in measure:
                    if node.tag in ("backup", "forward"):
                        tokens.append(f"{node.tag}:{float(node.findtext('duration', '0')) / divisions:g}")
                    elif node.tag == "note":
                        pitch = node.find("pitch")
                        name = "R" if pitch is None else (
                            pitch.findtext("step", "") +
                            {"1": "#", "-1": "b"}.get(pitch.findtext("alter", ""), "") +
                            pitch.findtext("octave", ""))
                        duration = float(node.findtext("duration", "0")) / divisions
                        finger = ",".join(n.text or "" for n in node.findall("notations/technical/fingering"))
                        tokens.append(
                            f"{'+' if node.find('chord') is not None else ''}{name}/{duration:g}"
                            f"[s{node.findtext('staff', '1')}v{node.findtext('voice', '1')}]"
                            f"{'f'+finger if finger else ''}"
                            f"{'HIDDEN' if node.get('print-object') == 'no' else ''}")
                time = measure.find("attributes/time")
                meter = "" if time is None else f" {time.findtext('beats')}/{time.findtext('beat-type')}"
                print(f"p{page} sys{system} {part.get('id')} #{index+1} m{measure.get('number')}{meter}: " + " ".join(tokens))
