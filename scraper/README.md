# Scraper

Collects data on U.S. federal circuit and district courts and writes it to a single JSON snapshot. This is the first stage of the PartiCourts pipeline. The snapshot is read by [`geo_builder`](../geo_builder/README.md).

## What it collects

- **Courts and judges**, from Wikipedia: each court's name, number of seats, chief judge, and every judge with their birth year, appointment year, and the president who appointed them.
- **Retiring judges**, from the U.S. Courts judicial vacancies page (uscourts.gov): judges who have announced they are leaving.

From that it works out, for each court:

- **Partisanship of each judge**, based on the party of the appointing president (Democratic or Republican).
- **Vacancies**, calculated as the court's authorized number of seats minus the judges currently listed.
- **Senior-eligible judges**, meaning judges who could take senior status under the "Rule of 80" (at least 65 years old, with age plus years of service of at least 80).
- **Retirements** by party of the appointing president.

## Run it

You need Python 3.12 or newer. From the repository root:

```bash
python3 -m venv .venv
. .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -e scraper
python -m scraper --output data/courts.json
```

It makes live requests to Wikipedia and uscourts.gov, so it needs an internet connection and takes a little while.

| Option | Default | What it does |
| --- | --- | --- |
| `--output` | `data/courts.json` | Where to write the snapshot |
| `--skip-retirements` | off | Skip the uscourts.gov request, useful while developing |

## Output

A JSON file with a `generated_at` timestamp and a list of `courts`. Each court has its judges nested inside it. The shapes are defined in [models.py](models.py).

## How it is organized

| File | Purpose |
| --- | --- |
| [pipeline.py](pipeline.py) | Runs the whole collection and writes the snapshot |
| [wikipedia.py](wikipedia.py) | Fetches and parses courts and judges from Wikipedia |
| [government.py](government.py) | Fetches retiring judges from uscourts.gov and matches them to judges by name |
| [classification.py](classification.py) | Maps presidents to parties and applies the senior-eligibility rule |
| [models.py](models.py) | Court and judge data structures |

## Things to know

- The scraper reads the HTML of other people's pages, so a layout change on Wikipedia or uscourts.gov can break it.
- A judge appointed by a president who is not listed in [classification.py](classification.py) makes the run fail with an "Unrecognized appointing president" error. When a new president starts appointing judges, add them to that file.
- Retirements are matched to judges by name, so a name written differently on the two sites will be missed.
