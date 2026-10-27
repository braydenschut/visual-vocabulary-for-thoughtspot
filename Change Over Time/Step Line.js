/**
 * Available Columns:
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
const SalesField = "Total sales";
const LineColor = "#269039";

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

// Format original dates as Q# YYYY
const formatQuarter = value => {
  const raw = cellValue(value);
  if (raw == null || raw === "") return "";

  const text = String(raw);
  const match = text.match(/Q([1-4])[\s/-]*(\d{4})|(\d{4})[\s/-]*Q([1-4])/i);

  if (match) {
    const year = match[2] || match[3];
    const quarter = match[1] || match[4];
    return `Q${quarter} ${year}`;
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

  if (Number.isNaN(date.getTime())) return "";

  return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
};

const data = await getDataFromSearchQuery();

// Step Line Chart
muze
  .canvas()

  .columns([QuarterField])
  .rows([SalesField])

  .layers([
    {
      mark: "line",
      encoding: {
        color: { value: () => LineColor }
      },
      interpolate: "stepAfter"
    },

    {
      mark: "point",
      encoding: {
        color: { value: () => LineColor },
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
        tickFormat: formatQuarter,
        labels: { rotation: -35 }
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
          [QuarterField]: formatQuarter,
          [SalesField]: tooltipCurrency.formatterFunc()
        }
      }
    }
  })

  .data(data)
  .mount("#chart");