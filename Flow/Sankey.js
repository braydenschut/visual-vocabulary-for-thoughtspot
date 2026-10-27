/**
 * Available Columns:
 * "region"
 * "item type"
 * "Total sales"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

const { getDataFromSearchQuery } = viz;

const RegionField = "region";
const ItemField = "item type";
const SalesField = "Total sales";

const StartColor = "#DCE8B6";
const EndColor = "#5A7030";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

// Sankey Dependencies
const [d3, sankeyModule] = await Promise.all([
  import("https://cdn.jsdelivr.net/npm/d3@7/+esm"),
  import("https://cdn.jsdelivr.net/npm/d3-sankey@0.12/+esm")
]);

const {
  sankey,
  sankeyLinkHorizontal
} = sankeyModule;

// Original ThoughtSpot Data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const [regionIndex, itemIndex, salesIndex] = [
  RegionField,
  ItemField,
  SalesField
].map(fieldIndex);

if ([regionIndex, itemIndex, salesIndex].includes(-1)) {
  throw new Error(
    "Search requires region, item type, and Total sales."
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

// Aggregate Sales by Region and Item Type
const totals = new Map();

for (const row of result.data || []) {
  const region = String(
    cellValue(row[regionIndex]) ?? ""
  ).trim();

  const item = String(
    cellValue(row[itemIndex]) ?? ""
  ).trim();

  const raw = cellValue(row[salesIndex]);
  const sales = raw == null || raw === ""
    ? NaN
    : Number(raw);

  if (
    !region ||
    !item ||
    !Number.isFinite(sales) ||
    sales <= 0
  ) continue;

  const key = JSON.stringify([region, item]);

  totals.set(key, (totals.get(key) || 0) + sales);
}

if (!totals.size) {
  throw new Error(
    "No valid Region–Item Type Sales data found."
  );
}

// Build Sankey Nodes and Links
const regionTotals = new Map();
const itemTotals = new Map();

const records = [...totals].map(([key, sales]) => {
  const [region, item] = JSON.parse(key);

  regionTotals.set(
    region,
    (regionTotals.get(region) || 0) + sales
  );

  itemTotals.set(
    item,
    (itemTotals.get(item) || 0) + sales
  );

  return { region, item, sales };
});

const regions = [...regionTotals.keys()].sort(
  (a, b) => regionTotals.get(b) - regionTotals.get(a)
);

const items = [...itemTotals.keys()].sort(
  (a, b) => itemTotals.get(b) - itemTotals.get(a)
);

// Prefix identifiers so names cannot collide.
const nodes = [
  ...regions.map((name, index) => ({
    id: `region:${name}`,
    name,
    side: "region",
    order: index
  })),
  ...items.map((name, index) => ({
    id: `item:${name}`,
    name,
    side: "item",
    order: index
  }))
];

const links = records.map(record => ({
  source: `region:${record.region}`,
  target: `item:${record.item}`,
  value: record.sales
}));

// Flow Palette
const regionColor = d3.scaleLinear()
  .domain([0, Math.max(1, regions.length - 1)])
  .range([StartColor, EndColor])
  .interpolate(d3.interpolateRgb);

const regionColors = new Map(
  regions.map((region, index) => [
    region,
    regionColor(index)
  ])
);

// Chart Container
const chart = document.querySelector("#chart");

if (!chart) {
  throw new Error("Chart container not found.");
}

chart.style.cssText = `
  position:relative;
  width:100%;
  height:100%;
  min-height:440px;
  overflow:hidden;
  background:#FFFFFF;
  box-sizing:border-box;
  font-family:Arial,sans-serif;
`;

const width = 1000;
const height = Math.max(460, items.length * 34 + 50);

const svg = d3.create("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("preserveAspectRatio", "xMidYMid meet")
  .style("display", "block")
  .style("width", "100%")
  .style("height", "100%");

// Calculate Sankey Layout
const graph = sankey()
  .nodeId(node => node.id)
  .nodeWidth(18)
  .nodePadding(12)
  .nodeSort((a, b) => a.order - b.order)
  .extent([
    [130, 25],
    [width - 160, height - 25]
  ])({
    nodes: nodes.map(node => ({ ...node })),
    links: links.map(link => ({ ...link }))
  });

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

const showTooltip = (event, title, lines) => {
  tooltip.replaceChildren();

  const heading = document.createElement("strong");
  heading.textContent = title;
  tooltip.appendChild(heading);

  lines.forEach(line => {
    const detail = document.createElement("div");
    detail.textContent = line;
    tooltip.appendChild(detail);
  });

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

const hideTooltip = () => {
  tooltip.style.display = "none";
};

// Sankey Ribbons
const ribbonLayer = svg.append("g")
  .attr("fill", "none");

ribbonLayer.selectAll("path")
  .data(graph.links)
  .join("path")
  .attr("d", sankeyLinkHorizontal())
  .attr("stroke", d =>
    regionColors.get(d.source.name)
  )
  .attr("stroke-width", d => Math.max(1, d.width))
  .attr("stroke-opacity", 0.42)
  .style("cursor", "pointer")
  .on("pointermove", function(event, d) {
    ribbonLayer.selectAll("path")
      .attr("stroke-opacity", 0.12);

    d3.select(this).attr("stroke-opacity", 0.8);

    showTooltip(event, `${d.source.name} → ${d.target.name}`, [
      `Sales: ${USD.format(d.value)}`
    ]);
  })
  .on("pointerleave", () => {
    ribbonLayer.selectAll("path")
      .attr("stroke-opacity", 0.42);

    hideTooltip();
  });

// Sankey Nodes
const nodeLayer = svg.append("g");

const nodeGroups = nodeLayer.selectAll("g")
  .data(graph.nodes)
  .join("g");

nodeGroups.append("rect")
  .attr("x", d => d.x0)
  .attr("y", d => d.y0)
  .attr("width", d => d.x1 - d.x0)
  .attr("height", d => Math.max(1, d.y1 - d.y0))
  .attr("rx", 2)
  .attr("fill", d =>
    d.side === "region"
      ? regionColors.get(d.name)
      : "#AABD67"
  )
  .attr("stroke", "#FFFFFF")
  .attr("stroke-width", 1)
  .style("cursor", "pointer");

nodeGroups.append("text")
  .attr("x", d =>
    d.side === "region" ? d.x0 - 9 : d.x1 + 9
  )
  .attr("y", d => (d.y0 + d.y1) / 2)
  .attr("dy", "0.35em")
  .attr("text-anchor", d =>
    d.side === "region" ? "end" : "start"
  )
  .attr("font-size", 12)
  .attr("font-weight", 500)
  .attr("fill", "#333333")
  .text(d => d.name)
  .style("pointer-events", "none");

nodeGroups
  .on("pointermove", (event, d) => {
    showTooltip(event, d.name, [
      `Total Sales: ${USD.format(d.value)}`
    ]);
  })
  .on("pointerleave", hideTooltip);

// Column Titles
svg.append("text")
  .attr("x", 130)
  .attr("y", 13)
  .attr("font-size", 12)
  .attr("font-weight", 600)
  .attr("fill", "#555555")
  .text("Region");

svg.append("text")
  .attr("x", width - 160)
  .attr("y", 13)
  .attr("text-anchor", "end")
  .attr("font-size", 12)
  .attr("font-weight", 600)
  .attr("fill", "#555555")
  .text("Item Type");

// Mount Visualization
chart.replaceChildren(svg.node(), tooltip);

viz.events?.emitRenderCompletedEvent?.();