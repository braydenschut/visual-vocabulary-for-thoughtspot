/**
 * Available Columns:
 * "region"
 * "Total sales"
 * "Total quantity purchased"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

const { getDataFromSearchQuery } = viz;

const RegionField = "region";
const SalesField = "Total sales";
const QuantityField = "Total quantity purchased";

const LabelMode = "percent"; // "percent" or "sales"
const MinimumLabelShare = 4;

const RegionColors = {
  East: "#0354A6",
  Midwest: "#2778C2",
  South: "#559AD4",
  Southwest: "#85B7E3",
  West: "#B5D6F0"
};

const FallbackColors = [
  ...Object.values(RegionColors),
  "#02366C"
];

const CX = 210;
const CY = 184;
const OuterRadius = 130;
const InnerRadius = 70;
const LabelRadius = (OuterRadius + InnerRadius) / 2;

const svgNS = "http://www.w3.org/2000/svg";

// Formatters
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const number = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
});

const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1
});

const formatPercent = value => `${value.toFixed(1)}%`;

const cellValue = value => {
  if (
    value == null ||
    typeof value !== "object" ||
    value instanceof Date
  ) return value;

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

const regionIndex = fieldIndex(RegionField);
const salesIndex = fieldIndex(SalesField);
const quantityIndex = fieldIndex(QuantityField);

if ([regionIndex, salesIndex, quantityIndex].includes(-1)) {
  throw new Error(
    "Search requires region, Total sales, and Total quantity purchased."
  );
}

// Aggregate Sales and Quantity by Region
const totals = new Map();

for (const row of result.data || []) {
  const region = String(
    cellValue(row[regionIndex]) ?? ""
  ).trim();

  const salesRaw = cellValue(row[salesIndex]);
  const quantityRaw = cellValue(row[quantityIndex]);

  const sales = salesRaw == null || salesRaw === ""
    ? NaN : Number(salesRaw);

  const quantity = quantityRaw == null || quantityRaw === ""
    ? NaN : Number(quantityRaw);

  if (!region || !Number.isFinite(sales) ||
      !Number.isFinite(quantity)) continue;

  const current = totals.get(region) || {
    sales: 0,
    quantity: 0
  };

  current.sales += sales;
  current.quantity += quantity;

  totals.set(region, current);
}

const totalSales = [...totals.values()]
  .reduce((sum, item) => sum + item.sales, 0);

if (totalSales <= 0 ||
    [...totals.values()].some(item => item.sales < 0)) {
  throw new Error("Donut chart requires positive, nonnegative Region Sales.");
}

// Prepare Segments
const categories = [...totals.entries()]
  .map(([region, values]) => ({
    region,
    ...values,
    share: values.sales / totalSales * 100
  }))
  .filter(item => item.sales > 0)
  .sort((a, b) => b.sales - a.sales)
  .map((item, index) => {
    const known = Object.keys(RegionColors).find(
      name => name.toLowerCase() === item.region.toLowerCase()
    );

    return {
      ...item,
      index,
      color: known
        ? RegionColors[known]
        : FallbackColors[index % FallbackColors.length]
    };
  });

// SVG Helpers
const svgElement = (tag, attrs = {}) => {
  const element = document.createElementNS(svgNS, tag);

  Object.entries(attrs).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  return element;
};

const polar = (radius, angle) => ({
  x: CX + radius * Math.cos(angle),
  y: CY + radius * Math.sin(angle)
});

const donutPath = (start, end) => {
  const a = polar(OuterRadius, start);
  const b = polar(OuterRadius, end);
  const c = polar(InnerRadius, end);
  const d = polar(InnerRadius, start);
  const large = end - start > Math.PI ? 1 : 0;

  return [
    `M ${a.x} ${a.y}`,
    `A ${OuterRadius} ${OuterRadius} 0 ${large} 1 ${b.x} ${b.y}`,
    `L ${c.x} ${c.y}`,
    `A ${InnerRadius} ${InnerRadius} 0 ${large} 0 ${d.x} ${d.y}`,
    "Z"
  ].join(" ");
};

const addText = (parent, value, attrs) => {
  const text = svgElement("text", attrs);
  text.textContent = value;
  parent.appendChild(text);
  return text;
};

// Chart Container
const chart = document.querySelector("#chart");

if (!chart) throw new Error("Missing #chart.");

chart.style.cssText = `
  width:100%;
  height:100%;
  min-height:0;
  position:relative;
  overflow:auto;
  box-sizing:border-box;
  font-family:Arial,sans-serif;
`;

const wrapper = document.createElement("div");

wrapper.style.cssText = `
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  width:100%;
  min-height:100%;
  padding:12px;
  gap:4px;
  box-sizing:border-box;
`;

// Centered Region Legend
const legend = document.createElement("div");

legend.style.cssText = `
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  justify-content:center;
  gap:8px 16px;
  padding:6px 10px;
  font:12px Arial,sans-serif;
  color:#555;
`;

const legendTitle = document.createElement("strong");
legendTitle.textContent = "Region";
legend.appendChild(legendTitle);

categories.forEach(item => {
  const entry = document.createElement("span");
  entry.dataset.index = item.index;

  entry.style.cssText = `
    display:inline-flex;
    align-items:center;
    gap:6px;
    cursor:pointer;
  `;

  const swatch = document.createElement("span");
  swatch.style.cssText = `
    width:11px;
    height:11px;
    border-radius:50%;
    background:${item.color};
  `;

  const label = document.createElement("span");
  label.textContent = item.region;

  entry.append(swatch, label);
  legend.appendChild(entry);
});

// SVG Donut
const svg = svgElement("svg", {
  viewBox: "0 0 420 360",
  role: "img",
  "aria-label": "Sales Share by Region"
});

svg.style.cssText = `
  display:block;
  width:100%;
  max-width:420px;
  height:auto;
  overflow:visible;
`;

let angle = -Math.PI / 2;

categories.forEach(item => {
  const sweep = item.share / 100 * Math.PI * 2;
  const gap = Math.min(0.012, sweep * 0.08);
  const start = angle + gap / 2;
  const end = angle + sweep - gap / 2;

  const group = svgElement("g", {
    "data-index": item.index
  });

  const path = svgElement("path", {
    d: donutPath(start, end),
    fill: item.color,
    stroke: "#FFFFFF",
    "stroke-width": 1
  });

  path.style.cursor = "pointer";
  group.appendChild(path);

  if (item.share >= MinimumLabelShare) {
    const point = polar(LabelRadius, (start + end) / 2);

    const label = LabelMode === "sales"
      ? compactCurrency.format(item.sales)
      : formatPercent(item.share);

    const text = addText(group, label, {
      x: point.x,
      y: point.y,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "font-family": "Arial",
      "font-size": 12,
      "font-weight": 700,
      fill: item.index < 3 ? "#FFFFFF" : "#17334E"
    });

    text.style.pointerEvents = "none";
  }

  svg.appendChild(group);
  angle += sweep;
});

// Center Total Sales
addText(svg, "Sales", {
  x: CX,
  y: CY - 12,
  "text-anchor": "middle",
  "font-family": "Arial",
  "font-size": 12,
  fill: "#777777"
});

addText(svg, compactCurrency.format(totalSales), {
  x: CX,
  y: CY + 13,
  "text-anchor": "middle",
  "font-family": "Arial",
  "font-size": 21,
  "font-weight": 700,
  fill: "#333333"
});

// Custom Tooltip
const tooltip = document.createElement("div");

tooltip.style.cssText = `
  position:absolute;
  z-index:100;
  pointer-events:none;
  display:none;
  background:#454954;
  color:#FFFFFF;
  padding:12px 14px;
  border-radius:7px;
  box-shadow:0 4px 16px rgba(0,0,0,.13);
  font:12px Arial,sans-serif;
  min-width:225px;
  box-sizing:border-box;
`;

const tooltipRow = (label, value) => {
  const row = document.createElement("div");
  row.style.cssText = `
    display:flex;
    justify-content:space-between;
    gap:20px;
    margin-top:7px;
  `;

  const name = document.createElement("span");
  name.textContent = label;

  const amount = document.createElement("strong");
  amount.textContent = value;

  row.append(name, amount);
  return row;
};

const moveTooltip = event => {
  const bounds = chart.getBoundingClientRect();
  const x = event.clientX - bounds.left + chart.scrollLeft;
  const y = event.clientY - bounds.top + chart.scrollTop;

  const minX = chart.scrollLeft + 4;
  const minY = chart.scrollTop + 4;
  const maxX = chart.scrollLeft + chart.clientWidth - 8;
  const maxY = chart.scrollTop + chart.clientHeight - 8;

  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;

  let left = x + 14;
  let top = y - height - 10;

  if (left + width > maxX) left = x - width - 14;
  if (top < minY) top = y + 16;

  tooltip.style.left = `${Math.max(minX, Math.min(left, maxX - width))}px`;
  tooltip.style.top = `${Math.max(minY, Math.min(top, maxY - height))}px`;
};

const showTooltip = (item, event) => {
  const title = document.createElement("strong");
  title.textContent = item.region;
  title.style.fontSize = "13px";

  tooltip.replaceChildren(
    title,
    tooltipRow("Sales", currency.format(item.sales)),
    tooltipRow("Sales Share", formatPercent(item.share)),
    tooltipRow("Quantity Purchased", number.format(item.quantity))
  );

  tooltip.style.display = "block";
  moveTooltip(event);
};

// Interactions
let hovered = null;
let selected = null;

const updateHighlight = () => {
  const active = hovered ?? selected;

  svg.querySelectorAll("[data-index]").forEach(group => {
    const index = Number(group.dataset.index);

    group.setAttribute(
      "opacity",
      active === null || active === index ? 1 : 0.22
    );
  });

  legend.querySelectorAll("[data-index]").forEach(entry => {
    const index = Number(entry.dataset.index);

    entry.style.opacity =
      active === null || active === index ? 1 : 0.35;

    entry.style.fontWeight =
      selected === index ? "700" : "400";
  });
};

const getCategory = event => {
  const element = event.target.closest("[data-index]");
  const index = element?.dataset.index;

  return index == null ? null : categories[Number(index)];
};

const onMove = event => {
  const item = getCategory(event);

  if (!item) {
    if (hovered !== null) {
      hovered = null;
      updateHighlight();
      tooltip.style.display = "none";
    }
    return;
  }

  if (hovered !== item.index) {
    hovered = item.index;
    updateHighlight();
    showTooltip(item, event);
  } else {
    moveTooltip(event);
  }
};

const onLeave = () => {
  hovered = null;
  updateHighlight();
  tooltip.style.display = "none";
};

const onClick = event => {
  const item = getCategory(event);
  if (!item) return;

  selected = selected === item.index ? null : item.index;
  updateHighlight();
};

for (const element of [svg, legend]) {
  element.addEventListener("pointermove", onMove);
  element.addEventListener("pointerleave", onLeave);
  element.addEventListener("click", onClick);
}

// Render
wrapper.append(legend, svg);
chart.replaceChildren(wrapper, tooltip);

viz.events?.emitRenderCompletedEvent?.();