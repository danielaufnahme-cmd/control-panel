/* ==========================================================================
   NIMBUS CHARTS  -  Chart.js helpers + SVG sparklines
   --------------------------------------------------------------------------
   Chart.js 4.4.1 is vendored at static/vendor/chart.umd.min.js and loaded
   globally by base.html (window.Chart).

   USAGE
     const chart = await Nimbus.charts.create(canvas, (t) => ({
       type: "line",
       data: { labels, datasets: [{
         data: values,
         borderColor: t.primary,
         backgroundColor: (ctx) => Nimbus.charts.gradient(ctx, t.primary),
         fill: true,
       }] },
       options: Nimbus.charts.options(t, { animation: Nimbus.charts.drawIn("line", values.length) }),
     }));

   * `build(t)` receives THEME TOKENS (see tokens() below) and must return a
     full Chart.js config. It is called again on every theme change; the
     helper copies the new colors/options onto the live chart and calls
     update("none") so the switch is instant (it happens inside the theme
     View Transition, so the circle reveal shows the re-colored chart).
   * Data you change later (chart.data.datasets[0].data = ...) is kept.
   * Creation is LAZY by default: the chart is built when the canvas
     scrolls into view, so its draw-in animation is actually seen.
     Pass { lazy: false } to build immediately.

   SPARKLINES (no Chart.js, plain SVG):
     <div class="sparkline" data-sparkline="3,5,4,8,7,9" style="--c: var(--accent-sky)"></div>
     Auto-initialised by Nimbus.init(). Draws itself in, synced with the
     reveal stagger of the card it lives in.
   ========================================================================== */
(function () {
  "use strict";
  const Nimbus = (window.Nimbus = window.Nimbus || {});
  const Chart = window.Chart;

  /* ------------------------------------------------------------------------
     Theme tokens -> plain JS object
     ---------------------------------------------------------------------- */
  const ACCENTS = ["indigo", "violet", "pink", "rose", "orange", "amber", "emerald", "teal", "sky", "slate"];

  function tokens() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    const accent = {};
    ACCENTS.forEach((a) => (accent[a] = v("--accent-" + a)));
    return {
      dark: document.documentElement.dataset.theme === "dark",
      text: v("--text"),
      muted: v("--text-muted"),
      subtle: v("--text-subtle"),
      border: v("--border"),
      surface: v("--surface"),
      surface2: v("--surface-2"),
      primary: v("--primary"),
      success: v("--success"),
      warning: v("--warning"),
      danger: v("--danger"),
      info: v("--info"),
      font: v("--font-sans"),
      accent, // t.accent.sky etc. (all brand/grey tones now)
      // Brand colours + ordered chart palette. Use these for series:
      //   t.series[0] main, [1] second, [2] third, [3] fourth, [4] light grey
      brand: { mint: v("--brand-mint"), teal: v("--brand-teal"), navy: v("--brand-navy"), ink: v("--brand-ink") },
      series: [1, 2, 3, 4, 5].map((i) => v("--chart-" + i)),
      // Lighter fills for BAR series (solid --chart-1 bars read heavy in
      // light mode). Use t.bar for the main bar series and t.barHover
      // (= full --chart-1) as hoverBackgroundColor; t.bar2 for a second one.
      bar: v("--chart-bar"),
      bar2: v("--chart-bar-2"),
      barHover: v("--chart-1"),
    };
  }

  /** "#5b5bf0" or "rgb(..)" -> "rgba(r,g,b,a)" */
  function alpha(color, a) {
    if (!color) return `rgba(0,0,0,${a})`;
    if (color.startsWith("#")) {
      let h = color.slice(1);
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      const n = parseInt(h, 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }
    const m = color.match(/[\d.]+/g);
    return m ? `rgba(${m[0]},${m[1]},${m[2]},${a})` : color;
  }

  /**
   * Area fill for a scriptable backgroundColor. House style is a very faint
   * FLAT tint (no glowing gradient areas), so whatever alpha a page asks
   * for is capped at 6%. Name kept for compatibility.
   */
  function gradient(ctx, color, from = 0.06) {
    return alpha(color, Math.min(from, 0.06));
  }

  /* ------------------------------------------------------------------------
     Global Chart.js defaults - fast and consistent
     ---------------------------------------------------------------------- */
  function applyDefaults() {
    if (!Chart) return;
    const t = tokens();
    Chart.defaults.font.family = t.font || "Inter, system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = t.subtle;
    Chart.defaults.borderColor = t.border;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.responsive = true;
    Chart.defaults.animation.duration = Nimbus.reducedMotion ? 0 : 450;
    Chart.defaults.animation.easing = "easeOutQuart";
    Chart.defaults.transitions.active.animation.duration = 150; // hover
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.elements.line.tension = 0;          // straight segments: real data isn't smooth
    Chart.defaults.elements.line.borderWidth = 1.75;
    Chart.defaults.elements.line.borderCapStyle = "butt";
    Chart.defaults.elements.line.borderJoinStyle = "round";
    Chart.defaults.elements.point.radius = 0;
    Chart.defaults.elements.point.hoverRadius = 3.5;
    Chart.defaults.elements.point.hoverBorderWidth = 2;
    Chart.defaults.elements.bar.borderRadius = 2;
    Chart.defaults.elements.bar.borderSkipped = false;
    // Resizes are debounced: while the sidebar is dragged or animating, the
    // canvas keeps its last image (CSS scales it, max-width: 100%) and the
    // chart re-lays out ONCE when the movement settles. No blank frames.
    Chart.defaults.resizeDelay = 120;
  }
  applyDefaults();

  /* Resizes must never animate or blank the canvas. Chart.js clears the
     bitmap when it resizes and, if any property animation is configured
     (our first-draw rise), defers the repaint to the next frame, which
     showed as a flash. After every internal resize we stop running
     animations and repaint synchronously in final state ('none'). */
  if (Chart && Chart.prototype && typeof Chart.prototype._resize === "function" && !Chart.prototype._nimbusResize) {
    const origResize = Chart.prototype._resize;
    Chart.prototype._resize = function (w, h) {
      const had = this.width;
      const r = origResize.call(this, w, h);
      if (had && this.attached) {
        this.$nimbusDrawn = true;   // a resize never replays the draw-in
        this.stop();
        this.update("none");
      }
      return r;
    };
    Chart.prototype._nimbusResize = true;
  }

  /* ------------------------------------------------------------------------
     options(t, overrides) - themed base options (axes, tooltip, interaction)
     ---------------------------------------------------------------------- */
  function options(t, overrides = {}) {
    const base = {
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 6, right: 4 } },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: t.subtle, maxRotation: 0, autoSkipPadding: 18, padding: 6 },
        },
        y: {
          grid: { color: t.border, drawTicks: false },
          border: { display: false, dash: [3, 4] },
          ticks: { color: t.subtle, padding: 10, maxTicksLimit: 5 },
          beginAtZero: true,
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: tooltip(t),
      },
    };
    return deepMerge(base, overrides);
  }

  function tooltip(t) {
    return {
      backgroundColor: t.surface,
      titleColor: t.text,
      bodyColor: t.muted,
      borderColor: t.border,
      borderWidth: 1,
      padding: 10,
      cornerRadius: 6,
      boxPadding: 5,
      usePointStyle: true,
      titleFont: { weight: "600", size: 12 },
      bodyFont: { size: 12 },
      caretSize: 0,
      displayColors: true,
      animation: { duration: 120, easing: "easeOutQuart" },
    };
  }

  function deepMerge(a, b) {
    const out = Array.isArray(a) ? a.slice() : Object.assign({}, a);
    Object.keys(b || {}).forEach((k) => {
      const bv = b[k];
      if (bv && typeof bv === "object" && !Array.isArray(bv) && typeof bv !== "function" && a && typeof a[k] === "object") {
        out[k] = deepMerge(a[k], bv);
      } else out[k] = bv;
    });
    return out;
  }

  /* ------------------------------------------------------------------------
     drawIn(type, count) - first-render animation config
       line: the whole line rises from the baseline at once (no wave)
       bar:  bars grow up together (no stagger)
       Understated on purpose: data motion confirms, it never performs.
     Later updates (e.g. switching ranges) use normal smooth transitions.
     ---------------------------------------------------------------------- */
  function drawIn(type, count = 30) {
    if (Nimbus.reducedMotion) return false;
    const firstDraw = (ctx) => ctx.type === "data" && !ctx.chart.$nimbusDrawn;
    const onComplete = (anim) => { anim.chart.$nimbusDrawn = true; };
    if (type === "bar") {
      return {
        duration: 450,
        easing: "easeOutQuart",
        onComplete,
      };
    }
    if (type === "doughnut") {
      return { duration: 600, easing: "easeOutQuart", animateRotate: true, animateScale: false, onComplete };
    }
    return {
      duration: 450,
      easing: "easeOutQuart",
      onComplete,
      // Per-property animation: only y rises on the first draw.
      y: {
        duration: 500,
        easing: "easeOutQuart",
        from: (ctx) => {
          if (!firstDraw(ctx)) return undefined;
          const s = ctx.chart.scales.y;
          return s ? s.getPixelForValue(s.min) : undefined;
        },
      },
    };
  }

  /* ------------------------------------------------------------------------
     Crosshair plugin - thin vertical guide under the hovered index.
     Add per chart:  plugins: [Nimbus.charts.crosshair]
     ---------------------------------------------------------------------- */
  const crosshair = {
    id: "nimbusCrosshair",
    afterDatasetsDraw(chart) {
      const active = chart.tooltip && chart.tooltip.getActiveElements();
      if (!active || !active.length) return;
      const x = active[0].element.x;
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.lineWidth = 1;
      ctx.strokeStyle = tokens().border;
      ctx.stroke();
      ctx.restore();
    },
  };

  /* ------------------------------------------------------------------------
     create(canvas, build, { lazy }) -> Promise<Chart>
     ---------------------------------------------------------------------- */
  const managed = []; // { chart, build }

  function create(canvas, build, opts = {}) {
    if (typeof canvas === "string") canvas = document.querySelector(canvas);
    if (!Chart || !canvas) return Promise.reject(new Error("Chart.js or canvas missing"));
    const lazy = opts.lazy !== false;
    return new Promise((resolve) => {
      const make = () => {
        const chart = new Chart(canvas, build(tokens()));
        managed.push({ chart, build });
        resolve(chart);
      };
      if (lazy && Nimbus.onVisible) {
        Nimbus.onVisible(canvas, () => setTimeout(make, Nimbus.revealDelay ? Nimbus.revealDelay(canvas) + 60 : 0));
      } else make();
    });
  }

  /** Re-apply colors/options from build(t) to every live chart. */
  function retheme() {
    applyDefaults();
    const t = tokens();
    for (let i = managed.length - 1; i >= 0; i--) {
      const { chart, build } = managed[i];
      if (!chart.canvas || !chart.canvas.isConnected) { managed.splice(i, 1); continue; }
      const fresh = build(t);
      chart.options = fresh.options || {};
      (fresh.data.datasets || []).forEach((ds, idx) => {
        const live = chart.data.datasets[idx];
        if (!live) return;
        Object.keys(ds).forEach((k) => { if (k !== "data") live[k] = ds[k]; });
      });
      chart.update("none");
    }
    // Sparklines use currentColor via CSS, so they re-theme for free.
  }
  document.addEventListener("nimbus:themechange", retheme);

  /* ------------------------------------------------------------------------
     SVG sparklines
     ---------------------------------------------------------------------- */
  /** Draw a sparkline into el. values: number[] (or read from data-sparkline). */
  function sparkline(el, values) {
    values = values || (el.dataset.sparkline || "").split(",").map(Number).filter((n) => !isNaN(n));
    if (values.length < 2) return;
    // Drawn once in real pixels; when the card resizes (sidebar drag) the
    // SVG simply stretches (preserveAspectRatio none, non-scaling stroke).
    // It is never re-rendered on resize, so it never re-fades.
    const W = Math.round(el.clientWidth) || 100, H = Math.round(el.clientHeight) || 32, pad = 3;
    const min = Math.min(...values), max = Math.max(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => [(i / (values.length - 1)) * W, pad + (1 - (v - min) / span) * (H - pad * 2)]);
    // Straight segments (no smoothing), faint flat area, no end dot.
    const line = "M" + pts.map((p) => p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" L");
    el.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <path class="sparkline-area" d="${line} L${W},${H} L0,${H} Z" fill="currentColor" fill-opacity="0.06"/>
        <path class="sparkline-line" d="${line}" fill="none" stroke="currentColor"
              stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      </svg>`;
  }

  function initSparklines(scope = document) {
    scope.querySelectorAll("[data-sparkline]").forEach((el) => {
      if (el._nimbusSpark) return;
      el._nimbusSpark = true;
      sparkline(el);
    });
  }

  Nimbus.charts = { tokens, alpha, gradient, options, tooltip, drawIn, crosshair, create, retheme, sparkline, initSparklines, managed };
})();
