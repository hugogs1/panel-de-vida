// Sincronización cifrada entre dispositivos usando un Gist secreto de GitHub.
//
// - Los datos se cifran EN EL DISPOSITIVO (AES-256-GCM, clave derivada de tu contraseña con
//   PBKDF2) antes de subirse. GitHub solo guarda texto ilegible.
// - El token y la contraseña se guardan aparte, solo en este dispositivo (nunca se suben
//   ni se incluyen en las copias de seguridad).
// - Cada subida lleva un número de versión (rev). Comparándolo con el último sincronizado se
//   sabe si hay cambios aquí, en la nube o en los dos (conflicto: decides tú cuál conservar).

import { dbGet, dbSet, dbDelete } from "./db.js";
import { getState, replaceState } from "./state.js";
import { hasAnyData } from "./stats.js";
import { INBOX_PREFIX } from "./inbox.js";

const API = "https://api.github.com";
const FILE = "panel-de-vida.sync.json";
const CFG_KEY = "sync-config";
const DISCARDED_KEY = "sync-discarded";
const ITERATIONS = 310000;
const PUSH_DELAY = 4000;

let cfg = null;          // { token, pass, gistId, salt, baseRev, dirty, lastSyncAt, device }
let key = null;          // CryptoKey en memoria
let status = { state: "off", msg: "" };
let busy = null;
let pushTimer = null;
let applyingRemote = false;
let localSeq = 0;
let conflictHandler = null;
let inboxHandler = null;
const listeners = new Set();

export class SyncError extends Error {}

// ---------- Estado visible
export const onSyncStatus = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const setStatus = (state, msg = "") => { status = { state, msg }; listeners.forEach(fn => fn(status)); };
export const getSyncStatus = () => status;
export const syncConfigured = () => !!cfg;
export const syncInfo = () => cfg ? { gistId: cfg.gistId, lastSyncAt: cfg.lastSyncAt, rev: cfg.baseRev, device: cfg.device, dirty: cfg.dirty } : null;

export function statusText() {
  if (!cfg) return "Sincronización desactivada";
  switch (status.state) {
    case "syncing": return "Sincronizando…";
    case "offline": return cfg.dirty ? "Sin conexión · cambios pendientes" : "Sin conexión";
    case "error": return `Error: ${status.msg}`;
    case "conflict": return "Conflicto: elige qué versión conservar";
    default: return cfg.lastSyncAt ? `Sincronizado ${ago(cfg.lastSyncAt)}` : "Pendiente de sincronizar";
  }
}
function ago(isoDate) {
  const s = Math.round((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (s < 45) return "ahora mismo";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

// ---------- Utilidades de bytes y cifrado
const enc = new TextEncoder(), dec = new TextDecoder();
function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
const canGzip = typeof CompressionStream === "function" && typeof DecompressionStream === "function";
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

async function deriveKey(pass, saltB64) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: unb64(saltB64), iterations: ITERATIONS, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function seal(k, obj) {
  let bytes = enc.encode(JSON.stringify(obj));
  const z = canGzip ? "gzip" : null;
  if (z) bytes = await pipe(bytes, new CompressionStream("gzip"));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, bytes));
  return { iv: b64(iv), z, data: b64(ct) };
}

async function unseal(k, env) {
  let bytes;
  try { bytes = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, k, unb64(env.data))); }
  catch { throw new SyncError("La contraseña no coincide con la de los datos de la nube."); }
  if (env.z === "gzip") {
    if (!canGzip) throw new SyncError("Este navegador no puede descomprimir los datos. Actualízalo.");
    bytes = await pipe(bytes, new DecompressionStream("gzip"));
  }
  return JSON.parse(dec.decode(bytes));
}

// ---------- GitHub
async function gh(token, path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method, cache: "no-store",
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch { throw new SyncError("No se pudo conectar con GitHub. Revisa la conexión."); }
  if (res.status === 401) throw new SyncError("El token no es válido o ha caducado.");
  if (res.status === 403 || res.status === 404) {
    const txt = await res.text().catch(() => "");
    if (/rate limit/i.test(txt)) throw new SyncError("GitHub ha limitado las peticiones. Prueba en unos minutos.");
    throw new SyncError(res.status === 404 ? "No se encuentra el archivo de sincronización en GitHub." : "El token no tiene permiso para Gists.");
  }
  if (!res.ok) throw new SyncError(`GitHub respondió con un error (${res.status}).`);
  return res.json();
}

const fileText = async f => f.truncated ? (await fetch(f.raw_url, { cache: "no-store" })).text() : f.content;

/** Lee el Gist: los datos cifrados (env) y los mensajes pendientes del buzón de Atajos */
async function readGist(token, gistId) {
  const g = await gh(token, `/gists/${gistId}`);
  const f = g.files?.[FILE];
  if (!f) return null;
  const env = JSON.parse(await fileText(f));
  if (env.app !== "panel-de-vida") throw new SyncError("El archivo de GitHub no es de Panel de Vida.");
  const inbox = [];
  for (const [name, file] of Object.entries(g.files)) {
    if (name.startsWith(INBOX_PREFIX)) inbox.push({ name, text: await fileText(file) });
  }
  inbox.sort((a, b) => a.name.localeCompare(b.name));
  return { env, inbox };
}

const deviceName = () => /iPhone|iPad|Android/i.test(navigator.userAgent) ? (/iPhone/.test(navigator.userAgent) ? "iPhone" : "Móvil") : /Windows/.test(navigator.userAgent) ? "Ordenador (Windows)" : "Ordenador";

async function writeGist(rev, extraFiles = {}) {
  const seq = localSeq;
  const sealed = await seal(key, getState());
  const env = { app: "panel-de-vida", format: 1, rev, updatedAt: new Date().toISOString(), device: cfg.device, salt: cfg.salt, ...sealed };
  await gh(cfg.token, `/gists/${cfg.gistId}`, { method: "PATCH", body: { files: { [FILE]: { content: JSON.stringify(env) }, ...extraFiles } } });
  cfg.baseRev = rev;
  if (localSeq === seq) cfg.dirty = false;   // si hubo cambios durante la subida, quedan pendientes
  cfg.lastSyncAt = new Date().toISOString();
  await saveCfg();
}

async function pull(env, data = null) {
  data ||= await unseal(key, env);
  applyingRemote = true;
  try { await replaceState(data); } finally { applyingRemote = false; }
  cfg.baseRev = env.rev;
  cfg.dirty = false;
  cfg.lastSyncAt = new Date().toISOString();
  await saveCfg();
}

const saveCfg = () => dbSet(CFG_KEY, cfg);

// ---------- API pública

/** Carga la configuración guardada y sincroniza. Se llama al arrancar la app. */
export async function initSync({ onConflict, onInbox }) {
  conflictHandler = onConflict;
  inboxHandler = onInbox;
  // estos avisos no hacen nada mientras la sincronización no esté configurada
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });
  addEventListener("online", () => syncNow());
  setInterval(() => { if (document.visibilityState === "visible") syncNow(); }, 120000);
  setInterval(() => listeners.forEach(fn => fn(status)), 30000); // refresca el "hace X min"

  cfg = (await dbGet(CFG_KEY).catch(() => null)) || null;
  if (!cfg) { setStatus("off"); return; }
  try { key = await deriveKey(cfg.pass, cfg.salt); }
  catch { setStatus("error", "No se pudo preparar el cifrado"); return; }
  setStatus("ok");
  syncNow();
}

/** Avisar de un cambio local (lo llama la app en cada cambio de datos) */
export function noteLocalChange() {
  if (!cfg || applyingRemote) return;
  localSeq++;
  if (!cfg.dirty) { cfg.dirty = true; saveCfg().catch(() => {}); }
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncNow(), PUSH_DELAY);
}

/** Sincroniza ahora: sube, baja o pide resolver un conflicto según el caso */
export function syncNow() {
  if (!cfg || !key) return Promise.resolve();
  if (busy) return busy;
  if (!navigator.onLine) { setStatus("offline"); return Promise.resolve(); }
  busy = (async () => {
    setStatus("syncing");
    try {
      const got = await readGist(cfg.token, cfg.gistId);
      if (!got) throw new SyncError("No se encuentra el archivo de sincronización en GitHub.");
      const { env: remote, inbox } = got;
      if (remote.rev === cfg.baseRev) {
        if (cfg.dirty) await writeGist(remote.rev + 1);
        else { cfg.lastSyncAt = new Date().toISOString(); await saveCfg(); }
      } else if (remote.rev > cfg.baseRev) {
        if (!cfg.dirty) await pull(remote);
        else await resolveConflict(remote);
      } else {
        await writeGist(cfg.baseRev + 1);
      }
      // Buzón de Atajos: se aplica y se borra del Gist en la misma subida
      if (inbox.length && status.state !== "conflict" && inboxHandler) {
        inboxHandler(inbox);
        clearTimeout(pushTimer);
        await writeGist(cfg.baseRev + 1, Object.fromEntries(inbox.map(m => [m.name, null])));
      }
      if (status.state !== "conflict") setStatus("ok");
    } catch (e) {
      console.error(e);
      setStatus(navigator.onLine ? "error" : "offline", e instanceof SyncError ? e.message : "Fallo inesperado al sincronizar");
    } finally { busy = null; }
  })();
  return busy;
}

async function resolveConflict(remote) {
  const remoteData = await unseal(key, remote);
  setStatus("conflict");
  const choice = await conflictHandler?.({ remoteAt: remote.updatedAt, remoteDevice: remote.device, localDevice: cfg.device });
  if (choice === "remote") {
    await dbSet(DISCARDED_KEY, { at: new Date().toISOString(), from: cfg.device, data: getState() });
    await pull(remote, remoteData);
  } else if (choice === "local") {
    await dbSet(DISCARDED_KEY, { at: new Date().toISOString(), from: remote.device || "la nube", data: remoteData });
    await writeGist(remote.rev + 1);
  } else return; // sin decidir: se vuelve a preguntar en la próxima sincronización
  setStatus("ok");
}

/**
 * Configura la sincronización en este dispositivo.
 * Si ya existe el archivo en GitHub, comprueba la contraseña; si no, lo crea con los datos de aquí.
 * Devuelve "created" | "linked".
 */
export async function connect(token, pass) {
  token = token.trim();
  if (!token) throw new SyncError("Pega el token de GitHub.");
  if (pass.length < 8) throw new SyncError("La contraseña debe tener al menos 8 caracteres.");
  const list = await gh(token, "/gists?per_page=100");
  const found = list.find(g => g.files?.[FILE]);
  const device = deviceName();

  if (!found) {
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    key = await deriveKey(pass, salt);
    const gist = await gh(token, "/gists", { method: "POST", body: { description: "Panel de Vida · datos cifrados (no editar)", public: false, files: { [FILE]: { content: JSON.stringify({ app: "panel-de-vida", format: 1, rev: 0 }) } } } });
    cfg = { token, pass, gistId: gist.id, salt, baseRev: 0, dirty: true, lastSyncAt: null, device };
    await writeGist(1);
    setStatus("ok");
    return "created";
  }

  const remote = (await readGist(token, found.id))?.env;
  if (!remote?.salt) throw new SyncError("El archivo de GitHub está incompleto. Bórralo en gist.github.com y vuelve a intentarlo.");
  const k = await deriveKey(pass, remote.salt);
  const data = await unseal(k, remote);           // falla si la contraseña no es la correcta
  key = k;
  const local = getState();
  const localHasData = hasAnyData(local) && !local.settings.demo;
  cfg = { token, pass, gistId: found.id, salt: remote.salt, baseRev: 0, dirty: localHasData, lastSyncAt: null, device };
  await saveCfg();
  if (!localHasData) await pull(remote, data);
  else { await syncNow(); }                         // hay datos en los dos lados: se pregunta
  return "linked";
}

/** Desconecta este dispositivo (los datos de aquí y los de GitHub se mantienen) */
export async function disconnect() {
  clearTimeout(pushTimer);
  cfg = null; key = null;
  await dbDelete(CFG_KEY);
  setStatus("off");
}

export const getDiscarded = () => dbGet(DISCARDED_KEY).catch(() => null);
export const clearDiscarded = () => dbDelete(DISCARDED_KEY);

// ---------- Buzón de Atajos
/** Datos para configurar los Atajos (solo se muestran en este dispositivo) */
export const shortcutConfig = () => cfg ? { url: `${API}/gists/${cfg.gistId}`, auth: `Bearer ${cfg.token}` } : null;

/** Deja un mensaje en el buzón, igual que haría un Atajo (para probar) */
export async function sendInboxMessage(text) {
  if (!cfg) throw new SyncError("Configura antes la sincronización.");
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const name = `${INBOX_PREFIX}${stamp}-${Math.random().toString(36).slice(2, 6)}.txt`;
  await gh(cfg.token, `/gists/${cfg.gistId}`, { method: "PATCH", body: { files: { [name]: { content: text } } } });
  return name;
}
