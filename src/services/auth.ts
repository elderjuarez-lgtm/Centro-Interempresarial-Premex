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
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({ prompt: 'select_account' });

const TOKEN_STORAGE_KEY = 'centro_interempresarial_google_token_v1';

const readStoredToken = (): string | null => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
  return null;
};

const writeStoredToken = (token: string | null) => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (token) {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }
  } catch {
    // ignore storage errors
  }
};

let cachedAccessToken: string | null = readStoredToken();

export const initAuth = (
  onAuthChange?: (user: User | null, token: string | null) => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (!user) {
      cachedAccessToken = null;
      writeStoredToken(null);
    }
    if (onAuthChange) {
      onAuthChange(user, user ? cachedAccessToken : null);
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || '';
    if (token) {
      cachedAccessToken = token;
      writeStoredToken(token);
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
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const setAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  writeStoredToken(token);
};

export const logout = async () => {
  // Strictly detach all active Firestore onSnapshot listeners BEFORE revoking auth state
  unsubscribeAllFirestoreListeners();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await signOut(auth);
  cachedAccessToken = null;
  writeStoredToken(null);
};
