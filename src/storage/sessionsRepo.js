import { getDb, SESSIONS_STORE } from './db.js'

function toPlainSession(session) {
  return JSON.parse(JSON.stringify(session))
}

function transaction(mode, fn) {
  return getDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(SESSIONS_STORE, mode)
        const store = tx.objectStore(SESSIONS_STORE)
        const requestResult = fn(store)

        if (requestResult instanceof IDBRequest) {
          requestResult.onsuccess = () => resolve(requestResult.result)
          requestResult.onerror = () => reject(requestResult.error)
          return
        }

        tx.oncomplete = () => resolve(requestResult)
        tx.onerror = () => reject(tx.error)
      }),
  )
}

export function saveSession(session) {
  return transaction('readwrite', (store) => store.put(toPlainSession(session)))
}

export function getAllSessions() {
  return transaction('readonly', (store) => store.getAll()).then((sessions) =>
    sessions.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)),
  )
}

export function getSessionById(id) {
  return transaction('readonly', (store) => store.get(id))
}

export function deleteSession(id) {
  return transaction('readwrite', (store) => store.delete(id))
}

export function clearSessions() {
  return transaction('readwrite', (store) => store.clear())
}
