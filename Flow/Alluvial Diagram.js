/**
 * Available Columns:
 * "region"
 * "item type"
 * "Year(date)"
 * "Total sales"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

const { getDataFromSearchQuery } = viz;

const RegionField = "region";
const ItemField = "item type";
const YearField = "Year(date)";
const SalesField = "Total sales";

const Colors = [
  "#DCE8B6",
  "#C7D995",
  "#AABD67",
  "#849A45",
  "#5A7030"
];

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

// Dependencies
const [d3, sankeyModule] = await Promise.all([
  import("https://cdn.jsdelivr.net/npm/d3@7/+esm"),
  import("https://cdn.jsdelivr.net/npm/d3-sankey@0.12/+esm")
]);

const { sankey, sankeyLinkHorizontal } = sankeyModule;

// Read ThoughtSpot Data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const [regionIndex, itemIndex, yearIndex, salesIndex] = [
  RegionField, ItemField, YearField, SalesField
].map(fieldIndex);

if ([regionIndex, itemIndex, yearIndex, salesIndex].includes(-1)) {
  throw new Error(
    "Search requires region, item type, Year(date), and Total sales."
  );
}

const cellValue = value => {
  if (value == null || typeof value !== "object" ||
      value instanceof Date) return value;

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

// Use UTC to avoid year shifts around January 1.
const getYear = value => {
  const raw = cellValue(value);
  if (raw == null || raw === "") return null;

  if (raw instanceof Date) {
    return String(raw.getUTCFullYear());
  }

  const text = String(raw).trim();

  if (/^\d{4}$/.test(text)) return text;

  const iso = text.match(/^(\d{4})-\d{2}-\d{2}/);
  if (iso) return iso[1];

  const number = Number(raw);
  if (Number.isFinite(number) && Math.abs(number) >= 1e9) {
    const date = new Date(
      Math.abs(number) < 1e11 ? number * 1000 : number
    );
    return Number.isNaN(date.getTime())
      ? null : String(date.getUTCFullYear());
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime())
    ? null : String(date.getUTCFullYear());
};

// Aggregate Sales for each Region / Item / Year combination
const combinations = new Map();

for (const row of result.data || []) {
  const region = String(cellValue(row[regionIndex]) ?? "").trim();
  const item = String(cellValue(row[itemIndex]) ?? "").trim();
  const year = getYear(row[yearIndex]);

  const rawSales = cellValue(row[salesIndex]);
  const sales = rawSales == null || rawSales === ""
    ? NaN : Number(rawSales);

  if (!region || !item || !year ||
      !Number.isFinite(sales) || sales <= 0) continue;

  const key = JSON.stringify([region, item, year]);
  combinations.set(key, (combinations.get(key) || 0) + sales);
}

if (!combinations.size) {
  throw new Error("No valid Alluvial data found.");
}

// Build shared category totals and adjacent-stage links
const stageTotals = [new Map(), new Map(), new Map()];
const linkTotals = new Map();

for (const [key, sales] of combinations) {
  const values = JSON.parse(key);

  values.forEach((value, stage) => {
    const totals = stageTotals[stage];
    totals.set(value, (totals.get(value) || 0) + sales);
  });

  for (let stage = 0; stage < 2; stage++) {
    const linkKey = JSON.stringify([
      stage, values[stage], values[stage + 1]
    ]);
    linkTotals.set(
      linkKey, (linkTotals.get(linkKey) || 0) + sales
    );
  }
}

const stageNames = ["Region", "Item Type", "Year"];

const categories = stageTotals.map((totals, stage) =>
  [...totals.keys()].sort((a, b) =>
    stage === 2
      ? Number(a) - Number(b)
      : totals.get(b) - totals.get(a)
  )
);

const nodes = categories.flatMap((names, stage) =>
  names.map((name, order) => ({
    id: JSON.stringify([stage, name]),
    name,
    stage,
    order
  }))
);

const links = [...linkTotals].map(([key, value]) => {
  const [stage, sourceName, targetName] = JSON.parse(key);

  return {
    source: JSON.stringify([stage, sourceName]),
    target: JSON.stringify([stage + 1, targetName]),
    value
  };
});

// Colors by stage
const regionColors = new Map(
  categories[0].map((name, i) => [
    name, Colors[i % Colors.length]
  ])
);

const nodeColor = node =>
  node.stage === 0
    ? regionColors.get(node.name)
    : node.stage === 1
      ? "#AABD67"
      : "#849A45";

// Chart Container
const chart = document.querySelector("#chart");

if (!chart) {
  throw new Error("Chart container #chart not found.");
}

chart.style.cssText = `
  position:relative;
  width:100%;
  height:100%;
  min-height:460px;
  background:#FFFFFF;
  overflow:hidden;
  box-sizing:border-box;
  font-family:Arial,sans-serif;
`;

// Give long Item Type lists enough vertical room
const width = 1120;
const height = Math.max(480, categories[1].length * 34 + 60);

const svg = d3.create("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("preserveAspectRatio", "xMidYMid meet")
  .style("display", "block")
  .style("width", "100%")
  .style("height", "100%");

// Three-column alluvial layout
const graph = sankey()
  .nodeId(d => d.id)
  .nodeWidth(18)
  .nodePadding(12)
  .nodeSort((a, b) => a.order - b.order)
  .iterations(24)
  .extent([
    [135, 30],
    [width - 150, height - 25]
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

const showTooltip = (event, title, details) => {
  tooltip.replaceChildren();

  const heading = document.createElement("strong");
  heading.textContent = title;
  tooltip.appendChild(heading);

  for (const line of details) {
    const detail = document.createElement("div");
    detail.textContent = line;
    tooltip.appendChild(detail);
  }

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

const hideTooltip = () => {
  tooltip.style.display = "none";
};

// Connections
const ribbons = svg.append("g")
  .attr("fill", "none")
  .selectAll("path")
  .data(graph.links)
  .join("path")
  .attr("d", sankeyLinkHorizontal())
  .attr("stroke", d =>
    d.source.stage === 0
      ? regionColors.get(d.source.name)
      : "#849A45"
  )
  .attr("stroke-opacity", 0.4)
  .attr("stroke-width", d => Math.max(1, d.width))
  .style("cursor", "pointer");

ribbons
  .on("pointermove", function(event, d) {
    ribbons.attr("stroke-opacity", 0.12);
    d3.select(this).attr("stroke-opacity", 0.85);

    showTooltip(
      event,
      `${d.source.name} → ${d.target.name}`,
      [`Sales: ${USD.format(d.value)}`]
    );
  })
  .on("pointerleave", () => {
    ribbons.attr("stroke-opacity", 0.4);
    hideTooltip();
  });

// Category nodes and labels
const nodeGroups = svg.append("g")
  .selectAll("g")
  .data(graph.nodes)
  .join("g");

nodeGroups.append("rect")
  .attr("x", d => d.x0)
  .attr("y", d => d.y0)
  .attr("width", d => d.x1 - d.x0)
  .attr("height", d => Math.max(1, d.y1 - d.y0))
  .attr("rx", 2)
  .attr("fill", nodeColor)
  .attr("stroke", "#FFFFFF")
  .attr("stroke-width", 1);

nodeGroups.append("text")
  .attr("x", d =>
    d.stage === 2 ? d.x1 + 8 : d.x0 - 8
  )
  .attr("y", d => (d.y0 + d.y1) / 2)
  .attr("dy", "0.35em")
  .attr("text-anchor", d =>
    d.stage === 2 ? "start" : "end"
  )
  .attr("font-size", 11)
  .attr("fill", "#333333")
  .text(d => d.name)
  .style("pointer-events", "none");

nodeGroups
  .on("pointermove", (event, d) => {
    showTooltip(event, `${stageNames[d.stage]}: ${d.name}`, [
      `Sales: ${USD.format(d.value)}`
    ]);
  })
  .on("pointerleave", hideTooltip);

// Column headings
const columnX = [
  graph.nodes.find(d => d.stage === 0)?.x0,
  graph.nodes.find(d => d.stage === 1)?.x0,
  graph.nodes.find(d => d.stage === 2)?.x0
];

stageNames.forEach((name, stage) => {
  svg.append("text")
    .attr("x", columnX[stage])
    .attr("y", 16)
    .attr("font-size", 12)
    .attr("font-weight", 600)
    .attr("fill", "#555555")
    .text(name);
});

chart.replaceChildren(svg.node(), tooltip);

viz.events?.emitRenderCompletedEvent?.();