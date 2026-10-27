/**
 * Available Columns:
 * "product"
 * "region"
 * "Total sales"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

const {
  muze,
  getDataFromSearchQuery,
  setGlobalOptions
} = viz;

// Fields
const ProductField = "product";
const RegionField = "region";
const SalesField = "Total sales";

const PlotStartField = "Plot Start";
const PlotEndField = "Plot End";
const LabelPositionField = "Label Position";
const LabelTextField = "Sales Label";

// Settings
const RegionColors = {
  East: "#E6B00E",
  West: "#A67C00"
};

const TopN = 10;

// Formatters
const compactUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 0
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

const normalizeRegion = value =>
  String(cellValue(value) ?? "").trim().toLowerCase();

const formatSales = value => {
  const number = numericValue(value);

  return Number.isFinite(number)
    ? compactUSD.format(Math.abs(number))
    : "";
};

const formatTooltipSales = value => {
  const number = numericValue(value);

  return Number.isFinite(number)
    ? fullUSD.format(Math.abs(number))
    : "";
};

const salesTick = value => {
  const number = numericValue(value);
  if (!Number.isFinite(number)) return "";

  const label = formatSales(number);
  return number < 0 ? `\u200B${label}` : label;
};

// Display Names
setGlobalOptions({
  displayAs: {
    columns: {
      [ProductField]: "Product",
      [RegionField]: "Region",
      [SalesField]: "Sales",
      [PlotStartField]: "Plot Start",
      [PlotEndField]: "Plot End",
      [LabelPositionField]: "Label Position",
      [LabelTextField]: "Sales"
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

const productIndex = fieldIndex(ProductField);
const regionIndex = fieldIndex(RegionField);
const salesIndex = fieldIndex(SalesField);

if ([productIndex, regionIndex, salesIndex].includes(-1)) {
  throw new Error(
    "Search requires product, region, and Total sales."
  );
}

// Aggregate East and West Sales
const salesByProduct = new Map();

for (const row of result.data || []) {
  const product = normalizeProduct(row[productIndex]);
  const region = normalizeRegion(row[regionIndex]);
  const sales = numericValue(row[salesIndex]);

  if (
    !product ||
    !["east", "west"].includes(region) ||
    !Number.isFinite(sales)
  ) continue;

  if (!salesByProduct.has(product)) {
    salesByProduct.set(product, {
      East: 0,
      West: 0,
      hasEast: false,
      hasWest: false
    });
  }

  const totals = salesByProduct.get(product);
  const key = region === "east" ? "East" : "West";

  totals[key] += sales;
  totals[`has${key}`] = true;
}

// Rank Products by Combined Sales
const products = [...salesByProduct.keys()]
  .filter(product => {
    const totals = salesByProduct.get(product);

    return (
      totals.hasEast &&
      totals.hasWest &&
      totals.East + totals.West > 0
    );
  })
  .sort((a, b) => {
    const first = salesByProduct.get(a);
    const second = salesByProduct.get(b);

    return (
      second.East + second.West -
      first.East - first.West ||
      a.localeCompare(b)
    );
  })
  .slice(0, TopN);

if (!products.length) {
  throw new Error(
    "No products have valid sales in both East and West."
  );
}

// Symmetric Axis Range
const maxSales = Math.max(
  ...products.flatMap(product => {
    const totals = salesByProduct.get(product);

    return [
      Math.max(0, totals.East),
      Math.max(0, totals.West)
    ];
  })
);

const magnitude = Math.pow(
  10,
  Math.floor(Math.log10(Math.max(maxSales, 1)))
);

const axisMaximum = Math.max(
  1,
  Math.ceil(maxSales * 1.05 / magnitude) * magnitude
);

// Calculate Mirrored Positions
const getSales = (product, region) => {
  const totals = salesByProduct.get(normalizeProduct(product));

  if (!totals) return null;

  const key = normalizeRegion(region) === "east"
    ? "East"
    : normalizeRegion(region) === "west"
      ? "West"
      : null;

  return key ? Math.max(0, totals[key]) : null;
};

const calculations = [
  [
    PlotStartField,
    (sales, isEast) => isEast ? -sales : 0
  ],
  [
    PlotEndField,
    (sales, isEast) => isEast ? 0 : sales
  ],
  [
    LabelPositionField,
    (sales, isEast) => isEast ? -sales / 2 : sales / 2
  ],
  [
    LabelTextField,
    sales => formatSales(sales)
  ]
];

let data = source;

for (const [name, calculate] of calculations) {
  const isText = name === LabelTextField;

  data = data.calculateVariable(
    {
      name,
      type: isText ? "dimension" : "measure",
      ...(!isText ? { defAggFn: "min" } : {})
    },
    [ProductField, RegionField],
    (product, region) => {
      const sales = getSales(product, region);

      return sales == null
        ? isText ? "" : null
        : calculate(sales, normalizeRegion(region) === "east");
    }
  );
}

// Filter Source-Derived Model to Top 10 Products
data = data.select({
  operator: muze.DataModel.LogicalOperators.OR,
  conditions: products.map(product => ({
    field: ProductField,
    value: product,
    operator: muze.DataModel.ComparisonOperators.EQUAL
  }))
});

// Mirrored Bar
muze
  .canvas()

  .rows([ProductField])

  .columns([
    muze.Operators.share(
      PlotStartField,
      PlotEndField,
      LabelPositionField
    )
  ])

  .detail([ProductField, RegionField, SalesField])

  .color(RegionField)

  .title(" ")

  .layers([
    {
      mark: "bar",
      interactive: true,

      encoding: {
        x: PlotEndField,
        x0: PlotStartField,
        color: { field: RegionField }
      },

      transform: { type: "identity" },

      outline: {
        enable: true,
        fill: true,
        strokeColor: "#FFFFFF",
        width: 1
      }
    },

    {
      mark: "text",
      interactive: false,

      encoding: {
        x: LabelPositionField,
        text: { field: LabelTextField },
        color: { value: () => "#FFFFFF" }
      },

      transform: { type: "identity" }
    }
  ])

  .config({
    autoGroupBy: { disabled: true },

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
        showAxisName: true,
        domain: [-axisMaximum, axisMaximum],
        nice: false,
        numberOfTicks: 9,
        padding: 0,
        tickFormat: salesTick
      },

      y: {
        name: "Product",
        showAxisName: true,
        padding: 0,
        ordering: {
          type: "custom",
          values: [...products].reverse()
        }
      }
    },

    legend: {
      color: {
        show: false,
        range: [
          RegionColors.West,
          RegionColors.East
        ]
      }
    },

    gridLines: {
      x: { show: true },
      y: { show: false }
    },

    interaction: {
      tooltip: {
        includeDataFromAllLayers: false,

        fieldFormatters: Object.fromEntries(
          [
            SalesField,
            PlotStartField,
            PlotEndField,
            LabelPositionField
          ].map(field => [field, formatTooltipSales])
        )
      }
    }
  })

  .data(data)
  .mount("#chart");

// Centered Region Legend
const chart = document.querySelector("#chart");
const parent = chart?.parentElement;

if (parent) {
  parent.style.position = "relative";
  parent.querySelector("#mirrored-bar-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "mirrored-bar-legend";

  legend.style.cssText = `
    position:absolute;
    top:10px;
    left:50%;
    transform:translateX(-50%);
    z-index:100;
    display:flex;
    align-items:center;
    gap:16px;
    padding:6px 12px;
    background:rgba(255,255,255,.95);
    border-radius:4px;
    font:12px Arial,sans-serif;
    color:#555;
    white-space:nowrap;
    pointer-events:none;
  `;

  legend.innerHTML = `
    <strong>Region</strong>
    ${Object.entries(RegionColors).map(([region, color]) => `
      <span style="
        display:inline-flex;
        align-items:center;
        gap:6px;
      ">
        <span style="
          width:11px;
          height:11px;
          border-radius:50%;
          background:${color};
          display:inline-block;
        "></span>
        ${region}
      </span>
    `).join("")}
  `;

  parent.appendChild(legend);
}