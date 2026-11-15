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
export const RULES = [
  // Supermercados y alimentación
  {
    cat: "c-comida-supermercado",
    re: /mercadona|carrefour|lidl|alcampo|eroski|dia\b|aldi\b|hipercor|supercor|consum|bonpreu|ahorramas|coviran|costco|condis|spar\b|bm supermercados|hiperdino|froiz|gadis|la sirena|supermercad|hipermercad|fruteria|carniceria|pescaderia|panaderia|charcuteria|verduleria|alimentacion/i
  },
  // Restaurantes, cafeterías, comida rápida y delivery
  {
    cat: "c-comida-restaurantes",
    re: /restauran|burger king|burgerking|mcdonald|kfc\b|popeyes|taco bell|telepizza|domino'?s|dominospizza|foster'?s hollywood|fosters|ginos|vips\b|starbucks|tgb\b|the good burger|goiko|five guys|honest greens|tagliatella|100 montaditos|montaditos|pizzeria|taberna|cerveceria|tasca|meson|cafeteria|cafes\b|coffee|poke\b|sushi|churreria|bar\b|just eat|justeat|ubereats|uber eats|glovo|deliveroo/i
  },
  // Combustible y gasolineras
  {
    cat: "c-transporte-combustible",
    re: /repsol|cepsa|bp\b|galp|shell|petronor|estacion de servicio|gasolinera|carburante|ballenoil|plenoil|petroprix|autonetoil|campsa|esso\b/i
  },
  // Transporte público, viajes, peajes, parking y VTC
  {
    cat: "c-transporte-publico",
    re: /renfe|metro\b|emt\b|alsa|tmb\b|cercanias|ave\b|iryo|ouigo|billete|billetes|autopista|peaje|bip&drive|bip & drive|bip and drive|ap-?\d+|parking|aparcamiento|telpark|easypark|parclick|smou\b|bicing|bicimad|uber\b|cabify|freenow|free now|taxi|bolt\b|vueling|ryanair|iberia|air europa|europcar|sixt|avis\b/i
  },
  // Suscripciones, streaming y software
  {
    cat: "c-subs",
    re: /netflix|spotify|hbo\b|max\b|prime video|amazon prime|disney|dazn|filmin|crunchyroll|youtube|patreon|apple\.com\/bill|itunes|google \*|google play|google storage|openai|chatgpt|anthropic|claude|playstation|psn\b|xbox|nintendo|steam\b|audible|dropbox|icloud/i
  },
  // Gimnasio, boxeo y deporte
  {
    cat: "c-deporte-gimnasio",
    re: /gym|gimnasio|basic[ -]?fit|vivagym|viva gym|altafit|mcfit|smartfit|smart fit|fitness park|fitnesspark|synergym|dreamfit|crossfit|brooklyn fitboxing|fitboxing|boxeo|boxing/i
  },
  {
    cat: "c-deporte-material",
    re: /decathlon|sprinter|jd sports|foot locker|nike|adidas|padel|tenis|escalada/i
  },
  // Salud y farmacia
  {
    cat: "c-salud-farmacia",
    re: /farmacia|parafarmacia|botica/i
  },
  {
    cat: "c-salud",
    re: /clinica|dental|dentista|sanitas|adeslas|asisa|dkv\b|mapfre|quiron|hospital|optica|fisioterap|fisio\b/i
  },
  // Casa, suministros y telecomunicaciones
  {
    cat: "c-casa",
    re: /alquiler|hipoteca|\bcomunidad\b|comunidad de prop|comunidad propietarios|endesa|iberdrola|naturgy|totalenergies|repsol luz|aqualia|canal de isabel|aguas de|vodafone|movistar|orange|digi\b|masmovil|mas movil|o2\b|yoigo|pepephone|lowi|simyo|finetwork|jazztel/i
  },
  // Compras, moda y tecnología
  {
    cat: "c-compras",
    re: /amazon|zara\b|bershka|pull and bear|pull&bear|mango\b|stradivarius|massimo dutti|oysho|el corte ingles|corte ingles|primark|shein|temu\b|aliexpress|ikea|leroy merlin|mediamarkt|media markt|pccomponentes|pc componentes|fnac|apple store/i
  },
  // Ingresos: Nómina, pensiones, transferencias a favor y Bizum recibido
  {
    cat: "c-nomina",
    re: /nomina|sueldo|salario|pension|haberes/i
  },
  {
    cat: "c-otrosing",
    re: /transferencia a su favor|ingreso en cuenta|abono transfer|abono de|bizum de\b|bizum recibido|transferencia recibida/i
  }
];

export const norm = s => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

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
  // Formato DD/MM (típico de extractos bancarios en PDF como ING)
  const mShort = s.match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (mShort) {
    const day = mShort[1].padStart(2, "0");
    const month = mShort[2].padStart(2, "0");
    const year = new Date().getFullYear();
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
  let s = String(str || "").replace(/^\uFEFF/, "").replace(/\u00A0/g, " ").trim().replace(/^['"]|['"]$/g, "");

  // 1. Anonimización y seguridad: Eliminar cualquier IBAN (ej. ES21 1465... o ES211465...)
  s = s.replace(/\b[A-Z]{2}\d{2}[\s\d]{10,30}\b/gi, "");
  // 2. Eliminar números de tarjeta de crédito o máscaras (ej. 1234 **** **** 5678 o **** 1234)
  s = s.replace(/\b(\d{4}[\s-]?){3,4}\d{4}\b/g, "");
  s = s.replace(/\b(\*{3,4}[\s-]?)+\d{2,4}\b/g, "");
  // 3. Eliminar DNI / NIE (ej. 12345678A o X1234567B)
  s = s.replace(/\b\d{8}[A-HJ-NP-TV-Z]\b/gi, "");
  s = s.replace(/\b[XYZ]\d{7}[A-HJ-NP-TV-Z]\b/gi, "");
  // 4. Eliminar etiquetas bancarias como "CTA: ...", "IBAN: ...", "TITULAR: ..."
  s = s.replace(/\b(iban|cta|cuenta|nif|cif|titular|ordenante|beneficiario)\s*[:=]?\s*[\w\d.-]+/gi, "");

  // 5. Quitar prefijos bancarios ruidosos habituales
  s = s.replace(/^(recibo sepa de|recibo sepa|recibo de|adeudo por domiciliacion de|adeudo domiciliado|adeudo de|compra en|pago con tarjeta en|pago en comercio|pago en|pago tarjeta|transferencia de|transferencia a favor de|transferencia a|transferencia emitida a|transferencia emitida|transferencia recibida de|transferencia recibida|abono transfer|abono de|bizum a favor de|bizum de|pago bizum a|pago bizum)\s+/i, "");
  // Normalizar espacios múltiples
  s = s.replace(/\s{2,}/g, " ").trim();
  return s || "Movimiento bancario";
}

/**
 * Sugiere una categoría según el concepto y el histórico existente
 */
export function guessCategory(note, amount, existingTxs = []) {
  const isIncome = amount > 0;
  const n = norm(note);

  // 1. Buscar coincidencia exacta en el histórico del usuario (ignorando categorías genéricas previas)
  if (existingTxs.length) {
    const prev = [...existingTxs].reverse().find(t =>
      !t.transferId &&
      norm(t.note) === n &&
      t.categoryId !== "c-otros" &&
      t.categoryId !== "c-otrosing" &&
      (isIncome ? t.amount > 0 : t.amount < 0)
    );
    if (prev?.categoryId) return prev.categoryId;
  }

  // 2. Buscar por reglas de palabras clave
  for (const rule of RULES) {
    if (rule.re.test(note)) {
      return rule.cat;
    }
  }

  // 3. Bizum como ocio / amigos si no hay otra regla
  if (/bizum/i.test(note)) {
    return isIncome ? "c-otrosing" : "c-ocio";
  }

  // 4. Fallback genérico
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

  // Si la separación por columnas tradicionales no encontró movimientos,
  // probar el parser de líneas continuas tipo PDF (ej. texto copiado de un PDF de ING)
  if (!transactions.length) {
    const pdfLineRe = /^(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)\s+(?:(?:\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)\s+)?(.+?)\s+([+-]?[\d.,]+)\s*€?(?:\s+([+-]?[\d.,]+)\s*€?)?$/;
    for (const line of lines) {
      const m = line.match(pdfLineRe);
      if (!m) continue;
      const date = parseBankDate(m[1]);
      const amount = parseBankAmount(m[3]);
      if (!date || isNaN(amount) || amount === 0) continue;
      const note = cleanBankConcept(m[2]);
      if (/saldo|periodo|extracto|titular|cuenta/i.test(note)) continue;
      const categoryId = guessCategory(note, amount, existingTxs);
      transactions.push({ date, amount, note, categoryId });
    }
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
 * y vinculando automáticamente con los gastos fijos configurados.
 */
export function applyBankImport(state, accountId, parsedTransactions) {
  if (!state.finance.accounts.some(a => a.id === accountId)) {
    throw new Error("La cuenta seleccionada no existe.");
  }

  const existing = state.finance.transactions.filter(t => t.accountId === accountId);
  const recurring = (state.finance.recurring || []).filter(r => r.active !== false && r.amount < 0);
  const toAdd = [];
  let skippedDuplicates = 0;
  let linkedFixed = 0;

  for (const item of parsedTransactions) {
    // 1. Comprobar si ya existe un movimiento idéntico en la misma cuenta
    const isDup = existing.some(ex =>
      ex.date === item.date &&
      Math.abs(ex.amount - item.amount) < 0.005 &&
      norm(ex.note) === norm(item.note)
    );

    if (isDup) {
      skippedDuplicates++;
      continue;
    }

    // 2. Comprobar si coincide con un gasto fijo recurrente
    let isFixed = false;
    let recurringId = null;

    if (item.amount < 0 && recurring.length) {
      const itemNote = norm(item.note);
      const matchRec = recurring.find(r => {
        const rName = norm(r.name);
        const amountMatches = Math.abs(r.amount - item.amount) < 0.05;
        const noteMatches = itemNote && rName && (itemNote.includes(rName) || rName.includes(itemNote));
        return amountMatches && (noteMatches || r.categoryId === item.categoryId);
      });

      if (matchRec) {
        isFixed = true;
        recurringId = matchRec.id;
        linkedFixed++;
      }
    }

    const newTx = {
      id: uid(),
      date: item.date,
      amount: item.amount,
      accountId,
      categoryId: item.categoryId,
      note: item.note,
      isFixed,
      recurringId,
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
    linkedFixed,
    total: parsedTransactions.length
  };
}
