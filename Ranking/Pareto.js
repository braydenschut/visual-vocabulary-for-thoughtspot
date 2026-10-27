/**
 * Available Columns:
 * "store"
 * "Total quantity purchased"
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

// Fields
const StoreField = "store";
const QuantityField = "Total quantity purchased";
const CumulativeField = "Cumulative Percentage";
const ReferenceField = "80% Reference";

// Colors
const BarColor = "#018DB0";
const LineColor = "#E45756";
const ReferenceColor = "#808080";
const ReferenceValue = 80;

setGlobalOptions({
  displayAs: {
    columns: {
      [StoreField]: "Store",
      [QuantityField]: "Quantity Purchased",
      [CumulativeField]: "Cumulative %",
      [ReferenceField]: "80% Reference"
    }
  }
});

// Formatters
const quantityAxis = new NumberFormatter("decimal", {
  unit: "auto",
  decimalDigits: 0
});

const fullQuantity = new NumberFormatter("decimal", {
  unit: "none",
  decimalDigits: 0
});

const cellValue = value => {
  if (value == null || typeof value !== "object")
    return value;

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

const numericValue = value => {
  const raw = cellValue(value);
  return raw == null || raw === "" ? NaN : Number(raw);
};

const formatPercent = value => {
  const number = numericValue(value);
  return Number.isFinite(number)
    ? `${number.toFixed(0)}%`
    : "";
};

// Get ThoughtSpot Data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const storeIndex = fieldIndex(StoreField);
const quantityIndex = fieldIndex(QuantityField);

if (storeIndex < 0 || quantityIndex < 0) {
  throw new Error(
    "Search requires store and Total quantity purchased."
  );
}

// Aggregate and Rank Stores
const quantityByStore = new Map();

for (const row of result.data || []) {
  const store = String(
    cellValue(row[storeIndex]) ?? ""
  ).trim();

  const quantity = numericValue(row[quantityIndex]);

  if (
    !store ||
    !Number.isFinite(quantity) ||
    quantity < 0
  ) continue;

  quantityByStore.set(
    store,
    (quantityByStore.get(store) || 0) + quantity
  );
}

const rankedData = [...quantityByStore.entries()]
  .sort((a, b) => b[1] - a[1]);

const totalQuantity = rankedData.reduce(
  (sum, [, quantity]) => sum + quantity,
  0
);

if (totalQuantity <= 0) {
  throw new Error("Total Quantity Purchased must be positive.");
}

// Calculate Cumulative Percentage
const cumulativeByStore = new Map();
let runningTotal = 0;

for (const [store, quantity] of rankedData) {
  runningTotal += quantity;

  cumulativeByStore.set(
    store,
    runningTotal / totalQuantity * 100
  );
}

const rankedStores = rankedData.map(([store]) => store);

// Preserve Original ThoughtSpot DataModel
let data = source.calculateVariable(
  {
    name: CumulativeField,
    type: "measure",
    defAggFn: "min"
  },
  [StoreField],
  store =>
    cumulativeByStore.get(String(cellValue(store))) ?? null
);

data = data.calculateVariable(
  {
    name: ReferenceField,
    type: "measure",
    defAggFn: "min"
  },
  [StoreField],
  store =>
    cumulativeByStore.has(String(cellValue(store)))
      ? ReferenceValue
      : null
);

// Chart Container
const chart = document.querySelector("#chart");
const parent = chart.parentElement;

if (parent) {
  parent.style.position = "relative";
  parent.querySelector("#pareto-custom-legend")?.remove();
}

// Pareto Chart
muze
  .canvas()

  .columns([StoreField])

  .rows([
    [QuantityField],
    [
      muze.Operators.share(
        CumulativeField,
        ReferenceField
      )
    ]
  ])

  .title(" ")

  .layers([
    {
      mark: "bar",
      encoding: {
        x: StoreField,
        y: QuantityField,
        color: { value: () => BarColor }
      }
    },

    {
      mark: "line",
      encoding: {
        x: StoreField,
        y: CumulativeField,
        color: { value: () => LineColor }
      },
      interpolate: "linear"
    },

    {
      mark: "line",
      className: "pareto-reference-line",
      interactive: false,
      encoding: {
        x: StoreField,
        y: ReferenceField,
        color: { value: () => ReferenceColor }
      },
      interpolate: "linear"
    }
  ])

  .config({
    borders: {
      top: { show: false }
    },

    columns: {
      headers: { show: false }
    },

    rows: {
      facets: { show: false },
      headers: { show: false }
    },

    axes: {
      x: {
        name: "Store",
        ordering: {
          type: "custom",
          values: rankedStores
        },
        labels: { rotation: -45 }
      },

      y: {
        numberOfTicks: 5,
        tickFormat: (value, context) => {
          const field = context?.context?.config?.()?.field;

          return [CumulativeField, ReferenceField].includes(field)
            ? formatPercent(value)
            : quantityAxis.formatterFunc()(value, context);
        }
      }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [QuantityField]: fullQuantity.formatterFunc(),
          [CumulativeField]: formatPercent,
          [ReferenceField]: formatPercent
        }
      }
    }
  })

  .data(data)
  .mount("#chart");

// Dashed Reference Line
document.getElementById("pareto-reference-style")?.remove();

const referenceStyle = document.createElement("style");
referenceStyle.id = "pareto-reference-style";
referenceStyle.textContent = `
  #chart .pareto-reference-line,
  #chart .pareto-reference-line path,
  #chart path.pareto-reference-line {
    stroke-dasharray: 6 4 !important;
  }
`;

document.head.appendChild(referenceStyle);

// Clean Up Secondary Y-Axis
window.paretoAxisObserver?.disconnect();

const fixSecondaryAxis = () => {
  const bounds = chart.getBoundingClientRect();
  const rightAxisStart = bounds.left + bounds.width * 0.78;

  chart.querySelectorAll("svg text").forEach(element => {
    const label = (element.textContent || "").trim();

    // Hide combined secondary-axis title.
    if (
      /Cumulative\s*(?:Percentage|%)/i.test(label) &&
      /80\s*%\s*Reference/i.test(label)
    ) {
      element.style.setProperty(
        "display", "none", "important"
      );
      element.style.setProperty(
        "pointer-events", "none", "important"
      );

      const group = element.closest("g");

      if (group) {
        group.querySelectorAll("title").forEach(
          title => title.remove()
        );
        group.removeAttribute("title");
        group.style.setProperty(
          "pointer-events", "none", "important"
        );
      }

      return;
    }

    // Format secondary-axis numeric ticks.
    if (!/^\d+(?:\.\d+)?$/.test(label)) return;

    const position = element.getBoundingClientRect();
    const value = Number(label);

    if (
      position.left >= rightAxisStart &&
      position.right <= bounds.right &&
      value >= 0 &&
      value <= 100
    ) {
      element.textContent = `${value.toFixed(0)}%`;
    }
  });
};

fixSecondaryAxis();

// Reapply after Muze redraws.
const axisObserver = new MutationObserver(() => {
  axisObserver.disconnect();
  fixSecondaryAxis();

  axisObserver.observe(chart, {
    childList: true,
    subtree: true,
    characterData: true
  });
});

axisObserver.observe(chart, {
  childList: true,
  subtree: true,
  characterData: true
});

window.paretoAxisObserver = axisObserver;

// Centered Legend
if (parent) {
  const legend = document.createElement("div");
  legend.id = "pareto-custom-legend";

  legend.style.cssText = `
    position:absolute;
    top:10px;
    left:50%;
    transform:translateX(-50%);
    z-index:10;
    display:flex;
    align-items:center;
    gap:22px;
    padding:6px 12px;
    background:rgba(255,255,255,.95);
    border-radius:4px;
    font:12px Arial,sans-serif;
    color:#555;
    white-space:nowrap;
    pointer-events:none;
  `;

  const entries = [
    ["Quantity Purchased", BarColor, "bar"],
    ["Cumulative %", LineColor, "line"],
    ["80% Reference", ReferenceColor, "reference"]
  ];

  legend.innerHTML = entries.map(([label, color, type]) => `
    <span style="
      display:inline-flex;
      align-items:center;
      gap:7px;
    ">
      <span style="
        display:inline-block;
        width:${type === "bar" ? "16px" : "18px"};
        height:${type === "bar" ? "10px" : "3px"};
        background:${
          type === "reference"
            ? `repeating-linear-gradient(
                to right,
                ${color} 0px,
                ${color} 5px,
                transparent 5px,
                transparent 8px
              )`
            : color
        };
      "></span>
      ${label}
    </span>
  `).join("");

  parent.appendChild(legend);
}