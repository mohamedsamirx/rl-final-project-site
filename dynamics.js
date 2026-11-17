'use strict';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const COLORS = ['#ae4937', '#b96a19', '#226b91', '#687b80', '#267a62'];
const ACTION_COLORS = ['#ae4937', '#e69f00', '#cbd1cb', '#56b4e9', '#267a62'];
const ACTION_LABELS = ['−1.0 MW', '−0.5 MW', '0 MW', '+0.5 MW', '+1.0 MW'];
const state = { data: null, reserve: null, context: 0, soc: 6, phaseStep: 0 };

const fmt = (value, digits = 0) =>
  Number(value).toLocaleString('en-AU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

function el(tag, attrs = {}, text = null) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== null) node.textContent = text;
  return node;
}

function clear(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function axes(svg, options) {
  const { W, H, L, R, T, B, xMin, xMax, yMin, yMax, xTicks, yTicks, xLabel, yLabel, xFormat, yFormat } = options;
  clear(svg);
  const pw = W - L - R;
  const ph = H - T - B;
  const sx = value => L + ((value - xMin) / (xMax - xMin)) * pw;
  const sy = value => T + ((yMax - value) / (yMax - yMin)) * ph;
  const grid = el('g');
  for (const value of yTicks) {
    const yy = sy(value);
    grid.appendChild(el('line', { x1: L, x2: W - R, y1: yy, y2: yy, stroke: '#cbd1cb', 'stroke-width': 0.7 }));
    grid.appendChild(el('text', { x: L - 9, y: yy + 4, 'text-anchor': 'end', fill: '#53666c', 'font-size': 11 }, yFormat ? yFormat(value) : fmt(value)));
  }
  for (const value of xTicks) {
    const xx = sx(value);
    grid.appendChild(el('line', { x1: xx, x2: xx, y1: T, y2: H - B, stroke: '#cbd1cb', 'stroke-width': 0.7 }));
    grid.appendChild(el('text', { x: xx, y: H - B + 18, 'text-anchor': 'middle', fill: '#53666c', 'font-size': 11 }, xFormat ? xFormat(value) : fmt(value)));
  }
  grid.appendChild(el('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, stroke: '#53666c', 'stroke-width': 1 }));
  grid.appendChild(el('text', { x: (L + W - R) / 2, y: H - 8, 'text-anchor': 'middle', fill: '#53666c', 'font-size': 12 }, xLabel));
  grid.appendChild(el('text', { x: 14, y: (T + H - B) / 2, 'text-anchor': 'middle', fill: '#53666c', 'font-size': 12, transform: `rotate(-90 14 ${(T + H - B) / 2})` }, yLabel));
  svg.appendChild(grid);
  return { sx, sy, L, R, T, B, W, H, pw, ph };
}

function path(points, sx, sy) {
  if (!points.length) return '';
  return points.map(([x, y], index) => `${index ? 'L' : 'M'}${sx(x).toFixed(2)},${sy(y).toFixed(2)}`).join(' ');
}

const nearestIndex = (array, value) => {
  let best = 0;
  let distance = Infinity;
  for (let index = 0; index < array.length; index += 1) {
    const current = Math.abs(array[index] - value);
    if (current < distance) {
      distance = current;
      best = index;
    }
  }
  return best;
};

const symlog = value => Math.sign(value) * Math.log10(1 + Math.abs(value) / 10);
const symlogInv = value => Math.sign(value) * (Math.pow(10, Math.abs(value)) - 1) * 10;

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function init() {
  try {
    const [data, reserve] = await Promise.all([
      fetch('dynamics_data.json').then(response => {
        if (!response.ok) throw new Error('dynamics_data.json');
        return response.json();
      }),
      fetch('reserve_data.json').then(response => {
        if (!response.ok) throw new Error('reserve_data.json');
        return response.json();
      }),
    ]);
    state.data = data;
    state.reserve = reserve;
    initValueExplorer();
    initPhase();
    initDP();
  } catch (error) {
    console.error('dynamics init failed', error);
    for (const id of ['valueChartV', 'valueChartL', 'phaseChart', 'dpValueChart', 'dpPolicyChart', 'dpResidualChart']) {
      const node = $(id);
      if (node) {
        clear(node);
        node.appendChild(el('text', { x: 30, y: 50, fill: '#53666c', 'font-size': 14 }, 'Interactive data unavailable. Serve the site over HTTP.'));
      }
    }
  }
}

// ---------------------------------------------------------------- value slices
function initValueExplorer() {
  const select = $('valueContext');
  state.data.contexts.forEach((context, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = context.label;
    select.appendChild(option);
  });
  select.value = '0';
  $('valueSoc').max = String(state.data.capacity_mwh);
  $('valueSoc').value = String(state.soc);
  select.addEventListener('change', () => {
    state.context = Number(select.value);
    drawValueExplorer();
  });
  $('valueSoc').addEventListener('input', event => {
    state.soc = Number(event.target.value);
    drawValueExplorer();
  });
  drawValueExplorer();
}

function drawValueExplorer() {
  const E = state.data.E;
  const contexts = state.data.contexts;
  const selected = contexts[state.context];
  const index = nearestIndex(E, state.soc);
  const soc = E[index];
  $('valueSocLabel').textContent = `${fmt(soc, 1)} MWh`;

  const panels = [
    { id: 'valueChartV', key: 'V', label: 'V(E) · AUD', digits: 0 },
    { id: 'valueChartL', key: 'lambda', label: 'dV/dE · AUD/MWh', digits: 1 },
  ];
  for (const panel of panels) {
    const allValues = contexts.flatMap(context => context[panel.key]);
    let yMin = Math.min(0, ...allValues);
    let yMax = Math.max(...allValues);
    const pad = (yMax - yMin || 1) * 0.06;
    yMin -= pad;
    yMax += pad;
    const yTicks = Array.from({ length: 6 }, (_, i) => yMin + ((yMax - yMin) * i) / 5);
    const chart = axes($(panel.id), {
      W: 600, H: 340, L: 62, R: 18, T: 18, B: 42,
      xMin: 0, xMax: state.data.capacity_mwh, yMin, yMax,
      xTicks: [0, 5, 10, 15, 20], yTicks,
      xLabel: 'Stored energy E (MWh)', yLabel: panel.label,
      xFormat: value => `${value}`,
      yFormat: value => fmt(value, panel.digits),
    });
    contexts.forEach((context, contextIndex) => {
      const color = COLORS[contextIndex % COLORS.length];
      const visible = contextIndex === state.context;
      const line = el('path', {
        d: path(E.map((x, i) => [x, context[panel.key][i]]), chart.sx, chart.sy),
        fill: 'none',
        stroke: color,
        'stroke-width': visible ? 2.4 : 1.2,
        opacity: visible ? 1 : 0.18,
      });
      $(panel.id).appendChild(line);
    });
    const x = chart.sx(soc);
    $(panel.id).appendChild(el('line', { x1: x, x2: x, y1: chart.T, y2: chart.H - chart.B, stroke: '#162c36', 'stroke-dasharray': '4 3', opacity: 0.55 }));
    const y = chart.sy(selected[panel.key][index]);
    $(panel.id).appendChild(el('circle', { cx: x, cy: y, r: 4.5, fill: COLORS[state.context % COLORS.length], stroke: '#fffdf7', 'stroke-width': 1.5 }));
  }

  $('valueReadout').innerHTML = `
    <div><span>Context</span><strong>${selected.label}</strong></div>
    <div><span>Lagged price</span><strong>${fmt(selected.price_aud_mwh, 2)} AUD/MWh</strong></div>
    <div><span>Stored energy</span><strong>${fmt(soc, 1)} MWh</strong></div>
    <div><span>Value V(E)</span><strong>${fmt(selected.V[index], 1)} AUD</strong></div>
    <div><span>Shadow price dV/dE</span><strong>${fmt(selected.lambda[index], 1)} AUD/MWh</strong></div>`;
}

// ------------------------------------------------------------------ DP lab
function interp(x, values, grid) {
  if (x <= grid[0]) return values[0];
  if (x >= grid[grid.length - 1]) return values[values.length - 1];
  const step = grid[1] - grid[0];
  const lower = Math.min(grid.length - 2, Math.floor((x - grid[0]) / step));
  const weight = (x - grid[lower]) / (grid[lower + 1] - grid[lower]);
  return values[lower] * (1 - weight) + values[lower + 1] * weight;
}

function runDP(gamma, wear, highPrice) {
  const E = Array.from({ length: 41 }, (_, i) => i * 0.5);
  const prices = [50, 200, highPrice];
  const actions = [-1, -0.5, 0, 0.5, 1];
  const transition = [
    [0.80, 0.18, 0.02],
    [0.10, 0.80, 0.10],
    [0.05, 0.35, 0.60],
  ];
  const eta = 0.95;
  let V = prices.map(() => E.map(() => 0));
  let policy = prices.map(() => E.map(() => 0));
  const residuals = [];
  let iterations = 0;
  for (let iteration = 0; iteration < 500; iteration += 1) {
    const Vnext = prices.map(() => E.map(() => 0));
    const nextPolicy = prices.map(() => E.map(() => 0));
    let maxDifference = 0;
    for (let i = 0; i < prices.length; i += 1) {
      for (let s = 0; s < E.length; s += 1) {
        let best = -Infinity;
        let bestAction = 0;
        for (let a = 0; a < actions.length; a += 1) {
          const u = actions[a];
          const eNext = E[s] + eta * Math.max(u, 0) - Math.max(-u, 0) / eta;
          if (eNext < -1e-9 || eNext > 20 + 1e-9) continue;
          let q = -prices[i] * u - wear * Math.abs(u);
          for (let j = 0; j < prices.length; j += 1) {
            q += transition[i][j] * gamma * interp(eNext, V[j], E);
          }
          if (q > best) {
            best = q;
            bestAction = a;
          }
        }
        Vnext[i][s] = best;
        nextPolicy[i][s] = bestAction;
        maxDifference = Math.max(maxDifference, Math.abs(best - V[i][s]));
      }
    }
    V = Vnext;
    policy = nextPolicy;
    residuals.push(maxDifference);
    iterations = iteration + 1;
    if (maxDifference < 1e-7) break;
  }
  return { E, prices, actions, V, policy, residuals, iterations, finalResidual: residuals[residuals.length - 1] };
}

function initDP() {
  $('dpGamma').value = String(state.data.dp_defaults.gamma);
  $('dpWear').value = String(state.data.dp_defaults.wear);
  $('dpHigh').value = String(state.data.dp_defaults.high_price);
  const update = debounce(() => {
    $('dpGammaLabel').textContent = Number($('dpGamma').value).toFixed(2);
    $('dpWearLabel').textContent = `${Number($('dpWear').value).toFixed(1)} AUD/MWh`;
    drawDP(Number($('dpGamma').value), Number($('dpWear').value), Number($('dpHigh').value));
  }, 120);
  for (const id of ['dpGamma', 'dpWear', 'dpHigh']) {
    $(id).addEventListener('input', update);
    $(id).addEventListener('change', update);
  }
  $('dpGammaLabel').textContent = Number($('dpGamma').value).toFixed(2);
  $('dpWearLabel').textContent = `${Number($('dpWear').value).toFixed(1)} AUD/MWh`;
  drawDP(Number($('dpGamma').value), Number($('dpWear').value), Number($('dpHigh').value));
}

function drawDP(gamma, wear, highPrice) {
  const result = runDP(gamma, wear, highPrice);
  const valueAt6 = result.prices.map((_, i) => result.V[i][nearestIndex(result.E, 6)]);
  const policyAt6 = result.prices.map((_, i) => result.actions[result.policy[i][nearestIndex(result.E, 6)]]);
  $('dpStats').innerHTML = `
    <div><strong>${result.iterations}</strong>Bellman iterations</div>
    <div><strong>${result.finalResidual.toExponential(1)}</strong>final residual</div>
    <div><strong>${valueAt6.map(value => fmt(value, 0)).join(' / ')}</strong>V(6 MWh) at the three prices</div>
    <div><strong>${policyAt6.map(value => `${value > 0 ? '+' : ''}${value}`).join(' / ')} MW</strong>greedy action at 6 MWh</div>`;
  drawDPValues(result);
  drawDPPolicy(result);
  drawDPResidual(result);
}

function drawDPValues(result) {
  const all = result.V.flat();
  const chart = axes($('dpValueChart'), {
    W: 560, H: 300, L: 62, R: 18, T: 18, B: 42,
    xMin: 0, xMax: 20, yMin: Math.min(0, ...all), yMax: Math.max(...all) * 1.04,
    xTicks: [0, 5, 10, 15, 20],
    yTicks: Array.from({ length: 5 }, (_, i) => (Math.max(...all) * 1.04 * i) / 4),
    xLabel: 'Stored energy E (MWh)', yLabel: 'V(E, p) · AUD',
    xFormat: value => `${value}`,
    yFormat: value => fmt(value, 0),
  });
  result.prices.forEach((price, i) => {
    $('dpValueChart').appendChild(el('path', {
      d: path(result.E.map((x, s) => [x, result.V[i][s]]), chart.sx, chart.sy),
      fill: 'none',
      stroke: COLORS[i === 0 ? 3 : i === 1 ? 2 : 0],
      'stroke-width': 2,
    }));
    $('dpValueChart').appendChild(el('text', {
      x: chart.L + 8, y: chart.T + 16 + i * 16,
      fill: COLORS[i === 0 ? 3 : i === 1 ? 2 : 0],
      'font-size': 11,
    }, `price ${fmt(price)}`));
  });
}

function drawDPPolicy(result) {
  const svg = $('dpPolicyChart');
  clear(svg);
  const W = 560, H = 220, L = 62, R = 18, T = 20, B = 42;
  const pw = W - L - R, ph = H - T - B;
  const rows = result.prices.length;
  const rowHeight = ph / rows;
  const cellWidth = pw / result.E.length;
  for (let i = 0; i < rows; i += 1) {
    for (let s = 0; s < result.E.length; s += 1) {
      svg.appendChild(el('rect', {
        x: L + s * cellWidth, y: T + i * rowHeight,
        width: cellWidth + 0.3, height: rowHeight,
        fill: ACTION_COLORS[result.policy[i][s]],
        opacity: 0.9,
      }));
    }
    svg.appendChild(el('text', { x: L - 8, y: T + i * rowHeight + rowHeight / 2 + 4, 'text-anchor': 'end', fill: '#53666c', 'font-size': 11 }, fmt(result.prices[i])));
  }
  svg.appendChild(el('text', { x: (L + W - R) / 2, y: H - 8, 'text-anchor': 'middle', fill: '#53666c', 'font-size': 12 }, 'Stored energy E (MWh)'));
  svg.appendChild(el('text', { x: 14, y: (T + H - B) / 2, 'text-anchor': 'middle', fill: '#53666c', 'font-size': 12, transform: `rotate(-90 14 ${(T + H - B) / 2})` }, 'Price state (AUD/MWh)'));
  for (const tick of [0, 5, 10, 15, 20]) {
    svg.appendChild(el('text', { x: L + (tick / 20) * pw, y: H - 22, 'text-anchor': 'middle', fill: '#53666c', 'font-size': 11 }, `${tick}`));
  }
  result.actions.forEach((action, index) => {
    const x = L + 10 + index * 100;
    svg.appendChild(el('rect', { x, y: 4, width: 10, height: 10, fill: ACTION_COLORS[index] }));
    svg.appendChild(el('text', { x: x + 14, y: 13, fill: '#53666c', 'font-size': 10 }, ACTION_LABELS[index]));
  });
}

function drawDPResidual(result) {
  const values = result.residuals.map(value => Math.log10(Math.max(value, 1e-12)));
  const chart = axes($('dpResidualChart'), {
    W: 560, H: 300, L: 62, R: 18, T: 18, B: 42,
    xMin: 0, xMax: Math.max(1, result.residuals.length - 1),
    yMin: Math.min(...values) - 0.4, yMax: Math.max(...values) + 0.4,
    xTicks: [0, Math.round(result.residuals.length / 3), Math.round((2 * result.residuals.length) / 3), result.residuals.length - 1],
    yTicks: [Math.ceil(Math.min(...values)), Math.floor((Math.min(...values) + Math.max(...values)) / 2), Math.floor(Math.max(...values))],
    xLabel: 'Bellman iteration', yLabel: 'log10 residual',
    xFormat: value => `${Math.round(value)}`,
    yFormat: value => `10^${Math.round(value)}`,
  });
  const points = values.map((value, index) => [index, value]);
  $('dpResidualChart').appendChild(el('path', { d: path(points, chart.sx, chart.sy), fill: 'none', stroke: '#162c36', 'stroke-width': 2 }));
}

// --------------------------------------------------------------- phase portrait
function initPhase() {
  const r0 = state.reserve.reserves.find(item => Number(item.reserve_mwh) === 0);
  const r6 = state.reserve.reserves.find(item => Number(item.reserve_mwh) === 6);
  state.phase = { r0: r0.trajectory, r6: r6.trajectory };
  $('phaseStep').max = String(state.phase.r0.length - 1);
  $('phaseStep').value = '0';
  $('phaseStep').addEventListener('input', event => {
    state.phaseStep = Number(event.target.value);
    updatePhaseMarkers();
  });
  for (const id of ['phaseR0', 'phaseR6']) {
    $(id).addEventListener('change', drawPhase);
  }
  drawPhase();
}

function drawPhase() {
  const svg = $('phaseChart');
  const r0 = state.phase.r0;
  const r6 = state.phase.r6;
  const allPrices = [...r0, ...r6].map(row => Number(row.p));
  const pMin = Math.min(-20, ...allPrices);
  const pMax = Math.max(...allPrices);
  const xMin = symlog(pMin);
  const xMax = symlog(pMax);
  const chart = axes(svg, {
    W: 900, H: 420, L: 62, R: 18, T: 22, B: 46,
    xMin, xMax, yMin: 0, yMax: 20,
    xTicks: [0, 100, 1000, 5000, 20000].map(symlog),
    yTicks: [0, 5, 10, 15, 20],
    xLabel: 'Energy price (AUD/MWh, symlog scale)', yLabel: 'Stored energy before dispatch (MWh)',
    xFormat: value => fmt(symlogInv(value), 0),
    yFormat: value => `${value}`,
  });
  svg.appendChild(el('line', { x1: chart.sx(symlog(5000)), x2: chart.sx(symlog(5000)), y1: chart.T, y2: chart.H - chart.B, stroke: '#ae4937', 'stroke-dasharray': '4 3', opacity: 0.8 }));
  svg.appendChild(el('text', { x: chart.sx(symlog(5000)) + 5, y: chart.T + 12, fill: '#ae4937', 'font-size': 10 }, '5,000 threshold'));
  svg.appendChild(el('line', { x1: chart.L, x2: chart.W - chart.R, y1: chart.sy(6), y2: chart.sy(6), stroke: '#267a62', 'stroke-dasharray': '4 3', opacity: 0.8 }));
  svg.appendChild(el('text', { x: chart.W - chart.R - 5, y: chart.sy(6) - 6, 'text-anchor': 'end', fill: '#267a62', 'font-size': 10 }, 'R=6 floor'));
  const group0 = el('g', { id: 'phaseGroup0' });
  const group6 = el('g', { id: 'phaseGroup6' });
  for (const row of r0) {
    group0.appendChild(el('circle', { cx: chart.sx(symlog(Number(row.p))), cy: chart.sy(Number(row.e)), r: 1.6, fill: '#226b91', opacity: 0.3 }));
  }
  for (const row of r6) {
    group6.appendChild(el('circle', { cx: chart.sx(symlog(Number(row.p))), cy: chart.sy(Number(row.e)), r: 1.6, fill: '#267a62', opacity: 0.3 }));
  }
  svg.appendChild(group0);
  svg.appendChild(group6);
  svg.appendChild(el('line', { id: 'phaseCursor', x1: chart.L, x2: chart.L, y1: chart.T, y2: chart.H - chart.B, stroke: '#162c36', 'stroke-dasharray': '3 3', opacity: 0 }));
  svg.appendChild(el('circle', { id: 'phaseMarker0', r: 5, fill: '#226b91', stroke: '#fffdf7', 'stroke-width': 1.2, opacity: 0 }));
  svg.appendChild(el('circle', { id: 'phaseMarker6', r: 5, fill: '#267a62', stroke: '#fffdf7', 'stroke-width': 1.2, opacity: 0 }));
  updatePhaseMarkers();
  $('phaseStep').setAttribute('aria-valuetext', 'interval 0');
}

function updatePhaseMarkers() {
  const index = state.phaseStep;
  const row0 = state.phase.r0[index];
  const row6 = state.phase.r6[index];
  const allPrices = [...state.phase.r0, ...state.phase.r6].map(row => Number(row.p));
  const pMin = Math.min(-20, ...allPrices);
  const pMax = Math.max(...allPrices);
  const xMin = symlog(pMin);
  const xMax = symlog(pMax);
  const L = 62, R = 18, T = 22, B = 46, W = 900, H = 420;
  const sx = value => L + ((value - xMin) / (xMax - xMin)) * (W - L - R);
  const sy = value => T + ((20 - value) / 20) * (H - T - B);
  const price = Number(row0.p);
  const x = sx(symlog(price));
  const cursor = $('phaseCursor');
  if (cursor) {
    cursor.setAttribute('x1', x);
    cursor.setAttribute('x2', x);
    cursor.setAttribute('opacity', '0.65');
  }
  const marker0 = $('phaseMarker0');
  const marker6 = $('phaseMarker6');
  if (marker0) {
    marker0.setAttribute('cx', x);
    marker0.setAttribute('cy', sy(Number(row0.e)));
    marker0.setAttribute('opacity', $('phaseR0').checked ? '1' : '0');
  }
  if (marker6) {
    marker6.setAttribute('cx', x);
    marker6.setAttribute('cy', sy(Number(row6.e)));
    marker6.setAttribute('opacity', $('phaseR6').checked ? '1' : '0');
  }
  $('phaseGroup0').style.display = $('phaseR0').checked ? '' : 'none';
  $('phaseGroup6').style.display = $('phaseR6').checked ? '' : 'none';
  $('phaseReadout').innerHTML = `
    <div><span>Interval</span><strong>${row0.t.slice(0, 16)}</strong></div>
    <div><span>Price</span><strong>${fmt(price, 2)} AUD/MWh</strong></div>
    <div><span>SOC, R=0</span><strong>${fmt(row0.e, 2)} MWh</strong></div>
    <div><span>SOC, R=6</span><strong>${fmt(row6.e, 2)} MWh</strong></div>
    <div><span>Discharge, R=6</span><strong>${fmt(row6.d, 2)} MW</strong></div>`;
  $('phaseStep').setAttribute('aria-valuetext', `${row0.t}, price ${fmt(price, 2)}`);
}

init();
