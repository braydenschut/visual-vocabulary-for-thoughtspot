/**
 * Available Columns:
 * "store"
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

const StoreField = "store";
const QuantityField = "Total quantity purchased";
const BarColor = "#018DB0";

setGlobalOptions({
  displayAs: {
    columns: {
      [StoreField]: "Store",
      [QuantityField]: "Quantity Purchased"
    }
  }
});

const axisQuantity = new NumberFormatter("decimal", {
  unit: "auto",
  decimalDigits: 0
});

const tooltipQuantity = new NumberFormatter("decimal", {
  unit: "none",
  decimalDigits: 0
});

const data = await getDataFromSearchQuery();

muze
  .canvas()

  .columns([StoreField])
  .rows([QuantityField])

  .layers([{
    mark: "bar",
    encoding: {
      color: { value: () => BarColor }
    }
  }])

  .config({
    axes: {
      x: {
        name: "Store",
        ordering: {
          type: "measure",
          measure: QuantityField,
          order: "desc"
        },
        labels: { rotation: -45 }
      },

      y: {
        name: "Quantity Purchased",
        domain: [0, null],
        tickFormat: axisQuantity.formatterFunc()
      }
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