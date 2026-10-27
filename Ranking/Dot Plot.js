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
const PointColor = "#018DB0";

setGlobalOptions({
  displayAs: {
    columns: {
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

const data = await getDataFromSearchQuery();

muze
  .canvas()
  .rows([ItemField])
  .columns([SalesField])

  .layers([
    {
      mark: "point",
      encoding: {
        color: { value: () => PointColor },
        opacity: { value: () => 1
        }
      }
    }
  ])

  .config({
    axes: {
      x: {
        name: "Sales",
        domain: [0, null],
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
      x: { show: false },
      y: { show: true }
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