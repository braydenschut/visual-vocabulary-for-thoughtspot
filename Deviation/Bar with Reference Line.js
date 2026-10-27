/**
 * Available Columns:
 * "Year(date)"
 * "Total sales"
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

// Colors
const BarColor = "#FCC838";
const ReferenceColor = "#E45756";

// Display Names
// Rename fields for display without changing
// the underlying ThoughtSpot column names.

setGlobalOptions({
  displayAs: {
    columns: {
      [YearField]: "Year",
      [SalesField]: "Sales"
    }
  }
});

// Formatters
// Format Sales as USD with 0 decimal places
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

// Display years as YYYY
const yearFormatter = new DateFormatter({
  format: "yyyy"
});
const data = await getDataFromSearchQuery();

// Chart Container
const chartElement = document.querySelector("#chart");

if (!chartElement) {
  throw new Error("Chart container #chart not found.");
}

// Position the legend without adding height
// above or below the chart.
if (chartElement.parentElement) {
  chartElement.parentElement.style.position =
    "relative";
  chartElement.parentElement
    .querySelector("#reference-line-custom-legend")
    ?.remove();
}
muze
  .canvas()

  // Years on X-axis
  .columns([YearField])

  // Sales on Y-axis
  .rows([SalesField])

  // Space above the chart for the legend
  .title(" ")

  // Calculate average yearly sales
  .transform({
    averageLine: function (dt) {
      return dt.groupBy(
        [],
        [
          {
            aggn: muze.DataModel.AggregationFunctions.AVG,
            field: SalesField
          }
        ]
      );
    }
  })

  .layers([
    // Actual yearly sales bars
    {
      mark: "bar",

      encoding: {
        x: YearField,
        y: SalesField,

        color: {
          value: () => BarColor
        }
      }
    },

{
  mark: "text",
  interactive: false,

  encoding: {
    text: {
      field: SalesField,
      formatter: currencyFormatter.formatterFunc()
    },

    y: {
      field: SalesField,
      type: "quantitative"
    },

    color: {
      value: () => "#333333"
    }
  },

  // Move labels 10 pixels above each bar
  encodingTransform: points => {
    points.forEach(point => {
      point.update.y -= 10;
      point.textanchor = "middle";
    });

    return points;
  }
},

    // Average sales reference line
    {
      mark: "tick",
      name: "averageLine",
      source: "averageLine",
      calculateDomain: false,
      interactive: false,

      encoding: {
        x: {
          field: null
        },

        y: SalesField,

        color: {
          value: () => ReferenceColor
        }
      }
    }
  ])

  .config({
    // Hide Year(date) field header
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
        tickFormat: currencyFormatter.formatterFunc()
      }
    },

    // Tooltip formatting
    interaction: {
      tooltip: {
        fieldFormatters: {
          [SalesField]:
            tooltipcurrencyFormatter.formatterFunc()
        }
      }
    }
  })

  .data(data).mount("#chart");

// Custom Centered Legend
if (chartElement.parentElement) {
  const parent = chartElement.parentElement;

  const legend = document.createElement("div");
  legend.id = "reference-line-custom-legend";

  // Absolute positioning prevents the legend
  // from pushing the chart out of its container.
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
    color: #555;
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
        background: ${BarColor};
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
        width: 18px;
        height: 3px;
        background: ${ReferenceColor};
      "></span>
      Average Sales
    </span>
  `;

  parent.appendChild(legend);
}