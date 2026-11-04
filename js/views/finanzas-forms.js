// Formularios de Finanzas (en hoja inferior): movimientos, cuentas, fijos, metas y categorías.

import { getState, update } from "../state.js";
import { openSheet, closeSheet, toast, confirmSheet, esc, uid, money } from "../ui.js";
import { iso } from "../stats.js";
import { seg, field } from "../forms.js";
import { ACCOUNT_TYPES, FREQS, parseAmount, amountInput, applyRecurring, accountBalance, catById } from "../finance.js";

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
      </div>
      <div class="row2">
        ${field("Fecha", "tx-date", `<input class="input" type="date" id="tx-date" value="${tx?.date || iso()}" required>`)}
        ${field(`<span data-show="expense income">Cuenta</span><span data-show="transfer">Desde</span>`, "tx-acc", `<select class="input" id="tx-acc">${accountOptions(s, acc)}</select>`)}
      </div>
      <div data-show="transfer">${field("Hacia", "tx-acc2", `<select class="input" id="tx-acc2">${accountOptions(s, acc2)}</select>`)}</div>
      <div data-show="expense">${field("Categoría", "tx-cat-e", `<select class="input" id="tx-cat-e">${categoryOptions(s, "expense", tx?.categoryId || "c-comida-supermercado")}</select>`)}</div>
      <div data-show="income">${field("Categoría", "tx-cat-i", `<select class="input" id="tx-cat-i">${categoryOptions(s, "income", tx?.categoryId || "c-nomina")}</select>`)}</div>
      ${field("Nota (opcional)", "tx-note", `<input class="input" id="tx-note" maxlength="80" autocomplete="off" value="${esc(pair?.out.note ?? tx?.note ?? "")}" placeholder="p. ej. Mercadona">`)}
      ${tx?.auto ? `<p class="hint">Apuntado automáticamente por un gasto fijo.</p>` : ""}
      <div class="btn-row">
        ${id ? `<button class="btn danger" type="button" id="tx-del">Borrar</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
        <button class="btn primary" type="submit">Guardar</button>
      </div>
    </form>`);

  const form = sheet.querySelector("#tx-form");
  const sync = () => {
    const t = form.querySelector("[name=type]:checked").value;
    form.dataset.type = t;
    sheet.querySelectorAll("[data-show]").forEach(el => { el.hidden = !el.dataset.show.split(" ").includes(t); });
  };
  form.addEventListener("change", e => { if (e.target.name === "type") sync(); });
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
        st.finance.transactions.push({ ...(tx && !tx.transferId ? tx : {}), id: tx && !tx.transferId ? tx.id : uid(), date, amount: t === "expense" ? -value : value, accountId, categoryId, note, transferId: undefined });
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
  const hasTx = a && s.finance.transactions.some(t => t.accountId === a.id);
  const sheet = openSheet(`
    <h2>${a ? "Editar cuenta" : "Nueva cuenta"}</h2>
    <form class="form" id="acc-form" novalidate>
      ${field("Nombre", "acc-name", `<input class="input" id="acc-name" maxlength="30" autocomplete="off" value="${esc(a?.name || "")}" placeholder="p. ej. Cuenta nómina">`)}
      ${field("Tipo", "acc-type", `<select class="input" id="acc-type">${Object.entries(ACCOUNT_TYPES).map(([v, l]) => `<option value="${v}"${v === (a?.type || "banco") ? " selected" : ""}>${l}</option>`).join("")}</select>`)}
      ${field("Saldo inicial", "acc-initial", `<input class="input" id="acc-initial" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${a ? String(a.initial).replace(".", ",") : ""}">`)}
      <p class="hint">El dinero que tenía la cuenta antes de empezar a apuntar movimientos. Puede ser negativo (p. ej. una tarjeta de crédito).</p>
      ${a ? `<p class="hint">Saldo actual: <b class="num">${money(accountBalance(s, a.id))}</b></p>` : ""}
      <div class="btn-row">
        ${a ? `<button class="btn danger" type="button" id="acc-del">Borrar</button>` : `<button class="btn" type="button" data-close>Cancelar</button>`}
        <button class="btn primary" type="submit">Guardar</button>
      </div>
    </form>`);
  const form = sheet.querySelector("#acc-form");
  form.addEventListener("submit", e => {
    e.preventDefault();
    const name = form.querySelector("#acc-name").value.trim();
    if (!name) { toast("Escribe un nombre", { error: true }); return; }
    const raw = form.querySelector("#acc-initial").value.trim();
    const initial = raw ? parseAmount(raw.replace(/^[−-]/, "-")) : 0;
    if (Number.isNaN(initial)) { toast("El saldo inicial no es un número válido", { error: true }); return; }
    const type = form.querySelector("#acc-type").value;
    update(st => {
      if (a) Object.assign(st.finance.accounts.find(x => x.id === a.id), { name, type, initial });
      else st.finance.accounts.push({ id: uid(), name, type, initial });
    });
    closeSheet();
    toast(a ? "Cuenta actualizada" : "Cuenta creada");
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
