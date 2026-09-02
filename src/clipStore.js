// Durable storage for match-film clips, in IndexedDB.
//
// Recordings used to live only in a React ref, so anything that ended the
// page ended the footage: a failed upload, or iOS reclaiming a tab holding
// several hundred MB of video. A reviewer lost four of five clips that way
// and there was no trace of it afterwards. Clips are now written here the
// moment filming stops, uploads read from here, and a clip is deleted only
// once it has actually been stored server-side.
//
// This is a safety net, never a dependency: every operation resolves rather
// than rejects, so a browser with IndexedDB blocked or a full disk falls
// back to exactly the old in-memory behavior instead of breaking recording.

const DB_NAME = "keeperstat";
const DB_VERSION = 1;
const STORE = "clips";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("sessionId", "sessionId");
        store.createIndex("uploaded", "uploaded");
      }
    };
    req.onsuccess = () => resolve(req.result);
    // Private browsing, blocked storage, or a corrupt database: fall back to
    // memory-only rather than taking the recording down with it.
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function tx(db, mode, run) {
  return new Promise((resolve) => {
    let transaction;
    try {
      transaction = db.transaction(STORE, mode);
    } catch {
      return resolve(null);
    }
    const store = transaction.objectStore(STORE);
    let result = null;
    try {
      run(store, (value) => { result = value; });
    } catch {
      return resolve(null);
    }
    transaction.oncomplete = () => resolve(result);
    // QuotaExceededError lands here for a large clip on a full phone.
    transaction.onerror = () => resolve(null);
    transaction.onabort = () => resolve(null);
  });
}

// Returns the stored record's id, or null if it couldn't be persisted —
// callers keep their in-memory copy either way.
export async function putClip({ sessionId, index, blob }) {
  const db = await openDb();
  if (!db) return null;
  return tx(db, "readwrite", (store, setResult) => {
    const req = store.add({
      sessionId,
      index,
      blob,
      mimeType: blob?.type || "video/webm",
      recordedAt: Date.now(),
      matchId: null,
      uploaded: false,
    });
    req.onsuccess = () => setResult(req.result);
  });
}

async function allClips() {
  const db = await openDb();
  if (!db) return [];
  const rows = await tx(db, "readonly", (store, setResult) => {
    const req = store.getAll();
    req.onsuccess = () => setResult(req.result);
  });
  return rows || [];
}

export async function listClips(sessionId) {
  const rows = await allClips();
  return rows.filter((c) => c.sessionId === sessionId).sort((a, b) => a.index - b.index);
}

// Clips belonging to a saved match that still haven't reached the server —
// what the app retries on next open. Clips with no matchId are from a match
// that was never saved, so there is nothing to upload them against.
export function selectPending(rows) {
  return rows.filter((c) => !c.uploaded && c.matchId).sort((a, b) => a.index - b.index);
}

export async function listPending() {
  return selectPending(await allClips());
}

export async function attachMatchId(sessionId, matchId) {
  const db = await openDb();
  if (!db) return;
  const rows = await listClips(sessionId);
  await tx(db, "readwrite", (store) => {
    for (const row of rows) store.put({ ...row, matchId });
  });
}

// Uploaded clips keep only a tombstone: the blob is the expensive part and
// the server now has it, so dropping it frees storage immediately.
export async function markUploaded(id) {
  const db = await openDb();
  if (!db) return;
  await tx(db, "readwrite", (store) => {
    const req = store.get(id);
    req.onsuccess = () => {
      const row = req.result;
      if (row) store.put({ ...row, uploaded: true, blob: null });
    };
  });
}

export async function deleteClip(id) {
  const db = await openDb();
  if (!db) return;
  await tx(db, "readwrite", (store) => store.delete(id));
}

// Which rows are safe to drop: anything already uploaded, plus orphans from
// matches that were never saved and are older than the cutoff.
export function selectPrunable(rows, now = Date.now(), olderThanDays = 7) {
  const cutoff = now - olderThanDays * 24 * 60 * 60 * 1000;
  return rows.filter((c) => c.uploaded || (!c.matchId && c.recordedAt < cutoff));
}

export async function prune({ olderThanDays = 7, now = Date.now() } = {}) {
  const db = await openDb();
  if (!db) return 0;
  const doomed = selectPrunable(await allClips(), now, olderThanDays);
  await tx(db, "readwrite", (store) => {
    for (const row of doomed) store.delete(row.id);
  });
  return doomed.length;
}

// Test seam — lets a fresh page start from a known-empty store.
export async function _clearAll() {
  const db = await openDb();
  if (!db) return;
  await tx(db, "readwrite", (store) => store.clear());
}
