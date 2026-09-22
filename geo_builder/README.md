# PartiCourts GeoJSON builder

Builds the webapp's usable GeoJSON files from a scraper JSON snapshot and boundary files.

From the repository root:

```bash
. .venv/bin/activate
python -m geo_builder \
  --snapshot data/courts.json \
  --district-boundaries boundaries/dc_boundaries.geojson \
  --circuit-boundaries boundaries/cc_boundaries.geojson
```

The default output is `webapp/public/sources/`.