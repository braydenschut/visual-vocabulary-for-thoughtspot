/**
 * Available Columns:
 * "region"
 * "Total sales"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

const { muze, getDataFromSearchQuery } = viz;

const RegionField = "region";
const SalesField = "Total sales";

const StartColor = "#DCE8B6";
const EndColor = "#5A7030";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

// Read ThoughtSpot Data
const source = await getDataFromSearchQuery();

const readField = name => {
  const field = source.getField(name);

  if (!field) {
    throw new Error(`Missing ThoughtSpot field: ${name}`);
  }

  return field.data().map(value =>
    muze.DataStore.isInvalid(value) ? null : value
  );
};

// Aggregate Sales by Region
const totals = new Map();
const regions = readField(RegionField);
const sales = readField(SalesField);

regions.forEach((region, i) => {
  const name = String(region ?? "").trim();
  const value = sales[i] == null ? NaN : Number(sales[i]);

  if (!name || !Number.isFinite(value) || value < 0) return;

  totals.set(name, (totals.get(name) || 0) + value);
});

const data = [...totals]
  .map(([name, value]) => ({ name, value }))
  .sort((a, b) => b.value - a.value);

if (!data.length || data[0].value <= 0) {
  throw new Error("No valid regional Sales data found.");
}

// Continuous Flow Color Gradient
const hexToRgb = hex => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16)
];

const light = hexToRgb(StartColor);
const dark = hexToRgb(EndColor);

const segmentColor = index => {
  const t = data.length === 1
    ? 0
    : index / (data.length - 1);

  return `rgb(${light.map((value, i) =>
    Math.round(value + (dark[i] - value) * t)
  ).join(",")})`;
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
  box-sizing:border-box;
  background:#FFFFFF;
  font-family:Arial,sans-serif;
  overflow:hidden;
`;

// Funnel Layout
const svgNS = "http://www.w3.org/2000/svg";

const width = 760;
const center = 325;
const maxWidth = 510;
const rowHeight = 88;
const top = 24;
const height = top * 2 + data.length * rowHeight;

const svg = document.createElementNS(svgNS, "svg");

svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

svg.style.cssText = `
  display:block;
  width:100%;
  height:100%;
`;

// Tooltip
const tooltip = document.createElement("div");

tooltip.style.cssText = `
  position:absolute;
  display:none;
  z-index:10;
  pointer-events:none;
  background:#2F2F2F;
  color:#FFFFFF;
  padding:9px 12px;
  border-radius:4px;
  font:12px Arial,sans-serif;
  line-height:1.5;
  box-shadow:0 2px 8px rgba(0,0,0,.18);
`;

// SVG Helpers
const createElement = (type, attributes = {}) => {
  const element = document.createElementNS(svgNS, type);

  Object.entries(attributes).forEach(([key, value]) =>
    element.setAttribute(key, value)
  );

  return element;
};

const createText = (
  x,
  y,
  value,
  size,
  weight,
  anchor = "middle",
  color = "#283022"
) => {
  const element = createElement("text", {
    x,
    y,
    "text-anchor": anchor,
    "font-size": size,
    "font-weight": weight,
    fill: color
  });

  element.textContent = value;
  return element;
};

const showTooltip = (event, item) => {
  tooltip.replaceChildren();

  const title = document.createElement("strong");
  title.textContent = item.name;

  const value = document.createElement("div");
  value.textContent = `Sales: ${USD.format(item.value)}`;

  tooltip.append(title, value);
  tooltip.style.display = "block";

  const rect = chart.getBoundingClientRect();

  tooltip.style.left = `${Math.max(
    8,
    Math.min(
      event.clientX - rect.left + 12,
      rect.width - tooltip.offsetWidth - 8
    )
  )}px`;

  tooltip.style.top = `${Math.max(
    8,
    Math.min(
      event.clientY - rect.top - tooltip.offsetHeight - 10,
      rect.height - tooltip.offsetHeight - 8
    )
  )}px`;
};

// Draw Funnel
data.forEach((item, i) => {
  const next = data[i + 1];

  const topWidth = maxWidth * item.value / data[0].value;

  const bottomWidth = next
    ? maxWidth * next.value / data[0].value
    : topWidth * 0.75;

  const y1 = top + i * rowHeight;
  const y2 = y1 + rowHeight - 3;
  const middleY = (y1 + y2) / 2;

  const leftTop = center - topWidth / 2;
  const rightTop = center + topWidth / 2;
  const leftBottom = center - bottomWidth / 2;
  const rightBottom = center + bottomWidth / 2;

  const group = createElement("g");

  const segment = createElement("polygon", {
    points: [
      `${leftTop},${y1}`,
      `${rightTop},${y1}`,
      `${rightBottom},${y2}`,
      `${leftBottom},${y2}`
    ].join(" "),
    fill: segmentColor(i),
    stroke: "#FFFFFF",
    "stroke-width": 3
  });

  segment.style.cursor = "pointer";
  group.appendChild(segment);

  const middleWidth = (topWidth + bottomWidth) / 2;

  // Outside labels for narrow segments
  if (middleWidth < 195) {
    const labelX = Math.min(
      width - 145,
      center + middleWidth / 2 + 25
    );

    const connector = createElement("line", {
      x1: center + middleWidth / 2,
      y1: middleY,
      x2: labelX - 8,
      y2: middleY,
      stroke: "#777777",
      "stroke-width": 1
    });

    group.appendChild(connector);

    group.appendChild(
      createText(
        labelX,
        middleY - 4,
        item.name,
        14,
        600,
        "start"
      )
    );

    group.appendChild(
      createText(
        labelX,
        middleY + 15,
        USD.format(item.value),
        13,
        400,
        "start",
        "#555555"
      )
    );
  } else {
    group.appendChild(
      createText(
        center,
        middleY - 5,
        item.name,
        15,
        600
      )
    );

    group.appendChild(
      createText(
        center,
        middleY + 16,
        USD.format(item.value),
        14,
        400
      )
    );
  }

  group.addEventListener("pointermove", event => {
    showTooltip(event, item);
  });

  group.addEventListener("pointerleave", () => {
    tooltip.style.display = "none";
  });

  svg.appendChild(group);
});

chart.replaceChildren(svg, tooltip);

viz.events?.emitRenderCompletedEvent?.();