/**
 * Available Columns:
 * "Year(date)"
 * "item type"
 * "Total sales"
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
const ItemField = "item type";
const YearField = "Year(date)";
const SalesField = "Total sales";

const PosStartField = "Increase Start";
const PosEndField = "Increase End";
const NegStartField = "Decrease Start";
const NegEndField = "Decrease End";
const LabelPosField = "Label Position";
const LabelTextField = "Change Label";

// Settings
const BaseYear = 2024;
const ComparisonYear = 2025;

const IncreaseColor = "#E6B00E";
const DecreaseColor = "#A77C08";

// Formatters
const compactUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1
});

const fullUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const cellValue = value => {
  if (
    value == null ||
    typeof value !== "object" ||
    value instanceof Date
  ) return value;

  for (const key of ["rawValue", "value", "_value", "v"]) {
    if (key in value) {
      const result = value[key];

      return cellValue(
        typeof result === "function"
          ? result.call(value)
          : result
      );
    }
  }

  return null;
};

const numericValue = value => {
  const raw = cellValue(value);
  return raw == null || raw === "" ? NaN : Number(raw);
};

const parseYear = value => {
  const raw = cellValue(value);

  if (raw instanceof Date)
    return raw.getUTCFullYear();

  const number = Number(raw);

  if (
    Number.isInteger(number) &&
    number >= 1900 &&
    number <= 2100
  ) return number;

  if (
    Number.isFinite(number) &&
    Math.abs(number) >= 1e9
  ) {
    const date = new Date(
      Math.abs(number) < 1e11 ? number * 1000 : number
    );

    return Number.isNaN(date.getTime())
      ? null
      : date.getUTCFullYear();
  }

  const match = String(raw ?? "").match(
    /\b(?:19|20)\d{2}\b/
  );

  return match ? Number(match[0]) : null;
};

const formatSales = value => {
  const number = numericValue(value);

  return Number.isFinite(number)
    ? compactUSD.format(number)
    : "";
};

const formatTooltipSales = value => {
  const number = numericValue(value);

  return Number.isFinite(number)
    ? fullUSD.format(number)
    : "";
};

const formatChange = value => {
  const number = numericValue(value);

  return Number.isFinite(number)
    ? `${number > 0 ? "+" : ""}${formatSales(number)}`
    : "";
};

// Display Names
setGlobalOptions({
  displayAs: {
    columns: {
      [ItemField]: "Item Type",
      [YearField]: "Year",
      [SalesField]: "Sales",
      [PosStartField]: "Increase Start",
      [PosEndField]: "Increase End",
      [NegStartField]: "Decrease Start",
      [NegEndField]: "Decrease End",
      [LabelPosField]: "Label Position",
      [LabelTextField]: "Sales Change"
    }
  }
});

// Get ThoughtSpot Data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const itemIndex = fieldIndex(ItemField);
const yearIndex = fieldIndex(YearField);
const salesIndex = fieldIndex(SalesField);

if ([itemIndex, yearIndex, salesIndex].includes(-1)) {
  throw new Error(
    "Search requires item type, Year(date), and Total sales."
  );
}

// Aggregate Sales by Item Type and Year
const salesByItem = new Map();
const yearValues = new Map();

for (const row of result.data || []) {
  const item = String(
    cellValue(row[itemIndex]) ?? ""
  ).trim();

  const rawYear = cellValue(row[yearIndex]);
  const year = parseYear(rawYear);
  const sales = numericValue(row[salesIndex]);

  if (
    !item ||
    ![BaseYear, ComparisonYear].includes(year) ||
    !Number.isFinite(sales)
  ) continue;

  if (!yearValues.has(year))
    yearValues.set(year, rawYear);

  if (!salesByItem.has(item)) {
    salesByItem.set(item, {
      [BaseYear]: 0,
      [ComparisonYear]: 0,
      hasComparison: false
    });
  }

  const totals = salesByItem.get(item);

  totals[year] += sales;

  if (year === ComparisonYear)
    totals.hasComparison = true;
}

if (
  !yearValues.has(BaseYear) ||
  !yearValues.has(ComparisonYear)
) {
  throw new Error(
    `Search must include ${BaseYear} and ${ComparisonYear}.`
  );
}

// The bridge uses comparison-year rows as mark targets.
const missingItems = [...salesByItem.entries()]
  .filter(([, totals]) => !totals.hasComparison)
  .map(([item]) => item);

if (missingItems.length) {
  throw new Error(
    `Missing ${ComparisonYear} rows for: ${missingItems.join(", ")}`
  );
}

// Calculate Changes
const totalBase = [...salesByItem.values()]
  .reduce((sum, totals) => sum + totals[BaseYear], 0);

const totalComparison = [...salesByItem.values()]
  .reduce((sum, totals) => sum + totals[ComparisonYear], 0);

const changes = new Map(
  [...salesByItem.entries()].map(([item, totals]) => [
    item,
    totals[ComparisonYear] - totals[BaseYear]
  ])
);

const orderedItems = [...changes.keys()].sort(
  (a, b) => changes.get(a) - changes.get(b) ||
    a.localeCompare(b)
);

// Calculate Cumulative Waterfall Positions
const positions = new Map();
const runningValues = [totalBase];

let runningTotal = totalBase;

for (const item of orderedItems) {
  const change = changes.get(item);
  const start = runningTotal;
  const end = start + change;

  positions.set(item, {
    change,
    start,
    end,
    midpoint: (start + end) / 2
  });

  runningTotal = end;
  runningValues.push(end);
}

// Add Calculated Measures to Original DataModel
const calculations = [
  [PosStartField, p => p.change > 0 ? p.start : null],
  [PosEndField, p => p.change > 0 ? p.end : null],
  [NegStartField, p => p.change < 0 ? p.start : null],
  [NegEndField, p => p.change < 0 ? p.end : null],
  [LabelPosField, p => p.midpoint],
  [LabelTextField, p => formatChange(p.change)]
];

let data = source;

for (const [name, calculate] of calculations) {
  const isText = name === LabelTextField;

  data = data.calculateVariable(
    {
      name,
      type: isText ? "dimension" : "measure",
      ...(!isText ? { defAggFn: "min" } : {})
    },
    [ItemField],
    item => {
      const position = positions.get(
        String(cellValue(item) ?? "").trim()
      );

      return position
        ? calculate(position)
        : isText ? "" : null;
    }
  );
}

// Keep Comparison Year as the Selectable Source
data = data.select({
  operator: muze.DataModel.LogicalOperators.OR,
  conditions: [{
    field: YearField,
    value: yearValues.get(ComparisonYear),
    operator: muze.DataModel.ComparisonOperators.EQUAL
  }]
});

// Axis Range
const minRunning = Math.min(...runningValues);
const maxRunning = Math.max(...runningValues);

const span = Math.max(
  maxRunning - minRunning,
  Math.abs(totalBase) * 0.05,
  1
);

const yMin = minRunning - span * 0.12;
const yMax = maxRunning + span * 0.12;

// Waterfall Chart
muze
  .canvas()

  .columns([ItemField])

  .rows([
    muze.Operators.share(
      PosStartField,
      PosEndField,
      NegStartField,
      NegEndField,
      LabelPosField
    )
  ])

  .detail([ItemField, YearField, SalesField])

  .title(" ")
  .subtitle(" ")

  .layers([
    {
      mark: "bar",
      interactive: true,
      encoding: {
        x: ItemField,
        y: PosEndField,
        y0: PosStartField,
        color: { value: () => IncreaseColor }
      },
      transform: { type: "identity" }
    },

    {
      mark: "bar",
      interactive: true,
      encoding: {
        x: ItemField,
        y: NegStartField,
        y0: NegEndField,
        color: { value: () => DecreaseColor }
      },
      transform: { type: "identity" }
    },

    {
      mark: "text",
      interactive: false,
      encoding: {
        x: ItemField,
        y: LabelPosField,
        text: { field: LabelTextField },
        color: { value: () => "#FFFFFF" }
      }
    }
  ])

  .config({
    autoGroupBy: { disabled: true },

    columns: {
      headers: { show: false }
    },

    rows: {
      headers: { show: false },
      facets: { show: false }
    },

    axes: {
      x: {
        name: "Item Type",
        ordering: {
          type: "custom",
          values: orderedItems
        },
        labels: { rotation: -45 }
      },

      y: {
        name: "Cumulative Sales",
        domain: [yMin, yMax],
        nice: false,
        numberOfTicks: 5,
        tickFormat: formatSales
      }
    },

    gridLines: {
      x: { show: false },
      y: { show: true }
    },

    legend: {
      color: { show: false }
    },

    interaction: {
      tooltip: {
        includeDataFromAllLayers: false,
        fieldFormatters: Object.fromEntries(
          [
            SalesField,
            PosStartField,
            PosEndField,
            NegStartField,
            NegEndField,
            LabelPosField
          ].map(field => [field, formatTooltipSales])
        )
      }
    }
  })

  .data(data)
  .mount("#chart");

// Centered Legend
const chart = document.querySelector("#chart");
const parent = chart?.parentElement;

if (parent) {
  parent.style.position = "relative";
  parent.querySelector("#variance-waterfall-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "variance-waterfall-legend";

  legend.style.cssText = `
    position:absolute;
    top:10px;
    left:50%;
    transform:translateX(-50%);
    z-index:10;
    display:flex;
    align-items:center;
    gap:15px;
    padding:6px 10px;
    background:rgba(255,255,255,.95);
    border-radius:4px;
    color:#555;
    font:12px Arial,sans-serif;
    white-space:nowrap;
    pointer-events:none;
  `;

  const entries = [
    [`${BaseYear}: ${formatSales(totalBase)}`, null],
    [`${ComparisonYear}: ${formatSales(totalComparison)}`, null],
    ["Increase", IncreaseColor],
    ["Decrease", DecreaseColor]
  ];

  legend.innerHTML = entries.map(([label, color]) => `
    <span style="
      display:inline-flex;
      align-items:center;
      gap:5px;
    ">
      ${color ? `
        <span style="
          width:12px;
          height:10px;
          display:inline-block;
          background:${color};
          border-radius:2px;
        "></span>
      ` : ""}
      ${label}
    </span>
  `).join("");

  parent.appendChild(legend);
}