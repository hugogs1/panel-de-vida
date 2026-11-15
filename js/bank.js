// Importador bancario universal 100% local y seguro.
// Lee archivos CSV, TXT o TSV exportados por cualquier banco español o internacional
// (BBVA, Santander, CaixaBank, ING, Sabadell, Openbank, N26, Revolut, etc.).
//
// SEGURIDAD:
// - Se procesa 100% en el dispositivo del usuario en memoria (FileReader).
// - NUNCA se envía ningún dato a ningún servidor ni servicio de terceros.
// - Solo se extraen Fecha, Concepto e Importe; se ignoran datos sensibles como IBAN,
//   DNI, saldos o nombres de titulares.
// - Detección y prevención estricta de movimientos duplicados.

import { iso } from "./stats.js";
import { uid } from "./ui.js";

// Reglas de auto-categorización por palabras clave en el concepto del banco
const RULES = [
  // Supermercados y alimentación
  { cat: "c-comida-supermercado", re: /mercadona|carrefour|lidl|alcampo|eroski|dia\b|aldi\b|hipercor|supercor|consum|bonpreu|ahorramas|coviran|costco|fruteria|carniceria|pescaderia|panaderia/i },
  // Restaurantes, comida rápida y delivery
  { cat: "c-comida-restaurantes", re: /restauran|burger|mcdonald|telepizza|domino|foster|ginos|vips|starbucks|tgb\b|kfc\b|pizzeria|taberna|cerveceria|tasca|meson|cafeteria|bar\b|just eat|justeat|ubereats|uber eats|glovo|deliveroo/i },
  // Combustible y gasolineras
  { cat: "c-transporte-combustible", re: /repsol|cepsa|bp\b|galp|shell|petronor|estacion de servicio|gasolinera|carburante|ballenoil|plenoil/i },
  // Transporte público, viajes y VTC
  { cat: "c-transporte-publico", re: /renfe|metro\b|emt\b|alsa|tmb\b|cercanias|ave\b|iryo|ouigo|billete|billetes|autopista|peaje|uber\b|cabify|freenow|free now|taxi|bold\b|vueling|ryanair|iberia/i },
  // Suscripciones y streaming
  { cat: "c-subs", re: /netflix|spotify|hbo|prime video|amazon prime|disney|dazn|filmin|crunchyroll|youtube|patreon|apple\.com\/bill|google \*|openai|chatgpt/i },
  // Gimnasio, boxeo y deporte
  { cat: "c-deporte-gimnasio", re: /gym|gimnasio|basic fit|basicfit|fitup|vivagym|altafit|mcfit|smartfit|crossfit|fitness/i },
  { cat: "c-deporte-material", re: /decathlon|sprinter|jd sports|foot locker|nike|adidas|padel|boxeo/i },
  // Salud y farmacia
  { cat: "c-salud-farmacia", re: /farmacia|parafarmacia|botica/i },
  { cat: "c-salud", re: /clinica|dental|dentista|sanitas|adeslas|asisa|quiron|hospital|optica|fisioterap/i },
  // Casa y suministros
  { cat: "c-casa", re: /alquiler|comunidad de prop|endesa|iberdrola|naturgy|totalenergies|aqualia|canal de isabel|vodafone|movistar|orange|digi\b|masmovil|o2\b|yoigo|pepephone/i },
  // Compras y tecnología
  { cat: "c-compras", re: /amazon|zara\b|bershka|pull and bear|pull&bear|mango\b|stradivarius|el corte ingles|corte ingles|ikea|leroy merlin|mediamarkt|media markt|pccomponentes|pc componentes|aliexpress|temu\b|shein/i },
  // Ingresos: Nómina y transferencias a favor
  { cat: "c-nomina", re: /nomina|sueldo|salario|pension|haberes/i },
  { cat: "c-otrosing", re: /transferencia a su favor|ingreso en cuenta|abono transfer/i }
];

const norm = s => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Autodetecta el delimitador de un archivo de texto/CSV (;, , o \t)
 */
function detectDelimiter(text) {
  const sample = text.slice(0, 3000);
  const semicolons = (sample.match(/;/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  const tabs = (sample.match(/\t/g) || []).length;
  if (tabs > semicolons && tabs > commas) return "\t";
  if (semicolons >= commas) return ";";
  return ",";
}

/**
 * Parsea una fecha en formatos comunes de banco español/internacional:
 * DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD, DD/MM/YY
 */
function parseBankDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim().replace(/['"]/g, "");
  // Formato ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Formatos DD/MM/YYYY o DD-MM-YYYY o DD.MM.YYYY
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const day = m[1].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    let year = m[3];
    if (year.length === 2) year = (Number(year) > 70 ? "19" : "20") + year;
    return `${year}-${month}-${day}`;
  }
  return null;
}

/**
 * Parsea un importe monetario bancario:
 * Acepta "-45,20", "1.234,56", "45.20-", "-45.20", "12,50 EUR", "12,50 €", etc.
 */
function parseBankAmount(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim().replace(/['"€$]/g, "").replace(/\s+/g, "");
  if (!s) return NaN;

  // Si tiene el signo menos al final: "45,20-" -> "-45,20"
  let isNeg = false;
  if (s.endsWith("-") || s.startsWith("-") || s.includes("CR")) {
    isNeg = true;
    s = s.replace(/[-+CR]/gi, "");
  }

  // Detección de coma decimal europea vs punto americano
  if (s.includes(",") && s.includes(".")) {
    // Si la coma está después del punto: "1.234,56"
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // "1,234.56"
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(",")) {
    // Solo comas: "45,20" -> "45.20"
    s = s.replace(",", ".");
  }

  const num = Number(s);
  if (!Number.isFinite(num)) return NaN;
  const finalVal = Math.round(num * 100) / 100;
  return isNeg ? -Math.abs(finalVal) : finalVal;
}

/**
 * Limpia y embellece el concepto de un extracto bancario
 */
function cleanBankConcept(str) {
  let s = String(str || "").trim().replace(/^['"]|['"]$/g, "");
  // Quitar prefijos bancarios ruidosos habituales
  s = s.replace(/^(compra en|pago con tarjeta en|pago en|transferencia de|transferencia a|recibo de|adeudo de|abono de|bizum a favor de|bizum de|pago bizum)\s+/i, "");
  // Normalizar espacios múltiples
  s = s.replace(/\s{2,}/g, " ").trim();
  return s || "Movimiento bancario";
}

/**
 * Sugiere una categoría según el concepto y el histórico existente
 */
function guessCategory(note, amount, existingTxs = []) {
  const isIncome = amount > 0;
  const n = norm(note);

  // 1. Buscar coincidencia exacta en el histórico del usuario
  if (existingTxs.length) {
    const prev = [...existingTxs].reverse().find(t => !t.transferId && norm(t.note) === n && (isIncome ? t.amount > 0 : t.amount < 0));
    if (prev?.categoryId) return prev.categoryId;
  }

  // 2. Buscar por reglas de palabras clave
  for (const rule of RULES) {
    if (rule.re.test(note)) {
      return rule.cat;
    }
  }

  // 3. Fallback genérico
  return isIncome ? "c-otrosing" : "c-otros";
}

/**
 * Parsea el contenido en texto de un extracto bancario CSV / TXT / TSV
 */
export function parseBankCSV(text, existingTxs = []) {
  if (!text || typeof text !== "string") {
    throw new Error("El archivo está vacío o no se puede leer.");
  }

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error("El archivo no contiene suficientes filas de movimientos.");
  }

  const delim = detectDelimiter(text);

  // Encontrar la fila de cabecera
  let headerIndex = -1;
  let colDate = -1;
  let colDesc = -1;
  let colAmount = -1;
  let colDebit = -1;
  let colCredit = -1;

  for (let i = 0; i < Math.min(25, lines.length); i++) {
    const cols = lines[i].split(delim).map(c => norm(c.replace(/['"]/g, "")));
    
    // Buscar posibles columnas de fecha
    const dIdx = cols.findIndex(c => /fecha|f\.?\s*valor|f\.?\s*operac|date|dia/i.test(c));
    // Buscar posibles columnas de concepto / descripción
    const descIdx = cols.findIndex(c => /concepto|descripci|detalle|movimiento|texto|referencia|description|concept/i.test(c));
    // Buscar posibles columnas de importe
    const amtIdx = cols.findIndex(c => /importe|cantidad|amount|total/i.test(c) && !/saldo|disponible/i.test(c));
    const debIdx = cols.findIndex(c => /debe|cargo|gasto|salida/i.test(c));
    const credIdx = cols.findIndex(c => /haber|abono|ingreso|entrada/i.test(c));

    if (dIdx !== -1 && (amtIdx !== -1 || (debIdx !== -1 && credIdx !== -1))) {
      headerIndex = i;
      colDate = dIdx;
      colDesc = descIdx !== -1 ? descIdx : (dIdx === 0 ? 1 : 0);
      colAmount = amtIdx;
      colDebit = debIdx;
      colCredit = credIdx;
      break;
    }
  }

  // Si no se encontró cabecera con nombres estándar, intentar deducir por los tipos de datos de las primeras filas
  if (headerIndex === -1) {
    headerIndex = 0; // Asumir fila 0 o empezar a evaluar filas
  }

  const transactions = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const rawCols = lines[i].split(delim);
    if (rawCols.length < 2) continue;

    // Obtener fecha
    let date = null;
    if (colDate !== -1 && colDate < rawCols.length) {
      date = parseBankDate(rawCols[colDate]);
    } else {
      // Buscar en cualquier columna una fecha válida
      for (const col of rawCols) {
        date = parseBankDate(col);
        if (date) break;
      }
    }
    if (!date) continue; // Fila sin fecha válida -> omitir

    // Obtener importe
    let amount = NaN;
    if (colDebit !== -1 && colCredit !== -1) {
      const debitVal = parseBankAmount(rawCols[colDebit]);
      const creditVal = parseBankAmount(rawCols[colCredit]);
      if (!isNaN(debitVal) && Math.abs(debitVal) > 0) amount = -Math.abs(debitVal);
      else if (!isNaN(creditVal) && Math.abs(creditVal) > 0) amount = Math.abs(creditVal);
    } else if (colAmount !== -1 && colAmount < rawCols.length) {
      amount = parseBankAmount(rawCols[colAmount]);
    } else {
      // Probar columnas de derecha a izquierda buscando un número
      for (let c = rawCols.length - 1; c >= 0; c--) {
        const val = parseBankAmount(rawCols[c]);
        if (!isNaN(val) && val !== 0) {
          amount = val;
          break;
        }
      }
    }
    if (isNaN(amount) || amount === 0) continue; // Fila sin importe válido -> omitir

    // Obtener concepto
    let note = "Movimiento bancario";
    if (colDesc !== -1 && colDesc < rawCols.length) {
      note = cleanBankConcept(rawCols[colDesc]);
    } else {
      // Encontrar la columna más larga con texto
      let longest = "";
      rawCols.forEach(c => {
        const t = c.replace(/['"]/g, "").trim();
        if (t.length > longest.length && isNaN(parseBankAmount(t)) && !parseBankDate(t)) {
          longest = t;
        }
      });
      if (longest) note = cleanBankConcept(longest);
    }

    const categoryId = guessCategory(note, amount, existingTxs);

    transactions.push({
      date,
      amount,
      note,
      categoryId
    });
  }

  if (!transactions.length) {
    throw new Error("No se detectaron movimientos válidos en el extracto. Asegúrate de exportar un CSV con Fecha, Concepto e Importe.");
  }

  // Ordenar cronológicamente
  transactions.sort((a, b) => a.date.localeCompare(b.date));

  const expenses = transactions.filter(t => t.amount < 0);
  const incomes = transactions.filter(t => t.amount > 0);

  return {
    transactions,
    totalCount: transactions.length,
    expensesCount: expenses.length,
    incomesCount: incomes.length,
    fromDate: transactions[0]?.date || iso(),
    toDate: transactions[transactions.length - 1]?.date || iso()
  };
}

/**
 * Aplica los movimientos importados al estado, filtrando duplicados existentes en la cuenta seleccionada
 */
export function applyBankImport(state, accountId, parsedTransactions) {
  if (!state.finance.accounts.some(a => a.id === accountId)) {
    throw new Error("La cuenta seleccionada no existe.");
  }

  const existing = state.finance.transactions.filter(t => t.accountId === accountId);
  const toAdd = [];
  let skippedDuplicates = 0;

  for (const item of parsedTransactions) {
    // Comprobar si ya existe un movimiento idéntico en la misma cuenta
    const isDup = existing.some(ex =>
      ex.date === item.date &&
      Math.abs(ex.amount - item.amount) < 0.005 &&
      norm(ex.note) === norm(item.note)
    );

    if (isDup) {
      skippedDuplicates++;
      continue;
    }

    const newTx = {
      id: uid(),
      date: item.date,
      amount: item.amount,
      accountId,
      categoryId: item.categoryId,
      note: item.note,
      source: "banco"
    };

    toAdd.push(newTx);
    existing.push(newTx); // para no duplicar dentro del mismo lote importado
  }

  state.finance.transactions.push(...toAdd);

  // Ordenar todos los movimientos por fecha descendente
  state.finance.transactions.sort((a, b) => b.date.localeCompare(a.date));

  return {
    added: toAdd.length,
    skippedDuplicates,
    total: parsedTransactions.length
  };
}
