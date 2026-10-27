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
        typeof raw === "function" ? raw.call(value) : raw
      );
    }
  }

  return null;
};

// Aggregate Sales by Region and Item Type
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
  throw new Error("No valid Region–Item Type data found.");
}

// Sort Categories by Sales
const regions = [...regionTotals.keys()].sort(
  (a, b) => regionTotals.get(b) - regionTotals.get(a)
);

const items = [...itemTotals.keys()].sort(
  (a, b) => itemTotals.get(b) - itemTotals.get(a)
);

const labels = [...regions, ...items];
const regionCount = regions.length;
const count = labels.length;

// Build Symmetric Relationship Matrix
// Each relationship appears in both directions
// so both category groups have proportional arcs.
const matrix = Array.from(
  { length: count },
  () => Array(count).fill(0)
);

for (const [key, sales] of totals) {
  const [region, item] = JSON.parse(key);

  const i = regions.indexOf(region);
  const j = regionCount + items.indexOf(item);

  matrix[i][j] += sales;
  matrix[j][i] += sales;
}

// Region Colors
const regionColors = new Map(
  regions.map((name, index) => [
    name,
    Colors[index % Colors.length]
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
  min-height:480px;
  background:#FFFFFF;
  overflow:hidden;
  box-sizing:border-box;
  font-family:Arial,sans-serif;
`;

// Chord Layout
const width = 900;
const height = 780;

const innerRadius = 235;
const outerRadius = 250;

const chord = d3.chord()
  .padAngle(0.025)
  .sortSubgroups(d3.descending);

const chords = chord(matrix);

const arc = d3.arc()
  .innerRadius(innerRadius)
  .outerRadius(outerRadius);

const ribbon = d3.ribbon()
  .radius(innerRadius);

const svg = d3.create("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("preserveAspectRatio", "xMidYMid meet")
  .style("display", "block")
  .style("width", "100%")
  .style("height", "100%");

const diagram = svg.append("g")
  .attr(
    "transform",
    `translate(${width / 2},${height / 2})`
  );

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
      event.clientY - bounds.top -
        tooltip.offsetHeight - 10,
      bounds.height - tooltip.offsetHeight - 8
    )
  )}px`;
};

const hideTooltip = () => {
  tooltip.style.display = "none";
};

// Get the Region associated with a chord
const chordRegion = d => {
  const index = d.source.index < regionCount
    ? d.source.index
    : d.target.index;

  return regions[index];
};

// Ribbons
const ribbons = diagram.append("g")
  .attr("fill-opacity", 0.65)
  .selectAll("path")
  .data(chords)
  .join("path")
  .attr("d", ribbon)
  .attr("fill", d =>
    regionColors.get(chordRegion(d))
  )
  .attr("stroke", "#FFFFFF")
  .attr("stroke-width", 0.4)
  .style("cursor", "pointer");

ribbons
  .on("pointermove", function(event, d) {
    ribbons.attr("fill-opacity", 0.1);
    d3.select(this).attr("fill-opacity", 0.95);

    const region = chordRegion(d);
    const itemIndex = d.source.index >= regionCount
      ? d.source.index
      : d.target.index;

    const item = labels[itemIndex];

    showTooltip(
      event,
      `${region} → ${item}`,
      [`Sales: ${USD.format(d.source.value)}`]
    );
  })
  .on("pointerleave", () => {
    ribbons.attr("fill-opacity", 0.65);
    hideTooltip();
  });

// Outer Category Arcs
const groups = diagram.append("g")
  .selectAll("g")
  .data(chords.groups)
  .join("g");

groups.append("path")
  .attr("d", arc)
  .attr("fill", d =>
    d.index < regionCount
      ? regionColors.get(labels[d.index])
      : "#AABD67"
  )
  .attr("stroke", "#FFFFFF")
  .attr("stroke-width", 1)
  .style("cursor", "pointer");

// Category Labels
groups.append("text")
  .each(d => {
    d.angle = (d.startAngle + d.endAngle) / 2;
  })
  .attr("dy", "0.35em")
  .attr("transform", d => `
    rotate(${d.angle * 180 / Math.PI - 90})
    translate(${outerRadius + 12})
    ${d.angle > Math.PI ? "rotate(180)" : ""}
  `)
  .attr("text-anchor", d =>
    d.angle > Math.PI ? "end" : "start"
  )
  .attr("font-size", 11)
  .attr("fill", "#333333")
  .text(d => labels[d.index]);

groups
  .on("pointermove", (event, d) => {
    const category = d.index < regionCount
      ? "Region"
      : "Item Type";

    showTooltip(
      event,
      `${category}: ${labels[d.index]}`,
      [`Total Sales: ${USD.format(d.value)}`]
    );
  })
  .on("pointerleave", hideTooltip);

// Center Label
diagram.append("text")
  .attr("text-anchor", "middle")
  .attr("y", -8)
  .attr("font-size", 15)
  .attr("font-weight", 600)
  .attr("fill", "#555555")
  .text("Region × Item Type");

diagram.append("text")
  .attr("text-anchor", "middle")
  .attr("y", 12)
  .attr("font-size", 12)
  .attr("fill", "#777777")
  .text("Total Sales");

// Mount
chart.replaceChildren(svg.node(), tooltip);

viz.events?.emitRenderCompletedEvent?.();