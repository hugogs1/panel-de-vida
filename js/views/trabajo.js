// Trabajo y estudios: horas por semana, proyectos con hitos y aprendizaje.

import { areaHeader } from "./area.js";
import { esc, openSheet, closeSheet, toast } from "../ui.js";
import { getState } from "../state.js";
import { icon } from "../icons.js";
import { addDays, parseISO } from "../stats.js";
import { stackChart, ring } from "../charts.js";
import { registerQuickAction } from "../quickadd.js";
import { KINDS, KIND_COLOR, LEARN_TYPES, fmtMin, fmtHours, weekBreakdown, weeksHistory, projectStats } from "../work.js";
import { openTimeForm, openProjectForm, openProjectDetail, openLearnForm, stepLearn } from "./trabajo-forms.js";
import { openWorkoutForm, openFutbolForm } from "./deporte-forms.js";

const ui = { tab: "tiempo", week: 0, archived: false };
const TABS = { tiempo: "Tiempo", proyectos: "Proyectos", aprendizaje: "Aprendizaje" };
const DAYS = ["L", "M", "X", "J", "V", "S", "D"];

// Botón "+" → "Entreno o tiempo"
registerQuickAction("train", () => {
  const sheet = openSheet(`
    <h2>¿Qué quieres apuntar?</h2>
    <div class="quick-grid">
      <button class="quick" type="button" data-pick="trabajo" style="--c:var(--work)">${icon.work}<b>Tiempo de trabajo</b><small>Horas en un proyecto o tarea</small></button>
      <button class="quick" type="button" data-pick="estudio" style="--c:var(--cyan)">${icon.clock}<b>Tiempo de estudio</b><small>Clases, repaso, cursos…</small></button>
      <button class="quick" type="button" data-pick="gym" style="--c:var(--hab)">${icon.dumbbell}<b>Gimnasio</b><small>Con tus rutinas</small></button>
      <button class="quick" type="button" data-pick="futbol" style="--c:var(--hab)">${icon.ball}<b>Fútbol</b><small>Sesión y minutos</small></button>
    </div>`);
  sheet.addEventListener("click", e => {
    const b = e.target.closest("[data-pick]");
    if (!b) return;
    closeSheet();
    if (b.dataset.pick === "trabajo" || b.dataset.pick === "estudio") openTimeForm({ kind: b.dataset.pick });
    else if (b.dataset.pick === "gym") {
      if (getState().settings.gymSource === "hevy") toast("Apunta el entreno en Hevy y luego impórtalo en Hábitos → Gimnasio", { ms: 4000 });
      else openWorkoutForm();
    }
    else openFutbolForm();
  });
});

const fmtDay = s => { const t = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "short" }).format(parseISO(s)); return t[0].toUpperCase() + t.slice(1); };
const fmtShort = s => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(parseISO(s));

export function render(state) {
  const ref = addDays(new Date(), ui.week * 7);
  const wk = weekBreakdown(state, ref);
  const prev = weekBreakdown(state, addDays(ref, -7));
  const total = wk.minTrabajo + wk.minEstudio, prevTotal = prev.minTrabajo + prev.minEstudio;
  const diff = prevTotal ? Math.round((total - prevTotal) / prevTotal * 100) : null;
  const weekTitle = ui.week === 0 ? "Esta semana" : ui.week === -1 ? "Semana pasada" : `Semana del ${fmtShort(wk.start)}`;

  return `
    ${areaHeader(state, "work")}

    <section class="card">
      <h2 class="card-h"><span class="h-dot" style="--c:var(--work)"></span>${weekTitle}<span class="spacer"></span></h2>
      <div class="month-nav">
        <button class="icon-btn" type="button" data-act="week" data-n="-1" aria-label="Semana anterior">${icon.back}</button>
        <b>${fmtShort(wk.start)} – ${fmtShort(wk.end)}</b>
        <button class="icon-btn" type="button" data-act="week" data-n="1" aria-label="Semana siguiente"${ui.week >= 0 ? " disabled" : ""}>${icon.chevron}</button>
      </div>
      <div class="week-stats">
        <div><b class="num" style="color:var(--work)">${fmtHours(wk.minTrabajo)}</b><small>trabajo</small></div>
        <div><b class="num" style="color:#8fd3bf">${fmtHours(wk.minEstudio)}</b><small>estudio</small></div>
        <div><b class="num">${fmtHours(total)}</b><small>${diff == null ? "total" : `${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff)} % vs. anterior`}</small></div>
      </div>
      ${stackChart(wk.days.map((d, i) => ({ label: DAYS[i], values: wk.trabajo[i] == null ? null : [wk.trabajo[i], wk.estudio[i]], highlight: i === wk.todayIdx })), { colors: [KIND_COLOR.trabajo, KIND_COLOR.estudio] })}
      <div class="legend"><span style="--c:var(--work)">Trabajo</span><span style="--c:#8fd3bf">Estudio</span></div>
    </section>

    <div class="chips" role="tablist">${Object.entries(TABS).map(([k, l]) =>
      `<button type="button" role="tab" class="chip" data-act="tab" data-tab="${k}" aria-selected="${ui.tab === k}">${l}</button>`).join("")}</div>

    ${({ tiempo: tiempoTab, proyectos: proyectosTab, aprendizaje: aprendizajeTab })[ui.tab](state, wk)}`;
}

// ---------- Tiempo: registros de la semana + historial de 8 semanas
function tiempoTab(state, wk) {
  const projName = id => state.work.projects.find(p => p.id === id)?.name;
  const list = state.work.entries.filter(e => e.date >= wk.start && e.date <= wk.end).sort((a, b) => b.date.localeCompare(a.date));
  const days = new Map();
  list.forEach(e => { if (!days.has(e.date)) days.set(e.date, []); days.get(e.date).push(e); });
  const hist = weeksHistory(state, 8);
  const anyHist = hist.some(w => w.trabajo + w.estudio > 0);

  return `
    <section class="card">
      <div class="btn-row"><button class="btn primary" type="button" data-act="new-time">${icon.plus} Apuntar tiempo</button></div>
      ${list.length ? [...days.entries()].map(([d, es]) => `
        <div class="day-h"><span>${fmtDay(d)}</span><span class="num">${fmtMin(es.reduce((s, e) => s + e.minutes, 0))}</span></div>
        <div class="list tight">${es.map(e => `
          <button class="item tap" type="button" data-act="edit-time" data-id="${e.id}">
            <span class="cat-ico" style="--c:${KIND_COLOR[e.kind]}"></span>
            <span class="t">${esc(projName(e.projectId) || e.note || KINDS[e.kind])}<small>${KINDS[e.kind]}${e.projectId && e.note ? ` · ${esc(e.note)}` : ""}</small></span>
            <b class="num">${fmtMin(e.minutes)}</b>
          </button>`).join("")}</div>`).join("")
      : `<div class="empty">Sin horas apuntadas esta semana.<br>Pulsa <b>Apuntar tiempo</b> o el botón <b>+</b>.</div>`}
    </section>
    ${anyHist ? `<section class="card">
      <h2 class="card-h">Últimas 8 semanas</h2>
      ${stackChart(hist.map((w, i) => ({ label: w.label, values: [w.trabajo / 60, w.estudio / 60], highlight: i === hist.length - 1 })), { colors: [KIND_COLOR.trabajo, KIND_COLOR.estudio], labelEvery: 2 })}
      <div class="legend"><span style="--c:var(--work)">Trabajo</span><span style="--c:#8fd3bf">Estudio</span></div>
    </section>` : ""}`;
}

// ---------- Proyectos y objetivos
function proyectosTab(state) {
  const all = state.work.projects;
  const active = all.filter(p => !p.archived), archived = all.filter(p => p.archived);
  const shown = ui.archived ? archived : active;
  const card = p => {
    const s = projectStats(state, p);
    const color = KIND_COLOR[p.kind];
    return `<button class="proj tap" type="button" data-act="open-proj" data-id="${p.id}" style="--c:${color}">
      ${ring(s.pct, color, { size: 52, stroke: 5, label: s.total ? `${s.pct}%` : "—" })}
      <span class="t">
        <b>${esc(p.name)}</b>
        <small>${s.total ? `${s.done}/${s.total} hitos` : "Sin hitos"} · ${fmtMin(s.minutes)}${s.weekMinutes ? ` (${fmtMin(s.weekMinutes)} esta semana)` : ""}</small>
        ${s.next ? `<small class="next">Siguiente: ${esc(s.next.name)}</small>` : ""}
      </span>
      <span class="proj-side">
        <span class="tag" style="--c:${color}">${KINDS[p.kind]}</span>
        ${s.daysLeft != null && s.pct < 100 ? `<small class="${s.daysLeft < 0 ? "late" : s.daysLeft <= 7 ? "soon" : ""}">${s.daysLeft < 0 ? "Vencido" : s.daysLeft === 0 ? "Hoy" : `${s.daysLeft} d`}</small>` : ""}
      </span>
    </button>`;
  };
  return `<section class="card">
    <div class="btn-row"><button class="btn primary" type="button" data-act="new-proj">${icon.plus} Nuevo proyecto</button></div>
    ${shown.length ? `<div class="projs">${shown.map(card).join("")}</div>` :
      `<div class="empty">${ui.archived ? "No hay proyectos archivados." : "Crea un proyecto u objetivo (un informe, aprobar una asignatura…) y divídelo en hitos."}</div>`}
    ${archived.length || ui.archived ? `<button class="btn small link-btn" type="button" data-act="toggle-arch">${ui.archived ? "Ver activos" : `Ver archivados (${archived.length})`}</button>` : ""}
  </section>`;
}

// ---------- Aprendizaje
function aprendizajeTab(state) {
  const items = [...state.work.learning].sort((a, b) => (a.done >= a.total) - (b.done >= b.total));
  return `<section class="card">
    <div class="btn-row"><button class="btn primary" type="button" data-act="new-learn">${icon.plus} Nuevo curso, libro o habilidad</button></div>
    ${items.length ? `<div class="learns">${items.map(l => {
      const pct = Math.round(l.done / l.total * 100), fin = l.done >= l.total;
      return `<div class="learn${fin ? " finished" : ""}">
        <button class="learn-main" type="button" data-act="edit-learn" data-id="${l.id}">
          <span class="learn-top"><b>${esc(l.name)}</b><span class="tag" style="--c:var(--cyan)">${LEARN_TYPES[l.type]}</span></span>
          <span class="hb-track" style="--c:var(--cyan)"><i style="width:${Math.max(2, pct)}%"></i></span>
          <small class="num">${l.done} / ${l.total} ${esc(l.unit)} · ${pct} %${fin ? " · Terminado" : ""}</small>
        </button>
        <div class="stepper">
          <button class="btn small" type="button" data-act="step" data-id="${l.id}" data-n="-1" aria-label="Restar uno a ${esc(l.name)}">−1</button>
          <button class="btn small primary" type="button" data-act="step" data-id="${l.id}" data-n="1" aria-label="Sumar uno a ${esc(l.name)}"${fin ? " disabled" : ""}>+1</button>
        </div>
      </div>`;
    }).join("")}</div>` : `<div class="empty">Añade cursos, libros o habilidades y ve marcando tu progreso con <b>+1</b>.</div>`}
  </section>`;
}

// ---------- Interacción
export function mount(root, _state, signal) {
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const id = b.dataset.id;
    const rerender = () => window.dispatchEvent(new Event("pv:render"));
    switch (b.dataset.act) {
      case "tab": ui.tab = b.dataset.tab; rerender(); break;
      case "week": ui.week = Math.min(0, ui.week + Number(b.dataset.n)); rerender(); break;
      case "toggle-arch": ui.archived = !ui.archived; rerender(); break;
      case "new-time": openTimeForm(); break;
      case "edit-time": openTimeForm({ id }); break;
      case "new-proj": openProjectForm(); break;
      case "open-proj": openProjectDetail(id); break;
      case "new-learn": openLearnForm(); break;
      case "edit-learn": openLearnForm(id); break;
      case "step": stepLearn(id, Number(b.dataset.n)); break;
    }
  }, { signal });
}
