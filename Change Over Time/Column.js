
/**
 * Available Columns:
 * "Quarter(date)"
 * "Total sales"
 */

const {
  muze,
  getDataFromSearchQuery,
  setGlobalOptions,
  formatters: { NumberFormatter }
} = viz;

const QuarterField = "Quarter(date)";
const SalesField = "Total sales";
const BarColor = "#269039";

setGlobalOptions({
  displayAs: {
    columns: {
      [QuarterField]: "Quarter",
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

// Display Q1 2025, Q2 2025, etc.
const formatQuarter = value => {
  const raw = cellValue(value);
  if (raw == null || raw === "") return "";

  const text = String(raw).trim();

  // Support quarter strings in either order.
  const match = text.match(
    /Q([1-4])[\s/-]*(\d{4})|(\d{4})[\s/-]*Q([1-4])/i
  );

  if (match) {
    const quarter = match[1] || match[4];
    const year = match[2] || match[3];
    return `Q${quarter} ${year}`;
  }

  // Support ThoughtSpot date values and timestamps.
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

  if (Number.isNaN(date.getTime())) return "";

  return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
};

// Original ThoughtSpot DataModel
const data = await getDataFromSearchQuery();

// Column Chart
muze
  .canvas()

  .columns([QuarterField])
  .rows([SalesField])

  .title(" ")

  .layers([
    {
      mark: "bar",
      encoding: {
        color: { value: () => BarColor }
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
        sort: "asc",
        padding: 0.15,
        tickFormat: formatQuarter,
        labels: { rotation: -35 }
      },

      y: {
        name: "Sales",
        domain: [0, null],
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
          [QuarterField]: formatQuarter,
          [SalesField]: tooltipCurrency.formatterFunc()
        }
      }
    }
  })

  .data(data)
  .mount("#chart");