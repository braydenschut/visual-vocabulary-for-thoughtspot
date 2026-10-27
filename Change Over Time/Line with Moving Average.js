/**
 * Available Columns:
 * "Month(date)"
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

const MonthField = "Month(date)";
const YearField = "Year(date)";
const SalesField = "Total sales";
const AverageField = "3-Month Moving Average";

const SalesColor = "#A8D9AE";
const AverageColor = "#269039";
const Window = 3;

setGlobalOptions({
  displayAs: {
    columns: {
      [MonthField]: "Month",
      [YearField]: "Year",
      [SalesField]: "Monthly Sales",
      [AverageField]: "3-Month Moving Average"
    }
  }
});

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

const parseMonth = value => {
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

  if (Number.isNaN(date.getTime())) return null;

  return `${date.getUTCFullYear()}-${String(
    date.getUTCMonth() + 1
  ).padStart(2, "0")}`;
};

const formatMonth = value => {
  const key = parseMonth(value);
  if (!key) return "";

  return new Date(`${key}-01T00:00:00Z`)
    .toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    });
};

// Get Original ThoughtSpot Data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const monthIndex = fieldIndex(MonthField);
const salesIndex = fieldIndex(SalesField);

if (monthIndex < 0 || salesIndex < 0) {
  throw new Error(
    "Search requires Month(date) and Total sales."
  );
}

// Aggregate Monthly Sales
const monthlySales = new Map();
const monthValues = new Map();

for (const row of result.data || []) {
  const rawMonth = cellValue(row[monthIndex]);
  const month = parseMonth(rawMonth);
  const rawSales = cellValue(row[salesIndex]);
  const sales = rawSales == null || rawSales === ""
    ? NaN
    : Number(rawSales);

  if (!month || !Number.isFinite(sales)) continue;

  monthlySales.set(
    month,
    (monthlySales.get(month) || 0) + sales
  );

  if (!monthValues.has(month)) {
    monthValues.set(month, rawMonth);
  }
}

const orderedKeys = [...monthlySales.keys()].sort();

if (!orderedKeys.length) {
  throw new Error("No valid monthly Sales data found.");
}

const orderedMonths = orderedKeys.map(
  month => monthValues.get(month)
);

// Calculate 3-Month Moving Average
const movingAverage = new Map();

for (const key of orderedKeys) {
  const [year, month] = key.split("-").map(Number);

  const periods = Array.from({ length: Window }, (_, i) => {
    const date = new Date(
      Date.UTC(year, month - Window + i, 1)
    );

    return `${date.getUTCFullYear()}-${String(
      date.getUTCMonth() + 1
    ).padStart(2, "0")}`;
  });

  const complete = periods.every(
    period => monthlySales.has(period)
  );

  movingAverage.set(
    key,
    complete
      ? periods.reduce(
          (sum, period) => sum + monthlySales.get(period),
          0
        ) / Window
      : null
  );
}

// Preserve Original ThoughtSpot DataModel
const data = source.calculateVariable(
  {
    name: AverageField,
    type: "measure",
    defAggFn: "min"
  },
  [MonthField],
  month => movingAverage.get(parseMonth(month)) ?? null
);

// Line with Moving Average
muze
  .canvas()

  .columns([MonthField])
  .rows([
    muze.Operators.share(SalesField, AverageField)
  ])

  .title(" ")

  .layers([
    {
      mark: "line",
      encoding: {
        x: MonthField,
        y: SalesField,
        color: { value: () => SalesColor }
      },
      interpolate: "linear"
    },

    {
      mark: "line",
      encoding: {
        x: MonthField,
        y: AverageField,
        color: { value: () => AverageColor }
      },
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
      color: { show: false }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [MonthField]: formatMonth,
          [SalesField]: tooltipCurrency.formatterFunc(),
          [AverageField]: tooltipCurrency.formatterFunc()
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
  parent.style.position = "relative";
  parent.querySelector("#moving-average-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "moving-average-legend";

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
    ["Monthly Sales", SalesColor],
    ["3-Month Moving Average", AverageColor]
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