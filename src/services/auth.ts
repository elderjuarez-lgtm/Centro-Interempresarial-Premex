import { initializeApp, getApps, getApp, FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User
} from 'firebase/auth';
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore';
import defaultFirebaseConfig from '../../firebase-applet-config.json';

const cleanEnvVal = (val?: string): string => {
  const trimmed = (val || '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (['n/a', 'na', 'none', 'null', 'undefined', 'ninguno', 'vacio'].includes(lower)) {
    return '';
  }
  return trimmed;
};

const sanitizeDatabaseId = (val?: string): string => {
  const cleaned = cleanEnvVal(val);
  if (!cleaned) return '';
  if (cleaned === '(default)' || cleaned.toLowerCase() === 'default') return '';
  // Firestore database IDs cannot contain '/' or spaces
  if (!/^[a-zA-Z0-9_-]+$/.test(cleaned)) return '';
  return cleaned;
};

const envApiKey = cleanEnvVal(import.meta.env.VITE_FIREBASE_API_KEY);
const envProjectId = cleanEnvVal(import.meta.env.VITE_FIREBASE_PROJECT_ID);
const hasCustomEnvConfig = Boolean(envApiKey && envProjectId);

const isSameDefaultProject =
  !hasCustomEnvConfig || envProjectId === defaultFirebaseConfig.projectId;

const firebaseConfig: FirebaseOptions = hasCustomEnvConfig
  ? {
      apiKey: envApiKey,
      authDomain:
        cleanEnvVal(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) ||
        (isSameDefaultProject ? defaultFirebaseConfig.authDomain : undefined),
      projectId: envProjectId,
      storageBucket:
        cleanEnvVal(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) ||
        (isSameDefaultProject ? defaultFirebaseConfig.storageBucket : undefined),
      messagingSenderId:
        cleanEnvVal(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) ||
        (isSameDefaultProject ? defaultFirebaseConfig.messagingSenderId : undefined),
      appId:
        cleanEnvVal(import.meta.env.VITE_FIREBASE_APP_ID) ||
        (isSameDefaultProject ? defaultFirebaseConfig.appId : undefined),
    }
  : defaultFirebaseConfig;

const envDatabaseId = sanitizeDatabaseId(import.meta.env.VITE_FIREBASE_DATABASE_ID);
const activeDatabaseId = hasCustomEnvConfig
  ? envDatabaseId || (isSameDefaultProject ? defaultFirebaseConfig.firestoreDatabaseId : '')
  : sanitizeDatabaseId(defaultFirebaseConfig.firestoreDatabaseId);

export const activeFirebaseInfo = {
  projectId: String(firebaseConfig.projectId || ''),
  apiKey: String(firebaseConfig.apiKey || ''),
  authDomain: String(firebaseConfig.authDomain || ''),
  databaseId: activeDatabaseId || '(default)',
  configSource: hasCustomEnvConfig ? 'env' : 'applet-config',
};

// Initialize Firebase only once
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Explicit in-memory cache (memoryLocalCache) avoids Firestore 13.3.0 IndexedDB/Target ID
// INTERNAL ASSERTION FAILED crashes in production, combined with long-polling for proxies.
export const db: Firestore = (() => {
  try {
    return initializeFirestore(
      app,
      {
        localCache: memoryLocalCache(),
        experimentalForceLongPolling: true,
        ignoreUndefinedProperties: true,
      },
      activeDatabaseId || undefined
    );
  } catch {
    return activeDatabaseId
      ? getFirestore(app, activeDatabaseId)
      : getFirestore(app);
  }
})();

// --- Central Active Firestore Listener Registry ---
// Guarantees every active onSnapshot is unsubscribed cleanly on unmount AND BEFORE signOut(),
// preventing Firestore 13.3.0 "Target ID already exists" and "INTERNAL ASSERTION FAILED".
const activeFirestoreUnsubscribers = new Set<() => void>();

export const registerFirestoreListener = (unsubscribe: () => void): (() => void) => {
  let disposed = false;
  const safeUnsubscribe = () => {
    if (disposed) return;
    disposed = true;
    activeFirestoreUnsubscribers.delete(safeUnsubscribe);
    try {
      unsubscribe();
    } catch {
      // Ignore cleanup errors when Firestore stream was already torn down
    }
  };
  activeFirestoreUnsubscribers.add(safeUnsubscribe);
  return safeUnsubscribe;
};

export const unsubscribeAllFirestoreListeners = (): void => {
  const snapshot = Array.from(activeFirestoreUnsubscribers);
  activeFirestoreUnsubscribers.clear();
  snapshot.forEach((unsub) => {
    try {
      unsub();
    } catch {
      // Ignore individual teardown errors
    }
  });
};

// --- Resilience Helpers (Prevent hung SDK promises / frozen "Publicando...") ---
export const withFirestoreTimeout = async <T>(
  promise: Promise<T>,
  ms = 8500,
  label = 'operación en Firestore'
): Promise<T> => {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timerId = setTimeout(() => {
          reject(new Error(`Timeout Firestore SDK (${ms}ms) en ${label}`));
        }, ms);
      }),
    ]);
  } finally {
    if (timerId !== undefined) clearTimeout(timerId);
  }
};

export const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  ms = 12000
): Promise<Response> => {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Tiempo de espera agotado (${Math.round(ms / 1000)}s) al conectar con Firestore.`);
    }
    throw err;
  } finally {
    clearTimeout(timerId);
  }
};

export const isRecoverableFirestoreSdkError = (err: unknown): boolean => {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('client is offline') ||
    msg.includes('unavailable') ||
    msg.includes('network') ||
    msg.includes('failed to get document') ||
    msg.includes('timeout firestore sdk') ||
    msg.includes('internal assertion failed') ||
    msg.includes('target id already exists') ||
    msg.includes('unexpected state')
  );
};

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/tasks',
];

const buildGoogleProvider = (
  forceConsent: boolean,
  loginHint?: string | null
): GoogleAuthProvider => {
  const nextProvider = new GoogleAuthProvider();
  SCOPES.forEach((scope) => nextProvider.addScope(scope));
  const customParams: Record<string, string> = {
    prompt: forceConsent && loginHint ? 'consent' : 'select_account consent',
    include_granted_scopes: 'true',
  };
  if (loginHint && loginHint.includes('@')) {
    customParams.login_hint = loginHint;
  }
  nextProvider.setCustomParameters(customParams);
  return nextProvider;
};

// Primary provider requests Google profile + Sheets/Drive + Gmail + Tasks in one step at sign-in
const provider = buildGoogleProvider(false);

// Strictly in-memory OAuth access token cache (never stored in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let isSigningInFlag = false;

export const initAuth = (
  onAuthChange?: (user: User | null, token: string | null) => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (!user) {
      cachedAccessToken = null;
    } else if (!cachedAccessToken && !isSigningInFlag) {
      cachedAccessToken = null;
    }
    if (onAuthChange) {
      onAuthChange(user, user ? cachedAccessToken : null);
    }
  });
};

export const googleSignIn = async (options?: {
  forceConsent?: boolean;
  loginHint?: string | null;
}): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningInFlag = true;
    const activeProvider =
      options?.forceConsent || options?.loginHint
        ? buildGoogleProvider(Boolean(options?.forceConsent), options?.loginHint)
        : provider;

    const result = await signInWithPopup(auth, activeProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || '';
    if (token) {
      cachedAccessToken = token;
    }
    return {
      user: result.user,
      accessToken: token,
    };
  } catch (error: any) {
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request'
    ) {
      return null;
    }
    console.error('Error al iniciar sesión con Google:', error);
    throw error;
  } finally {
    isSigningInFlag = false;
  }
};

export const reconnectGoogleWorkspace = async (): Promise<string | null> => {
  const hint = auth.currentUser?.email || null;
  const res = await googleSignIn({ forceConsent: true, loginHint: hint });
  return res?.accessToken || null;
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const setAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

export const logout = async () => {
  // Strictly detach all active Firestore onSnapshot listeners BEFORE revoking auth state
  unsubscribeAllFirestoreListeners();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await signOut(auth);
  cachedAccessToken = null;
};
