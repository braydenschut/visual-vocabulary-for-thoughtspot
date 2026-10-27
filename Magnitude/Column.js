/**
 * Available Columns:
 * "store"
 * "Total quantity purchased"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

/**
 * Available Columns:
 * "store"
 * "Total quantity purchased"
 */

const {
  muze,
  getDataFromSearchQuery,
  setGlobalOptions,
  formatters: { NumberFormatter }
} = viz;

const StoreField = "store";
const QuantityField = "Total quantity purchased";
const BarColor = "#A2468C";

setGlobalOptions({
  displayAs: {
    columns: {
      [StoreField]: "Store",
      [QuantityField]: "Quantity Purchased"
    }
  }
});

// Formatters
const axisQuantity = new NumberFormatter("decimal", {
  unit: "auto",
  decimalDigits: 0
});

const tooltipQuantity = new NumberFormatter("decimal", {
  unit: "none",
  decimalDigits: 0
});

// Original ThoughtSpot DataModel
const data = await getDataFromSearchQuery();

// Column Chart
muze
  .canvas()

  .columns([StoreField])
  .rows([QuantityField])

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
        name: "Store",
        labels: { rotation: -45 }
      },

      y: {
        name: "Quantity Purchased",
        domain: [0, null],
        tickFormat: axisQuantity.formatterFunc()
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
          [QuantityField]: tooltipQuantity.formatterFunc()
        }
      }
    }
  })

  .data(data)
  .mount("#chart");