/**
 * Available Columns:
 * "latitude"
 * "longitude"
 * "store"
 * "city"
 * "county"
 * "state"
 * "Total sales"
 * "Measure names" // If 'measureValues' is enabled.
 * "Measure values" // If 'measureValues' is enabled.
 * --- END --- 
 */

const { muze, getDataFromSearchQuery } = viz;

const Fields = {
  store: "store",
  city: "city",
  county: "county",
  state: "state",
  lat: "latitude",
  lon: "longitude",
  sales: "Total sales"
};

const BubbleColor = "#365D47";
const MapColor = "#E5E7E2";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

// Geographic Dependencies
const [d3, topojson, atlas] = await Promise.all([
  import("https://cdn.jsdelivr.net/npm/d3-geo@3/+esm"),
  import("https://cdn.jsdelivr.net/npm/topojson-client@3/+esm"),
  import("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json/+esm")
]);

const states = topojson.feature(
  atlas.default,
  atlas.default.objects.states
);

// Read Original ThoughtSpot Data
const source = await getDataFromSearchQuery();

const readField = (name, required = true) => {
  const field = source.getField(name);

  if (!field) {
    if (required) {
      throw new Error(`Missing ThoughtSpot field: ${name}`);
    }
    return null;
  }

  return field.data().map(value =>
    muze.DataStore.isInvalid(value) ? null : value
  );
};

const names = readField(Fields.store);
const latitudes = readField(Fields.lat);
const longitudes = readField(Fields.lon);
const salesValues = readField(Fields.sales);

const cities = readField(Fields.city, false);
const counties = readField(Fields.county, false);
const stateNames = readField(Fields.state, false);

const numeric = value =>
  value == null || value === "" ? NaN : Number(value);

// Prepare Store Locations
const stores = names.map((name, i) => ({
  id: String(i),
  store: String(name ?? "").trim(),
  city: String(cities?.[i] ?? "").trim(),
  county: String(counties?.[i] ?? "").trim(),
  state: String(stateNames?.[i] ?? "").trim(),
  lat: numeric(latitudes[i]),
  lon: numeric(longitudes[i]),
  sales: numeric(salesValues[i])
})).filter(store =>
  store.store &&
  Number.isFinite(store.lat) &&
  Number.isFinite(store.lon) &&
  Number.isFinite(store.sales) &&
  store.sales >= 0 &&
  store.lat >= -85 &&
  store.lat <= 85 &&
  store.lon >= -180 &&
  store.lon <= 180
).sort((a, b) => b.sales - a.sales);

if (!stores.length) {
  throw new Error("No valid store locations found.");
}

const storesById = new Map(
  stores.map(store => [store.id, store])
);

// Geographic Frame
const [[west, south], [east, north]] = d3.geoBounds({
  type: "MultiPoint",
  coordinates: stores.map(store => [
    store.lon,
    store.lat
  ])
});

const geographicFrame = {
  type: "Polygon",
  coordinates: [[
    [west - 1, south - 1],
    [west - 1, north + 1],
    [east + 1, north + 1],
    [east + 1, south - 1],
    [west - 1, south - 1]
  ]]
};

// Chart Container
const chart = document.querySelector("#chart");

if (!chart) {
  throw new Error("Chart container not found.");
}

chart.__geoCleanup?.();

chart.style.cssText = `
  position:relative;
  width:100%;
  height:100%;
  min-height:400px;
  background:#FFFFFF;
  overflow:hidden;
  box-sizing:border-box;
`;

const map = document.createElement("div");

map.style.cssText = `
  position:relative;
  width:100%;
  height:100%;
  min-height:400px;
`;

const basemap = document.createElementNS(
  "http://www.w3.org/2000/svg",
  "svg"
);

basemap.style.cssText = `
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  pointer-events:none;
`;

const plot = document.createElement("div");
plot.id = "geo-bubble-plot";

plot.style.cssText = `
  position:relative;
  width:100%;
  height:100%;
`;

map.append(basemap, plot);
chart.replaceChildren(map);

// Muze Lifecycle
let currentCanvas = null;
let currentModel = null;
let lastWidth = 0;
let lastHeight = 0;

const renderMap = () => {
  const W = plot.clientWidth;
  const H = plot.clientHeight;

  if (!W || !H) return;
  if (W === lastWidth && H === lastHeight) return;

  lastWidth = W;
  lastHeight = H;

  currentCanvas?.dispose();
  currentModel?.dispose();

  currentCanvas = null;
  currentModel = null;

  basemap.replaceChildren();
  plot.replaceChildren();

  // Project Store Coordinates
  const padding = Math.min(W, H) * 0.08;

  const projection = d3.geoMercator().fitExtent(
    [
      [padding, padding],
      [W - padding, H - padding]
    ],
    geographicFrame
  );

  const projected = stores.map(store => {
    const [x, y] = projection([
      store.lon,
      store.lat
    ]);

    return {
      StoreID: store.id,
      x,
      y: H - y,
      Sales: store.sales
    };
  });

  // Projected Muze DataModel
  const model = new muze.DataModel(
    muze.DataModel.loadDataSync(
      projected,
      [
        { name: "StoreID", type: "dimension" },
        { name: "x", type: "measure" },
        { name: "y", type: "measure" },
        { name: "Sales", type: "measure" }
      ]
    )
  );

  currentModel = model;

  // Native Muze Bubble Layer
  const canvas = muze.canvas()
    .columns(["x"])
    .rows(["y"])
    .detail(["StoreID"])
    .size("Sales")

    .layers([
      {
        mark: "point",
        encoding: {
          color: { value: () => BubbleColor },
          opacity: { value: () => 0.9 },
          stroke: { value: () => "#FFFFFF" },
          "stroke-width": { value: () => 1 }
        }
      }
    ])

    .width(W)
    .height(H)

    .config({
      autoGroupBy: { disabled: true },

      columns: {
        headers: { show: false }
      },

      rows: {
        headers: { show: false }
      },

      axes: {
        x: {
          show: false,
          showAxisLine: false,
          domain: [0, W],
          nice: false
        },

        y: {
          show: false,
          showAxisLine: false,
          domain: [0, H],
          nice: false
        }
      },

      gridLines: {
        x: { show: false },
        y: { show: false }
      },

      border: {
        width: 0,
        showValueBorders: {
          left: false,
          bottom: false
        }
      },

      legend: {
        show: false,
        size: { range: [4, 13] }
      },

      interaction: {
        tooltip: {
          formatter: ({ dataModel }) => {
            const id = dataModel
              ?.getField("StoreID")
              ?.data()[0];

            const store = storesById.get(String(id));

            if (!store) return [];

            const location = [
              store.city,
              store.state
            ].filter(Boolean).join(", ");

            const locationRows = [
              location
                ? `<span>${escapeHTML(location)}</span>`
                : "",
              store.county
                ? `<span>County: ${escapeHTML(store.county)}</span>`
                : "",
              `<span>Sales: ${USD.format(store.sales)}</span>`
            ].filter(Boolean).join("");

            return muze.Operators.html`
              <div style="
                display:flex;
                flex-direction:column;
                gap:4px;
                padding:9px 12px;
                background:#2F2F2F;
                color:#FFFFFF;
                border-radius:4px;
                font:12px Arial,sans-serif;
                line-height:1.5;
                min-width:120px;
              ">
                <strong>${escapeHTML(store.store)}</strong>
                ${locationRows}
              </div>
            `;
          }
        }
      }
    })

    .data(model)
    .mount("#geo-bubble-plot");

  currentCanvas = canvas;

  // Align D3 Basemap to Muze Plot Area
  canvas.once("animationEnd", () => {
    if (currentCanvas !== canvas) return;

    const pointSvg = plot.querySelector(
      ".muze-layer-point"
    )?.ownerSVGElement;

    if (!pointSvg) return;

    const svgRect = pointSvg.getBoundingClientRect();
    const plotRect = plot.getBoundingClientRect();

    const xAxis = canvas.xAxes().flat(2)[0];
    const yAxis = canvas.yAxes().flat(2)[0];

    if (!xAxis || !yAxis) return;

    const toAxes = d3.geoTransform({
      point(x, y) {
        this.stream.point(
          xAxis.getScaleValue(x),
          yAxis.getScaleValue(H - y)
        );
      }
    });

    const path = d3.geoPath({
      stream: stream =>
        projection.stream(toAxes.stream(stream))
    });

    const dx = svgRect.left - plotRect.left;
    const dy = svgRect.top - plotRect.top;

    basemap.setAttribute("width", W);
    basemap.setAttribute("height", H);

    const statePath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path"
    );

    statePath.setAttribute(
      "transform",
      `translate(${dx},${dy})`
    );

    statePath.setAttribute("d", path(states) || "");
    statePath.setAttribute("fill", MapColor);
    statePath.setAttribute("stroke", "#C5C8BE");
    statePath.setAttribute("stroke-width", "0.8");
    statePath.setAttribute("stroke-linejoin", "round");

    basemap.appendChild(statePath);
  });
};

// Escape Text for Custom Tooltip
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// Render and Resize
renderMap();

const observer = new ResizeObserver(() => {
  if (chart.isConnected) renderMap();
});

observer.observe(map);

chart.__geoCleanup = () => {
  observer.disconnect();
  currentCanvas?.dispose();
  currentModel?.dispose();
};

viz.events?.emitRenderCompletedEvent?.();