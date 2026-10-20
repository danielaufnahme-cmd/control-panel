/* ==========================================================================
   OVERVIEW PAGE
   Reference implementation for page scripts:
     * read server data from a json_script tag
     * build a chart with Nimbus.charts.create(canvas, t => config)
     * react to Nimbus events (nimbus:tabchange) and animate numbers with countTo
     * use Nimbus.toast / modal / loading
   Range tabs (7D / 30D / 90D / 12M) re-slice the daily series client-side:
   the revenue line, the summary numbers and the plan / channel amounts all
   animate to their new values.
   ========================================================================== */
(function () {
  "use strict";
  const N = window.Nimbus;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const dataEl = document.getElementById("revenue-data");
  if (!dataEl) return;
  const D = JSON.parse(dataEl.textContent);

  const dates = D.dates.map((d) => new Date(d + "T00:00:00"));
  const fmtDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const fmtWeekday = new Intl.DateTimeFormat("en-US", { weekday: "short" });
  const fmtMonth = new Intl.DateTimeFormat("en-US", { month: "short" });
  const fmtMonthYear = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
  const fmtLong = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
  const money = (v) => "$" + Math.round(v).toLocaleString("en-US");
  const moneyCompact = (v) => "$" + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
  const sum = (arr, a = 0, b = arr.length) => { let s = 0; for (let i = a; i < b; i++) s += arr[i]; return s; };
  const pct = (a, b) => (b ? ((a - b) / b) * 100 : null);
  const n = D.revenue.length;

  /** Buckets [start, end) for a range: daily up to 30D, weekly for 90D, calendar months for 12M. */
  function bucketsFor(days) {
    const a = Math.max(0, n - days), out = [];
    if (days <= 30) { for (let i = a; i < n; i++) out.push([i, i + 1]); return out; }
    if (days <= 90) { for (let e = n; e - 7 >= a; e -= 7) out.unshift([e - 7, e]); return out; }
    let start = a;
    for (let i = a + 1; i <= n; i++) {
      if (i === n || dates[i].getMonth() !== dates[i - 1].getMonth()) { out.push([start, i]); start = i; }
    }
    return out.slice(-12);
  }

  function seriesFor(days) {
    const B = bucketsFor(days);
    const a = B[0][0];
    const revenue = sum(D.revenue, a, n), orders = sum(D.orders, a, n);
    // Previous period of equal length (not available for 12M: only 365 days of data).
    const pa = a - (n - a);
    const prev = pa >= 0 ? sum(D.revenue, pa, a) : 0;
    let best = 0;
    for (let i = a; i < n; i++) best = Math.max(best, D.revenue[i]);
    return {
      days,
      label: days >= 365 ? "Last 12 months" : "Last " + days + " days",
      labels: B.map(([x]) => (days <= 7 ? fmtWeekday.format(dates[x]) : days >= 365 ? fmtMonth.format(dates[x]) : fmtDay.format(dates[x]))),
      titles: B.map(([x, y]) =>
        y - x === 1 ? fmtLong.format(dates[x])
          : days >= 365 ? fmtMonthYear.format(dates[x]) + (y - x < 28 ? " (to date)" : "")
          : fmtDay.format(dates[x]) + " – " + fmtDay.format(dates[y - 1])),
      values: B.map(([x, y]) => sum(D.revenue, x, y)),
      orderCounts: B.map(([x, y]) => sum(D.orders, x, y)),
      revenue, orders, aov: orders ? revenue / orders : 0, best,
      change: pa >= 0 ? pct(revenue, prev) : null,
    };
  }

  let s = seriesFor(30);

  /* ---------------------------------------------------------------------
     Summary numbers + plan/channel amounts (all count to new values)
     ------------------------------------------------------------------- */
  const sumEl = (k) => $(`[data-sum="${k}"]`);
  const changeEl = sumEl("change");
  const shareRows = $$("[data-share]");
  const rangeLabels = $$("[data-range-label]");

  function setDelta(v) {
    if (v == null) { changeEl.textContent = ""; return; }
    changeEl.className = "ov-delta num " + (v >= 0 ? "is-up" : "is-down");
    changeEl.title = "Change against the previous " + s.days + " days";
    changeEl.textContent = (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + "%";
  }

  function updateNumbers(first) {
    const go = (el, v) => N.countTo(el, v, first ? {} : { duration: 450 });
    const run = () => {
      go(sumEl("revenue"), s.revenue);
      go(sumEl("orders"), s.orders);
      go(sumEl("aov"), s.aov);
      go(sumEl("best"), s.best);
      setDelta(s.change);
      const chTotal = $('[data-cell="channels-total"]');
      if (chTotal) go(chTotal, s.revenue);
      shareRows.forEach((row) => {
        const share = parseFloat(row.dataset.share) / 100;
        const amount = row.querySelector('[data-cell="amount"]');
        if (amount) go(amount, s.revenue * share);
      });
    };
    if (first) {
      const ref = sumEl("revenue");
      // Count up from 0 once the card has revealed (synced with its stagger).
      shareRows.forEach((row) => $$("[data-cell]", row).forEach((el) => { el._nimbusValue = 0; }));
      const chTotal = $('[data-cell="channels-total"]');
      if (chTotal) chTotal._nimbusValue = 0;
      N.onVisible(ref, () => setTimeout(run, N.revealDelay(ref) + 60));
    } else {
      run();
      rangeLabels.forEach((el) => {
        el.textContent = s.label;
        N.animate(el, [{ opacity: 0, transform: "translateY(2px)" }, { opacity: 1, transform: "none" }],
          { duration: N.ms("--dur-base"), easing: N.easing.outQuart });
      });
    }
  }
  updateNumbers(true);

  /* ---------------------------------------------------------------------
     Revenue line: straight segments, faint fill, no points until hover.
     Switching range redraws with the same left-to-right draw-in as the
     first render (500ms ease-out) instead of morphing between point counts.
     ------------------------------------------------------------------- */
  const revenueChart = N.charts.create("#revenue-chart", (t) => ({
    type: "line",
    data: {
      labels: s.labels,
      datasets: [{
        label: "Revenue",
        data: s.values,
        borderColor: t.series[0],
        borderWidth: 1.5,
        backgroundColor: N.charts.alpha(t.series[0], t.dark ? 0.08 : 0.06),
        fill: "origin",
        tension: 0,
        pointRadius: 0,
        pointHoverRadius: 3,
        pointHoverBackgroundColor: t.series[0],
        pointHoverBorderColor: t.surface,
      }],
    },
    options: N.charts.options(t, {
      animation: N.charts.drawIn("line", s.values.length),
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { ticks: { callback: (v) => moneyCompact(v) } },
      },
      plugins: {
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (items) => (items.length ? s.titles[items[0].dataIndex] : ""),
            label: (item) => "Net revenue  " + money(item.parsed.y),
            afterLabel: (item) => "Payments  " + s.orderCounts[item.dataIndex].toLocaleString("en-US"),
          },
        },
      },
    }),
  }));

  $("[data-revenue-range]").addEventListener("nimbus:tabchange", (e) => {
    s = seriesFor(parseInt(e.detail.value, 10));
    updateNumbers(false);
    revenueChart.then((chart) => {
      chart.data.labels = s.labels;
      chart.data.datasets[0].data = s.values;
      if (N.reducedMotion) { chart.update("none"); return; }
      // Re-arm drawIn's first-draw wave for the new series.
      chart.$nimbusDrawn = false;
      chart.options.animation = N.charts.drawIn("line", s.values.length);
      chart.update("none");
      chart.reset();
      chart.update();
    });
  });

  /* ---------------------------------------------------------------------
     Export button: loading state -> success toast
     ------------------------------------------------------------------- */
  const exportBtn = $("[data-export]");
  exportBtn.addEventListener("click", () => {
    N.loading(exportBtn, true);
    setTimeout(() => {
      N.loading(exportBtn, false);
      N.toast("overview-2026-10.csv is ready to download.", "success", { title: "Export complete" });
    }, 900);
  });

  /* ---------------------------------------------------------------------
     New project modal form
     ------------------------------------------------------------------- */
  const form = $("[data-new-project-form]");
  form.addEventListener("submit", (e) => {
    e.preventDefault(); // keep method="dialog" from closing without animation
    const name = form.elements.name;
    if (!name.value.trim()) {
      name.setAttribute("aria-invalid", "true");
      name.focus();
      N.toast("Enter a project name.", "error");
      return;
    }
    name.removeAttribute("aria-invalid");
    N.modal.close("new-project-modal");
    N.toast(`${name.value.trim()} was created.`, "success", { title: "Project created" });
    form.reset();
  });
})();
