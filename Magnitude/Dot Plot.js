/**
 * Available Columns:
 * "region"
 * "Total sales"
 * "Target Sales"
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
const SalesField = "Total sales";
const TargetField = "Target Sales";

const SalesColor = "#A2468C";
const TargetColor = "#D9B2CF";
const LineColor = "#B8B8B8";

setGlobalOptions({
  displayAs: {
    columns: {
      [RegionField]: "Region",
      [SalesField]: "Sales",
      [TargetField]: "Target Sales"
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

const data = await getDataFromSearchQuery();

// Cleveland Dot Plot
muze
  .canvas()

  .rows([RegionField])

  .columns([
    muze.Operators.share(SalesField, TargetField)
  ])

  .title(" ")

  .layers([
    // Connecting line
    {
      mark: "tick",
      encoding: {
        x: SalesField,
        x0: TargetField,
        color: { value: () => LineColor },
        size: { value: () => 0.001 }
      }
    },

    // Sales
    {
      mark: "point",
      encoding: {
        x: SalesField,
        color: { value: () => SalesColor },
        size: { value: () => 0.035 },
        opacity: { value: () => 1 }
      }
    },

    // Target Sales
    {
      mark: "point",
      encoding: {
        x: TargetField,
        color: { value: () => TargetColor },
        size: { value: () => 0.035 },
        opacity: { value: () => 1 }
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
      color: { show: false }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [SalesField]: tooltipCurrency.formatterFunc(),
          [TargetField]: tooltipCurrency.formatterFunc()
        }
      }
    }
  })

  .data(data)
  .mount("#chart");

// Custom Centered Legend
const parent = document.querySelector("#chart")?.parentElement;

if (parent) {
  parent.style.position = "relative";
  parent.querySelector("#cleveland-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "cleveland-legend";

  legend.style.cssText = `
    position:absolute;
    top:10px;
    left:50%;
    transform:translateX(-50%);
    z-index:10;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:24px;
    padding:6px 10px;
    background:rgba(255,255,255,.95);
    border-radius:4px;
    font:12px Arial,sans-serif;
    color:#555;
    white-space:nowrap;
    pointer-events:none;
  `;

  for (const [label, color] of [
    ["Sales", SalesColor],
    ["Target Sales", TargetColor]
  ]) {
    const item = document.createElement("span");

    item.style.cssText = `
      display:inline-flex;
      align-items:center;
      gap:7px;
    `;

    const swatch = document.createElement("span");

    swatch.style.cssText = `
      width:11px;
      height:11px;
      border-radius:50%;
      background:${color};
    `;

    const text = document.createElement("span");
    text.textContent = label;

    item.append(swatch, text);
    legend.appendChild(item);
  }

  parent.appendChild(legend);
}