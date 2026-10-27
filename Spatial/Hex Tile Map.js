/**
 * Available Columns:
 * "longitude"
 * "latitude"
 * "store"
 * "Total sales"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

const { getDataFromSearchQuery } = viz;

const LatField = "latitude";
const LongField = "longitude";
const SalesField = "Total sales";

const Colors = [
  "#E2E8D8",
  "#B7C6A3",
  "#9C9D94",
  "#718C67",
  "#365D47"
];

const NoDataColor = "#F1F1F1";

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

// State Lookup
const stateNames = `
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
  stateNames.trim().split("\n").map(line =>
    line.trim().split("|")
  )
);

const NameToCode = Object.fromEntries(
  Object.entries(StateNames).map(([code, name]) => [
    name.toLowerCase(),
    code
  ])
);

// Hex Tile Layout
const Tiles = {
  WA:[0,0], MT:[2,0], ND:[3,0], MN:[4,0],
  WI:[5,0], MI:[6,0], VT:[10,0], ME:[11,0],

  OR:[0,1], ID:[1,1], WY:[2,1], SD:[3,1],
  IA:[4,1], IL:[5,1], IN:[6,1], OH:[7,1],
  PA:[8,1], NY:[9,1], NH:[10,1],

  CA:[0,2], NV:[1,2], UT:[2,2], CO:[3,2],
  NE:[4,2], MO:[5,2], KY:[6,2], WV:[7,2],
  VA:[8,2], MD:[9,2], NJ:[10,2], MA:[11,2],

  AZ:[1,3], NM:[2,3], KS:[3,3], AR:[4,3],
  TN:[5,3], NC:[6,3], SC:[7,3], DE:[8,3],
  CT:[9,3], RI:[10,3],

  OK:[3,4], LA:[4,4], MS:[5,4], AL:[6,4],
  GA:[7,4], FL:[8,4], DC:[9,4],

  TX:[3,5],
  AK:[0,6], HI:[1,6]
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

const [latIndex, lonIndex, salesIndex] = [
  LatField,
  LongField,
  SalesField
].map(fieldIndex);

if ([latIndex, lonIndex, salesIndex].includes(-1)) {
  throw new Error(
    "Search requires latitude, longitude, and Total sales."
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
        typeof raw === "function"
          ? raw.call(value)
          : raw
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

// Aggregate Store Sales by State
const stateSales = new Map();

for (const row of result.data || []) {
  const lat = numberValue(row[latIndex]);
  const lon = numberValue(row[lonIndex]);
  const sales = numberValue(row[salesIndex]);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    !Number.isFinite(sales) ||
    lat < -90 || lat > 90 ||
    lon < -180 || lon > 180
  ) continue;

  const feature = states.features.find(state =>
    d3.geoContains(state, [lon, lat])
  );

  if (!feature) continue;

  const code = NameToCode[
    feature.properties.name.toLowerCase()
  ];

  if (!code) continue;

  const current = stateSales.get(code) || {
    sales: 0,
    stores: 0
  };

  current.sales += sales;
  current.stores += 1;

  stateSales.set(code, current);
}

if (!stateSales.size) {
  throw new Error("No store coordinates matched US states.");
}

// Quantile Color Scale
const salesValues = [...stateSales.values()]
  .map(value => value.sales)
  .sort((a, b) => a - b);

const thresholds = [0.2, 0.4, 0.6, 0.8].map(p => {
  const index = (salesValues.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);

  return salesValues[low] +
    (salesValues[high] - salesValues[low]) *
    (index - low);
});

const salesColor = sales => {
  if (sales == null) return NoDataColor;

  const index = thresholds.findIndex(
    threshold => sales <= threshold
  );

  return Colors[index === -1 ? 4 : index];
};

// Chart Container
const chart = document.querySelector("#chart");

if (!chart) {
  throw new Error("Chart container not found.");
}

chart.style.cssText = `
  position:relative;
  width:100%;
  height:100%;
  min-height:400px;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:8px;
  padding:12px;
  box-sizing:border-box;
  background:#FFFFFF;
  font-family:Arial,sans-serif;
  overflow:hidden;
`;

const svgNS = "http://www.w3.org/2000/svg";

const svg = document.createElementNS(svgNS, "svg");

svg.setAttribute("viewBox", "0 0 650 300");
svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

svg.style.cssText = `
  display:block;
  width:100%;
  max-height:310px;
  flex:none;
`;

// Tooltip
const tooltip = document.createElement("div");

tooltip.style.cssText = `
  position:absolute;
  z-index:20;
  display:none;
  pointer-events:none;
  padding:9px 12px;
  background:#2F2F2F;
  color:#FFFFFF;
  border-radius:4px;
  box-shadow:0 2px 8px rgba(0,0,0,.18);
  font:12px Arial,sans-serif;
  line-height:1.5;
  white-space:nowrap;
`;

// Hexagon Geometry
const Radius = 24;
const HexWidth = Math.sqrt(3) * Radius;
const RowHeight = 1.5 * Radius;

const hexPath = (x, y) => {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (60 * i - 90) * Math.PI / 180;

    const px = x + Radius * Math.cos(angle);
    const py = y + Radius * Math.sin(angle);

    return `${i ? "L" : "M"}${px},${py}`;
  }).join(" ") + "Z";
};

const hexLayer = document.createElementNS(svgNS, "g");

hexLayer.setAttribute("transform", "translate(50,28)");

// Draw State Hexagons
for (const [code, [col, row]] of Object.entries(Tiles)) {
  const x = col * HexWidth +
    (row % 2) * HexWidth / 2;

  const y = row * RowHeight;
  const values = stateSales.get(code);
  const color = salesColor(values?.sales);

  const group = document.createElementNS(svgNS, "g");
  const hex = document.createElementNS(svgNS, "path");
  const label = document.createElementNS(svgNS, "text");

  hex.setAttribute("d", hexPath(x, y));
  hex.setAttribute("fill", color);
  hex.setAttribute("stroke", "#FFFFFF");
  hex.setAttribute("stroke-width", "2");

  label.setAttribute("x", x);
  label.setAttribute("y", y + 4);
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("font-size", "11");
  label.setAttribute("font-weight", "600");
  label.setAttribute(
    "fill",
    Colors.indexOf(color) >= 3
      ? "#FFFFFF"
      : "#444444"
  );

  label.textContent = code;

  group.style.cursor = "pointer";
  group.append(hex, label);

  group.addEventListener("pointermove", event => {
    tooltip.replaceChildren();

    const title = document.createElement("strong");
    title.textContent = StateNames[code];

    tooltip.appendChild(title);

    for (const line of values
      ? [
          `Sales: ${USD.format(values.sales)}`,
          `Stores: ${values.stores}`
        ]
      : ["No data"]
    ) {
      const detail = document.createElement("div");
      detail.textContent = line;
      tooltip.appendChild(detail);
    }

    tooltip.style.display = "block";

    const rect = chart.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    tooltip.style.left = `${Math.max(
      8,
      Math.min(
        x + 14,
        rect.width - tooltip.offsetWidth - 8
      )
    )}px`;

    tooltip.style.top = `${Math.max(
      8,
      Math.min(
        y - tooltip.offsetHeight - 10,
        rect.height - tooltip.offsetHeight - 8
      )
    )}px`;
  });

  group.addEventListener("pointerleave", () => {
    tooltip.style.display = "none";
  });

  hexLayer.appendChild(group);
}

svg.appendChild(hexLayer);

// Centered Quantile Legend
const legend = document.createElement("div");

legend.style.cssText = `
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:6px;
  flex:none;
  color:#555;
  font:11px Arial,sans-serif;
`;

const legendTitle = document.createElement("strong");
legendTitle.textContent = "Sales";

const swatches = document.createElement("div");

swatches.style.cssText = `
  display:flex;
  gap:3px;
`;

const labels = [
  "Bottom 20%",
  "20–40%",
  "40–60%",
  "60–80%",
  "Top 20%"
];

Colors.forEach((color, i) => {
  const item = document.createElement("div");

  item.style.cssText = `
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:4px;
    min-width:60px;
  `;

  const swatch = document.createElement("div");

  swatch.style.cssText = `
    width:54px;
    height:14px;
    background:${color};
    border-radius:2px;
  `;

  const text = document.createElement("span");
  text.textContent = labels[i];

  const lower = i === 0
    ? salesValues[0]
    : thresholds[i - 1];

  const upper = i === 4
    ? salesValues[salesValues.length - 1]
    : thresholds[i];

  swatch.title =
    `${USD.format(lower)} – ${USD.format(upper)}`;

  item.append(swatch, text);
  swatches.appendChild(item);
});

legend.append(legendTitle, swatches);

// No Data Key
const noData = document.createElement("div");

noData.style.cssText = `
  display:flex;
  align-items:center;
  gap:6px;
  margin-top:3px;
  font-size:10px;
`;

noData.innerHTML = `
  <span style="
    width:12px;
    height:12px;
    background:${NoDataColor};
    border:1px solid #DDD;
    border-radius:2px;
  "></span>
  No Data
`;

legend.appendChild(noData);

chart.replaceChildren(svg, legend, tooltip);

viz.events?.emitRenderCompletedEvent?.();