/**
 * Available Columns:
 * "Month(date)"
 * "Total sales"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

const {
  muze,
  getDataFromSearchQuery,
  setGlobalOptions,
  formatters: { NumberFormatter, DateFormatter }
} = viz;

const MonthField = "Month(date)";
const SalesField = "Total sales";

const LineColor = "#269039";
const AreaColor = "#A8D9AE";

setGlobalOptions({
  displayAs: {
    columns: {
      [MonthField]: "Month",
      [SalesField]: "Sales"
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

const monthFormatter = new DateFormatter({
  format: "MMM"
});

const tooltipMonth = new DateFormatter({
  format: "MMM yyyy"
});

const data = await getDataFromSearchQuery();

muze
  .canvas()

  .columns([MonthField])
  .rows([SalesField])

  .layers([
    {
      mark: "area",
      interactive: false,
      encoding: {
        color: { value: () => AreaColor }
      },
      interpolate: "linear"
    },

    {
      mark: "line",
      encoding: {
        color: { value: () => LineColor }
      },
      interpolate: "linear"
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
    borders: {
      top: { show: false }
    },

    columns: {
      headers: { show: false }
    },

    rows: {
      headers: { show: false },
      facets: { show: false }
    },

    axes: {
      x: {
        name: "Month (2025)",
        tickInterval: {
          step: "month",
          multiplier: 1
        },
        tickFormat: monthFormatter.formatterFunc(),
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
        includeDataFromAllLayers: false,
        fieldFormatters: {
          [MonthField]: tooltipMonth.formatterFunc(),
          [SalesField]: tooltipCurrency.formatterFunc()
        }
      }
    }
  })

  .data(data)
  .mount("#chart");