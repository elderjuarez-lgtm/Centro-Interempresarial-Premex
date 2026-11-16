import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User } from 'firebase/auth';
import { Cloud, Copy, Check } from 'lucide-react';
import {
  ActiveTab,
  Movement,
  EntityMapping,
  ClosedMonthRecord,
  MovimientosNavigationPreset,
  ReconciliationScope,
  DirectorySyncState
} from './types';
import { INITIAL_ENTITIES, INITIAL_MOVEMENTS, INITIAL_COMMENTS } from './utils/demoData';
import { buildMatrix, calculateDifferences, buildSymmetricMatrix } from './utils/reconciliation';
import { auth, initAuth, googleSignIn, logout } from './services/auth';
import {
  testFirestoreConnection,
  getDefaultReconciliationId,
  getInitialScopeAndDocIdFromUrl,
  getShareableUrl,
  subscribeToReconciliation,
  saveReconciliationToCloud,
  closeAndArchiveMonthInCloud,
  subscribeToCompanyDirectory,
  saveCompanyDirectoryToCloud
} from './services/reconciliationStore';

import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import { SaveReconciliationModal } from './components/SaveReconciliationModal';
import { CloseMonthModal, ScopeClosureInfo } from './components/CloseMonthModal';

import { InicioView } from './components/views/InicioView';
import { EmpresasView } from './components/views/EmpresasView';
import { CargaArchivosView } from './components/views/CargaArchivosView';
import { MovimientosView } from './components/views/MovimientosView';
import { ConciliacionView } from './components/views/ConciliacionView';
import { DiferenciasView } from './components/views/DiferenciasView';

const ACTIVE_SCOPE_STORAGE_KEY = 'centro_interempresarial_active_scope_v1';

const STORAGE_KEYS_BY_SCOPE: Record<
  ReconciliationScope,
  {
    MOVEMENTS: string;
    ENTITIES: string;
    COMMENTS: string;
    CLOSED_MONTHS: string;
    DOC_ID: string;
  }
> = {
  internacionales: {
    MOVEMENTS: 'centro_interempresarial_movimientos_v1',
    ENTITIES: 'centro_interempresarial_entidades_v1',
    COMMENTS: 'centro_interempresarial_comentarios_v1',
    CLOSED_MONTHS: 'centro_interempresarial_meses_cerrados_v1',
    DOC_ID: 'centro_interempresarial_doc_id_internacionales_v1',
  },
  nacionales: {
    MOVEMENTS: 'centro_interempresarial_nacionales_movimientos_v1',
    ENTITIES: 'centro_interempresarial_nacionales_entidades_v1',
    COMMENTS: 'centro_interempresarial_nacionales_comentarios_v1',
    CLOSED_MONTHS: 'centro_interempresarial_nacionales_meses_cerrados_v1',
    DOC_ID: 'centro_interempresarial_doc_id_nacionales_v1',
  },
};

const PENDING_DIRECTORY_SYNC_KEYS: Record<ReconciliationScope, string> = {
  internacionales: 'centro_interempresarial_pending_dir_internacionales_v1',
  nacionales: 'centro_interempresarial_pending_dir_nacionales_v1',
};

function readPendingDirSync(scope: ReconciliationScope): boolean {
  try {
    return localStorage.getItem(PENDING_DIRECTORY_SYNC_KEYS[scope]) === '1';
  } catch {
    return false;
  }
}

function writePendingDirSync(scope: ReconciliationScope, pending: boolean): void {
  try {
    if (pending) {
      localStorage.setItem(PENDING_DIRECTORY_SYNC_KEYS[scope], '1');
    } else {
      localStorage.removeItem(PENDING_DIRECTORY_SYNC_KEYS[scope]);
    }
  } catch {
    // ignore
  }
}

interface ScopeWorkspaceState {
  docId: string;
  docTitle: string;
  lastSavedAtIso: string | null;
  hasUnsavedChanges: boolean;
  selectedMonth: string;
  entities: EntityMapping[];
  movements: Movement[];
  comments: Record<string, string>;
  closedMonths: Record<string, ClosedMonthRecord>;
}

function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved) as T;
  } catch (e) {
    console.warn(`Error reading ${key} from storage:`, e);
  }
  return fallback;
}

function loadInitialWorkspace(
  scope: ReconciliationScope,
  docIdOverride?: string | null
): ScopeWorkspaceState {
  const keys = STORAGE_KEYS_BY_SCOPE[scope];
  const savedDocId = (() => {
    try {
      const raw = localStorage.getItem(keys.DOC_ID);
      if (raw && /^[a-zA-Z0-9_-]{1,128}$/.test(raw)) return raw;
    } catch {
      // ignore
    }
    return getDefaultReconciliationId(scope);
  })();

  const movements = readJsonStorage<Movement[]>(
    keys.MOVEMENTS,
    scope === 'internacionales' ? INITIAL_MOVEMENTS : []
  );
  const entities = readJsonStorage<EntityMapping[]>(
    keys.ENTITIES,
    scope === 'internacionales' ? INITIAL_ENTITIES : []
  );
  const comments = readJsonStorage<Record<string, string>>(
    keys.COMMENTS,
    scope === 'internacionales' ? INITIAL_COMMENTS : {}
  );
  const closedMonths = readJsonStorage<Record<string, ClosedMonthRecord>>(
    keys.CLOSED_MONTHS,
    {}
  );

  const firstMonth = movements.find((m) => m.mes)?.mes || 'Septiembre 2026';

  return {
    docId: docIdOverride || savedDocId,
    docTitle: '',
    lastSavedAtIso: null,
    hasUnsavedChanges: false,
    selectedMonth: firstMonth,
    entities,
    movements,
    comments,
    closedMonths,
  };
}

function getStoredActiveScope(): ReconciliationScope {
  try {
    const raw = localStorage.getItem(ACTIVE_SCOPE_STORAGE_KEY);
    if (raw === 'nacionales' || raw === 'internacionales') return raw;
  } catch {
    // ignore
  }
  return 'internacionales';
}

export default function App() {
  const initialLaunch = useMemo(
    () => getInitialScopeAndDocIdFromUrl(getStoredActiveScope()),
    []
  );

  const activeScope: ReconciliationScope = 'internacionales';
  const [activeTab, setActiveTab] = useState<ActiveTab>('inicio');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isCloseMonthModalOpen, setIsCloseMonthModalOpen] = useState(false);
  const [movimientosPreset, setMovimientosPreset] = useState<MovimientosNavigationPreset | null>(null);
  const [copiedBannerLink, setCopiedBannerLink] = useState<boolean>(false);

  // Single Anitox workspace state (uses 'internacionales' storage & Firestore path under the hood)
  const [workspaces, setWorkspaces] = useState<Record<ReconciliationScope, ScopeWorkspaceState>>(() => {
    const anitoxWs = loadInitialWorkspace(
      'internacionales',
      initialLaunch.docIdFromUrl
    );
    const nacPlaceholder = loadInitialWorkspace('nacionales', null);
    return {
      internacionales: anitoxWs,
      nacionales: nacPlaceholder,
    };
  });

  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;

  const hasUnsavedRef = useRef<Record<ReconciliationScope, boolean>>({
    internacionales: false,
    nacionales: false,
  });
  const isHydratingRef = useRef<Record<ReconciliationScope, boolean>>({
    internacionales: false,
    nacionales: false,
  });
  const hasIndependentDirectoryRef = useRef<Record<ReconciliationScope, boolean>>({
    internacionales: false,
    nacionales: false,
  });
  const pendingDirectorySyncRef = useRef<Record<ReconciliationScope, boolean>>({
    internacionales: readPendingDirSync('internacionales'),
    nacionales: readPendingDirSync('nacionales'),
  });

  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [directorySyncStatus, setDirectorySyncStatus] = useState<
    Record<ReconciliationScope, DirectorySyncState>
  >({
    internacionales: {
      status: readPendingDirSync('internacionales') ? 'pending' : 'idle',
    },
    nacionales: {
      status: readPendingDirSync('nacionales') ? 'pending' : 'idle',
    },
  });

  const currentWorkspace = workspaces[activeScope];
  const {
    docId: activeDocId,
    docTitle: activeDocTitle,
    lastSavedAtIso,
    hasUnsavedChanges,
    selectedMonth,
    entities,
    movements,
    comments,
    closedMonths,
  } = currentWorkspace;

  // Persist active scope choice
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_SCOPE_STORAGE_KEY, activeScope);
    } catch (e) {
      console.warn('Failed to save activeScope:', e);
    }
  }, [activeScope]);

  // Persist Anitox workspace to localStorage
  useEffect(() => {
    const ws = workspaces.internacionales;
    const keys = STORAGE_KEYS_BY_SCOPE.internacionales;
    try {
      localStorage.setItem(keys.MOVEMENTS, JSON.stringify(ws.movements));
      localStorage.setItem(keys.ENTITIES, JSON.stringify(ws.entities));
      localStorage.setItem(keys.COMMENTS, JSON.stringify(ws.comments));
      localStorage.setItem(keys.CLOSED_MONTHS, JSON.stringify(ws.closedMonths));
      localStorage.setItem(keys.DOC_ID, ws.docId);
    } catch (e) {
      console.warn('Failed to save Anitox workspace:', e);
    }
  }, [workspaces.internacionales]);

  // Keep unsaved refs in sync per scope
  useEffect(() => {
    hasUnsavedRef.current.internacionales = workspaces.internacionales.hasUnsavedChanges;
    hasUnsavedRef.current.nacionales = workspaces.nacionales.hasUnsavedChanges;
  }, [
    workspaces.internacionales.hasUnsavedChanges,
    workspaces.nacionales.hasUnsavedChanges,
  ]);

  const syncDirectoryToCloud = async (
    targetScope: ReconciliationScope,
    nextEntities: EntityMapping[]
  ) => {
    if (!auth.currentUser) {
      pendingDirectorySyncRef.current[targetScope] = true;
      writePendingDirSync(targetScope, true);
      setDirectorySyncStatus((prev) => ({
        ...prev,
        [targetScope]: {
          ...prev[targetScope],
          status: 'pending',
          errorMsg: undefined,
        },
      }));
      return;
    }

    pendingDirectorySyncRef.current[targetScope] = false;
    writePendingDirSync(targetScope, false);
    setDirectorySyncStatus((prev) => ({
      ...prev,
      [targetScope]: {
        ...prev[targetScope],
        status: 'saving',
        errorMsg: undefined,
      },
    }));

    try {
      const res = await saveCompanyDirectoryToCloud(targetScope, nextEntities);
      hasIndependentDirectoryRef.current[targetScope] = true;
      setDirectorySyncStatus((prev) => ({
        ...prev,
        [targetScope]: {
          status: 'saved',
          lastSyncedAtIso: res.updatedAtIso,
          updatedByName:
            auth.currentUser?.displayName || auth.currentUser?.email || 'Usuario',
        },
      }));
    } catch (err: any) {
      console.error(`Error saving company directory (${targetScope}):`, err);
      pendingDirectorySyncRef.current[targetScope] = true;
      writePendingDirSync(targetScope, true);
      setDirectorySyncStatus((prev) => ({
        ...prev,
        [targetScope]: {
          ...prev[targetScope],
          status: 'error',
          errorMsg:
            err?.message || 'No se pudieron guardar las empresas en la nube.',
        },
      }));
    }
  };

  // Auth listener & Firestore connection check
  useEffect(() => {
    testFirestoreConnection();
    const unsubscribe = initAuth((user, token) => {
      setCurrentUser(user);
      setAccessToken(token);
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Flush any pending local company directory changes as soon as user signs in
  useEffect(() => {
    if (!currentUser) return;
    if (pendingDirectorySyncRef.current.internacionales) {
      void syncDirectoryToCloud('internacionales', workspacesRef.current.internacionales.entities);
    }
  }, [currentUser]);

  // Subscribe independently to Master Company Directory (/company_directories/internacionales)
  useEffect(() => {
    const targetScope: ReconciliationScope = 'internacionales';
    const unsub = subscribeToCompanyDirectory(
      targetScope,
      (savedDir) => {
        if (!savedDir) return;
        hasIndependentDirectoryRef.current[targetScope] = true;
        if (pendingDirectorySyncRef.current[targetScope]) return;

        setWorkspaces((prev) => ({
          ...prev,
          [targetScope]: {
            ...prev[targetScope],
            entities: savedDir.entities,
          },
        }));
        setDirectorySyncStatus((prev) => ({
          ...prev,
          [targetScope]: {
            status: 'saved',
            lastSyncedAtIso: savedDir.updatedAtIso,
            updatedByName: savedDir.updatedByName,
          },
        }));
      },
      (err) => {
        console.warn('Error loading company directory (Anitox):', err);
      }
    );

    return () => {
      unsub();
    };
  }, []);

  // Subscribe independently to Internacionales and Nacionales cloud documents
  useEffect(() => {
    const targetScope: ReconciliationScope = 'internacionales';
    const targetDocId = workspaces.internacionales.docId;

    const unsubscribe = subscribeToReconciliation(
      targetDocId,
      (savedDoc) => {
        if (!savedDoc) return;
        if (hasUnsavedRef.current[targetScope]) return;

        isHydratingRef.current[targetScope] = true;
        const preserveEntities =
          hasIndependentDirectoryRef.current[targetScope] ||
          pendingDirectorySyncRef.current[targetScope];

        setWorkspaces((prev) => {
          const cur = prev[targetScope];
          const mergedClosed =
            savedDoc.closedMonths && typeof savedDoc.closedMonths === 'object'
              ? { ...cur.closedMonths, ...savedDoc.closedMonths }
              : cur.closedMonths;

          return {
            ...prev,
            [targetScope]: {
              ...cur,
              entities: preserveEntities ? cur.entities : savedDoc.entities,
              movements: savedDoc.movements,
              comments: savedDoc.comments,
              closedMonths: mergedClosed,
              selectedMonth: savedDoc.selectedMonth || cur.selectedMonth,
              docTitle: savedDoc.title,
              lastSavedAtIso: savedDoc.updatedAtIso || new Date().toISOString(),
              hasUnsavedChanges: false,
            },
          };
        });
        setTimeout(() => {
          isHydratingRef.current[targetScope] = false;
        }, 0);
      },
      (err) => {
        console.warn('Error loading cloud reconciliation (Anitox):', err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [workspaces.internacionales.docId]);

  const updateScopeWorkspace = (
    scope: ReconciliationScope,
    updater: (prev: ScopeWorkspaceState) => ScopeWorkspaceState,
    markModified = false
  ) => {
    setWorkspaces((prev) => {
      const nextWs = updater(prev[scope]);
      return {
        ...prev,
        [scope]: {
          ...nextWs,
          hasUnsavedChanges:
            markModified && !isHydratingRef.current[scope]
              ? true
              : nextWs.hasUnsavedChanges,
        },
      };
    });
  };

  const handleChangeScope = (_nextScope: ReconciliationScope) => {
    // Single reconciliation mode (Anitox)
  };

  const handleSignInWithGoogle = async () => {
    const res = await googleSignIn();
    if (res) {
      setCurrentUser(res.user);
      setAccessToken(res.accessToken);
    }
    return res;
  };

  const handleSignOut = async () => {
    try {
      await logout();
      setCurrentUser(null);
      setAccessToken(null);
    } catch (err: any) {
      console.error('Sign out error:', err);
    }
  };

  const handleSaveToCloud = async (options: { title: string; forceNewCopy?: boolean }) => {
    const scopeAtSave = activeScope;
    const ws = workspaces[scopeAtSave];

    const result = await saveReconciliationToCloud({
      targetId: ws.docId,
      scope: scopeAtSave,
      forceNewCopy: options.forceNewCopy,
      title: options.title,
      selectedMonth: ws.selectedMonth,
      entities: ws.entities,
      movements: ws.movements,
      comments: ws.comments,
      closedMonths: ws.closedMonths,
    });

    updateScopeWorkspace(scopeAtSave, (prev) => ({
      ...prev,
      docId: result.id,
      docTitle: options.title,
      lastSavedAtIso: result.updatedAtIso,
      hasUnsavedChanges: false,
    }));

    if (typeof window !== 'undefined' && scopeAtSave === activeScope) {
      const nextUrl = `${window.location.pathname}?c=${encodeURIComponent(result.id)}`;
      window.history.replaceState(null, '', nextUrl);
    }

    return result;
  };

  const handleCloseMonth = async (
    monthToClose: string,
    targetScope: ReconciliationScope = activeScope
  ) => {
    const scopeAtClose = targetScope;
    const ws = workspaces[scopeAtClose];
    const scopeLabel = 'Anitox';

    const monthMovements = ws.movements.filter(
      (m) => (m.mes || 'Septiembre 2026') === monthToClose
    );
    const monthDifferences = calculateDifferences(monthMovements, ws.comments);
    const monthDiffCount = monthDifferences.filter((d) => d.estado !== 'conciliado').length;
    const targetTitle =
      ws.docTitle || `Conciliación ${scopeLabel} - ${monthToClose}`;

    const { saveResult, closedRecord, nextClosedMonths } = await closeAndArchiveMonthInCloud({
      targetId: ws.docId,
      scope: scopeAtClose,
      title: targetTitle,
      month: monthToClose,
      entities: ws.entities,
      allMovements: ws.movements,
      monthMovements,
      comments: ws.comments,
      differencesCount: monthDiffCount,
      existingClosedMonths: ws.closedMonths,
    });

    updateScopeWorkspace(scopeAtClose, (prev) => ({
      ...prev,
      closedMonths: nextClosedMonths,
      docId: saveResult.id,
      docTitle: targetTitle,
      lastSavedAtIso: saveResult.updatedAtIso,
      hasUnsavedChanges: false,
    }));

    if (typeof window !== 'undefined' && scopeAtClose === activeScope) {
      const nextUrl = `${window.location.pathname}?c=${encodeURIComponent(saveResult.id)}`;
      window.history.replaceState(null, '', nextUrl);
    }

    return {
      url: saveResult.url,
      closedRecord,
    };
  };

  // Detect available months in active scope dataset
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    movements.forEach((m) => {
      set.add(m.mes || 'Septiembre 2026');
    });
    if (set.size === 0) set.add('Septiembre 2026');
    return Array.from(set).sort();
  }, [movements]);

  useEffect(() => {
    if (selectedMonth !== 'ALL' && !availableMonths.includes(selectedMonth)) {
      updateScopeWorkspace(activeScope, (prev) => ({
        ...prev,
        selectedMonth: availableMonths[0] || 'ALL',
      }));
    }
  }, [availableMonths, selectedMonth, activeScope]);

  // Filter movements by selected month
  const filteredMovements = useMemo(() => {
    if (selectedMonth === 'ALL') return movements;
    return movements.filter((m) => (m.mes || 'Septiembre 2026') === selectedMonth);
  }, [movements, selectedMonth]);

  // Derive exact ordered list of companies (use frozen snapshot if viewing a closed month)
  const orderedEntityNames = useMemo(
    () => entities.map((e) => e.nombreOficial),
    [entities]
  );

  const activeClosedRecord =
    selectedMonth !== 'ALL' ? closedMonths[selectedMonth] : undefined;

  // Keep active companies/order independent from closedMonths so directory edits always apply
  const activeOrderedEntityNames = orderedEntityNames;

  const activeComments = useMemo(() => {
    if (activeClosedRecord?.commentsSnapshot) {
      return activeClosedRecord.commentsSnapshot;
    }
    return comments;
  }, [activeClosedRecord, comments]);

  // Reconciliations & Matrices based on active scope, filtered month & configured companies
  const matrizCxc = useMemo(() => buildMatrix(filteredMovements, 'CXC'), [filteredMovements]);
  const matrizCxp = useMemo(() => buildMatrix(filteredMovements, 'CXP'), [filteredMovements]);
  const symmetricMatrix = useMemo(
    () => buildSymmetricMatrix(activeOrderedEntityNames, filteredMovements),
    [activeOrderedEntityNames, filteredMovements]
  );
  const differences = useMemo(
    () => calculateDifferences(filteredMovements, activeComments),
    [filteredMovements, activeComments]
  );

  const differencesCount = useMemo(() => {
    return differences.filter((d) => d.estado !== 'conciliado').length;
  }, [differences]);

  const handleUpdateComment = (pairId: string, comment: string) => {
    if (selectedMonth !== 'ALL' && closedMonths[selectedMonth]) {
      return;
    }
    updateScopeWorkspace(
      activeScope,
      (prev) => ({
        ...prev,
        comments: {
          ...prev.comments,
          [pairId]: comment,
        },
      }),
      true
    );
  };

  const handleBatchUpdateComments = (updates: Record<string, string>) => {
    if (selectedMonth !== 'ALL' && closedMonths[selectedMonth]) {
      return;
    }
    const keys = Object.keys(updates);
    if (keys.length === 0) return;
    updateScopeWorkspace(
      activeScope,
      (prev) => ({
        ...prev,
        comments: {
          ...prev.comments,
          ...updates,
        },
      }),
      true
    );
  };

  const handleSetEntities: React.Dispatch<React.SetStateAction<EntityMapping[]>> = (updater) => {
    const scopeAtEdit = activeScope;
    const currentEntities = workspacesRef.current[scopeAtEdit].entities;
    const nextEntities =
      typeof updater === 'function' ? updater(currentEntities) : updater;

    workspacesRef.current = {
      ...workspacesRef.current,
      [scopeAtEdit]: {
        ...workspacesRef.current[scopeAtEdit],
        entities: nextEntities,
      },
    };

    updateScopeWorkspace(
      scopeAtEdit,
      (prev) => ({
        ...prev,
        entities: nextEntities,
      }),
      false
    );

    void syncDirectoryToCloud(scopeAtEdit, nextEntities);
  };

  const handleSetMovements: React.Dispatch<React.SetStateAction<Movement[]>> = (updater) => {
    updateScopeWorkspace(
      activeScope,
      (prev) => {
        const next = typeof updater === 'function' ? updater(prev.movements) : updater;
        // Immutable guard: never allow closed-month movements to be deleted or altered
        const lockedByMonth = new Map<string, Movement[]>();
        prev.movements.forEach((m) => {
          const mes = m.mes || 'Septiembre 2026';
          if (prev.closedMonths[mes]) {
            const list = lockedByMonth.get(mes) || [];
            list.push(m);
            lockedByMonth.set(mes, list);
          }
        });
        if (lockedByMonth.size === 0) {
          return { ...prev, movements: next };
        }
        const openNext = next.filter((m) => !prev.closedMonths[m.mes || 'Septiembre 2026']);
        const lockedFlat: Movement[] = [];
        lockedByMonth.forEach((list) => lockedFlat.push(...list));
        return { ...prev, movements: [...lockedFlat, ...openNext] };
      },
      true
    );
  };

  const handleSetSelectedMonth = (month: string) => {
    updateScopeWorkspace(
      activeScope,
      (prev) => ({
        ...prev,
        selectedMonth: month,
      }),
      true
    );
  };

  const handleAddMissingEntities = (names: string[]) => {
    const scopeAtAdd = activeScope;
    const defaultCountry = 'Global';
    const defaultCurrency = 'USD';
    const prevEntities = workspacesRef.current[scopeAtAdd].entities;

    const existing = new Set(prevEntities.map((e) => e.nombreOficial.trim().toLowerCase()));
    const additions: EntityMapping[] = [];
    names.forEach((raw, idx) => {
      const clean = raw.trim();
      if (!clean || existing.has(clean.toLowerCase())) return;
      existing.add(clean.toLowerCase());
      const looksLikeNit = /^[0-9.\-\s]+$/.test(clean);
      additions.push({
        id: `ent-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
        alias: clean,
        nombreOficial: clean,
        nit: looksLikeNit ? clean : '',
        codigoSociedad: `EMP-${(prevEntities.length + additions.length + 1) * 100}`,
        pais: defaultCountry,
        moneda: defaultCurrency,
      });
    });

    if (additions.length === 0) return;
    const nextEntities = [...prevEntities, ...additions];

    workspacesRef.current = {
      ...workspacesRef.current,
      [scopeAtAdd]: {
        ...workspacesRef.current[scopeAtAdd],
        entities: nextEntities,
      },
    };

    updateScopeWorkspace(
      scopeAtAdd,
      (prev) => ({
        ...prev,
        entities: nextEntities,
      }),
      false
    );

    void syncDirectoryToCloud(scopeAtAdd, nextEntities);
  };

  const handleImportMovements = (newMovements: Movement[], mode: 'replace' | 'append') => {
    const scopeAtImport = activeScope;
    const ws = workspaces[scopeAtImport];

    // Reject any movements belonging to already closed months
    const safeNewMovements = newMovements.filter(
      (m) => !ws.closedMonths[m.mes || 'Septiembre 2026']
    );
    if (safeNewMovements.length === 0) return;

    const newMonth = safeNewMovements.find((m) => m.mes)?.mes;

    updateScopeWorkspace(
      scopeAtImport,
      (prev) => {
        const nextMovements =
          mode === 'replace'
            ? [
                ...prev.movements.filter(
                  (m) => Boolean(prev.closedMonths[m.mes || 'Septiembre 2026'])
                ),
                ...safeNewMovements,
              ]
            : [...prev.movements, ...safeNewMovements];

        return {
          ...prev,
          movements: nextMovements,
          selectedMonth: newMonth || prev.selectedMonth,
        };
      },
      true
    );

    setActiveTab('conciliacion');
  };

  const handleInspectDocuments = (preset: MovimientosNavigationPreset) => {
    setMovimientosPreset(preset);
    setActiveTab('movimientos');
  };

  const closureScopeDetails = useMemo<Record<ReconciliationScope, ScopeClosureInfo>>(() => {
    const buildInfo = (ws: ScopeWorkspaceState): ScopeClosureInfo => {
      const monthSet = new Set<string>();
      ws.movements.forEach((m) => monthSet.add(m.mes || 'Septiembre 2026'));
      Object.keys(ws.closedMonths).forEach((m) => monthSet.add(m));
      if (monthSet.size === 0) monthSet.add('Septiembre 2026');
      const monthsList = Array.from(monthSet).sort();

      const monthStats: Record<string, { movementsCount: number; differencesCount: number }> = {};
      monthsList.forEach((m) => {
        const mMovements = ws.movements.filter((mov) => (mov.mes || 'Septiembre 2026') === m);
        const mDiffs = calculateDifferences(mMovements, ws.comments);
        monthStats[m] = {
          movementsCount: mMovements.length,
          differencesCount: mDiffs.filter((d) => d.estado !== 'conciliado').length,
        };
      });

      return {
        docId: ws.docId,
        entitiesCount: ws.entities.length,
        availableMonths: monthsList,
        closedMonths: ws.closedMonths,
        monthStats,
      };
    };

    return {
      internacionales: buildInfo(workspaces.internacionales),
      nacionales: buildInfo(workspaces.nacionales),
    };
  }, [workspaces.internacionales, workspaces.nacionales]);

  const scopeSummary = {
    internacionales: {
      entities: workspaces.internacionales.entities.length,
      movements: workspaces.internacionales.movements.length,
    },
    nacionales: {
      entities: workspaces.nacionales.entities.length,
      movements: workspaces.nacionales.movements.length,
    },
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 antialiased selection:bg-blue-600 selection:text-white">
      {/* Lateral Menu (Sidebar) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        differencesCount={differencesCount}
        movementsCount={movements.length}
        entitiesCount={entities.length}
      />

      {/* Main Layout Area */}
      <div className="lg:pl-72 flex flex-col min-h-screen transition-all">
        {/* Sticky Header */}
        <Header
          activeTab={activeTab}
          onToggleMobileMenu={() => setIsMobileMenuOpen(true)}
          currentUser={currentUser}
          onSignInWithGoogle={() => {
            handleSignInWithGoogle().catch((err) => {
              console.error('Google sign in failed:', err);
            });
          }}
          onSignOut={handleSignOut}
          onOpenGoogleSheetsModal={() => setIsSheetsModalOpen(true)}
          onOpenSaveModal={() => setIsSaveModalOpen(true)}
          hasUnsavedChanges={hasUnsavedChanges}
          hasToken={!!accessToken}
          selectedMonth={selectedMonth}
          setSelectedMonth={handleSetSelectedMonth}
          availableMonths={availableMonths}
          closedMonths={closedMonths}
          entities={entities}
        />

        {/* Cloud Sync / Shared Link Status Strip */}
        {(lastSavedAtIso || hasUnsavedChanges) && (
          <div className="px-4 sm:px-6 lg:px-8 pt-4 max-w-7xl mx-auto w-full">
            <div
              className={`px-4 py-2.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                hasUnsavedChanges
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-blue-50/80 border-blue-200 text-blue-900'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Cloud
                  className={`w-4 h-4 shrink-0 ${
                    hasUnsavedChanges ? 'text-amber-600' : 'text-blue-600'
                  }`}
                />
                {hasUnsavedChanges ? (
                  <span className="truncate">
                    <strong>
                      Cambios locales sin guardar (Anitox):
                    </strong>{' '}
                    Presiona <strong>Guardar Conciliación</strong> para actualizar el enlace compartido.
                  </span>
                ) : (
                  <span className="truncate">
                    <strong>{activeDocTitle || 'Conciliación guardada en la nube'}</strong>
                    {lastSavedAtIso && (
                      <span className="text-blue-700/80 ml-1.5">
                        • Actualizado{' '}
                        {new Date(lastSavedAtIso).toLocaleString('es-CO', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                    )}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {hasUnsavedChanges ? (
                  <button
                    type="button"
                    onClick={() => setIsSaveModalOpen(true)}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Guardar Ahora
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const url = getShareableUrl(activeDocId, activeScope);
                      navigator.clipboard.writeText(url);
                      setCopiedBannerLink(true);
                      setTimeout(() => setCopiedBannerLink(false), 2000);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-blue-100 border border-blue-200 text-blue-900 font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    {copiedBannerLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>¡Link Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-blue-600" />
                        <span>Copiar Link Compartido</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Dynamic View Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {activeTab === 'inicio' && (
            <InicioView
              key={activeScope}
              movements={filteredMovements}
              differences={differences}
              matrizCxc={matrizCxc}
              matrizCxp={matrizCxp}
              setActiveTab={setActiveTab}
              onOpenGoogleSheets={() => setIsSheetsModalOpen(true)}
              onOpenSaveModal={() => setIsSaveModalOpen(true)}
              activeScope={activeScope}
            />
          )}

          {activeTab === 'empresas' && (
            <EmpresasView
              key={activeScope}
              entities={entities}
              setEntities={handleSetEntities}
              movements={movements}
              onGoToConciliacion={() => setActiveTab('conciliacion')}
              activeScope={activeScope}
              directorySync={directorySyncStatus[activeScope]}
              currentUser={currentUser}
              onSaveDirectoryToCloud={() =>
                syncDirectoryToCloud(activeScope, workspacesRef.current[activeScope].entities)
              }
              onSignInWithGoogle={() => {
                handleSignInWithGoogle().catch((err) => {
                  console.error('Google sign in failed:', err);
                });
              }}
            />
          )}

          {activeTab === 'carga' && (
            <CargaArchivosView
              key={activeScope}
              onImportMovements={handleImportMovements}
              currentMovementsCount={movements.length}
              selectedMonth={selectedMonth}
              registeredEntities={orderedEntityNames}
              entityMappings={entities}
              onAddMissingEntities={handleAddMissingEntities}
              onGoToEmpresas={() => setActiveTab('empresas')}
              closedMonths={closedMonths}
            />
          )}

          {activeTab === 'movimientos' && (
            <MovimientosView
              key={activeScope}
              movements={filteredMovements}
              setMovements={handleSetMovements}
              selectedMonth={selectedMonth}
              closedMonths={closedMonths}
              navigationPreset={movimientosPreset}
              onConsumeNavigationPreset={() => setMovimientosPreset(null)}
            />
          )}

          {activeTab === 'conciliacion' && (
            <ConciliacionView
              key={activeScope}
              matrizCxc={matrizCxc}
              matrizCxp={matrizCxp}
              symmetricMatrix={symmetricMatrix}
              differences={differences}
              movements={filteredMovements}
              onOpenGoogleSheets={() => setIsSheetsModalOpen(true)}
              onOpenSaveModal={() => setIsSaveModalOpen(true)}
              onOpenCloseMonthModal={() => setIsCloseMonthModalOpen(true)}
              onInspectDocuments={handleInspectDocuments}
              selectedMonth={selectedMonth}
              setSelectedMonth={handleSetSelectedMonth}
              availableMonths={availableMonths}
              closedMonths={closedMonths}
              activeScope={activeScope}
            />
          )}

          {activeTab === 'diferencias' && (
            <DiferenciasView
              key={activeScope}
              differences={differences}
              onUpdateComment={handleUpdateComment}
              onBatchUpdateComments={handleBatchUpdateComments}
              onOpenGoogleSheets={() => setIsSheetsModalOpen(true)}
              onOpenSaveModal={() => setIsSaveModalOpen(true)}
              onOpenCloseMonthModal={() => setIsCloseMonthModalOpen(true)}
              onInspectDocuments={handleInspectDocuments}
              matrizCxc={matrizCxc}
              matrizCxp={matrizCxp}
              movements={filteredMovements}
              orderedEntities={activeOrderedEntityNames}
              entities={entities}
              selectedMonth={selectedMonth}
              closedMonths={closedMonths}
              activeScope={activeScope}
            />
          )}
        </main>
      </div>

      {/* Save & Share Reconciliation Modal */}
      <SaveReconciliationModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        currentUser={currentUser}
        onSignInWithGoogle={handleSignInWithGoogle}
        onSaveToCloud={handleSaveToCloud}
        activeDocId={activeDocId}
        activeDocTitle={activeDocTitle}
        lastSavedAtIso={lastSavedAtIso}
        hasUnsavedChanges={hasUnsavedChanges}
        entitiesCount={entities.length}
        movementsCount={movements.length}
        differencesCount={differencesCount}
        selectedMonth={selectedMonth}
        activeScope={activeScope}
      />

      {/* Close & Archive Month Modal (Independent per Scope) */}
      <CloseMonthModal
        isOpen={isCloseMonthModalOpen}
        onClose={() => setIsCloseMonthModalOpen(false)}
        defaultMonth={selectedMonth}
        activeScope={activeScope}
        scopeDetails={closureScopeDetails}
        currentUser={currentUser}
        onSignInWithGoogle={handleSignInWithGoogle}
        onConfirmCloseMonth={handleCloseMonth}
        onLoadNewMonth={(closedScope) => {
          if (closedScope !== activeScope) {
            handleChangeScope(closedScope);
          }
          setIsCloseMonthModalOpen(false);
          setActiveTab('carga');
        }}
      />

      {/* Google Sheets Modal */}
      <GoogleSheetsModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        currentUser={currentUser}
        onSignInWithGoogle={async () => {
          await handleSignInWithGoogle();
        }}
        differences={differences}
        matrizCxc={matrizCxc}
        matrizCxp={matrizCxp}
        movements={filteredMovements}
        orderedEntities={activeOrderedEntityNames}
        selectedMonth={selectedMonth}
        activeScope={activeScope}
      />
    </div>
  );
}
