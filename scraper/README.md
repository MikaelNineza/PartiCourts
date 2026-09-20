# PartiCourts scraper

Python replacement for the original `PrepareData` project.

It fetches court and judge data, calculates court summaries, and writes a JSON snapshot. Database storage is intentionally not included yet; the snapshot is the boundary where a future PostgreSQL repository can be added.

## Run

From the repository root:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -e scraper
python -m scraper --output data/courts.json
```

Use `--skip-retirements` to omit the additional U.S. Courts request while developing.