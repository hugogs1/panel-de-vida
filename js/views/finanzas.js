// Finanzas: Cartera inteligente, balance mensual, asesor de viabilidad, gastos fijos y cuentas.

import { areaHeader } from "./area.js";
import { esc, money } from "../ui.js";
import { icon } from "../icons.js";
import { iso, parseISO } from "../stats.js";
import { areaChart, ring } from "../charts.js";
import { registerQuickAction } from "../quickadd.js";
import {
  ACCOUNT_TYPES, FREQS, accountBalance, totalBalance, monthSummary,
  balanceHistory, catLabel, catColor, getWalletBudget, checkExpenseViability,
  perMonth, parseAmount
} from "../finance.js";
import {
  openTxForm, openAccountForm, openRecurringForm, openGoalForm,
  openContribute, openCategories, openMonthlyIncomeForm
} from "./finanzas-forms.js";

// Estado de la pantalla (no se guarda): pestaña, mes visible y simulador
const ui = { tab: "cartera", ym: iso().slice(0, 7), open: null, acc: null, simAmount: "", simResult: null };
const TABS = {
  cartera: "Cartera y Balance",
  fijos: "Gastos Fijos",
  movs: "Movimientos",
  gastos: "Por Categoría",
  metas: "Metas",
  cuentas: "Cuentas"
};

registerQuickAction("money", () => openTxForm());

const monthLabel = ym => {
  const [y, m] = ym.split("-").map(Number);
  const s = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const shiftMonth = (ym, n) => { const [y, m] = ym.split("-").map(Number); return iso(new Date(y, m - 1 + n, 1)).slice(0, 7); };
const shortDate = s => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(parseISO(s));
const dayLabel = s => { const t = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "short" }).format(parseISO(s)); return t.charAt(0).toUpperCase() + t.slice(1); };
const signed = n => n > 0 ? `+${money(n)}` : money(n);

export function render(state) {
  const fin = state.finance;
  if (!fin.accounts.length) return `
    ${areaHeader(state, "fin")}
    <section class="card onboarding" style="--c:var(--fin)">
      ${icon.fin}
      <h2>Empieza creando tu primera cuenta</h2>
      <p>Una cuenta es donde está tu dinero: tu banco principal, tu efectivo o una cuenta de ahorros. Pon el saldo que tienes hoy para activar tu cartera inteligente.</p>
      <button class="btn primary" type="button" data-act="new-account">Crear mi primera cuenta</button>
    </section>`;

  const sum = monthSummary(state, ui.ym);
  const wallet = getWalletBudget(state, ui.ym);
  const isCurrent = ui.ym === iso().slice(0, 7);
  if (ui.acc && !fin.accounts.some(a => a.id === ui.acc)) ui.acc = null;
  const acc = ui.acc && fin.accounts.find(a => a.id === ui.acc);
  const hist = balanceHistory(state, ui.ym, 6, acc?.id);

  return `
    ${areaHeader(state, "fin")}

    <!-- Tarjeta Resumen de Saldo y Cuentas -->
    <section class="card">
      <div class="month-nav">
        <button class="icon-btn" type="button" data-act="month" data-n="-1" aria-label="Mes anterior">${icon.back}</button>
        <b>${monthLabel(ui.ym)}</b>
        <button class="icon-btn" type="button" data-act="month" data-n="1" aria-label="Mes siguiente"${isCurrent ? " disabled" : ""}>${icon.chevron}</button>
      </div>

      <h2 class="card-h"><span class="h-dot" style="--c:var(--fin)"></span>${acc ? esc(acc.name) : "Saldo total en cuentas"}<span class="spacer"></span></h2>
      ${fin.accounts.length > 1 ? `<div class="chips acc-chips" role="tablist" aria-label="Ver saldo de">
        <button type="button" role="tab" class="chip small" data-act="acc" data-id="" aria-selected="${!acc}">Total</button>
        ${fin.accounts.map(a => `<button type="button" role="tab" class="chip small" data-act="acc" data-id="${a.id}" aria-selected="${acc?.id === a.id}">${esc(a.name)}</button>`).join("")}
      </div>` : ""}
      <div class="money-big num">${money(acc ? accountBalance(state, acc.id) : totalBalance(state))}</div>
      <div class="money-sub">${acc ? ACCOUNT_TYPES[acc.type] || "Cuenta" : `${fin.accounts.length} cuenta${fin.accounts.length > 1 ? "s" : ""}`}</div>

      ${areaChart(hist, { color: "#7fcf9b", format: v => money(v).replace(/,\d\d €$/, " €"), id: "bal" })}
      <div class="legend"><span style="--c:var(--fin)">${acc ? `Saldo de ${esc(acc.name)}` : "Saldo total"} a final de cada mes</span></div>
    </section>

    <!-- Selector de Pestañas de Finanzas -->
    <div class="chips" role="tablist">${Object.entries(TABS).map(([k, l]) =>
      `<button type="button" role="tab" class="chip" data-act="tab" data-tab="${k}" aria-selected="${ui.tab === k}">${l}</button>`).join("")}</div>

    <!-- Contenido de la pestaña activa -->
    ${({
      cartera: () => carteraTab(state, wallet, sum),
      fijos: () => fijosTab(state, wallet),
      movs: () => movsTab(state),
      gastos: () => gastosTab(state, sum),
      metas: () => metasTab(state),
      cuentas: () => cuentasTab(state)
    })[ui.tab]()}`;
}

// ---------- 1. Cartera Inteligente y Balance
function carteraTab(state, w, sum) {
  const isHealthy = w.remainingFree >= (w.totalIncome * 0.2);
  const isTight = w.remainingFree >= 0 && !isHealthy;
  const isDeficit = w.remainingFree < 0;

  const statusBadge = w.totalIncome === 0
    ? `<span class="tag" style="--c:var(--muted)">Sin ingreso mensual</span>`
    : isDeficit
      ? `<span class="tag" style="--c:var(--danger)">🔴 Déficit de ${money(Math.abs(w.remainingFree))}</span>`
      : isTight
        ? `<span class="tag" style="--c:var(--warn)">🟡 Margen ajustado</span>`
        : `<span class="tag" style="--c:var(--ok)">🟢 Presupuesto saludable</span>`;

  return `
    <section class="card wallet-card">
      <div class="wallet-head">
        <div>
          <span class="sub-label">Cartera · ${monthLabel(ui.ym)}</span>
          <div class="money-big num ${w.remainingFree >= 0 ? "pos" : "neg"}">${signed(w.remainingFree)}</div>
          <div class="money-sub">Dinero libre disponible (después de fijos y gastos)</div>
        </div>
        <div class="wallet-badge">${statusBadge}</div>
      </div>

      <div class="wallet-progress-wrap">
        <div class="wallet-progress-bar">
          <i style="width:${Math.max(2, w.burnPct)}%; background:${isDeficit ? "var(--danger)" : isTight ? "var(--warn)" : "var(--fin)"}"></i>
        </div>
        <div class="wallet-progress-labels">
          <span><b>${w.burnPct}%</b> del presupuesto comprometido</span>
          <span>${w.isCurrentMonth ? `Te quedan ${w.daysLeft} días (~${money(w.dailyBudget)}/día)` : "Mes cerrado"}</span>
        </div>
      </div>

      <div class="wallet-metrics-grid">
        <div class="metric-box">
          <div class="mb-top">
            <small>Ingresos del mes</small>
            <button class="btn-link" type="button" data-act="set-income">✏️ ${w.configuredIncome > 0 ? "Modificar" : "Configurar"}</button>
          </div>
          <b class="num pos">+${money(w.totalIncome)}</b>
          <span class="mb-sub">${w.configuredIncome > 0 ? "Sueldo registrado" : "Movimientos reales"}</span>
        </div>

        <div class="metric-box">
          <div class="mb-top">
            <small>Gastos Fijos</small>
            <button class="btn-link" type="button" data-act="tab" data-tab="fijos">Ver ${w.fixedCount}</button>
          </div>
          <b class="num neg">-${money(w.fixedMonthlyTotal)}</b>
          <span class="mb-sub">Alquiler, facturas y subs</span>
        </div>

        <div class="metric-box">
          <div class="mb-top">
            <small>Gastos Variables</small>
            <button class="btn-link" type="button" data-act="tab" data-tab="movs">Ver movs</button>
          </div>
          <b class="num neg">-${money(w.variableSpent)}</b>
          <span class="mb-sub">Compras de este mes</span>
        </div>

        <div class="metric-box highlight">
          <div class="mb-top">
            <small>Dinero Libre Restante</small>
          </div>
          <b class="num ${w.remainingFree >= 0 ? "pos" : "neg"}">${signed(w.remainingFree)}</b>
          <span class="mb-sub">${w.remainingFree >= 0 ? `~${money(w.dailyBudget)} por día` : "En descubierto"}</span>
        </div>
      </div>
    </section>

    <!-- Asesor de Viabilidad de Gastos ("¿Puedo permitírmelo?") -->
    <section class="card advisor-card">
      <h2 class="card-h">
        <span class="h-dot" style="--c:var(--cyan)"></span>Asesor de Viabilidad · ¿Puedo permitírmelo?
      </h2>
      <p class="hint">Escribe el importe de una compra o gasto que estés pensando hacer. El sistema comprobará al instante tu dinero libre restante tras gastos fijos y te dirá si es viable.</p>
      
      <div class="advisor-input-row">
        <div class="amount-wrap advisor-amount-wrap">
          <input class="input" id="advisor-amount-input" inputmode="decimal" autocomplete="off" placeholder="p. ej. 60" value="${ui.simAmount || ""}">
          <span>€</span>
        </div>
        <button class="btn primary" type="button" id="advisor-check-btn">Comprobar</button>
      </div>

      <div id="advisor-result" class="advisor-result-box ${ui.simResult ? `is-${ui.simResult.status}` : ""}" ${ui.simResult ? "" : "hidden"}>
        ${ui.simResult ? `
          <div class="adv-badge">${ui.simResult.badge}</div>
          <p class="adv-text">${esc(ui.simResult.message)}</p>
          <div class="btn-row" style="margin-top:8px">
            <button class="btn small primary" type="button" data-act="quick-spend" data-amount="${ui.simAmount}">+ Apuntar este gasto ahora</button>
          </div>
        ` : ""}
      </div>
    </section>

    <!-- Acceso rápido a Fijos y Movimientos -->
    <section class="card">
      <div class="split-cards-row">
        <div class="split-card-item">
          <h3 class="card-sub-h">Gastos Fijos Comprometidos (${w.fixedCount})</h3>
          <p class="hint">Alquiler, facturas y suscripciones aseguradas cada mes.</p>
          <b class="num neg" style="font-size:18px;display:block;margin:6px 0">-${money(w.fixedMonthlyTotal)} / mes</b>
          <div class="btn-row">
            <button class="btn small" type="button" data-act="tab" data-tab="fijos">Gestionar fijos →</button>
            <button class="btn small primary" type="button" data-act="new-rec">+ Añadir fijo</button>
          </div>
        </div>
        <div class="split-card-item">
          <h3 class="card-sub-h">Acciones Rápidas</h3>
          <p class="hint">Registra un gasto o ingreso al momento.</p>
          <div class="btn-row" style="margin-top:12px">
            <button class="btn small primary" type="button" data-act="new-tx">${icon.plus} Nuevo gasto / ingreso</button>
            <button class="btn small" type="button" data-act="set-income">Sueldo mensual</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

// ---------- 2. Gastos Fijos y Suscripciones
function fijosTab(state, w) {
  const rec = [...state.finance.recurring].sort((a, b) => (a.active === false) - (b.active === false) || (a.nextDate || "").localeCompare(b.nextDate || ""));
  const fixedExpensesOnly = rec.filter(r => r.amount < 0);
  const fixedTotal = Math.abs(fixedExpensesOnly.filter(r => r.active !== false).reduce((s, r) => s + perMonth(r), 0));

  return `<section class="card">
    <h2 class="card-h"><span class="h-dot" style="--c:var(--fin)"></span>Tus Gastos Fijos y Suscripciones<span class="spacer"></span><button class="btn primary small" type="button" data-act="new-rec">${icon.plus} Nuevo fijo</button></h2>
    <p class="hint">Son tus pagos fijos comprometidos (alquiler, gimnasio, internet, streaming). Tu cartera los tiene siempre en cuenta para calcular tu dinero libre real.</p>
    
    <div class="split" style="margin:14px 0">
      <div><small>Total fijos comprometidos</small><b class="num neg">-${money(fixedTotal)} / mes</b></div>
      <div><small>Fijos activos programados</small><b class="num">${fixedExpensesOnly.filter(r => r.active !== false).length} activos</b></div>
    </div>

    ${rec.length ? `
      <div class="list">${rec.map(r => `
        <button class="item tap${r.active === false ? " is-off" : ""}" type="button" data-act="edit-rec" data-id="${r.id}">
          <span class="cat-ico" style="--c:${catColor(state, r.categoryId)}"></span>
          <span class="t">${esc(r.name)}<small>${FREQS[r.every] || "Mensual"} · ${r.active === false ? "En pausa" : `próximo ${shortDate(r.nextDate)}`}</small></span>
          <b class="num ${r.amount > 0 ? "pos" : ""}">${signed(r.amount)}</b>
        </button>`).join("")}</div>`
    : `<div class="empty">Añade aquí el alquiler, tus suscripciones, el wifi… Se reservarán de tu presupuesto para que nunca te quedes corto.</div>`}
  </section>`;
}

// ---------- 3. Movimientos del mes, agrupados por día
function movsTab(state) {
  const fin = state.finance;
  const accName = id => fin.accounts.find(a => a.id === id)?.name || "Cuenta borrada";
  const txs = fin.transactions
    .filter(t => t.date.startsWith(ui.ym) && !(t.transferId && t.amount > 0))
    .sort((a, b) => b.date.localeCompare(a.date));
  const add = `<div class="btn-row"><button class="btn primary" type="button" data-act="new-tx">${icon.plus} Nuevo movimiento</button></div>`;
  if (!txs.length) return `<section class="card">${add}<div class="empty">No hay movimientos en ${monthLabel(ui.ym).toLowerCase()}.</div></section>`;

  const days = new Map();
  txs.forEach(t => { if (!days.has(t.date)) days.set(t.date, []); days.get(t.date).push(t); });
  return `<section class="card">${add}
    ${[...days.entries()].map(([d, list]) => {
      const dayTotal = list.filter(t => !t.transferId).reduce((s, t) => s + t.amount, 0);
      return `<div class="day-h"><span>${dayLabel(d)}</span><span class="num">${dayTotal ? signed(dayTotal) : ""}</span></div>
      <div class="list tight">${list.map(t => {
        if (t.transferId) {
          const to = fin.transactions.find(x => x.transferId === t.transferId && x.amount > 0);
          return `<button class="item tap" type="button" data-act="edit-tx" data-id="${t.id}">
            <span class="cat-ico" style="--c:var(--cyan)">⇄</span>
            <span class="t">${esc(t.note || "Transferencia")}<small>${esc(accName(t.accountId))} → ${esc(accName(to?.accountId))}</small></span>
            <b class="num">${money(-t.amount)}</b></button>`;
        }
        return `<button class="item tap" type="button" data-act="edit-tx" data-id="${t.id}">
          <span class="cat-ico" style="--c:${catColor(state, t.categoryId)}"></span>
          <span class="t">${esc(t.note || catLabel(state, t.categoryId))}${t.auto ? ` <span class="tag" style="--c:var(--cyan)">Fijo</span>` : ""}<small>${esc(catLabel(state, t.categoryId))} · ${esc(accName(t.accountId))}</small></span>
          <b class="num ${t.amount > 0 ? "pos" : ""}">${signed(t.amount)}</b></button>`;
      }).join("")}</div>`;
    }).join("")}
  </section>`;
}

// ---------- 4. Gasto del mes por categoría
function gastosTab(state, sum) {
  const total = -sum.expense;
  const manage = `<button class="btn small" type="button" data-act="cats">Categorías</button>`;
  if (!sum.cats.length) return `<section class="card"><h2 class="card-h">Gasto por categoría<span class="spacer"></span>${manage}</h2><div class="empty">Sin gastos en ${monthLabel(ui.ym).toLowerCase()}.</div></section>`;
  const max = sum.cats[0].total;
  return `<section class="card">
    <h2 class="card-h">Gasto por categoría<span class="spacer"></span>${manage}</h2>
    <div class="hbars">${sum.cats.map(c => `
      <button class="hbar" type="button" data-act="open-cat" data-id="${c.id}" aria-expanded="${ui.open === c.id}" style="--c:${c.color}">
        <span class="hb-top"><span class="hb-name">${esc(c.name)}</span><span class="num">${money(c.total)} <small>${Math.round(c.total / total * 100)} %</small></span></span>
        <span class="hb-track"><i style="width:${Math.max(2, c.total / max * 100)}%"></i></span>
      </button>
      ${ui.open === c.id ? `<div class="hb-subs">${c.subs.map(([n, v]) => `<div class="kv"><span>${esc(n)}</span><span class="num">${money(v)}</span></div>`).join("")}</div>` : ""}`).join("")}
    </div>
    <p class="hint">Toca una categoría para ver sus subcategorías.</p>
  </section>`;
}

// ---------- 5. Metas de ahorro
function metasTab(state) {
  const goals = state.finance.goals;
  const add = `<div class="btn-row"><button class="btn primary" type="button" data-act="new-goal">${icon.plus} Nueva meta</button></div>`;
  if (!goals.length) return `<section class="card">${add}<div class="empty">Crea una meta (un viaje, un fondo de emergencia…) y ve aportando para verla crecer.</div></section>`;
  return `<section class="card">${add}<div class="goals">${goals.map(g => {
    const pct = Math.min(100, Math.round(g.saved / g.target * 100));
    const left = Math.max(0, g.target - g.saved);
    let plan = "";
    if (g.deadline && left > 0) {
      const now = new Date(), end = parseISO(g.deadline);
      const months = Math.max(1, (end.getFullYear() - now.getFullYear()) * 12 + end.getMonth() - now.getMonth());
      plan = end < now ? `<span style="color:var(--danger)">Fecha superada</span>` : `${money(left / months)}/mes hasta ${shortDate(g.deadline)}`;
    }
    return `<div class="goal${pct >= 100 ? " reached" : ""}">
      ${ring(pct, "#7fcf9b", { size: 58, stroke: 6, label: `${pct}%` })}
      <div class="t"><b>${esc(g.name)}</b>
        <small class="num">${money(g.saved)} de ${money(g.target)}</small>
        <small>${pct >= 100 ? "¡Conseguida!" : `Faltan ${money(left)}`}${plan ? ` · ${plan}` : ""}</small>
        <div class="btn-row"><button class="btn small primary" type="button" data-act="contrib" data-id="${g.id}">Aportar</button><button class="btn small" type="button" data-act="edit-goal" data-id="${g.id}">Editar</button></div>
      </div>
    </div>`;
  }).join("")}</div></section>`;
}

// ---------- 6. Cuentas
function cuentasTab(state) {
  const accs = state.finance.accounts;
  return `<section class="card">
    <div class="btn-row">
      <button class="btn primary" type="button" data-act="new-account">${icon.plus} Nueva cuenta</button>
      ${accs.length > 1 ? `<button class="btn" type="button" data-act="transfer">⇄ Transferir</button>` : ""}
    </div>
    <div class="list">${accs.map(a => {
      const b = accountBalance(state, a.id);
      return `<button class="item tap" type="button" data-act="edit-account" data-id="${a.id}">
        <span class="cat-ico" style="--c:var(--fin)"></span>
        <span class="t">${esc(a.name)}<small>${ACCOUNT_TYPES[a.type] || "Cuenta"}</small></span>
        <b class="num ${b < 0 ? "neg" : ""}">${money(b)}</b></button>`;
    }).join("")}</div>
  </section>`;
}

// ---------- Interacción y Asesor
export function mount(root, state, signal) {
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (b) {
      const id = b.dataset.id;
      const rerender = () => window.dispatchEvent(new Event("pv:render"));
      switch (b.dataset.act) {
        case "tab": ui.tab = b.dataset.tab; ui.open = null; rerender(); break;
        case "acc": ui.acc = id || null; rerender(); break;
        case "month": ui.ym = shiftMonth(ui.ym, Number(b.dataset.n)); rerender(); break;
        case "open-cat": ui.open = ui.open === id ? null : id; rerender(); break;
        case "set-income": openMonthlyIncomeForm(); break;
        case "quick-spend": {
          const amt = Number(b.dataset.amount);
          openTxForm({ type: "expense" });
          if (amt > 0) {
            setTimeout(() => {
              const input = document.getElementById("tx-amount");
              if (input) {
                input.value = String(amt).replace(".", ",");
                input.dispatchEvent(new Event("input", { bubbles: true }));
              }
            }, 300);
          }
          break;
        }
        case "new-tx": openTxForm(); break;
        case "edit-tx": openTxForm({ id }); break;
        case "transfer": openTxForm({ type: "transfer" }); break;
        case "new-account": openAccountForm(); break;
        case "edit-account": openAccountForm(id); break;
        case "new-rec": openRecurringForm(); break;
        case "edit-rec": openRecurringForm(id); break;
        case "new-goal": openGoalForm(); break;
        case "edit-goal": openGoalForm(id); break;
        case "contrib": openContribute(id); break;
        case "cats": openCategories(); break;
      }
    }

    // Botón de asesor
    if (e.target.closest("#advisor-check-btn")) {
      runAdvisorSimulation();
    }
  }, { signal });

  const advInput = root.querySelector("#advisor-amount-input");
  if (advInput) {
    advInput.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        runAdvisorSimulation();
      }
    });
  }

  function runAdvisorSimulation() {
    const input = root.querySelector("#advisor-amount-input");
    if (!input) return;
    const val = parseAmount(input.value);
    if (!val || val <= 0) return;
    ui.simAmount = String(val);
    ui.simResult = checkExpenseViability(state, val, ui.ym);
    window.dispatchEvent(new Event("pv:render"));
  }
}
