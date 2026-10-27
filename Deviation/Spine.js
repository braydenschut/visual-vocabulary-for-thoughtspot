/**
 * Available Columns:
 * "Year(date)"
 * "region"
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
const RegionField = "region";
const YearField = "Year(date)";
const SalesField = "Total sales";

const ShareField = "Sales Share (%)";
const PlotStartField = "Plot Start";
const PlotEndField = "Plot End";
const LabelPosField = "Label Position";
const LabelTextField = "Percentage Label";

// Settings
const BaseYear = 2024;
const ComparisonYear = 2025;

const YearColors = ["#A77C08", "#E6B00E"];

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

  const match = String(raw ?? "").match(/\b(?:19|20)\d{2}\b/);

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

const formatPercent = value => {
  const number = numericValue(value);
  return Number.isFinite(number)
    ? `${Math.abs(number).toFixed(1)}%`
    : "";
};

const percentTick = value => {
  const number = numericValue(value);

  if (!Number.isFinite(number)) return "";

  const label = `${Math.abs(Math.round(number))}%`;

  return number < 0 ? `\u200B${label}` : label;
};

// Display Names
setGlobalOptions({
  displayAs: {
    columns: {
      [RegionField]: "Region",
      [YearField]: "Year",
      [SalesField]: "Sales",
      [ShareField]: "Sales Share (%)",
      [PlotStartField]: "Plot Start",
      [PlotEndField]: "Plot End",
      [LabelPosField]: "Label Position",
      [LabelTextField]: "Percentage"
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

const regionIndex = fieldIndex(RegionField);
const yearIndex = fieldIndex(YearField);
const salesIndex = fieldIndex(SalesField);

if ([regionIndex, yearIndex, salesIndex].includes(-1)) {
  throw new Error(
    "Search requires region, Year(date), and Total sales."
  );
}

// Aggregate Sales by Region and Year
const salesByRegion = new Map();
const yearValues = new Map();

for (const row of result.data || []) {
  const region = String(
    cellValue(row[regionIndex]) ?? ""
  ).trim();

  const originalYear = cellValue(row[yearIndex]);
  const year = parseYear(originalYear);
  const sales = numericValue(row[salesIndex]);

  if (
    !region ||
    ![BaseYear, ComparisonYear].includes(year) ||
    !Number.isFinite(sales)
  ) continue;

  if (!yearValues.has(year))
    yearValues.set(year, originalYear);

  if (!salesByRegion.has(region)) {
    salesByRegion.set(region, {
      [BaseYear]: 0,
      [ComparisonYear]: 0
    });
  }

  salesByRegion.get(region)[year] += sales;
}

if (
  !yearValues.has(BaseYear) ||
  !yearValues.has(ComparisonYear)
) {
  throw new Error(
    `Search must include ${BaseYear} and ${ComparisonYear}.`
  );
}

// Calculate Each Year's Share of Regional Sales
const sharesByRegion = new Map();

for (const [region, totals] of salesByRegion) {
  const baseSales = Math.max(0, totals[BaseYear]);
  const comparisonSales = Math.max(0, totals[ComparisonYear]);
  const combinedSales = baseSales + comparisonSales;

  if (combinedSales <= 0) continue;

  sharesByRegion.set(region, {
    [BaseYear]: 100 * baseSales / combinedSales,
    [ComparisonYear]: 100 * comparisonSales / combinedSales,
    combinedSales
  });
}

const orderedRegions = [...sharesByRegion.keys()]
  .sort((a, b) =>
    sharesByRegion.get(b).combinedSales -
    sharesByRegion.get(a).combinedSales ||
    a.localeCompare(b)
  );

// Calculate Values Using Original DataModel
const getShare = (region, year) => {
  const shares = sharesByRegion.get(
    String(cellValue(region) ?? "").trim()
  );

  return shares?.[parseYear(year)] ?? null;
};

const calculatedFields = [
  {
    name: ShareField,
    type: "measure",
    calculate: (share, year) => share
  },
  {
    name: PlotStartField,
    type: "measure",
    calculate: (share, year) =>
      year === BaseYear ? -share : 0
  },
  {
    name: PlotEndField,
    type: "measure",
    calculate: (share, year) =>
      year === BaseYear ? 0 : share
  },
  {
    name: LabelPosField,
    type: "measure",
    calculate: (share, year) =>
      year === BaseYear ? -share / 2 : share / 2
  },
  {
    name: LabelTextField,
    type: "dimension",
    calculate: share => `${share.toFixed(1)}%`
  }
];

let data = source;

for (const field of calculatedFields) {
  data = data.calculateVariable(
    {
      name: field.name,
      type: field.type,
      ...(field.type === "measure"
        ? { defAggFn: "min" }
        : {})
    },
    [RegionField, YearField],
    (region, year) => {
      const share = getShare(region, year);

      return share == null
        ? field.type === "dimension" ? "" : null
        : field.calculate(share, parseYear(year));
    }
  );
}

// Spine Chart
muze
  .canvas()

  .rows([RegionField])

  .columns([
    muze.Operators.share(
      PlotStartField,
      PlotEndField,
      LabelPosField
    )
  ])

  .detail([
    RegionField,
    YearField,
    SalesField,
    ShareField
  ])

  .color(YearField)

  .title(" ")

  .layers([
    {
      mark: "bar",
      interactive: true,

      encoding: {
        x: PlotEndField,
        x0: PlotStartField,
        color: { field: YearField }
      },

      transform: { type: "identity" }
    },

    {
      mark: "text",
      interactive: false,

      encoding: {
        x: LabelPosField,
        text: { field: LabelTextField },
        color: { value: () => "#FFFFFF" }
      },

      transform: { type: "identity" }
    }
  ])

  .config({
    autoGroupBy: { disabled: true },

    borders: {
      top: { show: false }
    },

    columns: {
      headers: { show: false }
    },

    axes: {
      x: {
        name: "Share of Region Sales (%)",
        showAxisName: true,
        domain: [-100, 100],
        nice: false,
        numberOfTicks: 9,
        padding: 0,
        tickFormat: percentTick
      },

      y: {
        name: "Region",
        showAxisName: true,
        padding: 0,
        ordering: {
          type: "custom",
          values: [...orderedRegions].reverse()
        }
      }
    },

    legend: {
      color: {
        show: false,
        range: YearColors
      }
    },

    gridLines: {
      x: { show: true },
      y: { show: false }
    },

    interaction: {
      tooltip: {
        includeDataFromAllLayers: false,

        fieldFormatters: {
          [SalesField]: formatTooltipSales,
          [ShareField]: formatPercent,
          [PlotStartField]: formatPercent,
          [PlotEndField]: formatPercent
        }
      }
    }
  })

  .data(data)
  .mount("#chart");

// Centered Year Legend
const chart = document.querySelector("#chart");

chart.style.position = "relative";
chart.querySelector(".custom-spine-legend")?.remove();

const legend = document.createElement("div");
legend.className = "custom-spine-legend";

legend.style.cssText = `
  position:absolute;
  top:9px;
  left:50%;
  transform:translateX(-50%);
  display:flex;
  align-items:center;
  gap:18px;
  padding:5px 10px;
  background:rgba(255,255,255,.95);
  font:12px Arial,sans-serif;
  color:#555;
  white-space:nowrap;
  pointer-events:none;
  z-index:10;
`;

legend.innerHTML = `
  <strong>Year</strong>
  ${[BaseYear, ComparisonYear].map((year, index) => `
    <span style="
      display:inline-flex;
      align-items:center;
      gap:6px;
    ">
      <span style="
        display:inline-block;
        width:18px;
        height:10px;
        background:${YearColors[index]};
        border-radius:2px;
      "></span>
      ${year}
    </span>
  `).join("")}
`;

chart.appendChild(legend);
