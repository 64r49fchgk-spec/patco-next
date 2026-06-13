const SCHEDULE_URL = "data/schedule.json";
const WALKING_MPH = 3;
const REFRESH_MS = 30_000;
const TIME_ZONE = "America/New_York";
const PHILLY_DESTINATION = "8th and Market";
const LINDENWOLD_DESTINATION = "Lindenwold";

let schedule = null;
let lastPosition = null;
let refreshTimer = null;

const els = {
  status: document.getElementById("statusPanel"),
  scheduleLabel: document.getElementById("scheduleLabel"),
  refreshButton: document.getElementById("refreshButton"),
  stationName: document.getElementById("stationName"),
  stationDistance: document.getElementById("stationDistance"),
  stationWalk: document.getElementById("stationWalk"),
  phillyDot: document.getElementById("phillyDot"),
  phillyTime: document.getElementById("phillyTime"),
  phillyMinutes: document.getElementById("phillyMinutes"),
  phillyBuffer: document.getElementById("phillyBuffer"),
  lindenwoldDot: document.getElementById("lindenwoldDot"),
  lindenwoldTime: document.getElementById("lindenwoldTime"),
  lindenwoldMinutes: document.getElementById("lindenwoldMinutes"),
  lindenwoldBuffer: document.getElementById("lindenwoldBuffer"),
  lastUpdated: document.getElementById("lastUpdated"),
};

function setStatus(message, kind = "") {
  els.status.textContent = message;
  els.status.className = `status-panel ${kind}`.trim();
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function walkingMinutes(distanceMiles) {
  return Math.max(1, Math.round((distanceMiles / WALKING_MPH) * 60));
}

function getZonedParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday.toLowerCase(),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
    yyyymmdd: `${parts.year}${parts.month}${parts.day}`,
    secondsSinceMidnight: hour * 3600 + Number(parts.minute) * 60 + Number(parts.second),
  };
}

function parseGtfsTimeToSeconds(timeString) {
  const [hours, minutes, seconds] = timeString.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatGtfsSeconds(secondsSinceServiceDay) {
  const wrappedSeconds = ((secondsSinceServiceDay % 86400) + 86400) % 86400;
  const hours24 = Math.floor(wrappedSeconds / 3600);
  const minutes = Math.floor((wrappedSeconds % 3600) / 60);
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function findStopByName(name) {
  const exact = schedule.stops.find((stop) => stop.name.toLowerCase() === name.toLowerCase());
  if (exact) return exact;

  const partial = schedule.stops.find((stop) => stop.name.toLowerCase().includes(name.toLowerCase()));
  if (partial) return partial;

  throw new Error(`Could not find destination stop matching “${name}” in schedule.json.`);
}

function getScheduleLabel() {
  const now = new Date();

  return now.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "America/New_York",
  });
}

function activeServiceIdsForToday() {
  const nowParts = getZonedParts();
  const active = new Set();

  for (const service of schedule.calendar) {
    if (
      service.start_date <= nowParts.yyyymmdd &&
      service.end_date >= nowParts.yyyymmdd &&
      service[nowParts.weekday]
    ) {
      active.add(service.service_id);
    }
  }

  for (const exception of schedule.calendar_dates || []) {
    if (exception.date !== nowParts.yyyymmdd) continue;
    if (exception.exception_type === 1) active.add(exception.service_id);
    if (exception.exception_type === 2) active.delete(exception.service_id);
  }

  return active;
}

function findNearestStation(lat, lon) {
  let nearest = null;

  for (const stop of schedule.stops) {
    const distance = haversineMiles(lat, lon, stop.lat, stop.lon);
    if (!nearest || distance < nearest.distance_miles) {
      nearest = { ...stop, distance_miles: distance };
    }
  }

  return {
    ...nearest,
    distance_miles: Number(nearest.distance_miles.toFixed(2)),
    walk_minutes: walkingMinutes(nearest.distance_miles),
  };
}

function colorForBuffer(bufferMinutes) {
  if (bufferMinutes < 0) {
    return "red"; // you won't make it
  }

  if (bufferMinutes < 5) {
    return "yellow"; // cutting it close
  }

  if (bufferMinutes <= 10) {
    return "green"; // ideal
  }

  return "red"; // too much waiting
}

function findNextTrain(fromStopId, destinationStopId, activeServiceIds, walkMinutesToStation) {
  const nowParts = getZonedParts();
  const currentSeconds = nowParts.secondsSinceMidnight;
  let best = null;

  for (const trip of schedule.trips) {
    if (!activeServiceIds.has(trip.service_id)) continue;

    const fromStop = trip.stops.find((stop) => stop.stop_id === fromStopId);
    const destinationStop = trip.stops.find((stop) => stop.stop_id === destinationStopId);

    if (!fromStop || !destinationStop) continue;
    if (destinationStop.stop_sequence <= fromStop.stop_sequence) continue;

    const departSeconds = parseGtfsTimeToSeconds(fromStop.departure_time);
    const secondsUntilTrain = departSeconds - currentSeconds;

    if (secondsUntilTrain < 0) continue;

    if (!best || secondsUntilTrain < best.seconds_until_train) {
      const minutes = Math.ceil(secondsUntilTrain / 60);
      const buffer = minutes - walkMinutesToStation;
      best = {
        time: formatGtfsSeconds(departSeconds),
        minutes,
        buffer_minutes: buffer,
        color: colorForBuffer(buffer),
        seconds_until_train: secondsUntilTrain,
      };
    }
  }

  if (!best) {
    return {
      time: "—",
      minutes: null,
      buffer_minutes: null,
      color: "gray",
      message: "No upcoming train found for this direction.",
    };
  }

  delete best.seconds_until_train;
  return best;
}

function setDotAndPill(dotEl, pillEl, color) {
  dotEl.className = `dot ${color}`;
  pillEl.className = `buffer-pill ${color}`;
}

function renderTrain(prefix, train) {
  const dot = prefix === "philly" ? els.phillyDot : els.lindenwoldDot;
  const time = prefix === "philly" ? els.phillyTime : els.lindenwoldTime;
  const minutes = prefix === "philly" ? els.phillyMinutes : els.lindenwoldMinutes;
  const buffer = prefix === "philly" ? els.phillyBuffer : els.lindenwoldBuffer;

  setDotAndPill(dot, buffer, train.color);
  time.textContent = train.time;
  minutes.textContent = train.minutes === null ? "No upcoming train" : `${train.minutes} min until train`;
  buffer.textContent = train.buffer_minutes === null ? "— min buffer" : `${train.buffer_minutes} min buffer`;
}

function render(position) {
  if (!schedule) return;

  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  const nearest = findNearestStation(lat, lon);
  const activeServices = activeServiceIdsForToday();

  if (activeServices.size === 0) {
    throw new Error("No active PATCO service found for today in the static schedule.");
  }

  const phillyStop = findStopByName(PHILLY_DESTINATION);
  const lindenwoldStop = findStopByName(LINDENWOLD_DESTINATION);

  const phillyTrain = findNextTrain(nearest.id, phillyStop.id, activeServices, nearest.walk_minutes);
  const lindenwoldTrain = findNextTrain(nearest.id, lindenwoldStop.id, activeServices, nearest.walk_minutes);

  els.scheduleLabel.textContent = getScheduleLabel();
  els.stationName.textContent = nearest.name;
  els.stationDistance.textContent = `${nearest.distance_miles.toFixed(2)} mi`;
  els.stationWalk.textContent = `${nearest.walk_minutes} min walk`;
  renderTrain("philly", phillyTrain);
  renderTrain("lindenwold", lindenwoldTrain);

  els.lastUpdated.textContent = `Last updated: ${new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })}`;

  const noTrainMessages = [phillyTrain.message, lindenwoldTrain.message].filter(Boolean);
  if (noTrainMessages.length) {
    setStatus(noTrainMessages.join(" "), "error");
  } else {
    setStatus("Schedule and location loaded.", "success");
  }
}

function requestLocationAndRender() {
  if (!navigator.geolocation) {
    setStatus("This browser does not support location services.", "error");
    return;
  }

  setStatus("Checking your location…");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      lastPosition = position;
      try {
        render(position);
      } catch (error) {
        console.error(error);
        setStatus(error.message, "error");
      }
    },
    (error) => {
      console.error(error);
      let message = "Could not get your location.";
      if (error.code === error.PERMISSION_DENIED) {
        message = "Location permission denied. Enable location access for this site to find your nearest station.";
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        message = "Your location is currently unavailable.";
      } else if (error.code === error.TIMEOUT) {
        message = "Location request timed out. Try refreshing.";
      }
      setStatus(message, "error");
    },
    {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 60_000,
    },
  );
}

async function loadSchedule() {
  try {
    const response = await fetch(SCHEDULE_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load ${SCHEDULE_URL}. Run tools/convert_gtfs_to_json.py first.`);
    }
    schedule = await response.json();

    if (!schedule.stops?.length || !schedule.trips?.length || !schedule.calendar?.length) {
      throw new Error("schedule.json is missing required stops, trips, or calendar data.");
    }

    requestLocationAndRender();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (lastPosition) {
        try {
          render(lastPosition);
        } catch (error) {
          console.error(error);
          setStatus(error.message, "error");
        }
      } else {
        requestLocationAndRender();
      }
    }, REFRESH_MS);
  } catch (error) {
    console.error(error);
    setStatus(error.message, "error");
  }
}

els.refreshButton.addEventListener("click", requestLocationAndRender);
loadSchedule();
