/* ==========================================================================
   ANALYTICS PAGE
   One date-range control drives the whole page. All 365 days are embedded
   as json_script ("analytics-data") and sliced client-side, so switching
   7D / 30D / 90D / 12M never reloads: every number counts to its new value,
   charts morph, bars resize and rows re-sort with FLIP.

   Pattern used for every widget:
     render(first)
       first === true  -> write data-countup / data-progress / data-sparkline
                          attributes. Nimbus.init() (runs right after this
                          script) wires them up, so the first paint uses the
                          standard reveal-synced animations.
       first === false -> animate from the current value with the JS API
                          (Nimbus.countTo, setProgress, chart.update, flip).

   House rules followed here (see docs/CONVENTIONS.md):
     * every number carries its unit ("37,308 visits · 31.2%")
     * every percentage has exactly 1 decimal, deltas are relative % change
     * no icons, straight chart lines, brand palette only (t.series)
     * motion is ease-out, no overshoot, no loops
   ========================================================================== */
(function () {
  "use strict";
  const N = window.Nimbus;
  const dataEl = document.getElementById("analytics-data");
  if (!dataEl) return;
  const D = JSON.parse(dataEl.textContent);
  const n = D.dates.length;
  const dates = D.dates.map((d) => new Date(d + "T00:00:00"));

  /* ---- Formatting ------------------------------------------------------- */
  const fmtDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const fmtDayYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtWeekday = new Intl.DateTimeFormat("en-US", { weekday: "short" });
  const fmtLong = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const fmtMonth = new Intl.DateTimeFormat("en-US", { month: "short" });
  const fmtMonthYear = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
  const int = (v) => Math.round(v).toLocaleString("en-US");
  const money = (v) => "$" + Math.round(v).toLocaleString("en-US");
  const pct1 = (v) => v.toFixed(1) + "%";                       // THE percentage format
  const signed = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + "%";
  const compact = (v) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
  const duration = (s) => Math.floor(s / 60) + "m " + String(Math.round(s % 60)).padStart(2, "0") + "s";
  const sum = (arr, a = 0, b = arr.length) => { let t = 0; for (let i = a; i < b; i++) t += arr[i]; return t; };
  const pct = (a, b) => (b ? ((a - b) / b) * 100 : 0);
  /** Deterministic pseudo-random in [-1, 1] - invented per-range variation. */
  const jit = (seed, i) => { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
  const range = (a, b) => fmtDay.format(dates[a]) + " – " + fmtDay.format(dates[b - 1]);
  const hourName = (h) => (h % 12 || 12) + (h < 12 ? "am" : "pm");
  const hourSpan = (h) => hourName(h) + "–" + hourName((h + 1) % 24);
  const UPDATE_MS = 500; // value tweens on range change

  /* ---- Buckets: [start, end) index pairs, aligned to the most recent day -- */
  function dailyBuckets(a, b) { const out = []; for (let i = a; i < b; i++) out.push([i, i + 1]); return out; }
  function weeklyBuckets(a, b) {
    const out = [];
    for (let end = b; end > a; end -= 7) out.unshift([Math.max(a, end - 7), end]);
    return out;
  }
  function monthlyBuckets(a, b) {
    const out = [];
    let start = a;
    for (let i = a + 1; i <= b; i++) {
      if (i === b || dates[i].getMonth() !== dates[start].getMonth()) { out.push([start, i]); start = i; }
    }
    return out;
  }

  /* ---- Slice everything for a range (days) ------------------------------ */
  const SEEDS = { 7: 1, 30: 2, 90: 3, 365: 4 };
  function compute(days) {
    const a = Math.max(0, n - days), b = n;
    const year = days >= 365;
    // Comparison windows. 12M has no full previous year, so compare halves.
    const cA = year ? n - 182 : a, pA = year ? n - 364 : Math.max(0, a - days), pB = year ? n - 182 : a;
    const seed = SEEDS[days] || 9;

    const tot = (k, x = a, y = b) => sum(D[k], x, y);
    const visitors = tot("visitors"), signups = tot("signups"), orders = tot("orders"), revenue = tot("revenue");
    const cur = (k) => tot(k, cA, b), prev = (k) => tot(k, pA, pB);
    const conv = (x, y) => (sum(D.visitors, x, y) ? (sum(D.orders, x, y) / sum(D.visitors, x, y)) * 100 : 0);

    // KPI cards (order: revenue, visitors, signups, conversion rate)
    const sparkB = days <= 7 ? dailyBuckets(a, b) : days <= 30 ? dailyBuckets(b - 16, b) : days <= 90 ? weeklyBuckets(a, b) : monthlyBuckets(a, b).slice(-12);
    const spark = (k) => sparkB.map(([x, y]) => sum(D[k], x, y) / (y - x));
    const kpis = [
      { value: revenue, change: pct(cur("revenue"), prev("revenue")), spark: spark("revenue") },
      { value: visitors, change: pct(cur("visitors"), prev("visitors")), spark: spark("visitors") },
      { value: signups, change: pct(cur("signups"), prev("signups")), spark: spark("signups") },
      { value: conv(a, b), change: pct(conv(cA, b), conv(pA, pB)), spark: sparkB.map(([x, y]) => conv(x, y)) },
    ];

    // Traffic line chart: daily, or weekly averages for 12M.
    const tB = year ? weeklyBuckets(a, b) : dailyBuckets(a, b);
    const avg = (k, x, y) => sum(D[k], x, y) / (y - x);
    const traffic = {
      labels: tB.map(([x]) => (days <= 7 ? fmtWeekday.format(dates[x]) : year ? fmtMonth.format(dates[x]) : fmtDay.format(dates[x]))),
      titles: tB.map(([x, y]) => (y - x === 1 ? fmtLong.format(dates[x]) : "Week of " + range(x, y) + " (daily average)")),
      visitors: tB.map(([x, y]) => Math.round(avg("visitors", x, y))),
      signups: tB.map(([x, y]) => Math.round(avg("signups", x, y))),
      orders: tB.map(([x, y]) => Math.round(avg("orders", x, y))),
    };
    let peakI = a;
    for (let i = a; i < b; i++) if (D.visitors[i] > D.visitors[peakI]) peakI = i;
    const sessionAvg = sum(D.session.slice(a, b).map((s, i) => s * D.visitors[a + i])) / visitors;
    const bounceAvg = sum(D.bounce.slice(a, b).map((s, i) => s * D.visitors[a + i])) / visitors;

    // Revenue bars: daily up to 30D, weekly for 90D, calendar months for 12M.
    const rB = days <= 30 ? dailyBuckets(a, b) : days <= 90 ? weeklyBuckets(a, b) : monthlyBuckets(a, b);
    const rev = {
      labels: rB.map(([x]) => (days <= 7 ? fmtWeekday.format(dates[x]) : year ? fmtMonth.format(dates[x]) : fmtDay.format(dates[x]))),
      titles: rB.map(([x, y]) => (y - x === 1 ? fmtLong.format(dates[x]) : year ? fmtMonthYear.format(dates[x]) + (y - x < 28 ? " (" + (y - x) + " days)" : "") : range(x, y))),
      revenue: rB.map(([x, y]) => sum(D.revenue, x, y)),
      orders: rB.map(([x, y]) => sum(D.orders, x, y)),
    };

    // Funnel
    const trials = tot("trials"), paid = tot("paid");
    const funnel = [visitors, signups, trials, paid];
    const paidRate = (x, y) => (sum(D.visitors, x, y) ? (sum(D.paid, x, y) / sum(D.visitors, x, y)) * 100 : 0);

    // Channels: visitors per channel and their share of all visits.
    const channels = D.channels.map((c) => {
      const v = sum(c.daily, a, b);
      return { label: c.label, visitors: v, share: visitors ? (v / visitors) * 100 : 0 };
    });

    // Traffic by hour: average weekday / weekend day in range x hourly profile.
    let wkTot = 0, wkCnt = 0, weTot = 0, weCnt = 0;
    for (let i = a; i < b; i++) {
      const weekend = dates[i].getDay() % 6 === 0;
      if (weekend) { weTot += D.visitors[i]; weCnt++; } else { wkTot += D.visitors[i]; wkCnt++; }
    }
    const profile = (p, dayAvg, s) => { const t = sum(p); return p.map((w, h) => Math.round((dayAvg * w / t) * (1 + 0.05 * jit(s, h)))); };
    const hours = {
      weekday: profile(D.hourly.weekday, wkCnt ? wkTot / wkCnt : 0, seed),
      weekend: profile(D.hourly.weekend, weCnt ? weTot / weCnt : (wkCnt ? wkTot / wkCnt : 0) * 0.7, seed + 11),
    };

    // Countries & pages (invented split, varies a little per range)
    const countries = D.countries.map((c, i) => ({ ...c, visitors: visitors * c.share * (1 + 0.22 * jit(seed + 7, i)) }));
    const vC = sum(D.visitors, cA, b), vP = sum(D.visitors, pA, pB);
    const pages = D.pages.map((p, i) => {
      const views = visitors * p.share * 1.85 * (1 + 0.18 * jit(seed, i));
      const now = vC * p.share * (1 + 0.18 * jit(seed + 20, i)), before = vP * p.share * (1 + 0.18 * jit(seed + 30, i));
      return { ...p, views, time: p.time * (1 + 0.12 * jit(seed + 3, i)), bounce: p.bounce * (1 + 0.1 * jit(seed + 5, i)), change: pct(now, before) };
    });

    return {
      days, a, b, year,
      label: year ? "Last 12 months" : "Last " + days + " days", // no dates in the range label
      kpis, traffic, rev, funnel, channels, hours, countries, pages,
      avgVisitors: visitors / (b - a), peak: D.visitors[peakI], peakDate: fmtDay.format(dates[peakI]),
      bounce: bounceAvg, session: sessionAvg,
      revenue, orders, aov: orders ? revenue / orders : 0, revChange: pct(cur("revenue"), prev("revenue")),
      paidRate: paidRate(a, b), paidChange: pct(paidRate(cA, b), paidRate(pA, pB)),
    };
  }

  /* ---- Small animation helpers (page-local) ------------------------------ */
  /* Numbers and bars count / fill in when they scroll into view (synced
     with their card's reveal). The target is read at that moment, so a range
     switch before the widget was ever visible still lands on the right
     value (the stock data-countup / data-progress would capture the old one). */
  function setNumber(el, value, first) {
    if (!el) return;
    el._anTarget = value;
    if (first) {
      el.removeAttribute("data-countup");
      el.textContent = (el.dataset.prefix || "") + (0).toFixed(+el.dataset.decimals || 0) + (el.dataset.suffix || "");
      N.onVisible(el, () => setTimeout(() => {
        el._anShown = true;
        N.countTo(el, el._anTarget);
      }, N.revealDelay(el) + 60));
      return;
    }
    if (el._anShown) N.countTo(el, value, { duration: UPDATE_MS });
  }
  function setBar(el, value, first, delay = 0) {
    el._anTarget = value;
    if (first) {
      el.removeAttribute("data-progress");
      el.setAttribute("role", "progressbar");
      el.setAttribute("aria-valuemin", "0");
      el.setAttribute("aria-valuemax", "100");
      N.onVisible(el, () => {
        el.style.setProperty("--progress-delay", N.revealDelay(el) + 80 + delay + "ms");
        requestAnimationFrame(() => { el._anShown = true; N.setProgress(el, el._anTarget); });
      });
      return;
    }
    if (!el._anShown) return;
    el.style.setProperty("--progress-delay", delay + "ms");
    N.setProgress(el, value);
  }
  /** Delta text: relative % change, 1 decimal, sign shows the direction. */
  function setTrend(el, change) {
    el.classList.toggle("trend--up", change >= 0);
    el.classList.toggle("trend--down", change < 0);
    el.textContent = signed(change);
  }
  /** Tween a number rendered by a custom formatter (e.g. "1m 34s"). */
  function tweenText(el, to, format, first) {
    const from = el._v != null ? el._v : 0;
    el._v = to;
    cancelAnimationFrame(el._raf);
    if (first || N.reducedMotion) { el.textContent = format(to); return; }
    let start = null;
    const tick = (now) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / UPDATE_MS);
      el.textContent = format(from + (to - from) * N.ease.outExpo(t));
      if (t < 1) el._raf = requestAnimationFrame(tick);
    };
    el._raf = requestAnimationFrame(tick);
  }
  /** Quick fade-out / fade-in text swap (for labels that can't count). */
  function swapText(el, text, first) {
    if (!el || el.textContent === text) return;
    if (first) { el.textContent = text; return; }
    const out = N.animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: N.easing.in, fill: "forwards" });
    out.finished.then(() => {
      el.textContent = text;
      out.cancel();
      N.animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: N.ms("--dur-base"), easing: N.easing.outQuart });
    });
  }

  /* ---- Initial range: ?range=7|30|90|12m (shareable) --------------------- */
  const tabs = document.querySelector("[data-range-tabs]");
  const param = new URLSearchParams(location.search).get("range");
  let days = { "7": 7, "30": 30, "90": 90, "12m": 365, "365": 365 }[param] || 30;
  tabs.querySelectorAll("[data-tab]").forEach((t) => t.classList.toggle("is-active", +t.dataset.tab === days));
  let S = compute(days);

  /* ---- Toolbar label ----------------------------------------------------- */
  const labelEl = document.querySelector("[data-range-label]");
  const renderLabel = (first) => swapText(labelEl, S.label, first);

  /* ---- KPI cards ------------------------------------------------------- */
  const kpiCards = Array.from(document.querySelectorAll("[data-kpi]"));
  function renderKpis(first) {
    kpiCards.forEach((card, i) => {
      const k = S.kpis[i];
      if (!k) return;
      setNumber(card.querySelector("[data-kpi-value]"), k.value, first);
      setTrend(card.querySelector("[data-kpi-trend]"), k.change);
      const sp = card.querySelector("[data-kpi-spark]");
      if (first) sp.dataset.sparkline = k.spark.map((v) => v.toFixed(2)).join(",");
      else N.charts.sparkline(sp, k.spark); // fresh SVG = the draw-in replays
    });
  }

  /* ---- Traffic chart + series chips ------------------------------------ */
  const seriesOn = Array.from(document.querySelectorAll("[data-series]")).map((c) => c.classList.contains("is-active"));
  const trafficChart = N.charts.create("#traffic-chart", (t) => {
    const line = (label, data, color, axis, extra) => Object.assign({
      label, data, yAxisID: axis, borderColor: color, backgroundColor: color, fill: false,
      pointHoverBackgroundColor: color, pointHoverBorderColor: t.surface,
    }, extra);
    return {
      type: "line",
      data: {
        labels: S.traffic.labels,
        datasets: [
          line("Visitors", S.traffic.visitors, t.series[0], "y", { order: 3, hidden: !seriesOn[0] }),
          line("Signups", S.traffic.signups, t.series[1], "y1", { order: 1, hidden: !seriesOn[1] }),
          line("Orders", S.traffic.orders, t.series[2], "y1", { order: 2, borderDash: [4, 3], borderWidth: 1.5, hidden: !seriesOn[2] }),
        ],
      },
      options: N.charts.options(t, {
        animation: N.charts.drawIn("line", S.traffic.visitors.length),
        scales: {
          x: { ticks: { maxTicksLimit: 8 } },
          y: { ticks: { callback: (v) => compact(v) } },
          y1: {
            position: "right", display: "auto", beginAtZero: true,
            grid: { drawOnChartArea: false }, border: { display: false },
            ticks: { color: t.subtle, padding: 8, maxTicksLimit: 5, callback: (v) => compact(v) },
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => (items.length ? S.traffic.titles[items[0].dataIndex] : ""),
              label: (item) => " " + int(item.parsed.y) + " " + item.dataset.label.toLowerCase(),
            },
          },
        },
      }),
      plugins: [N.charts.crosshair],
    };
  });

  document.querySelectorAll("[data-series]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const i = +chip.dataset.series;
      // Never allow an empty chart: the last active series stays on.
      if (seriesOn[i] && seriesOn.filter(Boolean).length === 1) return;
      seriesOn[i] = !seriesOn[i];
      chip.classList.toggle("is-active", seriesOn[i]);
      chip.setAttribute("aria-pressed", seriesOn[i]);
      trafficChart.then((c) => (seriesOn[i] ? c.show(i) : c.hide(i))); // Chart.js animates show/hide
    });
  });

  const ms = (k) => document.querySelector(`[data-ms="${k}"]`);
  const trafficSub = document.querySelector("[data-traffic-subtitle]");
  function renderTraffic(first) {
    setNumber(ms("avg"), Math.round(S.avgVisitors), first);
    setNumber(ms("peak"), S.peak, first);
    swapText(ms("peak-date"), "· " + S.peakDate, first);
    setNumber(ms("bounce"), +S.bounce.toFixed(1), first);
    tweenText(ms("session"), S.session, duration, first);
    swapText(trafficSub, S.year ? "Visitors, signups and orders per day, weekly averages" : "Visitors, signups and orders per day", first);
    if (first) return;
    trafficChart.then((c) => {
      c.data.labels = S.traffic.labels;
      c.data.datasets[0].data = S.traffic.visitors;
      c.data.datasets[1].data = S.traffic.signups;
      c.data.datasets[2].data = S.traffic.orders;
      c.update();
    });
  }

  /* ---- Revenue bars ---------------------------------------------------- */
  const revChart = N.charts.create("#revenue-chart", (t) => ({
    type: "bar",
    data: {
      labels: S.rev.labels,
      datasets: [{
        label: "Revenue",
        data: S.rev.revenue,
        // Shared bar tokens (charts.js): t.bar for history, full t.barHover
        // for the current (last) bar and on hover.
        backgroundColor: (ctx) => (ctx.dataIndex === ctx.dataset.data.length - 1 ? t.barHover : t.bar),
        hoverBackgroundColor: t.barHover,
        maxBarThickness: 22,
        categoryPercentage: 0.7,
        barPercentage: 0.9,
      }],
    },
    options: N.charts.options(t, {
      animation: N.charts.drawIn("bar", S.rev.revenue.length),
      scales: {
        x: { ticks: { maxTicksLimit: 10 } },
        y: { ticks: { callback: (v) => "$" + compact(v) } },
      },
      plugins: {
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (items) => (items.length ? S.rev.titles[items[0].dataIndex] : ""),
            label: (item) => money(item.parsed.y) + " revenue",
            afterLabel: (item) => int(S.rev.orders[item.dataIndex]) + " orders",
          },
        },
      },
    }),
  }));

  function renderRevenue(first) {
    setNumber(document.querySelector("[data-rev-total]"), Math.round(S.revenue), first);
    setTrend(document.querySelector("[data-rev-trend]"), S.revChange);
    setNumber(document.querySelector("[data-rev-orders]"), S.orders, first);
    setNumber(document.querySelector("[data-rev-aov]"), +S.aov.toFixed(2), first);
    if (first) return;
    revChart.then((c) => {
      c.data.labels = S.rev.labels;
      c.data.datasets[0].data = S.rev.revenue;
      c.update();
    });
  }

  /* ---- Funnel ----------------------------------------------------------- */
  const FUNNEL = ["Visitors", "Signups", "Trials", "Paid"];
  const funnelEl = document.querySelector("[data-funnel]");
  /** Log-scaled width so a 0.6% step is still a visible bar (subtitle says so). */
  const logW = (v, top, low) => (v <= 0 ? 0 : 14 + 86 * (Math.log(v) - Math.log(low)) / (Math.log(top) - Math.log(low) || 1));
  function renderFunnel(first) {
    const f = S.funnel, low = Math.max(1, f[f.length - 1] * 0.6);
    if (first) {
      funnelEl.innerHTML = FUNNEL.map((label, i) => `
        <div class="an-step">
          <div class="an-step__head">
            <span class="an-step__label">${label}</span>
            <span class="an-step__value num" data-f-value></span>
            <span class="an-step__rate num">${i ? `<span data-f-rate data-suffix="%" data-decimals="1"></span> of ${FUNNEL[i - 1].toLowerCase()}` : "&nbsp;"}</span>
          </div>
          <div class="progress" data-f-bar><div class="progress-bar"></div></div>
        </div>`).join("");
    }
    funnelEl.querySelectorAll(".an-step").forEach((step, i) => {
      setNumber(step.querySelector("[data-f-value]"), f[i], first);
      setBar(step.querySelector("[data-f-bar]"), logW(f[i], f[0], low), first, i * 40);
      const rate = step.querySelector("[data-f-rate]");
      if (rate) setNumber(rate, +((f[i] / f[i - 1]) * 100).toFixed(1), first);
    });
    setNumber(document.querySelector("[data-funnel-total]"), +S.paidRate.toFixed(1), first);
    setTrend(document.querySelector("[data-funnel-trend]"), S.paidChange);
  }

  /* ---- Rows with "N visits · x.x%" + bar (channels and countries) ------- */
  // Grid row: label | visits | share, bar below spanning all columns.
  const rowHTML = (key, label, swatch) => `
    <div class="an-row" data-key="${key}"${swatch ? ` style="--c: ${swatch}"` : ""}>
      <span class="an-row__label">${swatch ? '<i class="an-swatch" aria-hidden="true"></i>' : ""}<span class="truncate">${label}</span></span>
      <span class="an-row__visits num" data-r-visits data-suffix=" visits"></span>
      <span class="an-row__share num" data-r-share data-suffix="%" data-decimals="1"></span>
      <div class="progress progress--sm an-row__bar" data-r-bar${swatch ? "" : ' style="--c: var(--chart-1)"'}><div class="progress-bar"></div></div>
    </div>`;
  function setRow(row, visits, share, barPct, first, i) {
    setNumber(row.querySelector("[data-r-visits]"), Math.round(visits), first);
    setNumber(row.querySelector("[data-r-share]"), +share.toFixed(1), first);
    setBar(row.querySelector("[data-r-bar]"), barPct, first, i * 30);
  }

  /* ---- Channels --------------------------------------------------------- */
  const shareEl = document.querySelector("[data-channel-share]");
  const channelsEl = document.querySelector("[data-channels]");
  function renderChannels(first) {
    const max = Math.max(...S.channels.map((c) => c.visitors));
    if (first) {
      shareEl.innerHTML = S.channels.map((c, i) => `<span style="--c: var(--chart-${i + 1})"></span>`).join("");
      channelsEl.innerHTML = S.channels.map((c, i) => rowHTML(i, c.label, `var(--chart-${i + 1})`)).join("");
    }
    Array.from(shareEl.children).forEach((seg, i) => {
      const c = S.channels[i];
      seg.style.setProperty("--share", c.share);
      seg.dataset.tooltip = `${c.label} · ${int(c.visitors)} visits · ${pct1(c.share)}`;
    });
    Array.from(channelsEl.children).forEach((row, i) => {
      const c = S.channels[i];
      setRow(row, c.visitors, c.share, (c.visitors / max) * 100, first, i);
    });
    if (first) N.onVisible(shareEl, () => setTimeout(() => shareEl.classList.add("is-in"), N.revealDelay(shareEl) + 80));
  }

  /* ---- Traffic by hour (Weekdays / Weekends toggle animates the bars) ---- */
  const hoursTabs = document.querySelector("[data-hours-tabs]");
  let dayType = "weekday";
  const hoursChart = N.charts.create("#hours-chart", (t) => ({
    type: "bar",
    data: {
      labels: Array.from({ length: 24 }, (_, h) => hourName(h)),
      datasets: [{
        label: "Visitors per hour",
        data: S.hours[dayType],
        // Shared bar tokens: busiest hour in full t.barHover, the rest t.bar.
        backgroundColor: (ctx) => {
          const d = ctx.dataset.data;
          return d[ctx.dataIndex] === Math.max(...d) ? t.barHover : t.bar;
        },
        hoverBackgroundColor: t.barHover,
        categoryPercentage: 0.78,
        barPercentage: 1,
      }],
    },
    options: N.charts.options(t, {
      animation: N.charts.drawIn("bar", 24),
      scales: {
        x: { ticks: { autoSkip: false, callback: (v, i) => (i % 3 === 0 ? hourName(i) : "") } },
        y: { ticks: { maxTicksLimit: 4, callback: (v) => compact(v) } },
      },
      plugins: {
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (items) => (items.length ? hourSpan(items[0].dataIndex) : ""),
            label: (item) => int(item.parsed.y) + " visitors (average)",
          },
        },
      },
    }),
  }));

  const hoursSummary = document.querySelector("[data-hours-summary]");
  function renderHours(first) {
    const d = S.hours[dayType];
    let hi = 0, lo = 0;
    d.forEach((v, h) => { if (v > d[hi]) hi = h; if (v < d[lo]) lo = h; });
    const item = (label, h) => `<span class="an-hours-item"><span class="an-hours-item__label">${label}</span>` +
      `<span class="num">${hourSpan(h)}</span><span class="num">${int(d[h])} visitors</span></span>`;
    const html = item("Busiest hour", hi) + item("Quietest hour", lo);
    if (first) hoursSummary.innerHTML = html;
    else if (hoursSummary.innerHTML !== html) {
      const out = N.animate(hoursSummary, [{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: N.easing.in, fill: "forwards" });
      out.finished.then(() => { hoursSummary.innerHTML = html; out.cancel(); N.animate(hoursSummary, [{ opacity: 0 }, { opacity: 1 }], { duration: N.ms("--dur-base") }); });
    }
    if (first) return;
    hoursChart.then((c) => { c.data.datasets[0].data = d; c.update(); });
  }
  hoursTabs.addEventListener("nimbus:tabchange", (e) => {
    e.stopPropagation();
    if (e.detail.value === dayType) return; // re-click on the active tab: nothing to animate
    dayType = e.detail.value;
    renderHours(false);
  });

  /* ---- Countries (re-sort with FLIP when the order changes) -------------- */
  const countriesEl = document.querySelector("[data-countries]");
  function renderCountries(first) {
    const list = S.countries.slice().sort((x, y) => y.visitors - x.visitors);
    const max = list[0].visitors, total = S.countries.reduce((t, c) => t + c.visitors, 0);
    if (first) {
      countriesEl.setAttribute("data-stagger", "fade-in");
      countriesEl.innerHTML = list.map((c) => rowHTML(c.code, c.name)).join("");
    }
    const apply = () => list.forEach((c, i) => {
      const row = countriesEl.querySelector(`[data-key="${c.code}"]`);
      // CSS `order` instead of moving DOM nodes: moving would restart the
      // rows' reveal animation. FLIP measures the visual position either way.
      row.style.order = i;
      setRow(row, c.visitors, (c.visitors / total) * 100, (c.visitors / max) * 100, first, i);
    });
    if (first) apply(); else N.flip(countriesEl, apply);
  }

  /* ---- Top pages table (sortable, FLIP) ------------------------------- */
  const pagesEl = document.querySelector("[data-pages]");
  let sortKey = "views", sortDir = -1;
  function renderPages(first) {
    const maxViews = Math.max(...S.pages.map((p) => p.views));
    if (first) {
      pagesEl.innerHTML = S.pages.map((p) => `
        <tr data-path="${p.path}">
          <td><div class="an-page"><span class="an-page__title">${p.title}</span><span class="an-page__path">${p.path}</span></div></td>
          <td><div class="an-views"><span class="num" data-p-views></span><div class="progress progress--sm" data-p-bar style="--c: var(--chart-1)"><div class="progress-bar"></div></div></div></td>
          <td class="an-col-time num text-muted" data-p-time></td>
          <td class="an-col-bounce num text-muted"><span data-p-bounce data-suffix="%" data-decimals="1"></span></td>
          <td class="an-col-change"><span class="trend num" data-p-change></span></td>
        </tr>`).join("");
    }
    S.pages.forEach((p, i) => {
      const row = pagesEl.querySelector(`[data-path="${CSS.escape(p.path)}"]`);
      setNumber(row.querySelector("[data-p-views]"), Math.round(p.views), first);
      setBar(row.querySelector("[data-p-bar]"), (p.views / maxViews) * 100, first, i * 25);
      tweenText(row.querySelector("[data-p-time]"), p.time, duration, first);
      setNumber(row.querySelector("[data-p-bounce]"), +p.bounce.toFixed(1), first);
      setTrend(row.querySelector("[data-p-change]"), p.change);
    });
    sortPages(first);
  }
  function sortPages(first) {
    const byPath = Object.fromEntries(S.pages.map((p) => [p.path, p]));
    const rows = Array.from(pagesEl.children).sort((x, y) => sortDir * (byPath[x.dataset.path][sortKey] - byPath[y.dataset.path][sortKey]));
    const apply = () => rows.forEach((r) => pagesEl.appendChild(r));
    if (first) apply(); else N.flip(pagesEl, apply);
  }
  document.querySelectorAll("[data-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      sortDir = key === sortKey ? -sortDir : -1;
      sortKey = key;
      document.querySelectorAll("[data-sort]").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.classList.toggle("is-asc", on && sortDir === 1);
        if (on) b.setAttribute("aria-sort", sortDir === 1 ? "ascending" : "descending");
        else b.removeAttribute("aria-sort");
      });
      sortPages(false);
    });
  });

  /* ---- Render everything ------------------------------------------------ */
  // Rendering runs ONLY on first load, a range change or a toggle. There are
  // deliberately no resize / mutation listeners here: chart resizing is handled
  // by Chart.js + charts.js without replaying draw-in, numbers and rows stay put.
  function renderAll(first) {
    renderLabel(first);
    renderKpis(first);
    renderTraffic(first);
    renderRevenue(first);
    renderFunnel(first);
    renderChannels(first);
    renderHours(first);
    renderCountries(first);
    renderPages(first);
  }
  renderAll(true); // before Nimbus.init(), which then wires the attributes

  tabs.addEventListener("nimbus:tabchange", (e) => {
    const next = parseInt(e.detail.value, 10);
    if (next === days) return; // only a real range change animates
    days = next;
    S = compute(days);
    renderAll(false);
    const url = new URL(location.href);
    url.searchParams.set("range", days === 365 ? "12m" : String(days));
    history.replaceState(null, "", url);
  });

  // Keyboard: 1-4 switch the range.
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest("input, textarea, select, [contenteditable]")) return;
    const v = { 1: "7", 2: "30", 3: "90", 4: "365" }[e.key];
    if (v) N.selectTab(tabs, v);
  });

  /* ---- Export ------------------------------------------------------------ */
  const exportBtn = document.querySelector("[data-export]");
  exportBtn.addEventListener("click", () => {
    N.loading(exportBtn, true);
    setTimeout(() => {
      N.loading(exportBtn, false);
      N.toast(`analytics-${days === 365 ? "12m" : days + "d"}.csv is ready (demo only).`, "success", { title: "Export complete" });
    }, 900);
  });
})();
