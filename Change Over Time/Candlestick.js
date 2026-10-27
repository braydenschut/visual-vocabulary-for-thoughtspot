/**
 * Available Columns:
 * "Day(date)"
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
const DateField = "Day(date)";
const SalesField = "Total sales";

const MonthField = "Month";
const OpenField = "Open";
const HighField = "High";
const LowField = "Low";
const CloseField = "Close";
const ChangeField = "Change";
const ChangePercentField = "Change (%)";
const DaysField = "Days with Data";
const TrendField = "Trend";

const TrendColors = {
  Increasing: "#269039",
  Decreasing: "#C65A55"
};

setGlobalOptions({
  displayAs: {
    columns: {
      [MonthField]: "Month",
      [OpenField]: "Open",
      [HighField]: "High",
      [LowField]: "Low",
      [CloseField]: "Close",
      [ChangeField]: "Change",
      [ChangePercentField]: "Change (%)",
      [DaysField]: "Days with Data",
      [TrendField]: "Trend"
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

const numericValue = value => {
  const raw = cellValue(value);
  return raw == null || raw === "" ? NaN : Number(raw);
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

const formatPercent = value => {
  const number = numericValue(value);

  return Number.isFinite(number)
    ? `${number > 0 ? "+" : ""}${number.toFixed(1)}%`
    : "";
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

if (dateIndex < 0 || salesIndex < 0) {
  throw new Error(
    "Search requires Day(date) and Total sales."
  );
}

// Aggregate Daily Sales
const dailySales = new Map();

for (const row of result.data || []) {
  const date = parseDate(row[dateIndex]);
  const sales = numericValue(row[salesIndex]);

  if (!date || !Number.isFinite(sales)) continue;

  const day = date.toISOString().slice(0, 10);

  dailySales.set(
    day,
    (dailySales.get(day) || 0) + sales
  );
}

// Group Daily Sales by Month
const monthlyGroups = new Map();

for (const [day, sales] of [...dailySales].sort(
  (a, b) => a[0].localeCompare(b[0])
)) {
  const month = day.slice(0, 7);

  if (!monthlyGroups.has(month))
    monthlyGroups.set(month, []);

  monthlyGroups.get(month).push(sales);
}

// Calculate Monthly OHLC
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

const candles = [...monthlyGroups.entries()]
  .filter(([, values]) => values.length >= 2)
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([month, values]) => {
    const open = values[0];
    const close = values.at(-1);
    const change = close - open;

    return {
      [MonthField]: monthFormatter.format(
        new Date(`${month}-01T00:00:00Z`)
      ),
      [OpenField]: open,
      [HighField]: Math.max(...values),
      [LowField]: Math.min(...values),
      [CloseField]: close,
      [ChangeField]: change,
      [ChangePercentField]:
        open !== 0 ? change / Math.abs(open) * 100 : null,
      [DaysField]: values.length,
      [TrendField]:
        close >= open ? "Increasing" : "Decreasing"
    };
  });

if (!candles.length) {
  throw new Error(
    "Candlestick chart requires at least two days per month."
  );
}

const orderedMonths = candles.map(
  row => row[MonthField]
);

// Create Muze DataModel
const measureFields = [
  OpenField,
  HighField,
  LowField,
  CloseField,
  ChangeField,
  ChangePercentField,
  DaysField
];

const modelSchema = [
  {
    name: MonthField,
    displayName: "Month",
    type: "dimension"
  },
  ...measureFields.map(name => ({
    name,
    displayName: name,
    type: "measure",
    defAggFn: "min"
  })),
  {
    name: TrendField,
    displayName: "Trend",
    type: "dimension"
  }
];

const data = new muze.DataModel(
  muze.DataModel.loadDataSync(candles, modelSchema)
);

// Candlestick Chart
muze
  .canvas()

  .columns([MonthField])

  .rows([
    muze.Operators.share(
      OpenField,
      HighField,
      LowField,
      CloseField
    )
  ])

  .detail([
    ChangeField,
    ChangePercentField,
    DaysField,
    TrendField
  ])

  .title(" ")

  .layers([
    {
      mark: "tick",
      interactive: false,
      encoding: {
        x: MonthField,
        y: HighField,
        y0: LowField,
        size: { value: () => 0.001 },
        color: { value: () => "#52525B" }
      },
      transition: { disabled: true }
    },

    {
      mark: "bar",
      encoding: {
        x: MonthField,
        y: OpenField,
        y0: CloseField,
        color: { field: TrendField }
      },
      transition: { disabled: true }
    }
  ])

  .config({
    autoGroupBy: { disabled: true },

    columns: {
      headers: { show: false }
    },

    axes: {
      x: {
        name: "Month",
        ordering: {
          type: "custom",
          values: orderedMonths
        },
        labels: { rotation: -35 }
      },

      y: {
        name: "Daily Sales",
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
          [TrendField]: {
            domainRangeMap: TrendColors
          }
        }
      }
    },

    interaction: {
      tooltip: {
        includeDataFromAllLayers: false,
        fieldFormatters: {
          ...Object.fromEntries(
            [
              OpenField,
              HighField,
              LowField,
              CloseField,
              ChangeField
            ].map(field => [
              field,
              tooltipCurrency.formatterFunc()
            ])
          ),
          [ChangePercentField]: formatPercent
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
  parent.querySelector("#candlestick-chart-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "candlestick-chart-legend";

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
    ["Close ≥ Open", TrendColors.Increasing],
    ["Close < Open", TrendColors.Decreasing]
  ].forEach(([label, color]) => {
    const item = document.createElement("span");

    item.style.cssText = `
      display:inline-flex;
      align-items:center;
      gap:6px;
    `;

    const swatch = document.createElement("span");
    swatch.style.cssText = `
      width:11px;
      height:11px;
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