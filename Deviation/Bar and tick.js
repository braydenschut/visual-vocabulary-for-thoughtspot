/**
 * Available Columns:
 * "region"
 * "Total sales"
 * "Target Sales"
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
const SalesField = "Total sales";
const TargetField = "Target Sales";

// Colors
const SalesColor = "#FCC838";
const TargetColor = "#E45756";

// Display Names
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
  parent.querySelector("#bar-tick-custom-legend")?.remove();
}
muze
  .canvas()

  .rows([RegionField])

  .columns([
    muze.Operators.share(
      SalesField,
      TargetField
    )
  ])

  // Provide spacing for the custom legend
  .title(" ")

  .layers([
    // Actual Sales bars
    {
      mark: "bar",
      encoding: {
        x: SalesField,

        color: {
          value: () => SalesColor
        },

        size: {
          value: () => 0.4
        }
      }
    },

    // Target Sales markers
    {
      mark: "tick",
      encoding: {
        x: TargetField,

        color: {
          value: () => TargetColor
        },

        size: {
          value: () => 0.15
        }
      }
    }
  ])

  .config({
    axes: {
      x: {
        name: "Sales",
        tickFormat: currencyFormatter.formatterFunc()
      },

      y: {
        name: "Region"
      }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [SalesField]:
            tooltipcurrencyFormatter.formatterFunc(),

          [TargetField]:
            tooltipcurrencyFormatter.formatterFunc()
        }
      }
    }
  })

  .data(data).mount("#chart");

// Custom Centered Legend
if (parent) {
  const legend = document.createElement("div");

  legend.id = "bar-tick-custom-legend";

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
    padding: 6px 10px;
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
        width: 16px;
        height: 10px;
        background: ${SalesColor};
      "></span>
      Sales
    </span>

    <span style="
      display: inline-flex;
      align-items: center;
      gap: 7px;
    ">
      <span style="
        display: inline-block;
        width: 3px;
        height: 16px;
        background: ${TargetColor};
      "></span>
      Target Sales
    </span>
  `;

  parent.appendChild(legend);
}