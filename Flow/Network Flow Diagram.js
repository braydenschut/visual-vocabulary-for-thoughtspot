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

const RegionColor = "#5A7030";
const ItemColor = "#AABD67";
const LinkColor = "#849A45";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

// D3 Dependency
const d3 = await import(
  "https://cdn.jsdelivr.net/npm/d3@7/+esm"
);

// Read ThoughtSpot Data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const [regionIndex, itemIndex, salesIndex] = [
  RegionField, ItemField, SalesField
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
        typeof raw === "function"
          ? raw.call(value)
          : raw
      );
    }
  }

  return null;
};

// Aggregate Region–Item Type Sales
const totals = new Map();
const regionTotals = new Map();
const itemTotals = new Map();

for (const row of result.data || []) {
  const region = String(
    cellValue(row[regionIndex]) ?? ""
  ).trim();

  const item = String(
    cellValue(row[itemIndex]) ?? ""
  ).trim();

  const raw = cellValue(row[salesIndex]);
  const sales = raw == null || raw === ""
    ? NaN : Number(raw);

  if (
    !region ||
    !item ||
    !Number.isFinite(sales) ||
    sales <= 0
  ) continue;

  const key = JSON.stringify([region, item]);

  totals.set(key, (totals.get(key) || 0) + sales);
  regionTotals.set(
    region,
    (regionTotals.get(region) || 0) + sales
  );
  itemTotals.set(
    item,
    (itemTotals.get(item) || 0) + sales
  );
}

if (!totals.size) {
  throw new Error("No valid network data found.");
}

// Nodes and Weighted Links
const regions = [...regionTotals.keys()].sort(
  (a, b) => regionTotals.get(b) - regionTotals.get(a)
);

const items = [...itemTotals.keys()].sort(
  (a, b) => itemTotals.get(b) - itemTotals.get(a)
);

const nodes = [
  ...regions.map(name => ({
    id: `region:${name}`,
    name,
    type: "region",
    value: regionTotals.get(name)
  })),
  ...items.map(name => ({
    id: `item:${name}`,
    name,
    type: "item",
    value: itemTotals.get(name)
  }))
];

const links = [...totals].map(([key, value]) => {
  const [region, item] = JSON.parse(key);

  return {
    source: `region:${region}`,
    target: `item:${item}`,
    value
  };
});

// Chart Container
const chart = document.querySelector("#chart");

if (!chart) {
  throw new Error("Chart container not found.");
}

// Stop any previous simulation on rerender
chart.__networkCleanup?.();

chart.style.cssText = `
  position:relative;
  width:100%;
  height:100%;
  min-height:480px;
  background:#FFFFFF;
  overflow:hidden;
  box-sizing:border-box;
  font-family:Arial,sans-serif;
`;

const width = 1050;
const height = 680;

const svg = d3.create("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("preserveAspectRatio", "xMidYMid meet")
  .style("display", "block")
  .style("width", "100%")
  .style("height", "100%");

// Scale visual sizes by Sales
const nodeSize = d3.scaleSqrt()
  .domain([0, d3.max(nodes, d => d.value)])
  .range([7, 23]);

const linkSize = d3.scaleSqrt()
  .domain([0, d3.max(links, d => d.value)])
  .range([1, 9]);

// Place Regions and Item Types on opposite sides
const simulation = d3.forceSimulation(nodes)
  .force("link", d3.forceLink(links)
    .id(d => d.id)
    .distance(175)
    .strength(0.18))
  .force("charge", d3.forceManyBody().strength(-430))
  .force("collision", d3.forceCollide()
    .radius(d => nodeSize(d.value) + 14))
  .force("x", d3.forceX(d =>
    d.type === "region" ? width * 0.3 : width * 0.7
  ).strength(0.35))
  .force("y", d3.forceY(height / 2).strength(0.07));

// Tooltip
const tooltip = document.createElement("div");

tooltip.style.cssText = `
  position:absolute;
  display:none;
  z-index:20;
  pointer-events:none;
  background:#2F2F2F;
  color:#FFFFFF;
  padding:9px 12px;
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

  for (const line of lines) {
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

// Network Connections
const linkLayer = svg.append("g")
  .attr("fill", "none")
  .selectAll("line")
  .data(links)
  .join("line")
  .attr("stroke", LinkColor)
  .attr("stroke-width", d => linkSize(d.value))
  .attr("stroke-opacity", 0.32)
  .style("cursor", "pointer");

linkLayer
  .on("pointermove", function(event, d) {
    linkLayer.attr("stroke-opacity", 0.08);
    d3.select(this).attr("stroke-opacity", 0.9);

    showTooltip(
      event,
      `${d.source.name} → ${d.target.name}`,
      [`Sales: ${USD.format(d.value)}`]
    );
  })
  .on("pointerleave", () => {
    linkLayer.attr("stroke-opacity", 0.32);
    hideTooltip();
  });

// Network Nodes
const nodeLayer = svg.append("g")
  .selectAll("g")
  .data(nodes)
  .join("g")
  .style("cursor", "pointer");

nodeLayer.append("circle")
  .attr("r", d => nodeSize(d.value))
  .attr("fill", d =>
    d.type === "region" ? RegionColor : ItemColor
  )
  .attr("stroke", "#FFFFFF")
  .attr("stroke-width", 1.5);

nodeLayer.append("text")
  .attr("x", d =>
    d.type === "region"
      ? -nodeSize(d.value) - 9
      : nodeSize(d.value) + 9
  )
  .attr("dy", "0.35em")
  .attr("text-anchor", d =>
    d.type === "region" ? "end" : "start"
  )
  .attr("font-size", 12)
  .attr("fill", "#333333")
  .text(d => d.name)
  .style("pointer-events", "none");

nodeLayer
  .on("pointermove", (event, d) => {
    showTooltip(event, d.name, [
      d.type === "region" ? "Region" : "Item Type",
      `Total Sales: ${USD.format(d.value)}`
    ]);
  })
  .on("pointerleave", hideTooltip);

// Simulation Updates
simulation.on("tick", () => {
  linkLayer
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y);

  nodeLayer.attr("transform", d => {
    const radius = nodeSize(d.value);
    const padding = radius + 105;

    d.x = Math.max(
      padding,
      Math.min(width - padding, d.x)
    );

    d.y = Math.max(
      radius + 15,
      Math.min(height - radius - 15, d.y)
    );

    return `translate(${d.x},${d.y})`;
  });
});

// Column Labels
svg.append("text")
  .attr("x", width * 0.3)
  .attr("y", 32)
  .attr("text-anchor", "middle")
  .attr("font-size", 14)
  .attr("font-weight", 600)
  .attr("fill", "#555555")
  .text("Regions");

svg.append("text")
  .attr("x", width * 0.7)
  .attr("y", 32)
  .attr("text-anchor", "middle")
  .attr("font-size", 14)
  .attr("font-weight", 600)
  .attr("fill", "#555555")
  .text("Item Types");

// Legend
const legend = svg.append("g")
  .attr("transform", `translate(${width / 2 - 105},${height - 24})`);

[
  ["Region", RegionColor, 0],
  ["Item Type", ItemColor, 120]
].forEach(([label, color, x]) => {
  legend.append("circle")
    .attr("cx", x)
    .attr("cy", 0)
    .attr("r", 6)
    .attr("fill", color);

  legend.append("text")
    .attr("x", x + 12)
    .attr("y", 4)
    .attr("font-size", 11)
    .attr("fill", "#555555")
    .text(label);
});

// Mount and Cleanup
chart.replaceChildren(svg.node(), tooltip);

chart.__networkCleanup = () => {
  simulation.stop();
};

viz.events?.emitRenderCompletedEvent?.();