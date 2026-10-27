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
const CumulativeField = "Cumulative Distribution %";

const LineColor = "#F36421";
const FillColor = "#F9BE9C";

setGlobalOptions({
  displayAs: {
    columns: {
      [ProductField]: "Product",
      [SalesField]: "Sales",
      [CumulativeField]: "Cumulative Distribution %"
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

const cellValue = value => {
  if (value == null || typeof value !== "object")
    return value;

  for (const key of ["rawValue", "value", "_value", "v"]) {
    if (key in value) {
      const raw = value[key];

      return cellValue(
        typeof raw === "function"
          ? raw.call(value)
          : raw
      );
    }
  }

  return null;
};

const formatPercent = value => {
  const raw = cellValue(value);
  const number = raw == null || raw === "" ? NaN : Number(raw);

  return Number.isFinite(number)
    ? `${number.toFixed(0)}%`
    : "";
};

// Get ThoughtSpot Data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const productIndex = fieldIndex(ProductField);
const salesIndex = fieldIndex(SalesField);

if (productIndex < 0 || salesIndex < 0) {
  throw new Error(
    "Search requires product and Total sales."
  );
}

// Aggregate Sales by Product
const salesByProduct = new Map();

for (const row of result.data || []) {
  const product = String(
    cellValue(row[productIndex]) ?? ""
  ).trim();

  const rawSales = cellValue(row[salesIndex]);
  const sales = rawSales == null || rawSales === ""
    ? NaN
    : Number(rawSales);

  if (!product || !Number.isFinite(sales)) continue;

  salesByProduct.set(
    product,
    (salesByProduct.get(product) || 0) + sales
  );
}

// Sort Products by Sales
const orderedProducts = [...salesByProduct.entries()]
  .filter(([, sales]) => sales >= 0)
  .sort((a, b) =>
    a[1] - b[1] ||
    a[0].localeCompare(b[0])
  );

if (orderedProducts.length < 2) {
  throw new Error(
    "Cumulative Distribution requires at least two products."
  );
}

// Calculate Cumulative Distribution
const productCount = orderedProducts.length;

const cumulativeByProduct = new Map(
  orderedProducts.map(([product], index) => [
    product,
    (index + 1) / productCount * 100
  ])
);

// Preserve Original ThoughtSpot DataModel
const data = source.calculateVariable(
  {
    name: CumulativeField,
    type: "measure",
    defAggFn: "min"
  },
  [ProductField],
  product =>
    cumulativeByProduct.get(
      String(cellValue(product) ?? "").trim()
    ) ?? null
);

// Cumulative Distribution Plot
muze
  .canvas()

  .columns([SalesField])
  .rows([CumulativeField])
  .detail([ProductField, SalesField])

  .layers([
    {
      mark: "area",
      interactive: false,
      encoding: {
        x: SalesField,
        y: CumulativeField,
        color: { value: () => FillColor }
      },
      transform: { type: "identity" },
      interpolate: "linear"
    },

    {
      mark: "line",
      encoding: {
        x: SalesField,
        y: CumulativeField,
        color: { value: () => LineColor }
      },
      transform: { type: "identity" },
      interpolate: "linear"
    },

    {
      mark: "point",
      encoding: {
        x: SalesField,
        y: CumulativeField,
        color: { value: () => LineColor },
        opacity: { value: () => 0.45 }
      },
      transform: { type: "identity" }
    }
  ])

  .config({
    autoGroupBy: { disabled: true },

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
        name: "Sales per Product",
        domain: [0, null],
        numberOfTicks: 6,
        tickFormat: axisCurrency.formatterFunc()
      },

      y: {
        name: "Cumulative Distribution (%)",
        domain: [0, 100],
        numberOfTicks: 6,
        tickFormat: formatPercent
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
          [SalesField]: tooltipCurrency.formatterFunc(),
          [CumulativeField]: formatPercent
        }
      }
    }
  })

  .data(data)
  .mount("#chart");