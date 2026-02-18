/* ============================================================================
  CSCE 679 — Assignment 1 (Hong Kong Temperature Matrix)
  Requirements implemented:
  1) Matrix view: x = year, y = month, each cell = month of a year
  2) Background color encodes monthly max/min temperature (click to toggle)
  3) Tooltip on hover shows date + temperature values
  4) Mini line chart in each cell shows daily temperature changes
  5) Legend shows color-to-value mapping

  Dataset columns (from provided CSV):
  - date (YYYY-MM-DD)
  - max_temperature
  - min_temperature
============================================================================ */

/* =========================
   CONFIG (no magic numbers)
   ========================= */
const CONFIG = {
  // Layout
  margin: { top: 55, right: 140, bottom: 30, left: 90 },
  cell: {
    width: 85,
    height: 58,
    paddingInner: 0.18,   // spacing between cells in each band
    cornerRadius: 4,
    innerPad: 6          // padding inside each cell for mini chart
  },

  // Mini line chart styling (match example: two colored lines)
  lines: {
    maxStroke: "#2ca25f",
    minStroke: "#41b6c4",
    strokeWidth: 1.4,
    minOpacity: 0.9
  },

  // Legend
  legend: { width: 16, height: 240, steps: 30 },

  // Interaction
  transitionMs: 200
};

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

/* =========================
   Data parsing helpers
   ========================= */

// We parse the CSV date string into a real Date object.
// This allows reliable extraction of year/month/day.
const parseDate = d3.timeParse("%Y-%m-%d");

// Column names must match the CSV exactly:
const COLS = {
  date: "date",
  tmax: "max_temperature",
  tmin: "min_temperature"
};

/**
 * Convert one CSV row into a typed JS object.
 * We return null for malformed rows so we can filter them out safely.
 */
function parseRow(row) {
  const d = parseDate(row[COLS.date]);
  if (!d) return null;

  const tmax = +row[COLS.tmax];
  const tmin = +row[COLS.tmin];

  if (!Number.isFinite(tmax) || !Number.isFinite(tmin)) return null;

  return {
    date: d,
    year: d.getFullYear(),
    month: d.getMonth() + 1, // 1..12
    day: d.getDate(),        // 1..31
    tmax,
    tmin
  };
}

/**
 * Keep only the last 10 years of data.
 * We compute the most recent year in the dataset, then keep [maxYear-9, maxYear].
 */
function filterLastTenYears(rows) {
  const maxYear = d3.max(rows, d => d.year);
  const minYear = maxYear - 9;
  return rows.filter(d => d.year >= minYear);
}

/**
 * Convert daily rows into "month cells" (one object per year-month).
 * Each cell stores:
 * - monthlyMax: max of daily tmax
 * - monthlyMin: min of daily tmin
 * - days: sorted daily data for mini chart
 */
function buildMonthCells(dailyRows) {
  const grouped = d3.group(dailyRows, d => d.year, d => d.month);
  const cells = [];

  for (const [year, monthMap] of grouped) {
    for (const [month, days] of monthMap) {
      const sortedDays = days.slice().sort((a, b) => a.day - b.day);

      cells.push({
        year,
        month,
        monthlyMax: d3.max(sortedDays, d => d.tmax),
        monthlyMin: d3.min(sortedDays, d => d.tmin),
        days: sortedDays
      });
    }
  }

  return cells;
}

/* =========================
   Rendering
   ========================= */

/**
 * Render the entire visualization (matrix, mini charts, legend, interactions).
 */
function renderTemperatureMatrix(cells) {
  // Determine year/month domains for the matrix axes.
  const years = d3.sort(Array.from(new Set(cells.map(d => d.year))));
  const months = d3.range(1, 13);

  // Compute SVG size from the number of years/months.
  const width = CONFIG.margin.left + CONFIG.margin.right + years.length * CONFIG.cell.width;
  const height = CONFIG.margin.top + CONFIG.margin.bottom + months.length * CONFIG.cell.height;

  // Create SVG
  const svg = d3.select("#viz")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Band scales position each year/month into a grid layout.
  const x = d3.scaleBand()
    .domain(years)
    .range([CONFIG.margin.left, width - CONFIG.margin.right])
    .paddingInner(CONFIG.cell.paddingInner);

  const y = d3.scaleBand()
    .domain(months)
    .range([CONFIG.margin.top, height - CONFIG.margin.bottom])
    .paddingInner(CONFIG.cell.paddingInner);

  // Color scale:
  // We use a shared domain across both min and max so toggling does not shift the legend.
  const domainMin = d3.min(cells, d => d.monthlyMin);
  const domainMax = d3.max(cells, d => d.monthlyMax);

  const color = d3.scaleSequential()
    .domain([domainMin, domainMax])
    // Similar to example: multi-hue scale from cool to warm
    .interpolator(d3.interpolateSpectral);

  // Tooltip reference
  const tooltip = d3.select("#tooltip");

  // State: background encoding mode (max or min)
  let mode = "max"; // toggles to "min" on click

  const modeLabel = d3.select("#modeLabel");

function updateModeLabel() {
    modeLabel.html(`Background encoding: <b>monthly ${mode}</b> (click chart to toggle)`);
}
updateModeLabel();

  // ----- Draw axis labels (years at top, months at left) -----
  drawYearLabels(svg, years, x);
  drawMonthLabels(svg, months, y);

  // ----- Draw cells: one group per year-month -----
  const cellGroups = svg.append("g")
    .selectAll("g.cell")
    .data(cells, d => `${d.year}-${d.month}`)
    .join("g")
    .attr("class", "cell")
    .attr("transform", d => `translate(${x(d.year)}, ${y(d.month)})`);

  // Background rectangle for each cell (color encodes monthly statistic)
  cellGroups.append("rect")
    .attr("class", "cell-bg")
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("rx", CONFIG.cell.cornerRadius)
    .attr("ry", CONFIG.cell.cornerRadius)
    .attr("stroke", "white")
    .attr("stroke-width", 2)
    .attr("fill", d => color(mode === "max" ? d.monthlyMax : d.monthlyMin))
    .on("mousemove", (event, d) => showTooltip(event, d, mode, tooltip))
    .on("mouseleave", () => hideTooltip(tooltip));

  // Mini line charts inside each cell
  drawMiniCharts(cellGroups, x.bandwidth(), y.bandwidth());

  // Legend (color mapping)
  drawLegend(svg, color, width);

  // Click interaction: toggle background coloring (max <-> min)
  svg.on("click", () => {
    mode = (mode === "max") ? "min" : "max";
    updateModeLabel();

    // Update background fill only (mini charts remain the same)
    cellGroups.select("rect.cell-bg")
      .transition()
      .duration(CONFIG.transitionMs)
      .attr("fill", d => color(mode === "max" ? d.monthlyMax : d.monthlyMin));
  });
}

/**
 * Year labels along the top.
 */
function drawYearLabels(svg, years, x) {
  svg.append("g")
    .selectAll("text")
    .data(years)
    .join("text")
    .attr("x", yr => x(yr) + x.bandwidth() / 2)
    .attr("y", CONFIG.margin.top - 18)
    .attr("text-anchor", "middle")
    .attr("font-size", 12)
    .attr("fill", "#333")
    .text(yr => yr);
}

/**
 * Month labels along the left.
 */
function drawMonthLabels(svg, months, y) {
  svg.append("g")
    .selectAll("text")
    .data(months)
    .join("text")
    .attr("x", CONFIG.margin.left - 12)
    .attr("y", m => y(m) + y.bandwidth() / 2)
    .attr("text-anchor", "end")
    .attr("dominant-baseline", "middle")
    .attr("font-size", 12)
    .attr("fill", "#333")
    .text(m => MONTH_NAMES[m - 1]);
}

/**
 * Draw mini line charts inside each cell.
 * We show two lines: daily min and daily max temperatures within that month.
 */
function drawMiniCharts(cellGroups, cellW, cellH) {
  const innerPad = CONFIG.cell.innerPad;
  const miniW = cellW - 2 * innerPad;
  const miniH = cellH - 2 * innerPad;

  cellGroups.each(function (cell) {
    const g = d3.select(this);
    const days = cell.days;

    // x: day-of-month (1..28/29/30/31)
    const maxDay = d3.max(days, d => d.day);
    const xMini = d3.scaleLinear()
      .domain([1, maxDay])
      .range([innerPad, innerPad + miniW]);

    // y: temperature range in that month (fit both min and max lines)
    const yMini = d3.scaleLinear()
      .domain([
        d3.min(days, d => d.tmin),
        d3.max(days, d => d.tmax)
      ])
      .range([innerPad + miniH, innerPad]);

    // Line generators
    const lineMin = d3.line()
      .x(d => xMini(d.day))
      .y(d => yMini(d.tmin));

    const lineMax = d3.line()
      .x(d => xMini(d.day))
      .y(d => yMini(d.tmax));

    // Draw min line first, then max line on top
    g.append("path")
      .attr("d", lineMin(days))
      .attr("fill", "none")
      .attr("stroke", CONFIG.lines.minStroke)
      .attr("stroke-width", CONFIG.lines.strokeWidth)
      .attr("opacity", CONFIG.lines.minOpacity);

    g.append("path")
      .attr("d", lineMax(days))
      .attr("fill", "none")
      .attr("stroke", CONFIG.lines.maxStroke)
      .attr("stroke-width", CONFIG.lines.strokeWidth);
  });
}

/**
 * Tooltip behavior (hover).
 * Shows "Date: YYYY-MM" and monthly max/min values.
 */
function showTooltip(event, cell, mode, tooltipSel) {
  const monthStr = String(cell.month).padStart(2, "0");

  // This is the temperature value currently encoded by the cell background color.
  const encodedValue = (mode === "max") ? cell.monthlyMax : cell.monthlyMin;

  tooltipSel
    .style("opacity", 1)
    .style("left", (event.offsetX + 14) + "px")
    .style("top", (event.offsetY + 14) + "px")
    .html(
      `<div><b>Date:</b> ${cell.year}-${monthStr}</div>
       <div><b>encoded (${mode}):</b> ${Math.round(encodedValue)}</div>
       <div><b>monthly max:</b> ${Math.round(cell.monthlyMax)}</div>
       <div><b>monthly min:</b> ${Math.round(cell.monthlyMin)}</div>`
    );
}

function hideTooltip(tooltipSel) {
  tooltipSel.style("opacity", 0);
}

/**
 * Legend showing color-to-value mapping.
 * We render a stepped vertical gradient using small rectangles.
 */
function drawLegend(svg, colorScale, svgWidth) {
  const { width, height, steps } = CONFIG.legend;

  const legendX = svgWidth - CONFIG.margin.right + 40;
  const legendY = CONFIG.margin.top;

  const legendG = svg.append("g")
    .attr("transform", `translate(${legendX}, ${legendY})`);

  const [d0, d1] = colorScale.domain();
  const values = d3.range(steps).map(i => d0 + (i / (steps - 1)) * (d1 - d0));

  legendG.selectAll("rect")
    .data(values)
    .join("rect")
    .attr("x", 0)
    .attr("y", (d, i) => (i / steps) * height)
    .attr("width", width)
    .attr("height", height / steps + 1)
    .attr("fill", d => colorScale(d));

  // Axis on the right of the color bar
  const axisScale = d3.scaleLinear()
    .domain([d0, d1])
    .range([height, 0]);

  legendG.append("g")
    .attr("transform", `translate(${width}, 0)`)
    .call(d3.axisRight(axisScale).ticks(5));

  // Label
  legendG.append("text")
    .attr("x", 0)
    .attr("y", -10)
    .attr("font-size", 12)
    .attr("fill", "#333")
    .text("Celsius");
}

/* =========================
   Bootstrapping
   ========================= */

/**
 * Load CSV -> parse -> filter last 10 years -> build month cells -> render.
 */
d3.csv("temperature_daily.csv").then(raw => {
  // Parse and clean
  const parsed = raw.map(parseRow).filter(Boolean);

  // Focus on the last 10 years as required by the assignment
  const lastTen = filterLastTenYears(parsed);

  // Build month-level cells for matrix rendering
  const cells = buildMonthCells(lastTen);

  // Render visualization
  renderTemperatureMatrix(cells);
}).catch(err => {
  // Helpful message if CSV path or parsing fails
  console.error("Failed to load or parse temperature_daily.csv:", err);
});
