/**
 * Available Columns:
 * "county"
 * "state"
 * "longitude"
 * "latitude"
 * "Total sales"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

const { getDataFromSearchQuery } = viz;

const Fields = {
  state: "state",
  county: "county",
  lat: "latitude",
  lon: "longitude",
  sales: "Total sales"
};

const Colors = [
  "#E2E8D8",
  "#B7C6A3",
  "#9C9D94",
  "#718C67",
  "#365D47"
];

const Categories = [
  "Bottom 20%",
  "20–40%",
  "40–60%",
  "60–80%",
  "Top 20%"
];

const NoDataColor = "#F1F1F1";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

// Geographic Dependencies
const [d3, topojson, atlas] = await Promise.all([
  import("https://cdn.jsdelivr.net/npm/d3@7/+esm"),
  import("https://cdn.jsdelivr.net/npm/topojson-client@3/+esm"),
  import("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json/+esm")
]);

const topology = atlas.default;

const counties = topojson.feature(
  topology,
  topology.objects.counties
);

const states = topojson.feature(
  topology,
  topology.objects.states
);

// State Abbreviations
const StateCodes = `
AL|Alabama
AK|Alaska
AZ|Arizona
AR|Arkansas
CA|California
CO|Colorado
CT|Connecticut
DE|Delaware
FL|Florida
GA|Georgia
HI|Hawaii
ID|Idaho
IL|Illinois
IN|Indiana
IA|Iowa
KS|Kansas
KY|Kentucky
LA|Louisiana
ME|Maine
MD|Maryland
MA|Massachusetts
MI|Michigan
MN|Minnesota
MS|Mississippi
MO|Missouri
MT|Montana
NE|Nebraska
NV|Nevada
NH|New Hampshire
NJ|New Jersey
NM|New Mexico
NY|New York
NC|North Carolina
ND|North Dakota
OH|Ohio
OK|Oklahoma
OR|Oregon
PA|Pennsylvania
RI|Rhode Island
SC|South Carolina
SD|South Dakota
TN|Tennessee
TX|Texas
UT|Utah
VT|Vermont
VA|Virginia
WA|Washington
WV|West Virginia
WI|Wisconsin
WY|Wyoming
DC|District of Columbia
`;

const StateNames = Object.fromEntries(
  StateCodes.trim().split("\n").map(line =>
    line.split("|")
  )
);

const stateFips = new Map();
const stateByFips = new Map();

for (const feature of states.features) {
  const id = String(feature.id).padStart(2, "0");
  const name = feature.properties.name.toLowerCase();

  stateFips.set(name, id);
  stateByFips.set(id, feature.properties.name);
}

for (const [code, name] of Object.entries(StateNames)) {
  stateFips.set(
    code.toLowerCase(),
    stateFips.get(name.toLowerCase())
  );
}

const normalizeCounty = value =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\bst[.]?\b/g, "saint")
    .replace(/\b(county|parish|borough|census area|municipality)\b/g, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// County Lookup
const countyLookup = new Map();
const countyByFips = new Map();

for (const feature of counties.features) {
  const fips = String(feature.id).padStart(5, "0");
  const state = fips.slice(0, 2);
  const name = normalizeCounty(feature.properties.name);

  countyLookup.set(`${state}|${name}`, fips);
  countyByFips.set(fips, feature);
}

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

const getValue = (row, field) =>
  cellValue(row[indexes[field]]);

const numeric = value => {
  if (value == null || value === "") return NaN;

  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
};

// Aggregate Sales by County
const countySales = new Map();
const unmatched = new Set();

for (const row of result.data || []) {
  const state = String(getValue(row, "state") ?? "")
    .trim()
    .toLowerCase();

  const county = normalizeCounty(
    getValue(row, "county")
  );

  const lat = numeric(getValue(row, "lat"));
  const lon = numeric(getValue(row, "lon"));
  const sales = numeric(getValue(row, "sales"));
  const stateId = stateFips.get(state);

  if (!stateId || !Number.isFinite(sales)) continue;

  // Match County + State first
  let fips = countyLookup.get(
    `${stateId}|${county}`
  );

  // Fallback to coordinates for unmatched names
  if (
    !fips &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 &&
    lon >= -180 && lon <= 180
  ) {
    const match = counties.features.find(feature =>
      String(feature.id).padStart(5, "0")
        .startsWith(stateId) &&
      d3.geoContains(feature, [lon, lat])
    );

    if (match) {
      fips = String(match.id).padStart(5, "0");
    }
  }

  if (!fips) {
    unmatched.add(`${county}, ${state}`);
    continue;
  }

  const current = countySales.get(fips) || {
    sales: 0,
    locations: 0,
    coordinates: []
  };

  current.sales += sales;
  current.locations++;

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    current.coordinates.push([lat, lon]);
  }

  countySales.set(fips, current);
}

if (!countySales.size) {
  throw new Error("No counties matched the map.");
}

if (unmatched.size) {
  console.warn("Unmatched County/State values:", [
    ...unmatched
  ]);
}

// Quantile Classification
const salesValues = [...countySales.values()]
  .map(d => d.sales)
  .sort((a, b) => a - b);

const thresholds = [0.2, 0.4, 0.6, 0.8].map(p =>
  d3.quantileSorted(salesValues, p)
);

const salesClass = value => {
  if (value == null) return -1;

  const index = thresholds.findIndex(t =>
    value <= t
  );

  return index === -1 ? 4 : index;
};

const salesColor = value => {
  const index = salesClass(value);

  return index < 0
    ? NoDataColor
    : Colors[index];
};

const salesRange = index => {
  const low = index === 0
    ? salesValues[0]
    : thresholds[index - 1];

  const high = index === 4
    ? salesValues[salesValues.length - 1]
    : thresholds[index];

  return `${USD.format(low)} – ${USD.format(high)}`;
};

// Chart Container
const chart = document.querySelector("#chart");

if (!chart) {
  throw new Error("Chart container not found.");
}

chart.__countyCleanup?.();

chart.style.cssText = `
  position:relative;
  width:100%;
  height:100%;
  min-height:440px;
  display:flex;
  flex-direction:column;
  background:#FFFFFF;
  overflow:hidden;
  box-sizing:border-box;
  font-family:Arial,sans-serif;
`;

// SVG Map
const svg = document.createElementNS(
  "http://www.w3.org/2000/svg",
  "svg"
);

svg.style.cssText = `
  display:block;
  width:100%;
  flex:1 1 0;
  min-height:0;
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
  padding:10px 12px;
  border-radius:4px;
  box-shadow:0 2px 8px rgba(0,0,0,.18);
  font:12px Arial,sans-serif;
  line-height:1.6;
  white-space:nowrap;
`;

const showTooltip = (event, feature) => {
  const fips = String(feature.id).padStart(5, "0");
  const values = countySales.get(fips);
  const state = stateByFips.get(fips.slice(0, 2));
  const name = feature.properties.name;

  tooltip.replaceChildren();

  const title = document.createElement("strong");
  title.textContent = `${name}, ${state}`;

  tooltip.appendChild(title);

  const lines = [];

  if (values) {
    const category = salesClass(values.sales);

    lines.push(
      `Total Sales: ${USD.format(values.sales)}`,
      `Sales Category: ${Categories[category]}`,
      `Category Range: ${salesRange(category)}`,
      `Locations: ${values.locations}`
    );

    if (values.coordinates.length === 1) {
      const [lat, lon] = values.coordinates[0];

      lines.push(
        `Latitude: ${lat.toFixed(4)}`,
        `Longitude: ${lon.toFixed(4)}`
      );
    } else if (values.coordinates.length > 1) {
      lines.push(
        `Coordinates: ${values.coordinates.length} locations`
      );
    }
  } else {
    lines.push("Sales: No data");
  }

  for (const line of lines) {
    const detail = document.createElement("div");
    detail.textContent = line;
    tooltip.appendChild(detail);
  }

  tooltip.style.display = "block";

  const bounds = chart.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;

  tooltip.style.left = `${Math.max(
    8,
    Math.min(
      x + 14,
      bounds.width - tooltip.offsetWidth - 8
    )
  )}px`;

  tooltip.style.top = `${Math.max(
    8,
    Math.min(
      y - tooltip.offsetHeight - 10,
      bounds.height - tooltip.offsetHeight - 8
    )
  )}px`;
};

// Centered Quantile Legend
const legend = document.createElement("div");

legend.style.cssText = `
  flex:none;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:5px;
  padding:5px 8px 12px;
  color:#555;
  font:11px Arial,sans-serif;
`;

const legendTitle = document.createElement("strong");
legendTitle.textContent = "Sales by County";

const swatches = document.createElement("div");

swatches.style.cssText = `
  display:flex;
  justify-content:center;
  gap:5px;
`;

Colors.forEach((color, index) => {
  const item = document.createElement("div");

  item.style.cssText = `
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:4px;
    min-width:61px;
  `;

  const swatch = document.createElement("div");

  swatch.style.cssText = `
    width:54px;
    height:14px;
    background:${color};
    border-radius:2px;
  `;

  swatch.title = salesRange(index);

  const label = document.createElement("span");
  label.textContent = Categories[index];

  item.append(swatch, label);
  swatches.appendChild(item);
});

const noData = document.createElement("div");

noData.style.cssText = `
  display:flex;
  align-items:center;
  gap:6px;
  font-size:10px;
`;

const noDataSwatch = document.createElement("span");

noDataSwatch.style.cssText = `
  width:12px;
  height:12px;
  background:${NoDataColor};
  border:1px solid #DDD;
  border-radius:2px;
`;

noData.append(noDataSwatch, "No Data");
legend.append(legendTitle, swatches, noData);

chart.replaceChildren(svg, legend, tooltip);

// Render Map
const render = () => {
  const width = svg.clientWidth;
  const height = svg.clientHeight;

  if (width < 40 || height < 40) return;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const projection = d3.geoAlbersUsa().fitExtent(
    [
      [20, 20],
      [width - 20, height - 20]
    ],
    states
  );

  const path = d3.geoPath(projection);
  const map = d3.select(svg);

  // County boundaries
  map.selectAll("path.county")
    .data(counties.features, d => d.id)
    .join("path")
    .attr("class", "county")
    .attr("d", path)
    .attr("fill", feature => {
      const fips = String(feature.id).padStart(5, "0");
      return salesColor(countySales.get(fips)?.sales);
    })
    .attr("stroke", "#FFFFFF")
    .attr("stroke-width", 0.3)
    .style("cursor", "pointer")
    .on("pointermove", showTooltip)
    .on("pointerleave", () => {
      tooltip.style.display = "none";
    });

  // State borders
  map.selectAll("path.state-border")
    .data([states])
    .join("path")
    .attr("class", "state-border")
    .attr("d", path)
    .attr("fill", "none")
    .attr("stroke", "#9C9D94")
    .attr("stroke-width", 0.9)
    .style("pointer-events", "none");
};

// Render and Resize
render();

const observer = new ResizeObserver(() => {
  if (chart.isConnected) render();
});

observer.observe(svg);

chart.__countyCleanup = () => {
  observer.disconnect();
};

viz.events?.emitRenderCompletedEvent?.();