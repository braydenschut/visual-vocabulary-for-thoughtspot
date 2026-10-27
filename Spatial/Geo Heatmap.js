/**
 * Available Columns:
 * "latitude"
 * "longitude"
 * "store"
 * "city"
 * "county"
 * "state"
 * "Total sales"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

const { getDataFromSearchQuery } = viz;

const Fields = {
  store: "store",
  city: "city",
  county: "county",
  state: "state",
  lat: "latitude",
  lon: "longitude",
  sales: "Total sales"
};

const HeatColors = [
  "#E2E8D8",
  "#B7C6A3",
  "#9C9D94",
  "#718C67",
  "#365D47"
];

const HeatRadius = 32;
const HeatOpacity = 1;

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

// Geographic Dependencies
const [d3, topojson, atlas] = await Promise.all([
  import("https://cdn.jsdelivr.net/npm/d3-geo@3/+esm"),
  import("https://cdn.jsdelivr.net/npm/topojson-client@3/+esm"),
  import("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json/+esm")
]);

const states = topojson.feature(
  atlas.default,
  atlas.default.objects.states
);

// Read ThoughtSpot Data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const indexes = Object.fromEntries(
  Object.entries(Fields).map(([key, name]) => [
    key,
    schema.findIndex(field =>
      field.name === name ||
      field.displayName === name
    )
  ])
);

const missing = Object.entries(indexes)
  .filter(([, index]) => index < 0)
  .map(([key]) => Fields[key]);

if (missing.length) {
  throw new Error(
    `Missing Search fields: ${missing.join(", ")}`
  );
}

const cellValue = value => {
  if (value == null || typeof value !== "object") {
    return value;
  }

  for (const key of ["rawValue", "value", "_value", "v"]) {
    if (key in value) {
      const raw = value[key];
      return cellValue(
        typeof raw === "function" ? raw.call(value) : raw
      );
    }
  }

  return null;
};

const getValue = (row, key) =>
  cellValue(row[indexes[key]]);

const numeric = value =>
  value == null || value === "" ? NaN : Number(value);

// Prepare Store Locations
const stores = (result.data || []).map(row => ({
  store: String(getValue(row, "store") ?? "").trim(),
  city: String(getValue(row, "city") ?? "").trim(),
  county: String(getValue(row, "county") ?? "").trim(),
  state: String(getValue(row, "state") ?? "").trim(),
  lat: numeric(getValue(row, "lat")),
  lon: numeric(getValue(row, "lon")),
  sales: numeric(getValue(row, "sales"))
})).filter(store =>
  store.store &&
  Number.isFinite(store.lat) &&
  Number.isFinite(store.lon) &&
  Number.isFinite(store.sales) &&
  store.sales > 0 &&
  store.lat >= -90 &&
  store.lat <= 90 &&
  store.lon >= -180 &&
  store.lon <= 180
);

if (!stores.length) {
  throw new Error("No valid store locations found.");
}

// Color Interpolation
const palette = HeatColors.map(hex => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16)
]);

const heatColor = intensity => {
  const position = Math.max(0, Math.min(1, intensity)) *
    (palette.length - 1);

  const index = Math.min(
    Math.floor(position),
    palette.length - 2
  );

  const fraction = position - index;

  return palette[index].map((value, channel) =>
    Math.round(
      value * (1 - fraction) +
      palette[index + 1][channel] * fraction
    )
  );
};

// Chart Container
const chart = document.querySelector("#chart");

if (!chart) {
  throw new Error("Chart container not found.");
}

chart.__heatCleanup?.();

chart.style.cssText = `
  position:relative;
  width:100%;
  height:100%;
  min-height:400px;
  overflow:hidden;
  background:#FFFFFF;
  box-sizing:border-box;
`;

const basemap = document.createElementNS(
  "http://www.w3.org/2000/svg",
  "svg"
);

basemap.style.cssText = `
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  pointer-events:none;
`;

const canvas = document.createElement("canvas");

canvas.style.cssText = `
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
`;

const tooltip = document.createElement("div");

tooltip.style.cssText = `
  position:absolute;
  z-index:20;
  display:none;
  pointer-events:none;
  background:#2F2F2F;
  color:#FFFFFF;
  padding:9px 12px;
  border-radius:4px;
  box-shadow:0 2px 8px rgba(0,0,0,.18);
  font:12px Arial,sans-serif;
  line-height:1.5;
  white-space:nowrap;
`;

chart.replaceChildren(basemap, canvas, tooltip);

let projectedStores = [];

// Render Heatmap
const render = () => {
  const width = chart.clientWidth;
  const height = chart.clientHeight;

  if (width < 40 || height < 40) return;

  const ratio = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);

  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  // Geographic Projection
  const projection = d3.geoAlbersUsa().fitExtent(
    [
      [20, 20],
      [width - 20, height - 20]
    ],
    states
  );

  const path = d3.geoPath(projection);

  basemap.setAttribute(
    "viewBox",
    `0 0 ${width} ${height}`
  );

  const mapPath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path"
  );

  mapPath.setAttribute("d", path(states) || "");
  mapPath.setAttribute("fill", "#FFFFFF");
  mapPath.setAttribute("stroke", "#C5C8BE");
  mapPath.setAttribute("stroke-width", "0.7");
  mapPath.setAttribute("stroke-linejoin", "round");

  basemap.replaceChildren(mapPath);

  // Project Stores
  projectedStores = stores.flatMap(store => {
    const point = projection([store.lon, store.lat]);

    return point
      ? [{ ...store, x: point[0], y: point[1] }]
      : [];
  });

  if (!projectedStores.length) {
    throw new Error(
      "No stores fall within the US projection."
    );
  }

  // Cap extreme Sales at the 95th percentile
  const sorted = projectedStores
    .map(store => store.sales)
    .sort((a, b) => a - b);

  const cap = sorted[
    Math.floor((sorted.length - 1) * 0.95)
  ];

  const maxWeight = Math.max(cap, 1);

  // Accumulate Sales-Weighted Density
  const densityCanvas = document.createElement("canvas");
  densityCanvas.width = width;
  densityCanvas.height = height;

  const density = densityCanvas.getContext("2d");

  for (const store of projectedStores) {
    const weight = Math.min(store.sales, cap) / maxWeight;

    const gradient = density.createRadialGradient(
      store.x, store.y, 0,
      store.x, store.y, HeatRadius
    );

    gradient.addColorStop(
      0, `rgba(0,0,0,${0.65 * weight})`
    );

    gradient.addColorStop(
      0.5, `rgba(0,0,0,${0.3 * weight})`
    );

    gradient.addColorStop(1, "rgba(0,0,0,0)");

    density.fillStyle = gradient;
    density.beginPath();
    density.arc(
      store.x, store.y, HeatRadius, 0, Math.PI * 2
    );
    density.fill();
  }

  // Apply Spatial Color Gradient
  const image = density.getImageData(
    0, 0, width, height
  );

  const pixels = image.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const intensity = pixels[i + 3] / 255;

    if (intensity < 0.015) {
      pixels[i + 3] = 0;
      continue;
    }

    const [r, g, b] = heatColor(intensity);

    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = Math.round(
      intensity * HeatOpacity * 255
    );
  }

  density.putImageData(image, 0, 0);
  context.drawImage(densityCanvas, 0, 0);
};

// Store Tooltip
const showTooltip = (event, store) => {
  tooltip.replaceChildren();

  const title = document.createElement("strong");
  title.textContent = store.store;
  tooltip.appendChild(title);

  const details = [
    ["City", store.city],
    ["County", store.county],
    ["State", store.state],
    ["Sales", USD.format(store.sales)]
  ];

  for (const [label, value] of details) {
    if (!value) continue;

    const line = document.createElement("div");
    line.textContent = `${label}: ${value}`;
    tooltip.appendChild(line);
  }

  tooltip.style.display = "block";

  const rect = chart.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  tooltip.style.left = `${Math.max(
    8,
    Math.min(x + 14, rect.width - tooltip.offsetWidth - 8)
  )}px`;

  tooltip.style.top = `${Math.max(
    8,
    Math.min(
      y - tooltip.offsetHeight - 10,
      rect.height - tooltip.offsetHeight - 8
    )
  )}px`;
};

// Show nearest store within 15 pixels
const onMove = event => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  let nearest = null;
  let distance = 15;

  for (const store of projectedStores) {
    const current = Math.hypot(
      x - store.x,
      y - store.y
    );

    if (current < distance) {
      nearest = store;
      distance = current;
    }
  }

  if (nearest) {
    showTooltip(event, nearest);
  } else {
    tooltip.style.display = "none";
  }
};

const onLeave = () => {
  tooltip.style.display = "none";
};

// Initial Render and Resize
canvas.addEventListener("pointermove", onMove);
canvas.addEventListener("pointerleave", onLeave);

render();

const observer = new ResizeObserver(() => {
  if (chart.isConnected) render();
});

observer.observe(chart);

chart.__heatCleanup = () => {
  observer.disconnect();
  canvas.removeEventListener("pointermove", onMove);
  canvas.removeEventListener("pointerleave", onLeave);
};

viz.events?.emitRenderCompletedEvent?.();