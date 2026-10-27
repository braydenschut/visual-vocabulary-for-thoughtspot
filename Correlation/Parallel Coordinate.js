/**
 * Available Columns:
 * "item type"
 * "Total sales"
 * "Target Sales"
 * "Total quantity purchased"
 * "Sales per Unit"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

const { muze, getDataFromSearchQuery } = viz;

const Fields = {
  item: "item type",
  sales: "Total sales",
  quantity: "Total quantity purchased",
  target: "Target Sales",
  unit: "Sales per Unit"
};

const LineColor = "#957247";
const HighlightColor = "#664723";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const NumberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
});

const d3 = await import(
  "https://cdn.jsdelivr.net/npm/d3@7/+esm"
);

// Read ThoughtSpot Answer
const source = await getDataFromSearchQuery();

const readField = name => {
  const field = source.getField(name);

  if (!field) throw new Error(`Missing Search field: ${name}`);

  return field.data().map(value =>
    muze.DataStore.isInvalid(value) ? null : value
  );
};

const columns = Object.fromEntries(
  Object.entries(Fields).map(([key, name]) => [
    key, readField(name)
  ])
);

// One row per Item Type, using Answer measures directly
const data = columns.item.map((name, i) => ({
  name: String(name ?? "").trim(),
  sales: Number(columns.sales[i]),
  quantity: Number(columns.quantity[i]),
  target: Number(columns.target[i]),
  unit: Number(columns.unit[i])
})).filter(row =>
  row.name &&
  ["sales", "quantity", "target", "unit"].every(
    key => Number.isFinite(row[key]) &&
      row[key] >= 0
  )
);

if (!data.length) {
  throw new Error("No valid Parallel Coordinates data found.");
}

// Measures and Formatting
const dimensions = [
  { key: "sales", label: "Sales", format: USD.format },
  {
    key: "quantity",
    label: "Quantity Purchased",
    format: NumberFormat.format
  },
  { key: "target", label: "Target Sales", format: USD.format },
  { key: "unit", label: "Sales per Unit", format: USD.format }
];

// Layout
const width = 1000;
const height = 560;

const margin = {
  top: 35,
  right: 90,
  bottom: 100,
  left: 90
};

const plotBottom = height - margin.bottom;

const x = d3.scalePoint()
  .domain(dimensions.map(d => d.key))
  .range([margin.left, width - margin.right]);

const y = Object.fromEntries(
  dimensions.map(d => [
    d.key,
    d3.scaleLinear()
      .domain([
        0,
        (d3.max(data, row => row[d.key]) || 1) * 1.05
      ])
      .nice(4)
      .range([plotBottom, margin.top])
  ])
);

// Chart Container
const chart = document.querySelector("#chart");

if (!chart) throw new Error("Chart container not found.");

chart.style.cssText = `
  position:relative;
  width:100%;
  height:100%;
  min-height:420px;
  background:#FFFFFF;
  overflow:hidden;
  font-family:Arial,sans-serif;
`;

const svg = d3.create("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("preserveAspectRatio", "xMidYMid meet")
  .style("display", "block")
  .style("width", "100%")
  .style("height", "100%");


// Vertical Axis Lines and Ticks
const axes = svg.append("g")
  .selectAll("g")
  .data(dimensions)
  .join("g")
  .attr("transform", d => `translate(${x(d.key)},0)`);

axes.each(function(d) {
  const formatTick = value => {
    if (d.key === "unit") return USD.format(value);
    if (d.key === "quantity") return d3.format("~s")(value);
    return "$" + d3.format("~s")(value);
  };

  d3.select(this).call(
    d3.axisLeft(y[d.key])
      .ticks(5)
      .tickSize(0)
      .tickPadding(8)
      .tickFormat(formatTick)
  );
});

// Remove default axis domain paths
axes.selectAll(".domain").remove();

// Style tick labels
axes.selectAll(".tick text")
  .attr("fill", "#777777")
  .attr("font-size", 11);

// Explicit vertical reference lines
axes.append("line")
  .attr("x1", 0)
  .attr("x2", 0)
  .attr("y1", margin.top)
  .attr("y2", plotBottom)
  .attr("stroke", "#B8C4C8")
  .attr("stroke-width", 1.5)
  .attr("stroke-opacity", 1)
  .attr("pointer-events", "none");

// Measure labels below the axes
axes.append("text")
  .attr("x", 0)
  .attr("y", plotBottom + 36)
  .attr("text-anchor", "middle")
  .attr("font-size", 13)
  .attr("font-weight", 600)
  .attr("fill", "#444444")
  .text(d => d.label);

// Paths
const line = d3.line();

const pathFor = row => line(
  dimensions.map(d => [
    x(d.key),
    y[d.key](row[d.key])
  ])
);

// Visible Lines
const lines = svg.append("g")
  .attr("fill", "none")
  .selectAll("path")
  .data(data)
  .join("path")
  .attr("d", pathFor)
  .attr("stroke", LineColor)
  .attr("stroke-width", 1.8)
  .attr("stroke-opacity", 0.4)
  .style("pointer-events", "none");

// Wider invisible hover targets
const hitLines = svg.append("g")
  .attr("fill", "none")
  .selectAll("path")
  .data(data)
  .join("path")
  .attr("d", pathFor)
  .attr("stroke", "transparent")
  .attr("stroke-width", 12)
  .style("cursor", "pointer");

// Dark Tooltip
const tooltip = document.createElement("div");

tooltip.style.cssText = `
  position:absolute;
  display:none;
  z-index:20;
  pointer-events:none;
  padding:10px 12px;
  background:#2F2F2F;
  color:#FFFFFF;
  border-radius:4px;
  box-shadow:0 2px 8px rgba(0,0,0,.2);
  font:12px Arial,sans-serif;
  line-height:1.6;
  white-space:nowrap;
`;

const showTooltip = (event, row) => {
  tooltip.replaceChildren();

  const title = document.createElement("strong");
  title.textContent = row.name;
  tooltip.appendChild(title);

  dimensions.forEach(d => {
    const detail = document.createElement("div");
    detail.textContent = `${d.label}: ${d.format(row[d.key])}`;
    tooltip.appendChild(detail);
  });

  tooltip.style.display = "block";

  const bounds = chart.getBoundingClientRect();

  tooltip.style.left = `${Math.max(
    8,
    Math.min(
      event.clientX - bounds.left + 14,
      bounds.width - tooltip.offsetWidth - 8
    )
  )}px`;

  tooltip.style.top = `${Math.max(
    8,
    Math.min(
      event.clientY - bounds.top - tooltip.offsetHeight - 10,
      bounds.height - tooltip.offsetHeight - 8
    )
  )}px`;
};

// Hover Highlighting
const reset = () => {
  lines
    .attr("stroke", LineColor)
    .attr("stroke-width", 1.8)
    .attr("stroke-opacity", 0.4);

  tooltip.style.display = "none";
};

hitLines
  .on("pointermove", (event, row) => {
    lines
      .attr("stroke", d =>
        d === row ? HighlightColor : LineColor
      )
      .attr("stroke-width", d =>
        d === row ? 3 : 1.8
      )
      .attr("stroke-opacity", d =>
        d === row ? 1 : 0.1
      );

    showTooltip(event, row);
  })
  .on("pointerleave", reset);

// Title
svg.append("text")
  .attr("x", width / 2)
  .attr("y", 18)
  .attr("text-anchor", "middle")
  .attr("font-size", 13)
  .attr("fill", "#777777")
  .text("Each line represents an Item Type");

// Mount
chart.replaceChildren(svg.node(), tooltip);

viz.events?.emitRenderCompletedEvent?.();