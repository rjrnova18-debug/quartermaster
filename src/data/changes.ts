/**
 * A tiny "something changed on the phone" signal. The local database raises it after a
 * live save; the sync loop listens and sends a few seconds later (OFFLINE-SYNC §3).
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onLocalChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function localChanged() {
  listeners.forEach((listener) => listener());
}
