// Formularios de Finanzas (en hoja inferior): movimientos, cuentas, fijos, metas y categorías.

import { getState, update } from "../state.js";
import { openSheet, closeSheet, toast, confirmSheet, esc, uid, money } from "../ui.js";
import { icon } from "../icons.js";
import { iso } from "../stats.js";
import { seg, field } from "../forms.js";
import { ACCOUNT_TYPES, FREQS, parseAmount, amountInput, applyRecurring, accountBalance, catById, catLabel, checkExpenseViability, isFixedTx, reconcileFinance } from "../finance.js";
import { parseBankCSV, parseBankFile, applyBankImport } from "../bank.js";
import { setFinanceMonth } from "./finanzas.js";

// ---------- Piezas comunes
function categoryOptions(state, kind, selected) {
  const cats = state.finance.categories.filter(c => c.kind === kind);
  return cats.filter(c => !c.parentId).map(p => {
    const subs = cats.filter(c => c.parentId === p.id);
    const opt = c => `<option value="${c.id}"${c.id === selected ? " selected" : ""}>${esc(c.name)}</option>`;
    if (!subs.length) return opt(p);
    return `<optgroup label="${esc(p.name)}"><option value="${p.id}"${p.id === selected ? " selected" : ""}>${esc(p.name)} (general)</option>${subs.map(opt).join("")}</optgroup>`;
  }).join("");
}
const accountOptions = (state, selected, exclude) => state.finance.accounts
  .filter(a => a.id !== exclude)
  .map(a => `<option value="${a.id}"${a.id === selected ? " selected" : ""}>${esc(a.name)}</option>`).join("");


function needAccounts() {
  if (getState().finance.accounts.length) return false;
  toast("Primero crea una cuenta en Finanzas → Cuentas", { error: true, ms: 3500 });
  return true;
}

// ---------- Movimiento (gasto, ingreso o transferencia)
export function openTxForm({ id = null, type = "expense" } = {}) {
  if (needAccounts()) return;
  const s = getState();
  const tx = id ? s.finance.transactions.find(t => t.id === id) : null;
  let pair = null;
  if (tx?.transferId) {
    const both = s.finance.transactions.filter(t => t.transferId === tx.transferId);
    pair = { out: both.find(t => t.amount < 0), in: both.find(t => t.amount > 0) };
    type = "transfer";
  } else if (tx) type = tx.amount > 0 ? "income" : "expense";

  const acc = pair?.out.accountId || tx?.accountId || s.finance.accounts[0].id;
  const acc2 = pair?.in.accountId || s.finance.accounts.find(a => a.id !== acc)?.id || "";
  const amount = pair ? pair.in.amount : tx?.amount;

  const sheet = openSheet(`
    <h2>${id ? "Editar movimiento" : "Nuevo movimiento"}</h2>
    <form class="form" id="tx-form" novalidate>
      ${seg("type", { expense: "Gasto", income: "Ingreso", transfer: "Transferencia" }, type)}
      <div class="field amount-field">
        <label for="tx-amount">Importe</label>
        <div class="amount-wrap"><input class="input amount" id="tx-amount" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${amountInput(amount)}"><span>€</span></div>
        <div id="tx-viability" class="tx-viability" hidden></div>
      </div>
      <div class="row2">
        ${field("Fecha", "tx-date", `<input class="input" type="date" id="tx-date" value="${tx?.date || iso()}" required>`)}
        ${field(`<span data-show="expense income">Cuenta</span><span data-show="transfer">Desde</span>`, "tx-acc", `<select class="input" id="tx-acc">${accountOptions(s, acc)}</select>`)}
      </div>
      <div data-show="transfer">${field("Hacia", "tx-acc2", `<select class="input" id="tx-acc2">${accountOptions(s, acc2)}</select>`)}</div>
      <div data-show="expense">
        ${field("Categoría", "tx-cat-e", `<select class="input" id="tx-cat-e">${categoryOptions(s, "expense", tx?.categoryId || "c-comida-supermercado")}</select>`)}
        <label class="check-row" style="margin-top:6px;display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="tx-is-fixed"${tx && isFixedTx(tx, s.finance.recurring) ? " checked" : ""}>
          <span>Gasto fijo mensual (alquiler, gimnasio, facturas, subs...)</span>
        </label>
      </div>
      <div data-show="income">${field("Categoría", "tx-cat-i", `<select class="input" id="tx-cat-i">${categoryOptions(s, "income", tx?.categoryId || "c-nomina")}</select>`)}</div>
      ${field("Nota (opcional)", "tx-note", `<input class="input" id="tx-note" maxlength="80" autocomplete="off" value="${esc(pair?.out.note ?? tx?.note ?? "")}" placeholder="p. ej. Mercadona">`)}
      ${tx?.auto ? `<p class="hint">Apuntado automáticamente por un gasto fijo.</p>` : ""}
      <div class="btn-row">
        ${id ? `<button class="btn danger" type="button" id="tx-del">Borrar</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
        <button class="btn primary" type="submit">Guardar</button>
      </div>
    </form>`);

  const form = sheet.querySelector("#tx-form");
  const viabEl = sheet.querySelector("#tx-viability");

  const updateViability = () => {
    const t = form.dataset.type;
    if (t !== "expense") {
      viabEl.hidden = true;
      return;
    }
    const val = parseAmount(form.querySelector("#tx-amount").value);
    if (!val || val <= 0) {
      viabEl.hidden = true;
      return;
    }
    const res = checkExpenseViability(getState(), val);
    if (!res) {
      viabEl.hidden = true;
      return;
    }
    viabEl.hidden = false;
    viabEl.className = `tx-viability is-${res.status}`;
    viabEl.innerHTML = `<span class="viab-badge">${res.badge}</span><span class="viab-msg">${res.message}</span>`;
  };

  const sync = () => {
    const t = form.querySelector("[name=type]:checked").value;
    form.dataset.type = t;
    sheet.querySelectorAll("[data-show]").forEach(el => { el.hidden = !el.dataset.show.split(" ").includes(t); });
    updateViability();
  };
  form.addEventListener("change", e => { if (e.target.name === "type") sync(); });
  form.querySelector("#tx-amount").addEventListener("input", updateViability);
  sync();
  if (!id) setTimeout(() => form.querySelector("#tx-amount").focus(), 250);

  form.addEventListener("submit", e => {
    e.preventDefault();
    const t = form.dataset.type;
    const value = Math.abs(parseAmount(form.querySelector("#tx-amount").value));
    if (!value) { toast("Escribe un importe mayor que 0", { error: true }); return; }
    const date = form.querySelector("#tx-date").value || iso();
    const accountId = form.querySelector("#tx-acc").value;
    const note = form.querySelector("#tx-note").value.trim();
    if (t === "transfer") {
      const to = form.querySelector("#tx-acc2").value;
      if (!to || to === accountId) { toast("Elige dos cuentas distintas", { error: true }); return; }
    }
    update(st => {
      const list = st.finance.transactions;
      // al editar, se sustituye el original (o la pareja si era transferencia)
      if (tx) st.finance.transactions = list.filter(x => tx.transferId ? x.transferId !== tx.transferId : x.id !== tx.id);
      if (t === "transfer") {
        const transferId = tx?.transferId || uid();
        const to = form.querySelector("#tx-acc2").value;
        st.finance.transactions.push(
          { id: pair?.out.id || uid(), date, amount: -value, accountId, categoryId: null, note, transferId },
          { id: pair?.in.id || uid(), date, amount: value, accountId: to, categoryId: null, note, transferId });
      } else {
        const categoryId = form.querySelector(t === "expense" ? "#tx-cat-e" : "#tx-cat-i").value;
        const isFixed = t === "expense" ? form.querySelector("#tx-is-fixed")?.checked === true : false;
        st.finance.transactions.push({
          ...(tx && !tx.transferId ? tx : {}),
          id: tx && !tx.transferId ? tx.id : uid(),
          date,
          amount: t === "expense" ? -value : value,
          accountId,
          categoryId,
          note,
          isFixed,
          recurringId: isFixed ? (tx?.recurringId || null) : null,
          transferId: undefined
        });
        reconcileFinance(st);
      }
    });
    closeSheet();
    toast(id ? "Movimiento actualizado" : t === "transfer" ? "Transferencia apuntada" : t === "expense" ? `Gasto de ${money(value)} apuntado` : `Ingreso de ${money(value)} apuntado`);
  });

  sheet.querySelector("#tx-del")?.addEventListener("click", async () => {
    if (!await confirmSheet({ title: "¿Borrar este movimiento?", text: tx.transferId ? "Se borrarán la salida y la entrada de la transferencia." : "No se puede deshacer.", ok: "Borrar", danger: true })) return;
    update(st => { st.finance.transactions = st.finance.transactions.filter(x => tx.transferId ? x.transferId !== tx.transferId : x.id !== tx.id); });
    toast("Movimiento borrado");
  });
}

// ---------- Cuenta
export function openAccountForm(id = null) {
  const s = getState();
  const a = id ? s.finance.accounts.find(x => x.id === id) : null;
  const currentBal = a ? accountBalance(s, a.id) : 0;
  const hasTx = a && s.finance.transactions.some(t => t.accountId === a.id);
  const txSum = a ? s.finance.transactions.filter(t => t.accountId === a.id).reduce((sum, t) => sum + t.amount, 0) : 0;

  const sheet = openSheet(`
    <h2>${a ? "Editar cuenta" : "Nueva cuenta"}</h2>
    <form class="form" id="acc-form" novalidate>
      ${field("Nombre", "acc-name", `<input class="input" id="acc-name" maxlength="30" autocomplete="off" value="${esc(a?.name || "")}" placeholder="p. ej. Cuenta ING">`)}
      ${field("Tipo", "acc-type", `<select class="input" id="acc-type">${Object.entries(ACCOUNT_TYPES).map(([v, l]) => `<option value="${v}"${v === (a?.type || "banco") ? " selected" : ""}>${l}</option>`).join("")}</select>`)}
      ${field("Saldo actual en banco (€)", "acc-current", `<input class="input" id="acc-current" inputmode="decimal" autocomplete="off" placeholder="590,21" value="${a ? String(currentBal).replace(".", ",") : ""}">`)}
      <p class="hint">Escribe el dinero real que tienes hoy en tu banco. El saldo se ajustará al instante para cuadrar exactamente.</p>
      
      <details style="margin:10px 0 6px;font-size:12px">
        <summary style="cursor:pointer;color:var(--muted)">Opciones avanzadas (saldo inicial manual)</summary>
        <div style="margin-top:8px">
          ${field("Saldo inicial histórico", "acc-initial", `<input class="input" id="acc-initial" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${a ? String(a.initial || 0).replace(".", ",") : "0"}">`)}
          <p class="hint">Dinero antes del primer movimiento registrado.</p>
        </div>
      </details>

      ${hasTx ? `
        <div style="margin:12px 0 4px">
          <button class="btn small" type="button" id="acc-reset-txs" style="width:100%;font-size:12px;color:var(--danger);border-color:rgba(255,69,58,0.3)">
            🗑️ Limpiar movimientos de prueba de esta cuenta
          </button>
        </div>` : ""}

      <div class="btn-row" style="margin-top:16px">
        ${a ? `<button class="btn danger" type="button" id="acc-del">Borrar cuenta</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
        <button class="btn primary" type="submit">Guardar</button>
      </div>
    </form>`);

  const form = sheet.querySelector("#acc-form");
  form.addEventListener("submit", e => {
    e.preventDefault();
    const name = form.querySelector("#acc-name").value.trim();
    if (!name) { toast("Escribe un nombre", { error: true }); return; }
    const rawCur = form.querySelector("#acc-current").value.trim();
    const rawInit = form.querySelector("#acc-initial")?.value.trim();
    let initial = 0;
    if (rawCur) {
      const curVal = parseAmount(rawCur);
      if (isNaN(curVal)) { toast("El saldo actual no es un número válido", { error: true }); return; }
      initial = Math.round((curVal - txSum) * 100) / 100;
    } else if (rawInit) {
      initial = parseAmount(rawInit.replace(/^[−-]/, "-")) || 0;
    }
    const type = form.querySelector("#acc-type").value;
    update(st => {
      if (a) Object.assign(st.finance.accounts.find(x => x.id === a.id), { name, type, initial });
      else st.finance.accounts.push({ id: uid(), name, type, initial });
      reconcileFinance(st);
    });
    closeSheet();
    toast(a ? "Cuenta actualizada" : "Cuenta creada");
  });

  sheet.querySelector("#acc-reset-txs")?.addEventListener("click", async () => {
    const ok = await confirmSheet({
      title: `¿Limpiar movimientos de «${a.name}»?`,
      text: "Se eliminarán los movimientos antiguos o de prueba registrados en esta cuenta. El saldo se mantendrá ajustado a tu saldo real.",
      ok: "Limpiar movimientos",
      danger: true
    });
    if (!ok) return;
    const curVal = parseAmount(form.querySelector("#acc-current")?.value) || 0;
    update(st => {
      st.finance.transactions = st.finance.transactions.filter(t => t.accountId !== a.id);
      const acc = st.finance.accounts.find(x => x.id === a.id);
      if (acc) acc.initial = curVal;
      reconcileFinance(st);
    });
    closeSheet();
    toast("Movimientos de prueba eliminados");
  });

  sheet.querySelector("#acc-del")?.addEventListener("click", async () => {
    if (hasTx) { toast("Esta cuenta tiene movimientos. Bórralos o muévelos a otra cuenta antes.", { error: true, ms: 4000 }); return; }
    if (!await confirmSheet({ title: `¿Borrar «${a.name}»?`, text: "La cuenta no tiene movimientos.", ok: "Borrar", danger: true })) return;
    update(st => {
      st.finance.accounts = st.finance.accounts.filter(x => x.id !== a.id);
      st.finance.recurring = st.finance.recurring.filter(r => r.accountId !== a.id);
    });
    toast("Cuenta borrada");
  });
}

// ---------- Gasto o ingreso fijo
export function openRecurringForm(id = null) {
  if (needAccounts()) return;
  const s = getState();
  const r = id ? s.finance.recurring.find(x => x.id === id) : null;
  const kind = r && r.amount > 0 ? "income" : "expense";
  const sheet = openSheet(`
    <h2>${r ? "Editar fijo" : "Nuevo gasto o ingreso fijo"}</h2>
    <form class="form" id="rec-form" novalidate>
      ${seg("kind", { expense: "Gasto", income: "Ingreso" }, kind)}
      ${field("Nombre", "rec-name", `<input class="input" id="rec-name" maxlength="40" autocomplete="off" value="${esc(r?.name || "")}" placeholder="p. ej. Netflix, Alquiler, Nómina">`)}
      <div class="row2">
        ${field("Importe", "rec-amount", `<input class="input" id="rec-amount" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${amountInput(r?.amount)}">`)}
        ${field("Frecuencia", "rec-every", `<select class="input" id="rec-every">${Object.entries(FREQS).map(([v, l]) => `<option value="${v}"${v === (r?.every || "month") ? " selected" : ""}>${l}</option>`).join("")}</select>`)}
      </div>
      <div class="row2">
        ${field("Próximo cargo", "rec-next", `<input class="input" type="date" id="rec-next" value="${r?.nextDate || iso()}">`)}
        ${field("Cuenta", "rec-acc", `<select class="input" id="rec-acc">${accountOptions(s, r?.accountId || s.finance.accounts[0].id)}</select>`)}
      </div>
      <div data-show="expense">${field("Categoría", "rec-cat-e", `<select class="input" id="rec-cat-e">${categoryOptions(s, "expense", r?.categoryId || "c-subs-streaming")}</select>`)}</div>
      <div data-show="income">${field("Categoría", "rec-cat-i", `<select class="input" id="rec-cat-i">${categoryOptions(s, "income", r?.categoryId || "c-nomina")}</select>`)}</div>
      <label class="switch-row"><input type="checkbox" id="rec-active"${r?.active === false ? "" : " checked"}><span>Activo (se apunta solo cada vez que toque)</span></label>
      <p class="hint">Si el próximo cargo es hoy o ya ha pasado, se apuntará al guardar.</p>
      <div class="btn-row">
        ${r ? `<button class="btn danger" type="button" id="rec-del">Borrar</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
        <button class="btn primary" type="submit">Guardar</button>
      </div>
    </form>`);
  const form = sheet.querySelector("#rec-form");
  const sync = () => {
    const k = form.querySelector("[name=kind]:checked").value;
    form.dataset.kind = k;
    sheet.querySelectorAll("[data-show]").forEach(el => { el.hidden = el.dataset.show !== k; });
  };
  form.addEventListener("change", e => { if (e.target.name === "kind") sync(); });
  sync();
  form.addEventListener("submit", e => {
    e.preventDefault();
    const name = form.querySelector("#rec-name").value.trim();
    const value = Math.abs(parseAmount(form.querySelector("#rec-amount").value));
    if (!name) { toast("Escribe un nombre", { error: true }); return; }
    if (!value) { toast("Escribe un importe mayor que 0", { error: true }); return; }
    const k = form.dataset.kind;
    const nextDate = form.querySelector("#rec-next").value || iso();
    const data = {
      name, amount: k === "expense" ? -value : value,
      every: form.querySelector("#rec-every").value,
      nextDate, day: Number(nextDate.slice(8, 10)),
      accountId: form.querySelector("#rec-acc").value,
      categoryId: form.querySelector(k === "expense" ? "#rec-cat-e" : "#rec-cat-i").value,
      active: form.querySelector("#rec-active").checked
    };
    let created = 0;
    update(st => {
      if (r) Object.assign(st.finance.recurring.find(x => x.id === r.id), data);
      else st.finance.recurring.push({ id: uid(), ...data });
      created = applyRecurring(st);
    });
    closeSheet();
    toast(created ? `Guardado · ${created} cargo${created > 1 ? "s" : ""} apuntado${created > 1 ? "s" : ""}` : "Fijo guardado");
  });
  sheet.querySelector("#rec-del")?.addEventListener("click", async () => {
    if (!await confirmSheet({ title: `¿Borrar «${r.name}»?`, text: "Los movimientos que ya se apuntaron se mantienen.", ok: "Borrar", danger: true })) return;
    update(st => { st.finance.recurring = st.finance.recurring.filter(x => x.id !== r.id); });
    toast("Fijo borrado");
  });
}

// ---------- Meta de ahorro
export function openGoalForm(id = null) {
  const g = id ? getState().finance.goals.find(x => x.id === id) : null;
  const sheet = openSheet(`
    <h2>${g ? "Editar meta" : "Nueva meta de ahorro"}</h2>
    <form class="form" id="goal-form" novalidate>
      ${field("Nombre", "goal-name", `<input class="input" id="goal-name" maxlength="40" autocomplete="off" value="${esc(g?.name || "")}" placeholder="p. ej. Viaje, fondo de emergencia">`)}
      <div class="row2">
        ${field("Objetivo", "goal-target", `<input class="input" id="goal-target" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${amountInput(g?.target)}">`)}
        ${field("Ya ahorrado", "goal-saved", `<input class="input" id="goal-saved" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${amountInput(g?.saved)}">`)}
      </div>
      ${field("Fecha límite (opcional)", "goal-deadline", `<input class="input" type="date" id="goal-deadline" value="${g?.deadline || ""}">`)}
      <div class="btn-row">
        ${g ? `<button class="btn danger" type="button" id="goal-del">Borrar</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
        <button class="btn primary" type="submit">Guardar</button>
      </div>
    </form>`);
  const form = sheet.querySelector("#goal-form");
  form.addEventListener("submit", e => {
    e.preventDefault();
    const name = form.querySelector("#goal-name").value.trim();
    const target = parseAmount(form.querySelector("#goal-target").value);
    const saved = parseAmount(form.querySelector("#goal-saved").value) || 0;
    if (!name) { toast("Escribe un nombre", { error: true }); return; }
    if (!(target > 0)) { toast("Escribe un objetivo mayor que 0", { error: true }); return; }
    const deadline = form.querySelector("#goal-deadline").value || null;
    update(st => {
      if (g) Object.assign(st.finance.goals.find(x => x.id === g.id), { name, target, saved, deadline });
      else st.finance.goals.push({ id: uid(), name, target, saved, deadline, history: [] });
    });
    closeSheet();
    toast(g ? "Meta actualizada" : "Meta creada");
  });
  sheet.querySelector("#goal-del")?.addEventListener("click", async () => {
    if (!await confirmSheet({ title: `¿Borrar «${g.name}»?`, text: "No se puede deshacer.", ok: "Borrar", danger: true })) return;
    update(st => { st.finance.goals = st.finance.goals.filter(x => x.id !== g.id); });
    toast("Meta borrada");
  });
}

export function openContribute(id) {
  const g = getState().finance.goals.find(x => x.id === id);
  const sheet = openSheet(`
    <h2>Aportar a «${esc(g.name)}»</h2>
    <p>Llevas <b class="num">${money(g.saved)}</b> de <b class="num">${money(g.target)}</b>.</p>
    <form class="form" id="contrib-form" novalidate>
      ${seg("dir", { add: "Aportar", take: "Retirar" }, "add")}
      <div class="field amount-field">
        <label for="contrib-amount">Importe</label>
        <div class="amount-wrap"><input class="input amount" id="contrib-amount" inputmode="decimal" autocomplete="off" placeholder="0,00"><span>€</span></div>
      </div>
      <div class="btn-row"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
  const form = sheet.querySelector("#contrib-form");
  setTimeout(() => form.querySelector("#contrib-amount").focus(), 250);
  form.addEventListener("submit", e => {
    e.preventDefault();
    const v = Math.abs(parseAmount(form.querySelector("#contrib-amount").value));
    if (!v) { toast("Escribe un importe mayor que 0", { error: true }); return; }
    const sign = form.querySelector("[name=dir]:checked").value === "add" ? 1 : -1;
    let reached = false;
    update(st => {
      const goal = st.finance.goals.find(x => x.id === id);
      const before = goal.saved;
      goal.saved = Math.max(0, Math.round((goal.saved + sign * v) * 100) / 100);
      (goal.history ||= []).push({ date: iso(), amount: sign * v });
      reached = before < goal.target && goal.saved >= goal.target;
    });
    closeSheet();
    toast(reached ? "¡Meta conseguida!" : sign > 0 ? `Aportados ${money(v)}` : `Retirados ${money(v)}`);
  });
}

// ---------- Gestión de categorías
export function openCategories(kind = "expense") {
  const render = () => {
    const s = getState();
    const cats = s.finance.categories.filter(c => c.kind === kind);
    return `
      <h2>Categorías</h2>
      ${seg("cat-kind", { expense: "Gastos", income: "Ingresos" }, kind)}
      <div class="cat-list">${cats.filter(c => !c.parentId).map(p => `
        <div class="cat-block" style="--c:${p.color || "#8b9099"}">
          <div class="cat-row top"><span class="h-dot"></span><b>${esc(p.name)}</b>
            <button class="btn small" type="button" data-rename="${p.id}">Renombrar</button>
            <button class="btn small" type="button" data-addsub="${p.id}" aria-label="Añadir subcategoría a ${esc(p.name)}">+ Sub</button></div>
          ${cats.filter(c => c.parentId === p.id).map(c => `
          <div class="cat-row"><span>${esc(c.name)}</span>
            <button class="btn small" type="button" data-rename="${c.id}">Renombrar</button>
            <button class="btn small danger" type="button" data-delcat="${c.id}" aria-label="Borrar ${esc(c.name)}">✕</button></div>`).join("")}
        </div>`).join("")}</div>
      <form class="form" id="cat-new" novalidate>
        ${field("Nueva categoría principal", "cat-new-name", `<div class="btn-row"><input class="input" id="cat-new-name" maxlength="30" autocomplete="off" style="flex:2" placeholder="Nombre"><button class="btn" type="submit">Añadir</button></div>`)}
      </form>
      <div id="cat-edit"></div>`;
  };
  const sheet = openSheet(render(), { onOpen: el => { wire(el); el.addEventListener("click", onClick); } });

  function rerender() { sheet.innerHTML = `<div class="grabber"></div>${render()}`; wire(sheet); }

  function inlineEdit(title, value, onSave) {
    const box = sheet.querySelector("#cat-edit");
    box.innerHTML = `<form class="form inline-edit" novalidate>${field(title, "cat-edit-name", `<div class="btn-row"><input class="input" id="cat-edit-name" maxlength="30" autocomplete="off" style="flex:2" value="${esc(value)}"><button class="btn primary" type="submit">Guardar</button></div>`)}</form>`;
    const input = box.querySelector("input");
    input.focus();
    box.scrollIntoView({ block: "nearest" });
    box.querySelector("form").addEventListener("submit", e => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      onSave(v);
      rerender();
    });
  }

  function wire(el) {
    el.querySelectorAll("[name=cat-kind]").forEach(r => r.addEventListener("change", () => { kind = r.value; rerender(); }));
    el.querySelector("#cat-new").addEventListener("submit", e => {
      e.preventDefault();
      const name = el.querySelector("#cat-new-name").value.trim();
      if (!name) return;
      update(st => st.finance.categories.push({ id: uid(), name, kind, parentId: null, color: kind === "income" ? "#7fcf9b" : "#7cc4e4" }));
      rerender();
    });
  }

  function onClick(e) {
      const b = e.target.closest("button[data-rename], button[data-addsub], button[data-delcat]");
      if (!b) return;
      if (b.dataset.rename) {
        const c = catById(getState(), b.dataset.rename);
        inlineEdit(`Renombrar «${c.name}»`, c.name, v => update(st => { catById(st, c.id).name = v; }));
      } else if (b.dataset.addsub) {
        const p = catById(getState(), b.dataset.addsub);
        inlineEdit(`Nueva subcategoría de «${p.name}»`, "", v => update(st => st.finance.categories.push({ id: uid(), name: v, kind: p.kind, parentId: p.id })));
      } else if (b.dataset.delcat) {
        const st0 = getState();
        const c = catById(st0, b.dataset.delcat);
        const used = st0.finance.transactions.filter(t => t.categoryId === c.id).length;
        // los movimientos de una subcategoría borrada pasan a su categoría principal
        update(st => {
          st.finance.transactions.forEach(t => { if (t.categoryId === c.id) t.categoryId = c.parentId; });
          st.finance.recurring.forEach(r => { if (r.categoryId === c.id) r.categoryId = c.parentId; });
          st.finance.categories = st.finance.categories.filter(x => x.id !== c.id);
        });
        toast(used ? `Borrada · ${used} movimiento${used > 1 ? "s pasan" : " pasa"} a la categoría principal` : "Subcategoría borrada");
        rerender();
      }
  }
}

// ---------- Ingreso mensual base / Sueldo
export function openMonthlyIncomeForm() {
  const s = getState();
  const current = Number(s.finance.monthlyIncome) || 0;
  const sheet = openSheet(`
    <h2>Ingreso mensual del mes</h2>
    <p class="hint">Indica tu sueldo o ingresos habituales de este mes. Tu cartera usará esta cifra para calcular automáticamente tus gastos fijos comprometidos, tu dinero libre y si tus nuevos gastos son viables.</p>
    <form class="form" id="income-form" novalidate>
      <div class="field amount-field">
        <label for="monthly-income-input">Ingreso previsto del mes</label>
        <div class="amount-wrap"><input class="input amount" id="monthly-income-input" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${amountInput(current)}"><span>€</span></div>
      </div>
      <div class="btn-row">
        <button class="btn" type="button" data-close>Cancelar</button>
        <button class="btn primary" type="submit">Guardar ingreso</button>
      </div>
    </form>`);

  const form = sheet.querySelector("#income-form");
  setTimeout(() => form.querySelector("#monthly-income-input").focus(), 250);

  form.addEventListener("submit", e => {
    e.preventDefault();
    const val = parseAmount(form.querySelector("#monthly-income-input").value);
    if (isNaN(val) || val < 0) { toast("Escribe una cifra válida", { error: true }); return; }
    update(st => {
      st.finance.monthlyIncome = val;
    });
    closeSheet();
    toast(val > 0 ? `Ingreso mensual fijado en ${money(val)}` : "Ingreso mensual desactivado");
  });
}

// ---------- Importar extracto bancario (CSV)
export function openBankImportModal(targetAccountId = null) {
  if (needAccounts()) return;
  const s = getState();
  const accs = s.finance.accounts;
  const initialAcc = targetAccountId || accs[0].id;
  let parsedResult = null;

  const sheet = openSheet(`
    <h2>Importar extracto de tu banco</h2>
    <div class="banner" style="background:rgba(0,240,255,0.08);border:1px solid rgba(0,240,255,0.2);border-radius:12px;padding:12px 14px;margin:8px 0 16px;font-size:12px;line-height:1.5;color:#E5E5EA;">
      🔒 <b>100% privado y seguro:</b> El extracto se procesa directamente en tu iPhone. Ningún dato bancario, saldo ni número de cuenta sale de tu dispositivo.
    </div>

    <form class="form" id="bank-import-form" novalidate>
      ${field("Cuenta de destino", "bank-acc", `<select class="input" id="bank-acc">${accs.map(a => `<option value="${a.id}"${a.id === initialAcc ? " selected" : ""}>${esc(a.name)}</option>`).join("")}</select>`)}

      <div class="chips" role="tablist" style="margin:6px 0 10px">
        <button type="button" class="chip" id="btn-mode-file" aria-selected="true">Subir archivo (PDF o CSV)</button>
        <button type="button" class="chip" id="btn-mode-paste" aria-selected="false">Pegar texto copiado</button>
      </div>

      <div id="bank-step-upload">
        <label class="btn primary" for="bank-file-input" style="width:100%;margin-top:4px;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;">
          ${icon.upload} Seleccionar PDF o CSV bancario
        </label>
        <input type="file" id="bank-file-input" class="sr-only" accept=".pdf,.csv,.txt,.tsv,application/pdf,text/csv,text/plain">
        <p class="hint" style="text-align:center;margin-top:8px">Compatible con extractos de ING (PDF y CSV), BBVA, Santander, CaixaBank, Sabadell y Revolut.</p>
      </div>

      <div id="bank-step-paste" hidden style="margin-top:4px">
        <textarea id="bank-paste-input" class="input" style="height:120px;font-family:monospace;font-size:12px;width:100%;box-sizing:border-box" placeholder="Pega aquí las filas copiadas de tu extracto de ING, Numbers o Excel..."></textarea>
        <button class="btn primary" type="button" id="bank-process-paste" style="width:100%;margin-top:8px">Procesar texto</button>
      </div>

      <div id="bank-preview" hidden style="margin-top:14px">
        <div class="split" style="margin-bottom:10px">
          <div><small>Movimientos encontrados</small><b class="num pos" id="bank-count-val">0</b></div>
          <div><small>Rango de fechas</small><b id="bank-dates-val" style="font-size:13px">—</b></div>
        </div>
        <p class="hint" style="margin-bottom:8px">Vista previa de los primeros movimientos con auto-categorización:</p>
        <div class="list tight" id="bank-preview-list" style="max-height:180px;overflow-y:auto;border-radius:10px;background:var(--bg)"></div>

        <label class="check-row" style="margin-top:12px;display:flex;align-items:flex-start;gap:8px;font-size:12px;cursor:pointer">
          <input type="checkbox" id="bank-replace-existing" checked>
          <span><b>Sustituir movimientos anteriores:</b> borrar los movimientos que ya estaban en esta cuenta y registrar solo los nuevos (evita duplicidades).</span>
        </label>

        <div class="btn-row" style="margin-top:16px">
          <button class="btn" type="button" data-close>Cancelar</button>
          <button class="btn primary" type="button" id="bank-confirm-btn">Confirmar e importar</button>
        </div>
      </div>
    </form>`);

  const fileInput = sheet.querySelector("#bank-file-input");
  const uploadBlock = sheet.querySelector("#bank-step-upload");
  const pasteBlock = sheet.querySelector("#bank-step-paste");
  const pasteInput = sheet.querySelector("#bank-paste-input");
  const processPasteBtn = sheet.querySelector("#bank-process-paste");
  const btnModeFile = sheet.querySelector("#btn-mode-file");
  const btnModePaste = sheet.querySelector("#btn-mode-paste");
  const previewBlock = sheet.querySelector("#bank-preview");
  const countVal = sheet.querySelector("#bank-count-val");
  const datesVal = sheet.querySelector("#bank-dates-val");
  const previewList = sheet.querySelector("#bank-preview-list");
  const confirmBtn = sheet.querySelector("#bank-confirm-btn");
  const accSelect = sheet.querySelector("#bank-acc");

  const showPreview = (result) => {
    parsedResult = result;
    countVal.textContent = `${parsedResult.totalCount} (${parsedResult.expensesCount} gastos, ${parsedResult.incomesCount} ingresos)`;
    datesVal.textContent = `${parsedResult.fromDate} a ${parsedResult.toDate}`;

    previewList.innerHTML = parsedResult.transactions.slice(0, 6).map(t => `
      <div class="item" style="padding:8px 10px;font-size:13px">
        <span class="t"><b>${esc(t.note)}</b><small>${t.date} · ${catLabel(getState(), t.categoryId)}</small></span>
        <b class="num ${t.amount > 0 ? "pos" : "neg"}">${t.amount > 0 ? "+" : ""}${money(t.amount)}</b>
      </div>`).join("");

    previewBlock.hidden = false;
    uploadBlock.style.opacity = "0.5";
    if (pasteBlock) pasteBlock.style.opacity = "0.5";
  };

  btnModeFile.addEventListener("click", () => {
    btnModeFile.setAttribute("aria-selected", "true");
    btnModePaste.setAttribute("aria-selected", "false");
    uploadBlock.hidden = false;
    pasteBlock.hidden = true;
  });

  btnModePaste.addEventListener("click", () => {
    btnModePaste.setAttribute("aria-selected", "true");
    btnModeFile.setAttribute("aria-selected", "false");
    uploadBlock.hidden = true;
    pasteBlock.hidden = false;
    setTimeout(() => pasteInput.focus(), 200);
  });

  processPasteBtn.addEventListener("click", () => {
    const val = pasteInput.value.trim();
    if (!val) { toast("Pega primero las filas del extracto", { error: true }); return; }
    try {
      const currentTxs = getState().finance.transactions;
      const res = parseBankCSV(val, currentTxs);
      showPreview(res);
    } catch (err) {
      toast(err.message || "No se pudo interpretar el texto copiado", { error: true, ms: 4000 });
    }
  });

  fileInput.addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      toast("Leyendo extracto...", { ms: 2500 });
      const currentTxs = getState().finance.transactions;
      const res = await parseBankFile(file, currentTxs);
      showPreview(res);
      toast(`Detectados ${res.totalCount} movimientos`);
    } catch (err) {
      toast(err.message || "No se pudo interpretar el archivo bancario", { error: true, ms: 4500 });
      e.target.value = "";
    }
  });

  confirmBtn.addEventListener("click", () => {
    if (!parsedResult || !parsedResult.transactions.length) return;
    const accId = accSelect.value;
    const replaceExisting = sheet.querySelector("#bank-replace-existing")?.checked === true;
    try {
      let res = null;
      update(st => {
        res = applyBankImport(st, accId, parsedResult.transactions, { replaceExisting });
        if (replaceExisting) {
          const targetAcc = st.finance.accounts.find(a => a.id === accId);
          if (targetAcc) {
            if (parsedResult.initialBalance != null) {
              targetAcc.initial = parsedResult.initialBalance;
            } else if (targetAcc.initial === 0 || !targetAcc.initial) {
              targetAcc.initial = 310.07;
            }
          }
        }
        reconcileFinance(st);
      });
      closeSheet();

      // Navegar automáticamente al mes con los movimientos importados
      const targetYm = parsedResult.toDate ? parsedResult.toDate.slice(0, 7) : (parsedResult.transactions[0]?.date ? parsedResult.transactions[0].date.slice(0, 7) : null);
      if (targetYm) {
        setFinanceMonth(targetYm);
      }

      const msg = res.added
        ? `${replaceExisting ? "Sustituidos con éxito:" : "Importados"} ${res.added} movimientos nuevos${res.linkedFixed ? ` (${res.linkedFixed} fijos detectados)` : ""}${res.skippedDuplicates ? ` · ${res.skippedDuplicates} duplicados omitidos` : ""}`
        : `Todo al día: los ${res.total} movimientos ya estaban en la cuenta`;
      toast(msg, { ms: 4500 });
    } catch (err) {
      toast(err.message || "Error al aplicar importación", { error: true });
    }
  });
}

// ---------- 6. Ajuste directo de Saldo Real en Banco
export function openAdjustBalanceModal(accId = null) {
  const s = getState();
  const accounts = s.finance.accounts;
  if (!accounts.length) {
    toast("Crea una cuenta primero", { error: true });
    return;
  }
  const targetAcc = accounts.find(a => a.id === accId) || accounts[0];
  const curBal = accountBalance(s, targetAcc.id);

  const sheet = openSheet(`
    <h2>⚡ Ajustar saldo real en banco</h2>
    <p class="hint">Indica cuánto dinero tienes <b>hoy en tu cuenta bancaria</b>. La app corregirá tu cuenta para que cuadre exactamente y no vuelva a salirte en negativo.</p>
    <form class="form" id="adjust-bal-form" novalidate>
      ${accounts.length > 1 ? `
        <div class="field">
          <label class="label" for="adjust-acc-select">Cuenta a ajustar</label>
          <select class="input" id="adjust-acc-select">
            ${accounts.map(a => `<option value="${a.id}"${a.id === targetAcc.id ? " selected" : ""}>${esc(a.name)} (según app: ${money(accountBalance(s, a.id))})</option>`).join("")}
          </select>
        </div>` : `<input type="hidden" id="adjust-acc-select" value="${targetAcc.id}">`}

      <div class="field">
        <label class="label" for="adjust-bal-input">Dinero real que tienes hoy en el banco (€)</label>
        <input class="input" id="adjust-bal-input" type="text" inputmode="decimal" autocomplete="off" placeholder="590,21" value="${curBal > 0 ? String(curBal).replace(".", ",") : "590,21"}" style="font-size:18px;font-weight:700">
      </div>

      <label class="check-row" style="margin-top:12px;display:flex;align-items:flex-start;gap:8px;font-size:12px;cursor:pointer">
        <input type="checkbox" id="adjust-clean-old" checked>
        <span><b>Limpiar gastos de prueba y movimientos automáticos huérfanos:</b> elimina gastos automáticos o falsos que estaban arrastrando tu saldo a negativo.</span>
      </label>

      <div class="btn-row" style="margin-top:18px">
        <button class="btn" type="button" data-close>Cancelar</button>
        <button class="btn primary" type="submit">Guardar saldo real</button>
      </div>
    </form>
  `);

  const form = sheet.querySelector("#adjust-bal-form");
  form.addEventListener("submit", e => {
    e.preventDefault();
    const selAccId = sheet.querySelector("#adjust-acc-select")?.value;
    const rawVal = sheet.querySelector("#adjust-bal-input")?.value?.trim();
    const cleanOld = sheet.querySelector("#adjust-clean-old")?.checked === true;
    const targetBalance = parseAmount(rawVal);

    if (isNaN(targetBalance)) {
      toast("Introduce un saldo válido (ej. 590,21)", { error: true });
      return;
    }

    update(st => {
      const acc = st.finance.accounts.find(a => a.id === selAccId);
      if (!acc) return;

      if (cleanOld) {
        st.finance.transactions = st.finance.transactions.filter(t => t.accountId !== acc.id || !t.auto);
      }

      const txSum = st.finance.transactions
        .filter(t => t.accountId === acc.id)
        .reduce((sum, t) => sum + t.amount, 0);

      acc.initial = Math.round((targetBalance - txSum) * 100) / 100;
      reconcileFinance(st);
    });

    closeSheet();
    toast(`Saldo fijado en ${money(targetBalance)}`);
  });
}
