/**
 * Available Columns:
 * "item type"
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

// Fields
const ItemField = "item type";
const SalesField = "Total sales";
const QuantityField = "Total quantity purchased";

const X0 = "Treemap X Start";
const X1 = "Treemap X End";
const Y0 = "Treemap Y Start";
const Y1 = "Treemap Y End";
const ShareField = "Sales Share (%)";

const LayoutSize = 100;

// Colors
const Palette = [
  "#0354A6",
  "#2778C2",
  "#559AD4",
  "#85B7E3",
  "#B5D6F0",
  "#02366C",
  "#418BC9",
  "#70AAD9",
  "#9AC5E8",
  "#D5E8F7"
];

setGlobalOptions({
  displayAs: {
    columns: {
      [ItemField]: "Item Type",
      [SalesField]: "Sales",
      [QuantityField]: "Quantity Purchased",
      [ShareField]: "Sales Share (%)"
    }
  }
});

// Formatters
const currency = new NumberFormatter("currency", {
  currency: "USD",
  unit: "none",
  decimalDigits: 0
});

const quantity = new NumberFormatter("decimal", {
  unit: "none",
  decimalDigits: 0
});

const cellValue = value => {
  if (
    value == null ||
    typeof value !== "object" ||
    value instanceof Date
  ) {
    return value;
  }

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

  if (raw == null || raw === "") return NaN;

  const number = Number(raw);
  return Number.isFinite(number) ? number : NaN;
};

const formatPercent = value => {
  const number = numericValue(value);

  return Number.isFinite(number)
    ? `${number.toFixed(1)}%`
    : "";
};

// Original ThoughtSpot DataModel
const source = await getDataFromSearchQuery();
const result = source.getData();

const schema = result.schema || source.getSchema();
const records = result.data || [];

const fieldIndex = name => schema.findIndex(
  field => field.name === name ||
    field.displayName === name
);

const itemIndex = fieldIndex(ItemField);
const salesIndex = fieldIndex(SalesField);
const quantityIndex = fieldIndex(QuantityField);

if ([itemIndex, salesIndex, quantityIndex].includes(-1)) {
  throw new Error(
    "Search requires item type, Total sales, and Total quantity purchased."
  );
}

// Read Item Type Sales
const itemValues = new Map();

for (const row of records) {
  const name = String(
    cellValue(row[itemIndex]) ?? ""
  ).trim();

  const sales = numericValue(row[salesIndex]);
  const qty = numericValue(row[quantityIndex]);

  if (
    !name ||
    !Number.isFinite(sales) ||
    !Number.isFinite(qty)
  ) {
    continue;
  }

  if (itemValues.has(name)) {
    throw new Error(
      "Treemap requires one Search row per Item Type. Remove additional grouping fields."
    );
  }

  if (sales < 0) {
    throw new Error(
      "Treemap requires nonnegative Sales."
    );
  }

  itemValues.set(name, {
    sales,
    quantity: qty
  });
}

const totalSales = [...itemValues.values()]
  .reduce((sum, item) => sum + item.sales, 0);

if (totalSales <= 0) {
  throw new Error("No positive Sales data found.");
}

// Prepare Items
const items = [...itemValues.entries()]
  .filter(([, value]) => value.sales > 0)
  .map(([name, value]) => ({
    name,
    ...value,
    share: value.sales / totalSales * 100,
    area: value.sales / totalSales * LayoutSize ** 2
  }))
  .sort((a, b) =>
    b.sales - a.sales ||
    a.name.localeCompare(b.name)
  );

// Assign Fixed Item Type Colors
const orderedNames = items
  .map(item => item.name)
  .sort((a, b) => a.localeCompare(b));

// Explicit category-to-color lookup
const ItemColors = Object.fromEntries(
  orderedNames.map((name, index) => [
    name,
    Palette[index % Palette.length]
  ])
);

// Squarified Treemap Layout
const worstAspect = (row, side) => {
  if (!row.length || side <= 0) {
    return Infinity;
  }

  const areas = row.map(item => item.area);
  const sum = areas.reduce((a, b) => a + b, 0);

  return Math.max(
    side ** 2 * Math.max(...areas) / sum ** 2,
    sum ** 2 / (side ** 2 * Math.min(...areas))
  );
};

let remaining = {
  x: 0,
  y: 0,
  width: LayoutSize,
  height: LayoutSize
};

const rectangles = [];

const placeRow = row => {
  if (!row.length) return;

  const area = row.reduce(
    (sum, item) => sum + item.area,
    0
  );

  const { x, y, width, height } = remaining;

  if (width >= height) {
    const stripWidth = area / height;
    let nextY = y;

    for (const item of row) {
      const tileHeight = item.area / stripWidth;

      rectangles.push({
        ...item,
        x0: x,
        x1: x + stripWidth,
        y0: nextY,
        y1: nextY + tileHeight
      });

      nextY += tileHeight;
    }

    remaining = {
      x: x + stripWidth,
      y,
      width: Math.max(0, width - stripWidth),
      height
    };
  } else {
    const stripHeight = area / width;
    let nextX = x;

    for (const item of row) {
      const tileWidth = item.area / stripHeight;

      rectangles.push({
        ...item,
        x0: nextX,
        x1: nextX + tileWidth,
        y0: y,
        y1: y + stripHeight
      });

      nextX += tileWidth;
    }

    remaining = {
      x,
      y: y + stripHeight,
      width,
      height: Math.max(0, height - stripHeight)
    };
  }
};

let row = [];

for (const item of items) {
  const side = Math.min(
    remaining.width,
    remaining.height
  );

  if (
    !row.length ||
    worstAspect([...row, item], side) <=
    worstAspect(row, side)
  ) {
    row.push(item);
  } else {
    placeRow(row);
    row = [item];
  }
}

placeRow(row);

// Index Treemap Coordinates
const rectangleByItem = new Map(
  rectangles.map(rect => [
    rect.name,
    rect
  ])
);

// Add Coordinates to Original DataModel
let data = source;

for (const [field, property] of [
  [X0, "x0"],
  [X1, "x1"],
  [Y0, "y0"],
  [Y1, "y1"],
  [ShareField, "share"]
]) {
  data = data.calculateVariable(
    {
      name: field,
      type: "measure",
      defAggFn: "min"
    },
    [ItemField],
    item => {
      const name = String(
        cellValue(item) ?? ""
      ).trim();

      return rectangleByItem.get(name)?.[property]
        ?? null;
    }
  );
}

const chart = document.querySelector("#chart");
const parent = chart?.parentElement;

if (chart) {
  chart.style.boxSizing = "border-box";
  chart.style.paddingTop = "45px";
}

// Create Native Muze Treemap
muze
  .canvas()

  .columns([
    muze.Operators.share(X0, X1)
  ])

  .rows([
    muze.Operators.share(Y0, Y1)
  ])

  .detail([
    ItemField,
    SalesField,
    QuantityField,
    ShareField
  ])

  // Use the original categorical field.
  .color(ItemField)

  .title(" ")

  .layers([
    {
      mark: "bar",

      encoding: {
        x: X1,
        x0: X0,
        y: Y1,
        y0: Y0,
        color: {
          field: ItemField
        }
      },

      transform: {
        type: "identity"
      }
    }
  ])

  .config({
    autoGroupBy: {
      disabled: true
    },

    columns: {
      headers: {
        show: false
      }
    },

    rows: {
      headers: {
        show: false,
        facets: { show: false }
      }
    },

    axes: {
      x: {
        domain: [0, LayoutSize],
        padding: 0,
        show: false,
        showAxisName: false
      },

      y: {
        domain: [0, LayoutSize],
        padding: 0,
        show: false,
        showAxisName: false
      }
    },

    gridLines: {
      x: { show: false },
      y: { show: false }
    },

    // Explicit Item Type colors
    legend: {
      color: {
        show: false,

        fields: {
          [ItemField]: {
            domainRangeMap: ItemColors
          }
        }
      }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [SalesField]:
            currency.formatterFunc(),

          [QuantityField]:
            quantity.formatterFunc(),

          [ShareField]:
            formatPercent
        }
      }
    }
  })

  .data(data)
  .mount("#chart");


if (parent) {
  parent.style.position = "relative";

  parent.querySelector("#treemap-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "treemap-legend";

  legend.style.cssText = `
    position:absolute;
    top:10px;
    left:50%;
    transform:translateX(-50%);
    z-index:10;

    display:flex;
    flex-wrap:wrap;
    align-items:center;
    justify-content:center;
    gap:8px 14px;

    max-width:calc(100% - 20px);
    padding:6px 10px;

    background:rgba(255,255,255,0.95);
    border-radius:4px;

    font:12px Arial,sans-serif;
    color:#555;
    pointer-events:none;
  `;

  const title = document.createElement("strong");
  title.textContent = "Item Type";

  legend.appendChild(title);

  orderedNames.forEach(name => {
    const item = document.createElement("span");

    item.style.cssText = `
      display:inline-flex;
      align-items:center;
      gap:5px;
      white-space:nowrap;
    `;

    const swatch = document.createElement("span");

    swatch.style.cssText = `
      width:11px;
      height:11px;
      border-radius:2px;
      background:${ItemColors[name]};
      flex-shrink:0;
    `;

    const label = document.createElement("span");
    label.textContent = name;

    item.append(swatch, label);
    legend.appendChild(item);
  });

  parent.appendChild(legend);
}