/**
 * Available Columns:
 * "Month(date)"
 * "Year(date)"
 * "Total sales"
 * "Total quantity purchased"
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
const SalesField = "Total sales";
const QuantityField = "Total quantity purchased";

const ColumnColor = "#A8D9AE";
const LineColor = "#269039";

setGlobalOptions({
  displayAs: {
    columns: {
      [MonthField]: "Month",
      [SalesField]: "Sales",
      [QuantityField]: "Quantity Purchased"
    }
  }
});

// Formatters
const axisCurrency = new NumberFormatter("currency", {
  currency: "USD",
  unit: "auto",
  decimalDigits: 0
});

const axisNumber = new NumberFormatter("decimal", {
  unit: "auto",
  decimalDigits: 0
});

const tooltipCurrency = new NumberFormatter("currency", {
  currency: "USD",
  unit: "none",
  decimalDigits: 0
});

const tooltipNumber = new NumberFormatter("decimal", {
  unit: "none",
  decimalDigits: 0
});

// Preserve the original month values for chronological sorting
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

// Original ThoughtSpot DataModel
const data = await getDataFromSearchQuery();

// Build chronological month ordering
const monthValues = new Map();
const monthField = data.getField(MonthField);

if (!monthField) {
  throw new Error(`Missing Search field: ${MonthField}`);
}

monthField.data().forEach(value => {
  if (muze.DataStore.isInvalid(value)) return;

  const raw = cellValue(value);
  const key = parseMonth(raw);

  if (key && !monthValues.has(key)) {
    monthValues.set(key, raw);
  }
});

const orderedMonths = [...monthValues]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, value]) => value);

if (!orderedMonths.length) {
  throw new Error("No valid monthly dates found.");
}

for (const name of [SalesField, QuantityField]) {
  if (!data.getField(name)) {
    throw new Error(`Missing Search field: ${name}`);
  }
}

// Line + Column Chart
muze
  .canvas()

  .columns([MonthField])

  // Separate left and right Y-axes
  .rows([
    [SalesField],
    [QuantityField]
  ])
.title(" ")

  .layers([
    {
      mark: "bar",
      encoding: {
        x: MonthField,
        y: SalesField,
        color: {
          value: () => ColumnColor
        }
      }
    },

    {
      mark: "line",
      encoding: {
        x: MonthField,
        y: QuantityField,
        color: {
          value: () => LineColor
        }
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
        labels: { rotation: -45 },
        padding: 0.15
      },

      y: {
        numberOfTicks: 5,
        alignZero: true,

        fields: {
          [SalesField]: {
            name: "Sales",
            domain: [0, null],
            tickFormat: axisCurrency.formatterFunc()
          },

          [QuantityField]: {
            name: "Quantity Purchased",
            domain: [0, null],
            tickFormat: axisNumber.formatterFunc()
          }
        }
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
          [QuantityField]: tooltipNumber.formatterFunc()
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
  parent.querySelector("#line-column-chart-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "line-column-chart-legend";

  legend.style.cssText = `
    position:absolute;
    top:10px;
    left:50%;
    transform:translateX(-50%);
    z-index:10;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:18px;
    padding:6px 10px;
    background:rgba(255,255,255,.95);
    border-radius:4px;
    font:12px Arial,sans-serif;
    color:#555;
    white-space:nowrap;
    pointer-events:none;
  `;

  legend.innerHTML = `
    <span style="
      display:inline-flex;
      align-items:center;
      gap:6px;
    ">
      <span style="
        display:inline-block;
        width:11px;
        height:11px;
        border-radius:2px;
        background:${ColumnColor};
      "></span>
      Sales
    </span>

    <span style="
      display:inline-flex;
      align-items:center;
      gap:6px;
    ">
      <span style="
        display:inline-block;
        width:18px;
        height:3px;
        border-radius:2px;
        background:${LineColor};
      "></span>
      Quantity Purchased
    </span>
  `;

  parent.appendChild(legend);
}