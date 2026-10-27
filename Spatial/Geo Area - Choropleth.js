/**
 * Available Columns:
 * "state"
 * "Total sales"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

const { getDataFromSearchQuery } = viz;

const StateField = "state";
const SalesField = "Total sales";

const Colors = [
  "#E8DCCB",
  "#D7BC91",
  "#C89A65",
  "#B87450",
  "#8E493A"
];

const NoDataColor = "#FFFFFF";
const BorderColor = "#A9A9A9";

const currency = new Intl.NumberFormat("en-US", {
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

const topology = atlas.default;
const states = topojson.feature(
  topology,
  topology.objects.states
);

// State Lookup
const StateCodes = {
  AL:"Alabama", AK:"Alaska", AZ:"Arizona",
  AR:"Arkansas", CA:"California", CO:"Colorado",
  CT:"Connecticut", DE:"Delaware", FL:"Florida",
  GA:"Georgia", HI:"Hawaii", ID:"Idaho",
  IL:"Illinois", IN:"Indiana", IA:"Iowa",
  KS:"Kansas", KY:"Kentucky", LA:"Louisiana",
  ME:"Maine", MD:"Maryland", MA:"Massachusetts",
  MI:"Michigan", MN:"Minnesota",
  MS:"Mississippi", MO:"Missouri", MT:"Montana",
  NE:"Nebraska", NV:"Nevada", NH:"New Hampshire",
  NJ:"New Jersey", NM:"New Mexico", NY:"New York",
  NC:"North Carolina", ND:"North Dakota",
  OH:"Ohio", OK:"Oklahoma", OR:"Oregon",
  PA:"Pennsylvania", RI:"Rhode Island",
  SC:"South Carolina", SD:"South Dakota",
  TN:"Tennessee", TX:"Texas", UT:"Utah",
  VT:"Vermont", VA:"Virginia", WA:"Washington",
  WV:"West Virginia", WI:"Wisconsin",
  WY:"Wyoming", DC:"District of Columbia"
};

const normalizeState = value => {
  const state = String(value ?? "").trim();

  return (StateCodes[state.toUpperCase()] || state)
    .toLowerCase();
};

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

// Get ThoughtSpot Data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const stateIndex = fieldIndex(StateField);
const salesIndex = fieldIndex(SalesField);

if (stateIndex < 0 || salesIndex < 0) {
  throw new Error("Search requires state and Total sales.");
}

// Aggregate Sales by State
const stateSales = new Map();

for (const row of result.data || []) {
  const state = normalizeState(
    cellValue(row[stateIndex])
  );

  const raw = cellValue(row[salesIndex]);
  const sales = raw == null || raw === "" ? NaN : Number(raw);

  if (!state || !Number.isFinite(sales)) continue;

  stateSales.set(
    state,
    (stateSales.get(state) || 0) + sales
  );
}

if (!stateSales.size) {
  throw new Error("No valid State Sales data found.");
}

const values = [...stateSales.values()];
const minSales = Math.min(...values);
const maxSales = Math.max(...values);

// Continuous Color Scale
const palette = Colors.map(hex => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16)
]);

const salesColor = sales => {
  if (sales == null) return NoDataColor;

  const t = maxSales === minSales
    ? 1
    : Math.max(0, Math.min(1,
        (sales - minSales) / (maxSales - minSales)
      ));

  const position = t * (palette.length - 1);
  const index = Math.min(
    Math.floor(position),
    palette.length - 2
  );

  const fraction = position - index;

  const rgb = palette[index].map((channel, i) =>
    Math.round(
      channel * (1 - fraction) +
      palette[index + 1][i] * fraction
    )
  );

  return `rgb(${rgb.join(",")})`;
};

// Chart Container
const chart = document.querySelector("#chart");

if (!chart) {
  throw new Error("Chart container #chart not found.");
}

chart.__mapCleanup?.();

chart.style.cssText = `
  position:relative;
  width:100%;
  height:100%;
  min-height:400px;
  overflow:hidden;
  background:#FFFFFF;
  box-sizing:border-box;
  font-family:Arial,sans-serif;
`;

const svgNS = "http://www.w3.org/2000/svg";

const svg = document.createElementNS(svgNS, "svg");

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
  background:#454954;
  color:#FFFFFF;
  padding:10px 12px;
  border-radius:4px;
  box-shadow:0 2px 8px rgba(0,0,0,.18);
  font:12px Arial,sans-serif;
  line-height:1.5;
  white-space:nowrap;
`;

const tooltipTitle = document.createElement("strong");
const tooltipSales = document.createElement("div");

tooltip.append(tooltipTitle, tooltipSales);

// Tooltip Position
const moveTooltip = event => {
  const bounds = chart.getBoundingClientRect();

  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;

  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;

  const left = Math.max(
    8,
    Math.min(x + 14, bounds.width - width - 8)
  );

  const top = Math.max(
    8,
    Math.min(y - height - 10, bounds.height - height - 8)
  );

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
};

// Sales Legend
const legend = document.createElement("div");

legend.style.cssText = `
  position:absolute;
  bottom:10px;
  left:50%;
  transform:translateX(-50%);
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:4px;
  font:11px Arial,sans-serif;
  color:#555;
  pointer-events:none;
`;

const legendTitle = document.createElement("span");
legendTitle.textContent = "Sales";

const gradient = document.createElement("div");

gradient.style.cssText = `
  width:200px;
  height:12px;
  border-radius:3px;
  background:linear-gradient(to right, ${Colors.join(",")});
`;

const legendLabels = document.createElement("div");

legendLabels.style.cssText = `
  display:flex;
  justify-content:space-between;
  width:200px;
`;

const low = document.createElement("span");
low.textContent = currency.format(minSales);

const high = document.createElement("span");
high.textContent = currency.format(maxSales);

legendLabels.append(low, high);
legend.append(legendTitle, gradient, legendLabels);

// Render Map
const renderMap = () => {
  const width = chart.clientWidth;
  const height = chart.clientHeight;

  if (!width || !height) return;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();

  const projection = d3.geoAlbersUsa().fitExtent(
    [
      [20, 20],
      [Math.max(21, width - 20), Math.max(21, height - 50)]
    ],
    states
  );

  const path = d3.geoPath(projection);

  for (const feature of states.features) {
    const name = feature.properties.name;
    const state = normalizeState(name);
    const sales = stateSales.get(state);

    const element = document.createElementNS(svgNS, "path");

    element.setAttribute("d", path(feature) || "");
    element.setAttribute("fill", salesColor(sales));
    element.setAttribute("stroke", BorderColor);
    element.setAttribute("stroke-width", "0.8");
    element.setAttribute("stroke-linejoin", "round");

    element.dataset.name = name;
    element.style.cursor = "pointer";

    svg.appendChild(element);
  }
};

// Shared Hover Interactions
let activeState = null;

const onMove = event => {
  const state = event.target.closest("path");

  if (!state || !svg.contains(state)) {
    if (activeState) {
      activeState.setAttribute("stroke", BorderColor);
      activeState.setAttribute("stroke-width", "0.8");
      activeState.setAttribute("fill-opacity", "1");
      activeState = null;
    }

    tooltip.style.display = "none";
    return;
  }

  if (activeState !== state) {
    if (activeState) {
      activeState.setAttribute("stroke", BorderColor);
      activeState.setAttribute("stroke-width", "0.8");
      activeState.setAttribute("fill-opacity", "1");
    }

    activeState = state;

    state.setAttribute("stroke", "#55574E");
    state.setAttribute("stroke-width", "1.3");
    state.setAttribute("fill-opacity", "0.75");

    const name = state.dataset.name;
    const sales = stateSales.get(normalizeState(name));

    tooltipTitle.textContent = name;
    tooltipSales.textContent = sales == null
      ? "Sales: No data"
      : `Sales: ${currency.format(sales)}`;

    tooltip.style.display = "block";
  }

  moveTooltip(event);
};

const onLeave = () => {
  if (activeState) {
    activeState.setAttribute("stroke", BorderColor);
    activeState.setAttribute("stroke-width", "0.8");
    activeState.setAttribute("fill-opacity", "1");
  }

  activeState = null;
  tooltip.style.display = "none";
};

// Assemble and Render
chart.replaceChildren(svg, tooltip, legend);

svg.addEventListener("pointermove", onMove);
svg.addEventListener("pointerleave", onLeave);

const resizeObserver = typeof ResizeObserver !== "undefined"
  ? new ResizeObserver(renderMap)
  : null;

resizeObserver?.observe(chart);

renderMap();

// Cleanup on Rerender
chart.__mapCleanup = () => {
  resizeObserver?.disconnect();
  svg.removeEventListener("pointermove", onMove);
  svg.removeEventListener("pointerleave", onLeave);
};

viz.events?.emitRenderCompletedEvent?.();