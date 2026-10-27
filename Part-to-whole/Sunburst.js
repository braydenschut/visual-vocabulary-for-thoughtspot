/**
 * Available Columns:
 * "region"
 * "item type"
 * "Total sales"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */


const { muze, getDataFromSearchQuery } = viz;

const RegionField = "region";
const ItemField = "item type";
const SalesField = "Total sales";

// Part-to-Whole Region Colors
const RegionColors = {
  East: "#0354A6",
  Midwest: "#2778C2",
  South: "#559AD4",
  Southwest: "#85B7E3",
  West: "#B5D6F0"
};

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const CompactUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1
});

const Percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1
});

const d3 = await import(
  "https://cdn.jsdelivr.net/npm/d3@7/+esm"
);

// Read ThoughtSpot Answer
const source = await getDataFromSearchQuery();

const readField = name => {
  const field = source.getField(name);

  if (!field) {
    throw new Error(`Missing Search field: ${name}`);
  }

  return field.data().map(value =>
    muze.DataStore.isInvalid(value) ? null : value
  );
};

const regions = readField(RegionField);
const items = readField(ItemField);
const sales = readField(SalesField);

// Aggregate Sales by Region and Item Type
const totals = new Map();

regions.forEach((region, i) => {
  const name = String(region ?? "").trim();
  const item = String(items[i] ?? "").trim();
  const value = sales[i] == null ? NaN : Number(sales[i]);

  if (!name || !item || !Number.isFinite(value) || value <= 0) {
    return;
  }

  if (!totals.has(name)) {
    totals.set(name, new Map());
  }

  const values = totals.get(name);
  values.set(item, (values.get(item) || 0) + value);
});

if (!totals.size) {
  throw new Error("No valid Sunburst data found.");
}

// Build Hierarchy
const hierarchyData = {
  name: "Sales",
  children: [...totals].map(([name, values]) => ({
    name,
    children: [...values].map(([item, value]) => ({
      name: item,
      value
    }))
  }))
};

const root = d3.hierarchy(hierarchyData)
  .sum(d => d.value || 0)
  .sort((a, b) => b.value - a.value);

d3.partition()
  .size([2 * Math.PI, 1])(root);

// Region Colors and Lighter Item Type Shades
const colorFor = d => {
  const region = d.depth === 1 ? d : d.parent;
  const base = d3.color(
    RegionColors[region.data.name] || "#0354A6"
  );

  return d.depth === 1
    ? base.formatHex()
    : base.brighter(0.15).formatHex();
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
  min-height:430px;
  background:#FFFFFF;
  overflow:hidden;
  font-family:Arial,sans-serif;
`;

// Chart Layout
const width = 800;
const height = 660;
const radius = 240;

const svg = d3.create("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("preserveAspectRatio", "xMidYMid meet")
  .style("display", "block")
  .style("width", "100%")
  .style("height", "100%");

const diagram = svg.append("g")
  .attr("transform", `translate(${width / 2},${height / 2})`);

// Inner Hole and Two Rings
const ringRadius = d =>
  d.depth === 1 ? [72, 155] : [158, radius];

const arc = d3.arc()
  .startAngle(d => d.x0)
  .endAngle(d => d.x1)
  .padAngle(0.004)
  .padRadius(155)
  .innerRadius(d => ringRadius(d)[0])
  .outerRadius(d => ringRadius(d)[1]);

const nodes = root.descendants().filter(d => d.depth > 0);

// Draw Segments
const segments = diagram.append("g")
  .selectAll("path")
  .data(nodes)
  .join("path")
  .attr("d", arc)
  .attr("fill", colorFor)
  .attr("stroke", "#FFFFFF")
  .attr("stroke-width", 1)
  .style("cursor", "pointer");

// Region Labels Only
diagram.append("g")
  .attr("pointer-events", "none")
  .selectAll("text")
  .data(nodes.filter(d => d.depth === 1))
  .join("text")
  .attr("transform", d => {
    const angle = (d.x0 + d.x1) / 2;
    const [inner, outer] = ringRadius(d);
    const r = (inner + outer) / 2;

    const degrees = angle * 180 / Math.PI - 90;
    const flip = angle > Math.PI ? 180 : 0;

    return `rotate(${degrees}) translate(${r},0) rotate(${flip})`;
  })
  .attr("text-anchor", "middle")
  .attr("dominant-baseline", "middle")
  .attr("font-size", 12)
  .attr("font-weight", 600)
  .attr("fill", d =>
    ["East", "Midwest"].includes(d.data.name)
      ? "#FFFFFF"
      : "#253547"
  )
  .text(d => d.data.name);

// Center Summary
const centerTitle = diagram.append("text")
  .attr("text-anchor", "middle")
  .attr("y", -14)
  .attr("font-size", 13)
  .attr("font-weight", 600)
  .attr("fill", "#555555")
  .text("Sales");

const centerValue = diagram.append("text")
  .attr("text-anchor", "middle")
  .attr("y", 10)
  .attr("font-size", 17)
  .attr("font-weight", 600)
  .attr("fill", "#253547")
  .text(CompactUSD.format(root.value));

const centerDetail = diagram.append("text")
  .attr("text-anchor", "middle")
  .attr("y", 30)
  .attr("font-size", 11)
  .attr("fill", "#777777");

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
  font:12px Arial,sans-serif;
  line-height:1.5;
  white-space:nowrap;
  box-shadow:0 2px 8px rgba(0,0,0,.18);
`;

const showTooltip = (event, d) => {
  tooltip.replaceChildren();

  const title = document.createElement("strong");

  title.textContent = d.ancestors()
    .reverse()
    .slice(1)
    .map(node => node.data.name)
    .join(" | ");

  tooltip.appendChild(title);

  const details = [
    `Sales: ${USD.format(d.value)}`,
    `Share of Total: ${Percent.format(d.value / root.value)}`
  ];

  if (d.depth === 2) {
    details.push(
      `Share of Region: ${Percent.format(d.value / d.parent.value)}`
    );
  }

  details.forEach(value => {
    const row = document.createElement("div");
    row.textContent = value;
    tooltip.appendChild(row);
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
segments
  .on("pointermove", (event, d) => {
    segments.attr("fill-opacity", node =>
      node === d ||
      node.ancestors().includes(d) ||
      d.ancestors().includes(node)
        ? 1
        : 0.25
    );

    centerTitle.text(d.data.name);
    centerValue.text(CompactUSD.format(d.value));
    centerDetail.text(
      `${Percent.format(d.value / root.value)} of total`
    );

    showTooltip(event, d);
  })
  .on("pointerleave", () => {
    segments.attr("fill-opacity", 1);

    centerTitle.text("Sales");
    centerValue.text(CompactUSD.format(root.value));
    centerDetail.text("");

    tooltip.style.display = "none";
  });

// Mount
chart.replaceChildren(svg.node(), tooltip);

viz.events?.emitRenderCompletedEvent?.();