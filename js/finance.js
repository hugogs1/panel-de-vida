// Lógica de finanzas: categorías por defecto, saldos, fijos automáticos y utilidades.
// Convención: amount < 0 es gasto, amount > 0 es ingreso. Una transferencia son dos
// movimientos (salida y entrada) con el mismo transferId y sin categoría.

import { iso, parseISO, addDays } from "./stats.js";
import { uid, money } from "./ui.js";

// ---------- Categorías por defecto (con subcategorías)
const PALETTE = {
  comida: "#7fcf9b", casa: "#7cc4e4", transporte: "#7ea6f0", ocio: "#e88fb4", deporte: "#e39a72",
  salud: "#8fd3bf", compras: "#e0b467", subs: "#9db9e8", formacion: "#c3d48a", otros: "#8b9099",
  nomina: "#7fcf9b", extras: "#7cc4e4", regalos: "#e88fb4", reemb: "#e0b467", otrosing: "#8b9099"
};

const DEFAULTS = [
  ["expense", "comida", "Comida", ["Supermercado", "Restaurantes", "Cafés y snacks"]],
  ["expense", "casa", "Casa", ["Alquiler o hipoteca", "Luz, agua y gas", "Internet y móvil", "Mantenimiento"]],
  ["expense", "transporte", "Transporte", ["Combustible", "Transporte público", "Coche", "Taxi y VTC"]],
  ["expense", "ocio", "Ocio", ["Salidas", "Viajes", "Videojuegos", "Eventos"]],
  ["expense", "deporte", "Deporte", ["Gimnasio", "Fútbol", "Material"]],
  ["expense", "salud", "Salud", ["Farmacia", "Médico"]],
  ["expense", "compras", "Compras", ["Ropa", "Tecnología", "Hogar"]],
  ["expense", "subs", "Suscripciones", ["Streaming", "Apps y servicios"]],
  ["expense", "formacion", "Formación", ["Cursos", "Libros"]],
  ["expense", "otros", "Otros gastos", []],
  ["income", "nomina", "Nómina", []],
  ["income", "extras", "Extras y freelance", []],
  ["income", "regalos", "Regalos", []],
  ["income", "reemb", "Reembolsos", []],
  ["income", "otrosing", "Otros ingresos", []]
];

const slug = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function defaultCategories() {
  const out = [];
  for (const [kind, key, name, subs] of DEFAULTS) {
    const id = `c-${key}`;
    out.push({ id, name, kind, parentId: null, color: PALETTE[key] });
    subs.forEach(sub => out.push({ id: `${id}-${slug(sub)}`, name: sub, kind, parentId: id }));
  }
  return out;
}

export const ACCOUNT_TYPES = { banco: "Banco", efectivo: "Efectivo", ahorro: "Ahorro", inversion: "Inversión", tarjeta: "Tarjeta", otra: "Otra" };
export const FREQS = { month: "Mensual", week: "Semanal", year: "Anual" };

// ---------- Consultas
export const catById = (state, id) => state.finance.categories.find(c => c.id === id);
export const topCat = (state, id) => { const c = catById(state, id); return c?.parentId ? catById(state, c.parentId) : c; };
export const catColor = (state, id) => topCat(state, id)?.color || "#8b9099";
export function catLabel(state, id) {
  const c = catById(state, id);
  if (!c) return "Sin categoría";
  const p = c.parentId ? catById(state, c.parentId) : null;
  return p ? `${p.name} › ${c.name}` : c.name;
}

export function accountBalance(state, accId, upTo = null) {
  const a = state.finance.accounts.find(x => x.id === accId);
  return (a?.initial || 0) + state.finance.transactions
    .filter(t => t.accountId === accId && (!upTo || t.date <= upTo))
    .reduce((s, t) => s + t.amount, 0);
}

export function totalBalance(state, upTo = null) {
  return state.finance.accounts.reduce((s, a) => s + (a.initial || 0), 0) +
    state.finance.transactions.filter(t => !upTo || t.date <= upTo).reduce((s, t) => s + t.amount, 0);
}

/** "AAAA-MM" → resumen del mes (de todas las cuentas o solo de accId).
 *  Las transferencias no cuentan como ingreso ni gasto; con una cuenta se suman aparte en `transfers`. */
export function monthSummary(state, ym, accId = null) {
  let income = 0, expense = 0, transfers = 0;
  const byCat = new Map();
  for (const t of state.finance.transactions) {
    if (!t.date.startsWith(ym) || (accId && t.accountId !== accId)) continue;
    if (t.transferId) { transfers += t.amount; continue; }
    if (t.amount > 0) { income += t.amount; continue; }
    expense += t.amount;
    const top = topCat(state, t.categoryId);
    const key = top?.id || "none";
    if (!byCat.has(key)) byCat.set(key, { id: key, name: top?.name || "Sin categoría", color: top?.color || "#8b9099", total: 0, subs: new Map() });
    const e = byCat.get(key);
    e.total += -t.amount;
    const sub = catById(state, t.categoryId);
    const subName = sub?.parentId ? sub.name : "General";
    e.subs.set(subName, (e.subs.get(subName) || 0) + -t.amount);
  }
  const cats = [...byCat.values()].sort((a, b) => b.total - a.total)
    .map(c => ({ ...c, subs: [...c.subs.entries()].sort((a, b) => b[1] - a[1]) }));
  return { income, expense, net: income + expense, transfers: accId ? transfers : 0, cats };
}

/** Saldo (total, o de accId) al final de cada uno de los últimos n meses (incluido el indicado) */
export function balanceHistory(state, ym, n = 6, accId = null) {
  const [y, m] = ym.split("-").map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const end = new Date(y, m - 1 - i + 1, 0);
    out.push({ label: new Intl.DateTimeFormat("es-ES", { month: "short" }).format(end).replace(".", ""), value: accId ? accountBalance(state, accId, iso(end)) : totalBalance(state, iso(end)) });
  }
  return out;
}

// ---------- Fijos: avanzar fecha y apuntar los vencidos
export function nextOccurrence(dateISO, every, day) {
  const d = parseISO(dateISO);
  if (every === "week") return iso(addDays(d, 7));
  if (every === "year") return iso(new Date(d.getFullYear() + 1, d.getMonth(), Math.min(day || d.getDate(), daysIn(d.getFullYear() + 1, d.getMonth()))));
  const ny = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear(), nm = (d.getMonth() + 1) % 12;
  return iso(new Date(ny, nm, Math.min(day || d.getDate(), daysIn(ny, nm))));
}
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

/** Muta el estado: crea los movimientos de fijos vencidos. Devuelve cuántos ha creado. */
export function applyRecurring(state, today = iso()) {
  let created = 0;
  for (const r of state.finance.recurring) {
    if (r.active === false || !r.nextDate) continue;
    let guard = 0;
    while (r.nextDate <= today && guard++ < 400) {
      if (state.finance.accounts.some(a => a.id === r.accountId)) {
        state.finance.transactions.push({ id: uid(), date: r.nextDate, amount: r.amount, accountId: r.accountId, categoryId: r.categoryId, note: r.name, auto: true, recurringId: r.id });
        created++;
      }
      r.nextDate = nextOccurrence(r.nextDate, r.every, r.day);
    }
  }
  return created;
}

/** Asegura categorías por defecto y aplica fijos. Se llama al arrancar. */
export function ensureFinance(state) {
  if (!state.finance.categories.length) state.finance.categories = defaultCategories();
  return applyRecurring(state);
}

// ---------- Utilidades de formulario
/** Acepta "12,5", "1.234,56", "12.5", "1234" → número. NaN si no es válido. */
export function parseAmount(str) {
  let s = String(str || "").trim().replace(/\s|€/g, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // "1.234" = mil doscientos…
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
export const amountInput = n => n ? String(Math.abs(n).toFixed(2)).replace(".", ",").replace(/,00$/, "") : "";

// ---------- Cartera Inteligente, Gastos Fijos y Viabilidad
export const perMonth = r => r.every === "week" ? r.amount * 52 / 12 : r.every === "year" ? r.amount / 12 : r.amount;

export function getWalletBudget(state, ym = iso().slice(0, 7)) {
  const fin = state.finance;
  const configuredIncome = Number(fin.monthlyIncome) || 0;
  const sum = monthSummary(state, ym);
  const actualIncome = sum.income || 0;
  const totalIncome = configuredIncome > 0 ? configuredIncome : actualIncome;

  // Gastos fijos comprometidos (mensuales)
  const fixedList = (fin.recurring || []).filter(r => r.active !== false && r.amount < 0);
  const fixedMonthlyTotal = Math.abs(fixedList.reduce((acc, r) => acc + perMonth(r), 0));

  // Gastos variables apuntados en el mes (excluyendo auto/recurring y transferencias)
  const variableSpent = Math.abs(fin.transactions
    .filter(t => t.date.startsWith(ym) && t.amount < 0 && !t.auto && !t.transferId)
    .reduce((acc, t) => acc + t.amount, 0));

  // Dinero disponible neto tras fijos
  const disposable = Math.max(0, totalIncome - fixedMonthlyTotal);
  // Dinero libre restante real
  const remainingFree = totalIncome - fixedMonthlyTotal - variableSpent;

  // Días del mes y días restantes
  const [y, m] = ym.split("-").map(Number);
  const totalDays = new Date(y, m, 0).getDate();
  const today = new Date();
  const isCurrentMonth = ym === iso().slice(0, 7);
  const currentDay = isCurrentMonth ? today.getDate() : totalDays;
  const daysLeft = isCurrentMonth ? Math.max(1, totalDays - currentDay + 1) : 1;
  const dailyBudget = remainingFree > 0 ? (remainingFree / daysLeft) : 0;

  // Porcentaje de presupuesto consumido
  const totalEstimatedExpense = fixedMonthlyTotal + variableSpent;
  const burnPct = totalIncome > 0 ? Math.min(100, Math.round((totalEstimatedExpense / totalIncome) * 100)) : 0;

  return {
    ym,
    configuredIncome,
    actualIncome,
    totalIncome,
    fixedMonthlyTotal,
    fixedCount: fixedList.length,
    fixedList,
    variableSpent,
    disposable,
    remainingFree,
    totalEstimatedExpense,
    burnPct,
    totalDays,
    daysLeft,
    dailyBudget,
    isCurrentMonth
  };
}

export function checkExpenseViability(state, candidateAmount, ym = iso().slice(0, 7)) {
  const amt = Number(candidateAmount);
  if (!amt || isNaN(amt) || amt <= 0) return null;

  const w = getWalletBudget(state, ym);
  if (!w.totalIncome && !totalBalance(state)) {
    return {
      status: "unknown",
      badge: "Sin presupuesto configurado",
      color: "var(--muted)",
      message: "Configura tu ingreso mensual en Finanzas para evaluar la viabilidad de gastos.",
      remainingAfter: null,
      dailyAfter: null,
      wallet: w
    };
  }

  const basePool = w.totalIncome > 0 ? w.remainingFree : totalBalance(state);
  const remainingAfter = basePool - amt;
  const dailyAfter = remainingAfter > 0 ? (remainingAfter / w.daysLeft) : 0;

  if (remainingAfter < 0) {
    const deficit = Math.abs(remainingAfter);
    return {
      status: "danger",
      badge: "🔴 No viable / Riesgo alto",
      color: "var(--danger)",
      message: `Este gasto supera tu dinero libre en ${money(deficit)} y comprometería tus gastos fijos o tus ahorros.`,
      remainingAfter,
      dailyAfter: 0,
      wallet: w
    };
  }

  // Si tras el gasto queda menos del 15% del disponible o consume más del 65% de lo que quedaba
  if ((w.disposable > 0 && remainingAfter < w.disposable * 0.15) || (basePool > 0 && amt > basePool * 0.65)) {
    return {
      status: "warn",
      badge: "🟡 Viable pero ajustado",
      color: "var(--warn)",
      message: `Gasto ajustado: consumirá gran parte de tu disponible. Te quedarán ${money(remainingAfter)} para ${w.daysLeft} días (~${money(dailyAfter)}/día).`,
      remainingAfter,
      dailyAfter,
      wallet: w
    };
  }

  return {
    status: "ok",
    badge: "🟢 Gasto totalmente viable",
    color: "var(--ok)",
    message: `¡Es viable! Tras este gasto te quedarán ${money(remainingAfter)} libres este mes (~${money(dailyAfter)}/día).`,
    remainingAfter,
    dailyAfter,
    wallet: w
  };
}
