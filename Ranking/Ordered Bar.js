/**
 * Available Columns:
 * "product"
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

const ProductField = "product";
const SalesField = "Total sales";
const BarColor = "#018DB0";

setGlobalOptions({
  displayAs: {
    columns: {
      [ProductField]: "Product",
      [SalesField]: "Sales"
    }
  }
});

const axisCurrency = new NumberFormatter("currency", {
  currency: "USD",
  unit: "auto",
  decimalDigits: 0
});

const fullUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const formatTooltip = value => {
  const raw = value?.rawValue ?? value?.value ?? value;
  const number = Number(
    typeof raw === "function" ? raw.call(value) : raw
  );

  return Number.isFinite(number)
    ? fullUSD.format(number)
    : "";
};

const data = await getDataFromSearchQuery();

muze
  .canvas()
  .rows([ProductField])
  .columns([SalesField])

  .layers([{
    mark: "bar",
    encoding: {
      color: { value: () => BarColor }
    }
  }])

  .config({
    axes: {
      x: {
        name: "Sales",
        domain: [0, null],
        tickFormat: axisCurrency.formatterFunc()
      },
      y: {
        name: "Product",
        ordering: {
          type: "measure",
          measure: SalesField,
          order: "desc"
        }
      }
    },
    interaction: {
      tooltip: {
        fieldFormatters: {
          [SalesField]: formatTooltip
        }
      }
    }
  })

  .data(data)
  .mount("#chart");