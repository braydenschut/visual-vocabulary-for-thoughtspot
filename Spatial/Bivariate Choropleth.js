/**
 * Available Columns:
 * "state"
 * "Total sales"
 * "Total quantity purchased"
 * "Sales per Unit"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

const { getDataFromSearchQuery } = viz;

const StateField = "state";
const SalesField = "Total sales";
const QuantityField = "Total quantity purchased";
const UnitField = "Sales per Unit";

const NoDataColor = "#ECECEC";

const Colors = [
  ["#E8E8E8", "#B0D5DF", "#64ACBE"],
  ["#DFB0D6", "#A5ADD3", "#5698B9"],
  ["#BE64AC", "#8C62AA", "#3B4994"]
];

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const UnitUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const INT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
});

// Dependencies
const [d3, topojson, atlas] = await Promise.all([
  import("https://cdn.jsdelivr.net/npm/d3@7/+esm"),
  import("https://cdn.jsdelivr.net/npm/topojson-client@3/+esm"),
  import("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json/+esm")
]);

const states = topojson.feature(
  atlas.default,
  atlas.default.objects.states
);

// State Names and Abbreviations
const abbreviations = `
AL Alabama
AK Alaska
AZ Arizona
AR Arkansas
CA California
CO Colorado
CT Connecticut
DE Delaware
FL Florida
GA Georgia
HI Hawaii
ID Idaho
IL Illinois
IN Indiana
IA Iowa
KS Kansas
KY Kentucky
LA Louisiana
ME Maine
MD Maryland
MA Massachusetts
MI Michigan
MN Minnesota
MS Mississippi
MO Missouri
MT Montana
NE Nebraska
NV Nevada
NH New Hampshire
NJ New Jersey
NM New Mexico
NY New York
NC North Carolina
ND North Dakota
OH Ohio
OK Oklahoma
OR Oregon
PA Pennsylvania
RI Rhode Island
SC South Carolina
SD South Dakota
TN Tennessee
TX Texas
UT Utah
VT Vermont
VA Virginia
WA Washington
WV West Virginia
WI Wisconsin
WY Wyoming
DC District of Columbia
`;

const StateNames = Object.fromEntries(
  abbreviations.trim().split("\n").map(line => {
    const [code, ...name] = line.trim().split(" ");
    return [code, name.join(" ")];
  })
);

const normalizeState = value => {
  const state = String(value ?? "").trim();
  return (StateNames[state.toUpperCase()] || state)
    .toLowerCase();
};

// Read ThoughtSpot Data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field =>
    field.name === name ||
    field.displayName === name
);

const indexes = [
  StateField,
  SalesField,
  QuantityField,
  UnitField
].map(fieldIndex);

if (indexes.includes(-1)) {
  throw new Error(
    "Search requires state, Total sales, " +
    "Total quantity purchased, and Sales per Unit."
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

const numberValue = value => {
  const raw = cellValue(value);

  if (raw == null || raw === "") return NaN;

  const number = Number(raw);
  return Number.isFinite(number) ? number : NaN;
};

// Aggregate by State
const stateData = new Map();

for (const row of result.data || []) {
  const name = String(
    cellValue(row[indexes[0]]) ?? ""
  ).trim();

  const state = normalizeState(name);
  const sales = numberValue(row[indexes[1]]);
  const quantity = numberValue(row[indexes[2]]);
  const perUnit = numberValue(row[indexes[3]]);

  if (
    !state ||
    !Number.isFinite(sales) ||
    !Number.isFinite(quantity) ||
    !Number.isFinite(perUnit) ||
    quantity <= 0
  ) continue;

  const current = stateData.get(state) || {
    sales: 0,
    quantity: 0,
    weightedUnit: 0
  };

  current.sales += sales;
  current.quantity += quantity;
  current.weightedUnit += perUnit * quantity;

  stateData.set(state, current);
}

// Weighted average preserves Sales per Unit if
// multiple rows exist for the same state.
for (const values of stateData.values()) {
  values.perUnit = values.weightedUnit / values.quantity;
}

if (!stateData.size) {
  throw new Error("No valid state-level data found.");
}

// Tertile Classifications
const values = [...stateData.values()];

const breaks = field => {
  const sorted = values
    .map(value => value[field])
    .sort((a, b) => a - b);

  return [
    d3.quantileSorted(sorted, 1 / 3),
    d3.quantileSorted(sorted, 2 / 3)
  ];
};

const salesBreaks = breaks("sales");
const unitBreaks = breaks("perUnit");

const classify = (value, thresholds) =>
  value <= thresholds[0] ? 0 :
  value <= thresholds[1] ? 1 : 2;

const ClassNames = ["Low", "Medium", "High"];

// Chart Container
const chart = document.querySelector("#chart");

if (!chart) {
  throw new Error("Chart container not found.");
}

chart.__bivariateCleanup?.();

chart.style.cssText = `
  width:100%;
  height:100%;
  min-height:440px;
  display:flex;
  flex-direction:column;
  align-items:stretch;
  position:relative;
  background:#FFFFFF;
  font-family:Arial,sans-serif;
  box-sizing:border-box;
  overflow:hidden;
`;

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

const legend = document.createElement("div");

legend.style.cssText = `
  flex:none;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:5px;
  padding:6px 0 12px;
  color:#555;
  font:11px Arial,sans-serif;
  box-sizing:border-box;
`;

legend.innerHTML = `
  <div style="font-weight:600;margin-bottom:2px">
    Sales × Sales per Unit
  </div>
  <div style="display:flex;align-items:center;gap:12px">
    <div style="
      writing-mode:vertical-rl;
      transform:rotate(180deg);
      text-align:center;
    ">Sales: Low → High</div>

    <div id="bivariate-colors" style="
      display:grid;
      grid-template-columns:repeat(3,26px);
      grid-template-rows:repeat(3,26px);
      gap:2px;
    "></div>
  </div>
  <div>Sales per Unit: Low → High →</div>
`;

const colorGrid = legend.querySelector("#bivariate-colors");

for (let row = 2; row >= 0; row--) {
  for (let col = 0; col < 3; col++) {
    const swatch = document.createElement("div");

    swatch.style.cssText = `
      width:26px;
      height:26px;
      background:${Colors[row][col]};
      border-radius:1px;
    `;

    swatch.title =
      `${ClassNames[row]} Sales / ` +
      `${ClassNames[col]} Sales per Unit`;

    colorGrid.appendChild(swatch);
  }
}

chart.replaceChildren(svg, legend, tooltip);

// Tooltip
const showTooltip = (event, name, values) => {
  tooltip.replaceChildren();

  const title = document.createElement("strong");
  title.textContent = name;
  tooltip.appendChild(title);

  const lines = values
    ? [
        `Sales: ${USD.format(values.sales)}`,
        `Quantity Purchased: ${INT.format(values.quantity)}`,
        `Sales per Unit: ${UnitUSD.format(values.perUnit)}`,
        `Sales Class: ${
          ClassNames[classify(values.sales, salesBreaks)]
        }`,
        `Sales per Unit Class: ${
          ClassNames[classify(values.perUnit, unitBreaks)]
        }`
      ]
    : ["No data"];

  for (const line of lines) {
    const div = document.createElement("div");
    div.textContent = line;
    tooltip.appendChild(div);
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

// Map Rendering
const render = () => {
  const width = svg.clientWidth;
  const height = svg.clientHeight;

  if (width <= 40 || height <= 40) return;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const projection = d3.geoAlbersUsa().fitExtent(
    [
      [15, 15],
      [width - 15, height - 15]
    ],
    states
  );

  const path = d3.geoPath(projection);

  d3.select(svg)
    .selectAll("path")
    .data(states.features, d => d.id)
    .join("path")
    .attr("d", path)
    .attr("fill", feature => {
      const state = normalizeState(
        feature.properties.name
      );

      const values = stateData.get(state);

      if (!values) return NoDataColor;

      const salesClass = classify(
        values.sales, salesBreaks
      );

      const unitClass = classify(
        values.perUnit, unitBreaks
      );

      return Colors[salesClass][unitClass];
    })
    .attr("stroke", "#FFFFFF")
    .attr("stroke-width", 1)
    .style("cursor", "pointer")
    .on("mousemove", (event, feature) => {
      const name = feature.properties.name;

      showTooltip(
        event,
        name,
        stateData.get(normalizeState(name))
      );
    })
    .on("mouseleave", () => {
      tooltip.style.display = "none";
    });
};

// Resize and Render
render();

const observer = new ResizeObserver(() => {
  if (chart.isConnected) render();
});

observer.observe(svg);

chart.__bivariateCleanup = () => {
  observer.disconnect();
};

viz.events?.emitRenderCompletedEvent?.();