// Private, origin- and instance-scoped browser recovery. No provider credentials.
const databases = new Map<string, Promise<IDBDatabase>>();
function database(scope: string) {
  if (!/^[a-f0-9]{24,64}$/.test(scope)) return Promise.reject(new Error("The current instance identity is unavailable."));
  let pending = databases.get(scope);
  if (!pending) {
    pending = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`pritha-neuraldeep-drafts-${scope}`, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("records");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Browser storage is unavailable. Keep this page open to preserve the draft."));
      request.onblocked = () => reject(new Error("Close an older Task Chat tab to open its draft storage."));
    });
    databases.set(scope, pending);
    void pending.catch(() => { databases.delete(scope); });
  }
  return pending;
}
export async function readBrowserDraft<T>(scope: string, key: string): Promise<T | null> {
  const db = await database(scope);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("records", "readonly"), request = transaction.objectStore("records").get(key);
    transaction.oncomplete = () => resolve(request.result ?? null);
    transaction.onabort = () => reject(new Error("The saved draft could not be read."));
  });
}
export async function writeBrowserDraft(scope: string, key: string, value: unknown): Promise<void> {
  const db = await database(scope);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("records", "readwrite"), store = transaction.objectStore("records");
    if (value === undefined) store.delete(key); else store.put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(new Error("Browser storage could not save the draft. Free local storage and retry; the current draft remains visible."));
  });
}
export function browserDraftTab() {
  const key = "pritha-neuraldeep-draft-tab-v1";
  let value = sessionStorage.getItem(key);
  if (!value || !/^[a-f0-9-]{36}$/.test(value)) { value = crypto.randomUUID(); sessionStorage.setItem(key, value); }
  return value;
}
