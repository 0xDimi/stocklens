import { escape, usd, number, stamp, external } from "./views.mjs";

export function nearestCandle(points, time) {
  return points.reduce(
    (best, point) =>
      !best || Math.abs(point.time - time) < Math.abs(best.time - time)
        ? point
        : best,
    null,
  );
}
export function candleGeometry(points, width = 900, height = 320) {
  const valid = points.filter((p) =>
    [p.time, p.price, p.open, p.high, p.low].every(Number.isFinite),
  );
  if (!valid.length) return { candles: [], width, height };
  const left = 12,
    right = 78,
    top = 18,
    bottom = 65,
    first = valid[0].time,
    last = valid.at(-1).time;
  const low = Math.min(...valid.map((p) => p.low)),
    high = Math.max(...valid.map((p) => p.high));
  const margin = (high - low) * 0.08 || high * 0.002 || 1,
    min = low - margin,
    max = high + margin;
  const plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const x = (time) => left + ((time - first) / (last - first || 1)) * plotWidth;
  const y = (price) => top + ((max - price) / (max - min)) * plotHeight;
  const gaps = valid
    .slice(1)
    .map((p, i) => p.time - valid[i].time)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const interval = gaps[Math.floor(gaps.length / 2)] || 3600000;
  const candleWidth = Math.max(
    1,
    Math.min(12, ((plotWidth * interval) / (last - first || interval)) * 0.62),
  );
  const maxVolume = Math.max(...valid.map((p) => p.volume || 0), 1);
  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    min,
    max,
    first,
    last,
    x,
    y,
    plotWidth,
    plotHeight,
    candles: valid.map((p) => ({
      ...p,
      x: x(p.time),
      highY: y(p.high),
      lowY: y(p.low),
      openY: y(p.open),
      closeY: y(p.price),
      width: candleWidth,
      volumeHeight: (Math.max(0, p.volume || 0) / maxVolume) * 35,
    })),
  };
}
const chartHosts = new WeakMap();
export function mountChart(container, data) {
  const focused =
    document.activeElement === container.querySelector(".candle-chart");
  const retainedWarning =
    container.querySelector(".chart-warning")?.outerHTML || "";
  let host = chartHosts.get(container);
  if (!host) {
    host = { data, size: "" };
    chartHosts.set(container, host);
    new ResizeObserver(() => {
      const svg = container.querySelector(".candle-chart");
      if (!svg) return;
      const size = svg.clientWidth + ":" + svg.clientHeight;
      if (size !== host.size) mountChart(container, host.data);
    }).observe(container);
  }
  host.data = data;
  // Measure the chart's CSS size so the plot fills its panel without stretched lettering.
  const probe = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  probe.classList.add("candle-chart");
  container.append(probe);
  const width = probe.clientWidth || 900,
    height = probe.clientHeight || 320;
  host.size = width + ":" + height;
  const points = data.points || [],
    g = candleGeometry(points, width, height);
  if (!g.candles.length) {
    container.innerHTML =
      '<div class="chart-empty"><strong>No hourly candles available</strong><span>Try another pool or a longer range.</span></div>';
    return;
  }
  const ticks = Array.from(
    { length: 5 },
    (_, i) => g.min + ((g.max - g.min) * i) / 4,
  );
  const candles = g.candles
    .map(
      (c) =>
        `<g class="${c.price >= c.open ? "up" : "down"}"><rect class="volume-bar" x="${c.x - c.width / 2}" y="${g.height - 18 - c.volumeHeight}" width="${c.width}" height="${c.volumeHeight}"/><line x1="${c.x}" x2="${c.x}" y1="${c.highY}" y2="${c.lowY}"/><rect x="${c.x - c.width / 2}" y="${Math.min(c.openY, c.closeY)}" width="${c.width}" height="${Math.max(1, Math.abs(c.openY - c.closeY))}"/></g>`,
    )
    .join("");
  container.innerHTML = `<div class="ohlc-readout" aria-live="off"></div><svg class="candle-chart" viewBox="0 0 ${g.width} ${g.height}" role="img" tabindex="0" aria-label="${escape(data.pool?.symbol)} hourly OHLC in USD per token; use left and right arrows to inspect candles"><g class="chart-grid">${ticks.map((v) => `<line x1="${g.left}" x2="${g.width - g.right}" y1="${g.y(v)}" y2="${g.y(v)}"/><text x="${g.width - g.right + 10}" y="${g.y(v) + 4}">${number(v, v < 1 ? 4 : 2)}</text>`).join("")}</g>${candles}<g class="crosshair" visibility="hidden"><line class="cross-v" y1="${g.top}" y2="${g.height - 14}"/><line class="cross-h" x1="${g.left}" x2="${g.width - g.right}"/><circle r="3"/></g><text class="chart-date" x="${g.left}" y="${g.height - 2}">${escape(stamp(g.first))}</text><text class="chart-date" x="${g.width - g.right}" y="${g.height - 2}" text-anchor="end">${escape(stamp(g.last))}</text></svg><div class="chart-source"><span>${points.length} hourly candles · volume USD · ${external(data.source, "GeckoTerminal")}</span><span>Retrieved ${stamp(data.retrievedAt)}</span></div>`;
  if (retainedWarning)
    container.insertAdjacentHTML("beforeend", retainedWarning);
  const svg = container.querySelector("svg"),
    readout = container.querySelector(".ohlc-readout"),
    cross = container.querySelector(".crosshair");
  if (focused) svg.focus({ preventScroll: true });
  let index = points.length - 1;
  function inspect(point, show = true) {
    const c = g.candles.find((c) => c.time === point.time);
    if (!c) return;
    index = points.indexOf(point);
    readout.innerHTML = `<span>${escape(stamp(c.time))}</span><span>O <b>${usd(c.open)}</b></span><span>H <b>${usd(c.high)}</b></span><span>L <b>${usd(c.low)}</b></span><span>C <b class="${c.price >= c.open ? "positive" : "negative"}">${usd(c.price)}</b></span><span>VOL <b>${number(c.volume, 0)}</b></span>`;
    cross.setAttribute("visibility", show ? "visible" : "hidden");
    const v = cross.querySelector(".cross-v"),
      h = cross.querySelector(".cross-h"),
      dot = cross.querySelector("circle");
    v.setAttribute("x1", c.x);
    v.setAttribute("x2", c.x);
    h.setAttribute("y1", c.closeY);
    h.setAttribute("y2", c.closeY);
    dot.setAttribute("cx", c.x);
    dot.setAttribute("cy", c.closeY);
  }
  inspect(points.at(-1), false);
  svg.addEventListener("pointermove", (e) => {
    const rect = svg.getBoundingClientRect(),
      x = ((e.clientX - rect.left) / rect.width) * g.width;
    inspect(
      nearestCandle(
        points,
        g.first + ((x - g.left) / g.plotWidth) * (g.last - g.first),
      ),
    );
  });
  svg.addEventListener("pointerleave", () => inspect(points.at(-1), false));
  svg.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    index =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? points.length - 1
          : Math.max(
              0,
              Math.min(
                points.length - 1,
                index + (e.key === "ArrowLeft" ? -1 : 1),
              ),
            );
    inspect(points[index]);
  });
}
