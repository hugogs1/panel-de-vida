// Pantalla Principal: Agenda Diaria, Bento Grid, Pulso de Salud y Cartera Inteligente.

import { AREAS, levelFromXp, titleFor } from "../game.js";
import { esc, int, money as eur, longDate, monthName, toast } from "../ui.js";
import { icon } from "../icons.js";
import { backupDue } from "../backup.js";
import { update } from "../state.js";
import { todayItems, streak, iso, parseISO } from "../stats.js";
import { habitsToday, habitValue, setHabitValue, AUTO_LABEL } from "../habits.js";
import { toggleTask } from "../agenda.js";
import { ring } from "../charts.js";
import { getWalletBudget } from "../finance.js";
import { weeklyBanner, closeWeekly } from "./semana.js";

const PRI = { alta: ["Alta", "var(--danger)"], media: ["Media", "var(--agenda)"], baja: ["Baja", "var(--muted)"] };
const num1 = n => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(n);
const signed = n => n > 0 ? `+${eur(n)}` : eur(n);

const greeting = () => {
  const h = new Date().getHours();
  return h < 6 ? "Buenas noches" : h < 14 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
};

export function render(state) {
  const g = state.game;
  const lv = levelFromXp(g.xp);
  const days = streak(state);
  const wallet = getWalletBudget(state);
  const { pending } = todayItems(state);
  const habitList = habitsToday(state);
  const doneHabits = habitList.filter(h => h.done).length;

  return `
    <header class="desk-greeting">
      <h1>${greeting()}, ${esc(state.profile.alias)}<span>${longDate()}</span></h1>
      <div class="streak${days ? "" : " off"}" title="Días seguidos apuntando algo">${icon.flame}<span class="num">${days} ${days === 1 ? "día" : "días"}</span></div>
    </header>
    <header class="topbar">
      <a class="logo" href="#resumen" aria-label="Resumen">PV</a>
      <div class="who"><div class="alias">${esc(state.profile.alias)}</div><div class="title">${titleFor(lv.level)} · Nv. ${lv.level}</div></div>
      <div class="streak${days ? "" : " off"}" title="Días seguidos apuntando algo">${icon.flame}<span class="num">${days}</span></div>
      <a class="icon-btn" href="#ajustes" aria-label="Ajustes">${icon.gear}</a>
    </header>

    ${banners(state)}
    ${weeklyBanner(state)}

    <!-- Barra de acceso rápido estilo Bento Agenda -->
    <div class="bento-nav">
      <a class="bento-pill" href="#agenda" style="--c:var(--agenda)">
        <span class="bp-icon">${icon.task}</span>
        <div class="bp-t"><b>Agenda</b><small>${pending.length} pendientes</small></div>
      </a>
      <a class="bento-pill" href="#habitos" style="--c:var(--hab)">
        <span class="bp-icon">${icon.habit}</span>
        <div class="bp-t"><b>Hábitos</b><small>${doneHabits}/${habitList.length} hoy</small></div>
      </a>
      <a class="bento-pill" href="#finanzas" style="--c:var(--fin)">
        <span class="bp-icon">${icon.money}</span>
        <div class="bp-t"><b>Cartera</b><small>${signed(wallet.remainingFree)}</small></div>
      </a>
    </div>

    <div class="cols">
      <!-- Columna 1: Agenda Diaria y Tareas de Hoy -->
      <div class="col col-1">
        ${todayCard(state)}
      </div>

      <!-- Columna 2: Salud, Hábitos y Deporte -->
      <div class="col col-2">
        ${healthCard(state)}
      </div>

      <!-- Columna 3: Cartera Inteligente y Nivel -->
      <div class="col col-3">
        ${walletCard(state, wallet)}
        ${levelCard(state, lv)}
      </div>
    </div>`;
}

function banners(state) {
  let out = "";
  if (state.settings.demo) out += `
    <div class="banner" style="--c:var(--cyan)">${icon.sparkle}
      <div class="t"><b>Estás viendo datos de ejemplo</b>Quítalos en Ajustes cuando quieras empezar con los tuyos.</div>
      <a class="btn small" href="#ajustes">Ajustes</a>
    </div>`;
  else if (backupDue(state)) out += `
    <div class="banner" style="--c:var(--warn)">${icon.download}
      <div class="t"><b>Haz una copia de seguridad</b>${state.settings.lastBackupAt ? "Hace más de 7 días de la última." : "Todavía no has exportado ninguna."}</div>
      <a class="btn small" href="#ajustes">Copiar</a>
    </div>`;
  return out;
}

// ---------- 1. Tarjeta de Agenda del Día
function todayCard(state) {
  const { pending, done, total } = todayItems(state);
  const header = `
    <h2 class="card-h">
      <span class="h-dot" style="--c:var(--agenda)"></span>Agenda de Hoy · ${longDate()}
      <span class="spacer"></span>
      ${total ? `<span class="count num">${done.length}/${total}</span>` : ""}
      <a href="#agenda">Ver todo →</a>
    </h2>`;

  if (!total) {
    return `
      <section class="card bento-card">
        ${header}
        <div class="empty">
          No tienes tareas ni eventos para hoy.<br>Pulsa el botón <b>+</b> para apuntar algo rápido.
        </div>
        <div class="card-footer-link">
          <a class="btn small" href="#agenda">Abrir calendario y tareas</a>
        </div>
      </section>`;
  }

  const row = it => {
    if (it.kind === "event") return `
      <div class="item">
        <span class="tick event">${icon.clock}</span>
        <div class="t">${esc(it.title)}<small>Evento${it.place ? ` · ${esc(it.place)}` : ""}</small></div>
        <span class="tag num" style="--c:var(--agenda)">${it.time}</span>
      </div>`;
    const [pl, pc] = PRI[it.priority] || PRI.media;
    return `
      <button class="item tap${it.done ? " is-done" : ""}" type="button" data-task="${it.id}" aria-pressed="${!!it.done}">
        <span class="tick" style="--c:${pc}">${icon.check}</span>
        <span class="t">${esc(it.title)}<small>${it.overdue ? `<span style="color:var(--danger)">Atrasada</span>` : "Tarea"}${it.time ? ` · antes de las ${it.time}` : ""}</small></span>
        ${it.done ? "" : `<span class="tag" style="--c:${pc}">${pl}</span>`}
      </button>`;
  };

  return `
    <section class="card bento-card">
      ${header}
      <div class="list">${pending.map(row).join("")}${done.map(row).join("")}</div>
      <div class="card-footer-link">
        <a class="btn small" href="#agenda">Ver agenda completa →</a>
      </div>
    </section>`;
}

// ---------- 2. Tarjeta de Salud y Hábitos
function healthCard(state) {
  const list = habitsToday(state);
  const doneN = list.filter(h => h.done).length;
  const header = `
    <h2 class="card-h">
      <span class="h-dot" style="--c:var(--hab)"></span>Pulso de Salud y Hábitos
      <span class="spacer"></span>
      ${list.length ? `<span class="count num">${doneN}/${list.length}</span>` : ""}
      <a href="#habitos">Detalles →</a>
    </h2>`;

  // Comprobar si hay hábito de pasos o datos de reloj
  const stepHabit = list.find(h => (h.name || "").toLowerCase().includes("paso") || (h.unit || "").toLowerCase().includes("paso"));
  const lastSleep = [...(state.habits.sleep || [])].sort((a, b) => b.date.localeCompare(a.date))[0];

  let stepsWidget = "";
  if (stepHabit) {
    const val = stepHabit.value || 0;
    const tgt = stepHabit.target || 10000;
    const pct = Math.min(100, Math.round((val / tgt) * 100));
    stepsWidget = `
      <div class="health-step-card">
        <div class="hsc-top">
          <span>👟 Pasos de hoy</span>
          <b class="num">${num1(val)} / ${num1(tgt)}</b>
        </div>
        <div class="hsc-bar"><i style="width:${pct}%"></i></div>
        <div class="hsc-sub">${pct >= 100 ? "¡Objetivo alcanzado!" : `Faltan ${num1(Math.max(0, tgt - val))} pasos (${pct}%)`}</div>
      </div>`;
  }

  let sleepWidget = "";
  if (lastSleep) {
    sleepWidget = `
      <div class="health-mini-metric">
        <span>🌙 Último sueño registrado: <b class="num">${num1(lastSleep.hours)} h</b></span>
      </div>`;
  }

  if (!state.habits.habits.length) {
    return `
      <section class="card bento-card">
        ${header}
        <div class="empty">Aún no tienes hábitos configurados.<br>Entra en <b>Hábitos</b> para activar el seguimiento.</div>
        <div class="card-footer-link"><a class="btn small" href="#habitos">Configurar hábitos</a></div>
      </section>`;
  }

  return `
    <section class="card bento-card">
      ${header}
      ${stepsWidget}
      ${sleepWidget}
      ${list.length ? `
        <div class="list">${list.map(h => `
          <button class="item tap${h.done ? " is-done" : ""}" type="button" data-habit="${h.id}"${h.auto ? ` data-auto="${h.auto}"` : ""} aria-pressed="${h.done}">
            ${ring(h.pct, "#e88fb4", { size: 34, stroke: 4 })}
            <span class="t">${esc(h.name)}<small class="num">${num1(h.value)} / ${num1(h.target)} ${esc(h.unit)}</small></span>
            <span class="tick" style="--c:var(--hab)">${icon.check}</span>
          </button>`).join("")}</div>
      ` : `<div class="empty">Hoy no tienes hábitos programados.</div>`}
      <div class="card-footer-link">
        <a class="btn small" href="#habitos">Ver hábitos y entrenos →</a>
      </div>
    </section>`;
}

// ---------- 3. Tarjeta de Cartera y Balance
function walletCard(state, w) {
  const header = `
    <h2 class="card-h">
      <span class="h-dot" style="--c:var(--fin)"></span>Cartera · ${monthName()}
      <span class="spacer"></span>
      <a href="#finanzas">Ver Cartera →</a>
    </h2>`;

  if (!state.finance.accounts.length) {
    return `
      <section class="card bento-card">
        ${header}
        <div class="empty">Crea tus cuentas en <b>Finanzas</b> para activar el balance de ingresos y gastos fijos.</div>
        <div class="card-footer-link"><a class="btn small primary" href="#finanzas">Crear cuenta</a></div>
      </section>`;
  }

  const isHealthy = w.remainingFree >= (w.totalIncome * 0.2);
  const isTight = w.remainingFree >= 0 && !isHealthy;
  const isDeficit = w.remainingFree < 0;

  const badgeHtml = w.totalIncome === 0
    ? `<span class="tag" style="--c:var(--muted)">Sin sueldo fijado</span>`
    : isDeficit
      ? `<span class="tag" style="--c:var(--danger)">🔴 Déficit ${eur(Math.abs(w.remainingFree))}</span>`
      : isTight
        ? `<span class="tag" style="--c:var(--warn)">🟡 Ajustado</span>`
        : `<span class="tag" style="--c:var(--ok)">🟢 Saludable</span>`;

  return `
    <section class="card bento-card wallet-bento">
      ${header}
      <div class="wb-top">
        <div>
          <span class="sub-label">Dinero disponible restante</span>
          <div class="money-big num ${w.remainingFree >= 0 ? "pos" : "neg"}">${signed(w.remainingFree)}</div>
        </div>
        ${badgeHtml}
      </div>

      <div class="wallet-progress-wrap" style="margin:8px 0 12px">
        <div class="wallet-progress-bar">
          <i style="width:${Math.max(2, w.burnPct)}%; background:${isDeficit ? "var(--danger)" : isTight ? "var(--warn)" : "var(--fin)"}"></i>
        </div>
        <div class="wallet-progress-labels">
          <span>${w.burnPct}% gastado</span>
          <span>${w.isCurrentMonth ? `~${eur(w.dailyBudget)}/día restantes` : "Mes cerrado"}</span>
        </div>
      </div>

      <div class="split three" style="margin-top:0">
        <div><small>Ingreso</small><b class="num pos">+${eur(w.totalIncome)}</b></div>
        <div><small>Fijos</small><b class="num neg">-${eur(w.fixedMonthlyTotal)}</b></div>
        <div><small>Gastado</small><b class="num neg">-${eur(w.variableSpent)}</b></div>
      </div>

      <div class="card-footer-link">
        <a class="btn small" href="#finanzas">Abrir cartera y simulador →</a>
      </div>
    </section>`;
}

// ---------- 4. Tarjeta de Nivel y Logros
function levelCard(state, lv) {
  const g = state.game;
  return `
    <section class="card bento-card hud" aria-label="Experiencia">
      <a class="xpmeta xp-link" href="#logros">
        <span>Nivel de vida · <b class="num">${(g.achievements || []).length}</b> logros</span>
        <span class="num">${int(lv.into)} / ${int(lv.need)} ${icon.chevron}</span>
      </a>
      <div class="xpbar"><i style="width:${lv.pct}%"></i></div>
      <div class="area-levels" style="grid-template-columns: repeat(3, minmax(0, 1fr))">
        ${Object.values(AREAS).map(a => {
          const al = levelFromXp(g.areaXp[a.key] || 0);
          return `<a href="#${a.route}" style="--c:${a.color}"><div class="lbl">${a.short}</div><div class="lv">Nv. ${al.level}</div><div class="mini"><i style="width:${al.pct}%"></i></div></a>`;
        }).join("")}
      </div>
    </section>`;
}

// ---------- Interacción: marcar tareas y hábitos desde el resumen
export function mount(root, _state, signal) {
  root.addEventListener("click", e => {
    const wc = e.target.closest("[data-act=weekly-close]");
    if (wc) { closeWeekly(wc.dataset.ws); toast("Lo tienes cuando quieras en «Semanas»"); return; }
    const t = e.target.closest("[data-task]");
    if (t) {
      let r = null;
      update(s => { r = toggleTask(s, t.dataset.task); });
      if (r?.next) toast(`Hecha · la siguiente es el ${parseISO(r.next).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`);
      return;
    }
    const h = e.target.closest("[data-habit]");
    if (h?.dataset.auto) { toast(`Se marca solo al apuntar ${AUTO_LABEL[h.dataset.auto]}`); return; }
    if (h) {
      update(s => {
        const habit = s.habits.habits.find(x => x.id === h.dataset.habit);
        if (!habit || habit.auto) return;
        const today = iso();
        const value = habitValue(s, habit, today);
        setHabitValue(s, habit.id, today, value >= (habit.target || 1) ? 0 : habit.target || 1);
      });
    }
  }, { signal });
}
