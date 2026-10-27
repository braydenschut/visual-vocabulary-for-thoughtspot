/**
 * Available Columns:
 * "region"
 * "Quarter(date)"
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

const QuarterField = "Quarter(date)";
const RegionField = "region";
const SalesField = "Total sales";

const HighlightedRegion = "East";
const HighlightColor = "#269039";
const BackgroundColor = "#C8CBC8";

setGlobalOptions({
  displayAs: {
    columns: {
      [QuarterField]: "Quarter",
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

// Read ThoughtSpot date values
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
        typeof raw === "function" ? raw.call(value) : raw
      );
    }
  }

  return null;
};

const parseQuarter = value => {
  const raw = cellValue(value);
  if (raw == null || raw === "") return null;

  const text = String(raw).trim();

  const match = text.match(
    /Q([1-4])[\s/-]*(\d{4})|(\d{4})[\s/-]*Q([1-4])/i
  );

  if (match) {
    return {
      year: Number(match[2] || match[3]),
      quarter: Number(match[1] || match[4])
    };
  }

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

  if (Number.isNaN(date.getTime())) return null;

  return {
    year: date.getUTCFullYear(),
    quarter: Math.floor(date.getUTCMonth() / 3) + 1
  };
};

const formatQuarter = value => {
  const quarter = parseQuarter(value);

  return quarter
    ? `Q${quarter.quarter} ${quarter.year}`
    : "";
};

// Original ThoughtSpot DataModel
const data = await getDataFromSearchQuery();
const result = data.getData();
const schema = result.schema || data.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const quarterIndex = fieldIndex(QuarterField);
const regionIndex = fieldIndex(RegionField);

if (quarterIndex < 0 || regionIndex < 0) {
  throw new Error(
    "Search requires Quarter(date) and region."
  );
}

// Identify Regions and Chronological Quarters
const regions = new Set();
const quarters = new Map();

for (const row of result.data || []) {
  const region = String(
    cellValue(row[regionIndex]) ?? ""
  ).trim();

  const rawQuarter = cellValue(row[quarterIndex]);
  const quarter = parseQuarter(rawQuarter);

  if (!region || !quarter) continue;

  regions.add(region);

  quarters.set(
    quarter.year * 4 + quarter.quarter,
    rawQuarter
  );
}

const orderedRegions = [...regions]
  .sort((a, b) => a.localeCompare(b));

const matchedRegion = orderedRegions.find(
  region =>
    region.toLowerCase() === HighlightedRegion.toLowerCase()
);

if (!matchedRegion) {
  throw new Error(
    `Highlighted Region "${HighlightedRegion}" not found.`
  );
}

const orderedQuarters = [...quarters.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([, value]) => value);

// Explicit Region-to-Color Mapping
const regionColors = Object.fromEntries(
  orderedRegions.map(region => [
    region,
    region === matchedRegion
      ? HighlightColor
      : BackgroundColor
  ])
);

// Highlighted Multi-Line Chart
muze
  .canvas()

  .columns([
    { field: QuarterField, as: "discrete" }
  ])

  .rows([SalesField])

  .color(RegionField)
  .detail([RegionField])
  .title(" ")

  .layers([
    {
      mark: "line",
      encoding: {
        x: QuarterField,
        y: SalesField,
        color: { field: RegionField }
      },
      interpolate: "linear"
    },

    {
      mark: "point",
      encoding: {
        x: QuarterField,
        y: SalesField,
        color: { field: RegionField },
        opacity: { value: () => 1 }
      }
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
        name: "Quarter",
        ordering: {
          type: "custom",
          values: orderedQuarters
        },
        tickFormat: formatQuarter,
        padding: 0.1,
        labels: { rotation: 0 }
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
        fields: {
          [RegionField]: {
            domainRangeMap: regionColors
          }
        }
      }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [QuarterField]: formatQuarter,
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
  parent.querySelector("#highlighted-multiline-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "highlighted-multiline-legend";

  legend.style.cssText = `
    position:absolute;
    top:10px;
    left:50%;
    transform:translateX(-50%);
    z-index:10;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:16px;
    padding:6px 10px;
    background:rgba(255,255,255,.95);
    border-radius:4px;
    font:12px Arial,sans-serif;
    color:#555;
    white-space:nowrap;
    pointer-events:none;
  `;

  [
    [matchedRegion, HighlightColor],
    ["Other Regions", BackgroundColor]
  ].forEach(([label, color]) => {
    const item = document.createElement("span");

    item.style.cssText = `
      display:inline-flex;
      align-items:center;
      gap:6px;
    `;

    const swatch = document.createElement("span");

    swatch.style.cssText = `
      width:18px;
      height:3px;
      border-radius:2px;
      background:${color};
    `;

    const text = document.createElement("span");
    text.textContent = label;

    item.append(swatch, text);
    legend.appendChild(item);
  });

  parent.appendChild(legend);
}