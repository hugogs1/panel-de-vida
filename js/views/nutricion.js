// Nutrición (datos de Foodvisor a través de Salud): calorías y macros del día, objetivos y evolución.

import { getState, update } from "../state.js";
import { esc, int, openSheet, closeSheet, toast } from "../ui.js";
import { iso, addDays, parseISO } from "../stats.js";
import { seg, field } from "../forms.js";
import { ring, stackChart } from "../charts.js";
import { meets } from "../habits.js";
import { nutriWeightCard } from "./tendencia.js";

export const KCAL_HABIT = "hb-kcal";
export const PROTEIN_HABIT = "hb-proteina";
const num1 = n => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(n);
const time = isoTs => new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(isoTs));

export function nutricionTab(state) {
  const goals = state.settings.nutritionGoals || {};
  const list = state.habits.nutrition || [];
  const today = iso();
  const t = list.find(n => n.date === today);

  if (!list.length) return `<section class="card">
    <h2 class="card-h">Nutrición<span class="spacer"></span><button class="btn small" type="button" data-act="nutri-goals">Objetivos</button></h2>
    <div class="empty">Aún no han llegado datos de Foodvisor.<br>Monta el atajo <b>Nutrición al Panel</b> en <a href="#ajustes">Ajustes → Siri y Salud → Cómo crear los Atajos</a> (apartado 9).</div>
  </section>`;

  // ---- Hoy
  const kcal = t?.kcal || 0, protein = t?.protein || 0, carbs = t?.carbs || 0, fat = t?.fat || 0;
  let kcalLine = "";
  if (goals.kcal) {
    const diff = goals.kcal - kcal;
    kcalLine = goals.mode === "max"
      ? (diff >= 0 ? `de ${int(goals.kcal)} · te quedan <b>${int(diff)}</b>` : `de ${int(goals.kcal)} · <b class="over">te pasas ${int(-diff)}</b>`)
      : (diff > 0 ? `de ${int(goals.kcal)} · te faltan <b>${int(diff)}</b>` : `de ${int(goals.kcal)} · <b class="ok">objetivo cumplido</b>`);
  }
  const pK = protein * 4, cK = carbs * 4, fK = fat * 9, mt = pK + cK + fK || 1;
  const kcalPct = goals.kcal ? Math.min(100, kcal / goals.kcal * 100) : 0;
  const kcalColor = goals.mode === "max" && kcal > goals.kcal ? "#e5736b" : "#e0b467";

  const hoy = `<section class="card">
    <h2 class="card-h"><span class="h-dot" style="--c:var(--agenda)"></span>Hoy<span class="spacer"></span>${t ? `<small class="muted">Foodvisor · ${time(t.at)}</small>` : ""}</h2>
    ${t ? `
    <div class="nutri-hero">
      ${ring(kcalPct, kcalColor, { size: 76, stroke: 7, label: goals.kcal ? `${Math.round(kcal / goals.kcal * 100)}%` : "" })}
      <div class="t"><b class="num">${int(kcal)} kcal</b><small>${kcalLine || `<a href="#" data-act="nutri-goals">Pon un objetivo</a>`}</small></div>
    </div>
    <div class="macro"><span>Proteína</span><span class="num">${num1(protein)}${goals.protein ? ` / ${int(goals.protein)}` : ""} g</span></div>
    ${goals.protein ? `<div class="hb-track" style="--c:var(--hab)"><i style="width:${Math.min(100, protein / goals.protein * 100)}%"></i></div>` : ""}
    <div class="macro-split" aria-label="Reparto de calorías por macronutriente">
      <i style="width:${pK / mt * 100}%;background:var(--hab)"></i><i style="width:${cK / mt * 100}%;background:var(--agenda)"></i><i style="width:${fK / mt * 100}%;background:var(--work)"></i>
    </div>
    <div class="legend">
      <span style="--c:var(--hab)">Proteína ${Math.round(pK / mt * 100)} %</span>
      <span style="--c:var(--agenda)">Carbohidratos ${num1(carbs)} g · ${Math.round(cK / mt * 100)} %</span>
      <span style="--c:var(--work)">Grasas ${num1(fat)} g · ${Math.round(fK / mt * 100)} %</span>
    </div>` : `<div class="empty">Hoy aún no ha llegado nada de Foodvisor. Se actualiza a las 14:00, 18:00 y 23:45.</div>`}
  </section>`;

  // ---- Últimos 14 días
  const days = Array.from({ length: 14 }, (_, i) => iso(addDays(parseISO(today), i - 13)));
  const byDay = new Map(list.map(n => [n.date, n]));
  const last7 = days.slice(-8, -1).map(d => byDay.get(d)).filter(Boolean);    // 7 días cerrados (sin hoy)
  const avg = k => last7.length ? last7.reduce((a, n) => a + (n[k] || 0), 0) / last7.length : null;
  const kHabit = state.habits.habits.find(h => h.id === KCAL_HABIT && !h.archived);
  const inGoal = kHabit ? days.slice(-8, -1).filter(d => byDay.get(d) && meets(kHabit, byDay.get(d).kcal, d, today)).length : null;

  const evo = `<section class="card">
    <h2 class="card-h">Últimos 14 días<span class="spacer"></span><button class="btn small" type="button" data-act="nutri-goals">Objetivos</button></h2>
    <div class="week-stats">
      <div><b class="num">${avg("kcal") != null ? int(avg("kcal")) : "—"}</b><small>kcal de media (7 días)</small></div>
      <div><b class="num" style="color:var(--hab)">${avg("protein") != null ? int(avg("protein")) + " g" : "—"}</b><small>proteína de media</small></div>
      <div><b class="num">${inGoal != null ? `${inGoal}/7` : "—"}</b><small>días en objetivo</small></div>
    </div>
    ${stackChart(days.map((d, i) => ({ label: String(parseISO(d).getDate()), values: [byDay.get(d)?.kcal || 0], highlight: i === 13 })), { colors: ["#e0b467"], unit: "kcal", labelEvery: 2, goal: goals.kcal || null })}
    <div class="legend"><span style="--c:var(--agenda)">Calorías al día</span>${goals.kcal ? `<span style="--c:#ececee">Objetivo ${int(goals.kcal)} kcal</span>` : ""}</div>
  </section>`;

  return hoy + evo + nutriWeightCard(state);
}

// ---------- Objetivos (crean o actualizan los hábitos automáticos)
export function openNutritionGoals() {
  const g = getState().settings.nutritionGoals || {};
  const sheet = openSheet(`
    <h2>Objetivos de nutrición</h2>
    <form class="form" id="ng-form" novalidate>
      ${field("Calorías al día (kcal)", "ng-kcal", `<input class="input" id="ng-kcal" inputmode="numeric" autocomplete="off" value="${g.kcal || ""}" placeholder="2200">`)}
      <div class="field"><label>Tu objetivo de calorías es…</label>${seg("mode", { max: "No pasarme", min: "Llegar" }, g.mode || "max")}</div>
      <p class="hint">«No pasarme» para definición: cumples si el día termina sin superarlo. «Llegar» para volumen: cumples al alcanzarlo.</p>
      ${field("Proteína al día (g)", "ng-prot", `<input class="input" id="ng-prot" inputmode="numeric" autocomplete="off" value="${g.protein || ""}" placeholder="140">`)}
      <p class="hint">Cada objetivo se convierte en un hábito automático (con racha y XP) que se marca solo con los datos de Foodvisor. Deja un campo vacío para no usarlo.</p>
      <div class="btn-row"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
  sheet.querySelector("#ng-form").addEventListener("submit", e => {
    e.preventDefault();
    const kcal = Math.round(Number(sheet.querySelector("#ng-kcal").value.replace(/\D/g, ""))) || null;
    const protein = Math.round(Number(sheet.querySelector("#ng-prot").value.replace(/\D/g, ""))) || null;
    const mode = sheet.querySelector("[name=mode]:checked").value;
    update(s => {
      s.settings.nutritionGoals = { kcal, mode, protein };
      upsertHabit(s, KCAL_HABIT, kcal, { name: "Calorías", unit: "kcal", auto: "kcal", mode: mode === "max" ? "max" : null });
      upsertHabit(s, PROTEIN_HABIT, protein, { name: "Proteína", unit: "g", auto: "protein", mode: null });
    });
    closeSheet();
    toast("Objetivos guardados");
  });
}

function upsertHabit(s, id, targetValue, data) {
  const h = s.habits.habits.find(x => x.id === id);
  if (!targetValue) { if (h) h.archived = true; return; }
  const fields = { ...data, target: targetValue, step: targetValue, frequency: { type: "daily" }, archived: false };
  if (h) Object.assign(h, fields);
  else s.habits.habits.push({ id, ...fields, createdAt: iso() });
}
