/**
 * Available Columns:
 * "region"
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

const RegionField = "region";
const ItemField = "item type";
const SalesField = "Total sales";

const RegionColors = {
  East: "#0354A6",
  Midwest: "#4F81C7",
  South: "#7AA6DC",
  Southwest: "#A7C4E8",
  West: "#C9DCF2"
};

setGlobalOptions({
  displayAs: {
    columns: {
      [RegionField]: "Region",
      [ItemField]: "Item Type",
      [SalesField]: "Sales"
    }
  }
});

// Formatters
const tooltipCurrency = new NumberFormatter("currency", {
  currency: "USD",
  unit: "none",
  decimalDigits: 0
});

const formatPercent = value => {
  const raw = value?.rawValue ?? value;
  const number = Number(raw);

  return Number.isFinite(number)
    ? `${Math.round(number * 100)}%`
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

// Get Original ThoughtSpot Data
const data = await getDataFromSearchQuery();
const result = data.getData();
const schema = result.schema || data.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const regionIndex = fieldIndex(RegionField);
const itemIndex = fieldIndex(ItemField);
const salesIndex = fieldIndex(SalesField);

if ([regionIndex, itemIndex, salesIndex].includes(-1)) {
  throw new Error(
    "Search requires region, item type, and Total sales."
  );
}

// Calculate Item Type Sales Totals
const itemTotals = new Map();
const regions = new Set();

for (const row of result.data || []) {
  const region = String(
    cellValue(row[regionIndex]) ?? ""
  ).trim();

  const item = String(
    cellValue(row[itemIndex]) ?? ""
  ).trim();

  const rawSales = cellValue(row[salesIndex]);
  const sales = rawSales == null || rawSales === ""
    ? NaN : Number(rawSales);

  if (!region || !item || !Number.isFinite(sales)) continue;

  itemTotals.set(
    item,
    (itemTotals.get(item) || 0) + sales
  );

  regions.add(region);
}

const orderedItems = [...itemTotals.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([item]) => item);

const orderedRegions = [...regions]
  .sort((a, b) => a.localeCompare(b));

if (!orderedItems.length) {
  throw new Error("No valid Item Type Sales data found.");
}

// Match Region Colors to the Categories
const fallbackColors = Object.values(RegionColors);

const colors = orderedRegions.map((region, index) => {
  const known = Object.keys(RegionColors).find(
    name => name.toLowerCase() === region.toLowerCase()
  );

  return known
    ? RegionColors[known]
    : fallbackColors[index % fallbackColors.length];
});

// 100% Stacked Column Chart
muze
  .canvas()

  .columns([ItemField])
  .rows([SalesField])

  .color(RegionField)

  .title(" ")

  .layers([
    {
      mark: "bar",
      transform: { type: "stack100percent" }
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
        name: "Item Type",
        ordering: {
          type: "custom",
          values: orderedItems
        },
        labels: { rotation: -35 }
      },

      y: {
        name: "Share of Item Type Sales",
        domain: [0, 1],
        tickValues: [0, 0.2, 0.4, 0.6, 0.8, 1],
        tickFormat: formatPercent
      }
    },

    gridLines: {
      x: { show: false },
      y: { show: true }
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
          [SalesField]: tooltipCurrency.formatterFunc()
        }
      }
    }
  })

  .data(data)
  .mount("#chart");

// Custom Centered Legend
const chart = document.querySelector("#chart");
const parent = chart?.parentElement;

if (parent) {
  parent.style.position = "relative";
  parent.querySelector("#stack100-region-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "stack100-region-legend";

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
      border-radius:50%;
      background:${colors[index]};
    `;

    const label = document.createElement("span");
    label.textContent = region;

    item.append(swatch, label);
    legend.appendChild(item);
  });

  parent.appendChild(legend);
}