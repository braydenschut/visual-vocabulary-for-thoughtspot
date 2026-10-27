/**
 * Available Columns:
 * "product"
 * "Total quantity purchased"
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

// Fields
const ProductField = "product";
const SalesField = "Total sales";
const QuantityField = "Total quantity purchased";
const PointColor = "#957247";

// Display Names
setGlobalOptions({
  displayAs: {
    columns: {
      [ProductField]: "Product",
      [SalesField]: "Sales",
      [QuantityField]: "Quantity Purchased"
    }
  }
});

// Axis Formatters
const currencyFormatter = new NumberFormatter("currency", {
  currency: "USD",
  unit: "auto",
  decimalDigits: 0
});

const quantityFormatter = new NumberFormatter("decimal", {
  unit: "auto",
  decimalDigits: 0
});

// Tooltip Formatters
const fullSales = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const fullQuantity = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
});

const numericValue = value => {
  let raw = value;

  while (raw != null && typeof raw === "object") {
    if ("rawValue" in raw) raw = raw.rawValue;
    else if ("value" in raw) {
      raw = typeof raw.value === "function"
        ? raw.value()
        : raw.value;
    }
    else if ("_value" in raw) raw = raw._value;
    else break;
  }

  return raw == null || raw === "" ? NaN : Number(raw);
};

const formatTooltip = formatter => value => {
  const number = numericValue(value);
  return Number.isFinite(number)
    ? formatter.format(number)
    : "";
};

// Scatterplot
const data = await getDataFromSearchQuery();

muze
  .canvas()

  .columns([SalesField])
  .rows([QuantityField])
  .detail([ProductField])

  .layers([{
    mark: "point",
    encoding: {
      x: SalesField,
      y: QuantityField,
      color: { value: () => PointColor }
    }
  }])

  .config({
    autoGroupBy: { disabled: true },

    axes: {
      x: {
        name: "Sales",
        domain: [0, null],
        numberOfTicks: 5,
        tickFormat: currencyFormatter.formatterFunc()
      },

      y: {
        name: "Quantity Purchased",
        domain: [0, null],
        numberOfTicks: 5,
        tickFormat: quantityFormatter.formatterFunc()
      }
    },

    gridLines: {
      x: { show: true },
      y: { show: true }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [SalesField]: formatTooltip(fullSales),
          [QuantityField]: formatTooltip(fullQuantity)
        }
      }
    }
  })

  .data(data)
  .mount("#chart");
