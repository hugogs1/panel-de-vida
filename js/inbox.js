// Buzón de Atajos (Siri y Salud): mensajes de texto que los Atajos del iPhone dejan en el Gist
// y que la app convierte en datos al sincronizar.
//
// Formato de cada mensaje: una línea por campo, "clave: valor". Ejemplos:
//   tipo: gasto        importe: 12,50     nota: Mercadona
//   tipo: tarea        titulo: Llamar al dentista     fecha: mañana
//   tipo: habito       nombre: Agua       cantidad: 0,5
//   tipo: tiempo       clase: estudio     horas: 2
//   tipo: gimnasio     minutos: 60
//   tipo: futbol       minutos: 90        partido: sí
//   tipo: pasos        fecha: 2026-11-01  valor: 8.423
//   tipo: cuerpo       peso: 75,4         grasa: 18,5   cintura: 84
//   tipo: nutricion    calorias: 1.850 kcal   proteinas: 120 g   carbohidratos: 210   grasas: 60   peso: 75,4

import { iso, addDays } from "./stats.js";
import { parseAmount } from "./finance.js";
import { habitValue, setHabitValue } from "./habits.js";
import { money, int } from "./ui.js";

export const INBOX_PREFIX = "inbox-";
export const STEPS_HABIT_ID = "hb-pasos-salud";

const norm = s => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "clave: valor" por línea → objeto con claves normalizadas (sin tildes, minúsculas) */
export function parseMessage(text) {
  const out = {};
  // una línea por campo, o todo en una línea separado por «;» (útil para probar a mano)
  for (const line of String(text || "").split(/\r?\n|;/)) {
    const i = line.indexOf(":");
    if (i < 1) continue;
    out[norm(line.slice(0, i))] = line.slice(i + 1).trim();
  }
  return out;
}

// Acepta números con texto alrededor ("7.512 pasos", "12,50 €", "1,5 h"), como los que genera Atajos
const num = v => {
  const m = String(v ?? "").match(/-?\d[\d.,]*/);
  const n = m ? parseAmount(m[0]) : NaN;
  return Number.isFinite(n) ? n : NaN;
};

function parseDay(v, today) {
  const s = norm(v);
  if (!s || s === "hoy") return today;
  if (s === "manana") return iso(addDays(new Date(), 1));
  if (["ninguna", "sin fecha", "no"].includes(s)) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);   // 1/11/2026
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return today;
}

/**
 * Aplica los mensajes al estado (muta s). Cada mensaje genera ids deterministas a partir del
 * nombre del archivo, así que si el mismo mensaje llega dos veces no se duplica.
 * Devuelve { done: [textos para el aviso], skipped: [motivos] }.
 */
export function applyInbox(s, messages, today = iso()) {
  const done = [], skipped = [];
  s.inboxSeen ||= [];
  const seen = new Set(s.inboxSeen);

  for (const { name, text } of messages) {
    const m = parseMessage(text);
    const id = `ibx-${name.replace(/\.[a-z]+$/i, "")}`;
    const tipo = norm(m.tipo);
    if (seen.has(id)) continue;      // ya procesado (en este u otro dispositivo)
    seen.add(id);
    s.inboxSeen.push(id);

    if (tipo === "gasto" || tipo === "ingreso") {
      const value = Math.abs(num(m.importe));
      if (!value) { skipped.push("gasto sin importe"); continue; }
      const acc = s.finance.accounts.find(a => a.id === s.settings.inboxAccountId) || s.finance.accounts[0];
      if (!acc) { skipped.push("gasto: crea primero una cuenta en Finanzas"); continue; }
      const note = (m.nota || m.concepto || "").trim();
      // categoría: la del último movimiento con el mismo concepto
      const prev = note && [...s.finance.transactions].reverse().find(t => !t.transferId && norm(t.note) === norm(note) && (tipo === "gasto" ? t.amount < 0 : t.amount > 0));
      const categoryId = prev?.categoryId || (tipo === "gasto" ? "c-otros" : "c-otrosing");
      s.finance.transactions.push({ id, date: parseDay(m.fecha, today) || today, amount: tipo === "gasto" ? -value : value, accountId: acc.id, categoryId, note, source: "siri" });
      done.push(`${tipo} ${money(value)}${note ? ` (${note})` : ""}`);
    } else if (tipo === "tarea") {
      const title = (m.titulo || m.tarea || "").trim();
      if (!title) { skipped.push("tarea sin título"); continue; }
      s.agenda.tasks.push({ id, title, due: parseDay(m.fecha, today), time: null, priority: ["alta", "baja"].includes(norm(m.prioridad)) ? norm(m.prioridad) : "media", tags: [], note: "", repeat: null, done: false, doneAt: null, createdAt: today, updatedAt: new Date().toISOString(), source: "siri" });
      done.push(`tarea «${title}»`);
    } else if (tipo === "habito") {
      const n = norm(m.nombre);
      const h = s.habits.habits.find(x => !x.archived && !x.auto && norm(x.name) === n) || s.habits.habits.find(x => !x.archived && !x.auto && n && norm(x.name).includes(n));
      if (!h) { skipped.push(`hábito «${m.nombre || "?"}» no encontrado`); continue; }
      const amount = m.cantidad ? num(m.cantidad) : (h.step || h.target || 1);
      if (!(amount > 0)) { skipped.push(`hábito «${h.name}»: cantidad no válida`); continue; }
      const day = parseDay(m.fecha, today) || today;
      setHabitValue(s, h.id, day, habitValue(s, h, day) + amount);
      done.push(`${h.name} +${String(amount).replace(".", ",")} ${h.unit || ""}`.trim());
    } else if (tipo === "tiempo") {
      const minutes = Math.round(m.minutos ? num(m.minutos) : num(m.horas) * 60);
      if (!(minutes > 0) || minutes > 24 * 60) { skipped.push("tiempo no válido"); continue; }
      const kind = norm(m.clase).startsWith("trab") ? "trabajo" : "estudio";
      const p = m.proyecto && s.work.projects.find(x => !x.archived && norm(x.name).includes(norm(m.proyecto)));
      s.work.entries.push({ id, date: parseDay(m.fecha, today) || today, minutes, kind, projectId: p?.id || null, note: m.nota || "", source: "siri" });
      done.push(`${minutes >= 60 ? `${String(Math.round(minutes / 6) / 10).replace(".", ",")} h` : `${minutes} min`} de ${kind}`);
    } else if (tipo === "gimnasio" || tipo === "futbol") {
      const minutes = Math.round(num(m.minutos)) || (tipo === "futbol" ? 90 : 60);
      const date = parseDay(m.fecha, today) || today;
      if (tipo === "gimnasio") s.habits.workouts.push({ id, date, type: "gym", routineId: null, minutes, exercises: [], note: "Desde Siri", source: "siri" });
      else s.habits.workouts.push({ id, date, type: "futbol", kind: ["si", "sí", "partido"].includes(norm(m.partido)) ? "partido" : "entrenamiento", minutes, note: "", source: "siri" });
      done.push(`${tipo === "gimnasio" ? "gimnasio" : "fútbol"} ${minutes} min`);
    } else if (tipo === "cuerpo") {
      const data = { weight: num(m.peso), fat: num(m.grasa), waist: num(m.cintura) };
      Object.keys(data).forEach(k => { if (!(data[k] > 0)) delete data[k]; });
      if (!Object.keys(data).length) { skipped.push("medición sin datos"); continue; }
      const date = parseDay(m.fecha, today) || today;
      const prev = s.habits.body.find(b => b.date === date);   // una medición por día: se completa
      if (prev) Object.assign(prev, data);
      else s.habits.body.push({ id, date, weight: null, fat: null, waist: null, ...data, source: "siri" });
      done.push([data.weight && `${String(data.weight).replace(".", ",")} kg`, data.fat && `${String(data.fat).replace(".", ",")} % grasa`, data.waist && `${String(data.waist).replace(".", ",")} cm cintura`].filter(Boolean).join(", "));
    } else if (tipo === "nutricion") {
      // Totales del día leídos de Salud (Foodvisor): cada envío sustituye al anterior del mismo día
      const date = parseDay(m.fecha, today) || today;
      const v = { kcal: num(m.calorias ?? m.energia), protein: num(m.proteinas), carbs: num(m.carbohidratos), fat: num(m.grasas), fiber: num(m.fibra), sugar: num(m.azucar) };
      Object.keys(v).forEach(k => { v[k] = v[k] >= 0 ? Math.round(v[k] * 10) / 10 : null; });
      s.habits.nutrition ||= [];
      const hasNutri = v.kcal > 0 || v.protein > 0 || v.carbs > 0 || v.fat > 0;
      if (hasNutri) {
        const prev = s.habits.nutrition.find(n => n.date === date);
        const entry = { ...v, kcal: Math.round(v.kcal || 0), source: "foodvisor", at: new Date().toISOString() };
        if (prev) Object.assign(prev, entry); else s.habits.nutrition.push({ id, date, ...entry });
      }
      const w = num(m.peso);
      if (w > 0) {
        const b = s.habits.body.find(x => x.date === date);
        if (b) b.weight = Math.round(w * 10) / 10;
        else s.habits.body.push({ id: id + "-peso", date, weight: Math.round(w * 10) / 10, fat: null, waist: null, source: "foodvisor" });
      }
      if (!hasNutri && !(w > 0)) {
        // se muestra lo recibido para poder ver qué falla en el atajo
        const got = ["calorias", "proteinas", "carbohidratos", "grasas", "peso"].map(k => `${k}: «${m[k] ?? "falta"}»`).join(", ");
        skipped.push(`nutrición sin datos (llegó ${got})`);
        continue;
      }
      done.push([hasNutri && `${int(v.kcal || 0)} kcal`, v.protein > 0 && `${int(v.protein)} g proteína`, w > 0 && `${String(Math.round(w * 10) / 10).replace(".", ",")} kg`].filter(Boolean).join(" · "));
    } else if (tipo === "pasos") {
      const value = Math.round(num(m.valor ?? m.pasos));
      if (!(value >= 0)) { skipped.push("pasos sin valor"); continue; }
      let h = s.habits.habits.find(x => x.id === STEPS_HABIT_ID);
      if (!h) {
        h = { id: STEPS_HABIT_ID, name: "Pasos", unit: "pasos", target: 10000, step: 1000, frequency: { type: "daily" }, source: "salud", archived: false, createdAt: today };
        s.habits.habits.push(h);
      }
      // el total del día sustituye al anterior (la automatización puede ejecutarse varias veces)
      setHabitValue(s, h.id, parseDay(m.fecha, today) || today, value);
      done.push(`${int(value)} pasos`);
    } else {
      skipped.push(`mensaje de tipo «${m.tipo || "?"}» desconocido`);
    }
  }
  s.inboxSeen = s.inboxSeen.slice(-500);
  return { done, skipped };
}
