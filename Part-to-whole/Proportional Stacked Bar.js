/**
 * Available Columns:
 * "item type"
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

// Fields
const ItemField = "item type";
const RegionField = "region";
const SalesField = "Total sales";

const X0 = "X Start";
const X1 = "X End";
const Y0 = "Y Start";
const Y1 = "Y End";

const ItemShareField = "Item Type Share (%)";
const RegionShareField = "Region Share (%)";
const VisibleField = "Marimekko Visible Row";

// Region Colors
const RegionColors = {
  East: "#0354A6",
  Midwest: "#2778C2",
  South: "#559AD4",
  Southwest: "#85B7E3",
  West: "#B5D6F0"
};

const Palette = Object.values(RegionColors);

setGlobalOptions({
  displayAs: {
    columns: {
      [ItemField]: "Item Type",
      [RegionField]: "Region",
      [SalesField]: "Sales",
      [ItemShareField]: "Item Type Share (%)",
      [RegionShareField]: "Region Share (%)"
    }
  }
});

// Formatters
const currency = new NumberFormatter("currency", {
  currency: "USD",
  unit: "none",
  decimalDigits: 0
});

const formatPercent = value => {
  const number = Number(cellValue(value));

  return Number.isFinite(number)
    ? `${number.toFixed(1)}%`
    : "";
};

const percentTick = value => {
  const number = Number(cellValue(value));

  return Number.isFinite(number)
    ? `${Math.round(number)}%`
    : "";
};

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

// Original ThoughtSpot DataModel
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const itemIndex = fieldIndex(ItemField);
const regionIndex = fieldIndex(RegionField);
const salesIndex = fieldIndex(SalesField);

if ([itemIndex, regionIndex, salesIndex].includes(-1)) {
  throw new Error(
    "Search requires item type, region, and Total sales."
  );
}

// Aggregate Sales
const salesByItem = new Map();
const itemTotals = new Map();
const regions = new Set();
const rowKeys = new Set();

const keyFor = (item, region) =>
  JSON.stringify([item, region]);

for (const row of result.data || []) {
  const item = String(
    cellValue(row[itemIndex]) ?? "Unknown"
  ).trim();

  const region = String(
    cellValue(row[regionIndex]) ?? "Unknown"
  ).trim();

  const rawSales = cellValue(row[salesIndex]);

  const sales = rawSales == null || rawSales === ""
    ? NaN
    : Number(rawSales);

  if (!item || !region || !Number.isFinite(sales)) continue;

  if (sales < 0) {
    throw new Error(
      "Marimekko requires nonnegative Sales values."
    );
  }

  if (sales === 0) continue;

  const key = keyFor(item, region);

  if (rowKeys.has(key)) {
    throw new Error(
      "Search must return one row per Item Type and Region."
    );
  }

  rowKeys.add(key);

  if (!salesByItem.has(item)) {
    salesByItem.set(item, new Map());
  }

  salesByItem.get(item).set(region, sales);

  itemTotals.set(
    item,
    (itemTotals.get(item) || 0) + sales
  );

  regions.add(region);
}

const totalSales = [...itemTotals.values()]
  .reduce((sum, value) => sum + value, 0);

if (totalSales <= 0) {
  throw new Error("No positive Sales values found.");
}

// Category Order and Colors
const itemTypes = [...itemTotals.keys()]
  .sort((a, b) =>
    itemTotals.get(b) - itemTotals.get(a) ||
    a.localeCompare(b)
  );

const orderedRegions = [...regions]
  .sort((a, b) => a.localeCompare(b));

const colors = orderedRegions.map((region, index) => {
  const known = Object.keys(RegionColors).find(
    name => name.toLowerCase() === region.toLowerCase()
  );

  return known
    ? RegionColors[known]
    : Palette[index % Palette.length];
});

// Calculate Marimekko Rectangle Coordinates
const rectangles = new Map();

let x = 0;

for (const item of itemTypes) {
  const itemSales = itemTotals.get(item);
  const itemShare = itemSales / totalSales * 100;

  const xStart = x;
  const xEnd = xStart + itemShare;

  let y = 0;

  for (const region of orderedRegions) {
    const sales = salesByItem.get(item).get(region) || 0;

    if (sales <= 0) continue;

    const regionShare = sales / itemSales * 100;

    rectangles.set(keyFor(item, region), {
      x0: xStart,
      x1: xEnd,
      y0: y,
      y1: y + regionShare,
      itemShare,
      regionShare
    });

    y += regionShare;
  }

  x = xEnd;
}

// Add Coordinates to Original DataModel
let data = source;

const lookup = (item, region) =>
  rectangles.get(
    keyFor(
      String(cellValue(item) ?? "").trim(),
      String(cellValue(region) ?? "").trim()
    )
  );

for (const [field, property] of [
  [X0, "x0"],
  [X1, "x1"],
  [Y0, "y0"],
  [Y1, "y1"],
  [ItemShareField, "itemShare"],
  [RegionShareField, "regionShare"]
]) {
  data = data.calculateVariable(
    {
      name: field,
      type: "measure",
      defAggFn: "min"
    },
    [ItemField, RegionField],
    (item, region) => lookup(item, region)?.[property] ?? null
  );
}

// Exclude Zero-Sales and Nonplotted Rows
data = data.calculateVariable(
  {
    name: VisibleField,
    type: "dimension"
  },
  [ItemField, RegionField],
  (item, region) =>
    lookup(item, region) ? "Show" : "Hide"
);

data = data.select({
  field: VisibleField,
  value: "Show",
  operator: muze.DataModel.ComparisonOperators.EQUAL
});

// Native Muze Marimekko Chart
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
    RegionField,
    SalesField,
    ItemShareField,
    RegionShareField
  ])

  .color(RegionField)

  .title(" ")

  .layers([
    {
      mark: "bar",

      encoding: {
        x: X1,
        x0: X0,
        y: Y1,
        y0: Y0,
        color: { field: RegionField }
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
        name: "Item Type Share of Total Sales",
        showAxisName: true,
        domain: [0, 100],
        padding: 0,
        tickFormat: percentTick
      },

      y: {
        name: "Region Share Within Item Type",
        showAxisName: true,
        domain: [0, 100],
        padding: 0,
        tickFormat: percentTick
      }
    },

    gridLines: {
      x: { show: false },
      y: { show: false }
    },

    legend: {
  color: {
    show: false,
    fields: {
      [RegionField]: {
        domainRangeMap: RegionColors
      }
    }
  }
},

    interaction: {
      tooltip: {
        fieldFormatters: {
          [SalesField]: currency.formatterFunc(),
          [ItemShareField]: formatPercent,
          [RegionShareField]: formatPercent
        }
      }
    }
  })

  .data(data)
  .mount("#chart");

// Custom Centered Region Legend
const chart = document.querySelector("#chart");
const parent = chart?.parentElement;

if (parent) {
  parent.style.position = "relative";

  parent.querySelector("#marimekko-region-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "marimekko-region-legend";

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
    gap:10px 16px;
    max-width:calc(100% - 20px);
    padding:6px 10px;
    background:rgba(255,255,255,.95);
    border-radius:4px;
    font:12px Arial,sans-serif;
    color:#555;
    pointer-events:none;
  `;

  const title = document.createElement("strong");
  title.textContent = "Region";
  legend.appendChild(title);

  orderedRegions.forEach((region, index) => {
    const item = document.createElement("span");

    item.style.cssText = `
      display:inline-flex;
      align-items:center;
      gap:6px;
      white-space:nowrap;
    `;

    const swatch = document.createElement("span");

    swatch.style.cssText = `
      width:11px;
      height:11px;
      border-radius:2px;
      background:${colors[index]};
      flex-shrink:0;
    `;

    const label = document.createElement("span");
    label.textContent = region;

    item.append(swatch, label);
    legend.appendChild(item);
  });

  parent.appendChild(legend);
}