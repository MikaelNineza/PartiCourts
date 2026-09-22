from __future__ import annotations

import time
from dataclasses import dataclass, field
from urllib.parse import quote

import httpx
from bs4 import BeautifulSoup, Tag

from .classification import classify_president
from .models import Court, Judge

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
TERRITORIAL_COURTS = {
    "District of Guam",
    "District of the Northern Mariana Islands",
    "District of the Virgin Islands",
}
MAX_RETRIES = 3
REQUEST_DELAY = 1.0
CIRCUIT_ORDINAL_WORDS = {
    "1st": "First",
    "2nd": "Second",
    "3rd": "Third",
    "4th": "Fourth",
    "5th": "Fifth",
    "6th": "Sixth",
    "7th": "Seventh",
    "8th": "Eighth",
    "9th": "Ninth",
    "10th": "Tenth",
    "11th": "Eleventh",
}


def _text(cell: Tag | None) -> str:
    return " ".join(cell.stripped_strings) if cell else ""


def _integer(value: str) -> int | None:
    digits = "".join(character for character in value if character.isdigit())
    return int(digits) if digits else None


def _tables(html: str) -> list[Tag]:
    return BeautifulSoup(html, "html.parser").select("table.sortable")


@dataclass
class WikipediaClient:
    timeout: float = 30.0
    _client: httpx.Client = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._client = httpx.Client(
            headers={"User-Agent": "PartiCourts/0.1 (https://github.com/MikaelNineza/PartiCourts)"},
            timeout=self.timeout,
        )

    def fetch_page_html(self, page_name: str) -> str:
        params = {
            "action": "parse",
            "page": quote(page_name),
            "format": "json",
            "prop": "text",
            "redirects": 1,
        }
        response = self._client.get(WIKIPEDIA_API, params=params)
        for attempt in range(MAX_RETRIES):
            if response.status_code != 429:
                break
            retry_after = int(response.headers.get("Retry-After", "10"))
            time.sleep(min(max(retry_after, 1), 60) * (attempt + 1))
            response = self._client.get(WIKIPEDIA_API, params=params)
        response.raise_for_status()
        time.sleep(REQUEST_DELAY)
        return response.json()["parse"]["text"]["*"]

    def fetch_circuit_courts(self) -> list[Court]:
        tables = _tables(self.fetch_page_html("United_States_courts_of_appeals"))
        rows = tables[0].select("tbody tr")[1:-2]
        courts = []
        for court_id, row in enumerate(rows):
            cells = row.select("td")
            if len(cells) < 3:
                continue
            courts.append(
                Court(
                    id=court_id,
                    name=_text(cells[0]),
                    supervising_justice=_text(cells[1]),
                    max_judges=_integer(_text(cells[2])) or 0,
                    is_circuit=True,
                )
            )
        return courts

    def fetch_district_courts(self) -> list[Court]:
        tables = _tables(self.fetch_page_html("List_of_United_States_district_and_territorial_courts"))
        rows = tables[0].select("tbody tr")[1:]
        courts = []
        for row in rows:
            cells = row.select("td")
            if len(cells) < 8:
                continue
            name = _text(cells[0])
            if name in TERRITORIAL_COURTS:
                continue
            courts.append(
                Court(
                    id=len(courts) + 1,
                    name=name,
                    abbreviation=_text(cells[1]),
                    court_of_appeal=_integer(_text(cells[2])),
                    max_judges=_integer(_text(cells[4])) or 0,
                    chief_judge=_text(cells[7]),
                    is_circuit=False,
                )
            )
        return courts

    def fetch_judges(self, court: Court) -> list[Judge]:
        if court.is_circuit:
            ordinal, _, rest = court.name.partition(" ")
            circuit_name = CIRCUIT_ORDINAL_WORDS.get(ordinal, ordinal) + ((" " + rest) if rest else "")
            page_name = f"United_States_Court_of_Appeals_for_the_{circuit_name.replace(' ', '_')}"
        elif court.name == "District of the District of Columbia":
            page_name = "United_States_District_Court_for_the_District_of_Columbia"
        else:
            page_name = f"United_States_District_Court_for_the_{court.name.replace(' ', '_')}"

        tables = _tables(self.fetch_page_html(page_name))
        table = tables[0]
        rows = table.select("tbody tr")[2:]
        judges = []
        for row in rows:
            cells = row.select("td")
            if len(cells) < 9:
                continue
            title, name, end_date = _text(cells[1]), _text(cells[2]), _text(cells[5])
            if title in {"Senior Judge", "Senior Circuit Judge"} or name.lower() == "vacant":
                continue
            if end_date.lower().startswith("beg"):
                continue
            appointed_by = _text(cells[8])
            judges.append(
                Judge(
                    name=name,
                    is_circuit=court.is_circuit,
                    court_id=court.id,
                    title=title,
                    appointed_by=appointed_by,
                    year_of_birth=_integer(_text(cells[4])),
                    appointment_year=_integer(end_date[:4]),
                    is_chief=title == "Chief Judge",
                    partisanship=classify_president(appointed_by),
                )
            )
        return judges