from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

from .classification import is_senior_eligible
from .government import GovernmentClient, apply_retirements
from .models import Court
from .wikipedia import WikipediaClient


@dataclass
class Snapshot:
    generated_at: str
    courts: list[Court]

    def to_dict(self) -> dict:
        return {
            "generated_at": self.generated_at,
            "courts": [court.to_dict() for court in self.courts],
        }


def collect_snapshot(
    wikipedia: WikipediaClient | None = None,
    government: GovernmentClient | None = None,
    include_retirements: bool = True,
) -> Snapshot:
    wikipedia = wikipedia or WikipediaClient()
    government = government or GovernmentClient()
    courts = wikipedia.fetch_circuit_courts() + wikipedia.fetch_district_courts()
    current_year = datetime.now(UTC).year
    with ThreadPoolExecutor(max_workers=8) as executor:
        judges_by_court = executor.map(wikipedia.fetch_judges, courts)
    for court, judges in zip(courts, judges_by_court):
        court.judges = judges
        court.senior_eligible_judges = sum(
            is_senior_eligible(judge.year_of_birth, judge.appointment_year, current_year)
            for judge in court.judges
        )
    if include_retirements:
        apply_retirements(courts, government.fetch_retiring_names())
    return Snapshot(datetime.now(UTC).isoformat(), courts)


def write_snapshot(snapshot: Snapshot, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(snapshot.to_dict(), indent=2) + "\n", encoding="utf-8")