/**
 * Available Columns:
 * "region"
 * "Total sales"
 * "Target Sales"
 * "Total quantity purchased"
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
const RegionField = "region";
const StoreField = "store";
const SalesField = "Total sales";
const TargetField = "Target Sales";
const QuantityField = "Total quantity purchased";

const Fields = [SalesField, TargetField, QuantityField];

// Colors
const RegionColors = {
  East: "#957247",
  Midwest: "#B89A73",
  South: "#6F5030",
  Southwest: "#D2B894",
  West: "#A77F58"
};

setGlobalOptions({
  displayAs: {
    columns: {
      [RegionField]: "Region",
      [StoreField]: "Store",
      [SalesField]: "Sales",
      [TargetField]: "Target Sales",
      [QuantityField]: "Quantity"
    }
  }
});

// Formatters
const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1
});

const fullSales = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const fullQuantity = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
});

const numericValue = value => {
  let raw = value;

  while (raw != null && typeof raw === "object") {
    if ("rawValue" in raw) raw = raw.rawValue;
    else if ("value" in raw) {
      raw = typeof raw.value === "function"
        ? raw.value()
        : raw.value;
    }
    else if ("_value" in raw) raw = raw._value;
    else if ("v" in raw) raw = raw.v;
    else break;
  }

  return raw == null || raw === "" ? NaN : Number(raw);
};

const formatValue = formatter => value => {
  const number = numericValue(value);

  return Number.isFinite(number)
    ? formatter.format(number)
    : "";
};

// Get ThoughtSpot Data
const data = await getDataFromSearchQuery();

// Scatterplot Matrix
muze
  .canvas()

  .columns(Fields)
  .rows([...Fields].reverse())

  .detail([StoreField])
  .color(RegionField)

  .title(" ")
  .subtitle(" ")

  .layers([{
    mark: "point",
    encoding: {
      color: { field: RegionField }
    }
  }])

  .config({
    autoGroupBy: { disabled: true },

    legend: {
      color: {
        show: false,
        range: Object.values(RegionColors)
      }
    },

    axes: {
      x: {
        numberOfTicks: 4,
        domain: [0, null],
        tickFormat: formatValue(compactNumber)
      },

      y: {
        numberOfTicks: 4,
        domain: [0, null],
        tickFormat: formatValue(compactNumber)
      }
    },

    gridLines: {
      x: { show: true },
      y: { show: true }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [SalesField]: formatValue(fullSales),
          [TargetField]: formatValue(fullSales),
          [QuantityField]: formatValue(fullQuantity)
        }
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
  parent.querySelector("#scatterplot-matrix-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "scatterplot-matrix-legend";

  legend.style.cssText = `
    position:absolute;
    top:10px;
    left:50%;
    transform:translateX(-50%);
    z-index:10;
    display:flex;
    align-items:center;
    gap:16px;
    padding:6px 10px;
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
          display:inline-block;
          border-radius:50%;
          background:${color};
        "></span>
        ${region}
      </span>
    `).join("")}
  `;

  parent.appendChild(legend);
}