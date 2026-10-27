/**
 * Available Columns:
 * "Year(date)"
 * "Total sales"
 * "Target Sales"
 * "Lower Range"
 * "Upper Range"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

// Imports
const {
  muze,
  getDataFromSearchQuery,
  setGlobalOptions,
  formatters: {
    NumberFormatter,
    DateFormatter
  }
} = viz;

// Fields
const YearField = "Year(date)";
const SalesField = "Total sales";
const LowerField = "Lower Range";
const UpperField = "Upper Range";

// Colors
const LineColor = "#FCC838";
const RangeColor = "#FDE9AF";

// Display Names
setGlobalOptions({
  displayAs: {
    columns: {
      [YearField]: "Year",
      [SalesField]: "Sales",
      [LowerField]: "Lower Range",
      [UpperField]: "Upper Range"
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

const yearFormatter = new DateFormatter({
  format: "yyyy"
});
const data = await getDataFromSearchQuery();

// Chart Container
const chartElement = document.querySelector("#chart");

if (!chartElement) {
  throw new Error("Chart container #chart not found.");
}

const parent = chartElement.parentElement;

if (parent) {
  parent.style.position = "relative";
  parent.querySelector("#ranged-area-legend")?.remove();
}
muze
  .canvas()

  .columns([YearField])

  .rows([
    [],
    [
      muze.Operators.share(
        LowerField,
        SalesField,
        UpperField
      )
    ]
  ])

  // Provide space for legend
  .title(" ")

  .layers([
    // Shaded target range
    {
  mark: "area",
  className: "target-range",
  interactive: false,

  encoding: {
    y: LowerField,
    y0: UpperField,
    color: {
      value: () => RangeColor
    }
  },

  transition: {
    duration: 0
  },

  interpolate: "linear"
},

    // Actual Sales line
    {
      mark: "line",
      className: "sales-line",

      encoding: {
        y: SalesField,

        color: {
          value: () => LineColor
        }
      },

      interpolate: "linear"
    }
  ])

  .config({
    columns: {
      headers: {
        show: false
      }
    },

    axes: {
      x: {
        name: "Year",
        numberOfTicks: 10,
        tickFormat: yearFormatter.formatterFunc(),

        labels: {
          rotation: 0
        }
      },

      y: {
        name: "Sales",
        domain: [0, null],
        tickFormat: currencyFormatter.formatterFunc()
      }
    },

    interaction: {
  tooltip: {
    fieldFormatters: {
      [YearField]: yearFormatter.formatterFunc(),
      [SalesField]: tooltipcurrencyFormatter.formatterFunc(),
      [LowerField]: currencyFormatter.formatterFunc(),
      [UpperField]: currencyFormatter.formatterFunc()
    }
  }
}
  })

  .data(data).mount("#chart");

// Custom Centered Legend
if (parent) {
  const legend = document.createElement("div");

  legend.id = "ranged-area-legend";

  legend.style.cssText = `
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
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
      gap: 6px;
      white-space: nowrap;
    ">
      <span style="
        display: inline-block;
        width: 18px;
        height: 3px;
        background: ${LineColor};
      "></span>
      Total Sales
    </span>

    <span style="
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    ">
      <span style="
        display: inline-block;
        width: 18px;
        height: 10px;
        background: ${RangeColor};
      "></span>
      Target Range (±20%)
    </span>
  `;

  parent.appendChild(legend);
}