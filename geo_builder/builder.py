from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

OUTPUT_PROPERTIES = (
    "CHIEF_JUDGE",
    "ACTIVE_JUDGES",
    "SENIOR_ELIGIBLE_JUDGES",
    "VACANCIES",
    "DEMJUDGES",
    "GOPJUDGES",
    "PARTISANSHIP",
    "DEMRETIRING",
    "GOPRETIRING",
)


CIRCUIT_NAME_ALIASES = {
    "1ST": "FIRST",
    "2ND": "SECOND",
    "3RD": "THIRD",
    "4TH": "FOURTH",
    "5TH": "FIFTH",
    "6TH": "SIXTH",
    "7TH": "SEVENTH",
    "8TH": "EIGHTH",
    "9TH": "NINTH",
    "10TH": "TENTH",
    "11TH": "ELEVENTH",
    "DC": "DISTRICT OF COLUMBIA",
}


def _normal_name(value: Any) -> str:
    normalized = " ".join(str(value or "").upper().replace(".", "").split())
    first_word, separator, rest = normalized.partition(" ")
    alias = CIRCUIT_NAME_ALIASES.get(first_word)
    return f"{alias}{separator}{rest}" if alias else normalized


def _court_properties(court: dict[str, Any], boundary_name: str) -> dict[str, Any]:
    return {
        "NAME": boundary_name,
        "CHIEF_JUDGE": court.get("chief_judge", ""),
        "ACTIVE_JUDGES": court.get("active_judges", 0),
        "SENIOR_ELIGIBLE_JUDGES": court.get("senior_eligible_judges", 0),
        "VACANCIES": court.get("vacancies", 0),
        "DEMJUDGES": court.get("dem_judges", 0),
        "GOPJUDGES": court.get("gop_judges", 0),
        "PARTISANSHIP": court.get("partisanship", 0),
        "DEMRETIRING": court.get("dem_retiring", 0),
        "GOPRETIRING": court.get("gop_retiring", 0),
    }


def build_geojson(
    boundaries: dict[str, Any],
    courts: Iterable[dict[str, Any]],
    court_type: str,
    *,
    generated_at: str | None = None,
    strict: bool = True,
) -> dict[str, Any]:
    if court_type not in ("district", "circuit"):
        raise ValueError(f"Unsupported court type: {court_type!r}")

    court_list = list(courts)
    by_name = {_normal_name(court.get("name")): court for court in court_list}
    features = []
    unmatched: list[str] = []

    for feature in boundaries.get("features", []):
        source_properties = feature.get("properties") or {}
        boundary_name = str(source_properties.get("NAME", ""))
        court = by_name.get(_normal_name(boundary_name))
        properties = _court_properties(court or {}, boundary_name)

        if court is None:
            unmatched.append(boundary_name)
            continue
        features.append(
            {
                "type": feature.get("type", "Feature"),
                "properties": properties,
                "geometry": feature.get("geometry"),
            }
        )

    if strict and unmatched:
        raise ValueError(f"No court data matched: {', '.join(unmatched)}")

    return {
        "type": boundaries.get("type", "FeatureCollection"),
        "name": "dcourts" if court_type == "district" else "ccourts",
        "crs": boundaries.get("crs"),
        "generated_at": generated_at,
        "features": features,
    }


def build_from_snapshot(
    snapshot_path: Path,
    district_boundaries_path: Path,
    circuit_boundaries_path: Path,
    output_directory: Path,
    *,
    strict: bool = True,
) -> tuple[Path, Path]:
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    courts = snapshot["courts"]
    generated_at = snapshot.get("generated_at")
    district_boundaries = json.loads(district_boundaries_path.read_text(encoding="utf-8"))
    circuit_boundaries = json.loads(circuit_boundaries_path.read_text(encoding="utf-8"))
    output_directory.mkdir(parents=True, exist_ok=True)

    outputs = (
        output_directory / "dc_usable.geojson",
        output_directory / "cc_usable.geojson",
    )
    district_courts = [court for court in courts if not court.get("is_circuit")]
    circuit_courts = [court for court in courts if court.get("is_circuit")]
    output_data = (
        build_geojson(district_boundaries, district_courts, "district", generated_at=generated_at, strict=strict),
        build_geojson(circuit_boundaries, circuit_courts, "circuit", generated_at=generated_at, strict=strict),
    )
    for output_path, data in zip(outputs, output_data):
        output_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return outputs