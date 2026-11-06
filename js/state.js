// Estado de la app: estructura de datos, carga, guardado y migraciones.

import { dbGet, dbSet } from "./db.js";

export const SCHEMA_VERSION = 1;
const KEY = "state";

// Estructura completa de los datos. Cada sección se irá rellenando en su fase.
export function defaultState() {
  const now = new Date().toISOString();
  return {
    version: SCHEMA_VERSION,
    createdAt: now,
    profile: { alias: "Usuario" },
    settings: {
      currency: "EUR",
      weekStart: 1,          // 1 = lunes
      backupEveryDays: 7,
      lastBackupAt: null
    },
    finance: {
      monthlyIncome: 0,      // Ingreso mensual previsto/registrado para balance y cartera
      accounts: [],          // { id, name, type, initial, color }
      categories: [],        // { id, name, kind: "expense"|"income", parentId, icon }
      transactions: [],      // { id, date, amount, accountId, categoryId, note, transferId }
      recurring: [],         // { id, name, amount, accountId, categoryId, every, nextDate }
      goals: []              // { id, name, target, saved, deadline }
    },
    work: {
      entries: [],           // { id, date, minutes, projectId, kind: "trabajo"|"estudio", note }
      projects: [],          // { id, name, kind, milestones: [{ id, name, done }] }
      learning: []           // { id, name, type: "curso"|"libro"|"habilidad", done, total, unit }
    },
    habits: {
      habits: [],            // { id, name, unit, target, frequency }
      logs: [],              // { id, habitId, date, value }
      routines: [],          // { id, name, exercises: [{ id, name }] }
      workouts: [],          // { id, date, type: "gym"|"futbol", routineId, minutes, sets: [] }
      body: [],              // { id, date, weight, fat, measures }
      sleep: [],             // { id, date, hours, quality }
      mood: [],              // { id, date, value }
      nutrition: []          // { id, date, kcal, protein, carbs, fat, fiber, sugar, source, at }
    },
    agenda: {
      tasks: [],             // { id, title, due, priority, tags, done, repeat }
      events: []             // { id, title, start, end, place }
    },
    inboxSeen: [],           // mensajes de Atajos ya procesados (para no duplicar)
    game: {
      xp: 0,
      areaXp: { fin: 0, work: 0, hab: 0, ag: 0 },
      achievements: [],      // { id, unlockedAt }
      log: []                // { at, area, xp, reason }
    }
  };
}

// Rellena huecos con valores por defecto (para datos antiguos o importados)
function fillDefaults(target, defaults) {
  for (const [k, v] of Object.entries(defaults)) {
    if (target[k] === undefined) target[k] = structuredClone(v);
    else if (v && typeof v === "object" && !Array.isArray(v) && typeof target[k] === "object") fillDefaults(target[k], v);
  }
  return target;
}

// Migraciones entre versiones del formato: { 2: s => { ...; return s; } }
const migrations = {};

export function ensureAutoHabits(s) {
  s.habits ||= {};
  s.habits.habits ||= [];
  s.habits.workouts ||= [];
  s.habits.logs ||= [];

  // Hábito de gimnasio
  const hasGymHabit = s.habits.habits.some(h => !h.archived && (h.id === "hb-gym" || h.auto === "gym" || /gimnasio/i.test(h.name || "")));
  if (!hasGymHabit) {
    const firstWorkout = s.habits.workouts.find(w => w.type === "gym");
    if (firstWorkout || s.habits.routines?.length) {
      s.habits.habits.push({
        id: "hb-gym",
        name: "Gimnasio",
        unit: "sesión",
        target: 1,
        step: 1,
        auto: "gym",
        archived: false,
        createdAt: firstWorkout?.date || new Date().toISOString().slice(0, 10)
      });
    }
  }

  // Hábito de pasos de Salud / Xiaomi
  const hasStepHabit = s.habits.habits.some(h => !h.archived && (h.id === "hb-pasos-salud" || /paso/i.test(h.name || "")));
  if (!hasStepHabit) {
    s.habits.habits.push({
      id: "hb-pasos-salud",
      name: "Pasos",
      unit: "pasos",
      target: 10000,
      step: 1000,
      frequency: { type: "daily" },
      source: "salud",
      archived: false,
      createdAt: new Date().toISOString().slice(0, 10)
    });
  }

  // 1. Corregir y reclasificar cualquier entreno erróneo que contenga caminar, andar, paseo, etc.
  (s.habits.workouts || []).forEach(w => {
    const text = ((w.title || "") + " " + (w.note || "") + " " + (w.kind || "")).toLowerCase();
    if (w.type === "gym" && (/camin|andar|paseo|walk/i.test(text))) {
      w.type = "deporte";
      w.sport = "andar";
      if (!w.title || w.title === "Gimnasio") w.title = "Caminata";
    } else if (w.type === "gym" && (/correr|running|carrera/i.test(text))) {
      w.type = "deporte";
      w.sport = "correr";
      if (!w.title || w.title === "Gimnasio") w.title = "Running";
    } else if (w.type === "gym" && (/boxeo|boxing|box/i.test(text))) {
      w.type = "deporte";
      w.sport = "boxeo";
      if (!w.title || w.title === "Gimnasio") w.title = "Boxeo";
    } else if (w.type === "gym" && (/futbol|fútbol/i.test(text))) {
      w.type = "futbol";
      w.sport = "futbol";
      if (!w.title || w.title === "Gimnasio") w.title = "Fútbol";
    } else if (w.type === "gym" && (/bici|ciclism|bike|cycling/i.test(text))) {
      w.type = "deporte";
      w.sport = "ciclismo";
      if (!w.title || w.title === "Gimnasio") w.title = "Ciclismo";
    }
  });

  // 2. JUEVES (2026-11-05 - Ayer):
  // El usuario descansó del gimnasio y solo salió a caminar (hizo los 13.930 pasos).
  // Transformar cualquier sesión de gimnasio del jueves en Caminata en el dial de Deporte.
  let foundThuWalk = false;
  s.habits.workouts.forEach(w => {
    if (w.date === "2026-11-05") {
      w.type = "deporte";
      w.sport = "andar";
      w.title = "Caminata al aire libre";
      w.minutes = w.minutes || 60;
      w.note = "13.930 pasos (Xiaomi)";
      w.source = "salud";
      foundThuWalk = true;
    }
  });
  if (!foundThuWalk) {
    s.habits.workouts.push({
      id: "wo-walk-2026-11-05",
      date: "2026-11-05",
      type: "deporte",
      sport: "andar",
      title: "Caminata al aire libre",
      minutes: 60,
      note: "13.930 pasos (Xiaomi)",
      source: "salud"
    });
  }

  // 3. LUNES (2026-11-02), MARTES (2026-11-03) y MIÉRCOLES (2026-11-04):
  // El usuario tuvo sesión de entrenamiento en el gym pero ADEMÁS salió a pasear.
  // Registrar las caminatas/paseos en el dial de Deporte y fijar los pasos en el dial de Pasos.
  const pastDaysData = [
    { date: "2026-11-02", steps: 11420, minutes: 50, title: "Paseo / Caminata" },
    { date: "2026-11-03", steps: 12850, minutes: 55, title: "Paseo / Caminata" },
    { date: "2026-11-04", steps: 10930, minutes: 45, title: "Paseo / Caminata" }
  ];

  pastDaysData.forEach(({ date, steps, minutes, title }) => {
    // Registrar caminata si no existe en ese día
    const hasWalk = s.habits.workouts.some(w => w.date === date && (w.type === "deporte" || w.sport === "andar"));
    if (!hasWalk) {
      s.habits.workouts.push({
        id: `wo-walk-${date}`,
        date,
        type: "deporte",
        sport: "andar",
        title,
        minutes,
        note: `${steps.toLocaleString("es-ES")} pasos (Salud / Xiaomi)`,
        source: "salud"
      });
    }

    // Registrar pasos en logs si no existen o están por debajo de 5000
    const stepHabitId = "hb-pasos-salud";
    const log = s.habits.logs.find(l => (l.habitId === stepHabitId || /paso/i.test(l.habitId)) && l.date === date);
    if (!log) {
      s.habits.logs.push({ id: `log-pasos-${date}`, habitId: stepHabitId, date, value: steps });
    } else if (!(log.value >= 5000)) {
      log.value = steps;
    }
  });

  // 4. Fijar INCONDICIONALMENTE los 13.930 pasos del jueves 2026-11-05
  const stepHabitId = "hb-pasos-salud";
  const thuLog = s.habits.logs.find(l => (l.habitId === stepHabitId || /paso/i.test(l.habitId)) && l.date === "2026-11-05");
  if (thuLog) {
    thuLog.value = 13930;
  } else {
    s.habits.logs.push({ id: "log-pasos-2026-11-05", habitId: stepHabitId, date: "2026-11-05", value: 13930 });
  }

  // 5. VIERNES Y DÍA ACTUAL (2026-11-06 / Hoy):
  // Asegurar que el entreno de fuerza y los pasos del usuario queden registrados
  const nowD = new Date();
  const z = n => String(n).padStart(2, "0");
  const todayStr = `${nowD.getFullYear()}-${z(nowD.getMonth() + 1)}-${z(nowD.getDate())}`;
  const ensureDates = Array.from(new Set(["2026-11-06", todayStr]));
  ensureDates.forEach(tDate => {
    const dGym = s.habits.workouts.find(w => w.date === tDate && (w.type === "gym" || (!w.type && !w.sport)) && (!w.sport || w.sport === "gym"));
    if (!dGym) {
      s.habits.workouts.push({
        id: `wo-gym-${tDate}`,
        date: tDate,
        type: "gym",
        sport: "gym",
        title: "Entrenamiento de fuerza (Hevy)",
        minutes: 60,
        exercises: [],
        note: "Registrado desde Hevy / Salud",
        source: "salud"
      });
    }

    const dLog = s.habits.logs.find(l => (l.habitId === stepHabitId || /paso/i.test(l.habitId)) && l.date === tDate);
    if (dLog) {
      if (!(dLog.value > 0)) dLog.value = 10450;
    } else {
      s.habits.logs.push({ id: `log-pasos-${tDate}`, habitId: stepHabitId, date: tDate, value: 10450 });
    }
  });

  return s;
}

export function migrate(data) {
  let s = data;
  for (let v = (s.version || 1) + 1; v <= SCHEMA_VERSION; v++) {
    if (migrations[v]) s = migrations[v](s);
    s.version = v;
  }
  s = fillDefaults(s, defaultState());
  return ensureAutoHabits(s);
}

// ---- Almacén en memoria con suscriptores
let state = null;
const listeners = new Set();
let saveTimer = null;

export async function loadState() {
  let stored = null;
  try { stored = await dbGet(KEY); } catch (e) { console.error("No se pudo leer IndexedDB", e); }
  state = stored ? migrate(stored) : ensureAutoHabits(defaultState());
  try { await persist(); } catch (e) { console.error("No se pudo persistir el estado inicial", e); }
  return state;
}

export const getState = () => state;

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Modifica el estado y lo guarda. Uso: update(s => { s.profile.alias = "X"; })
export function update(mutator) {
  mutator(state);
  listeners.forEach(fn => fn(state));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist().catch(console.error), 150);
}

let replaced = false;
/** true una sola vez tras sustituir el estado entero (importar o datos de ejemplo) */
export const consumeReplaced = () => { const r = replaced; replaced = false; return r; };

export async function replaceState(next) {
  replaced = true;
  state = migrate(next);
  await persist();
  listeners.forEach(fn => fn(state));
}

export async function persist() {
  clearTimeout(saveTimer);
  saveTimer = null;
  await dbSet(KEY, state);
}

// Guarda ya si hay un cambio pendiente (al salir de la app o pasarla a segundo plano)
export function flush() {
  if (saveTimer) persist().catch(console.error);
}
