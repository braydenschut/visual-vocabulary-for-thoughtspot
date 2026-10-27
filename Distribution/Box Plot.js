/**
 * Available Columns:
 * "region"
 * "store"
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
const RegionField = "region";
const StoreField = "store";
const SalesField = "Total sales";

const MinField = "Minimum Sales";
const Q1Field = "Q1 Sales";
const MedianField = "Median Sales";
const Q3Field = "Q3 Sales";
const MaxField = "Maximum Sales";
const OutlierField = "Outlier Sales";

// Colors
const BoxColor = "#F36421";
const WhiskerColor = "#B84612";
const MedianColor = "#FFFFFF";
const OutlierColor = "#B84612";

const IQRMultiplier = 1.5;

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

const formatTooltip = value => {
  const number = numericValue(value);
  return Number.isFinite(number)
    ? fullUSD.format(number)
    : "";
};

// Display Names
setGlobalOptions({
  displayAs: {
    columns: {
      [RegionField]: "Region",
      [StoreField]: "Store",
      [SalesField]: "Store Sales",
      [MinField]: "Lower Whisker",
      [Q1Field]: "Q1",
      [MedianField]: "Median",
      [Q3Field]: "Q3",
      [MaxField]: "Upper Whisker",
      [OutlierField]: "Outlier Sales"
    }
  }
});

// Get ThoughtSpot Data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const regionIndex = fieldIndex(RegionField);
const storeIndex = fieldIndex(StoreField);
const salesIndex = fieldIndex(SalesField);

if ([regionIndex, storeIndex, salesIndex].includes(-1)) {
  throw new Error(
    "Search requires region, store, and Total sales."
  );
}

// Aggregate Sales per Store and Region
const storeSales = new Map();

for (const row of result.data || []) {
  const region = String(
    cellValue(row[regionIndex]) ?? ""
  ).trim();

  const store = String(
    cellValue(row[storeIndex]) ?? ""
  ).trim();

  const sales = numericValue(row[salesIndex]);

  if (
    !region ||
    !store ||
    !Number.isFinite(sales)
  ) continue;

  const key = JSON.stringify([region, store]);

  if (!storeSales.has(key)) {
    storeSales.set(key, { region, store, sales: 0 });
  }

  storeSales.get(key).sales += sales;
}

// Group Store Sales by Region
const groups = new Map();

for (const { region, store, sales } of storeSales.values()) {
  if (!groups.has(region))
    groups.set(region, []);

  groups.get(region).push({ store, sales });
}

// Percentile with Linear Interpolation
const percentile = (values, p) => {
  const index = (values.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  return values[lower] +
    (values[upper] - values[lower]) * (index - lower);
};

// Calculate Box Plot Statistics
const chartData = [];

for (const [region, observations] of groups) {
  const sorted = observations.sort(
    (a, b) => a.sales - b.sales
  );

  const values = sorted.map(row => row.sales);

  const q1 = percentile(values, 0.25);
  const median = percentile(values, 0.5);
  const q3 = percentile(values, 0.75);

  const iqr = q3 - q1;
  const lowerFence = q1 - IQRMultiplier * iqr;
  const upperFence = q3 + IQRMultiplier * iqr;

  const inliers = sorted.filter(
    row =>
      row.sales >= lowerFence &&
      row.sales <= upperFence
  );

  const outliers = sorted.filter(
    row =>
      row.sales < lowerFence ||
      row.sales > upperFence
  );

  const lowerWhisker = inliers[0]?.sales ?? values[0];
  const upperWhisker = inliers.at(-1)?.sales ?? values.at(-1);

  // Box statistics
  chartData.push({
    [RegionField]: region,
    [StoreField]: null,
    [MinField]: lowerWhisker,
    [Q1Field]: q1,
    [MedianField]: median,
    [Q3Field]: q3,
    [MaxField]: upperWhisker,
    [OutlierField]: null
  });

  // Individual outlier stores
  for (const row of outliers) {
    chartData.push({
      [RegionField]: region,
      [StoreField]: row.store,
      [MinField]: null,
      [Q1Field]: null,
      [MedianField]: null,
      [Q3Field]: null,
      [MaxField]: null,
      [OutlierField]: row.sales
    });
  }
}

const orderedRegions = [...groups.keys()]
  .sort((a, b) => a.localeCompare(b));

if (!orderedRegions.length) {
  throw new Error("No valid Store Sales data found.");
}

// Create Muze DataModel
const measureFields = [
  MinField,
  Q1Field,
  MedianField,
  Q3Field,
  MaxField,
  OutlierField
];

const boxSchema = [
  {
    name: RegionField,
    displayName: "Region",
    type: "dimension"
  },
  {
    name: StoreField,
    displayName: "Store",
    type: "dimension"
  },
  ...measureFields.map(name => ({
    name,
    displayName: {
      [MinField]: "Lower Whisker",
      [Q1Field]: "Q1",
      [MedianField]: "Median",
      [Q3Field]: "Q3",
      [MaxField]: "Upper Whisker",
      [OutlierField]: "Outlier Sales"
    }[name],
    type: "measure"
  }))
];

const data = new muze.DataModel(
  muze.DataModel.loadDataSync(chartData, boxSchema)
);

// Box Plot
muze
  .canvas()

  .columns([RegionField])

  .rows([
    muze.Operators.share(...measureFields)
  ])

  .title(" ")

  .layers([
    ...[
      [Q3Field, MedianField],
      [MedianField, Q1Field]
    ].map(([y, y0]) => ({
      mark: "bar",
      encoding: {
        y,
        y0,
        color: { value: () => BoxColor }
      }
    })),

    ...[
      [Q1Field, MinField],
      [MaxField, Q3Field]
    ].map(([y, y0]) => ({
      mark: "tick",
      encoding: {
        y,
        y0,
        color: { value: () => WhiskerColor }
      }
    })),

    {
      mark: "tick",
      encoding: {
        y: MedianField,
        color: { value: () => MedianColor }
      }
    },

    {
      mark: "point",
      encoding: {
        y: OutlierField,
        color: { value: () => OutlierColor },
        opacity: { value: () => 1 }
      }
    }
  ])

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
        name: "Region",
        ordering: {
          type: "custom",
          values: orderedRegions
        }
      },

      y: {
        name: "Store Sales",
        tickFormat: axisCurrency.formatterFunc()
      }
    },

    legend: {
      color: { show: false }
    },

    interaction: {
      tooltip: {
        fieldFormatters: Object.fromEntries(
          measureFields.map(
            field => [field, formatTooltip]
          )
        )
      }
    }
  })

  .data(data)
  .mount("#chart");