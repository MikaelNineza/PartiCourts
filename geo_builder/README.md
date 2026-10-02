# GeoJSON builder

Turns the scraper's snapshot into the map files the web app draws. This is the second stage of the PartiCourts pipeline. It takes the output of [`scraper`](../scraper/README.md) and the court boundary shapes in [`boundaries/`](../boundaries) and produces one GeoJSON file for district courts and one for circuit courts.

## Run it

You need Python 3.12 or newer. It has no dependencies, so there is nothing to install. From the repository root:

```bash
python -m geo_builder \
  --snapshot data/courts.json \
  --district-boundaries boundaries/dc_boundaries.geojson \
  --circuit-boundaries boundaries/cc_boundaries.geojson
```

This writes `dc_usable.geojson` and `cc_usable.geojson` to `webapp/public/sources/`, which is where the web app loads them from during local development.

| Option | Default | What it does |
| --- | --- | --- |
| `--snapshot` | required | The JSON file produced by the scraper |
| `--district-boundaries` | required | District court boundary GeoJSON |
| `--circuit-boundaries` | required | Circuit court boundary GeoJSON |
| `--output-directory` | `webapp/public/sources` | Where to write the finished files |
| `--allow-unmatched` | off | Skip boundary shapes with no matching court instead of failing |

## What it does

For each shape in a boundary file, it finds the matching court in the snapshot by name and copies the court's numbers onto the shape as properties: chief judge, supervising justice (circuit courts), active judges, senior-eligible judges, vacancies, Democratic and Republican judge counts, the overall partisanship, and Democratic and Republican retirements. It also carries over the snapshot's `generated_at` date, which the web app shows as "Data as of."

Names are normalized before matching, so differences like "1st" and "First" or stray periods do not cause misses.

## Things to know

- By default the run fails if any boundary shape has no matching court. This is on purpose, so a naming mismatch cannot silently leave a court blank on the map. Use `--allow-unmatched` only when you want to skip them.
- If a court has no chief judge recorded, the builder uses the judge marked as chief in that court's list.
- The code is in [builder.py](builder.py).
