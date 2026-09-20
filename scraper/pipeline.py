from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

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
    for court in courts:
        court.judges = wikipedia.fetch_judges(court)
        court.senior_eligible_judges = sum(
            judge.year_of_birth is not None
            and judge.appointment_year is not None
            and (datetime.now(UTC).year - judge.year_of_birth)
            >= 65
            and (datetime.now(UTC).year - judge.year_of_birth)
            + (datetime.now(UTC).year - judge.appointment_year)
            >= 80
            for judge in court.judges
        )
    if include_retirements:
        apply_retirements(courts, government.fetch_retiring_names())
    return Snapshot(datetime.now(UTC).isoformat(), courts)


def write_snapshot(snapshot: Snapshot, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(snapshot.to_dict(), indent=2) + "\n", encoding="utf-8")