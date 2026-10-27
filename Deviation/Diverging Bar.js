/**
 * Available Columns:
 * "region"
 * "Year(date)"
 * "Total sales"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

const {
  muze,
  getDataFromSearchQuery,
  setGlobalOptions
} = viz;

// Fields
const RegionField = "region";
const YearField = "Year(date)";
const SalesField = "Total sales";
const IncreaseField = "Sales Increase";
const DecreaseField = "Sales Decrease";

// Settings
const BaseYear = 2024;
const ComparisonYear = 2025;

const PositiveColor = "#E6B00E";
const NegativeColor = "#A77C08";

// Formatters
const compactUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1
});

const fullUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const cellValue = value => {
  if (
    value == null ||
    typeof value !== "object" ||
    value instanceof Date
  ) return value;

  for (const key of ["rawValue", "value", "_value", "v"]) {
    if (key in value) {
      const result = value[key];
      return cellValue(
        typeof result === "function"
          ? result.call(value)
          : result
      );
    }
  }

  return null;
};

const numericValue = value => {
  const raw = cellValue(value);
  if (raw == null || raw === "") return NaN;
  return Number(raw);
};

const parseYear = value => {
  const raw = cellValue(value);

  if (raw instanceof Date)
    return raw.getUTCFullYear();

  const n = Number(raw);

  if (Number.isInteger(n) && n >= 1900 && n <= 2100)
    return n;

  if (Number.isFinite(n) && Math.abs(n) >= 1e9) {
    const date = new Date(Math.abs(n) < 1e11 ? n * 1000 : n);
    return Number.isNaN(date.getTime())
      ? null
      : date.getUTCFullYear();
  }

  const match = String(raw ?? "").match(/\b(?:19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
};

const formatSales = value => {
  const n = numericValue(value);
  return Number.isFinite(n) ? compactUSD.format(n) : "";
};

const formatTooltipSales = value => {
  const n = numericValue(value);
  return Number.isFinite(n) ? fullUSD.format(n) : "";
};

// Display Names
setGlobalOptions({
  displayAs: {
    columns: {
      [RegionField]: "Region",
      [YearField]: "Year",
      [SalesField]: "Sales",
      [IncreaseField]: "Sales Increase",
      [DecreaseField]: "Sales Decrease"
    }
  }
});

// Get ThoughtSpot Data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const regionIndex = fieldIndex(RegionField);
const yearIndex = fieldIndex(YearField);
const salesIndex = fieldIndex(SalesField);

if ([regionIndex, yearIndex, salesIndex].includes(-1)) {
  throw new Error(
    "Search requires region, Year(date), and Total sales."
  );
}

// Aggregate Sales by Region and Year
const salesByRegion = new Map();
const yearValues = new Map();

(result.data || []).forEach(row => {
  const region = String(
    cellValue(row[regionIndex]) ?? ""
  ).trim();

  const rawYear = cellValue(row[yearIndex]);
  const year = parseYear(rawYear);
  const sales = numericValue(row[salesIndex]);

  if (
    !region ||
    ![BaseYear, ComparisonYear].includes(year) ||
    !Number.isFinite(sales)
  ) return;

  if (!yearValues.has(year))
    yearValues.set(year, rawYear);

  if (!salesByRegion.has(region))
    salesByRegion.set(region, new Map());

  const totals = salesByRegion.get(region);

  totals.set(year, (totals.get(year) || 0) + sales);
});

if (!yearValues.has(ComparisonYear)) {
  throw new Error(
    `No data found for comparison year ${ComparisonYear}.`
  );
}

// Calculate Year-over-Year Changes
const differences = new Map();

salesByRegion.forEach((totals, region) => {
  if (!totals.has(BaseYear) || !totals.has(ComparisonYear))
    return;

  differences.set(
    region,
    totals.get(ComparisonYear) - totals.get(BaseYear)
  );
});

if (!differences.size) {
  throw new Error("No regions contain sales for both years.");
}

const orderedRegions = [...differences.keys()]
  .sort((a, b) => differences.get(b) - differences.get(a));

const maxDifference = Math.max(
  ...[...differences.values()].map(Math.abs)
);

const axisMaximum = Math.max(1, maxDifference * 1.15);

// Add Calculated Measures
let data = source;

[
  [IncreaseField, value => value > 0],
  [DecreaseField, value => value < 0]
].forEach(([field, condition]) => {
  data = data.calculateVariable(
    {
      name: field,
      type: "measure",
      defAggFn: "min"
    },
    [RegionField],
    region => {
      const difference = differences.get(
        String(cellValue(region))
      );

      return difference != null && condition(difference)
        ? difference
        : null;
    }
  );
});

// Select Comparison Year
data = data.select({
  operator: muze.DataModel.LogicalOperators.OR,
  conditions: [{
    field: YearField,
    value: yearValues.get(ComparisonYear),
    operator: muze.DataModel.ComparisonOperators.EQUAL
  }]
});

// Chart Container
const chartElement = document.querySelector("#chart");

if (!chartElement) {
  throw new Error("Chart container #chart not found.");
}

const parent = chartElement.parentElement;

if (parent) {
  parent.style.position = "relative";
  parent.querySelector("#diverging-bar-legend")?.remove();
}

// Diverging Bar
muze
  .canvas()

  .rows([RegionField])

  .columns([
    muze.Operators.share(IncreaseField, DecreaseField)
  ])

  .detail([RegionField, YearField, SalesField])

  .title(" ")

  .layers([
    ...[
      [IncreaseField, PositiveColor],
      [DecreaseField, NegativeColor]
    ].map(([field, color]) => ({
      mark: "bar",
      interactive: true,
      encoding: {
        x: field,
        color: { value: () => color }
      }
    }))
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
        name: "Sales Change",
        domain: [-axisMaximum, axisMaximum],
        nice: false,
        numberOfTicks: 7,
        tickFormat: formatSales
      },

      y: {
        name: "Region",
        ordering: {
          type: "custom",
          values: [...orderedRegions].reverse()
        }
      }
    },

    gridLines: {
      x: { show: true },
      y: { show: false }
    },

    legend: {
      color: { show: false }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [SalesField]: formatTooltipSales,
          [IncreaseField]: formatTooltipSales,
          [DecreaseField]: formatTooltipSales
        }
      }
    }
  })

  .data(data)
  .mount("#chart");

// Centered Legend
if (parent) {
  const legend = document.createElement("div");

  legend.id = "diverging-bar-legend";

  legend.style.cssText = `
    position:absolute;
    top:10px;
    left:50%;
    transform:translateX(-50%);
    z-index:10;
    display:flex;
    align-items:center;
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
    ["Increase", PositiveColor],
    ["Decrease", NegativeColor]
  ].forEach(([label, color]) => {
    const item = document.createElement("span");
    item.style.cssText = `
      display:inline-flex;
      align-items:center;
      gap:6px;
    `;

    const swatch = document.createElement("span");
    swatch.style.cssText = `
      width:14px;
      height:10px;
      display:inline-block;
      background:${color};
      border-radius:2px;
    `;

    const text = document.createElement("span");
    text.textContent = label;

    item.append(swatch, text);
    legend.appendChild(item);
  });

  parent.appendChild(legend);
}