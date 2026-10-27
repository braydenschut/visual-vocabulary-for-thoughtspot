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
  setGlobalOptions
} = viz;

// Fields and Colors
const RegionField = "region";
const ItemField = "item type";
const SalesField = "Total sales";

const HeatmapColors = [
  "#F5EFE5",
  "#C3A477",
  "#957247"
];

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

const formatTooltipSales = value => {
  const number = numericValue(value);
  return Number.isFinite(number)
    ? fullUSD.format(number)
    : "";
};

// Get ThoughtSpot Data
const data = await getDataFromSearchQuery();
const result = data.getData();
const schema = result.schema || data.getSchema();

const salesIndex = schema.findIndex(field =>
  field.name === SalesField ||
  field.displayName === SalesField
);

if (salesIndex < 0) {
  throw new Error("Search requires Total sales.");
}

const salesValues = (result.data || [])
  .map(row => numericValue(row[salesIndex]))
  .filter(Number.isFinite);

if (!salesValues.length) {
  throw new Error("No numeric Sales values found.");
}

const minSales = Math.min(...salesValues);
const maxSales = Math.max(...salesValues);

// Chart Container
const chart = document.querySelector("#chart");
const parent = chart?.parentElement;

if (parent) {
  parent.style.position = "relative";
  parent.querySelector("#heatmap-custom-legend")?.remove();
}

chart.style.boxSizing = "border-box";
chart.style.paddingBottom = "40px";

// Heatmap
muze
  .canvas()

  .columns([ItemField])
  .rows([RegionField])

  .color({
    field: SalesField,
    as: "continuous",
    range: HeatmapColors
  })

  .title(" ")

  .layers([{
    mark: "bar",
    encoding: {
      color: { field: SalesField }
    }
  }])

  .config({
    legend: {
      color: {
        show: false,
        range: HeatmapColors
      }
    },

    axes: {
      x: {
        name: "Item Type",
        padding: 0.02,
        labels: { rotation: -45 }
      },

      y: {
        name: "Region",
        padding: 0.02
      }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [SalesField]: formatTooltipSales
        }
      }
    }
  })

  .data(data)
  .mount("#chart");

// Centered Gradient Legend
if (parent) {
  const legend = document.createElement("div");
  legend.id = "heatmap-custom-legend";

  legend.style.cssText = `
    position:absolute;
    bottom:5px;
    left:50%;
    transform:translateX(-50%);
    z-index:10;
    display:flex;
    align-items:center;
    gap:12px;
    padding:6px 12px;
    background:rgba(255,255,255,.95);
    border-radius:4px;
    font:12px Arial,sans-serif;
    color:#555;
    white-space:nowrap;
    pointer-events:none;
  `;

  legend.innerHTML = `
    <strong>Sales</strong>
    <span>${compactUSD.format(minSales)}</span>
    <span style="
      display:inline-block;
      width:220px;
      height:12px;
      border-radius:2px;
      background:linear-gradient(
        to right,
        ${HeatmapColors[0]} 0%,
        ${HeatmapColors[1]} 50%,
        ${HeatmapColors[2]} 100%
      );
    "></span>
    <span>${compactUSD.format(maxSales)}</span>
  `;

  parent.appendChild(legend);
}