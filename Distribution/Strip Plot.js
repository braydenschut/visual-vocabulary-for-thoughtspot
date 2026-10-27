/**
 * Available Columns:
 * "store"
 * "region"
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
const StoreField = "store";
const RegionField = "region";
const SalesField = "Total sales";

const PointColor = "#F36421";
const PointOpacity = 0.60;

setGlobalOptions({
  displayAs: {
    columns: {
      [StoreField]: "Store",
      [RegionField]: "Region",
      [SalesField]: "Store Sales"
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

// Get ThoughtSpot Data
const data = await getDataFromSearchQuery();
const result = data.getData();
const schema = result.schema || data.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const regionIndex = fieldIndex(RegionField);
const salesIndex = fieldIndex(SalesField);

if (regionIndex < 0 || salesIndex < 0) {
  throw new Error(
    "Search requires region and Total sales."
  );
}

// Collect Regions and Sales Range
const regions = new Set();
let minSales = 0;
let maxSales = 0;

for (const row of result.data || []) {
  const region = String(
    cellValue(row[regionIndex]) ?? ""
  ).trim();

  const rawSales = cellValue(row[salesIndex]);
  const sales = rawSales == null || rawSales === ""
    ? NaN
    : Number(rawSales);

  if (!region || !Number.isFinite(sales)) continue;

  regions.add(region);
  minSales = Math.min(minSales, sales);
  maxSales = Math.max(maxSales, sales);
}

const orderedRegions = [...regions]
  .sort((a, b) => a.localeCompare(b));

if (!orderedRegions.length) {
  throw new Error("No valid regional Sales data found.");
}

// Strip Plot
muze
  .canvas()

  .columns([RegionField])
  .rows([SalesField])
  .detail([StoreField])

  .title(" ")

  .layers([{
    mark: "point",
    encoding: {
      x: RegionField,
      y: SalesField,
      color: { value: () => PointColor },
      opacity: { value: () => PointOpacity }
    }
  }])

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
        name: "Region",
        ordering: {
          type: "custom",
          values: orderedRegions
        },
        padding: 0.4
      },

      y: {
        name: "Store Sales",
        domain: [
          minSales < 0 ? minSales * 1.08 : 0,
          maxSales > 0 ? maxSales * 1.08 : 1
        ],
        numberOfTicks: 5,
        tickFormat: axisCurrency.formatterFunc()
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
          [SalesField]: tooltipCurrency.formatterFunc()
        }
      }
    }
  })

  .data(data)
  .mount("#chart");