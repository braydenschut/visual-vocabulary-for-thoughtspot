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

const YearField = "Year(date)";
const RegionField = "region";
const SalesField = "Total sales";

const Palette = [
  "#176B46", "#269039", "#57AC65",
  "#91CB93", "#C2E4BE", "#75B6A1",
  "#3F856D"
];

const salesFormatter = new Intl.NumberFormat("en-US", {
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

const parseYear = value => {
  const raw = cellValue(value);

  if (raw instanceof Date) {
    return raw.getUTCFullYear();
  }

  const number = Number(raw);

  if (Number.isInteger(number) && number >= 1900 && number <= 2100) {
    return number;
  }

  const match = String(raw ?? "").match(/\b(?:19|20)\d{2}\b/);
  if (match) return Number(match[0]);

  const date = new Date(
    Number.isFinite(number) && Math.abs(number) >= 1e9
      ? Math.abs(number) < 1e11
        ? number * 1000
        : number
      : raw
  );

  return Number.isNaN(date.getTime())
    ? null
    : date.getUTCFullYear();
};

const formatYear = value => String(parseYear(value) ?? "");

// Original ThoughtSpot Data
const source = await getDataFromSearchQuery();
const result = source.getData();
const schema = result.schema || source.getSchema();

const fieldIndex = name => schema.findIndex(
  field => field.name === name || field.displayName === name
);

const yearIndex = fieldIndex(YearField);
const regionIndex = fieldIndex(RegionField);
const salesIndex = fieldIndex(SalesField);

if ([yearIndex, regionIndex, salesIndex].includes(-1)) {
  throw new Error(
    "Search requires Year(date), region, and Total sales."
  );
}

// Aggregate Sales by Year and Region
const salesByYear = new Map();
const regions = new Set();

for (const row of result.data || []) {
  const year = parseYear(row[yearIndex]);
  const region = String(cellValue(row[regionIndex]) ?? "").trim();
  const rawSales = cellValue(row[salesIndex]);
  const sales = rawSales == null || rawSales === ""
    ? NaN
    : Number(rawSales);

  if (!year || !region || !Number.isFinite(sales)) continue;

  if (sales < 0) {
    throw new Error("Streamgraph requires nonnegative Sales.");
  }

  if (!salesByYear.has(year)) {
    salesByYear.set(year, new Map());
  }

  const values = salesByYear.get(year);

  values.set(region, (values.get(region) || 0) + sales);
  regions.add(region);
}

const orderedYears = [...salesByYear.keys()].sort((a, b) => a - b);
const orderedRegions = [...regions].sort((a, b) => a.localeCompare(b));

if (orderedYears.length < 2 || !orderedRegions.length) {
  throw new Error("Streamgraph requires at least two years and one Region.");
}

// Calculate Centered Stream Boundaries
const boundaries = new Map();
let maximumTotal = 0;

const keyFor = (year, region) =>
  JSON.stringify([year, region]);

for (const year of orderedYears) {
  const values = salesByYear.get(year);

  const total = orderedRegions.reduce(
    (sum, region) => sum + (values.get(region) || 0),
    0
  );

  maximumTotal = Math.max(maximumTotal, total);

  let position = -total / 2;

  for (const region of orderedRegions) {
    const sales = values.get(region) || 0;
    const bottom = position;

    position += sales;

    boundaries.set(keyFor(year, region), {
      bottom,
      top: position,
      sales
    });
  }
}

if (maximumTotal <= 0) {
  throw new Error("No positive Sales values found.");
}

// Create Source-Derived Boundary Measures
let data = source;

const regionLayers = orderedRegions.map((region, index) => ({
  region,
  color: Palette[index % Palette.length],
  bottomField: `Stream Bottom ${index + 1}`,
  topField: `Stream Top ${index + 1}`
}));

for (const layer of regionLayers) {
  for (const [field, property] of [
    [layer.bottomField, "bottom"],
    [layer.topField, "top"]
  ]) {
    data = data.calculateVariable(
      {
        name: field,
        type: "measure",
        defAggFn: "min"
      },
      [YearField, RegionField],
      (year, region) =>
        boundaries.get(
          keyFor(parseYear(year), String(cellValue(region) ?? "").trim())
        )?.[property] ?? null
    );
  }
}

setGlobalOptions({
  displayAs: {
    columns: {
      [YearField]: "Year",
      [RegionField]: "Region",
      [SalesField]: "Sales",
      ...Object.fromEntries(
        regionLayers.flatMap(layer => [
          [layer.bottomField, `${layer.region} Lower Boundary`],
          [layer.topField, `${layer.region} Upper Boundary`]
        ])
      )
    }
  }
});

// Create Region-Specific Area Layers
const layers = regionLayers.map(layer => ({
  mark: "area",
  name: `stream-${layer.region}`,

  source: dm => dm.select({
    operator: muze.DataModel.LogicalOperators.OR,
    conditions: [{
      field: RegionField,
      value: layer.region,
      operator: muze.DataModel.ComparisonOperators.EQUAL
    }]
  }),

  encoding: {
    x: YearField,
    y: layer.topField,
    y0: layer.bottomField,
    color: { value: () => layer.color }
  },

  transform: { type: "identity" },
  interpolate: "linear"
}));

// Custom Tooltip: Show Actual Regional Sales

const html = muze.Operators.html;

const tooltipFormatter = dataStore => {
  const dm = dataStore?.dataModel;
  const rows = dm?.getData()?.data || [];

  if (!dm || !rows.length) {
    return html`<div>Regional Sales</div>`;
  }

  const getValue = (row, field) => {
    const index = dm.getFieldIndex(field);
    return index >= 0 ? cellValue(row[index]) : null;
  };

  let year = null;
  let region = "";

  for (const row of rows) {
    const currentYear = parseYear(
      getValue(row, YearField)
    );

    let currentRegion = String(
      getValue(row, RegionField) ?? ""
    ).trim();

    if (!currentRegion) {
      const layer = regionLayers.find(layer => {
        const value = getValue(row, layer.topField);
        return value != null && Number.isFinite(Number(value));
      });

      currentRegion = layer?.region ?? "";
    }

    if (currentYear != null && currentRegion) {
      year = currentYear;
      region = currentRegion;
      break;
    }
  }

  const sales = boundaries.get(
    keyFor(year, region)
  )?.sales;

  const displayYear = year ?? "—";
  const displayRegion = region || "—";
  const displaySales = sales == null
    ? "—"
    : salesFormatter.format(sales);

  return html`
    <div style="
      background:#454954;
      color:#FFFFFF;
      padding:12px 16px;
      border-radius:4px;
      font:11px Arial,sans-serif;
      min-width:220px;
    ">
      <div style="
        display:flex;
        justify-content:space-between;
        gap:24px;
        margin-bottom:9px;
      ">
        <span>Year</span>
        <strong>${displayYear}</strong>
      </div>

      <div style="
        display:flex;
        justify-content:space-between;
        gap:24px;
        margin-bottom:9px;
      ">
        <span>Region</span>
        <strong>${displayRegion}</strong>
      </div>

      <div style="
        display:flex;
        justify-content:space-between;
        gap:24px;
      ">
        <span>Sales</span>
        <strong>${displaySales}</strong>
      </div>
    </div>
  `;
};

// Native Muze Streamgraph
muze
  .canvas()

  .columns([YearField])

  .rows([
    muze.Operators.share(
      ...regionLayers.flatMap(layer => [
        layer.bottomField,
        layer.topField
      ])
    )
  ])

  .detail([RegionField])
  .title(" ")

  .layers(layers)

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
        name: "Year",
        numberOfTicks: orderedYears.length,
        tickFormat: formatYear
      },

      y: {
        name: "Regional Sales Composition",
        domain: [
          -maximumTotal * 0.55,
          maximumTotal * 0.55
        ],
        nice: false,
        numberOfTicks: 5,
        tickFormat: () => ""
      }
    },

    gridLines: {
      x: { show: false },
      y: { show: false }
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

// Centered Region Legend
const chart = document.querySelector("#chart");
const parent = chart?.parentElement;

if (parent) {
  parent.style.position = "relative";
  parent.querySelector("#streamgraph-legend")?.remove();

  const legend = document.createElement("div");
  legend.id = "streamgraph-legend";

  legend.style.cssText = `
    position:absolute;
    top:10px;
    left:50%;
    transform:translateX(-50%);
    z-index:10;
    display:flex;
    flex-wrap:wrap;
    align-items:center;
    justify-content:center;
    gap:10px 16px;
    max-width:calc(100% - 20px);
    padding:6px 10px;
    background:rgba(255,255,255,.95);
    border-radius:4px;
    font:12px Arial,sans-serif;
    color:#555;
    pointer-events:none;
  `;

  const title = document.createElement("strong");
  title.textContent = "Region";
  legend.appendChild(title);

  for (const layer of regionLayers) {
    const item = document.createElement("span");
    item.style.cssText = `
      display:inline-flex;
      align-items:center;
      gap:6px;
      white-space:nowrap;
    `;

    const swatch = document.createElement("span");
    swatch.style.cssText = `
      width:12px;
      height:12px;
      border-radius:2px;
      background:${layer.color};
    `;

    const label = document.createElement("span");
    label.textContent = layer.region;

    item.append(swatch, label);
    legend.appendChild(item);
  }

  parent.appendChild(legend);
}