from dataclasses import asdict, dataclass, field
from functools import cached_property
from typing import Any


@dataclass
class Judge:
    name: str
    is_circuit: bool
    court_id: int
    title: str = ""
    appointed_by: str = ""
    year_of_birth: int | None = None
    appointment_year: int | None = None
    is_chief: bool = False
    is_retiring: bool = False
    partisanship: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Court:
    id: int
    name: str
    is_circuit: bool
    max_judges: int
    abbreviation: str = ""
    court_of_appeal: int | None = None
    supervising_justice: str = ""
    chief_judge: str = ""
    judges: list[Judge] = field(default_factory=list)
    senior_eligible_judges: int = 0
    dem_retiring: int = 0
    gop_retiring: int = 0

    @property
    def active_judges(self) -> int:
        return len(self.judges)

    @property
    def vacancies(self) -> int:
        return max(self.max_judges - self.active_judges, 0)

    @cached_property
    def _partisan_counts(self) -> tuple[int, int]:
        dem_count = gop_count = 0
        for judge in self.judges:
            if judge.partisanship == 1:
                dem_count += 1
            elif judge.partisanship == -1:
                gop_count += 1
        return dem_count, gop_count

    @property
    def democratic_judges(self) -> int:
        return self._partisan_counts[0]

    @property
    def republican_judges(self) -> int:
        return self._partisan_counts[1]

    @property
    def partisanship(self) -> int:
        if self.democratic_judges > self.republican_judges:
            return 1
        if self.republican_judges > self.democratic_judges:
            return -1
        return 0

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result.update(
            active_judges=self.active_judges,
            vacancies=self.vacancies,
            dem_judges=self.democratic_judges,
            gop_judges=self.republican_judges,
            partisanship=self.partisanship,
            judges=[judge.to_dict() for judge in self.judges],
        )
        return result