// Gráficos en SVG dibujados a mano (sin librerías).
// Todos usan una única escala por eje y colores tomados de los tokens.

const r1 = n => Math.round(n * 10) / 10;

/**
 * Barras semanales con línea superpuesta opcional.
 * bars/line: arrays de 7 valores (null = sin dato). today: índice del día actual (0 = lunes).
 */
export function weekChart({ bars, line, labels, today = -1, barColor = "#7ea6f0", lineColor = "#7cc4e4", max, unit = "h" }) {
  const w = 330, h = 140, pad = { l: 24, r: 8, t: 12, b: 22 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const all = [...bars, ...(line || [])].filter(v => v != null);
  const top = max ?? Math.max(4, Math.ceil(Math.max(0, ...all) / 2) * 2);
  const y = v => pad.t + ih - (v / top) * ih;
  const slot = iw / 7, bw = slot * .5;
  const cx = i => pad.l + slot * i + slot / 2;

  let g = "";
  // rejilla: 0, mitad y máximo
  [0, top / 2, top].forEach(v => {
    g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${r1(y(v))}" y2="${r1(y(v))}" stroke="rgba(255,255,255,.06)"/>`;
    g += `<text x="${pad.l - 6}" y="${r1(y(v) + 3)}" font-size="9" fill="#5d626b" text-anchor="end">${r1(v)}</text>`;
  });
  // barras
  bars.forEach((v, i) => {
    const isToday = i === today;
    if (v != null && v > 0) {
      g += `<rect x="${r1(cx(i) - bw / 2)}" y="${r1(y(v))}" width="${r1(bw)}" height="${r1(y(0) - y(v))}" rx="3" fill="url(#wc-bar)"${isToday ? `` : ""}><title>${labels[i]}: ${r1(v)} ${unit}</title></rect>`;
    } else if (today === -1 || i <= today) {
      g += `<rect x="${r1(cx(i) - bw / 2)}" y="${r1(y(0) - 2)}" width="${r1(bw)}" height="2" rx="1" fill="rgba(255,255,255,.1)"/>`;
    }
    g += `<text x="${r1(cx(i))}" y="${h - 6}" font-size="10" text-anchor="middle" fill="${isToday ? "#ececee" : "#8b9099"}" font-weight="${isToday ? 700 : 500}">${labels[i]}</text>`;
  });
  // línea
  if (line) {
    const pts = line.map((v, i) => v == null ? null : [cx(i), y(v)]);
    let d = "", pen = false;
    pts.forEach(p => { if (!p) { pen = false; return; } d += `${pen ? "L" : "M"}${r1(p[0])} ${r1(p[1])} `; pen = true; });
    if (d) g += `<path d="${d}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const last = pts.reduce((a, p, i) => p ? i : a, -1);
    pts.forEach((p, i) => { if (p) g += `<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="${i === last ? 3.5 : 2.2}" fill="${lineColor}"/>`; });
  }

  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Gráfico de la semana">
    <defs><linearGradient id="wc-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${barColor}"/><stop offset="1" stop-color="${barColor}" stop-opacity=".75"/></linearGradient></defs>
    ${g}</svg>`;
}

/** Anillo de progreso (0–100) con texto central opcional. */
export function ring(pct, color, { size = 44, stroke = 5, label = "" } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r1(r)}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="${stroke}"/>
    ${p > 0 ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r1(r)}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${r1(c)}" stroke-dashoffset="${r1(c * (1 - p / 100))}" transform="rotate(-90 ${size / 2} ${size / 2})"/>` : ""}
    ${label ? `<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-size="${size * .26}" font-weight="700" fill="#ececee">${label}</text>` : ""}
  </svg>`;
}

/** Gráfico de área con puntos [{ label, value }]. El eje Y se ajusta al rango de los datos. */
export function areaChart(points, { color = "#7fcf9b", format = v => v, id = "ac" } = {}) {
  const w = 330, h = 136, pad = { l: 8, r: 8, t: 24, b: 22 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const vals = points.map(p => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) { hi += 1; lo -= 1; }
  const span = hi - lo; lo -= span * .15; hi += span * .1;
  const x = i => pad.l + (points.length === 1 ? iw / 2 : (iw * i) / (points.length - 1));
  const y = v => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
  const line = points.map((p, i) => `${i ? "L" : "M"}${r1(x(i))} ${r1(y(p.value))}`).join(" ");
  const area = `${line} L${r1(x(points.length - 1))} ${pad.t + ih} L${r1(x(0))} ${pad.t + ih} Z`;
  const last = points.length - 1;
  // como mucho ~6 etiquetas en el eje X para que no se pisen
  const step = Math.max(1, Math.ceil(points.length / 6));
  const showLabel = i => i === last || (i % step === 0 && last - i >= step);
  let g = `<line x1="${pad.l}" x2="${w - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}" stroke="rgba(255,255,255,.08)"/>`;
  g += `<path d="${area}" fill="url(#${id}-fill)"/>`;
  g += `<path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  points.forEach((p, i) => {
    g += `<circle cx="${r1(x(i))}" cy="${r1(y(p.value))}" r="${i === last ? 3.5 : 2}" fill="${color}"><title>${p.label}: ${format(p.value)}</title></circle>`;
    if (showLabel(i)) g += `<text x="${r1(x(i))}" y="${h - 6}" font-size="10" text-anchor="${i === 0 ? "start" : i === last ? "end" : "middle"}" fill="${i === last ? "#ececee" : "#8b9099"}" font-weight="${i === last ? 700 : 500}">${p.label}</text>`;
  });
  // valor actual siempre arriba a la derecha, sin pisar la línea
  g += `<text x="${w - pad.r}" y="10" font-size="11" font-weight="700" text-anchor="end" fill="${color}">${format(points[last].value)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Evolución">
    <defs><linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".16"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${g}</svg>`;
}

/**
 * Barras apiladas. points: [{ label, values: [a, b, …] | null, highlight }]
 * (null = día futuro, sin barra). colors: un color por serie, de abajo arriba.
 */
export function stackChart(points, { colors = ["#7ea6f0", "#7cc4e4"], unit = "h", id = "sc", labelEvery = 1, goal = null } = {}) {
  const totals = points.map(p => p.values ? p.values.reduce((s, v) => s + (v || 0), 0) : 0);
  const peak = Math.max(0, ...totals, goal ? goal * 1.08 : 0);
  // escala «redonda»: 4, 6, 8… para horas; 500, 1000… para cifras grandes como calorías
  const stepR = peak > 100 ? 500 : 2;
  const top = Math.max(stepR === 2 ? 4 : 1000, Math.ceil(peak / stepR) * stepR);
  const w = 330, h = 140, pad = { l: top >= 1000 ? 32 : 24, r: 6, t: 12, b: 22 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const y = v => pad.t + ih - (v / top) * ih;
  const slot = iw / points.length, bw = Math.min(26, slot * .56);
  const cx = i => pad.l + slot * i + slot / 2;
  let g = "";
  [0, top / 2, top].forEach(v => {
    g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${r1(y(v))}" y2="${r1(y(v))}" stroke="rgba(255,255,255,.06)"/>`;
    g += `<text x="${pad.l - 6}" y="${r1(y(v) + 3)}" font-size="9" fill="#5d626b" text-anchor="end">${r1(v)}</text>`;
  });
  points.forEach((p, i) => {
    const x0 = r1(cx(i) - bw / 2);
    if (p.values && totals[i] > 0) {
      let acc = 0;
      const n = p.values.length;
      p.values.forEach((v, k) => {
        if (!v) return;
        const y1 = y(acc + v), y0 = y(acc);
        const isTop = p.values.slice(k + 1).every(x => !x);
        g += `<rect x="${x0}" y="${r1(y1)}" width="${r1(bw)}" height="${r1(Math.max(1, y0 - y1))}" rx="${isTop ? 3 : 0}" fill="${colors[k % colors.length]}" fill-opacity="${k === 0 ? .85 : .9}"${p.highlight ? `` : ""}/>`;
        acc += v;
      });
      g += `<rect x="${x0}" y="${r1(y(totals[i]))}" width="${r1(bw)}" height="${r1(y(0) - y(totals[i]))}" fill="transparent"><title>${p.label}: ${r1(totals[i])} ${unit}</title></rect>`;
    } else if (p.values) {
      g += `<rect x="${x0}" y="${r1(y(0) - 2)}" width="${r1(bw)}" height="2" rx="1" fill="rgba(255,255,255,.1)"/>`;
    }
    if (i % labelEvery === 0 || p.highlight) g += `<text x="${r1(cx(i))}" y="${h - 6}" font-size="10" text-anchor="middle" fill="${p.highlight ? "#ececee" : "#8b9099"}" font-weight="${p.highlight ? 700 : 500}">${p.label}</text>`;
  });
  if (goal) {
    g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${r1(y(goal))}" y2="${r1(y(goal))}" stroke="#ececee" stroke-opacity=".55" stroke-dasharray="4 4"/>`;
    g += `<text x="${w - pad.r}" y="${r1(y(goal) - 4)}" font-size="9" fill="#8b9099" text-anchor="end">objetivo</text>`;
  }
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Gráfico de barras">${g}</svg>`;
}

/**
 * Mapa de calor tipo calendario: columnas = semanas, filas = días (L…D).
 * days: [{ date, level: 0-4 | null }] en orden, empezando en lunes. color: color base.
 */
export function heatmap(days, { color = "#e88fb4", today = null } = {}) {
  const weeks = Math.ceil(days.length / 7);
  const cell = 14, gap = 3, left = 14, topPad = 14;
  const w = left + weeks * (cell + gap), h = topPad + 7 * (cell + gap);
  const alpha = [0, .25, .5, .78, 1];
  let g = "";
  ["L", "", "X", "", "V", "", "D"].forEach((l, i) => { if (l) g += `<text x="0" y="${topPad + i * (cell + gap) + cell - 3}" font-size="9" fill="#5d626b">${l}</text>`; });
  let lastMonth = null;
  days.forEach((d, i) => {
    const col = Math.floor(i / 7), row = i % 7;
    const x = left + col * (cell + gap), y = topPad + row * (cell + gap);
    const m = d.date.slice(5, 7);
    if (row === 0 && m !== lastMonth) {
      lastMonth = m;
      const name = new Intl.DateTimeFormat("es-ES", { month: "short" }).format(new Date(d.date + "T12:00")).replace(".", "");
      if (col < weeks - 1) g += `<text x="${x}" y="9" font-size="9" fill="#8b9099">${name}</text>`;
    }
    const future = today && d.date > today;
    if (future) return;
    let fill = "rgba(255,255,255,.05)", extra = "";
    if (d.level == null) fill = "rgba(255,255,255,.02)";
    else if (d.level > 0) { fill = color; extra = ` fill-opacity="${alpha[d.level]}"${d.level === 4 ? `` : ""}`; }
    const isToday = d.date === today;
    g += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${fill}"${extra}${isToday ? ` stroke="#ececee" stroke-width="1.2"` : ""}><title>${d.date}</title></rect>`;
  });
  return `<div class="heat-wrap"><svg class="heat" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Mapa de calor">${g}</svg></div>`;
}

/**
 * Tendencia en el tiempo: puntos diarios suaves y una línea con la media.
 * points: [{ date: "AAAA-MM-DD", value, avg }] en orden. El eje X es de fechas reales (los días sin dato quedan como hueco).
 */
export function trendChart(points, { color = "#e88fb4", format = v => v, from, to } = {}) {
  const w = 330, h = 150, pad = { l: 34, r: 8, t: 12, b: 22 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const t = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
  const t0 = t(from || points[0].date), t1 = Math.max(t(to || points.at(-1).date), t0 + 1);
  const vals = points.flatMap(p => [p.value, p.avg]).filter(v => v != null);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1) { const c = (hi + lo) / 2; lo = c - .5; hi = c + .5; }
  const span = hi - lo; lo -= span * .1; hi += span * .1;
  const x = d => pad.l + ((t(d) - t0) / (t1 - t0)) * iw;
  const y = v => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
  let g = "";
  [lo + span * .1, (lo + hi) / 2, hi - span * .1].forEach(v => {
    g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${r1(y(v))}" y2="${r1(y(v))}" stroke="rgba(255,255,255,.06)"/>`;
    g += `<text x="${pad.l - 6}" y="${r1(y(v) + 3)}" font-size="9" fill="#5d626b" text-anchor="end">${String(r1(v)).replace(".", ",")}</text>`;
  });
  points.forEach(p => { g += `<circle cx="${r1(x(p.date))}" cy="${r1(y(p.value))}" r="2" fill="${color}" fill-opacity=".35"><title>${p.date}: ${format(p.value)}</title></circle>`; });
  const line = points.filter(p => p.avg != null).map((p, i) => `${i ? "L" : "M"}${r1(x(p.date))} ${r1(y(p.avg))}`).join(" ");
  if (points.length > 1) g += `<path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const lp = points.at(-1);
  g += `<circle cx="${r1(x(lp.date))}" cy="${r1(y(lp.avg ?? lp.value))}" r="3.5" fill="${color}"/>`;
  // ~5 etiquetas de fecha repartidas
  const fmt = d => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date(t(d) * 864e5 + 12 * 36e5)).replace(".", "");
  const toISO = n => new Date(n * 864e5).toISOString().slice(0, 10);
  for (let k = 0; k <= 4; k++) {
    const d = toISO(Math.round(t0 + (t1 - t0) * k / 4));
    g += `<text x="${r1(x(d))}" y="${h - 6}" font-size="10" text-anchor="${k === 0 ? "start" : k === 4 ? "end" : "middle"}" fill="${k === 4 ? "#ececee" : "#8b9099"}" font-weight="${k === 4 ? 700 : 500}">${fmt(d)}</text>`;
  }
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Tendencia">${g}</svg>`;
}
