/**
 * Available Columns:
 * "item type"
 * "Year(date)"
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

const YearField = "Year(date)";
const ItemField = "item type";
const SalesField = "Total sales";

const StartField = "Starting Balance";
const EndField = "Ending Balance";
const ChangeField = "Sales Change";
const TypeField = "Change Type";
const PreviousField = "Previous Year Sales";
const CurrentField = "Current Year Sales";
const VisibleField = "Waterfall Visible Row";

const StartYear = 2024;
const EndYear = 2025;
const SortByMagnitude = true;

const IncreaseColor = "#0354A6";
const DecreaseColor = "#85B7E3";

setGlobalOptions({
  displayAs: {
    columns: {
      [YearField]: "Year",
      [ItemField]: "Item Type",
      [SalesField]: "Sales",
      [StartField]: "Starting Balance",
      [EndField]: "Ending Balance",
      [ChangeField]: "Sales Change",
      [TypeField]: "Change Type",
      [PreviousField]: `${StartYear} Sales`,
      [CurrentField]: `${EndYear} Sales`
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

const formatChange = value => {
  const raw = cellValue(value);
  const number = Number(raw);

  if (raw == null || raw === "" || !Number.isFinite(number)) {
    return "";
  }

  return (number > 0 ? "+" : "") +
    tooltipCurrency.formatterFunc()(number);
};

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

const parseYear = value => {
  const raw = cellValue(value);

  if (raw == null || raw === "") return null;

  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime())
      ? null
      : raw.getUTCFullYear();
  }

  const number = Number(raw);

  if (
    Number.isInteger(number) &&
    number >= 1900 &&
    number <= 2100
  ) {
    return number;
  }

  const match = String(raw).match(/\b(?:19|20)\d{2}\b/);
  if (match) return Number(match[0]);

  if (Number.isFinite(number) && Math.abs(number) >= 1e9) {
    const timestamp = Math.abs(number) < 1e11
      ? number * 1000
      : number;

    const date = new Date(timestamp);

    return Number.isNaN(date.getTime())
      ? null
      : date.getUTCFullYear();
  }

  return null;
};

// Get Original ThoughtSpot DataModel
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

// Read Both Years and Calculate Item Type Totals
const itemTotals = new Map();
const seenYears = new Set();
const rowKeys = new Set();

for (const row of result.data || []) {
  const year = parseYear(row[yearIndex]);

  if (year !== StartYear && year !== EndYear) continue;

  const item = String(
    cellValue(row[itemIndex]) ?? ""
  ).trim();

  const rawSales = cellValue(row[salesIndex]);

  const sales = rawSales == null || rawSales === ""
    ? NaN
    : Number(rawSales);

  if (!item || !Number.isFinite(sales)) continue;

  const key = JSON.stringify([year, item]);

  if (rowKeys.has(key)) {
    throw new Error(
      "Search must return one row per Year and Item Type."
    );
  }

  rowKeys.add(key);
  seenYears.add(year);

  const totals = itemTotals.get(item) || {
    previous: 0,
    current: 0
  };

  if (year === StartYear) {
    totals.previous = sales;
  } else {
    totals.current = sales;
  }

  itemTotals.set(item, totals);
}

if (!seenYears.has(StartYear) || !seenYears.has(EndYear)) {
  throw new Error(
    `Search must include ${StartYear} and ${EndYear}.`
  );
}

if (!itemTotals.size) {
  throw new Error("No valid Sales data found.");
}

// Each bar needs an EndYear source record
const missing = [...itemTotals.keys()].filter(
  item => !rowKeys.has(JSON.stringify([EndYear, item]))
);

if (missing.length) {
  throw new Error(
    `Missing ${EndYear} Sales data for: ${missing.join(", ")}`
  );
}

// Calculate Sales Changes
const changes = [...itemTotals.entries()]
  .map(([item, totals]) => ({
    item,
    ...totals,
    change: totals.current - totals.previous
  }))
  .sort((a, b) =>
    SortByMagnitude
      ? Math.abs(b.change) - Math.abs(a.change) ||
        a.item.localeCompare(b.item)
      : b.change - a.change ||
        a.item.localeCompare(b.item)
  );

const startTotal = changes.reduce(
  (sum, item) => sum + item.previous,
  0
);

const endTotal = changes.reduce(
  (sum, item) => sum + item.current,
  0
);

const netChange = endTotal - startTotal;
const orderedItems = changes.map(item => item.item);

// Calculate Waterfall Bar Coordinates
const waterfall = new Map();
let runningTotal = startTotal;

for (const item of changes) {
  const nextTotal = runningTotal + item.change;

  waterfall.set(item.item, {
    start: Math.min(runningTotal, nextTotal),
    end: Math.max(runningTotal, nextTotal),
    change: item.change,
    type: item.change >= 0 ? "Increase" : "Decrease",
    previous: item.previous,
    current: item.current
  });

  runningTotal = nextTotal;
}

if (Math.abs(runningTotal - endTotal) > 0.01) {
  throw new Error("Waterfall totals do not reconcile.");
}

// Add Calculated Measures to Original DataModel
let data = source;

const lookup = (year, item) => {
  if (parseYear(year) !== EndYear) return null;

  return waterfall.get(
    String(cellValue(item) ?? "").trim()
  ) ?? null;
};

for (const [field, property] of [
  [StartField, "start"],
  [EndField, "end"],
  [ChangeField, "change"],
  [PreviousField, "previous"],
  [CurrentField, "current"]
]) {
  data = data.calculateVariable(
    {
      name: field,
      type: "measure",
      defAggFn: "min"
    },
    [YearField, ItemField],
    (year, item) => lookup(year, item)?.[property] ?? null
  );
}

// Increase / Decrease Category
data = data.calculateVariable(
  {
    name: TypeField,
    type: "dimension"
  },
  [YearField, ItemField],
  (year, item) => lookup(year, item)?.type ?? null
);

// Select EndYear Rows Only
data = data.calculateVariable(
  {
    name: VisibleField,
    type: "dimension"
  },
  [YearField],
  year => parseYear(year) === EndYear ? "Show" : "Hide"
);

data = data.select({
  field: VisibleField,
  value: "Show",
  operator: muze.DataModel.ComparisonOperators.EQUAL
});

if (!(data.getData().data || []).length) {
  throw new Error(`No ${EndYear} waterfall rows found.`);
}

// Native Muze Waterfall Chart
muze
  .canvas()

  .columns([ItemField])

  .rows([
    muze.Operators.share(StartField, EndField)
  ])

  .detail([ItemField])

  .color({
    field: TypeField,
    domain: ["Decrease", "Increase"],
    range: [DecreaseColor, IncreaseColor]
  })

  .title(" ")

  .layers([
    {
      mark: "bar",

      encoding: {
        x: ItemField,
        y: EndField,
        y0: StartField,
        color: { field: TypeField }
      },

      transform: { type: "identity" }
    }
  ])

  .config({
    autoGroupBy: { disabled: true },

    columns: {
      headers: { show: false }
    },

    rows: {
      headers: { show: false },
      facets: { show: false }
    },

    axes: {
      x: {
        name: "Item Type",
        ordering: {
          type: "custom",
          values: orderedItems
        },
        labels: { rotation: -35 },
        padding: 0.15
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
        range: [DecreaseColor, IncreaseColor]
      }
    },

    interaction: {
      tooltip: {
        mode: "fragmented",

        fields: [
          ItemField,
          TypeField,
          ChangeField,
          PreviousField,
          CurrentField
        ],

        fieldFormatters: {
          [StartField]: tooltipCurrency.formatterFunc(),
          [EndField]: tooltipCurrency.formatterFunc(),
          [ChangeField]: formatChange,
          [PreviousField]: tooltipCurrency.formatterFunc(),
          [CurrentField]: tooltipCurrency.formatterFunc()
        }
      }
    }
  })

  .data(data)
  .mount("#chart");

// Centered Summary and Legend
const chart = document.querySelector("#chart");
const parent = chart?.parentElement;

if (parent) {
  parent.style.position = "relative";
  parent.querySelector("#waterfall-summary")?.remove();

  const summary = document.createElement("div");
  summary.id = "waterfall-summary";

  summary.style.cssText = `
    position:absolute;
    top:7px;
    left:50%;
    transform:translateX(-50%);
    z-index:10;
    display:flex;
    flex-wrap:wrap;
    align-items:center;
    justify-content:center;
    gap:8px 15px;
    max-width:calc(100% - 20px);
    padding:5px 10px;
    background:rgba(255,255,255,.95);
    border-radius:4px;
    font:12px Arial,sans-serif;
    color:#555;
    pointer-events:none;
  `;

  const addText = (value, bold = false) => {
    const span = document.createElement("span");
    span.textContent = value;

    if (bold) span.style.fontWeight = "600";

    summary.appendChild(span);
  };

  const addLegendItem = (label, color) => {
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
      background:${color};
    `;

    const text = document.createElement("span");
    text.textContent = label;

    item.append(swatch, text);
    summary.appendChild(item);
  };

 const summaryCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1
});

const formatSummaryChange = value =>
  (value > 0 ? "+" : "") + summaryCurrency.format(value);

addText(`${StartYear}: ${summaryCurrency.format(startTotal)}`);
addText(`${EndYear}: ${summaryCurrency.format(endTotal)}`);
addText(`Change: ${formatSummaryChange(netChange)}`, true);

  addLegendItem("Increase", IncreaseColor);
  addLegendItem("Decrease", DecreaseColor);

  parent.appendChild(summary);
}