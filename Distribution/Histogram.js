/**
 * Available Columns:
 * "store"
 * "Total sales"
 * "Store Count"
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
const StoreField = "store";
const SalesField = "Total sales";
const BinField = "Sales Range";
const CountField = "Number of Stores";

const BarColor = "#F36421";
const BinSize = 10000000;

// Formatters
const compactUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 0
});

const countFormatter = new NumberFormatter("decimal", {
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

// Get ThoughtSpot Data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = names => schema.findIndex(
  field =>
    names.includes(field.name) ||
    names.includes(field.displayName)
);

const storeIndex = fieldIndex([StoreField, "Store"]);
const salesIndex = fieldIndex([SalesField, "Total Sales"]);

if (storeIndex < 0 || salesIndex < 0) {
  throw new Error("Search requires Store and Total Sales.");
}

setGlobalOptions({
  displayAs: {
    columns: {
      [BinField]: "Sales Range",
      [CountField]: "Number of Stores"
    }
  }
});

// Sales per Store
const storeSales = new Map();

for (const row of result.data || []) {
  const store = String(
    cellValue(row[storeIndex]) ?? ""
  ).trim();

  const raw = cellValue(row[salesIndex]);
  const sales = raw == null || raw === "" ? NaN : Number(raw);

  if (!store || !Number.isFinite(sales)) continue;

  storeSales.set(
    store,
    (storeSales.get(store) || 0) + sales
  );
}

const salesValues = [...storeSales.values()];

if (!salesValues.length) {
  throw new Error("No valid Store Sales values found.");
}

// Calculate Histogram Bins
const minSales = Math.min(...salesValues);
const maxSales = Math.max(...salesValues);

const binStart = Math.floor(minSales / BinSize) * BinSize;
const binCount = Math.floor(maxSales / BinSize)
  - Math.floor(minSales / BinSize) + 1;

if (binCount > 150) {
  throw new Error(
    "Too many bins. Increase BinSize."
  );
}

const binCounts = Array(binCount).fill(0);

for (const sales of salesValues) {
  const index = Math.floor(
    (sales - binStart) / BinSize
  );

  binCounts[index]++;
}

// Include All Bins, Including Empty Ones
const orderedBins = Array.from(
  { length: binCount },
  (_, index) => {
    const lower = binStart + index * BinSize;
    const upper = lower + BinSize;

    return `${compactUSD.format(lower)} - ${compactUSD.format(upper)}`;
  }
);

const histogramData = orderedBins.map((label, index) => ({
  [BinField]: label,
  [CountField]: binCounts[index]
}));

const data = new muze.DataModel(
  muze.DataModel.loadDataSync(
    histogramData,
    [
      { name: BinField, type: "dimension" },
      {
        name: CountField,
        type: "measure",
        defAggFn: "sum"
      }
    ]
  )
);

// Histogram
muze
  .canvas()

  .columns([BinField])
  .rows([CountField])
  .title(" ")

  .layers([{
    mark: "bar",
    encoding: {
      color: { value: () => BarColor }
    }
  }])

  .config({
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
        name: "Sales per Store",
        ordering: {
          type: "custom",
          values: orderedBins
        },
        padding: 0,
        labels: { rotation: -35 }
      },

      y: {
        name: "Number of Stores",
        domain: [0, null],
        numberOfTicks: 5,
        tickFormat: countFormatter.formatterFunc()
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
          [CountField]: countFormatter.formatterFunc()
        }
      }
    }
  })

  .data(data)
  .mount("#chart");