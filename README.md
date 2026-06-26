# Get Back on The Train

A lightweight, mobile-first web application that helps you decide whether it's worth leaving for the PATCO station right now.

Unlike a traditional schedule viewer, **Get Back on The Train** combines your current location, estimated walking time, and the official PATCO schedule to show how much time you'll have before your train departs.

The application runs entirely in your browser—no backend server, database, or API is required.

---

## Features

- Automatically determines your nearest PATCO station using your device's location.
- Displays the next scheduled train toward Philadelphia (8th & Market).
- Displays the next scheduled train toward Lindenwold.
- Displays the following scheduled train in each direction.
- Calculates straight-line distance to the nearest station.
- Estimates walking time using a 3 mph walking speed.
- Calculates your arrival buffer before departure.
- Color-codes departures:
  - **Green:** 5–10 minutes of waiting after arrival (ideal)
  - **Yellow:** Less than 5 minutes of waiting (hurry)
  - **Red:** More than 10 minutes of waiting or the train cannot reasonably be made
- Automatically selects the correct PATCO schedule based on:
  - Weekday
  - Saturday
  - Sunday
  - Published GTFS calendar exceptions (holidays and other scheduled service changes)
- Displays the active GTFS service IDs used for the current calculation.
- Refreshes automatically every 30 seconds.
- Mobile-first interface designed for adding to an iPhone Home Screen.
- Runs entirely as a static site on GitHub Pages.

---

## Data Source

This application uses the publicly available PATCO GTFS schedule feed.

The schedule is converted into a lightweight JSON file that is downloaded by the browser. All train calculations occur locally on the user's device.

No trip information or location data is transmitted to any server.

---

## Updating Schedule Data

The repository includes a GitHub Actions workflow that periodically checks the official PATCO GTFS feed.

When the published GTFS feed changes, the workflow:

1. Downloads the latest GTFS feed.
2. Compares it against the last stored feed hash.
3. Regenerates the application's `data/schedule.json`.
4. Updates `data/gtfs-feed.sha256`.
5. Commits the updated schedule with a descriptive commit message that includes the workflow run date, feed hash, and current schedule JSON date.
6. Automatically redeploys the GitHub Pages site.

If the feed has not changed, the workflow exits without committing anything.

**Note:** The application displays scheduled service only. It does not incorporate live train delays, service disruptions, or real-time vehicle locations.

---

## Local Development

Download the PATCO GTFS feed and save it as:

```text
gtfs.zip
```

Place `gtfs.zip` in the project root.

Convert the GTFS feed into the browser-friendly schedule:

```bash
python3 tools/convert_gtfs_to_json.py
```

Run a local web server:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

---

## Deployment

This project is designed for GitHub Pages.

After committing changes:

```bash
git add .
git commit -m "Describe your change"
git push
```

GitHub Pages automatically deploys the latest version.

---

## Technology

- HTML5
- CSS3
- Vanilla JavaScript
- GitHub Pages
- GitHub Actions
- PATCO GTFS Schedule Feed

---

## Acknowledgements

This project uses the publicly available PATCO GTFS schedule feed provided by the Delaware River Port Authority (DRPA). Schedule data is used solely to calculate upcoming trains in this static, browser-based application.

This project is not affiliated with, sponsored by, or endorsed by PATCO or the Delaware River Port Authority.
