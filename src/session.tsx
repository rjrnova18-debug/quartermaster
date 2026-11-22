/**
 * Who is using the app, in which language, and whether there is a connection.
 *
 * A React Context makes these values reachable from any screen without passing them
 * down by hand. `useSession()` reads them; `useT()` gives a translator in the current
 * language.
 *
 * Offline first: after the first sign-in the profile is kept in encrypted storage, so the
 * app opens signed in with no connection. If Supabase later ends the session (revoked or
 * expired for good), the person is sent back to the sign-in screen.
 */
import * as Network from 'expo-network';
import { createContext, useContext, useEffect, useState } from 'react';

import { deleteAllFiles } from './data/files';
import { getLocal } from './data/local';
import { isServerConfigured, Profile, SignInProblem, signIn as remoteSignIn, signOut as remoteSignOut, watchSignOut } from './data/remote';
import { secureStorage } from './data/secure-storage';
import { buildDemoData, DEMO_PEOPLE, DemoPersonKey } from './demo/demo-data';
import { deviceLocale, localDate, MessageKey, t } from './i18n';
import { Locale } from './inspection/model';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; profile: Profile; demo: boolean };

interface SessionValue {
  state: SessionState;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** False only when the phone knows it has no connection. */
  online: boolean;
  signIn: (email: string, password: string) => Promise<SignInProblem | null>;
  startDemo: (person: DemoPersonKey) => Promise<void>;
  /** Signs out, or leaves the demo. */
  signOut: () => Promise<void>;
}

const PROFILE_KEY = 'qm.profile';
const DEMO_KEY = 'qm.demo';

const SessionContext = createContext<SessionValue | null>(null);

function demoProfile(key: DemoPersonKey): Profile {
  const person = DEMO_PEOPLE.find((p) => p.key === key) ?? DEMO_PEOPLE[0];
  return { id: `demo-${person.key}`, fullName: person.fullName, role: person.role };
}

/** Fills the phone database with the demo as `person` sees it, dated around today. */
async function loadDemo(person: DemoPersonKey) {
  const now = new Date();
  const store = await getLocal();
  deleteAllFiles();
  await store.loadDemo(buildDemoData(localDate(now), now.toISOString()), person, now.toISOString());
}

/** What the app remembers from last time: the demo, a signed-in profile, or nothing. */
async function restore(): Promise<SessionState> {
  const demo = (await secureStorage.getItem(DEMO_KEY)) as DemoPersonKey | null;
  if (demo) {
    if ((await (await getLocal()).getMode()) !== 'demo') {
      await loadDemo(demo); // the demo was chosen before its data existed on the phone
    }
    return { status: 'signedIn', profile: demoProfile(demo), demo: true };
  }
  const saved = await secureStorage.getItem(PROFILE_KEY);
  if (saved && isServerConfigured()) {
    return { status: 'signedIn', profile: JSON.parse(saved) as Profile, demo: false };
  }
  return { status: 'signedOut' };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [locale, setLocale] = useState<Locale>(deviceLocale);
  const network = Network.useNetworkState();
  const online = network.isInternetReachable !== false && network.isConnected !== false;

  useEffect(() => {
    restore().then(setState, () => setState({ status: 'signedOut' }));
  }, []);

  // Creating the client also lets Supabase check the saved session in the background.
  useEffect(() => {
    if (!isServerConfigured()) {
      return;
    }
    return watchSignOut(() => {
      secureStorage.removeItem(PROFILE_KEY);
      setState((current) => (current.status === 'signedIn' && !current.demo ? { status: 'signedOut' } : current));
    });
  }, []);

  const value: SessionValue = {
    state,
    locale,
    setLocale,
    online,

    async signIn(email, password) {
      const result = await remoteSignIn(email, password);
      if ('problem' in result) {
        return result.problem;
      }
      deleteAllFiles();
      await (await getLocal()).startLive();
      await secureStorage.setItem(PROFILE_KEY, JSON.stringify(result.profile));
      setState({ status: 'signedIn', profile: result.profile, demo: false });
      return null;
    },

    async startDemo(person) {
      await loadDemo(person);
      await secureStorage.setItem(DEMO_KEY, person);
      setState({ status: 'signedIn', profile: demoProfile(person), demo: true });
    },

    async signOut() {
      await (await getLocal()).clear(); // F3f: ask first when there are unsent changes
      deleteAllFiles();
      if (state.status === 'signedIn' && state.demo) {
        await secureStorage.removeItem(DEMO_KEY);
      } else {
        await secureStorage.removeItem(PROFILE_KEY);
        await remoteSignOut().catch(() => undefined); // offline: the local session is cleared anyway
      }
      setState({ status: 'signedOut' });
    },
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside <SessionProvider>');
  }
  return value;
}

/** A translator bound to the current language: tr('signIn.title'). */
export function useT() {
  const { locale } = useSession();
  return (key: MessageKey, values?: Record<string, string | number>) => t(locale, key, values);
}
