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

// Fields and Settings
const ProductField = "product";
const SalesField = "Total sales";
const DensityField = "Estimated Density";

const LineColor = "#F36421";
const FillColor = "#F9BE9C";
const SalesScale = 1000000;
const BandwidthMultiplier = 1;

setGlobalOptions({
  displayAs: {
    columns: {
      [ProductField]: "Product",
      [SalesField]: "Sales",
      [DensityField]: "Estimated Density"
    }
  }
});

// Formatters
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

const cellValue = value => {
  if (
    value == null ||
    typeof value !== "object" ||
    value instanceof Date
  ) return value;

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

const numericValue = value => {
  const raw = cellValue(value);
  return raw == null || raw === "" ? NaN : Number(raw);
};

const formatTooltipSales = value => {
  const number = numericValue(value);
  return Number.isFinite(number)
    ? fullUSD.format(number)
    : "";
};

const formatDensity = value => {
  const number = numericValue(value);
  return Number.isFinite(number)
    ? number.toFixed(3)
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

  const sales = numericValue(row[salesIndex]);

  if (!product || !Number.isFinite(sales)) continue;

  salesByProduct.set(
    product,
    (salesByProduct.get(product) || 0) + sales
  );
}

const validProducts = [...salesByProduct.entries()]
  .filter(([, sales]) => sales >= 0);

const salesValues = validProducts
  .map(([, sales]) => sales / SalesScale)
  .sort((a, b) => a - b);

const n = salesValues.length;

if (n < 2) {
  throw new Error(
    "Density Plot requires at least two products."
  );
}

// KDE Bandwidth
const mean = salesValues.reduce(
  (sum, value) => sum + value, 0
) / n;

const standardDeviation = Math.sqrt(
  salesValues.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0
  ) / n
);

const percentile = p => {
  const index = (n - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  return salesValues[lower] +
    (salesValues[upper] - salesValues[lower]) *
    (index - lower);
};

const iqr = percentile(0.75) - percentile(0.25);
const minSales = salesValues[0];
const maxSales = salesValues[n - 1];

const spread = [standardDeviation, iqr / 1.34]
  .filter(value => value > 0);

const robustSpread = spread.length
  ? Math.min(...spread)
  : maxSales - minSales || 1;

const bandwidth = Math.max(
  0.000001,
  0.9 * robustSpread * n ** -0.2
) * BandwidthMultiplier;

// Gaussian Kernel Density
const estimateDensity = x => {
  const total = salesValues.reduce((sum, sales) => {
    const u = (x - sales) / bandwidth;
    return sum + Math.exp(-0.5 * u * u);
  }, 0);

  return total / (
    n * bandwidth * Math.sqrt(2 * Math.PI)
  );
};

const densityByProduct = new Map(
  validProducts.map(([product, sales]) => [
    product,
    estimateDensity(sales / SalesScale)
  ])
);

// Preserve Original ThoughtSpot DataModel
const data = source.calculateVariable(
  {
    name: DensityField,
    type: "measure",
    defAggFn: "min"
  },
  [ProductField],
  product =>
    densityByProduct.get(
      String(cellValue(product) ?? "").trim()
    ) ?? null
);

// Density Plot
muze
  .canvas()

  .columns([SalesField])
  .rows([DensityField])
  .detail([ProductField, SalesField])

  .layers([
    {
      mark: "area",
      interactive: false,
      encoding: {
        x: SalesField,
        y: DensityField,
        color: { value: () => FillColor }
      },
      transform: { type: "identity" },
      interpolate: "linear"
    },

    {
      mark: "line",
      encoding: {
        x: SalesField,
        y: DensityField,
        color: { value: () => LineColor }
      },
      transform: { type: "identity" },
      interpolate: "linear"
    },

    {
      mark: "point",
      encoding: {
        x: SalesField,
        y: DensityField,
        color: { value: () => LineColor },
        opacity: { value: () => 0.4 }
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
        domain: [
          0,
          Math.max(
            (maxSales + bandwidth * 2) * SalesScale,
            bandwidth * 4 * SalesScale
          )
        ],
        numberOfTicks: 6,
        tickFormat: axisCurrency.formatterFunc()
      },

      y: {
        name: "Estimated Density per $1M",
        domain: [0, null],
        numberOfTicks: 5,
        tickFormat: formatDensity
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
          [SalesField]: formatTooltipSales,
          [DensityField]: formatDensity
        }
      }
    }
  })

  .data(data)
  .mount("#chart");