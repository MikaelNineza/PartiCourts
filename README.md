# PartiCourts

An interactive map of U.S. federal courts that shows, at a glance, which party's presidents appointed the judges on each court, where seats are empty, and where judges are close to retiring.

**Live site: [particourts.org](https://particourts.org)**

## What it does

Federal judges are appointed by the president and serve for life, so the makeup of a court can shift a lot depending on who retires and who gets to fill the seat. That information is public, but it is spread across Wikipedia, government websites, and long tables.

PartiCourts pulls it together and puts it on one map. You pick a type of court (district courts or circuit courts) and a view, and the map colors every court in the country accordingly. Click any court to see its chief judge, number of active judges, open seats, and expected retirements.

The four views are:

| View | What it shows |
| --- | --- |
| Partisanship | Whether a court has more judges appointed by Democratic presidents, Republican presidents, or an even split |
| Vacancies | How many seats on each court are currently empty |
| Retirements | How many judges have announced they are leaving |
| Filled vacancies | What the balance would look like if the sitting president filled every open seat |

## Disclaimer

"Partisanship" here means the party of the president who appointed the judge. It is a rough proxy, not a claim about how any individual judge rules.

This is a personal project I built because I find the subject interesting. I am not drawing conclusions about the courts, the judges, or how the judicial system works, and nothing here should be read as political commentary or legal analysis.

## Why I built it

In 2024 I came across a map on Reddit that colored the federal courts by partisanship. It made me really curious. Some districts were not what I expected, so I spent the rest of that night reading about the history of those courts and trying to work out why they ended up the way they did.

By the end of 2024 I had started building my own version. The first one was a console app, [PartiCourtsConsole](https://github.com/MikaelNineza/PartiCourtsConsole), with the data collection and map file creation written in C# and a website in vanilla JavaScript. I finished it in early 2025.

Then my 16-month internship started and the project went to the back of my mind. When it ended, I was looking through my GitHub profile, found it again, and still thought it was interesting. The old version only showed whatever data I had last collected by hand, so I rewrote it from scratch so it could keep itself up to date. That rewrite is this repo.

It has also become the project I use to learn new tools and technologies. Whenever I want to try something out, I use it here on a real project instead of a throwaway tutorial, which is a big part of why it has changed so much since the first version.

## How it works

The project has three stages, and data only flows one way:

1. **Scraper** (`scraper/`, Python) collects court and judge information from Wikipedia and uscourts.gov and saves it as one JSON file (`data/courts.json`).
2. **GeoJSON builder** (`geo_builder/`, Python) attaches that data to the shapes of each court's territory (`boundaries/`) and writes the map files into `webapp/public/sources/`.
3. **Web app** (`webapp/`, React, Vite, Leaflet) reads those map files and draws the interactive map.

In production, a scheduled AWS Lambda (`lambda_function.py`) runs stages 1 and 2 every month and writes the results to S3, so the live site stays current without anyone touching it. Pushing to `main` rebuilds the web app and deploys it to S3 and CloudFront through GitHub Actions (`.github/workflows/deploy.yml`). A CloudWatch alarm sends a notification if the Lambda fails. Details are in [Deployment](#deployment).

## Running it locally

### Prerequisites

- Python 3.12 or newer
- Node.js 20 or newer (with npm)
- Git

You do not need an AWS account, API keys, or any environment variables. Every path below is relative to the repo root.

### 1. Clone the repo

```bash
git clone https://github.com/MikaelNineza/PartiCourts.git
cd PartiCourts
```

### 2. Run the web app (fastest way to see it working)

The repo already includes pre-built map data, so you can skip straight to this step.

```bash
cd webapp
npm install
npm run dev
```

Open the URL Vite prints, usually <http://localhost:5173>.

### 3. (Optional) Refresh the data yourself

This re-downloads current judge data and rebuilds the map files. It needs an internet connection and takes a little while.

From the repo root:

```bash
python3 -m venv .venv
. .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -e scraper
python -m scraper --output data/courts.json
```

Add `--skip-retirements` to skip the extra uscourts.gov request while developing.

Then build the map files. `geo_builder` has no dependencies, so there is nothing more to install:

```bash
python -m geo_builder \
  --snapshot data/courts.json \
  --district-boundaries boundaries/dc_boundaries.geojson \
  --circuit-boundaries boundaries/cc_boundaries.geojson
```

This overwrites the files in `webapp/public/sources/`. Reload the web app to see the new data.

### 4. (Optional) Build the web app for production

```bash
cd webapp
npm run build      # output goes to webapp/dist
npm run preview    # serves the built version locally
```

## Tests

There is no automated test suite yet (see the to-do list below). Two checks are available today:

```bash
cd webapp
npm run lint       # static analysis of the frontend code
npm run build      # fails if the app does not compile
```

A manual smoke test: start the app with `npm run dev`, then confirm that the map loads, switching between district and circuit courts works, each of the four view modes changes the colors, and clicking a court opens its profile.

## Known issues

- No automated tests. The scraper depends on the layout of Wikipedia and uscourts.gov pages, so a change on either site can break it without any test noticing.
- Retirement data is matched to judges by name, so a name that is written differently on the two sources will be missed.
- On circuit courts, the popup shows "Not reported" for both the chief judge and the supervising justice. The chief judge is blank for every circuit in the scraped data. The supervising justice is scraped correctly but the GeoJSON builder never passes it through to the map files.
- The "Filled vacancies" view assumes the sitting president is Republican. This is a constant in `webapp/src/App.jsx` (`CURRENT_PRESIDENT_PARTY`) and has to be edited by hand after an election.
- The map uses OpenStreetMap's public tile server, which is fine for a small project but not meant for heavy traffic.

## To-do

- [ ] Add tests for the scraper (name matching, senior-eligibility rules, president classification) and the GeoJSON builder
- [ ] Fix the circuit court popup so the chief judge and supervising justice show up
- [ ] Set the current president from data instead of a hard-coded constant
- [ ] Store scraped data in a database instead of a JSON snapshot (the scraper is already structured so one can be added)

## Deployment

Pushing to `main` builds the web app and deploys it to S3 and CloudFront through `.github/workflows/deploy.yml`.

The scraper and GeoJSON builder run separately on AWS. An EventBridge schedule invokes the Lambda function in `lambda_function.py` monthly. It reads the boundary files from S3, runs both stages in memory, and writes the snapshot and GeoJSON back to S3. The web app and the data share one S3 bucket and CloudFront distribution, so `/sources/*.geojson` always resolves to whatever the Lambda last wrote. `scripts/build_lambda_package.sh` builds the Lambda deployment zip.

The `static` branch's GitHub Pages workflow is no longer active. It is kept for history.

## Project layout

| Path | Purpose |
| --- | --- |
| `scraper/` | Pulls court and judge data into a JSON snapshot |
| `geo_builder/` | Joins the snapshot onto court boundary shapes to make the map files |
| `webapp/` | The React map frontend |
| `boundaries/` | Raw district and circuit boundary GeoJSON, the input to `geo_builder` |
| `data/` | The scraper's generated snapshot (`courts.json`) |
| `lambda_function.py` | AWS Lambda entry point |
| `scripts/` | Lambda packaging script |

## License

See [LICENSE](LICENSE).
