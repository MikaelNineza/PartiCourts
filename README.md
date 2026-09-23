# PartiCourts 🌐⚖️ 

An interactive map of U.S. federal district and circuit courts: partisan balance, open vacancies, and judges nearing retirement, all in one view.

**Live at [particourts.org](https://particourts.org)**

## How it's built

- **`scraper/`**: pulls court and judge data from Wikipedia and uscourts.gov into a JSON snapshot.
- **`geo_builder/`**: joins that snapshot onto court boundary shapes to produce the GeoJSON the map reads.
- **`webapp/`**: Vite + React + Leaflet frontend that renders the map.
- **`boundaries/`**: raw district/circuit boundary GeoJSON, the input to `geo_builder`.
- **`data/`**: the scraper's generated snapshot (`courts.json`).
- **`lambda_function.py`**: AWS Lambda entry point that runs the scraper and geo_builder against S3 instead of local files.
- **`scripts/build_lambda_package.sh`**: builds the Lambda deployment zip.

Data flows one way. The scraper produces `data/courts.json`, then `geo_builder` combines it with `boundaries/` to produce `webapp/public/sources/*.geojson`, which the webapp reads to draw the map.

## Running it locally

### 1. Scrape court data

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -e scraper
python -m scraper --output data/courts.json
```

### 2. Build the map GeoJSON

`geo_builder` has no external dependencies, so no install is needed. Just run it from the repo root:

```bash
python -m geo_builder \
  --snapshot data/courts.json \
  --district-boundaries boundaries/dc_boundaries.geojson \
  --circuit-boundaries boundaries/cc_boundaries.geojson
```

### 3. Run the webapp

```bash
cd webapp
npm install
npm run dev
```

## Deployment

Pushing to `main` builds the webapp and deploys it to S3 + CloudFront, via `.github/workflows/deploy.yml`.

The scraper and geo_builder run separately, on AWS: an EventBridge schedule invokes a Lambda function (`lambda_function.py`) monthly, which reads the boundary files from S3, runs the scraper and geo_builder in memory, and writes the resulting snapshot and GeoJSON back to S3. The webapp and the data share the same S3 bucket and CloudFront distribution, so `/sources/*.geojson` resolves to whatever the Lambda last wrote. A CloudWatch alarm notifies on Lambda failures.

The `static` branch's GitHub Pages workflow is no longer active; it's kept around for history.
