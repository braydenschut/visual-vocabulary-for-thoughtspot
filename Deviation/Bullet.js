/**
 * Available Columns:
 * "region"
 * "store"
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
const StoreField = "store";
const RegionField = "region";
const SalesField = "Total sales";
const TargetField = "Target Sales";

// Colors
const RegionColors = {
  East: "#E6B00E",
  Midwest: "#F2C94C",
  South: "#C99600",
  Southwest: "#A67C00",
  West: "#F7D978"
};

const Colors = Object.values(RegionColors);
const TargetColor = "#bdbdbd";

// Display Names
setGlobalOptions({
  displayAs: {
    columns: {
      [RegionField]: "Region",
      [StoreField]: "Store",
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
  parent.querySelector("#bullet-chart-custom-legend")?.remove();
}
muze
  .canvas()

  .rows([StoreField])

  .columns([
    muze.Operators.share(
      TargetField,
      SalesField
    )
  ])

  .color({
    field: RegionField
  })

  // Provide space for the legend
  .title(" ")

  .layers([
    // Background: Target Sales
    {
      mark: "bar",
      encoding: {
        x: TargetField,

        color: {
          value: () => TargetColor
        },

        size: {
          value: () => 0.3
        }
      }
    },

    // Foreground: Actual Sales
    {
      mark: "bar",
      encoding: {
        x: SalesField,

        color: {
          field: RegionField
        },

        size: {
          value: () => 0.2
        }
      }
    }
  ])

  .config({
    axes: {
      x: {
        name: "Sales vs Target Sales",
        tickFormat: currencyFormatter.formatterFunc()
      },

      y: {
        name: "Store"
      }
    },

    // Hide native legend
    legend: {
      color: {
        show: false,
        range: Colors
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

// Custom Centered Region Legend
if (parent) {
  const legend = document.createElement("div");

  legend.id = "bullet-chart-custom-legend";

  legend.style.cssText = `
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 4px;
    font-family: Arial, sans-serif;
    font-size: 12px;
    color: #555555;
    white-space: nowrap;
    pointer-events: none;
  `;

  const title = document.createElement("span");

  title.textContent = "Region";
  title.style.fontWeight = "600";
  title.style.marginRight = "4px";

  legend.appendChild(title);

  Object.entries(RegionColors).forEach(
    ([region, color]) => {
      const item = document.createElement("span");

      item.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
      `;

      const swatch = document.createElement("span");

      swatch.style.cssText = `
        display: inline-block;
        width: 11px;
        height: 11px;
        border-radius: 50%;
        background: ${color};
        flex-shrink: 0;
      `;

      const label = document.createElement("span");
      label.textContent = region;

      item.appendChild(swatch);
      item.appendChild(label);

      legend.appendChild(item);
    }
  );

  parent.appendChild(legend);
}