
/**
 * Available Columns:
 * "Year(date)"
 * "item type"
 * "Total sales"
 */

const {
  muze,
  getDataFromSearchQuery,
  setGlobalOptions,
  formatters: { NumberFormatter, DateFormatter }
} = viz;

const YearField = "Year(date)";
const ItemField = "item type";
const SalesField = "Total sales";

setGlobalOptions({
  displayAs: {
    columns: {
      [YearField]: "Year",
      [ItemField]: "Item Type",
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
  .rows([SalesField])
  .color(ItemField)

  .title(" ")

  .layers([
    {
      mark: "line",
      encoding: {
        color: { field: ItemField }
      },
      interpolate: "linear"
    },
    {
      mark: "point",
      encoding: {
        color: { field: ItemField },
        size: { value: () => 0.02 },
        opacity: { value: () => 1 }
      }
    }
  ])

  .config({
    columns: {
      headers: { show: false }
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
        tickFormat: axisCurrency.formatterFunc()
      }
    },

    gridLines: {
      x: { show: false },
      y: { show: false }
    },

    legend: {
      position: "right"
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