#!/usr/bin/env python3
"""Schema and consistency checks for the research datasets under facts/data/."""

import json
import sys
from collections import Counter
from pathlib import Path

DATA = Path(__file__).parent / "data"
CULTURAL_CRITERIA = range(1, 7)
NATURAL_CRITERIA = range(7, 11)

errors: list[str] = []
notes: list[str] = []


def check(condition, message):
    if not condition:
        errors.append(message)


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def check_sites(sites, label, region_key):
    ids = Counter(s["id"] for s in sites)
    for site_id, n in ids.items():
        check(n == 1, f"{label}: duplicate id {site_id}")

    for s in sites:
        sid = s["id"]
        check(bool(s.get("name_ja")), f"{label}: {sid} has no name_ja")
        check(s["type"] in ("cultural", "natural", "mixed"), f"{label}: {sid} invalid type {s['type']}")
        check(bool(s.get(region_key)), f"{label}: {sid} has no {region_key}")

        criteria = s.get("criteria") or []
        check(bool(criteria), f"{label}: {sid} has no criteria")
        check(all(c in range(1, 11) for c in criteria), f"{label}: {sid} criteria out of range {criteria}")
        check(len(set(criteria)) == len(criteria), f"{label}: {sid} duplicate criteria {criteria}")

        if s["type"] == "cultural":
            check(all(c in CULTURAL_CRITERIA for c in criteria),
                  f"{label}: {sid} is cultural but has a natural criterion {criteria}")
        elif s["type"] == "natural":
            check(all(c in NATURAL_CRITERIA for c in criteria),
                  f"{label}: {sid} is natural but has a cultural criterion {criteria}")
        else:
            check(any(c in CULTURAL_CRITERIA for c in criteria) and any(c in NATURAL_CRITERIA for c in criteria),
                  f"{label}: {sid} is mixed but criteria are not mixed {criteria}")

        year = s.get("registration_year")
        check(isinstance(year, int) and 1978 <= year <= 2030, f"{label}: {sid} implausible year {year}")


japan = load("japan-sites.json")
world = load("world-sites-candidates.json")
config = load("exam-config.json")

check_sites(japan, "japan", "prefectures")
check_sites([s for s in world if not s.get("delisted")], "world", "country_ja")

check(len(japan) == config["scope"]["japan_sites_count"],
      f"japan count {len(japan)} does not match exam-config scope {config['scope']['japan_sites_count']}")

types = Counter(s["type"] for s in japan)
check(types["cultural"] == 22 and types["natural"] == 5,
      f"japan type split {dict(types)} does not match the UNESCO figure (cultural 22 / natural 5)")

ratios = sum(c["ratio"] for c in config["categories"])
check(abs(ratios - 1.0) < 1e-9, f"exam-config category ratios sum to {ratios}, not 1.0")

questions = sum(c["questions_estimate"] for c in config["categories"])
check(questions == config["total_questions"],
      f"category question estimates sum to {questions}, not {config['total_questions']}")

# region_jp is a single string, but two sites span several regions.
multi_region = [s["id"] for s in japan if "・" in s["region_jp"] and len(s["prefectures"]) > 2]
if multi_region:
    notes.append(f"region_jp holds a composite string for {multi_region}; "
                 "normalise to a list before using it for region-based questions")

print(f"japan sites          : {len(japan)} ({dict(types)})")
print(f"world candidates     : {len([s for s in world if not s.get('delisted')])} active, "
      f"{len([s for s in world if s.get('delisted')])} delisted")
print(f"category ratios      : {ratios}")
print(f"question estimates   : {questions}")

for note in notes:
    print(f"NOTE  {note}")
for error in errors:
    print(f"ERROR {error}")

sys.exit(1 if errors else 0)
