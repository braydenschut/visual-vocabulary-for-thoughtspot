/**
 * Available Columns:
 * "item type"
 * "Total quantity purchased"
 * "Total sales"
 * "Sales per Unit"
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

const ItemField = "item type";
const SalesField = "Total sales";
const QuantityField = "Total quantity purchased";
const AverageField = "Sales per Unit";

const BubbleColor = "#957247";
const TopN = 10;

setGlobalOptions({
  displayAs: {
    columns: {
      [ItemField]: "Item Type",
      [SalesField]: "Sales",
      [QuantityField]: "Quantity Purchased",
      [AverageField]: "Sales per Unit"
    }
  }
});

// Axis Formatters
const currencyAxis = new NumberFormatter("currency", {
  currency: "USD",
  unit: "auto",
  decimalDigits: 0
});

const quantityAxis = new NumberFormatter("decimal", {
  unit: "auto",
  decimalDigits: 0
});

// Tooltip Formatters
const tooltipCurrency = new NumberFormatter("currency", {
  currency: "USD",
  unit: "none",
  decimalDigits: 0
});

const tooltipNumber = new NumberFormatter("decimal", {
  unit: "none",
  decimalDigits: 0
});

// Read Original ThoughtSpot DataModel
const source = await getDataFromSearchQuery();

for (const field of [
  ItemField,
  SalesField,
  QuantityField,
  AverageField
]) {
  if (!source.getField(field)) {
    throw new Error(`Missing Search field: ${field}`);
  }
}

// Read Sales and Item Type for Top 10 selection
const items = source.getField(ItemField).data();
const sales = source.getField(SalesField).data();
const quantities = source.getField(QuantityField).data();

const totals = new Map();

items.forEach((value, i) => {
  const item = String(value ?? "").trim();
  const amount = Number(sales[i]);
  const quantity = Number(quantities[i]);

  if (
    !item ||
    muze.DataStore.isInvalid(value) ||
    muze.DataStore.isInvalid(sales[i]) ||
    muze.DataStore.isInvalid(quantities[i]) ||
    !Number.isFinite(amount) ||
    !Number.isFinite(quantity)
  ) return;

  const current = totals.get(item) || {
    sales: 0,
    quantity: 0
  };

  current.sales += amount;
  current.quantity += quantity;

  totals.set(item, current);
});

// Select Top 10 Item Types by Sales
const topItems = [...totals]
  .filter(([, values]) =>
    values.sales > 0 && values.quantity > 0
  )
  .sort((a, b) =>
    b[1].sales - a[1].sales ||
    a[0].localeCompare(b[0])
  )
  .slice(0, TopN)
  .map(([item]) => item);

if (!topItems.length) {
  throw new Error("No valid Item Types found.");
}

// Filter Original DataModel
const data = source.select({
  operator: muze.DataModel.LogicalOperators.OR,
  conditions: topItems.map(item => ({
    field: ItemField,
    value: item,
    operator: muze.DataModel.ComparisonOperators.EQUAL
  }))
});

// Bubble Chart
muze
  .canvas()
  .columns([SalesField])
  .rows([QuantityField])
  .detail([ItemField])
  .size(AverageField)

  .layers([
    {
      mark: "point",
      interactive: true,
      encoding: {
        color: { value: () => BubbleColor },
        opacity: { value: () => 0.65 }
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
        name: "Sales",
        domain: [0, null],
        numberOfTicks: 5,
        tickFormat: currencyAxis.formatterFunc()
      },

      y: {
        name: "Quantity Purchased",
        domain: [0, null],
        numberOfTicks: 5,
        tickFormat: quantityAxis.formatterFunc()
      }
    },

    gridLines: {
      x: { show: true },
      y: { show: true }
    },

    legend: {
  color: { show: false },
  size: {
    show: true,
    title: { text: "Sales per Unit" },
    item: {
      text: {
        formatter: value => {
          const raw = value?.rawValue ?? value;
          const number = Number(raw);

          return Number.isFinite(number)
            ? new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                notation: "compact",
                maximumFractionDigits: 0
              }).format(number)
            : String(raw ?? "");
        }
      }
    }
  }
    },

    interaction: {
      tooltip: {
        fieldFormatters: {
          [SalesField]: tooltipCurrency.formatterFunc(),
          [QuantityField]: tooltipNumber.formatterFunc(),
          [AverageField]: tooltipCurrency.formatterFunc()
        }
      }
    }
  })

  .data(data)
  .mount("#chart");