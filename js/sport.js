// Lógica de deporte y cuerpo: rutinas, récords, fútbol, medidas, sueño y ánimo.
// routine: { id, name, exercises: [{ id, name, sets, reps }] }
// workout (gym):    { id, date, type: "gym", routineId, minutes, exercises: [{ name, sets: [{ w, r }] }], note }
// workout (fútbol): { id, date, type: "futbol", kind: "entrenamiento"|"partido", minutes, note }
// body:  { id, date, weight, fat, waist }
// sleep: { id, date, hours, quality 1-5 }   mood: { id, date, value 1-5, note }

import { iso, addDays, weekStart, parseISO } from "./stats.js";

export const MOODS = { 1: "Fatal", 2: "Mal", 3: "Normal", 4: "Bien", 5: "Genial" };
export const MOOD_COLOR = { 1: "#e5736b", 2: "#e39a72", 3: "#e0b467", 4: "#8fd3bf", 5: "#7fcf9b" };
export const QUALITY = { 1: "Muy mala", 2: "Mala", 3: "Normal", 4: "Buena", 5: "Muy buena" };
export const FUTBOL_KINDS = { entrenamiento: "Entrenamiento", partido: "Partido" };

const norm = s => s.trim().toLowerCase();
/** 1RM estimado (fórmula de Epley) */
export const e1rm = (w, r) => r > 0 ? w * (1 + Math.min(r, 12) / 30) : 0;
export const kg = n => `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(n)} kg`;

const gymSessions = state => state.habits.workouts.filter(w => w.type === "gym").sort((a, b) => a.date.localeCompare(b.date));

/** Series de la última vez que se hizo un ejercicio (para rellenar el formulario) */
export function lastSets(state, name, excludeId = null) {
  const list = gymSessions(state).filter(w => w.id !== excludeId).reverse();
  for (const w of list) {
    const ex = (w.exercises || []).find(e => norm(e.name) === norm(name));
    if (ex?.sets?.length) return ex.sets;
  }
  return null;
}

/** Récords por ejercicio: mayor peso (con sus reps), mejor 1RM estimado e historial por sesión */
export function records(state) {
  const map = new Map();
  for (const w of gymSessions(state)) {
    for (const ex of w.exercises || []) {
      const valid = (ex.sets || []).filter(s => s.w > 0 && s.r > 0 && s.t !== "warmup");
      if (!valid.length) continue;
      const key = norm(ex.name);
      if (!map.has(key)) map.set(key, { name: ex.name, best: null, bestE1rm: 0, history: [], sessions: 0 });
      const rec = map.get(key);
      const top = valid.reduce((a, s) => s.w > a.w || (s.w === a.w && s.r > a.r) ? s : a);
      rec.history.push({ date: w.date, w: top.w, r: top.r, workoutId: w.id, sets: valid.length,
        e1: Math.max(...valid.map(s => e1rm(s.w, s.r))), vol: valid.reduce((a, s) => a + s.w * s.r, 0) });
      rec.sessions++;
      if (!rec.best || top.w > rec.best.w || (top.w === rec.best.w && top.r > rec.best.r)) rec.best = { ...top, date: w.date };
      rec.bestE1rm = Math.max(rec.bestE1rm, ...valid.map(s => e1rm(s.w, s.r)));
    }
  }
  return [...map.values()].sort((a, b) => b.history.at(-1).date.localeCompare(a.history.at(-1).date));
}

/** Récords que batiría este entreno (antes de guardarlo) */
export function newRecords(state, workout) {
  const prev = new Map(records({ habits: { workouts: state.habits.workouts.filter(w => w.id !== workout.id) } }).map(r => [norm(r.name), r]));
  const out = [];
  for (const ex of workout.exercises || []) {
    const valid = (ex.sets || []).filter(s => s.w > 0 && s.r > 0 && s.t !== "warmup");
    if (!valid.length) continue;
    const top = Math.max(...valid.map(s => s.w));
    const p = prev.get(norm(ex.name));
    if (p && top > p.best.w) out.push({ name: ex.name, w: top, before: p.best.w });
  }
  return out;
}

export function workoutVolume(w) {
  return (w.exercises || []).reduce((s, ex) => s + (ex.sets || []).reduce((a, x) => a + (x.w || 0) * (x.r || 0), 0), 0);
}

/** Resumen de entrenos: esta semana, este mes, fútbol del mes */
export function sportSummary(state, today = iso()) {
  const ws = iso(weekStart(parseISO(today)));
  const month = today.slice(0, 7);
  const ws_ = state.habits.workouts;
  const futMonth = ws_.filter(w => w.type === "futbol" && w.date.startsWith(month));
  return {
    weekGym: ws_.filter(w => w.type === "gym" && w.date >= ws && w.date <= today).length,
    weekFutbol: ws_.filter(w => w.type === "futbol" && w.date >= ws && w.date <= today).length,
    monthGym: ws_.filter(w => w.type === "gym" && w.date.startsWith(month)).length,
    futbolMonth: { sessions: futMonth.length, minutes: futMonth.reduce((s, w) => s + (w.minutes || 0), 0), partidos: futMonth.filter(w => w.kind === "partido").length }
  };
}

/** Últimos n días: valores de sueño y ánimo (null si no hay registro) */
export function wellbeingDays(state, n = 14, today = iso()) {
  return Array.from({ length: n }, (_, i) => {
    const d = iso(addDays(parseISO(today), i - n + 1));
    const s = state.habits.sleep.find(x => x.date === d);
    const m = state.habits.mood.find(x => x.date === d);
    return { date: d, label: String(parseISO(d).getDate()), sleep: s?.hours ?? null, quality: s?.quality ?? null, mood: m?.value ?? null };
  });
}

export const avg = arr => { const v = arr.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
