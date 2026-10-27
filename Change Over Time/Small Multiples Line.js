/**
 * Available Columns:
 * "Year(date)"
 * "region"
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

const YearField = "Year(date)";
const RegionField = "region";
const SalesField = "Total sales";
const LineColor = "#269039";

setGlobalOptions({
  displayAs: {
    columns: {
      [YearField]: "Year",
      [RegionField]: "Region",
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

const yearFormatter = new DateFormatter({
  format: "yyyy"
});

const data = await getDataFromSearchQuery();

muze
  .canvas()

  .columns([YearField])
  .rows([RegionField, SalesField])

  .layers([
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
    columns: {
      headers: { show: false }
    },

    rows: {
      headers: { show: true }
    },

    axes: {
      x: {
        name: "Year",
        tickInterval: {
          step: "year",
          multiplier: 1
        },
        tickFormat: yearFormatter.formatterFunc()
      },

      y: {
        name: "Sales",
        domain: [0, null],
        numberOfTicks: 4,
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
          [YearField]: yearFormatter.formatterFunc(),
          [SalesField]: tooltipCurrency.formatterFunc()
        }
      }
    }
  })

  .data(data)
  .mount("#chart");