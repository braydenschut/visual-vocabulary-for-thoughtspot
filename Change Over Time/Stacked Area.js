/**
 * Available Columns:
 * "Month(date)"
 * "region"
 * "Total sales"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

const {
  muze,
  getDataFromSearchQuery,
  setGlobalOptions,
  formatters: { NumberFormatter }
} = viz;

const MonthField = "Month(date)";
const RegionField = "region";
const SalesField = "Total sales";

const RegionColors = {
  East: "#269039",
  Midwest: "#48AA5B",
  South: "#7CC98A",
  Southwest: "#A8D9AE",
  West: "#D0EBD5"
};

const FallbackColors = Object.values(RegionColors);

setGlobalOptions({
  displayAs: {
    columns: {
      [MonthField]: "Month",
      [RegionField]: "Region",
      [SalesField]: "Sales"
    }
  }
});

// Formatters
const axisCurrency = new NumberFormatter("currency", {
  currency: "USD",
  unit: "auto",
  decimalDigits: 0
});

const tooltipCurrency = new NumberFormatter("currency", {
  currency: "USD",
  unit: "none",
  decimalDigits: 0
});

const cellValue = value => {
  if (value == null || typeof value !== "object")
    return value;

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

// Format original month values without changing drilldown.
const formatMonth = value => {
  const raw = cellValue(value);
  const date = raw instanceof Date
    ? raw
    : new Date(raw);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
};

// Get Original ThoughtSpot Data
const data = await getDataFromSearchQuery();
const result = data.getData();
const schema = result.schema || data.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const monthIndex = fieldIndex(MonthField);
const regionIndex = fieldIndex(RegionField);

if (monthIndex < 0 || regionIndex < 0) {
  throw new Error(
    "Search requires Month(date), region, and Total sales."
  );
}

// Collect Months and Regions
const months = new Map();
const regions = new Set();

for (const row of result.data || []) {
  const rawMonth = cellValue(row[monthIndex]);
  const region = String(
    cellValue(row[regionIndex]) ?? ""
  ).trim();

  const date = new Date(rawMonth);

  if (!region || Number.isNaN(date.getTime())) continue;

  months.set(date.getTime(), rawMonth);
  regions.add(region);
}

const orderedMonths = [...months.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([, value]) => value);

const orderedRegions = [...regions]
  .sort((a, b) => a.localeCompare(b));

const chartColors = orderedRegions.map(
  (region, index) =>
    RegionColors[region] ??
    FallbackColors[index % FallbackColors.length]
);

// Stacked Area Chart
muze
  .canvas()

  .columns([MonthField])
  .rows([SalesField])

  .color({ field: RegionField })
  .detail([RegionField])

  .title(" ")
  .subtitle(" ")

  .layers([
    {
      mark: "area",
      encoding: {
        x: MonthField,
        y: SalesField,
        color: RegionField
      },
      transform: { type: "stack" },
      interpolate: "linear"
    }
  ])

  .config({
    columns: {
      headers: { show: false }
    },

    rows: {
      headers: { show: false },
      facets: { show: false }
    },

    axes: {
      x: {
        name: "Month",
        ordering: {
          type: "custom",
          values: orderedMonths
        },
        tickFormat: formatMonth,
        labels: { rotation: -45 }
      },

      y: {
        name: "Sales",
        domain: [0, null],
        numberOfTicks: 5,
        tickFormat: axisCurrency.formatterFunc()
      }
    },

    gridLines: {
      x: { show: false },
      y: { show: true }
    },

    legend: {
      color: {
        show: false,
        range: chartColors
      }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [MonthField]: formatMonth,
          [SalesField]: tooltipCurrency.formatterFunc()
        }
      }
    }
  })

  .data(data)
  .mount("#chart");

// Custom Centered Legend
const chart = document.querySelector("#chart");
const parent = chart?.parentElement;

if (parent) {
  parent.style.position = "relative";
  parent.querySelector("#stacked-area-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "stacked-area-legend";

  legend.style.cssText = `
    position:absolute;
    top:10px;
    left:50%;
    transform:translateX(-50%);
    z-index:10;
    display:flex;
    flex-wrap:wrap;
    align-items:center;
    justify-content:center;
    gap:14px;
    padding:6px 10px;
    max-width:calc(100% - 20px);
    background:rgba(255,255,255,.95);
    border-radius:4px;
    font:12px Arial,sans-serif;
    color:#555;
    pointer-events:none;
  `;

  const title = document.createElement("strong");
  title.textContent = "Region";
  legend.appendChild(title);

  orderedRegions.forEach((region, index) => {
    const item = document.createElement("span");

    item.style.cssText = `
      display:inline-flex;
      align-items:center;
      gap:6px;
      white-space:nowrap;
    `;

    const swatch = document.createElement("span");
    swatch.style.cssText = `
      width:11px;
      height:11px;
      border-radius:2px;
      background:${chartColors[index]};
    `;

    const label = document.createElement("span");
    label.textContent = region;

    item.append(swatch, label);
    legend.appendChild(item);
  });

  parent.appendChild(legend);
}