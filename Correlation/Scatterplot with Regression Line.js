/**
 * Available Columns:
 * "product"
 * "Total sales"
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

// Fields and Colors
const ProductField = "product";
const SalesField = "Total sales";
const QuantityField = "Total quantity purchased";
const RegressionField = "Predicted Quantity";

const PointColor = "#957247";
const LineColor = "#5F452A";

setGlobalOptions({
  displayAs: {
    columns: {
      [ProductField]: "Product",
      [SalesField]: "Sales",
      [QuantityField]: "Quantity Purchased",
      [RegressionField]: "Predicted Quantity"
    }
  }
});

// Formatters
const salesAxis = new NumberFormatter("currency", {
  currency: "USD",
  unit: "auto",
  decimalDigits: 0
});

const quantityAxis = new NumberFormatter("decimal", {
  unit: "auto",
  decimalDigits: 0
});

const fullSales = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const fullQuantity = new Intl.NumberFormat("en-US", {
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
      const result = value[key];
      return cellValue(
        typeof result === "function"
          ? result.call(value)
          : result
      );
    }
  }

  return null;
};

const numericValue = value => {
  const raw = cellValue(value);
  return raw == null || raw === "" ? NaN : Number(raw);
};

const normalizeProduct = value =>
  String(cellValue(value) ?? "").trim();

const tooltipFormat = formatter => value => {
  const number = numericValue(value);
  return Number.isFinite(number)
    ? formatter.format(number)
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
const quantityIndex = fieldIndex(QuantityField);

if ([productIndex, salesIndex, quantityIndex].includes(-1)) {
  throw new Error(
    "Search requires product, Total sales, and Total quantity purchased."
  );
}

// Aggregate by Product
const productTotals = new Map();

for (const row of result.data || []) {
  const product = normalizeProduct(row[productIndex]);
  const sales = numericValue(row[salesIndex]);
  const quantity = numericValue(row[quantityIndex]);

  if (
    !product ||
    !Number.isFinite(sales) ||
    !Number.isFinite(quantity)
  ) continue;

  if (!productTotals.has(product)) {
    productTotals.set(product, {
      sales: 0,
      quantity: 0
    });
  }

  const totals = productTotals.get(product);
  totals.sales += sales;
  totals.quantity += quantity;
}

const observations = [...productTotals.entries()]
  .map(([product, totals]) => ({
    product,
    x: totals.sales,
    y: totals.quantity
  }))
  .filter(point =>
    point.x >= 0 && point.y >= 0
  )
  .sort((a, b) => a.x - b.x);

if (observations.length < 2) {
  throw new Error(
    "At least two products are required for regression."
  );
}

// Linear Regression
const n = observations.length;

const meanX = observations.reduce(
  (sum, point) => sum + point.x, 0
) / n;

const meanY = observations.reduce(
  (sum, point) => sum + point.y, 0
) / n;

let sumXX = 0;
let sumXY = 0;
let totalVariation = 0;

for (const point of observations) {
  const dx = point.x - meanX;
  const dy = point.y - meanY;

  sumXX += dx * dx;
  sumXY += dx * dy;
  totalVariation += dy * dy;
}

if (sumXX === 0) {
  throw new Error(
    "Regression requires variation in Sales."
  );
}

const slope = sumXY / sumXX;
const intercept = meanY - slope * meanX;

const predictQuantity = sales =>
  intercept + slope * sales;

const residualVariation = observations.reduce(
  (sum, point) =>
    sum + Math.pow(
      point.y - predictQuantity(point.x),
      2
    ),
  0
);

const rSquared = totalVariation > 0
  ? 1 - residualVariation / totalVariation
  : null;

// Add Predicted Quantity to Original DataModel
const predictedByProduct = new Map(
  observations.map(point => [
    point.product,
    predictQuantity(point.x)
  ])
);

const data = source.calculateVariable(
  {
    name: RegressionField,
    type: "measure",
    defAggFn: "min"
  },
  [ProductField],
  product =>
    predictedByProduct.get(
      normalizeProduct(product)
    ) ?? null
);

// Axis Ranges
const maxSales = Math.max(
  ...observations.map(point => point.x)
);

const maxQuantity = Math.max(
  ...observations.map(point => point.y)
);

const maxPrediction = Math.max(
  ...observations.map(point =>
    predictQuantity(point.x)
  )
);

const xMaximum = Math.max(1, maxSales * 1.05);

const yMaximum = Math.max(
  1,
  maxQuantity * 1.1,
  maxPrediction * 1.1
);

// Scatterplot with Regression Line
muze
  .canvas()

  .columns([SalesField])

  .rows([
    muze.Operators.share(
      QuantityField,
      RegressionField
    )
  ])

  .detail([ProductField])

  .title(" ")
  .subtitle(" ")

  .layers([
    {
      mark: "line",
      interactive: false,
      encoding: {
        x: SalesField,
        y: RegressionField,
        color: { value: () => LineColor }
      },
      interpolate: "linear"
    },

    {
      mark: "point",
      interactive: true,
      encoding: {
        x: SalesField,
        y: QuantityField,
        color: { value: () => PointColor },
        opacity: { value: () => 0.65 }
      }
    }
  ])

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
        name: "Sales",
        domain: [0, xMaximum],
        numberOfTicks: 5,
        tickFormat: salesAxis.formatterFunc()
      },

      y: {
        name: "Quantity Purchased",
        domain: [0, yMaximum],
        numberOfTicks: 5,
        tickFormat: quantityAxis.formatterFunc()
      }
    },

    gridLines: {
      x: { show: true },
      y: { show: true }
    },

    legend: {
      color: { show: false }
    },

    interaction: {
      tooltip: {
        includeDataFromAllLayers: false,
        fieldFormatters: {
          [SalesField]: tooltipFormat(fullSales),
          [QuantityField]: tooltipFormat(fullQuantity),
          [RegressionField]: tooltipFormat(fullQuantity)
        }
      }
    }
  })

  .data(data)
  .mount("#chart");

// Centered Legend
const chart = document.querySelector("#chart");
const parent = chart?.parentElement;

if (parent) {
  parent.style.position = "relative";
  parent.querySelector("#regression-scatter-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "regression-scatter-legend";

  legend.style.cssText = `
    position:absolute;
    top:10px;
    left:50%;
    transform:translateX(-50%);
    z-index:10;
    display:flex;
    align-items:center;
    gap:18px;
    padding:6px 10px;
    background:rgba(255,255,255,.95);
    border-radius:4px;
    font:12px Arial,sans-serif;
    color:#555;
    white-space:nowrap;
    pointer-events:none;
  `;

  const entries = [
    ["Product", PointColor, "point"],
    [
      `Linear Trend${
        rSquared == null
          ? ""
          : ` (R² = ${rSquared.toFixed(2)})`
      }`,
      LineColor,
      "line"
    ]
  ];

  legend.innerHTML = entries.map(([label, color, type]) => `
    <span style="
      display:inline-flex;
      align-items:center;
      gap:6px;
    ">
      <span style="
        display:inline-block;
        width:${type === "point" ? "9px" : "20px"};
        height:${type === "point" ? "9px" : "3px"};
        background:${color};
        border-radius:${type === "point" ? "50%" : "0"};
      "></span>
      ${label}
    </span>
  `).join("");

  parent.appendChild(legend);
}