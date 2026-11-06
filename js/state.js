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
  if (!s || !s.habits) return s;
  s.habits.habits ||= [];
  s.habits.workouts ||= [];

  const hasGymWorkouts = s.habits.workouts.some(w => w.type === "gym");
  const hasGymHabit = s.habits.habits.some(h => !h.archived && (h.auto === "gym" || h.auto === "any"));
  if (hasGymWorkouts && !hasGymHabit) {
    const existing = s.habits.habits.find(h => !h.archived && /gimnasio|gym|entren/i.test(h.name));
    if (existing) {
      existing.auto = "gym";
    } else {
      const firstWorkout = [...s.habits.workouts].filter(w => w.type === "gym").sort((a, b) => a.date.localeCompare(b.date))[0];
      s.habits.habits.push({
        id: "hb-gimnasio-auto",
        name: "Gimnasio",
        unit: "entreno",
        target: 1,
        step: 1,
        frequency: { type: "weekly", times: 4 },
        auto: "gym",
        archived: false,
        createdAt: firstWorkout?.date || new Date().toISOString().slice(0, 10)
      });
    }
  }

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

  // Migración y saneamiento: corregir entrenos que se registraron como gym pero eran caminar, correr, boxeo, etc.
  (s.habits.workouts || []).forEach(w => {
    const title = (w.title || "") + " " + (w.note || "");
    if (w.type === "gym" && /camin|andar|paseo|walk/i.test(title)) {
      w.type = "deporte";
      w.sport = "andar";
      if (!w.title || w.title === "Gimnasio") w.title = "Caminata";
    } else if (w.type === "gym" && /correr|running|carrera/i.test(title)) {
      w.type = "deporte";
      w.sport = "correr";
      if (!w.title || w.title === "Gimnasio") w.title = "Running";
    } else if (w.type === "gym" && /boxeo|boxing|box/i.test(title)) {
      w.type = "deporte";
      w.sport = "boxeo";
      if (!w.title || w.title === "Gimnasio") w.title = "Boxeo";
    } else if (w.type === "gym" && /futbol|fútbol/i.test(title)) {
      w.type = "futbol";
      w.sport = "futbol";
      if (!w.title || w.title === "Gimnasio") w.title = "Fútbol";
    }
  });

  // Si ayer no tiene pasos registrados o tiene 0, registrar los 13.930 pasos de la sesión de ayer
  const yDate = new Date();
  yDate.setDate(yDate.getDate() - 1);
  const yStr = yDate.toISOString().slice(0, 10);
  s.habits.logs ||= [];
  const yLog = s.habits.logs.find(l => (l.habitId === "hb-pasos-salud" || /paso/i.test(l.habitId)) && l.date === yStr);
  if (!yLog) {
    s.habits.logs.push({ id: "log-pasos-ayer-init", habitId: "hb-pasos-salud", date: yStr, value: 13930 });
  } else if (yLog.value === 0) {
    yLog.value = 13930;
  }

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
  state = stored ? migrate(stored) : defaultState();
  if (!stored) await persist();
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
