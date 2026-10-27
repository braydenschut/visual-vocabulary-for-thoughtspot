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
const PercentField = "% of Total Sales";

const PolarColors = [
  "#F36421",
  "#F78A50",
  "#D94E13",
  "#FFA875",
  "#B83D0B",
  "#FFC39F",
  "#E97735",
  "#C85A24",
  "#FF995E",
  "#A94A20"
];

setGlobalOptions({
  displayAs: {
    columns: {
      [ItemField]: "Item Type",
      [SalesField]: "Sales",
      [PercentField]: "% of Total Sales"
    }
  }
});

// Formatters
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
    ? `${number.toFixed(1)}%`
    : "";
};

// Get ThoughtSpot Data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const itemIndex = fieldIndex(ItemField);
const salesIndex = fieldIndex(SalesField);

if (itemIndex < 0 || salesIndex < 0) {
  throw new Error(
    "Search requires item type and Total sales."
  );
}

// Aggregate Sales by Item Type
const salesByItem = new Map();

for (const row of result.data || []) {
  const item = String(
    cellValue(row[itemIndex]) ?? ""
  ).trim();

  const rawSales = cellValue(row[salesIndex]);
  const sales = rawSales == null || rawSales === ""
    ? NaN
    : Number(rawSales);

  if (!item || !Number.isFinite(sales)) continue;

  salesByItem.set(
    item,
    (salesByItem.get(item) || 0) + sales
  );
}

const totalSales = [...salesByItem.values()]
  .reduce((sum, sales) => sum + sales, 0);

if (totalSales <= 0) {
  throw new Error("Total Sales must be greater than zero.");
}

// Preserve Original ThoughtSpot DataModel
const data = source.calculateVariable(
  {
    name: PercentField,
    type: "measure",
    defAggFn: "min"
  },
  [ItemField],
  item => {
    const name = String(cellValue(item) ?? "").trim();
    const sales = salesByItem.get(name);

    return sales == null
      ? null
      : sales / totalSales * 100;
  }
);

// Polar Area Chart
muze
  .canvas()

  .rows([])
  .columns([])
  .detail([PercentField])

  .layers([
    {
      mark: "arc",
      encoding: {
        angle: ItemField,
        color: ItemField,
        radius: SalesField,
        radius0: { value: () => 10 }
      }
    }
  ])

  .config({
    legend: {
      color: {
        show: true,
        range: PolarColors
      }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [SalesField]: tooltipCurrency.formatterFunc(),
          [PercentField]: formatPercent
        }
      }
    }
  })

  .data(data)
  .mount("#chart");