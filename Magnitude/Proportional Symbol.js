/**
 * Available Columns:
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

const ItemField = "item type";
const SalesField = "Total sales";
const ChartColor = "#A2468C";

setGlobalOptions({
  displayAs: {
    columns: {
      [ItemField]: "Item Type",
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

// Original ThoughtSpot DataModel
const data = await getDataFromSearchQuery();

// Proportional Symbol Chart
muze
  .canvas()

  .rows([ItemField])
  .columns([SalesField])

  .size(SalesField)

  .layers([
    {
      mark: "point",
      encoding: {
        x: SalesField,
        color: { value: () => ChartColor },
        opacity: { value: () => 0.8 }
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
        name: "Sales",
        domain: [0, null],
        numberOfTicks: 5,
        tickFormat: axisCurrency.formatterFunc()
      },

      y: {
        name: "Item Type",
        ordering: {
          type: "field",
          direction: "desc",
          field: {
            name: SalesField,
            aggregation: "sum"
          }
        }
      }
    },

    gridLines: {
      x: { show: true },
      y: { show: false }
    },

    legend: {
      color: { show: false },
      size: { show: true }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [SalesField]: tooltipCurrency.formatterFunc()
        }
      }
    }
  })

  .data(data)
  .mount("#chart");