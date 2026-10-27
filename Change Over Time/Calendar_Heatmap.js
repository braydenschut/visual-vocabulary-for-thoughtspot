/**
 * Available Columns:
 * "Day(date)"
 * "Total sales"
 * "Total quantity purchased"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

const { getDataFromSearchQuery } = viz;

const DateField = "Day(date)";
const SalesField = "Total sales";
const QuantityField = "Total quantity purchased";

// Settings
const SelectedYear = null;
const CellSize = 24;
const Gap = 4;
const Step = CellSize + Gap;
const Left = 50;
const Top = 38;
const DayMs = 86400000;

const Colors = [
  "#E5F3E7",
  "#B7DFBE",
  "#7CC98A",
  "#48AA5B",
  "#269039"
];

const MissingColor = "#F0F0F0";
const TextColor = "#666666";
const HighlightColor = "#333333";

const MonthNames = [
  "Jan", "Feb", "Mar", "Apr",
  "May", "Jun", "Jul", "Aug",
  "Sep", "Oct", "Nov", "Dec"
];

const svgNS = "http://www.w3.org/2000/svg";

// Formatters
const fullSales = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const fullQuantity = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
});

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

const parseDate = value => {
  const raw = cellValue(value);
  if (raw == null || raw === "") return null;

  const number = Number(raw);

  const date = raw instanceof Date
    ? raw
    : new Date(
        Number.isFinite(number) && Math.abs(number) >= 1e9
          ? Math.abs(number) < 1e11
            ? number * 1000
            : number
          : raw
      );

  return Number.isNaN(date.getTime()) ? null : date;
};

// Get ThoughtSpot Data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const dateIndex = fieldIndex(DateField);
const salesIndex = fieldIndex(SalesField);
const quantityIndex = fieldIndex(QuantityField);

if ([dateIndex, salesIndex, quantityIndex].includes(-1)) {
  throw new Error(
    "Search requires Day(date), Total sales, and Total quantity purchased."
  );
}

// Aggregate Daily Values
const dailyData = new Map();

for (const row of result.data || []) {
  const date = parseDate(row[dateIndex]);

  const salesRaw = cellValue(row[salesIndex]);
  const quantityRaw = cellValue(row[quantityIndex]);

  const sales = salesRaw == null || salesRaw === ""
    ? NaN : Number(salesRaw);

  const quantity = quantityRaw == null || quantityRaw === ""
    ? NaN : Number(quantityRaw);

  if (
    !date ||
    !Number.isFinite(sales) ||
    !Number.isFinite(quantity)
  ) continue;

  const key = date.toISOString().slice(0, 10);

  if (!dailyData.has(key)) {
    dailyData.set(key, { sales: 0, quantity: 0 });
  }

  const totals = dailyData.get(key);
  totals.sales += sales;
  totals.quantity += quantity;
}

if (!dailyData.size) {
  throw new Error("No valid daily Sales data found.");
}

// Select Year With Most Observations
const yearCounts = new Map();

for (const key of dailyData.keys()) {
  const year = Number(key.slice(0, 4));

  yearCounts.set(
    year,
    (yearCounts.get(year) || 0) + 1
  );
}

const ChartYear = SelectedYear ?? [...yearCounts.entries()]
  .sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];

// Build Full-Year Calendar
const firstDay = Date.UTC(ChartYear, 0, 1);
const lastDay = Date.UTC(ChartYear + 1, 0, 1);
const startWeekday = new Date(firstDay).getUTCDay();

const days = [];

for (let time = firstDay; time < lastDay; time += DayMs) {
  const date = new Date(time);
  const key = date.toISOString().slice(0, 10);
  const values = dailyData.get(key);

  const dayIndex = Math.round((time - firstDay) / DayMs);

  days.push({
    key,
    date,
    week: Math.floor((dayIndex + startWeekday) / 7),
    weekday: date.getUTCDay(),
    sales: values?.sales ?? null,
    quantity: values?.quantity ?? null,
    hasData: Boolean(values)
  });
}

const availableDays = days.filter(day => day.hasData);

if (!availableDays.length) {
  throw new Error(`No daily data found for ${ChartYear}.`);
}

// Calculate Sales Quintiles
const sortedSales = availableDays
  .map(day => day.sales)
  .sort((a, b) => a - b);

const quantile = p => {
  const index = (sortedSales.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  return sortedSales[lower] +
    (sortedSales[upper] - sortedSales[lower]) *
    (index - lower);
};

const thresholds = [0.2, 0.4, 0.6, 0.8]
  .map(quantile);

const getColor = sales => {
  if (sales == null) return MissingColor;

  const index = thresholds.findIndex(
    threshold => sales <= threshold
  );

  return Colors[index < 0 ? Colors.length - 1 : index];
};

// SVG Helpers
const svgElement = (tag, attrs = {}) => {
  const element = document.createElementNS(svgNS, tag);

  Object.entries(attrs).forEach(([name, value]) => {
    element.setAttribute(name, value);
  });

  return element;
};

const svgText = (svg, x, y, value, anchor = "start") => {
  const text = svgElement("text", {
    x,
    y,
    fill: TextColor,
    "font-size": 13,
    "text-anchor": anchor
  });

  text.textContent = value;
  svg.appendChild(text);
};

// Chart Container
const chart = document.querySelector("#chart");

chart.__calendarCleanup?.();

chart.style.cssText = `
  width:100%;
  height:100%;
  position:relative;
  overflow:hidden;
  box-sizing:border-box;
  font-family:Arial,sans-serif;
  color:${TextColor};
`;

const wrapper = document.createElement("div");

wrapper.style.cssText = `
  width:100%;
  height:100%;
  padding:8px 16px;
  box-sizing:border-box;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:16px;
`;

const weekCount = days.at(-1).week + 1;
const svgWidth = Left + weekCount * Step + 12;
const svgHeight = Top + 7 * Step + 12;

const svg = svgElement("svg", {
  viewBox: `0 0 ${svgWidth} ${svgHeight}`,
  preserveAspectRatio: "xMidYMid meet",
  role: "img",
  "aria-label": `Daily Sales Calendar Heatmap for ${ChartYear}`
});

svg.style.cssText = `
  display:block;
  flex:0 0 auto;
  overflow:visible;
`;

// Month Labels
for (let month = 0; month < 12; month++) {
  const first = Date.UTC(ChartYear, month, 1);
  const dayIndex = Math.round((first - firstDay) / DayMs);
  const week = Math.floor((dayIndex + startWeekday) / 7);

  svgText(
    svg,
    Left + week * Step,
    24,
    MonthNames[month]
  );
}

// Weekday Labels
[
  [1, "Mon"],
  [3, "Wed"],
  [5, "Fri"]
].forEach(([weekday, label]) => {
  svgText(
    svg,
    Left - 10,
    Top + weekday * Step + CellSize * 0.72,
    label,
    "end"
  );
});

// Calendar Cells
const cells = new Map();

for (const day of days) {
  const rect = svgElement("rect", {
    x: Left + day.week * Step,
    y: Top + day.weekday * Step,
    width: CellSize,
    height: CellSize,
    rx: 3,
    fill: getColor(day.sales),
    "data-day": day.key
  });

  rect.style.cursor = "pointer";
  rect.style.transition = "opacity 120ms, stroke 120ms";

  svg.appendChild(rect);
  cells.set(day.key, rect);
}

// Color Legend
const legend = document.createElement("div");

legend.style.cssText = `
  display:flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  font-size:12px;
  color:${TextColor};
  flex-shrink:0;
`;

const legendLabel = label => {
  const span = document.createElement("span");
  span.textContent = label;
  return span;
};

legend.appendChild(legendLabel("Min"));

for (const color of Colors) {
  const swatch = document.createElement("span");

  swatch.style.cssText = `
    width:20px;
    height:20px;
    border-radius:3px;
    background:${color};
  `;

  legend.appendChild(swatch);
}

legend.appendChild(legendLabel("Max"));

// Tooltip
const tooltip = document.createElement("div");

tooltip.style.cssText = `
  position:absolute;
  z-index:100;
  pointer-events:none;
  display:none;
  background:#454954;
  border-radius:7px;
  box-shadow:0 4px 16px rgba(0,0,0,.13);
  padding:12px 14px;
  font-size:12px;
  color:#fff;
  min-width:230px;
  box-sizing:border-box;
`;

const tooltipTitle = document.createElement("div");
tooltipTitle.style.cssText = `
  font-size:13px;
  font-weight:700;
  margin-bottom:9px;
`;

const tooltipDetails = document.createElement("div");
tooltipDetails.style.cssText = `
  display:flex;
  flex-direction:column;
  gap:7px;
`;

tooltip.append(tooltipTitle, tooltipDetails);

const tooltipRow = (label, value) => {
  const row = document.createElement("div");

  row.style.cssText = `
    display:flex;
    justify-content:space-between;
    gap:24px;
  `;

  const name = document.createElement("span");
  name.textContent = label;

  const amount = document.createElement("strong");
  amount.textContent = value;

  row.append(name, amount);
  return row;
};

wrapper.append(svg, legend);
chart.replaceChildren(wrapper, tooltip);

// Responsive Sizing
const resizeChart = () => {
  const availableWidth = Math.max(100, chart.clientWidth - 32);
  const availableHeight = Math.max(100, chart.clientHeight - 70);

  const width = Math.min(
    availableWidth,
    availableHeight * svgWidth / svgHeight
  );

  svg.style.width = `${width}px`;
  svg.style.height = `${width * svgHeight / svgWidth}px`;
};

resizeChart();

const resizeObserver = typeof ResizeObserver !== "undefined"
  ? new ResizeObserver(resizeChart)
  : null;

resizeObserver?.observe(chart);

// Tooltip Position
const moveTooltip = event => {
  const bounds = chart.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;

  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;

  const left = Math.max(
    4,
    Math.min(x + 14, chart.clientWidth - width - 4)
  );

  const top = Math.max(
    4,
    Math.min(
      y - height - 12 < 4 ? y + 16 : y - height - 12,
      chart.clientHeight - height - 4
    )
  );

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
};

const showTooltip = (day, event) => {
  tooltipTitle.textContent = dateFormatter.format(day.date);
  tooltipDetails.replaceChildren();

  if (day.hasData) {
    tooltipDetails.append(
      tooltipRow("Sales", fullSales.format(day.sales)),
      tooltipRow(
        "Quantity Purchased",
        fullQuantity.format(day.quantity)
      )
    );
  } else {
    tooltipDetails.append(
      tooltipRow("Status", "No data")
    );
  }

  tooltip.style.display = "block";
  moveTooltip(event);
};

// Interactions
const daysByKey = new Map(
  days.map(day => [day.key, day])
);

let selectedDay = null;
let hoveredDay = null;

const updateHighlight = () => {
  const active = hoveredDay || selectedDay;

  for (const [key, rect] of cells) {
    const selected = key === active;

    rect.setAttribute(
      "opacity",
      !active || selected ? 1 : 0.35
    );

    if (selected) {
      rect.setAttribute("stroke", HighlightColor);
      rect.setAttribute("stroke-width", 1.5);
    } else {
      rect.removeAttribute("stroke");
      rect.removeAttribute("stroke-width");
    }
  }
};

const getDay = event => {
  const key = event.target?.getAttribute?.("data-day");
  return key ? daysByKey.get(key) : null;
};

const onMove = event => {
  const day = getDay(event);

  if (!day) {
    if (hoveredDay) {
      hoveredDay = null;
      updateHighlight();
      tooltip.style.display = "none";
    }
    return;
  }

  if (hoveredDay !== day.key) {
    hoveredDay = day.key;
    updateHighlight();
    showTooltip(day, event);
  } else {
    moveTooltip(event);
  }
};

const onLeave = () => {
  hoveredDay = null;
  updateHighlight();
  tooltip.style.display = "none";
};

const onClick = event => {
  const day = getDay(event);
  if (!day) return;

  selectedDay = selectedDay === day.key
    ? null
    : day.key;

  updateHighlight();
};

svg.addEventListener("pointermove", onMove);
svg.addEventListener("pointerleave", onLeave);
svg.addEventListener("click", onClick);

// Cleanup for Rerendering
chart.__calendarCleanup = () => {
  resizeObserver?.disconnect();

  svg.removeEventListener("pointermove", onMove);
  svg.removeEventListener("pointerleave", onLeave);
  svg.removeEventListener("click", onClick);
};

// Notify ThoughtSpot Rendering Completed
const notifyRenderComplete = () => {
  viz.events?.emitRenderCompletedEvent?.();
};

if (typeof requestAnimationFrame === "function") {
  requestAnimationFrame(() => {
    resizeChart();
    notifyRenderComplete();
  });
} else {
  notifyRenderComplete();
}