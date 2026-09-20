from __future__ import annotations

import re
from dataclasses import dataclass

import httpx
from bs4 import BeautifulSoup

from .models import Court

VACANCIES_URL = "https://www.uscourts.gov/data-news/judicial-vacancies/current-judicial-vacancies"


@dataclass
class GovernmentClient:
    timeout: float = 30.0

    def fetch_retiring_names(self) -> set[str]:
        response = httpx.get(
            VACANCIES_URL,
            headers={"User-Agent": "PartiCourts/0.1 (data research project)"},
            timeout=self.timeout,
        )
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        names: set[str] = set()
        for row in soup.select("table tbody tr"):
            cells = row.select("td")
            if len(cells) >= 2:
                names.add(_normalize_name(cells[1].get_text(" ", strip=True)))
        return names


def _normalize_name(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    if "," not in value:
        return value
    last_name, first_name = (part.strip() for part in value.split(",", 1))
    return f"{first_name} {last_name}"


def apply_retirements(courts: list[Court], retiring_names: set[str]) -> None:
    normalized_names = {_normalize_name(name) for name in retiring_names}
    for court in courts:
        for judge in court.judges:
            judge.is_retiring = _normalize_name(judge.name) in normalized_names
        court.dem_retiring = sum(
            judge.is_retiring and judge.partisanship == 1 for judge in court.judges
        )
        court.gop_retiring = sum(
            judge.is_retiring and judge.partisanship == -1 for judge in court.judges
        )