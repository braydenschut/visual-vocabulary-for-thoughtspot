/**
 * Available Columns:
 * "Quarter(date)"
 * "Month(date)"
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

const QuarterField = "Quarter(date)";
const MonthField = "Month(date)";
const SalesField = "Total sales";

const LowField = "Quarterly Minimum";
const HighField = "Quarterly Maximum";
const AverageField = "Quarterly Average";

const RangeColor = "#B7DFBE";
const LineColor = "#269039";

setGlobalOptions({
  displayAs: {
    columns: {
      [QuarterField]: "Quarter",
      [MonthField]: "Month",
      [SalesField]: "Sales",
      [LowField]: "Quarterly Minimum",
      [HighField]: "Quarterly Maximum",
      [AverageField]: "Quarterly Average"
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

const parseDate = value => {
  const raw = cellValue(value);
  if (raw == null || raw === "") return null;

  const number = Number(raw);

  const date = raw instanceof Date
    ? raw
    : new Date(
        Number.isFinite(number) && Math.abs(number) >= 1e9
          ? Math.abs(number) < 1e11
            ? number * 1000
            : number
          : raw
      );

  return Number.isNaN(date.getTime()) ? null : date;
};

const parseQuarter = value => {
  const raw = cellValue(value);
  if (raw == null || raw === "") return null;

  const match = String(raw).match(
    /Q([1-4])[\s/-]*(\d{4})|(\d{4})[\s/-]*Q([1-4])/i
  );

  if (match) {
    return {
      year: Number(match[2] || match[3]),
      quarter: Number(match[1] || match[4])
    };
  }

  const date = parseDate(raw);
  if (!date) return null;

  return {
    year: date.getUTCFullYear(),
    quarter: Math.floor(date.getUTCMonth() / 3) + 1
  };
};

const quarterKey = value => {
  const q = parseQuarter(value);
  return q ? `${q.year}-Q${q.quarter}` : null;
};

const formatQuarter = value => {
  const q = parseQuarter(value);
  return q ? `Q${q.quarter} ${q.year}` : "";
};

const monthKey = value => {
  const date = parseDate(value);
  if (!date) return null;

  return `${date.getUTCFullYear()}-${String(
    date.getUTCMonth() + 1
  ).padStart(2, "0")}`;
};

// Get Original ThoughtSpot DataModel
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const quarterIndex = fieldIndex(QuarterField);
const monthIndex = fieldIndex(MonthField);
const salesIndex = fieldIndex(SalesField);

if ([quarterIndex, monthIndex, salesIndex].includes(-1)) {
  throw new Error(
    "Search requires Quarter(date), Month(date), and Total sales."
  );
}

// Aggregate Monthly Sales by Quarter
const quarterMonths = new Map();
const quarterValues = new Map();

for (const row of result.data || []) {
  const rawQuarter = cellValue(row[quarterIndex]);
  const quarter = parseQuarter(rawQuarter);
  const month = monthKey(row[monthIndex]);

  const rawSales = cellValue(row[salesIndex]);
  const sales = rawSales == null || rawSales === ""
    ? NaN
    : Number(rawSales);

  if (!quarter || !month || !Number.isFinite(sales)) continue;

  const key = `${quarter.year}-Q${quarter.quarter}`;

  if (!quarterMonths.has(key))
    quarterMonths.set(key, new Map());

  const months = quarterMonths.get(key);

  months.set(
    month,
    (months.get(month) || 0) + sales
  );

  if (!quarterValues.has(key))
    quarterValues.set(key, rawQuarter);
}

// Calculate Quarterly Minimum, Maximum, Average
const quarterlyRange = new Map();

for (const [key, months] of quarterMonths) {
  const [year, quarter] = key.split("-Q").map(Number);

  const expectedMonths = [0, 1, 2].map(
    offset => `${year}-${String(
      (quarter - 1) * 3 + offset + 1
    ).padStart(2, "0")}`
  );

  if (
    months.size !== 3 ||
    !expectedMonths.every(month => months.has(month))
  ) continue;

  const values = expectedMonths.map(month => months.get(month));

  quarterlyRange.set(key, {
    low: Math.min(...values),
    high: Math.max(...values),
    average: values.reduce((sum, value) => sum + value, 0) / 3
  });
}

const orderedKeys = [...quarterlyRange.keys()].sort();
const orderedQuarters = orderedKeys.map(
  key => quarterValues.get(key)
);

if (!orderedQuarters.length) {
  throw new Error(
    "No complete quarters found. Each quarter requires three months."
  );
}

// Preserve Original ThoughtSpot DataModel
let data = source;

[
  [LowField, "low"],
  [HighField, "high"],
  [AverageField, "average"]
].forEach(([field, property]) => {
  data = data.calculateVariable(
    {
      name: field,
      type: "measure",
      defAggFn: "min"
    },
    [QuarterField],
    quarter =>
      quarterlyRange.get(quarterKey(quarter))?.[property] ?? null
  );
});

// Include only complete quarters.
data = data.select({
  operator: muze.DataModel.LogicalOperators.OR,
  conditions: orderedQuarters.map(value => ({
    field: QuarterField,
    value,
    operator: muze.DataModel.ComparisonOperators.EQUAL
  }))
});

// Ranged Area with Line
muze
  .canvas()

  .columns([QuarterField])
  .rows([
    muze.Operators.share(
      LowField,
      HighField,
      AverageField
    )
  ])

  .title(" ")

  .layers([
    {
      mark: "area",
      interactive: false,
      encoding: {
        x: QuarterField,
        y: HighField,
        y0: LowField,
        color: { value: () => RangeColor }
      },
      transform: { type: "identity" },
      interpolate: "linear"
    },

    {
      mark: "line",
      encoding: {
        x: QuarterField,
        y: AverageField,
        color: { value: () => LineColor }
      },
      interpolate: "linear"
    },

    {
      mark: "point",
      encoding: {
        x: QuarterField,
        y: AverageField,
        color: { value: () => LineColor },
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
        name: "Quarter",
        ordering: {
          type: "custom",
          values: orderedQuarters
        },
        tickFormat: formatQuarter,
        numberOfTicks: orderedQuarters.length,
        labels: { rotation: -35 }
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
      color: { show: false }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [QuarterField]: formatQuarter,
          [LowField]: tooltipCurrency.formatterFunc(),
          [HighField]: tooltipCurrency.formatterFunc(),
          [AverageField]: tooltipCurrency.formatterFunc()
        }
      }
    }
  })

  .data(data)
  .mount("#chart");

// Custom Centered Legend
const chart = document.querySelector("#chart");
const parent = chart?.parentElement;

if (parent) {
  parent.style.position = "relative";
  parent.querySelector("#quarterly-range-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "quarterly-range-legend";

  legend.style.cssText = `
    position:absolute;
    top:10px;
    left:50%;
    transform:translateX(-50%);
    z-index:10;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:16px;
    padding:6px 10px;
    background:rgba(255,255,255,.95);
    border-radius:4px;
    font:12px Arial,sans-serif;
    color:#555;
    white-space:nowrap;
    pointer-events:none;
  `;

  const entries = [
    ["Quarterly Sales Range", RangeColor, "area"],
    ["Quarterly Average", LineColor, "line"]
  ];

  legend.innerHTML = entries.map(([label, color, type]) => `
    <span style="
      display:inline-flex;
      align-items:center;
      gap:6px;
    ">
      <span style="
        display:inline-block;
        width:${type === "line" ? "18px" : "12px"};
        height:${type === "line" ? "3px" : "12px"};
        border-radius:2px;
        background:${color};
      "></span>
      ${label}
    </span>
  `).join("");

  parent.appendChild(legend);
}