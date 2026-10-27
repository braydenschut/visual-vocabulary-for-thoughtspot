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

const RegionColors = {
  East: "#0354A6",
  Midwest: "#2778C2",
  South: "#559AD4",
  Southwest: "#85B7E3",
  West: "#B5D6F0"
};

const Palette = [
  ...Object.values(RegionColors),
  "#02366C", "#418BC9", "#70AAD9",
  "#9AC5E8", "#D5E8F7"
];

const GridSize = 10;
const TotalSquares = GridSize ** 2;
const CellSize = 30;
const Padding = 2;

const svgNS = "http://www.w3.org/2000/svg";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const quantityFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
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

  const rawSales = cellValue(row[salesIndex]);
  const rawQuantity = cellValue(row[quantityIndex]);

  const sales = rawSales == null || rawSales === ""
    ? NaN : Number(rawSales);

  const quantity = rawQuantity == null || rawQuantity === ""
    ? NaN : Number(rawQuantity);

  if (
    !region ||
    !Number.isFinite(sales) ||
    !Number.isFinite(quantity)
  ) continue;

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

const totalQuantity = [...totals.values()]
  .reduce((sum, item) => sum + item.quantity, 0);

if (
  totalSales <= 0 ||
  [...totals.values()].some(item => item.sales < 0)
) {
  throw new Error(
    "Waffle Chart requires positive, nonnegative Region Sales."
  );
}

// Prepare Categories
const categories = [...totals.entries()]
  .map(([name, values]) => ({
    name,
    ...values,
    salesShare: values.sales / totalSales * 100,
    quantityShare: totalQuantity > 0
      ? values.quantity / totalQuantity * 100
      : 0
  }))
  .sort((a, b) =>
    b.sales - a.sales || a.name.localeCompare(b.name)
  )
  .map((item, index) => {
    const known = Object.keys(RegionColors).find(
      region => region.toLowerCase() === item.name.toLowerCase()
    );

    return {
      ...item,
      index,
      color: known
        ? RegionColors[known]
        : Palette[index % Palette.length]
    };
  });

// Allocate Exactly 100 Squares
let allocated = 0;

for (const item of categories) {
  const exact = item.salesShare * TotalSquares / 100;

  item.squares = Math.floor(exact);
  item.remainder = exact - item.squares;

  allocated += item.squares;
}

const remaining = TotalSquares - allocated;

const remainderOrder = [...categories].sort(
  (a, b) => b.remainder - a.remainder || a.index - b.index
);

for (let i = 0; i < remaining; i++) {
  remainderOrder[i].squares++;
}

const squares = categories.flatMap(
  item => Array(item.squares).fill(item)
);

// SVG Helper
const svgElement = (tag, attrs = {}) => {
  const element = document.createElementNS(svgNS, tag);

  Object.entries(attrs).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  return element;
};

// Chart Container
const chart = document.querySelector("#chart");

if (!chart) throw new Error("Missing #chart.");

chart.__waffleCleanup?.();

chart.style.cssText = `
  width:100%;
  height:100%;
  min-height:0;
  position:relative;
  overflow:auto;
  box-sizing:border-box;
  font-family:Arial,sans-serif;
  color:#555;
`;

const wrapper = document.createElement("div");

wrapper.style.cssText = `
  display:flex;
  align-items:center;
  justify-content:center;
  flex-wrap:wrap;
  gap:32px;
  width:100%;
  min-height:100%;
  padding:20px 24px;
  box-sizing:border-box;
`;

// Waffle Grid
const svg = svgElement("svg", {
  viewBox: "0 0 300 300",
  role: "img",
  "aria-label": "Sales Share by Region Waffle Chart"
});

svg.style.cssText = `
  display:block;
  width:100%;
  max-width:400px;
  height:auto;
  flex:0 1 400px;
  overflow:visible;
`;

squares.forEach((item, index) => {
  const col = index % GridSize;
  const row = Math.floor(index / GridSize);

  const rect = svgElement("rect", {
    x: col * CellSize + Padding,
    y: row * CellSize + Padding,
    width: CellSize - Padding * 2,
    height: CellSize - Padding * 2,
    rx: 2,
    fill: item.color,
    "data-index": item.index
  });

  rect.style.cursor = "pointer";
  rect.style.transition = "opacity 120ms ease";

  svg.appendChild(rect);
});

// Interactive Region Legend
const legend = document.createElement("div");

legend.style.cssText = `
  display:flex;
  flex-direction:column;
  gap:7px;
  min-width:190px;
  max-width:280px;
  flex:0 1 240px;
  font-size:13px;
`;

categories.forEach(item => {
  const entry = document.createElement("button");

  entry.type = "button";
  entry.dataset.index = item.index;

  entry.style.cssText = `
    display:flex;
    align-items:center;
    gap:10px;
    padding:7px 8px;
    width:100%;
    border:1px solid transparent;
    border-radius:5px;
    background:transparent;
    color:#444;
    text-align:left;
    font:13px Arial,sans-serif;
    cursor:pointer;
  `;

  const swatch = document.createElement("span");
  swatch.style.cssText = `
    width:13px;
    height:13px;
    flex-shrink:0;
    border-radius:2px;
    background:${item.color};
  `;

  const label = document.createElement("span");
  label.textContent = item.name;
  label.style.flex = "1";

  const share = document.createElement("strong");
  share.textContent = formatPercent(item.salesShare);

  entry.append(swatch, label, share);
  legend.appendChild(entry);
});

// Tooltip
const tooltip = document.createElement("div");

tooltip.style.cssText = `
  position:absolute;
  z-index:100;
  pointer-events:none;
  display:none;
  background:#454954;
  color:#fff;
  padding:12px 14px;
  border-radius:7px;
  box-shadow:0 4px 16px rgba(0,0,0,.13);
  font:12px Arial,sans-serif;
  min-width:255px;
  max-width:320px;
  box-sizing:border-box;
`;

const tooltipRow = (label, value) => {
  const row = document.createElement("div");
  row.style.cssText = `
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:24px;
    margin-top:7px;
  `;

  const name = document.createElement("span");
  name.textContent = label;

  const result = document.createElement("strong");
  result.style.whiteSpace = "nowrap";
  result.textContent = value;

  row.append(name, result);
  return row;
};

const positionTooltip = event => {
  const bounds = chart.getBoundingClientRect();

  const x = event.clientX - bounds.left + chart.scrollLeft;
  const y = event.clientY - bounds.top + chart.scrollTop;

  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;

  const minX = chart.scrollLeft + 4;
  const minY = chart.scrollTop + 4;
  const maxX = chart.scrollLeft + chart.clientWidth - 8;
  const maxY = chart.scrollTop + chart.clientHeight - 8;

  let left = x + 14;
  let top = y - height - 10;

  if (left + width > maxX) left = x - width - 14;
  if (top < minY) top = y + 16;

  tooltip.style.left = `${Math.max(
    minX,
    Math.min(left, maxX - width)
  )}px`;

  tooltip.style.top = `${Math.max(
    minY,
    Math.min(top, maxY - height)
  )}px`;
};

const showTooltip = (item, event) => {
  const title = document.createElement("strong");
  title.textContent = item.name;
  title.style.fontSize = "13px";

  tooltip.replaceChildren(
    title,
    tooltipRow(
      "Sales",
      `${currency.format(item.sales)} (${formatPercent(item.salesShare)})`
    ),
    tooltipRow(
      "Quantity Purchased",
      `${quantityFormatter.format(item.quantity)} (${formatPercent(item.quantityShare)})`
    ),
    tooltipRow("Squares", String(item.squares))
  );

  tooltip.style.display = "block";
  positionTooltip(event);
};

// Interactions
let hovered = null;
let selected = null;

const updateHighlight = () => {
  const active = hovered ?? selected;

  svg.querySelectorAll("[data-index]").forEach(rect => {
    const index = Number(rect.dataset.index);
    const match = active === null || active === index;

    rect.setAttribute("opacity", match ? 1 : 0.18);

    if (active !== null && index === active) {
      rect.setAttribute("stroke", "#FFFFFF");
      rect.setAttribute("stroke-width", 0.7);
    } else {
      rect.removeAttribute("stroke");
      rect.removeAttribute("stroke-width");
    }
  });

  legend.querySelectorAll("[data-index]").forEach(entry => {
    const index = Number(entry.dataset.index);

    entry.style.opacity =
      active === null || active === index ? 1 : 0.35;

    entry.style.background =
      selected === index ? "#EDF3FA" :
      active === index ? "#F5F8FC" : "transparent";

    entry.style.borderColor =
      selected === index ? "#C9DCEF" : "transparent";

    entry.setAttribute("aria-pressed", String(selected === index));
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
    positionTooltip(event);
  }
};

const onLeave = () => {
  hovered = null;
  updateHighlight();
  tooltip.style.display = "none";
};

const onClick = event => {
  const item = getCategory(event);

  if (!item) {
    selected = null;
  } else {
    selected = selected === item.index
      ? null
      : item.index;
  }

  updateHighlight();
};

for (const element of [svg, legend]) {
  element.addEventListener("pointermove", onMove);
  element.addEventListener("pointerleave", onLeave);
  element.addEventListener("click", onClick);
}

// Responsive Sizing
const resizeChart = () => {
  const width = chart.clientWidth;
  const height = chart.clientHeight;

  const sideBySide = width >= 560;

  wrapper.style.flexDirection =
    sideBySide ? "row" : "column";

  const availableWidth = sideBySide
    ? width - 350
    : width - 48;

  const availableHeight = sideBySide
    ? height - 48
    : height * 0.55;

  const size = Math.max(
    150,
    Math.min(400, availableWidth, availableHeight)
  );

  svg.style.maxWidth = `${size}px`;
};

wrapper.append(svg, legend);
chart.replaceChildren(wrapper, tooltip);

resizeChart();
updateHighlight();

const resizeObserver = typeof ResizeObserver !== "undefined"
  ? new ResizeObserver(resizeChart)
  : null;

resizeObserver?.observe(chart);

chart.__waffleCleanup = () => {
  resizeObserver?.disconnect();

  for (const element of [svg, legend]) {
    element.removeEventListener("pointermove", onMove);
    element.removeEventListener("pointerleave", onLeave);
    element.removeEventListener("click", onClick);
  }
};

viz.events?.emitRenderCompletedEvent?.();