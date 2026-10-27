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

const ItemField = "item type";
const RegionField = "region";
const SalesField = "Total sales";

const RegionColors = {
  East: "#0354A6",
  Midwest: "#2778C2",
  South: "#559AD4",
  Southwest: "#85B7E3",
  West: "#B5D6F0"
};

const FallbackColors = Object.values(RegionColors);

setGlobalOptions({
  displayAs: {
    columns: {
      [ItemField]: "Item Type",
      [RegionField]: "Region",
      [SalesField]: "Sales"
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

// Get Original ThoughtSpot Data
const data = await getDataFromSearchQuery();
const result = data.getData();
const schema = result.schema || data.getSchema();

const regionIndex = schema.findIndex(
  field =>
    field.name === RegionField ||
    field.displayName === RegionField
);

if (regionIndex < 0) {
  throw new Error("Search requires the region field.");
}

// Identify Regions
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

const regions = [
  ...new Set(
    (result.data || [])
      .map(row =>
        String(cellValue(row[regionIndex]) ?? "").trim()
      )
      .filter(Boolean)
  )
].sort((a, b) => a.localeCompare(b));

const colors = regions.map((region, index) => {
  const known = Object.keys(RegionColors).find(
    name => name.toLowerCase() === region.toLowerCase()
  );

  return known
    ? RegionColors[known]
    : FallbackColors[index % FallbackColors.length];
});

// Stacked Column Chart
muze
  .canvas()

  .columns([ItemField])
  .rows([SalesField])

  .color(RegionField)

  .title(" ")

  .layers([
    {
      mark: "bar",
      transform: { type: "stack" }
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
        labels: { rotation: -35 },
        padding: 0.15
      },

      y: {
        name: "Sales",
        domain: [0, null],
        numberOfTicks: 5,
        tickFormat: axisCurrency.formatterFunc()
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
  parent.querySelector("#stacked-column-custom-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "stacked-column-custom-legend";

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

  regions.forEach((region, index) => {
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
    `;

    const label = document.createElement("span");
    label.textContent = region;

    item.append(swatch, label);
    legend.appendChild(item);
  });

  parent.appendChild(legend);
}