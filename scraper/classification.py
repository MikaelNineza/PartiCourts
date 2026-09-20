from datetime import date

DEMOCRATIC_APPOINTING_PRESIDENTS = {"Clinton", "Obama", "Biden"}
REPUBLICAN_APPOINTING_PRESIDENTS = {"Reagan", "G.H.W. Bush", "G.W. Bush", "Trump"}


def normalize_president(value: str) -> str:
    return value.split("/")[0].strip()


def classify_president(value: str) -> int:
    president = normalize_president(value)
    if president in DEMOCRATIC_APPOINTING_PRESIDENTS:
        return 1
    if president in REPUBLICAN_APPOINTING_PRESIDENTS:
        return -1
    raise ValueError(f"Unrecognized appointing president: {value!r}")


def is_senior_eligible(
    year_of_birth: int | None,
    appointment_year: int | None,
    as_of_year: int | None = None,
) -> bool:
    if year_of_birth is None or appointment_year is None:
        return False
    current_year = as_of_year or date.today().year
    age = current_year - year_of_birth
    years_of_service = current_year - appointment_year
    return age >= 65 and age + years_of_service >= 80