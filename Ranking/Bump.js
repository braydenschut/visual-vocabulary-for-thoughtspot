/**
 * Available Columns:
 * "Year(date)"
 * "item type"
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

// Fields
const YearField = "Year(date)";
const ItemField = "item type";
const SalesField = "Total sales";
const RankField = "Sales Rank";
const PlotRankField = "Plot Rank";

const TopN = 8;

const Colors = [
  "#018DB0",
  "#31A6C2",
  "#60BCD1",
  "#8ACDDC",
  "#B4E0E9",
  "#176B80",
  "#42849C",
  "#72B0C1"
];

setGlobalOptions({
  displayAs: {
    columns: {
      [YearField]: "Year",
      [ItemField]: "Item Type",
      [SalesField]: "Sales",
      [RankField]: "Rank",
      [PlotRankField]: "Rank"
    }
  }
});

// Formatters
const tooltipCurrency = new NumberFormatter("currency", {
  currency: "USD",
  unit: "none",
  decimalDigits: 0
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

const parseYear = value => {
  const raw = cellValue(value);

  if (raw instanceof Date)
    return raw.getUTCFullYear();

  const number = Number(raw);

  if (
    Number.isInteger(number) &&
    number >= 1900 &&
    number <= 2100
  ) return number;

  const match = String(raw ?? "").match(/\b(?:19|20)\d{2}\b/);
  if (match) return Number(match[0]);

  if (Number.isFinite(number) && Math.abs(number) >= 1e9) {
    const date = new Date(
      Math.abs(number) < 1e11 ? number * 1000 : number
    );

    return Number.isNaN(date.getTime())
      ? null
      : date.getUTCFullYear();
  }

  return null;
};

const formatYear = value => String(parseYear(value) ?? "");

const formatRank = value => {
  const number = Number(cellValue(value));
  return Number.isFinite(number)
    ? String(Math.abs(Math.round(number)))
    : "";
};

const normalizeItem = value =>
  String(cellValue(value) ?? "").trim();

// Get ThoughtSpot Data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const yearIndex = fieldIndex(YearField);
const itemIndex = fieldIndex(ItemField);
const salesIndex = fieldIndex(SalesField);

if ([yearIndex, itemIndex, salesIndex].includes(-1)) {
  throw new Error(
    "Search requires Year(date), item type, and Total sales."
  );
}

// Aggregate Annual Sales
const annualSales = new Map();

for (const row of result.data || []) {
  const year = parseYear(row[yearIndex]);
  const item = normalizeItem(row[itemIndex]);
  const salesRaw = cellValue(row[salesIndex]);
  const sales = salesRaw == null || salesRaw === ""
    ? NaN
    : Number(salesRaw);

  if (
    year == null ||
    !item ||
    !Number.isFinite(sales)
  ) continue;

  if (!annualSales.has(year))
    annualSales.set(year, new Map());

  const totals = annualSales.get(year);

  totals.set(item, (totals.get(item) || 0) + sales);
}

const orderedYears = [...annualSales.keys()]
  .sort((a, b) => a - b);

if (orderedYears.length < 2) {
  throw new Error("At least two years are required.");
}

// Top 8 Item Types by Latest Year Sales
const latestYear = orderedYears.at(-1);

const orderedItems = [...annualSales.get(latestYear).entries()]
  .sort((a, b) =>
    b[1] - a[1] ||
    a[0].localeCompare(b[0])
  )
  .slice(0, TopN)
  .map(([item]) => item);

const itemSet = new Set(orderedItems);
const maxRank = orderedItems.length;

// Calculate Rankings Across Years
const ranksByYear = new Map();

for (const year of orderedYears) {
  const ranked = [...annualSales.get(year).entries()]
    .filter(([item]) => itemSet.has(item))
    .sort((a, b) =>
      b[1] - a[1] ||
      a[0].localeCompare(b[0])
    );

  ranksByYear.set(
    year,
    new Map(
      ranked.map(([item], index) => [item, index + 1])
    )
  );
}

const getRank = (year, item) =>
  ranksByYear.get(parseYear(year))
    ?.get(normalizeItem(item)) ?? null;

// Preserve Original ThoughtSpot DataModel
let data = source;

[
  [RankField, rank => rank],
  [PlotRankField, rank => -rank]
].forEach(([field, calculate]) => {
  data = data.calculateVariable(
    {
      name: field,
      type: "measure",
      defAggFn: "min"
    },
    [YearField, ItemField],
    (year, item) => {
      const rank = getRank(year, item);
      return rank == null ? null : calculate(rank);
    }
  );
});

// Filter to Top 8 Item Types
data = data.select({
  operator: muze.DataModel.LogicalOperators.OR,
  conditions: orderedItems.map(item => ({
    field: ItemField,
    value: item,
    operator: muze.DataModel.ComparisonOperators.EQUAL
  }))
});

// Bump Chart
muze
  .canvas()

  .columns([YearField])
  .rows([PlotRankField])

  .color(ItemField)
  .detail([ItemField, YearField, SalesField])

  .title(" ")
  .subtitle(" ")

  .layers([
    {
      mark: "line",
      encoding: {
        x: YearField,
        y: PlotRankField,
        color: { field: ItemField }
      },
      interpolate: "linear"
    },

    {
      mark: "point",
      encoding: {
        x: YearField,
        y: PlotRankField,
        color: { field: ItemField },
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
        name: "Year",
        tickFormat: formatYear,
        labels: { rotation: 0 }
      },

      y: {
        name: "Sales Rank",
        domain: [-(maxRank + 0.5), -0.5],
        nice: false,
        numberOfTicks: maxRank,
        tickFormat: formatRank
      }
    },

    gridLines: {
      x: { show: false },
      y: { show: true }
    },

    legend: {
      color: {
        show: false,
        range: Colors.slice(0, maxRank)
      }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [SalesField]: tooltipCurrency.formatterFunc(),
          [RankField]: formatRank,
          [PlotRankField]: formatRank,
          [YearField]: formatYear
        }
      }
    }
  })

  .data(data)
  .mount("#chart");

// Centered Legend
const chart = document.querySelector("#chart");
const parent = chart?.parentElement;

if (parent) {
  const legendColors = Colors.slice(0, maxRank);

  parent.style.position = "relative";
  parent.querySelector("#bump-chart-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "bump-chart-legend";

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
    gap:8px 14px;
    padding:6px 10px;
    max-width:calc(100% - 20px);
    background:rgba(255,255,255,.95);
    border-radius:4px;
    font:12px Arial,sans-serif;
    color:#555;
    pointer-events:none;
  `;

  const entries = orderedItems.map((item, index) => ({
    label: item,
    color: legendColors[index]
  }));

  const title = document.createElement("strong");
  title.textContent = "Item Type";
  legend.appendChild(title);

  for (const entry of entries) {
    const item = document.createElement("span");

    item.style.cssText = `
      display:inline-flex;
      align-items:center;
      gap:5px;
      white-space:nowrap;
    `;

    const swatch = document.createElement("span");

    swatch.style.cssText = `
      width:17px;
      height:3px;
      border-radius:2px;
      background:${entry.color};
    `;

    const label = document.createElement("span");
    label.textContent = entry.label;

    item.append(swatch, label);
    legend.appendChild(item);
  }

  parent.appendChild(legend);
}