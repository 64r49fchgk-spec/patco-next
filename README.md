# PATCO Next Train

A static, mobile-friendly PATCO next-train web app for GitHub Pages.

It shows:

- your nearest PATCO station
- straight-line distance to that station
- estimated walking time at 3 mph
- next 2 trains toward Philadelphia / 8th & Market
- next 2 trains toward Lindenwold
- a color indicator based on walking-time buffer

## How it works

This app has no backend. It runs entirely in the browser.

1. PATCO GTFS schedule data is converted into `data/schedule.json`.
2. GitHub Pages serves `index.html`, `app.js`, `styles.css`, and `data/schedule.json` over HTTPS.
3. The phone browser gets your location with `navigator.geolocation`.
4. JavaScript calculates the nearest station and next scheduled trains.

This uses static schedule data only. It does **not** include live delays, real-time train positions, or special schedules.

## Project structure

```text
patco-next/
  index.html
  app.js
  styles.css
  data/
    schedule.json
  tools/
    convert_gtfs_to_json.py
  README.md
```

## Get PATCO GTFS data

Download PATCO GTFS schedule data and save the zip file as:

```text
gtfs.zip
```

Place it in the project root, next to `index.html`.

## Convert GTFS to static JSON

From the project root:

```bash
python3 tools/convert_gtfs_to_json.py
```

This creates:

```text
data/schedule.json
```

## Test locally

From the project root:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Location access may be limited on non-HTTPS local network addresses. It should work on GitHub Pages because GitHub Pages uses HTTPS.

## Deploy to GitHub Pages

1. Create a GitHub repo, for example `patco-next`.
2. Commit these files, including `data/schedule.json`.
3. Push to GitHub.
4. In GitHub, go to **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select the `main` branch and `/root` folder.
7. Save.

Your app will be available at something like:

```text
https://YOUR-USERNAME.github.io/patco-next/
```

## Updating the schedule

When PATCO publishes a new GTFS file:

1. Replace `gtfs.zip`.
2. Run:

```bash
python3 tools/convert_gtfs_to_json.py
```

3. Commit and push the updated `data/schedule.json`.

## Color logic

The app calculates:

```text
buffer_minutes = minutes_until_train - walk_minutes
```

Then:

- green: more than 8 minutes of buffer
- yellow: 6 to 8 minutes of buffer
- red: under 6 minutes of buffer
- gray: no upcoming train found
