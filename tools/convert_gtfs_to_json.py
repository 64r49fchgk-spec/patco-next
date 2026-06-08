#!/usr/bin/env python3
"""Convert a PATCO GTFS zip file into a compact static JSON file for GitHub Pages.

Usage:
    python3 tools/convert_gtfs_to_json.py

Expected input:
    gtfs.zip in the project root

Output:
    data/schedule.json
"""

from __future__ import annotations

import csv
import json
import sys
import zipfile
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
GTFS_ZIP = PROJECT_ROOT / "gtfs.zip"
OUTPUT_JSON = PROJECT_ROOT / "data" / "schedule.json"

REQUIRED_FILES = ["stops.txt", "stop_times.txt", "trips.txt", "calendar.txt"]
OPTIONAL_FILES = ["calendar_dates.txt"]


def read_gtfs_csv(zf: zipfile.ZipFile, filename: str) -> list[dict[str, str]]:
    with zf.open(filename) as raw:
        text = (line.decode("utf-8-sig") for line in raw)
        return list(csv.DictReader(text))


def as_bool(value: str | int | None) -> bool:
    return str(value or "0") == "1"


def to_int(value: str | int | None, default: int = 0) -> int:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return default


def to_float(value: str | float | None) -> float:
    return float(str(value))


def pick_station_stops(stops_rows: list[dict[str, str]], stop_times_rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    """Return one usable stop per station.

    GTFS feeds sometimes contain parent stations plus child platform stops. For this app we need
    displayable stops with coordinates and stop_ids that appear in stop_times. This function uses
    stop_ids from stop_times, then collapses stops with the same parent_station or normalized name.
    """

    used_stop_ids = {row["stop_id"] for row in stop_times_rows if row.get("stop_id")}
    candidates: list[dict[str, Any]] = []

    for row in stops_rows:
        stop_id = row.get("stop_id", "").strip()
        name = row.get("stop_name", "").strip()
        lat = row.get("stop_lat", "").strip()
        lon = row.get("stop_lon", "").strip()
        if not stop_id or stop_id not in used_stop_ids or not name or not lat or not lon:
            continue

        # Avoid obvious non-station access points when feeds include entrances.
        location_type = row.get("location_type", "").strip()
        if location_type and location_type not in {"0", ""}:
            continue

        candidates.append(
            {
                "id": stop_id,
                "name": name,
                "lat": to_float(lat),
                "lon": to_float(lon),
                "parent_station": row.get("parent_station", "").strip(),
            }
        )

    if not candidates:
        raise RuntimeError("No station stops found. Check stops.txt and stop_times.txt in gtfs.zip.")

    by_key: dict[str, dict[str, Any]] = {}
    for stop in candidates:
        key = stop["parent_station"] or stop["name"].lower()
        # Keep the first platform/stop for each station-like key. PATCO station feeds are simple
        # enough for this app's V1 needs.
        by_key.setdefault(key, stop)

    stations = [
        {"id": stop["id"], "name": stop["name"], "lat": stop["lat"], "lon": stop["lon"]}
        for stop in by_key.values()
    ]
    stations.sort(key=lambda stop: stop["name"])
    return stations


def build_schedule() -> dict[str, Any]:
    if not GTFS_ZIP.exists():
        raise FileNotFoundError(
            f"Could not find {GTFS_ZIP}. Download PATCO GTFS data and save it as gtfs.zip in the project root."
        )

    with zipfile.ZipFile(GTFS_ZIP) as zf:
        available = set(zf.namelist())
        missing = [name for name in REQUIRED_FILES if name not in available]
        if missing:
            raise RuntimeError(f"gtfs.zip is missing required files: {', '.join(missing)}")

        stops_rows = read_gtfs_csv(zf, "stops.txt")
        stop_times_rows = read_gtfs_csv(zf, "stop_times.txt")
        trips_rows = read_gtfs_csv(zf, "trips.txt")
        calendar_rows = read_gtfs_csv(zf, "calendar.txt")
        calendar_dates_rows = read_gtfs_csv(zf, "calendar_dates.txt") if "calendar_dates.txt" in available else []

    stations = pick_station_stops(stops_rows, stop_times_rows)
    station_ids = {station["id"] for station in stations}

    service_by_trip = {row["trip_id"]: row["service_id"] for row in trips_rows if row.get("trip_id") and row.get("service_id")}

    stop_times_by_trip: dict[str, list[dict[str, Any]]] = {}
    for row in stop_times_rows:
        trip_id = row.get("trip_id", "").strip()
        stop_id = row.get("stop_id", "").strip()
        departure_time = (row.get("departure_time") or row.get("arrival_time") or "").strip()
        if not trip_id or stop_id not in station_ids or not departure_time:
            continue

        stop_times_by_trip.setdefault(trip_id, []).append(
            {
                "stop_id": stop_id,
                "stop_sequence": to_int(row.get("stop_sequence")),
                "departure_time": departure_time,
            }
        )

    trips = []
    for trip_id, stops in stop_times_by_trip.items():
        service_id = service_by_trip.get(trip_id)
        if not service_id or len(stops) < 2:
            continue
        stops.sort(key=lambda stop: stop["stop_sequence"])
        trips.append({"trip_id": trip_id, "service_id": service_id, "stops": stops})

    calendar = []
    for row in calendar_rows:
        calendar.append(
            {
                "service_id": row["service_id"],
                "monday": as_bool(row.get("monday")),
                "tuesday": as_bool(row.get("tuesday")),
                "wednesday": as_bool(row.get("wednesday")),
                "thursday": as_bool(row.get("thursday")),
                "friday": as_bool(row.get("friday")),
                "saturday": as_bool(row.get("saturday")),
                "sunday": as_bool(row.get("sunday")),
                "start_date": row["start_date"],
                "end_date": row["end_date"],
            }
        )

    calendar_dates = []
    for row in calendar_dates_rows:
        calendar_dates.append(
            {
                "service_id": row["service_id"],
                "date": row["date"],
                "exception_type": to_int(row.get("exception_type")),
            }
        )

    return {
        "metadata": {
            "source": "PATCO GTFS",
            "generated_by": "tools/convert_gtfs_to_json.py",
            "notes": "Static schedule only; no live delays or special schedules.",
        },
        "stops": stations,
        "calendar": calendar,
        "calendar_dates": calendar_dates,
        "trips": trips,
    }


def main() -> int:
    try:
        schedule = build_schedule()
        OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_JSON.write_text(json.dumps(schedule, separators=(",", ":")), encoding="utf-8")
        print(f"Wrote {OUTPUT_JSON.relative_to(PROJECT_ROOT)}")
        print(f"Stations: {len(schedule['stops'])}")
        print(f"Trips: {len(schedule['trips'])}")
        return 0
    except Exception as exc:  # noqa: BLE001 - CLI should show clean error messages.
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
