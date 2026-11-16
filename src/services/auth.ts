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
  initializeFirestore
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
  databaseId: activeDatabaseId || '(default)',
};

// Initialize Firebase only once
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Force HTTP long-polling to avoid "client is offline" errors behind corporate proxies/firewalls/iframes
export const db: Firestore = (() => {
  try {
    return initializeFirestore(
      app,
      {
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
  await signOut(auth);
  cachedAccessToken = null;
  writeStoredToken(null);
};
