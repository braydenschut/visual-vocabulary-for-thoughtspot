/**
 * Available Columns:
 * "region"
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

const RegionField = "region";
const YearField = "Year(date)";
const YearLabelField = "Year Label";
const SalesField = "Total sales";

const YearColors = {
  "2023": "#D9B2CF",
  "2024": "#BC7EAC",
  "2025": "#A2468C"
};

// Extract original ThoughtSpot values
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

// Normalize the Year without local timezone conversion
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

  const iso = text.match(/^(\d{4})-\d{2}-\d{2}/);
  if (iso) return iso[1];

  const number = Number(raw);

  if (Number.isFinite(number) && Math.abs(number) >= 1e9) {
    const date = new Date(
      Math.abs(number) < 1e11 ? number * 1000 : number
    );

    return Number.isNaN(date.getTime())
      ? null
      : String(date.getUTCFullYear());
  }

  const date = new Date(text);

  return Number.isNaN(date.getTime())
    ? null
    : String(date.getUTCFullYear());
};

setGlobalOptions({
  displayAs: {
    columns: {
      [RegionField]: "Region",
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

// Keep the original ThoughtSpot DataModel
const source = await getDataFromSearchQuery();

const data = source.calculateVariable(
  {
    name: YearLabelField,
    type: "dimension"
  },
  [YearField],
  year => getYear(year)
);

// Native Muze Grouped Bar Chart
muze
  .canvas()

  .rows([RegionField])
  .columns([SalesField])

  .color(YearLabelField)

  // Reserve room for the custom legend
  .title(" ")
  .subtitle(" ")

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
        name: "Sales",
        domain: [0, null],
        numberOfTicks: 5,
        tickFormat: axisCurrency.formatterFunc()
      },

      y: {
        name: "Region"
      }
    },

    gridLines: {
      x: { show: true },
      y: { show: false }
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
          RegionField,
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
  parent.querySelector("#grouped-bar-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "grouped-bar-legend";

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
      background:${color};
    `;

    const label = document.createElement("span");
    label.textContent = year;

    item.append(swatch, label);
    legend.appendChild(item);
  });

  parent.appendChild(legend);
}