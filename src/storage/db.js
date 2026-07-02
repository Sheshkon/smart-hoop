const DB_NAME = 'smart-hoop'
const DB_VERSION = 1
export const SESSIONS_STORE = 'sessions'

let dbPromise = null

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)

      request.onupgradeneeded = (event) => {
        const db = event.target.result

        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          const store = db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' })
          store.createIndex('startedAt', 'startedAt', { unique: false })
        }
      }
    })
  }

  return dbPromise
}

export function getDb() {
  return openDb()
}
