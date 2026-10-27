/**
 * Available Columns:
 * "Month(date)"
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
const MonthField = "Month(date)";
const SalesField = "Total sales";
const IncreaseField = "Above Average";
const DecreaseField = "Below Average";

// Colors
const PositiveColor = "#E6B00E";
const NegativeColor = "#A77C08";

const MonthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

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
  notation: "standard",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const cellValue = value => {
  if (value == null || typeof value !== "object" || value instanceof Date)
    return value;

  for (const key of ["rawValue", "value", "_value", "v"]) {
    if (key in value) {
      const result = value[key];
      return cellValue(
        typeof result === "function" ? result.call(value) : result
      );
    }
  }
  return null;
};

const parseMonth = value => {
  const raw = cellValue(value);
  if (raw == null || raw === "") return null;

  if (raw instanceof Date) return raw.getUTCMonth() + 1;

  const text = String(raw).trim();
  const number = Number(raw);

  if (Number.isInteger(number) && number >= 1 && number <= 12)
    return number;

  const monthIndex = MonthNames.findIndex(
    name => text.toLowerCase().startsWith(name.toLowerCase())
  );

  if (monthIndex >= 0) return monthIndex + 1;

  const timestamp = Number.isFinite(number) && Math.abs(number) >= 1e9
    ? new Date(Math.abs(number) < 1e11 ? number * 1000 : number)
    : new Date(text);

  return Number.isNaN(timestamp.getTime())
    ? null
    : timestamp.getUTCMonth() + 1;
};

const formatMonth = value => {
  const month = parseMonth(value);
  return month ? MonthNames[month - 1] : "";
};

const formatSales = value => {
  const number = Number(cellValue(value));
  return Number.isFinite(number) ? compactUSD.format(number) : "";
};

// Get ThoughtSpot data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const monthIndex = fieldIndex(MonthField);
const salesIndex = fieldIndex(SalesField);

if (monthIndex < 0 || salesIndex < 0) {
  throw new Error("Search requires Month(date) and Total sales.");
}

// Aggregate sales by month
const salesByMonth = new Map();
const monthSourceValues = new Map();

(result.data || []).forEach(row => {
  const rawMonth = cellValue(row[monthIndex]);
  const month = parseMonth(rawMonth);
  const sales = Number(cellValue(row[salesIndex]));

  if (!month || !Number.isFinite(sales)) return;

  salesByMonth.set(
    month,
    (salesByMonth.get(month) || 0) + sales
  );

  if (!monthSourceValues.has(month))
    monthSourceValues.set(month, rawMonth);
});

const orderedMonths = [...salesByMonth.keys()].sort((a, b) => a - b);

if (!orderedMonths.length)
  throw new Error("No valid monthly sales data found.");

// Calculate deviations from monthly average
const average = [...salesByMonth.values()]
  .reduce((sum, sales) => sum + sales, 0) / orderedMonths.length;

const differences = new Map(
  orderedMonths.map(month => [
    month,
    salesByMonth.get(month) - average
  ])
);

const axisMaximum = Math.max(
  1,
  ...[...differences.values()].map(value => Math.abs(value) * 1.2)
);

// Add calculated measures to original DataModel
let data = source;

[
  [IncreaseField, value => value > 0],
  [DecreaseField, value => value < 0]
].forEach(([field, condition]) => {
  data = data.calculateVariable(
    {
      name: field,
      type: "measure",
      defAggFn: "min"
    },
    [MonthField],
    monthValue => {
      const difference = differences.get(parseMonth(monthValue));
      return difference != null && condition(difference)
        ? difference
        : null;
    }
  );
});

// Display names
setGlobalOptions({
  displayAs: {
    columns: {
      [MonthField]: "Month",
      [SalesField]: "Sales",
      [IncreaseField]: "Above Average",
      [DecreaseField]: "Below Average"
    }
  }
});

// Custom tooltip
const tooltipFormatter = ({ dataModel: dm }) => {
  const rows = dm?.getData()?.data || [];
  const index = dm?.getFieldIndex(MonthField);

  const month = index >= 0 && rows.length
    ? parseMonth(rows[0][index])
    : null;

  if (!month) return [];

  const sales = salesByMonth.get(month);
  const deviation = differences.get(month);

  const values = [
  ["Month", MonthNames[month - 1]],
  ["Total Sales", fullUSD.format(sales)],
  [
    "Deviation",
    `${deviation > 0 ? "+" : ""}${fullUSD.format(deviation)}`
  ]
];

  return muze.Operators.html`
    <div style="
      background:#454954;
      color:#FFFFFF;
      padding:14px 18px;
      border-radius:4px;
      font:11px Arial,sans-serif;
      min-width:250px;
      box-shadow:0 3px 8px rgba(0,0,0,.18);
    ">
      ${values.map(([label, value]) => `
        <div style="
          display:flex;
          justify-content:space-between;
          gap:30px;
          margin-bottom:8px;
        ">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `).join("")}
    </div>
  `;
};

// Chart
muze
  .canvas()

  .columns([MonthField])

  .rows([
    muze.Operators.share(IncreaseField, DecreaseField)
  ])

  .detail([MonthField, SalesField])

  .title(" ")
  .subtitle(" ")

  .layers([
    ...[
      [IncreaseField, PositiveColor],
      [DecreaseField, NegativeColor]
    ].map(([field, color]) => ({
      mark: "bar",
      interactive: true,
      encoding: {
        x: MonthField,
        y: field,
        color: { value: () => color }
      },
      transform: { type: "identity" }
    })),

    ...[
      [IncreaseField, -10],
      [DecreaseField, 14]
    ].map(([field, offset]) => ({
      mark: "text",
      interactive: false,
      encoding: {
        x: MonthField,
        y: field,
        text: {
          field,
          formatter: value => {
            const number = Number(cellValue(value));
            if (!Number.isFinite(number)) return "";
            return `${number > 0 ? "+" : ""}${formatSales(number)}`;
          }
        },
        color: { value: () => "#555555" }
      },
      encodingTransform: points => {
        points.forEach(point => {
          point.update.y += offset;
          point.textanchor = "middle";
        });
        return points;
      }
    }))
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
        name: "Month",
        ordering: {
          type: "custom",
          values: orderedMonths.map(
            month => monthSourceValues.get(month)
          )
        },
        tickFormat: formatMonth,
        labels: { rotation: 0 }
      },

      y: {
        name: "Sales",
        domain: [-axisMaximum, axisMaximum],
        nice: false,
        numberOfTicks: 7,
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
        formatter: tooltipFormatter
      }
    }
  })

  .data(data)
  .mount("#chart");