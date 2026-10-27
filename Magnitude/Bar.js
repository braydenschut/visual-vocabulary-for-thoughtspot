/**
 * Available Columns:
 * "item type"
 * "Total sales"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

/**
 * Available Columns:
 * "item type"
 * "Total sales"
 */

const {
  muze,
  getDataFromSearchQuery,
  setGlobalOptions,
  formatters: { NumberFormatter }
} = viz;

const ItemField = "item type";
const SalesField = "Total sales";
const BarColor = "#A2468C";

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

// Horizontal Bar Chart
muze
  .canvas()

  .rows([ItemField])
  .columns([SalesField])

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
        name: "Sales",
        domain: [0, null],
        tickFormat: axisCurrency.formatterFunc()
      },

      y: {
        name: "Item Type"
      }
    },

    gridLines: {
      x: { show: true },
      y: { show: false }
    },

    legend: {
      color: { show: false }
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