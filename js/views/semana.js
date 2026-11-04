// Resumen semanal: tarjeta de los lunes en el Resumen y pantalla «Semanas» para ver cualquier semana.

import { esc, int, money } from "../ui.js";
import { icon } from "../icons.js";
import { update } from "../state.js";
import { iso, addDays, parseISO, isoWeekday } from "../stats.js";
import { homeBtn } from "./area.js";
import { weekSummary, weekHasData, lastWeekStart } from "../trends.js";

const ui = { ws: null };   // semana visible en la pantalla (lunes AAAA-MM-DD); null = la pasada
const num1 = n => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(n);
const hours = min => `${num1(Math.round(min / 6) / 10)} h`;
const dm = s => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(parseISO(s)).replace(".", "");
export const weekRange = w => `${dm(w.start)} – ${dm(w.end)}`;

/** Comparación con la semana anterior. good: "down" si bajar es bueno (gasto) */
function vs(cur, prev, good = "up") {
  if (!prev && !cur) return "";
  if (!prev) return `<small class="wk-vs">la anterior: 0</small>`;
  const pct = Math.round((cur - prev) / prev * 100);
  if (!pct) return `<small class="wk-vs">igual que la anterior</small>`;
  const ok = good === "up" ? pct > 0 : pct < 0;
  return `<small class="wk-vs" style="color:${ok ? "var(--fin)" : "var(--agenda)"}">${pct > 0 ? "+" : "−"}${Math.abs(pct)} % vs anterior</small>`;
}

/** Cuadrícula con los datos de una semana */
export function weekGrid(w) {
  const tile = (label, value, sub = "", color = "") => `<div class="wk-tile"><small>${label}</small><b class="num"${color ? ` style="color:${color}"` : ""}>${value}</b>${sub}</div>`;
  const wd = w.weightDelta;
  return `<div class="wk-grid">
    ${tile("Gasto", money(w.spend), vs(w.spend, w.spendPrev, "down"), "var(--fin)")}
    ${tile("Estudio", hours(w.study), vs(w.study, w.studyPrev), "var(--work)")}
    ${tile("Trabajo", hours(w.work), vs(w.work, w.workPrev), "var(--work)")}
    ${tile("Entrenos", String(w.gym + w.futbol), `<small class="wk-vs">${w.gym} gimnasio · ${w.futbol} fútbol</small>`, "var(--hab)")}
    ${tile("Hábitos", w.habitTracked ? `${w.habitDays}/${w.habitTracked}` : "—", `<small class="wk-vs">días con todos cumplidos</small>`, "var(--hab)")}
    ${tile("Calorías", w.kcal != null ? `${int(w.kcal)} kcal` : "—", w.kcal != null ? `<small class="wk-vs">media de ${w.kcalDays} ${w.kcalDays === 1 ? "día" : "días"}${w.protein != null ? ` · ${int(w.protein)} g proteína` : ""}</small>` : "", "var(--agenda)")}
    ${tile("Peso", w.weight != null ? `${num1(w.weight)} kg` : "—", wd != null ? `<small class="wk-vs" style="color:${wd < -0.04 ? "var(--fin)" : wd > 0.04 ? "var(--agenda)" : ""}">${wd > 0.04 ? "+" : wd < -0.04 ? "−" : "±"}${num1(Math.abs(Math.round(wd * 10) / 10))} kg en la semana</small>` : "")}
    ${tile("Tareas", String(w.tasksDone), `<small class="wk-vs">hechas</small>`, "var(--agenda)")}
  </div>`;
}

/** Tarjeta del lunes en el Resumen (la semana pasada), hasta que se cierra */
export function weeklyBanner(state, today = iso()) {
  if (isoWeekday(parseISO(today)) !== 1) return "";
  const ws = lastWeekStart(today);
  if (state.settings.weeklySeen === ws) return "";
  const w = weekSummary(state, ws);
  if (!weekHasData(w)) return "";
  return `<section class="card weekly" aria-label="Resumen de la semana pasada">
    <h2 class="card-h"><span class="h-dot" style="--c:var(--cyan)"></span>Tu semana pasada<span class="spacer"></span><small class="muted">${weekRange(w)}</small></h2>
    ${weekGrid(w)}
    <div class="btn-row" style="margin-top:12px">
      <button class="btn" type="button" data-act="weekly-close" data-ws="${ws}">Cerrar</button>
      <a class="btn primary" href="#semana">Ver semanas</a>
    </div>
  </section>`;
}

/** Al cerrar la tarjeta: no volver a mostrarla esta semana (se guarda y se sincroniza) */
export const closeWeekly = ws => update(s => { s.settings.weeklySeen = ws; });

// ---------- Pantalla «Semanas»
export function render(state) {
  const today = iso();
  const ws = ui.ws || lastWeekStart(today);
  const w = weekSummary(state, ws);
  const isCurrent = ws > lastWeekStart(today);
  const label = isCurrent ? "Esta semana (en curso)" : ws === lastWeekStart(today) ? "Semana pasada" : `Semana del ${dm(ws)}`;
  return `
    <header class="topbar">
      ${homeBtn()}
      <h1 class="page-h">Semanas</h1>
    </header>
    <section class="card">
      <div class="month-nav" style="margin-top:0">
        <button class="icon-btn" type="button" data-act="wk" data-n="-1" aria-label="Semana anterior">${icon.back}</button>
        <b>${esc(label)}<small class="muted" style="display:block;font-weight:500">${weekRange(w)}</small></b>
        <button class="icon-btn" type="button" data-act="wk" data-n="1" aria-label="Semana siguiente"${isCurrent ? " disabled" : ""}>${icon.chevron}</button>
      </div>
      ${weekHasData(w) ? weekGrid(w) : `<div class="empty">No hay nada apuntado esta semana.</div>`}
      ${isCurrent ? `<p class="hint">La semana aún no ha terminado: los datos cambiarán hasta el domingo.</p>` : ""}
    </section>`;
}

export function mount(root, _state, signal) {
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-act=wk]");
    if (!b) return;
    const cur = parseISO(ui.ws || lastWeekStart());
    ui.ws = iso(addDays(cur, 7 * Number(b.dataset.n)));
    window.dispatchEvent(new Event("pv:render"));
  }, { signal });
}
