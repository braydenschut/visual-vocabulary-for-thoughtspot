/**
 * Available Columns:
 * "Day(date)"
 * "Total sales"
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

const DateField = "Day(date)";
const SalesField = "Total sales";
const QuantityField = "Total quantity purchased";

const WeekField = "Calendar Week";
const WeekdayField = "Weekday";

const SelectedYear = 2025;
const DayMs = 86400000;

const HeatmapColors = [
  "#E5F3E7",
  "#B7DFBE",
  "#7CC98A",
  "#48AA5B",
  "#269039"
];

const Weekdays = [
  "01 Sun", "02 Mon", "03 Tue", "04 Wed",
  "05 Thu", "06 Fri", "07 Sat"
];

setGlobalOptions({
  displayAs: {
    columns: {
      [DateField]: "Date",
      [SalesField]: "Sales",
      [QuantityField]: "Quantity Purchased",
      [WeekField]: "Calendar Week",
      [WeekdayField]: "Weekday"
    }
  }
});

// Formatters
const tooltipCurrency = new NumberFormatter("currency", {
  currency: "USD",
  unit: "none",
  decimalDigits: 0
});

const tooltipQuantity = new NumberFormatter("decimal", {
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

const formatDate = value => {
  const date = parseDate(value);

  return date
    ? date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC"
      })
    : "";
};

const formatWeekday = value =>
  String(cellValue(value) ?? "")
    .replace(/^\d{2}\s/, "");

// Calendar Positions
const firstDay = Date.UTC(SelectedYear, 0, 1);
const firstWeekday = new Date(firstDay).getUTCDay();
const calendarStart = firstDay - firstWeekday * DayMs;

const getCalendarWeek = value => {
  const date = parseDate(value);

  if (!date || date.getUTCFullYear() !== SelectedYear)
    return null;

  const day = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );

  const week = Math.floor(
    (day - calendarStart) / (7 * DayMs)
  ) + 1;

  return String(week).padStart(2, "0");
};

const getWeekday = value => {
  const date = parseDate(value);

  return date?.getUTCFullYear() === SelectedYear
    ? Weekdays[date.getUTCDay()]
    : null;
};

// Original ThoughtSpot DataModel
const source = await getDataFromSearchQuery();

// Calculate Calendar Dimensions
let data = source;

[
  [WeekField, getCalendarWeek],
  [WeekdayField, getWeekday]
].forEach(([name, calculate]) => {
  data = data.calculateVariable(
    {
      name,
      type: "dimension"
    },
    [DateField],
    calculate
  );
});

// Filter the displayed chart to 2025.
data = data.select({
  operator: muze.DataModel.LogicalOperators.AND,
  conditions: [
    {
      field: WeekField,
      value: null,
      operator: muze.DataModel.ComparisonOperators.NOT_EQUAL
    }
  ]
});

// Chart Container
const chart = document.querySelector("#chart");

chart.style.cssText = `
  width:100%;
  height:100%;
  min-height:0;
  display:flex;
  flex-direction:column;
  box-sizing:border-box;
  overflow:hidden;
  font-family:Arial,sans-serif;
`;

const chartArea = document.createElement("div");
chartArea.id = "calendar-muze-chart";

chartArea.style.cssText = `
  width:100%;
  flex:1 1 0%;
  min-height:0;
  overflow:hidden;
`;

const footer = document.createElement("div");

footer.style.cssText = `
  height:38px;
  flex:0 0 38px;
  display:flex;
  align-items:center;
  justify-content:center;
  background:#FFFFFF;
`;

chart.replaceChildren(chartArea, footer);

// Native Muze Heatmap
muze
  .canvas()

  .columns([WeekField])
  .rows([WeekdayField])
  .detail([DateField])

  .color({
    field: SalesField,
    as: "continuous",
    step: true,
    stops: 5,
    range: HeatmapColors
  })

  .layers([
    { mark: "bar" }
  ])

  .config({
    columns: {
      headers: { show: false }
    },

    rows: {
      headers: { show: false }
    },

    axes: {
      x: {
        name: "Week Number (2025)",
        showAxisName: true,
        ordering: {
          type: "custom",
          values: Array.from(
            { length: 53 },
            (_, i) => String(i + 1).padStart(2, "0")
          )
        },
        padding: 0
      },

      y: {
        name: "Day of Week (2025)",
        showAxisName: true,
        ordering: {
          type: "custom",
          values: Weekdays
        },
        padding: 0,
        tickFormat: formatWeekday
      }
    },

    gridLines: {
      x: { show: false },
      y: { show: false }
    },

    legend: {
      color: {
        show: false,
        step: true,
        range: HeatmapColors
      }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [DateField]: formatDate,
          [WeekdayField]: formatWeekday,
          [SalesField]: tooltipCurrency.formatterFunc(),
          [QuantityField]: tooltipQuantity.formatterFunc()
        }
      }
    }
  })

  .data(data)
  .mount("#calendar-muze-chart");

// Centered Color Legend
const legend = document.createElement("div");

legend.style.cssText = `
  display:flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  font:12px Arial,sans-serif;
  color:#666;
  white-space:nowrap;
  pointer-events:none;
`;

const label = text => {
  const element = document.createElement("span");
  element.textContent = text;
  return element;
};

legend.appendChild(label("Min"));

HeatmapColors.forEach(color => {
  const swatch = document.createElement("span");

  swatch.style.cssText = `
    width:26px;
    height:16px;
    background:${color};
    border-radius:2px;
  `;

  legend.appendChild(swatch);
});

legend.appendChild(label("Max"));
footer.appendChild(legend);