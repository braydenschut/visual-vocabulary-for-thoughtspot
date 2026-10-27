/**
 * Available Columns:
 * "item type"
 * "Year(date)"
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
const YearField = "Year(date)";
const YearLabelField = "Year Label";
const SalesField = "Total sales";

const YearColors = {
  "2023": "#D9B2CF",
  "2024": "#BC7EAC",
  "2025": "#A2468C"
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

// Normalize ThoughtSpot dates using UTC.
const getYear = value => {
  const raw = cellValue(value);

  if (raw == null || raw === "") return null;

  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime())
      ? null
      : String(raw.getUTCFullYear());
  }

  const text = String(raw).trim();

  if (/^\d{4}$/.test(text)) return text;

  const number = Number(raw);

  // Unix seconds or milliseconds
  if (Number.isFinite(number) && Math.abs(number) >= 1e9) {
    const date = new Date(
      Math.abs(number) < 1e11 ? number * 1000 : number
    );

    return Number.isNaN(date.getTime())
      ? null
      : String(date.getUTCFullYear());
  }

  // ISO date strings
  const iso = text.match(/^(\d{4})-\d{2}-\d{2}/);

  if (iso) return iso[1];

  const date = new Date(text);

  return Number.isNaN(date.getTime())
    ? null
    : String(date.getUTCFullYear());
};

setGlobalOptions({
  displayAs: {
    columns: {
      [ItemField]: "Item Type",
      [YearLabelField]: "Year",
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

// Original ThoughtSpot DataModel
const source = await getDataFromSearchQuery();

// Add normalized year dimension
const data = source.calculateVariable(
  {
    name: YearLabelField,
    type: "dimension"
  },
  [YearField],
  year => getYear(year)
);

// Native Muze Grouped Column
muze
  .canvas()

  .columns([ItemField])
  .rows([SalesField])

  .color(YearLabelField)

  .title(" ")

  .layers([
    {
      mark: "bar",
      transform: { type: "group" }
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
        name: "Item Type"
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
          [YearLabelField]: {
            domainRangeMap: YearColors
          }
        }
      }
    },

    interaction: {
      tooltip: {
        fields: [
          ItemField,
          YearLabelField,
          SalesField
        ],
        fieldFormatters: {
          [SalesField]: tooltipCurrency.formatterFunc()
        }
      }
    }
  })

  .data(data)
  .mount("#chart");

// Custom Centered Year Legend
const parent = document.querySelector("#chart")?.parentElement;

if (parent) {
  parent.style.position = "relative";
  parent.querySelector("#grouped-column-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "grouped-column-legend";

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
    padding:6px 10px;
    background:rgba(255,255,255,.95);
    border-radius:4px;
    font:12px Arial,sans-serif;
    color:#555;
    pointer-events:none;
  `;

  const title = document.createElement("strong");
  title.textContent = "Year";
  legend.appendChild(title);

  Object.entries(YearColors).forEach(([year, color]) => {
    const item = document.createElement("span");
    item.style.cssText =
      "display:inline-flex;align-items:center;gap:6px;";

    const swatch = document.createElement("span");
    swatch.style.cssText = `
      width:11px;
      height:11px;
      border-radius:2px;
      background:${color};
    `;

    const label = document.createElement("span");
    label.textContent = year;

    item.append(swatch, label);
    legend.appendChild(item);
  });

  parent.appendChild(legend);
}