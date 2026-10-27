
/**
 * Available Columns:
 * "latitude"
 * "longitude"
 * "store"
 * "city"
 * "county"
 * "state"
 * "Total sales"
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

const DotColor = "#365D47";
const DotRadius = 5;
const DotOpacity = 0.85;

const MapColor = "#F1F1F1";
const BorderColor = "#C5C8BE";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

// Geographic Dependencies
const [d3, topojson, atlas] = await Promise.all([
  import("https://cdn.jsdelivr.net/npm/d3@7/+esm"),
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

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const indexes = Object.fromEntries(
  Object.entries(Fields).map(([key, name]) => [
    key, fieldIndex(name)
  ])
);

const required = ["store", "lat", "lon", "sales"];

if (required.some(field => indexes[field] < 0)) {
  throw new Error(
    "Search requires store, latitude, longitude, and Total sales."
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

const getValue = (row, field) =>
  indexes[field] < 0
    ? null
    : cellValue(row[indexes[field]]);

const numberValue = value => {
  if (value == null || value === "") return NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
};

// Prepare Store Locations
const stores = (result.data || []).map(row => ({
  store: String(getValue(row, "store") ?? "").trim(),
  city: String(getValue(row, "city") ?? "").trim(),
  county: String(getValue(row, "county") ?? "").trim(),
  state: String(getValue(row, "state") ?? "").trim(),
  lat: numberValue(getValue(row, "lat")),
  lon: numberValue(getValue(row, "lon")),
  sales: numberValue(getValue(row, "sales"))
})).filter(store =>
  store.store &&
  Number.isFinite(store.lat) &&
  Number.isFinite(store.lon) &&
  Number.isFinite(store.sales) &&
  store.lat >= -90 &&
  store.lat <= 90 &&
  store.lon >= -180 &&
  store.lon <= 180
);

if (!stores.length) {
  throw new Error("No valid store locations found.");
}

// Chart Container
const chart = document.querySelector("#chart");

if (!chart) {
  throw new Error("Chart container not found.");
}

chart.__dotMapCleanup?.();

chart.style.cssText = `
  position:relative;
  width:100%;
  height:100%;
  min-height:400px;
  background:#FFFFFF;
  overflow:hidden;
  box-sizing:border-box;
  font-family:Arial,sans-serif;
`;

const svg = document.createElementNS(
  "http://www.w3.org/2000/svg", "svg"
);

svg.style.cssText = `
  display:block;
  width:100%;
  height:100%;
`;

// Tooltip
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

// Centered Legend
const legend = document.createElement("div");

legend.style.cssText = `
  position:absolute;
  bottom:12px;
  left:50%;
  transform:translateX(-50%);
  display:flex;
  align-items:center;
  gap:8px;
  color:#555;
  font:11px Arial,sans-serif;
  pointer-events:none;
`;

legend.innerHTML = `
  <span style="
    width:10px;
    height:10px;
    border-radius:50%;
    background:${DotColor};
  "></span>
  Store Location
`;

chart.replaceChildren(svg, tooltip, legend);

// Tooltip Helper
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

// Render Map
const render = () => {
  const width = chart.clientWidth;
  const height = chart.clientHeight;

  if (width < 40 || height < 40) return;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const projection = d3.geoAlbersUsa().fitExtent(
    [
      [20, 20],
      [width - 20, height - 45]
    ],
    states
  );

  const path = d3.geoPath(projection);
  const map = d3.select(svg);

  map.selectAll("*").remove();

  // US State Basemap
  map.append("g")
    .selectAll("path")
    .data(states.features)
    .join("path")
    .attr("d", path)
    .attr("fill", MapColor)
    .attr("stroke", BorderColor)
    .attr("stroke-width", 0.8)
    .attr("stroke-linejoin", "round");

  // Project Store Coordinates
  const points = stores.flatMap(store => {
    const coordinates = projection([
      store.lon, store.lat
    ]);

    return coordinates
      ? [{
          ...store,
          x: coordinates[0],
          y: coordinates[1]
        }]
      : [];
  });

  // Store Dots
  map.append("g")
    .selectAll("circle")
    .data(points)
    .join("circle")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", DotRadius)
    .attr("fill", DotColor)
    .attr("fill-opacity", DotOpacity)
    .attr("stroke", "#FFFFFF")
    .attr("stroke-width", 0.8)
    .style("cursor", "pointer")
    .on("pointermove", (event, d) => {
      showTooltip(event, d);
    })
    .on("pointerleave", () => {
      tooltip.style.display = "none";
    });
};

// Initial Render and Resize
render();

const observer = new ResizeObserver(() => {
  if (chart.isConnected) render();
});

observer.observe(chart);

chart.__dotMapCleanup = () => {
  observer.disconnect();
};

viz.events?.emitRenderCompletedEvent?.();