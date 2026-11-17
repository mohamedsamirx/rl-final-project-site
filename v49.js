(() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const COLORS = {
    ink: "#1c1c1a",
    muted: "#6e6c65",
    line: "#e6e2d9",
    teal: "#1f6f63",
    slate: "#4a6484",
    rust: "#b45f3c",
    paleTeal: "#e7f1ec",
  };
  const DELTA = 5 / 12 / 0.94868;
  const ETA = 0.94868;
  const DT = 1 / 12;

  const $ = (id) => document.getElementById(id);
  const fmt = (x, d = 2) =>
    Number(x).toLocaleString("en-AU", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, String(value));
    }
    return el;
  }

  function clear(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function add(svg, tag, attrs = {}) {
    const el = svgEl(tag, attrs);
    svg.appendChild(el);
    return el;
  }

  function line(svg, x1, y1, x2, y2, stroke = COLORS.line, width = 1, dash = "") {
    return add(svg, "line", {
      x1, y1, x2, y2, stroke, "stroke-width": width,
      "stroke-dasharray": dash,
    });
  }

  function text(svg, x, y, value, opts = {}) {
    const el = add(svg, "text", {
      x, y,
      fill: opts.fill || COLORS.muted,
      "font-size": opts.size || 10,
      "font-family": "Helvetica, Arial, sans-serif",
      "text-anchor": opts.anchor || "start",
      "font-weight": opts.weight || 400,
    });
    el.textContent = value;
    return el;
  }

  function path(values, x0, y0, w, h, yMin, yMax) {
    if (!values.length) return "";
    const n = values.length;
    const span = Math.max(1e-9, yMax - yMin);
    return values
      .map((v, i) => {
        const x = x0 + (w * i) / Math.max(1, n - 1);
        const y = y0 + h * (1 - (v - yMin) / span);
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }

  function axis(svg, opts) {
    const { x0, y0, w, h, yMin, yMax, ticks = 5, labels = [] } = opts;
    for (let i = 0; i <= ticks; i += 1) {
      const value = yMin + ((yMax - yMin) * i) / ticks;
      const y = y0 + h * (1 - i / ticks);
      line(svg, x0, y, x0 + w, y, COLORS.line, 1);
      text(svg, x0 - 8, y + 3, opts.format ? opts.format(value) : value.toFixed(1), {
        anchor: "end", size: 9,
      });
    }
    labels.forEach((label, i) => {
      const x = x0 + (w * i) / Math.max(1, labels.length - 1);
      text(svg, x, y0 + h + 18, label, { anchor: "middle", size: 9 });
    });
  }

  // Boundary Lab ---------------------------------------------------------
  const allowances = (E, R) => Math.min(DELTA, Math.max(0, E - R));
  const ruleReserve = (E, k) =>
    Math.max(0, Math.min(20, 16 - k * Math.max(0, E - 16)));
  const toPower = (allowance) => (allowance * ETA) / DT;

  function renderBoundary() {
    const soc = $("soc");
    const slope = $("slope");
    if (!soc || !slope) return;
    const E = Number(soc.value);
    const k = Number(slope.value);
    $("socText").textContent = `${E.toFixed(3)} MWh`;
    $("slopeText").textContent = k.toFixed(2);
    const p16 = toPower(allowances(E, 16));
    const p158 = toPower(allowances(E, 15.8));
    const prule = toPower(allowances(E, ruleReserve(E, k)));
    $("v16").textContent = `${p16.toFixed(2)} MW`;
    $("v158").textContent = `${p158.toFixed(2)} MW`;
    $("vrule").textContent = `${prule.toFixed(2)} MW`;

    const svg = $("boundaryChart");
    clear(svg);
    const box = { x0: 58, y0: 28, w: 670, h: 286 };
    const xMin = 15.7;
    const xMax = 16.55;
    const yMin = 0;
    const yMax = 5.2;
    const sx = (x) => box.x0 + ((x - xMin) / (xMax - xMin)) * box.w;
    const sy = (y) => box.y0 + box.h * (1 - y / yMax);
    const labels = ["15.7", "15.8", "15.9", "16.0", "16.1", "16.2", "16.3", "16.4", "16.5"];
    axis(svg, { ...box, yMin, yMax, ticks: 5, labels, format: (v) => v.toFixed(0) });

    add(svg, "rect", {
      x: sx(16), y: box.y0, width: sx(16 + DELTA) - sx(16), height: box.h,
      fill: COLORS.paleTeal, opacity: 0.85,
    });
    text(svg, sx(16) + 8, box.y0 + 16, "effective boundary layer", {
      fill: COLORS.teal, size: 10, weight: 600,
    });
    line(svg, sx(E), box.y0, sx(E), box.y0 + box.h, COLORS.ink, 1.1, "4 4");

    const curve = (fn, color, dashed = "") => {
      const pts = [];
      for (let i = 0; i < 420; i += 1) {
        const e = xMin + ((xMax - xMin) * i) / 419;
        pts.push([sx(e), sy(toPower(fn(e)))]);
      }
      const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");
      add(svg, "path", {
        d, fill: "none", stroke: color, "stroke-width": 2.6,
        "stroke-dasharray": dashed,
      });
    };
    curve((e) => allowances(e, 16), COLORS.slate);
    curve((e) => allowances(e, 15.8), COLORS.rust, "6 4");
    curve((e) => allowances(e, ruleReserve(e, k)), COLORS.teal);

    [
      [p16, COLORS.slate],
      [p158, COLORS.rust],
      [prule, COLORS.teal],
    ].forEach(([p, color]) => {
      add(svg, "circle", {
        cx: sx(E), cy: sy(p), r: 4.5, fill: color, stroke: "#fff", "stroke-width": 1.5,
      });
    });

    text(svg, box.x0 + box.w, box.y0 + box.h + 38, "Stored energy E (MWh) →", {
      anchor: "end", size: 10,
    });
    text(svg, box.x0 - 44, box.y0 + 10, "MW", { size: 9 });
  }

  // Shared chart helpers -------------------------------------------------
  function chartBox(svg, opts) {
    clear(svg);
    const box = { x0: 46, y0: 18, w: 690, h: opts.h || 150 };
    const yMin = opts.yMin;
    const yMax = opts.yMax;
    const labels = opts.labels || [];
    axis(svg, { ...box, yMin, yMax, ticks: opts.ticks || 4, labels, format: opts.format });
    return { box, yMin, yMax };
  }

  function drawCursor(svg, x, y0, h) {
    line(svg, x, y0, x, y0 + h, "#9f9a8e", 1, "3 3");
  }

  // Replay Lab -----------------------------------------------------------
  const replay = {
    data: null,
    eventKey: null,
    day: 0,
    interval: 0,
    timer: null,
    show: { scalar: true, constant: true, rule: true },
  };
  const policyOrder = ["scalar", "constant", "rule"];
  const policyColors = {
    scalar: COLORS.slate,
    constant: COLORS.rust,
    rule: COLORS.teal,
  };
  const policyNames = {
    scalar: "Scalar R = 16",
    constant: "Constant R = 15.80",
    rule: "V46 release",
  };

  function currentEvent() {
    return replay.data.events[replay.eventKey];
  }

  function dayStart() {
    return replay.day * 288;
  }

  function nemTime(value) {
    return value.slice(11, 16);
  }

  function nemDate(value) {
    const [year, month, day] = value.slice(0, 10).split("-");
    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${day} ${names[Number(month) - 1]}`;
  }

  function dayLabel(event, day) {
    const index = Math.min(event.times.length - 1, day * 288);
    return `Day ${day + 1} · ${nemDate(event.times[index])}`;
  }

  function populateEventSelect() {
    const select = $("eventSelect");
    select.innerHTML = "";
    Object.entries(replay.data.events).forEach(([key, event]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = event.label;
      select.appendChild(option);
    });
    replay.eventKey = Object.keys(replay.data.events)[0];
    select.value = replay.eventKey;
    populateDaySelect();
  }

  function populateDaySelect() {
    const select = $("daySelect");
    select.innerHTML = "";
    const event = currentEvent();
    const days = Math.ceil(event.steps / 288);
    for (let day = 0; day < days; day += 1) {
      const option = document.createElement("option");
      option.value = String(day);
      option.textContent = dayLabel(event, day);
      select.appendChild(option);
    }
    replay.day = 0;
    select.value = "0";
  }

  function slice(values) {
    const start = dayStart();
    return values.slice(start, start + 288);
  }

  function renderReplay() {
    const event = currentEvent();
    if (!event) return;
    const start = dayStart();
    const n = Math.min(288, event.steps - start);
    const price = event.prices.slice(start, start + n);
    const index = start + Math.min(replay.interval, n - 1);
    const priceMin = Math.min(...price);
    const priceMax = Math.max(...price);
    const pad = Math.max(1, (priceMax - priceMin) * 0.08);
    const timeLabels = [0, 72, 144, 216, 288].map((i) =>
      nemTime(event.times[Math.min(start + i, start + n - 1)])
    );
    const timeValue = nemTime(event.times[index]);
    $("timeText").textContent = timeValue;

    // Price chart
    {
      const svg = $("priceChart");
      const { box, yMin, yMax } = chartBox(svg, {
        yMin: Math.max(0, Math.floor(priceMin - pad)),
        yMax: Math.ceil(priceMax + pad),
        h: 150,
        ticks: 4,
        labels: timeLabels,
        format: (v) => `$${fmt(v, 0)}`,
      });
      const sx = (i) => box.x0 + (box.w * i) / Math.max(1, n - 1);
      const sy = (v) => box.y0 + box.h * (1 - (v - yMin) / Math.max(1e-9, yMax - yMin));
      const d = price.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(2)} ${sy(v).toFixed(2)}`).join(" ");
      add(svg, "path", { d, fill: "none", stroke: COLORS.slate, "stroke-width": 1.8 });
      if (yMax > 5000 && yMin < 5000) {
        line(svg, box.x0, sy(5000), box.x0 + box.w, sy(5000), COLORS.rust, 1, "5 4");
        text(svg, box.x0 + box.w - 4, sy(5000) - 4, "5,000 AUD/MWh threshold", {
          anchor: "end", size: 8, fill: COLORS.rust,
        });
      }
      drawCursor(svg, sx(replay.interval), box.y0, box.h);
    }

    // Energy chart
    {
      const svg = $("energyChart");
      const { box } = chartBox(svg, {
        yMin: 8, yMax: 20, h: 170, ticks: 4, labels: timeLabels,
        format: (v) => `${v.toFixed(0)}`,
      });
      const sx = (i) => box.x0 + (box.w * i) / Math.max(1, n - 1);
      const sy = (v) => box.y0 + box.h * (1 - (v - 8) / 12);
      line(svg, box.x0, sy(16), box.x0 + box.w, sy(16), COLORS.line, 1, "4 4");
      text(svg, box.x0 + 6, sy(16) - 4, "16 MWh", { size: 8 });
      policyOrder.forEach((policy) => {
        if (!replay.show[policy]) return;
        const values = slice(event.policies[policy].trace.energy);
        const d = values.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(2)} ${sy(v).toFixed(2)}`).join(" ");
        add(svg, "path", {
          d, fill: "none", stroke: policyColors[policy], "stroke-width": 1.9,
        });
      });
      drawCursor(svg, sx(replay.interval), box.y0, box.h);
      text(svg, box.x0 + box.w, box.y0 + box.h + 36, "Stored energy (MWh)", {
        anchor: "end", size: 9,
      });
    }

    // Cumulative difference chart
    {
      const svg = $("diffChart");
      const scalarCum = event.policies.scalar.trace.cumulative_net;
      const series = {};
      let lo = 0;
      let hi = 0;
      policyOrder.forEach((policy) => {
        if (!replay.show[policy]) return;
        series[policy] = slice(event.policies[policy].trace.cumulative_net).map(
          (value, i) => value - slice(scalarCum)[i]
        );
        series[policy].forEach((v) => {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        });
      });
      const pad = Math.max(10, (hi - lo) * 0.08);
      const { box, yMin, yMax } = chartBox(svg, {
        yMin: Math.floor(lo - pad), yMax: Math.ceil(hi + pad), h: 170,
        ticks: 4, labels: timeLabels,
        format: (v) => `${v >= 0 ? "+" : ""}${Math.round(v)}`,
      });
      const sx = (i) => box.x0 + (box.w * i) / Math.max(1, n - 1);
      const sy = (v) => box.y0 + box.h * (1 - (v - yMin) / Math.max(1e-9, yMax - yMin));
      line(svg, box.x0, sy(0), box.x0 + box.w, sy(0), COLORS.muted, 1);
      policyOrder.forEach((policy) => {
        if (!series[policy]) return;
        const d = series[policy].map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(2)} ${sy(v).toFixed(2)}`).join(" ");
        add(svg, "path", {
          d, fill: "none", stroke: policyColors[policy], "stroke-width": 1.9,
        });
      });
      drawCursor(svg, sx(replay.interval), box.y0, box.h);
      text(svg, box.x0 + box.w, box.y0 + box.h + 36, "Net AUD versus scalar", {
        anchor: "end", size: 9,
      });
    }

    // Readout
    const items = [];
    items.push(["Event", event.label]);
    items.push(["Day", dayLabel(event, replay.day)]);
    items.push(["Time", timeValue]);
    items.push(["Price", `${fmt(event.prices[index], 0)} AUD/MWh`]);
    policyOrder.forEach((policy) => {
      if (!replay.show[policy]) return;
      const trace = event.policies[policy].trace;
      items.push([`${policyNames[policy]} · SOC`, `${fmt(trace.energy[index], 2)} MWh`]);
    });
    policyOrder.forEach((policy) => {
      if (!replay.show[policy]) return;
      const trace = event.policies[policy].trace;
      items.push([`${policyNames[policy]} · discharge`, `${fmt(trace.discharge[index], 2)} MW`]);
    });
    const baseline = event.policies.scalar.trace.cumulative_net[index];
    policyOrder.forEach((policy) => {
      if (!replay.show[policy] || policy === "scalar") return;
      const diff = event.policies[policy].trace.cumulative_net[index] - baseline;
      items.push([`${policyNames[policy]} · Δ net`, `${diff >= 0 ? "+" : ""}${fmt(diff, 1)} AUD`]);
    });
    $("replayReadout").innerHTML = items
      .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
      .join("");
    $("replayStatus").textContent = `${event.label} · ${n} saved intervals · NEM time UTC+10 · browser reads precomputed traces only.`;
  }

  function stopPlay() {
    if (replay.timer) clearInterval(replay.timer);
    replay.timer = null;
    const btn = $("playBtn");
    if (btn) btn.textContent = "Play day";
  }

  function togglePlay() {
    if (replay.timer) {
      stopPlay();
      return;
    }
    const btn = $("playBtn");
    btn.textContent = "Pause";
    replay.timer = setInterval(() => {
      replay.interval += 1;
      if (replay.interval > 287) {
        replay.interval = 287;
        stopPlay();
      }
      $("timeSlider").value = String(replay.interval);
      renderReplay();
    }, 90);
  }

  function initReplay(data) {
    replay.data = data;
    populateEventSelect();
    $("eventSelect").addEventListener("change", (event) => {
      replay.eventKey = event.target.value;
      populateDaySelect();
      replay.interval = 0;
      $("timeSlider").value = "0";
      renderReplay();
    });
    $("daySelect").addEventListener("change", (event) => {
      replay.day = Number(event.target.value);
      replay.interval = 0;
      $("timeSlider").value = "0";
      renderReplay();
    });
    $("timeSlider").addEventListener("input", (event) => {
      replay.interval = Number(event.target.value);
      renderReplay();
    });
    ["scalar", "constant", "rule"].forEach((policy) => {
      const el = $(`show${policy[0].toUpperCase()}${policy.slice(1)}`);
      el.addEventListener("change", () => {
        replay.show[policy] = el.checked;
        renderReplay();
      });
    });
    $("playBtn").addEventListener("click", togglePlay);
    renderReplay();
  }

  // Counterfactual fork --------------------------------------------------
  const fork = { data: null, key: "t443", interval: 0, window: "full" };

  function renderFork() {
    const cf = fork.data.counterfactuals[fork.key];
    if (!cf) return;
    const event = fork.data.events["2024_02_cluster"];
    const offset = cf.event_index;
    const total = cf.reference.horizon;
    const n = fork.window === "24h" ? Math.min(288, total) : total;
    const refEnergy = cf.reference.energy.slice(0, n);
    const intEnergy = cf.intervention.energy.slice(0, n);
    const refCum = cf.reference.cumulative.slice(0, n);
    const intCum = cf.intervention.cumulative.slice(0, n);
    const prices = event.prices.slice(offset, offset + n);
    const index = Math.min(fork.interval, n - 1);
    const time = nemTime(event.times[offset + index]);
    const hourLabels = [0, 0.25, 0.5, 0.75, 1].map((fraction) =>
      `${Math.round((n - 1) * fraction * 5 / 60)}h`
    );
    $("cfTime").textContent = time;
    $("cfSlider").max = String(n - 1);
    $("cfSlider").value = String(index);
    $("forkCard").innerHTML = `
      <div class="big ${cf.advantage_aud >= 0 ? "gain" : "loss"}">${cf.advantage_aud >= 0 ? "+" : ""}${fmt(cf.advantage_aud, 2)} AUD</div>
      <dl>
        <div><dt>Full-event advantage</dt><dd>${cf.advantage_aud >= 0 ? "+" : ""}${fmt(cf.advantage_aud, 2)}</dd></div>
        <div><dt>Reserve shadow</dt><dd>${fmt(cf.shadow_aud_mwh, 2)} AUD/MWh</dd></div>
        <div><dt>Cleared Δ at fork</dt><dd>${fmt(cf.cleared_delta_mw, 3)} MW</dd></div>
        <div><dt>Initial energy</dt><dd>${fmt(cf.energy0, 3)} MWh</dd></div>
        <div><dt>Price at fork</dt><dd>${fmt(cf.price0, 0)} AUD/MWh</dd></div>
      </dl>`;

    document.querySelectorAll(".fork-choice").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.cf === fork.key);
    });

    // Energy chart
    {
      const svg = $("cfEnergyChart");
      const { box } = chartBox(svg, {
        yMin: 0, yMax: 20, h: 170, ticks: 4,
        labels: hourLabels,
        format: (v) => `${v.toFixed(0)}`,
      });
      const sx = (i) => box.x0 + (box.w * i) / Math.max(1, n - 1);
      const sy = (v) => box.y0 + box.h * (1 - v / 20);
      [["reference", COLORS.slate, refEnergy], ["intervention", COLORS.teal, intEnergy]].forEach(([key, color, values]) => {
        const d = values.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(2)} ${sy(v).toFixed(2)}`).join(" ");
        add(svg, "path", { d, fill: "none", stroke: color, "stroke-width": 2 });
      });
      drawCursor(svg, sx(index), box.y0, box.h);
      text(svg, box.x0 + 6, box.y0 + 12, "reference", { size: 9, fill: COLORS.slate });
      text(svg, box.x0 + 6, box.y0 + 26, "intervention", { size: 9, fill: COLORS.teal });
      text(svg, box.x0 + box.w, box.y0 + box.h + 36, "Hours after fork", {
        anchor: "end", size: 9,
      });
    }

    // Difference chart
    {
      const svg = $("cfDiffChart");
      const diff = intCum.map(
        (v, i) => v - refCum[i] + cf.terminal_mark_aud * (intEnergy[i] - refEnergy[i])
      );
      const lo = Math.min(0, ...diff);
      const hi = Math.max(0, ...diff);
      const pad = Math.max(10, (hi - lo) * 0.08);
      const { box, yMin, yMax } = chartBox(svg, {
        yMin: Math.floor(lo - pad), yMax: Math.ceil(hi + pad), h: 170,
        ticks: 4, labels: hourLabels,
        format: (v) => `${v >= 0 ? "+" : ""}${Math.round(v)}`,
      });
      const sx = (i) => box.x0 + (box.w * i) / Math.max(1, n - 1);
      const sy = (v) => box.y0 + box.h * (1 - (v - yMin) / Math.max(1e-9, yMax - yMin));
      line(svg, box.x0, sy(0), box.x0 + box.w, sy(0), COLORS.muted, 1);
      const d = diff.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(2)} ${sy(v).toFixed(2)}`).join(" ");
      add(svg, "path", { d, fill: "none", stroke: COLORS.teal, "stroke-width": 2 });
      drawCursor(svg, sx(index), box.y0, box.h);
      text(svg, box.x0 + box.w, box.y0 + box.h + 36, "Net AUD incl. terminal mark", {
        anchor: "end", size: 9,
      });
    }

    const eRef = refEnergy[index];
    const eInt = intEnergy[index];
    const dRef = cf.reference.discharge[index];
    const dInt = cf.intervention.discharge[index];
    const cumDiff = intCum[index] - refCum[index]
      + cf.terminal_mark_aud * (eInt - eRef);
    const items = [
      ["Time", `${nemDate(event.times[offset + index])} ${time}`],
      ["Price", `${fmt(prices[index], 0)} AUD/MWh`],
      ["SOC · reference", `${fmt(eRef, 2)} MWh`],
      ["SOC · intervention", `${fmt(eInt, 2)} MWh`],
      ["Δ SOC", `${eInt - eRef >= 0 ? "+" : ""}${fmt(eInt - eRef, 3)} MWh`],
      ["Discharge · reference", `${fmt(dRef, 2)} MW`],
      ["Discharge · intervention", `${fmt(dInt, 2)} MW`],
      ["Cumulative Δ incl. terminal", `${cumDiff >= 0 ? "+" : ""}${fmt(cumDiff, 1)} AUD`],
      ["Window", fork.window === "24h" ? "First 24 h" : "Full remaining event"],
    ];
    $("cfReadout").innerHTML = items
      .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
      .join("");
  }

  function initFork(data) {
    fork.data = data;
    document.querySelectorAll(".fork-choice").forEach((button) => {
      button.addEventListener("click", () => {
        fork.key = button.dataset.cf;
        fork.interval = 0;
        $("cfSlider").value = "0";
        renderFork();
      });
    });
    $("cfSlider").addEventListener("input", (event) => {
      fork.interval = Number(event.target.value);
      renderFork();
    });
    document.querySelectorAll("[data-window]").forEach((button) => {
      button.addEventListener("click", () => {
        fork.window = button.dataset.window;
        fork.interval = 0;
        $("cfSlider").value = "0";
        document.querySelectorAll("[data-window]").forEach((item) => {
          item.classList.toggle("is-active", item.dataset.window === fork.window);
        });
        renderFork();
      });
    });
    renderFork();
  }

  // Bidding microscope -------------------------------------------------
  const bid = { data: null, eventKey: null, energy: null };
  const bidBands = [85, 150, 350, 1500, 5000, 15000];

  function renderBids() {
    const event = bid.data?.bids?.[bid.eventKey];
    if (!event) return;
    const state = event.energies[bid.energy];
    if (!state) return;
    const price = event.price_aud_mwh;
    $("bidStatus").textContent =
      `${event.label} · ${nemDate(event.time)} ${nemTime(event.time)} · ${fmt(price, 0)} AUD/MWh · NEM UTC+10`;

    const svg = $("bidChart");
    const { box } = chartBox(svg, {
      yMin: 0, yMax: 5, h: 240, ticks: 5, labels: [],
      format: (v) => `${v.toFixed(0)}`,
    });
    const groupW = box.w / bidBands.length;
    const barW = Math.min(15, groupW * 0.22);
    const policies = ["scalar", "constant", "rule"];
    bidBands.forEach((band, i) => {
      const x = box.x0 + groupW * (i + 0.5);
      if (band <= price) {
        add(svg, "rect", {
          x: box.x0 + groupW * i, y: box.y0,
          width: groupW, height: box.h,
          fill: COLORS.paleTeal, opacity: 0.55,
        });
      }
      text(svg, x, box.y0 + box.h + 18, band >= 1000 ? `${band / 1000}k` : String(band), {
        anchor: "middle", size: 9,
      });
      policies.forEach((policy, j) => {
        const q = Number(state.policies[policy].qd[i] || 0);
        const y = box.y0 + box.h * (1 - q / 5);
        add(svg, "rect", {
          x: x + (j - 1) * barW - barW / 2,
          y,
          width: barW,
          height: box.h * (q / 5),
          fill: policyColors[policy],
          opacity: 0.9,
        });
      });
    });
    text(svg, box.x0 + box.w, box.y0 + box.h + 38, "Discharge price band (AUD/MWh)", {
      anchor: "end", size: 9,
    });
    text(svg, box.x0 - 36, box.y0 + 8, "MW", { size: 9 });
    text(svg, box.x0 + 6, box.y0 + 12, `realized price ${fmt(price, 0)}`, {
      size: 9, fill: COLORS.rust, weight: 600,
    });

    const items = [];
    policies.forEach((policy) => {
      const p = state.policies[policy];
      items.push([`${policyNames[policy]} · protected`, `${fmt(p.protected_mw, 2)} MW`]);
      items.push([`${policyNames[policy]} · cleared`, `${fmt(p.cleared_discharge_mw, 2)} MW`]);
      items.push([`${policyNames[policy]} · charge`, `${fmt(p.cleared_charge_mw, 2)} MW`]);
      items.push([`${policyNames[policy]} · shadow`, `${fmt(p.shadow_aud_mwh, 1)} AUD/MWh`]);
    });
    $("bidReadout").innerHTML = items
      .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
      .join("");
  }

  function initBids(data) {
    bid.data = data;
    const eventSelect = $("bidEvent");
    Object.entries(data.bids).forEach(([key, event]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = event.label;
      eventSelect.appendChild(option);
    });
    bid.eventKey = Object.keys(data.bids)[0];
    eventSelect.value = bid.eventKey;
    bid.energy = Object.keys(data.bids[bid.eventKey].energies)[1] || Object.keys(data.bids[bid.eventKey].energies)[0];
    const energySelect = $("bidEnergy");
    Object.keys(data.bids[bid.eventKey].energies).forEach((energy) => {
      const option = document.createElement("option");
      option.value = energy;
      option.textContent = `${Number(energy).toFixed(2)} MWh`;
      energySelect.appendChild(option);
    });
    energySelect.value = bid.energy;
    eventSelect.addEventListener("change", () => {
      bid.eventKey = eventSelect.value;
      energySelect.innerHTML = "";
      Object.keys(data.bids[bid.eventKey].energies).forEach((energy) => {
        const option = document.createElement("option");
        option.value = energy;
        option.textContent = `${Number(energy).toFixed(2)} MWh`;
        energySelect.appendChild(option);
      });
      bid.energy = Object.keys(data.bids[bid.eventKey].energies)[0];
      energySelect.value = bid.energy;
      renderBids();
    });
    energySelect.addEventListener("change", () => {
      bid.energy = energySelect.value;
      renderBids();
    });
    renderBids();
  }

  // Experiment atlas ----------------------------------------------------
  const atlas = { data: null, compare: "scalar", measure: "net", selected: 0, rows: [] };

  function atlasGain(row, policy, measure) {
    const field = measure === "terminal" ? "terminal_adjustment_aud" : `${measure}_aud`;
    const base = row.policies[atlas.compare][field];
    const value = row.policies[policy][field];
    return value - base;
  }

  function renderAtlas() {
    const svg = $("atlasChart");
    clear(svg);
    const rows = atlas.data.experiment;
    const gains = rows.map((row) => atlasGain(row, "rule", atlas.measure));
    const maxAbs = Math.max(1, ...gains.map((v) => Math.abs(v)));
    const box = { x0: 178, y0: 22, w: 550, h: 430 };
    const rowH = box.h / rows.length;
    const zeroX = box.x0 + box.w / 2;
    const sx = (value) => zeroX + (value / maxAbs) * (box.w / 2 - 10);
    line(svg, zeroX, box.y0, zeroX, box.y0 + box.h, COLORS.muted, 1);
    text(svg, zeroX, box.y0 + box.h + 18, "0", { anchor: "middle", size: 9 });
    text(svg, box.x0 + box.w, box.y0 + box.h + 18, `${fmt(maxAbs, 0)} AUD`, {
      anchor: "end", size: 9,
    });
    text(svg, box.x0, box.y0 + box.h + 18, `−${fmt(maxAbs, 0)} AUD`, { size: 9 });
    rows.forEach((row, i) => {
      const gain = gains[i];
      const y = box.y0 + i * rowH;
      const barY = y + rowH * 0.25;
      const barH = rowH * 0.5;
      const selected = row.panel === "selection5";
      const color = gain >= 0 ? COLORS.teal : COLORS.rust;
      const x1 = sx(0);
      const x2 = sx(gain);
      add(svg, "rect", {
        x: Math.min(x1, x2), y: barY,
        width: Math.max(1, Math.abs(x2 - x1)), height: barH,
        fill: color, opacity: selected ? 0.9 : 0.55,
        stroke: selected ? COLORS.teal : COLORS.slate,
        "stroke-width": selected ? 1.5 : 0.8,
        "data-row": i,
        style: "cursor:pointer",
      });
      text(svg, box.x0 - 10, y + rowH * 0.64, row.label.slice(0, 25), {
        anchor: "end", size: 8.5, fill: selected ? COLORS.ink : COLORS.muted,
      });
      text(svg, box.x0 - 10, y + rowH * 0.82, selected ? "selection" : "complement", {
        anchor: "end", size: 7.5, fill: selected ? COLORS.teal : COLORS.slate,
      });
      text(svg, gain >= 0 ? x2 + 4 : x2 - 4, y + rowH * 0.64,
        `${gain >= 0 ? "+" : ""}${fmt(gain, 1)}`, {
          anchor: gain >= 0 ? "start" : "end", size: 8.5, fill: color,
        });
    });
    svg.querySelectorAll("[data-row]").forEach((node) => {
      node.addEventListener("click", () => {
        atlas.selected = Number(node.getAttribute("data-row"));
        renderAtlas();
      });
    });
    const row = rows[atlas.selected] || rows[0];
    const base = row.policies[atlas.compare];
    const rule = row.policies.rule;
    const items = [
      ["Event", row.label],
      ["Panel", row.panel === "selection5" ? "selection five" : "complement nine"],
      ["Net gain", `${rule.net_aud - base.net_aud >= 0 ? "+" : ""}${fmt(rule.net_aud - base.net_aud, 2)} AUD`],
      ["Operating", `${rule.operating_aud - base.operating_aud >= 0 ? "+" : ""}${fmt(rule.operating_aud - base.operating_aud, 2)} AUD`],
      ["Terminal", `${rule.terminal_adjustment_aud - base.terminal_adjustment_aud >= 0 ? "+" : ""}${fmt(rule.terminal_adjustment_aud - base.terminal_adjustment_aud, 2)} AUD`],
      ["Spike", `${rule.spike_aud - base.spike_aud >= 0 ? "+" : ""}${fmt(rule.spike_aud - base.spike_aud, 2)} AUD`],
      ["Cycles", `${fmt(rule.cycles_efc - base.cycles_efc, 3)} EFC`],
    ];
    $("atlasReadout").innerHTML = items
      .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
      .join("");
  }

  function initAtlas(data) {
    atlas.data = data;
    atlas.rows = data.experiment;
    $("atlasCompare").addEventListener("change", (event) => {
      atlas.compare = event.target.value;
      atlas.selected = 0;
      renderAtlas();
    });
    $("atlasMeasure").addEventListener("change", (event) => {
      atlas.measure = event.target.value;
      atlas.selected = 0;
      renderAtlas();
    });
    renderAtlas();
  }

  // Inverse-optimization lab --------------------------------------------
  const inverse = { data: null, event: null, cap: null };

  function formatCap(cap) {
    if (cap === null) return "∞";
    return cap >= 1000 ? `${cap / 1000}k` : String(cap);
  }

  function renderInverse() {
    const inv = inverse.data;
    const rows = inv.joint.filter((row) => row.event === inverse.event);
    const selected = rows.find((row) => String(row.slope_cap) === String(inverse.cap)) || rows[0];
    const caps = rows.map((row) => row.slope_cap);
    const slacks = rows.map((row) => row.slack);
    const yMax = Math.max(5, Math.ceil(Math.max(...slacks) + 1));
    const svg = $("invChart");
    const { box } = chartBox(svg, {
      yMin: 0, yMax, h: 220, ticks: 4,
      labels: caps.map(formatCap), format: (v) => v.toFixed(0),
    });
    const sx = (i) => box.x0 + (box.w * i) / Math.max(1, rows.length - 1);
    const sy = (v) => box.y0 + box.h * (1 - v / yMax);
    const d = rows.map((row, i) => `${i ? "L" : "M"}${sx(i).toFixed(2)} ${sy(row.slack).toFixed(2)}`).join(" ");
    add(svg, "path", { d, fill: "none", stroke: COLORS.slate, "stroke-width": 1.3, opacity: 0.75 });
    rows.forEach((row, i) => {
      const filled = row.converged;
      add(svg, "circle", {
        cx: sx(i), cy: sy(row.slack), r: 5.5,
        fill: filled ? COLORS.teal : "#fff",
        stroke: filled ? COLORS.teal : COLORS.rust,
        "stroke-width": 1.6,
      });
    });
    const selectedIndex = rows.indexOf(selected);
    line(svg, sx(selectedIndex), box.y0, sx(selectedIndex), box.y0 + box.h, COLORS.ink, 1, "3 3");
    text(svg, box.x0 + box.w, box.y0 + box.h + 36, "Maximum supergradient cap", {
      anchor: "end", size: 9,
    });
    text(svg, box.x0 - 36, box.y0 + 8, "AUD", { size: 9 });

    const reduced = inv.reduced.find((row) => row.event === inverse.event);
    const full = inv.full.find((row) => row.event === inverse.event);
    $("invStatus").textContent =
      `${selected.label} · cap ${formatCap(selected.slope_cap)} · ${selected.status.replaceAll("_", " ")} · ${selected.converged ? "membership verified" : "unresolved"}`;
    const cards = [
      ["Reduced 3-state", `${fmt(reduced.slack, 3)} AUD`, "Risk-neutral discharge-only. Nonrepresentable."],
      ["Single-state full", `${fmt(full.objective_regret, 2)} × 10⁻⁸ AUD`, "Forward-verified objective regret; not a joint certificate."],
      ["Joint 3-state", `${fmt(selected.slack, 3)} AUD`, selected.converged ? "Converged fixed-weight certificate." : "Unconverged; not counted as an impossibility certificate."],
    ];
    $("inverseCards").innerHTML = cards.map(([tag, value, text]) => `
      <article class="evidence-card">
        <span class="tag ${tag.startsWith("Reduced") ? "slate" : tag.startsWith("Single") ? "teal" : "rust"}">${tag}</span>
        <h3>${value}</h3>
        <p>${text}</p>
      </article>`).join("");
  }

  function initInverse(data) {
    inverse.data = data.inverse;
    const eventSelect = $("invEvent");
    const events = [...new Set(data.inverse.joint.map((row) => row.event))];
    events.forEach((event) => {
      const option = document.createElement("option");
      option.value = event;
      option.textContent = data.inverse.joint.find((row) => row.event === event).label;
      eventSelect.appendChild(option);
    });
    inverse.event = events[0];
    eventSelect.value = inverse.event;
    const capSelect = $("invCap");
    const caps = [...new Set(data.inverse.joint.map((row) => row.slope_cap))];
    caps.forEach((cap) => {
      const option = document.createElement("option");
      option.value = cap === null ? "null" : String(cap);
      option.textContent = formatCap(cap);
      capSelect.appendChild(option);
    });
    inverse.cap = caps[0];
    capSelect.value = inverse.cap === null ? "null" : String(inverse.cap);
    eventSelect.addEventListener("change", () => {
      inverse.event = eventSelect.value;
      inverse.cap = caps[0];
      capSelect.value = inverse.cap === null ? "null" : String(inverse.cap);
      renderInverse();
    });
    capSelect.addEventListener("change", () => {
      inverse.cap = capSelect.value === "null" ? null : Number(capSelect.value);
      renderInverse();
    });
    renderInverse();
  }

  // Reveal motion --------------------------------------------------------
  function initReveal() {
    const items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }
    document.body.classList.add("reveal-ready");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    items.forEach((item) => observer.observe(item));
  }

  async function init() {
    renderBoundary();
    $("soc").addEventListener("input", renderBoundary);
    $("slope").addEventListener("input", renderBoundary);
    initReveal();
    try {
      const response = await fetch("v49_data.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      initReplay(data);
      initFork(data);
      initBids(data);
      initAtlas(data);
      initInverse(data);
    } catch (error) {
      const status = $("replayStatus");
      if (status) {
        status.textContent = "Saved trajectories could not load. Serve this page over HTTP so the browser can fetch v49_data.json.";
      }
      console.error("V49 data failed to load", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
