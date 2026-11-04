// Botón "+": menú para apuntar algo rápido desde cualquier pantalla.
// Cada opción abrirá su formulario cuando se construya su sección.

import { openSheet, closeSheet, toast } from "./ui.js";
import { icon } from "./icons.js";

const OPTIONS = [
  { id: "money",  c: "var(--fin)",    icon: icon.money,    title: "Gasto o ingreso",       sub: "Movimiento o transferencia", phase: "Finanzas" },
  { id: "habit",  c: "var(--hab)",    icon: icon.habit,    title: "Hábito, sueño o ánimo", sub: "Registro de hoy",           phase: "Hábitos y deporte" },
  { id: "task",   c: "var(--agenda)", icon: icon.task,     title: "Tarea o evento",        sub: "Con fecha y prioridad",     phase: "Agenda" },
  { id: "train",  c: "var(--work)",   icon: icon.dumbbell, title: "Entreno o tiempo",      sub: "Trabajo, estudio, gimnasio, fútbol", phase: "Hábitos y deporte" }
];

// Registro de formularios: cada fase añadirá el suyo con registerQuickAction()
const actions = {};
export const registerQuickAction = (id, fn) => { actions[id] = fn; };

/** Abre el menú "Apuntar rápido" */
export function openQuickAdd() {
  const btn = document.getElementById("plus");
  btn.setAttribute("aria-expanded", "true");
  openSheet(`
    <h2>Apuntar rápido</h2>
    <div class="quick-grid">
      ${OPTIONS.map(o => `<button class="quick" type="button" data-q="${o.id}" style="--c:${o.c}">${o.icon}<b>${o.title}</b><small>${o.sub}</small></button>`).join("")}
    </div>`, {
    onOpen: sheet => sheet.addEventListener("click", e => {
      const b = e.target.closest("[data-q]");
      if (!b) return;
      const opt = OPTIONS.find(o => o.id === b.dataset.q);
      closeSheet();
      if (actions[opt.id]) actions[opt.id]();
      else toast(`Disponible cuando construyamos ${opt.phase}`);
    }),
    onClose: () => btn.setAttribute("aria-expanded", "false")
  });
}

export function initQuickAdd() {
  const btn = document.getElementById("plus");
  btn.setAttribute("aria-expanded", "false");
  btn.addEventListener("click", openQuickAdd);
}
