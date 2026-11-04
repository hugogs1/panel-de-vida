// Importación de entrenos desde el CSV que exporta Hevy (Perfil → Ajustes → Exportar e importar datos).
//
// Formato esperado (una fila por serie; el orden de columnas da igual):
//   title, start_time, end_time, description, exercise_title, superset_id, exercise_notes,
//   set_index, set_type, weight_kg (o weight_lbs), reps, distance_km, duration_seconds, rpe
// Un entreno = filas con el mismo title + start_time + end_time.

const MONTHS = { jan: 1, ene: 1, feb: 2, mar: 3, apr: 4, abr: 4, may: 5, jun: 6, jul: 7, aug: 8, ago: 8, sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dec: 12, dic: 12 };

/** CSV con comillas, comas y saltos de línea dentro de campos */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(x => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(x => x !== "")) rows.push(row);
  return rows;
}

/** "21 Jan 2024, 18:05" · "21 ene 2024, 18:05" · "2024-01-21 18:05" · "21/01/2024 18:05" → { date, minutes } */
export function parseHevyDate(s) {
  s = String(s || "").trim().toLowerCase().replace(/\./g, "");
  let y, mo, d, hh = 0, mm = 0, m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[t ](\d{1,2}):(\d{2}))?/))) [, y, mo, d, hh = 0, mm = 0] = m;
  else if ((m = s.match(/^(\d{1,2}) ([a-zñ]+),? (\d{4}),? (\d{1,2}):(\d{2})/))) { [, d, mo, y, hh, mm] = m; mo = MONTHS[mo.slice(0, 4)] || MONTHS[mo.slice(0, 3)]; }
  else if ((m = s.match(/^([a-z]+) (\d{1,2}),? (\d{4}),? (\d{1,2}):(\d{2})/))) { [, mo, d, y, hh, mm] = m; mo = MONTHS[mo.slice(0, 3)]; }
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),? (\d{1,2}):(\d{2})/))) [, d, mo, y, hh, mm] = m;
  if (!y || !mo || !d) return null;
  const p = n => String(n).padStart(2, "0");
  return { date: `${y}-${p(mo)}-${p(d)}`, minutes: Number(hh) * 60 + Number(mm) };
}

const numOrNull = v => { const n = Number(String(v ?? "").replace(",", ".")); return String(v ?? "").trim() !== "" && Number.isFinite(n) ? n : null; };

// id estable a partir del título y la fecha de inicio (FNV-1a)
function stableId(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return "hevy-" + (h >>> 0).toString(36);
}

/** Convierte el CSV en entrenos del panel. Lanza Error con mensaje claro si no es un CSV de Hevy. */
export function parseHevy(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error("El archivo está vacío.");
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = name => head.indexOf(name);
  const need = ["title", "start_time", "exercise_title"];
  if (need.some(n => col(n) < 0)) throw new Error("Este archivo no parece una exportación de entrenos de Hevy (faltan columnas como «exercise_title»).");
  const iKg = col("weight_kg"), iLb = col("weight_lbs");
  const get = (r, n) => { const i = col(n); return i < 0 ? "" : (r[i] ?? "").trim(); };

  const map = new Map();
  for (const r of rows.slice(1)) {
    const title = get(r, "title"), start = get(r, "start_time"), end = get(r, "end_time");
    const st = parseHevyDate(start);
    if (!st) continue;
    const key = `${title}|${start}`;
    if (!map.has(key)) {
      const en = parseHevyDate(end);
      let minutes = en ? en.minutes - st.minutes + (en.date > st.date ? 1440 : 0) : null;
      if (!(minutes > 0 && minutes < 600)) minutes = null;
      map.set(key, { id: stableId(key), date: st.date, type: "gym", routineId: null, title: title || "Entreno", minutes, exercises: [], note: get(r, "description"), source: "hevy" });
    }
    const w = map.get(key);
    const exName = get(r, "exercise_title");
    if (!exName) continue;
    let ex = w.exercises.find(e => e.name === exName);
    if (!ex) { ex = { name: exName, sets: [] }; w.exercises.push(ex); }
    let kg = iKg >= 0 ? numOrNull(r[iKg]) : null;
    if (kg == null && iLb >= 0) { const lb = numOrNull(r[iLb]); kg = lb == null ? null : Math.round(lb * 0.45359237 * 2) / 2; }
    const reps = numOrNull(get(r, "reps"));
    if (reps == null || reps <= 0) continue;               // series de cardio o tiempo: sin repeticiones
    const set = { w: kg ?? 0, r: Math.round(reps) };
    const type = get(r, "set_type").toLowerCase();
    if (type && type !== "normal") set.t = type;             // warmup, failure, dropset
    ex.sets.push(set);
  }
  const workouts = [...map.values()].map(w => ({ ...w, exercises: w.exercises.filter(e => e.sets.length) }));
  if (!workouts.length) throw new Error("No se encontraron entrenos en el archivo.");
  return workouts.sort((a, b) => a.date.localeCompare(b.date));
}

/** Añade o actualiza los entrenos de Hevy en el estado (muta s). */
export function applyHevy(s, workouts) {
  let added = 0, updated = 0;
  for (const w of workouts) {
    const i = s.habits.workouts.findIndex(x => x.id === w.id);
    if (i < 0) { s.habits.workouts.push(w); added++; }
    else if (JSON.stringify(s.habits.workouts[i]) !== JSON.stringify(w)) { s.habits.workouts[i] = w; updated++; }
  }
  s.settings.gymSource = "hevy";
  s.settings.lastHevyImport = new Date().toISOString();
  return { added, updated, total: workouts.length };
}
