"use strict";

/* ==========================================================
   Configuration
   ========================================================== */

// uvicorn serves plain HTTP unless you start it with SSL certificates.
const API_BASE = "https://nyc-airbnb-room-type-predictor-ucjr.onrender.com";

// scikit-learn sorts class labels alphabetically, and predict_proba
// returns probabilities in that order. Change this list if your
// model was trained with different classes.
const CLASS_LABELS = ["Entire home/apt", "Private room", "Shared room"];

const REQUEST_TIMEOUT_MS = 15000;

const ROOM_META = {
  entire: {
    letter: "E",
    color: "var(--green)",
    text: "#fff",
    blurb: "Guests get the whole place to themselves.",
  },
  private: {
    letter: "P",
    color: "var(--orange)",
    text: "#fff",
    blurb: "A private room in a home that others also use.",
  },
  shared: {
    letter: "S",
    color: "var(--blue)",
    text: "#fff",
    blurb: "A bed or room shared with other guests.",
  },
  hotel: {
    letter: "H",
    color: "var(--yellow)",
    text: "#0f1720",
    blurb: "A room in a hotel-style property.",
  },
};

const NEIGHBOURHOODS = {
  Manhattan: [
    "Harlem", "Upper West Side", "Upper East Side", "Midtown", "Hell's Kitchen",
    "East Village", "Chelsea", "Lower East Side", "Washington Heights",
    "Greenwich Village", "SoHo", "Financial District", "Chinatown", "East Harlem",
    "Murray Hill", "Kips Bay", "Gramercy", "Inwood", "West Village", "Tribeca",
  ],
  Brooklyn: [
    "Williamsburg", "Bedford-Stuyvesant", "Bushwick", "Crown Heights", "Greenpoint",
    "Park Slope", "Flatbush", "Fort Greene", "Sunset Park", "Clinton Hill",
    "Prospect-Lefferts Gardens", "East Flatbush", "Brooklyn Heights", "Bay Ridge",
    "DUMBO",
  ],
  Queens: [
    "Astoria", "Long Island City", "Flushing", "Ridgewood", "Sunnyside", "Jamaica",
    "Woodside", "Jackson Heights", "Elmhurst", "Forest Hills", "Rockaway Beach",
  ],
  Bronx: [
    "Mott Haven", "Kingsbridge", "Concourse", "Fordham", "Longwood",
    "Morris Heights", "Port Morris", "Riverdale", "Woodlawn",
  ],
  "Staten Island": [
    "St. George", "Tompkinsville", "Stapleton", "New Brighton", "Port Richmond",
    "Great Kills",
  ],
};

const SAMPLE = {
  neighbourhood_group: "Manhattan",
  neighbourhood: "Midtown",
  latitude: 40.7536,
  longitude: -73.9832,
  price: 150,
  minimum_nights: 3,
  availability_365: 180,
  number_of_reviews: 45,
  reviews_per_month: 1.2,
  calculated_host_listings_count: 2,
};

// Order and types must match the Pydantic `Features` model.
const FIELDS = [
  { name: "latitude", type: "float" },
  { name: "longitude", type: "float" },
  { name: "price", type: "float" },
  { name: "minimum_nights", type: "int" },
  { name: "number_of_reviews", type: "int" },
  { name: "reviews_per_month", type: "float" },
  { name: "calculated_host_listings_count", type: "int" },
  { name: "availability_365", type: "int" },
  { name: "neighbourhood_group", type: "text" },
  { name: "neighbourhood", type: "text" },
];

/* ==========================================================
   Elements
   ========================================================== */

const $ = (id) => document.getElementById(id);

const form = $("predict-form");
const submitBtn = $("submit-btn");
const sampleBtn = $("sample-btn");
const resetBtn = $("reset-btn");
const boroughSelect = $("neighbourhood_group");
const hoodList = $("neighbourhood-list");
const panel = $("result-panel");

const states = {
  idle: $("state-idle"),
  loading: $("state-loading"),
  result: $("state-result"),
  error: $("state-error"),
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ==========================================================
   Helpers
   ========================================================== */

function showState(name) {
  Object.entries(states).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle("is-loading", isLoading);
  submitBtn.querySelector(".btn-label").textContent = isLoading
    ? "Predicting"
    : "Predict room type";
  form.setAttribute("aria-busy", String(isLoading));
}

function setFieldError(name, message) {
  const input = $(name);
  const error = $(`${name}-error`);
  if (!input || !error) return;
  error.textContent = message || "";
  input.closest(".field").classList.toggle("has-error", Boolean(message));
  input.setAttribute("aria-invalid", message ? "true" : "false");
  if (message) input.setAttribute("aria-describedby", error.id);
}

function clearErrors() {
  FIELDS.forEach(({ name }) => setFieldError(name, ""));
}

function populateNeighbourhoods(borough) {
  hoodList.innerHTML = "";
  (NEIGHBOURHOODS[borough] || []).forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    hoodList.appendChild(option);
  });
}

function roomMeta(label) {
  const key = String(label).toLowerCase();
  if (key.includes("entire")) return ROOM_META.entire;
  if (key.includes("private")) return ROOM_META.private;
  if (key.includes("shared")) return ROOM_META.shared;
  if (key.includes("hotel")) return ROOM_META.hotel;
  return {
    letter: String(label).charAt(0).toUpperCase() || "?",
    color: "var(--ink)",
    text: "#fff",
    blurb: "",
  };
}

/* ==========================================================
   Validation and payload
   ========================================================== */

function validate() {
  clearErrors();
  let firstInvalid = null;

  FIELDS.forEach(({ name }) => {
    const input = $(name);
    if (input.type === "text") input.value = input.value.trim();

    let message = "";
    if (!input.checkValidity()) {
      message = input.validity.valueMissing
        ? "This field is required."
        : input.validationMessage;
    } else if (name === "price" && Number(input.value) <= 0) {
      message = "Price must be greater than 0.";
    }

    if (message) {
      setFieldError(name, message);
      if (!firstInvalid) firstInvalid = input;
    }
  });

  if (firstInvalid) firstInvalid.focus();
  return !firstInvalid;
}

function buildPayload() {
  const payload = {};
  FIELDS.forEach(({ name, type }) => {
    const raw = $(name).value;
    if (type === "int") payload[name] = parseInt(raw, 10);
    else if (type === "float") payload[name] = parseFloat(raw);
    else payload[name] = raw;
  });
  return payload;
}

/* ==========================================================
   API
   ========================================================== */

async function checkApi() {
  const status = $("api-status");
  const text = $("api-status-text");
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${API_BASE}/`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    status.dataset.state = "online";
    text.textContent = "API connected";
  } catch {
    status.dataset.state = "offline";
    text.textContent = "API not reachable";
  }
}

async function requestPrediction(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      /* response had no JSON body */
    }

    if (!response.ok) {
      const err = new Error("Request failed");
      err.status = response.status;
      err.body = body;
      throw err;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/* ==========================================================
   Rendering
   ========================================================== */

function renderResult(data) {
  const label = String(data.Predicted_room_type);
  const probs = Array.isArray(data.Probability) ? data.Probability : [];
  const meta = roomMeta(label);

  const bullet = $("result-bullet");
  bullet.textContent = meta.letter;
  bullet.style.setProperty("--route", meta.color);
  bullet.style.setProperty("--route-text", meta.text);

  $("result-label").textContent = label;
  $("result-blurb").textContent = meta.blurb;

  // Build labelled probability rows.
  const labels =
    probs.length === CLASS_LABELS.length
      ? CLASS_LABELS
      : probs.map((_, i) => `Class ${i + 1}`);

  const rows = probs
    .map((p, i) => ({ label: labels[i], value: Number(p) }))
    .sort((a, b) => b.value - a.value);

  const matched = rows.find((r) => r.label === label);
  const top = matched || rows[0];
  $("result-confidence").textContent = top
    ? `Confidence ${(top.value * 100).toFixed(1)}%`
    : "";
  $("result-confidence").hidden = !top;

  const list = $("prob-list");
  list.innerHTML = "";
  rows.forEach((row) => {
    const li = document.createElement("li");

    const head = document.createElement("div");
    head.className = "prob-row-head";
    const name = document.createElement("span");
    name.textContent = row.label;
    const pct = document.createElement("span");
    pct.className = "pct";
    pct.textContent = `${(row.value * 100).toFixed(1)}%`;
    head.append(name, pct);

    const bar = document.createElement("div");
    bar.className = "prob-bar";
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", `${row.label}: ${(row.value * 100).toFixed(1)} percent`);
    const fill = document.createElement("div");
    fill.className = "prob-fill";
    fill.style.setProperty("--route", roomMeta(row.label).color);
    fill.dataset.value = String(Math.max(0, Math.min(1, row.value)));
    bar.appendChild(fill);

    li.append(head, bar);
    list.appendChild(li);
  });

  showState("result");

  // Animate the bars after the panel is visible.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      list.querySelectorAll(".prob-fill").forEach((fill) => {
        fill.style.transform = `scaleX(${fill.dataset.value})`;
      });
    });
  });
}

function renderError(title, message) {
  $("error-title").textContent = title;
  $("error-text").textContent = message;
  showState("error");
}

function handleFailure(err) {
  if (err.name === "AbortError") {
    renderError(
      "The request timed out",
      "The server took too long to answer. Check that uvicorn is still running, then try again."
    );
    return;
  }

  if (err.status === 422 && err.body && Array.isArray(err.body.detail)) {
    err.body.detail.forEach((item) => {
      const field = item.loc && item.loc[item.loc.length - 1];
      if (typeof field === "string" && $(field)) setFieldError(field, item.msg);
    });
    renderError(
      "Some values were rejected",
      "The API could not accept the highlighted fields. Fix them and predict again."
    );
    return;
  }

  if (err.status >= 500) {
    renderError(
      "The model could not make a prediction",
      "The server returned an error. A common cause is a borough or neighbourhood name the model has not seen in training. Check the uvicorn terminal for details."
    );
    return;
  }

  if (err.status) {
    renderError("Unexpected response", `The server answered with status ${err.status}.`);
    return;
  }

  renderError(
    "Cannot reach the API",
    `Check that the server is running at ${API_BASE} and that you are using http, not https.`
  );
  checkApi();
}

/* ==========================================================
   Events
   ========================================================== */

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validate()) return;

  setLoading(true);
  showState("loading");
  if (window.matchMedia("(max-width: 900px)").matches) {
    panel.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
  }

  try {
    const data = await requestPrediction(buildPayload());
    if (!data || data.Predicted_room_type === undefined) {
      throw Object.assign(new Error("Malformed response"), { status: 200 });
    }
    renderResult(data);
  } catch (err) {
    handleFailure(err);
  } finally {
    setLoading(false);
  }
});

form.addEventListener("input", (event) => {
  const target = event.target;
  if (target && target.name) setFieldError(target.name, "");
});

boroughSelect.addEventListener("change", () => {
  populateNeighbourhoods(boroughSelect.value);
});

sampleBtn.addEventListener("click", () => {
  clearErrors();
  Object.entries(SAMPLE).forEach(([name, value]) => {
    $(name).value = value;
  });
  populateNeighbourhoods(SAMPLE.neighbourhood_group);
});

resetBtn.addEventListener("click", () => {
  clearErrors();
  hoodList.innerHTML = "";
  showState("idle");
});

$("again-btn").addEventListener("click", () => {
  $("neighbourhood_group").focus();
  form.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
});

$("retry-btn").addEventListener("click", () => {
  if (typeof form.requestSubmit === "function") form.requestSubmit();
  else submitBtn.click();
});

checkApi();