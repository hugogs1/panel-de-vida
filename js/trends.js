// Tendencias: media de 7 días del peso, peso frente a calorías por semanas y resumen semanal.
// Funciones puras: reciben el estado y devuelven datos.

import { iso, addDays, parseISO, weekStart } from "./stats.js";
import { dayLevel } from "./habits.js";

const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
/** Calorías aproximadas de 1 kg de peso corporal (grasa) */
export const KCAL_PER_KG = 7700;

/** Peso por día (si hay varios el mismo día, el último), en orden de fecha */
export function weightByDay(state) {
  const m = new Map();
  for (const b of [...state.habits.body].sort((a, b) => a.date.localeCompare(b.date))) if (b.weight > 0) m.set(b.date, b.weight);
  return m;
}

/** Media de los pesos de los 7 días que terminan en `date` (null si no hay ninguno) */
export function avg7(wmap, date) {
  const d = parseISO(date), vals = [];
  for (let i = 0; i < 7; i++) { const v = wmap.get(iso(addDays(d, -i))); if (v != null) vals.push(v); }
  return mean(vals);
}

/**
 * Serie para la gráfica: un punto por día con peso de los últimos `days` días, con su media de 7 días.
 * Además, el cambio de la media en 7 y 30 días.
 */
export function weightTrend(state, days = 90, today = iso()) {
  const wmap = weightByDay(state);
  const from = iso(addDays(parseISO(today), -(days - 1)));
  const points = [...wmap.keys()].filter(d => d >= from && d <= today).map(d => ({ date: d, value: wmap.get(d), avg: avg7(wmap, d) }));
  const last = points.at(-1);
  // el cambio se mide desde el último día con peso, para no depender de si hoy te has pesado
  const change = n => {
    if (!last) return null;
    const before = avg7(wmap, iso(addDays(parseISO(last.date), -n)));
    return before == null ? null : last.avg - before;
  };
  return { points, from, today, last, change7: change(7), change30: change(30) };
}

/**
 * Semanas (lunes a domingo) con calorías y proteína medias (solo días con registro y ya terminados)
 * y el cambio de la media del peso respecto a la semana anterior. La más reciente primero.
 */
export function nutritionWeeks(state, n = 6, today = iso()) {
  const wmap = weightByDay(state);
  const nut = new Map((state.habits.nutrition || []).filter(x => x.kcal > 0).map(x => [x.date, x]));
  const weekAvgW = ws => mean(Array.from({ length: 7 }, (_, i) => wmap.get(iso(addDays(ws, i)))).filter(v => v != null));
  const out = [];
  const cur = weekStart(parseISO(today));
  for (let k = 0; k < n; k++) {
    const ws = addDays(cur, -7 * k);
    const days = Array.from({ length: 7 }, (_, i) => iso(addDays(ws, i))).filter(d => d < today);
    const rows = days.map(d => nut.get(d)).filter(Boolean);
    const w = weekAvgW(ws), wPrev = weekAvgW(addDays(ws, -7));
    out.push({
      start: iso(ws), current: k === 0, kcalDays: rows.length,
      kcal: mean(rows.map(r => r.kcal)), protein: mean(rows.map(r => r.protein).filter(v => v > 0)),
      weight: w, delta: w != null && wPrev != null ? w - wPrev : null
    });
  }
  return out;
}

/**
 * Calorías de mantenimiento estimadas: en cada semana con ≥ 4 días de calorías y cambio de peso,
 * mantenimiento ≈ kcal medias − (cambio de peso semanal × 7.700 / 7). Media de hasta 4 semanas.
 * Necesita al menos 2 semanas válidas; si no, null.
 */
export function maintenance(weeks) {
  const ok = weeks.filter(w => !w.current && w.kcalDays >= 4 && w.delta != null).slice(0, 4);
  if (ok.length < 2) return null;
  return { kcal: Math.round(mean(ok.map(w => w.kcal - w.delta * KCAL_PER_KG / 7)) / 10) * 10, weeks: ok.length };
}

// ---------- Resumen semanal

/** Lunes (AAAA-MM-DD) de la semana pasada */
export const lastWeekStart = (today = iso()) => iso(addDays(weekStart(parseISO(today)), -7));

/** Datos de la semana que empieza el lunes `ws` (AAAA-MM-DD) */
export function weekSummary(state, ws) {
  const start = parseISO(ws);
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(start, i)));
  const end = days[6];
  const inW = (d, a = days[0], b = end) => d >= a && d <= b;
  const prevA = iso(addDays(start, -7)), prevB = iso(addDays(start, -1));

  const spendIn = (a, b) => -state.finance.transactions.filter(t => !t.transferId && t.amount < 0 && inW(t.date, a, b)).reduce((s, t) => s + t.amount, 0);
  const incomeIn = (a, b) => state.finance.transactions.filter(t => !t.transferId && t.amount > 0 && inW(t.date, a, b)).reduce((s, t) => s + t.amount, 0);
  const minIn = (kind, a, b) => state.work.entries.filter(e => e.kind === kind && inW(e.date, a, b)).reduce((s, e) => s + (e.minutes || 0), 0);

  const wos = state.habits.workouts.filter(w => inW(w.date));
  const levels = days.map(d => dayLevel(state, d));
  const nut = (state.habits.nutrition || []).filter(x => x.kcal > 0 && inW(x.date));
  const wmap = weightByDay(state);
  const wEnd = avg7(wmap, end), wStart = avg7(wmap, prevB);

  return {
    start: ws, end, days,
    spend: spendIn(days[0], end), spendPrev: spendIn(prevA, prevB), income: incomeIn(days[0], end),
    study: minIn("estudio", days[0], end), studyPrev: minIn("estudio", prevA, prevB),
    work: minIn("trabajo", days[0], end), workPrev: minIn("trabajo", prevA, prevB),
    gym: wos.filter(w => w.type === "gym").length, futbol: wos.filter(w => w.type === "futbol").length,
    habitDays: levels.filter(l => l === 4).length, habitTracked: levels.filter(l => l != null).length,
    kcal: mean(nut.map(x => x.kcal)), protein: mean(nut.map(x => x.protein).filter(v => v > 0)), kcalDays: nut.length,
    weight: wEnd, weightDelta: wEnd != null && wStart != null ? wEnd - wStart : null,
    tasksDone: state.agenda.tasks.filter(t => t.done && t.doneAt && inW(t.doneAt.slice(0, 10))).length
  };
}

/** ¿Hay algo apuntado esa semana? */
export const weekHasData = w => w.spend > 0 || w.income > 0 || w.study > 0 || w.work > 0 || w.gym > 0 || w.futbol > 0 ||
  w.habitTracked > 0 || w.kcalDays > 0 || w.weight != null || w.tasksDone > 0;
