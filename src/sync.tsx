/**
 * When the sync cycle runs (OFFLINE-SYNC §3): when the app opens signed in, when the
 * connection comes back, a few seconds after a save, every few minutes while the app is
 * on screen, and on "Sync now". Only one cycle runs at a time. Never in the demo.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { onLocalChange } from './data/changes';
import { deleteFile } from './data/files';
import { getLocal } from './data/local';
import { isServerConfigured, senderRemote } from './data/remote';
import { syncOnce } from './data/sender';
import { useSession, useT } from './session';

const AFTER_SAVE_MS = 3000;
const EVERY_MS = 5 * 60 * 1000;

interface SyncValue {
  /** False in the demo and without a server: nothing is ever sent. */
  live: boolean;
  syncing: boolean;
  /** Bumped after every cycle, so lists reload. */
  version: number;
  lastError: string | null;
  syncNow: () => Promise<void>;
  /** Calls `listener` after every cycle (lists reload from there). Returns the way to stop. */
  subscribe: (listener: () => void) => () => void;
}

const SyncContext = createContext<SyncValue>({
  live: false,
  syncing: false,
  version: 0,
  lastError: null,
  syncNow: async () => undefined,
  subscribe: () => () => undefined,
});

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { state, online } = useSession();
  const tr = useT();
  const live = state.status === 'signedIn' && !state.demo && isServerConfigured();
  const [syncing, setSyncing] = useState(false);
  const [version, setVersion] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const listeners = useRef(new Set<() => void>());

  const run = useCallback(
    (force = false): Promise<void> => {
      if (!live) return Promise.resolve();
      if (running.current) return running.current; // one cycle at a time
      const cycle = (async () => {
        setSyncing(true);
        try {
          const report = await syncOnce(await getLocal(), senderRemote, () => new Date().toISOString(), force);
          report.unusedFiles.forEach(deleteFile);
          if (report.overwritten.length > 0) Alert.alert(tr('sync.overwrittenTitle'), tr('sync.overwritten'));
          setLastError(null);
        } catch (error) {
          setLastError(error instanceof Error ? error.message : String(error));
        } finally {
          running.current = null;
          setSyncing(false);
          setVersion((v) => v + 1);
          listeners.current.forEach((listener) => listener());
        }
      })();
      running.current = cycle;
      return cycle;
    },
    // tr changes with the language; the cycle itself does not depend on it
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live],
  );

  // On opening signed in, and whenever the connection comes back.
  useEffect(() => {
    if (live && online) void run();
  }, [live, online, run]);

  // A few seconds after a save, so typing does not send every keystroke.
  useEffect(() => {
    if (!live) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = onLocalChange(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void run(), AFTER_SAVE_MS);
    });
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, [live, run]);

  // Every few minutes while the app is on screen.
  useEffect(() => {
    if (!live) return;
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void run();
    }, EVERY_MS);
    return () => clearInterval(interval);
  }, [live, run]);

  return (
    <SyncContext.Provider
      value={{
        live,
        syncing,
        version,
        lastError,
        syncNow: () => run(true),
        subscribe: (listener) => {
          listeners.current.add(listener);
          return () => listeners.current.delete(listener);
        },
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncValue {
  return useContext(SyncContext);
}
