// Copias de seguridad: exportar e importar todos los datos en un archivo .json

import { getState, update, replaceState, persist } from "./state.js";
import { todayISO, daysSince } from "./ui.js";

const APP_ID = "panel-de-vida";

export function backupDue(state) {
  const s = state.settings;
  const ref = s.lastBackupAt || state.createdAt;
  return daysSince(ref) >= (s.backupEveryDays || 7);
}

// Devuelve "shared" | "downloaded" | "cancelled"
export async function exportBackup() {
  const data = getState();
  const payload = { app: APP_ID, exportedAt: new Date().toISOString(), schema: data.version, data };
  const name = `panel-de-vida-${todayISO()}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const file = new File([blob], name, { type: "application/json" });

  // En iPhone, la hoja de compartir permite "Guardar en Archivos" o enviarlo a iCloud Drive
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Copia de Panel de Vida" });
      markBackup();
      return "shared";
    } catch (e) {
      if (e.name === "AbortError") return "cancelled";
      // si compartir falla por otro motivo, probamos con descarga
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  markBackup();
  return "downloaded";
}

function markBackup() {
  update(s => { s.settings.lastBackupAt = new Date().toISOString(); });
}

// Lee y valida un archivo. Devuelve el objeto de datos o lanza un Error con mensaje claro.
export async function readBackupFile(file) {
  let parsed;
  try { parsed = JSON.parse(await file.text()); }
  catch { throw new Error("El archivo no es un JSON válido."); }
  if (parsed?.app !== APP_ID || !parsed.data || typeof parsed.data !== "object") {
    throw new Error("Este archivo no es una copia de Panel de Vida.");
  }
  if ((parsed.data.version || 1) > getState().version) {
    throw new Error("La copia es de una versión más nueva de la app. Actualiza la app y vuelve a intentarlo.");
  }
  return parsed;
}

export async function applyBackup(parsed) {
  await replaceState(parsed.data);
  await persist();
}
