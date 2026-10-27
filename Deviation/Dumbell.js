/**
 * Available Columns:
 * "region"
 * "sales(2024)"
 * "sales(2025)"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

// Imports
const {
  muze,
  getDataFromSearchQuery,
  setGlobalOptions,
  formatters: { NumberFormatter }
} = viz;

// Fields
const RegionField = "region";
const Sales2024Field = "sales(2024)";
const Sales2025Field = "sales(2025)";

// Colors
const LineColor = "#A6A6A6";
const Color2024 = "#A77C08";
const Color2025 = "#E6B00E";

// Display Names
setGlobalOptions({
  displayAs: {
    columns: {
      [RegionField]: "Region",
      [Sales2024Field]: "2024 Sales",
      [Sales2025Field]: "2025 Sales"
    }
  }
});

// Formatters
const currencyFormatter = new NumberFormatter(
  "currency",
  {
    currency: "USD",
    unit: "auto",
    decimalDigits: 0
  }
);

const tooltipcurrencyFormatter = new NumberFormatter(
  "currency",
  {
    currency: "USD",
    unit: "none",
    decimalDigits: 0
  }
);
const data = await getDataFromSearchQuery();

// Chart Container
const chartElement = document.querySelector("#chart");

if (!chartElement) {
  throw new Error("Chart container #chart not found.");
}

const parent = chartElement.parentElement;

if (parent) {
  parent.style.position = "relative";
  parent.querySelector("#dumbbell-custom-legend")?.remove();
}
muze
  .canvas()

  .rows([RegionField])

  .columns([
    muze.Operators.share(
      Sales2024Field,
      Sales2025Field
    )
  ])

  // Provide space for legend
  .title(" ")

  .layers([
    // Connecting line: 2024 to 2025
    {
      mark: "tick",
      encoding: {
        x: Sales2025Field,
        x0: Sales2024Field,

        color: {
          value: () => LineColor
        },

        size: {
          value: () => 0.05
        }
      }
    },

    // 2024 Sales endpoint
    {
      mark: "point",
      encoding: {
        x: Sales2024Field,

        color: {
          value: () => Color2024
        },

        size: {
          value: () => 0.1
        },

        opacity: {
          value: () => 1
        }
      }
    },

    // 2025 Sales endpoint
    {
      mark: "point",
      encoding: {
        x: Sales2025Field,

        color: {
          value: () => Color2025
        },

        size: {
          value: () => 0.1
        },

        opacity: {
          value: () => 1
        }
      }
    }
  ])

  .config({
    axes: {
      x: {
        name: "Sales",
        domain: [0, null],
        tickFormat: currencyFormatter.formatterFunc()
      },

      y: {
        name: "Region",
      }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [Sales2024Field]:
            tooltipcurrencyFormatter.formatterFunc(),

          [Sales2025Field]:
            tooltipcurrencyFormatter.formatterFunc()
        }
      }
    }
  })

  .data(data).mount("#chart");

// Custom Centered Legend
if (parent) {
  const legend = document.createElement("div");

  legend.id = "dumbbell-custom-legend";
  legend.className = "dumbbell-custom-legend";

  legend.style.cssText = `
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 4px;
    font-family: Arial, sans-serif;
    font-size: 12px;
    color: #555555;
    white-space: nowrap;
    pointer-events: none;
  `;

  legend.innerHTML = `
    <span style="
      display: inline-flex;
      align-items: center;
      gap: 7px;
    ">
      <span style="
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: ${Color2024};
      "></span>
      2024 Sales
    </span>

    <span style="
      display: inline-flex;
      align-items: center;
      gap: 7px;
    ">
      <span style="
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: ${Color2025};
      "></span>
      2025 Sales
    </span>
  `;

  parent.appendChild(legend);
}