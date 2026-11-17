import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  Cloud,
  Copy,
  Check,
  Building2,
  Eye,
  LogOut,
  ShieldAlert,
  ArrowLeft,
} from 'lucide-react';
import {
  ActiveModuleId,
  ActiveTab,
  Movement,
  EntityMapping,
  ClosedMonthRecord,
  MovimientosNavigationPreset,
  ReconciliationScope,
  DirectorySyncState,
  BankAccount,
  BankStatementItem,
  BookLedgerItem,
  BankMatchGroup,
  AccessControlPolicy,
  UserPermissionRecord,
  ViaticoConsultor,
  ViaticoLiquidation,
  ViaticosWorkspaceData,
  FunctionalModuleId,
  ModuleCompaniesMap,
  ModuleCompanyEntry,
  StandaloneCompanyDbModuleId,
} from './types';
import { INITIAL_ENTITIES, INITIAL_MOVEMENTS, INITIAL_COMMENTS } from './utils/demoData';
import {
  INITIAL_BANK_ACCOUNTS,
  INITIAL_BANK_STATEMENT_ITEMS,
  INITIAL_BOOK_LEDGER_ITEMS,
  INITIAL_BANK_MATCHES,
} from './utils/bankDemoData';
import { buildMatrix, calculateDifferences, buildSymmetricMatrix } from './utils/reconciliation';
import { computeBankReconciliationSummary } from './utils/bankReconciliation';
import {
  INITIAL_VIATICO_CONSULTORES,
  INITIAL_VIATICO_LIQUIDACIONES,
  filterLiquidacionesByPermissions,
  formatViaticoAmount,
  resolveViaticosConsultantScope,
} from './utils/viaticos';
import {
  INITIAL_ACCESS_POLICY,
  INITIAL_USER_PERMISSIONS,
  ROLE_METADATA,
  SUPER_ADMIN_EMAIL,
  ensureSuperAdminRecord,
  filterBankByPermissions,
  filterIntercompanyByPermissions,
  normalizeEmail,
  resolveEffectivePermissions,
} from './utils/permissions';
import {
  INITIAL_STANDALONE_MODULE_COMPANIES,
  STANDALONE_COMPANY_DB_MODULES,
  entityMappingsToModuleCompanies,
  mergeModuleCompanyEntriesToEntities,
  mergeRuntimeSocietyNames,
  sanitizeModuleCompanyList,
} from './utils/moduleCompanies';
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
import {
  DEFAULT_BANK_REC_ID,
  subscribeToBankReconciliation,
  saveBankReconciliationToCloud,
} from './services/bankReconciliationStore';
import {
  DEFAULT_VIATICOS_DOC_ID,
  subscribeToViaticosWorkspace,
  saveViaticosWorkspaceToCloud,
} from './services/viaticosStore';
import {
  saveUserPermissionAndRegistryToCloud,
  subscribeToAccessPolicy,
  subscribeToAdminAccessRegistry,
  subscribeToOwnUserPermission,
} from './services/permissionsStore';
import {
  subscribeToModuleCompanyDirectory,
  saveModuleCompanyDirectoryToCloud,
} from './services/moduleCompaniesStore';

import { ModuleLauncher, LauncherLiveMetrics } from './components/ModuleLauncher';
import { BankModuleWorkspace, BankWorkspaceData } from './components/bank/BankModuleWorkspace';
import { ViaticosModuleWorkspace } from './components/viaticos/ViaticosModuleWorkspace';
import {
  SettingsModuleWorkspace,
  ModuleDbSyncState,
} from './components/settings/SettingsModuleWorkspace';
import { PremexBrandLogo } from './components/ModuleIcons';
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
const MODULE_COMPANIES_STORAGE_KEY = 'premex_module_companies_v1';
const RBAC_STORAGE_KEYS = {
  RECORDS: 'premex_rbac_records_v1',
  POLICY: 'premex_rbac_policy_v1',
};
const BANK_STORAGE_KEYS = {
  ACCOUNTS: 'premex_bancos_accounts_v1',
  STATEMENTS: 'premex_bancos_statements_v1',
  LEDGER: 'premex_bancos_ledger_v1',
  MATCHES: 'premex_bancos_matches_v1',
  SELECTED_ACCOUNT: 'premex_bancos_selected_account_v1',
  DOC_ID: 'premex_bancos_doc_id_v1',
};
const VIATICOS_STORAGE_KEYS = {
  CONSULTORES: 'premex_viaticos_consultores_v1',
  LIQUIDACIONES: 'premex_viaticos_liquidaciones_v1',
  ACTIVE_ID: 'premex_viaticos_active_id_v1',
  DOC_ID: 'premex_viaticos_doc_id_v1',
};

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

function getInitialModuleFromUrl(): ActiveModuleId {
  if (typeof window === 'undefined') return 'launcher';
  const params = new URLSearchParams(window.location.search);
  const c = params.get('c')?.trim();
  const m = params.get('m')?.trim().toLowerCase();
  if (c) return 'intercompany';
  if (m === 'intercompany') return 'intercompany';
  if (m === 'bancos') return 'bancos';
  if (m === 'viaticos') return 'viaticos';
  if (m === 'ajustes') return 'ajustes';
  return 'launcher';
}

function loadInitialBankWorkspace(): BankWorkspaceData {
  const accounts = readJsonStorage<BankAccount[]>(
    BANK_STORAGE_KEYS.ACCOUNTS,
    INITIAL_BANK_ACCOUNTS
  );
  const statementItems = readJsonStorage<BankStatementItem[]>(
    BANK_STORAGE_KEYS.STATEMENTS,
    INITIAL_BANK_STATEMENT_ITEMS
  );
  const ledgerItems = readJsonStorage<BookLedgerItem[]>(
    BANK_STORAGE_KEYS.LEDGER,
    INITIAL_BOOK_LEDGER_ITEMS
  );
  const matches = readJsonStorage<BankMatchGroup[]>(
    BANK_STORAGE_KEYS.MATCHES,
    INITIAL_BANK_MATCHES
  );
  const savedAccId = (() => {
    try {
      const id = localStorage.getItem(BANK_STORAGE_KEYS.SELECTED_ACCOUNT);
      if (id && accounts.some((a) => a.id === id)) return id;
    } catch {
      // ignore
    }
    return accounts[0]?.id || '';
  })();
  const savedDocId = (() => {
    try {
      const raw = localStorage.getItem(BANK_STORAGE_KEYS.DOC_ID);
      if (raw && /^[a-zA-Z0-9_-]{1,128}$/.test(raw)) return raw;
    } catch {
      // ignore
    }
    return DEFAULT_BANK_REC_ID;
  })();

  const firstMonth = statementItems[0]?.mes || ledgerItems[0]?.mes || 'Septiembre 2026';

  return {
    docId: savedDocId,
    accounts,
    statementItems,
    ledgerItems,
    matches,
    selectedAccountId: savedAccId,
    selectedMonth: firstMonth,
    lastSavedAtIso: null,
    hasUnsavedChanges: false,
  };
}

function loadInitialViaticosWorkspace(): ViaticosWorkspaceData {
  const consultores = readJsonStorage<ViaticoConsultor[]>(
    VIATICOS_STORAGE_KEYS.CONSULTORES,
    INITIAL_VIATICO_CONSULTORES
  );
  const liquidaciones = readJsonStorage<ViaticoLiquidation[]>(
    VIATICOS_STORAGE_KEYS.LIQUIDACIONES,
    INITIAL_VIATICO_LIQUIDACIONES
  );
  const savedActiveId = (() => {
    try {
      const id = localStorage.getItem(VIATICOS_STORAGE_KEYS.ACTIVE_ID);
      if (id && liquidaciones.some((l) => l.id === id)) return id;
    } catch {
      // ignore
    }
    return liquidaciones[0]?.id || '';
  })();
  const savedDocId = (() => {
    try {
      const raw = localStorage.getItem(VIATICOS_STORAGE_KEYS.DOC_ID);
      if (raw && /^[a-zA-Z0-9_-]{1,128}$/.test(raw)) return raw;
    } catch {
      // ignore
    }
    return DEFAULT_VIATICOS_DOC_ID;
  })();

  return {
    docId: savedDocId,
    consultores: consultores.length > 0 ? consultores : INITIAL_VIATICO_CONSULTORES,
    liquidaciones,
    activeLiquidationId: savedActiveId,
    lastSavedAtIso: null,
    hasUnsavedChanges: false,
  };
}

function loadInitialStandaloneModuleCompanies(): Record<
  StandaloneCompanyDbModuleId,
  ModuleCompanyEntry[]
> {
  const saved = readJsonStorage<
    Partial<Record<StandaloneCompanyDbModuleId, ModuleCompanyEntry[]>>
  >(MODULE_COMPANIES_STORAGE_KEY, {});
  const result = {} as Record<StandaloneCompanyDbModuleId, ModuleCompanyEntry[]>;
  STANDALONE_COMPANY_DB_MODULES.forEach((modId) => {
    const candidate = saved[modId];
    result[modId] =
      Array.isArray(candidate) && candidate.length > 0
        ? sanitizeModuleCompanyList(candidate)
        : INITIAL_STANDALONE_MODULE_COMPANIES[modId];
  });
  return result;
}

export default function App() {
  const initialLaunch = useMemo(
    () => getInitialScopeAndDocIdFromUrl(getStoredActiveScope()),
    []
  );

  const [activeModule, setActiveModule] = useState<ActiveModuleId>(() =>
    getInitialModuleFromUrl()
  );
  const activeScope: ReconciliationScope = 'internacionales';
  const [activeTab, setActiveTab] = useState<ActiveTab>('inicio');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isCloseMonthModalOpen, setIsCloseMonthModalOpen] = useState(false);
  const [movimientosPreset, setMovimientosPreset] = useState<MovimientosNavigationPreset | null>(null);
  const [copiedBannerLink, setCopiedBannerLink] = useState<boolean>(false);

  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // RBAC Access Control state (by email, modules, companies, roles)
  const [permissionRecords, setPermissionRecords] = useState<UserPermissionRecord[]>(() =>
    ensureSuperAdminRecord(
      readJsonStorage<UserPermissionRecord[]>(
        RBAC_STORAGE_KEYS.RECORDS,
        INITIAL_USER_PERMISSIONS
      )
    )
  );
  const [accessPolicy, setAccessPolicy] = useState<AccessControlPolicy>(() =>
    readJsonStorage<AccessControlPolicy>(RBAC_STORAGE_KEYS.POLICY, INITIAL_ACCESS_POLICY)
  );
  const [ownPermissionDoc, setOwnPermissionDoc] = useState<UserPermissionRecord | null>(null);
  const [previewEmail, setPreviewEmail] = useState<string | null>(null);
  const [lastPermSyncIso, setLastPermSyncIso] = useState<string | null>(null);
  const [hasPendingPermSync, setHasPendingPermSync] = useState<boolean>(false);

  const realUserEmail = currentUser?.email ? normalizeEmail(currentUser.email) : null;
  const realIsAdmin = useMemo(() => {
    if (!currentUser || !realUserEmail) return true;
    if (realUserEmail === SUPER_ADMIN_EMAIL) return true;
    const matched =
      ownPermissionDoc ||
      permissionRecords.find((r) => normalizeEmail(r.email) === realUserEmail) ||
      null;
    return Boolean(matched && matched.active && matched.role === 'admin');
  }, [currentUser, realUserEmail, ownPermissionDoc, permissionRecords]);

  const effectivePermissions = useMemo(
    () =>
      resolveEffectivePermissions({
        currentUser,
        permissionsList: permissionRecords,
        ownPermissionDoc,
        policy: accessPolicy,
        previewEmail: realIsAdmin ? previewEmail : null,
      }),
    [
      currentUser,
      permissionRecords,
      ownPermissionDoc,
      accessPolicy,
      realIsAdmin,
      previewEmail,
    ]
  );

  // Bank Reconciliation module workspace state
  const [bankWorkspace, setBankWorkspace] = useState<BankWorkspaceData>(() =>
    loadInitialBankWorkspace()
  );
  const bankUnsavedRef = useRef<boolean>(false);
  bankUnsavedRef.current = bankWorkspace.hasUnsavedChanges;

  // Viáticos module workspace state
  const [viaticosWorkspace, setViaticosWorkspace] = useState<ViaticosWorkspaceData>(() =>
    loadInitialViaticosWorkspace()
  );
  const viaticosUnsavedRef = useRef<boolean>(false);
  viaticosUnsavedRef.current = viaticosWorkspace.hasUnsavedChanges;

  // Independent per-module company databases (bancos, viaticos, anticipos, cxc, cxp)
  // Intercompany uses /company_directories/internacionales as its single source of truth.
  const [standaloneModuleCompanies, setStandaloneModuleCompanies] = useState<
    Record<StandaloneCompanyDbModuleId, ModuleCompanyEntry[]>
  >(() => loadInitialStandaloneModuleCompanies());
  const standaloneModuleCompaniesRef = useRef(standaloneModuleCompanies);
  standaloneModuleCompaniesRef.current = standaloneModuleCompanies;

  const pendingStandaloneDbSyncRef = useRef<Record<StandaloneCompanyDbModuleId, boolean>>({
    bancos: false,
    viaticos: false,
    anticipos: false,
    cxc: false,
    cxp: false,
  });

  const [standaloneDbSyncStatus, setStandaloneDbSyncStatus] = useState<
    Record<StandaloneCompanyDbModuleId, ModuleDbSyncState>
  >({
    bancos: { status: 'idle' },
    viaticos: { status: 'idle' },
    anticipos: { status: 'idle' },
    cxc: { status: 'idle' },
    cxp: { status: 'idle' },
  });

  const handleSwitchModule = (nextModule: ActiveModuleId) => {
    if (nextModule !== 'launcher' && !effectivePermissions.canAccessModule(nextModule)) {
      return;
    }
    setActiveModule(nextModule);
    setIsMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      const nextPath =
        nextModule === 'launcher'
          ? window.location.pathname
          : `${window.location.pathname}?m=${nextModule}`;
      window.history.replaceState(null, '', nextPath);
    }
  };

  const handleStartPreviewAs = (email: string) => {
    if (!realIsAdmin) return;
    setPreviewEmail(normalizeEmail(email));
    setActiveModule('launcher');
    setIsMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  const handleExitPreview = () => {
    setPreviewEmail(null);
    setActiveModule('ajustes');
    setIsMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `${window.location.pathname}?m=ajustes`);
    }
  };

  const handleUpsertPermissionRecord = async (record: UserPermissionRecord) => {
    if (!realIsAdmin) {
      throw new Error('Solo los administradores pueden modificar permisos de usuarios.');
    }
    const cleanEmail = normalizeEmail(record.email);
    const nextRecords = ensureSuperAdminRecord([
      ...permissionRecords.filter((r) => normalizeEmail(r.email) !== cleanEmail),
      { ...record, email: cleanEmail },
    ]);
    setPermissionRecords(nextRecords);

    if (!currentUser) {
      setHasPendingPermSync(true);
      return;
    }

    const syncedRecord =
      nextRecords.find((r) => normalizeEmail(r.email) === cleanEmail) || record;
    const res = await saveUserPermissionAndRegistryToCloud({
      changedRecord: syncedRecord,
      allRecords: nextRecords,
      policy: accessPolicy,
    });
    setLastPermSyncIso(res.updatedAtIso);
    setHasPendingPermSync(false);
  };

  const handleDeletePermissionRecord = async (email: string) => {
    if (!realIsAdmin) {
      throw new Error('Solo los administradores pueden eliminar usuarios.');
    }
    const cleanEmail = normalizeEmail(email);
    if (cleanEmail === SUPER_ADMIN_EMAIL) {
      throw new Error('El administrador principal no puede ser eliminado.');
    }
    const nextRecords = ensureSuperAdminRecord(
      permissionRecords.filter((r) => normalizeEmail(r.email) !== cleanEmail)
    );
    setPermissionRecords(nextRecords);
    if (previewEmail && normalizeEmail(previewEmail) === cleanEmail) {
      setPreviewEmail(null);
    }

    if (!currentUser) {
      setHasPendingPermSync(true);
      return;
    }

    const res = await saveUserPermissionAndRegistryToCloud({
      deletedEmail: cleanEmail,
      allRecords: nextRecords,
      policy: accessPolicy,
    });
    setLastPermSyncIso(res.updatedAtIso);
    setHasPendingPermSync(false);
  };

  const handleTogglePolicyStrictMode = async (strictMode: boolean) => {
    if (!realIsAdmin) {
      throw new Error('Solo los administradores pueden cambiar la política de acceso.');
    }
    const nextPolicy: AccessControlPolicy = {
      ...accessPolicy,
      strictMode,
      updatedBy: currentUser?.email || 'Administrador',
      updatedAtIso: new Date().toISOString(),
    };
    setAccessPolicy(nextPolicy);

    if (!currentUser) {
      setHasPendingPermSync(true);
      return;
    }

    const res = await saveUserPermissionAndRegistryToCloud({
      allRecords: permissionRecords,
      policy: nextPolicy,
    });
    setLastPermSyncIso(res.updatedAtIso);
    setHasPendingPermSync(false);
  };

  const handleSyncAllPermissionsToCloud = async () => {
    if (!realIsAdmin) {
      throw new Error('Solo los administradores pueden sincronizar permisos.');
    }
    const res = await saveUserPermissionAndRegistryToCloud({
      allRecords: permissionRecords,
      policy: accessPolicy,
    });
    setLastPermSyncIso(res.updatedAtIso);
    setHasPendingPermSync(false);

    // Publish Intercompany company catalog and all 5 standalone module company DBs
    await syncDirectoryToCloud(
      'internacionales',
      workspacesRef.current.internacionales.entities
    );
    for (const modId of STANDALONE_COMPANY_DB_MODULES) {
      await handleSaveModuleCompanies(modId, standaloneModuleCompaniesRef.current[modId]);
    }
  };

  const handleSaveModuleCompanies = async (
    moduleId: FunctionalModuleId,
    nextCompanies: ModuleCompanyEntry[]
  ) => {
    if (!realIsAdmin) {
      throw new Error(
        'Solo los administradores pueden modificar las bases de datos de sociedades.'
      );
    }

    if (moduleId === 'intercompany') {
      const mergedEntities = mergeModuleCompanyEntriesToEntities(
        nextCompanies,
        workspacesRef.current.internacionales.entities
      );
      workspacesRef.current = {
        ...workspacesRef.current,
        internacionales: {
          ...workspacesRef.current.internacionales,
          entities: mergedEntities,
        },
      };
      updateScopeWorkspace(
        'internacionales',
        (prev) => ({
          ...prev,
          entities: mergedEntities,
        }),
        false
      );
      await syncDirectoryToCloud('internacionales', mergedEntities);
      return;
    }

    const clean = sanitizeModuleCompanyList(nextCompanies);
    const updatedMap = {
      ...standaloneModuleCompaniesRef.current,
      [moduleId]: clean,
    };
    standaloneModuleCompaniesRef.current = updatedMap;
    setStandaloneModuleCompanies(updatedMap);

    if (!auth.currentUser) {
      pendingStandaloneDbSyncRef.current[moduleId] = true;
      setStandaloneDbSyncStatus((prev) => ({
        ...prev,
        [moduleId]: {
          ...prev[moduleId],
          status: 'pending',
          errorMsg: undefined,
        },
      }));
      return;
    }

    pendingStandaloneDbSyncRef.current[moduleId] = false;
    setStandaloneDbSyncStatus((prev) => ({
      ...prev,
      [moduleId]: {
        ...prev[moduleId],
        status: 'saving',
        errorMsg: undefined,
      },
    }));

    try {
      const res = await saveModuleCompanyDirectoryToCloud(moduleId, clean);
      setStandaloneDbSyncStatus((prev) => ({
        ...prev,
        [moduleId]: {
          status: 'saved',
          lastSyncedAtIso: res.updatedAtIso,
          updatedByName:
            auth.currentUser?.displayName || auth.currentUser?.email || 'Administrador',
        },
      }));
    } catch (err: any) {
      pendingStandaloneDbSyncRef.current[moduleId] = true;
      setStandaloneDbSyncStatus((prev) => ({
        ...prev,
        [moduleId]: {
          ...prev[moduleId],
          status: 'error',
          errorMsg:
            err?.message ||
            'No se pudo guardar la base de datos de empresas en Firestore.',
        },
      }));
      throw err;
    }
  };

  const handleUpdateBankWorkspace = (
    updater: (prev: BankWorkspaceData) => BankWorkspaceData,
    markUnsaved = false
  ) => {
    if (markUnsaved && !effectivePermissions.canOperate) return;
    setBankWorkspace((prev) => {
      const next = updater(prev);
      return {
        ...next,
        hasUnsavedChanges: markUnsaved ? true : next.hasUnsavedChanges,
      };
    });
  };

  const handleUpdateViaticosWorkspace = (
    updater: (prev: ViaticosWorkspaceData) => ViaticosWorkspaceData,
    markUnsaved = false
  ) => {
    if (markUnsaved && !effectivePermissions.canOperate) return;
    setViaticosWorkspace((prev) => {
      const next = updater(prev);
      return {
        ...next,
        hasUnsavedChanges: markUnsaved ? true : next.hasUnsavedChanges,
      };
    });
  };

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

  // Persist Bank Reconciliation workspace to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(BANK_STORAGE_KEYS.ACCOUNTS, JSON.stringify(bankWorkspace.accounts));
      localStorage.setItem(
        BANK_STORAGE_KEYS.STATEMENTS,
        JSON.stringify(bankWorkspace.statementItems)
      );
      localStorage.setItem(BANK_STORAGE_KEYS.LEDGER, JSON.stringify(bankWorkspace.ledgerItems));
      localStorage.setItem(BANK_STORAGE_KEYS.MATCHES, JSON.stringify(bankWorkspace.matches));
      localStorage.setItem(
        BANK_STORAGE_KEYS.SELECTED_ACCOUNT,
        bankWorkspace.selectedAccountId
      );
      localStorage.setItem(BANK_STORAGE_KEYS.DOC_ID, bankWorkspace.docId);
    } catch (e) {
      console.warn('Failed to save Bank workspace:', e);
    }
  }, [bankWorkspace]);

  // Subscribe to Bank Reconciliation cloud document (/bank_reconciliations/{docId})
  useEffect(() => {
    const unsubscribe = subscribeToBankReconciliation(
      bankWorkspace.docId,
      (savedDoc) => {
        if (!savedDoc) return;
        if (bankUnsavedRef.current) return;
        setBankWorkspace((prev) => ({
          ...prev,
          accounts: savedDoc.accounts.length > 0 ? savedDoc.accounts : prev.accounts,
          statementItems: savedDoc.statementItems,
          ledgerItems: savedDoc.ledgerItems,
          matches: savedDoc.matches,
          selectedMonth: savedDoc.selectedMonth || prev.selectedMonth,
          selectedAccountId:
            savedDoc.selectedAccountId &&
            savedDoc.accounts.some((a) => a.id === savedDoc.selectedAccountId)
              ? savedDoc.selectedAccountId
              : savedDoc.accounts[0]?.id || prev.selectedAccountId,
          lastSavedAtIso: savedDoc.updatedAtIso || new Date().toISOString(),
          hasUnsavedChanges: false,
        }));
      },
      (err) => {
        console.warn('Error loading cloud bank reconciliation:', err);
      }
    );
    return () => {
      unsubscribe();
    };
  }, [bankWorkspace.docId]);

  // Persist Viáticos workspace to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        VIATICOS_STORAGE_KEYS.CONSULTORES,
        JSON.stringify(viaticosWorkspace.consultores)
      );
      localStorage.setItem(
        VIATICOS_STORAGE_KEYS.LIQUIDACIONES,
        JSON.stringify(viaticosWorkspace.liquidaciones)
      );
      localStorage.setItem(
        VIATICOS_STORAGE_KEYS.ACTIVE_ID,
        viaticosWorkspace.activeLiquidationId
      );
      localStorage.setItem(VIATICOS_STORAGE_KEYS.DOC_ID, viaticosWorkspace.docId);
    } catch (e) {
      console.warn('Failed to save Viáticos workspace locally:', e);
    }
  }, [viaticosWorkspace]);

  // Subscribe to Viáticos cloud document ONLY when authenticated & authorized (PII-isolated rule)
  useEffect(() => {
    if (!currentUser?.emailVerified || !effectivePermissions.canAccessModule('viaticos')) {
      return;
    }
    const unsubscribe = subscribeToViaticosWorkspace(
      viaticosWorkspace.docId,
      (savedDoc) => {
        if (!savedDoc) return;
        if (viaticosUnsavedRef.current) return;
        setViaticosWorkspace((prev) => ({
          ...prev,
          consultores:
            savedDoc.consultores.length > 0 ? savedDoc.consultores : prev.consultores,
          liquidaciones:
            savedDoc.liquidaciones.length > 0
              ? savedDoc.liquidaciones
              : prev.liquidaciones,
          activeLiquidationId:
            savedDoc.activeLiquidationId &&
            savedDoc.liquidaciones.some((l) => l.id === savedDoc.activeLiquidationId)
              ? savedDoc.activeLiquidationId
              : savedDoc.liquidaciones[0]?.id || prev.activeLiquidationId,
          lastSavedAtIso: savedDoc.updatedAtIso || new Date().toISOString(),
          hasUnsavedChanges: false,
        }));
      },
      (err) => {
        console.warn('Error loading cloud viáticos workspace:', err);
      }
    );
    return () => {
      unsubscribe();
    };
  }, [
    viaticosWorkspace.docId,
    currentUser?.emailVerified,
    effectivePermissions,
  ]);

  // Persist RBAC permissions & policy locally
  useEffect(() => {
    try {
      localStorage.setItem(RBAC_STORAGE_KEYS.RECORDS, JSON.stringify(permissionRecords));
      localStorage.setItem(RBAC_STORAGE_KEYS.POLICY, JSON.stringify(accessPolicy));
    } catch (e) {
      console.warn('Failed to save RBAC config locally:', e);
    }
  }, [permissionRecords, accessPolicy]);

  // Subscribe to signed-in user's own permission record & global non-PII access policy
  useEffect(() => {
    if (!currentUser?.email) {
      setOwnPermissionDoc(null);
      return;
    }
    const unsubOwn = subscribeToOwnUserPermission(currentUser.email, (rec) => {
      setOwnPermissionDoc(rec);
    });
    const unsubPolicy = subscribeToAccessPolicy((pol) => {
      setAccessPolicy(pol);
    });
    return () => {
      unsubOwn();
      unsubPolicy();
    };
  }, [currentUser?.email]);

  // Subscribe to consolidated admin RBAC directory ONLY for verified Admins
  useEffect(() => {
    if (!currentUser?.emailVerified || !realIsAdmin) return;
    const unsubAdmin = subscribeToAdminAccessRegistry((cloudRecords) => {
      if (cloudRecords.length > 0) {
        setPermissionRecords(ensureSuperAdminRecord(cloudRecords));
        setHasPendingPermSync(false);
      }
    });
    return () => unsubAdmin();
  }, [currentUser?.emailVerified, realIsAdmin]);

  // Persist independent per-module company databases locally
  useEffect(() => {
    try {
      localStorage.setItem(
        MODULE_COMPANIES_STORAGE_KEY,
        JSON.stringify(standaloneModuleCompanies)
      );
    } catch (e) {
      console.warn('Failed to save per-module company databases locally:', e);
    }
  }, [standaloneModuleCompanies]);

  // Subscribe to independent per-module company DBs in Firestore ONLY when verified (matches firestore.rules)
  useEffect(() => {
    if (!currentUser?.emailVerified) return;
    const unsubscribers = STANDALONE_COMPANY_DB_MODULES.map((modId) =>
      subscribeToModuleCompanyDirectory(
        modId,
        (savedDir) => {
          if (!savedDir) return;
          if (pendingStandaloneDbSyncRef.current[modId]) return;
          setStandaloneModuleCompanies((prev) => ({
            ...prev,
            [modId]: savedDir.companies,
          }));
          setStandaloneDbSyncStatus((prev) => ({
            ...prev,
            [modId]: {
              status: 'saved',
              lastSyncedAtIso: savedDir.updatedAtIso,
              updatedByName: savedDir.updatedByName,
            },
          }));
        },
        (err) => {
          console.warn(`Error loading module company directory (${modId}):`, err);
        }
      )
    );
    return () => {
      unsubscribers.forEach((fn) => fn());
    };
  }, [currentUser?.emailVerified]);

  // Flush any pending local standalone module company DB changes once verified Admin signs in
  useEffect(() => {
    if (!currentUser?.emailVerified || !realIsAdmin) return;
    STANDALONE_COMPANY_DB_MODULES.forEach((modId) => {
      if (pendingStandaloneDbSyncRef.current[modId]) {
        void handleSaveModuleCompanies(
          modId,
          standaloneModuleCompaniesRef.current[modId]
        ).catch((err) => {
          console.warn(`Failed to flush pending ${modId} company DB:`, err);
        });
      }
    });
  }, [currentUser?.emailVerified, realIsAdmin]);

  // Clear preview if signed-in account is not an Admin
  useEffect(() => {
    if (currentUser && !realIsAdmin && previewEmail) {
      setPreviewEmail(null);
    }
  }, [currentUser, realIsAdmin, previewEmail]);

  // Enforce module & tab access guards automatically
  useEffect(() => {
    if (activeModule !== 'launcher' && !effectivePermissions.canAccessModule(activeModule)) {
      setActiveModule('launcher');
    }
  }, [activeModule, effectivePermissions]);

  useEffect(() => {
    if (effectivePermissions.isReadOnly && activeTab === 'carga') {
      setActiveTab('inicio');
    }
  }, [effectivePermissions.isReadOnly, activeTab]);

  const handleSaveBankToCloud = async () => {
    if (!effectivePermissions.canOperate) {
      throw new Error(
        'Tu perfil tiene permisos de Solo Consulta y no puede guardar cambios en la nube.'
      );
    }
    const result = await saveBankReconciliationToCloud({
      targetId: bankWorkspace.docId,
      title: `Conciliación Bancaria Premex - ${bankWorkspace.selectedMonth}`,
      selectedMonth: bankWorkspace.selectedMonth,
      selectedAccountId: bankWorkspace.selectedAccountId,
      accounts: bankWorkspace.accounts,
      statementItems: bankWorkspace.statementItems,
      ledgerItems: bankWorkspace.ledgerItems,
      matches: bankWorkspace.matches,
    });
    setBankWorkspace((prev) => ({
      ...prev,
      docId: result.id,
      lastSavedAtIso: result.updatedAtIso,
      hasUnsavedChanges: false,
    }));
  };

  const handleSaveViaticosToCloud = async (overrideData?: ViaticosWorkspaceData) => {
    if (!effectivePermissions.canOperate) {
      throw new Error(
        'Tu perfil tiene permisos de Solo Consulta y no puede guardar cambios en la nube.'
      );
    }
    const source = overrideData || viaticosWorkspace;
    const result = await saveViaticosWorkspaceToCloud({
      targetId: source.docId,
      title: 'Liquidación de Viáticos Premex',
      activeLiquidationId: source.activeLiquidationId,
      consultores: source.consultores,
      liquidaciones: source.liquidaciones,
    });
    setViaticosWorkspace((prev) => ({
      ...prev,
      docId: result.id,
      lastSavedAtIso: result.updatedAtIso,
      hasUnsavedChanges: false,
    }));
  };

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
      setOwnPermissionDoc(null);
      setPreviewEmail(null);
    } catch (err: any) {
      console.error('Sign out error:', err);
    }
  };

  const handleSaveToCloud = async (options: { title: string; forceNewCopy?: boolean }) => {
    if (!effectivePermissions.canOperate) {
      throw new Error(
        'Tu perfil tiene permisos de Solo Consulta y no puede guardar cambios en la nube.'
      );
    }
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
    if (!effectivePermissions.canCloseMonth) {
      throw new Error(
        'El cierre mensual definitivo está reservado exclusivamente para Administradores.'
      );
    }
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

  // Independent company databases for each of the 6 functional modules
  const moduleCompanyDatabases = useMemo<ModuleCompaniesMap>(() => {
    const intercompanyList = entityMappingsToModuleCompanies(
      workspaces.internacionales.entities
    );
    const bancosList = mergeRuntimeSocietyNames(
      standaloneModuleCompanies.bancos,
      bankWorkspace.accounts.map((a) => ({
        nombre: a.sociedad,
        pais: a.pais,
        moneda: a.moneda,
      })),
      'bnk'
    );
    const viaticosList = mergeRuntimeSocietyNames(
      standaloneModuleCompanies.viaticos,
      [
        ...viaticosWorkspace.consultores.map((c) => ({ nombre: c.empresa })),
        ...viaticosWorkspace.liquidaciones.map((l) => ({ nombre: l.empresa })),
      ],
      'viat'
    );

    return {
      intercompany: intercompanyList,
      bancos: bancosList,
      viaticos: viaticosList,
      anticipos: standaloneModuleCompanies.anticipos,
      cxc: standaloneModuleCompanies.cxc,
      cxp: standaloneModuleCompanies.cxp,
    };
  }, [
    workspaces.internacionales.entities,
    standaloneModuleCompanies,
    bankWorkspace.accounts,
    viaticosWorkspace.consultores,
    viaticosWorkspace.liquidaciones,
  ]);

  const moduleDbSyncStatus = useMemo<Record<FunctionalModuleId, ModuleDbSyncState>>(
    () => ({
      intercompany: directorySyncStatus.internacionales,
      bancos: standaloneDbSyncStatus.bancos,
      viaticos: standaloneDbSyncStatus.viaticos,
      anticipos: standaloneDbSyncStatus.anticipos,
      cxc: standaloneDbSyncStatus.cxc,
      cxp: standaloneDbSyncStatus.cxp,
    }),
    [directorySyncStatus.internacionales, standaloneDbSyncStatus]
  );

  // Apply non-destructive cross-module company scoping based on effectivePermissions
  const scopedIntercompany = useMemo(
    () => filterIntercompanyByPermissions(entities, movements, effectivePermissions),
    [entities, movements, effectivePermissions]
  );
  const visibleEntities = scopedIntercompany.entities;
  const visibleMovements = scopedIntercompany.movements;

  const visibleBankWorkspace = useMemo<BankWorkspaceData>(() => {
    const filtered = filterBankByPermissions(
      bankWorkspace.accounts,
      bankWorkspace.statementItems,
      bankWorkspace.ledgerItems,
      bankWorkspace.matches,
      effectivePermissions
    );
    const selectedValid = filtered.accounts.some(
      (a) => a.id === bankWorkspace.selectedAccountId
    );
    return {
      ...bankWorkspace,
      accounts: filtered.accounts,
      statementItems: filtered.statementItems,
      ledgerItems: filtered.ledgerItems,
      matches: filtered.matches,
      selectedAccountId: selectedValid
        ? bankWorkspace.selectedAccountId
        : filtered.accounts[0]?.id || '',
    };
  }, [bankWorkspace, effectivePermissions]);

  // Detect available months in scoped Intercompany dataset
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    visibleMovements.forEach((m) => {
      set.add(m.mes || 'Septiembre 2026');
    });
    if (set.size === 0) {
      movements.forEach((m) => set.add(m.mes || 'Septiembre 2026'));
    }
    if (set.size === 0) set.add('Septiembre 2026');
    return Array.from(set).sort();
  }, [visibleMovements, movements]);

  useEffect(() => {
    if (selectedMonth !== 'ALL' && !availableMonths.includes(selectedMonth)) {
      updateScopeWorkspace(activeScope, (prev) => ({
        ...prev,
        selectedMonth: availableMonths[0] || 'ALL',
      }));
    }
  }, [availableMonths, selectedMonth, activeScope]);

  // Filter scoped movements by selected month
  const filteredMovements = useMemo(() => {
    if (selectedMonth === 'ALL') return visibleMovements;
    return visibleMovements.filter(
      (m) => (m.mes || 'Septiembre 2026') === selectedMonth
    );
  }, [visibleMovements, selectedMonth]);

  // Derive exact ordered list of visible companies
  const orderedEntityNames = useMemo(
    () => visibleEntities.map((e) => e.nombreOficial),
    [visibleEntities]
  );

  const activeClosedRecord =
    selectedMonth !== 'ALL' ? closedMonths[selectedMonth] : undefined;

  const activeOrderedEntityNames = orderedEntityNames;

  const activeComments = useMemo(() => {
    if (activeClosedRecord?.commentsSnapshot) {
      return activeClosedRecord.commentsSnapshot;
    }
    return comments;
  }, [activeClosedRecord, comments]);

  // Reconciliations & Matrices based on active scope, filtered month & permitted companies
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
    if (!effectivePermissions.canOperate) return;
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
    if (!effectivePermissions.canOperate) return;
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
    if (!effectivePermissions.canManageMasterData) return;
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
    if (!effectivePermissions.canOperate) return;
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
      effectivePermissions.canOperate
    );
  };

  const handleAddMissingEntities = (names: string[]) => {
    if (!effectivePermissions.canManageMasterData) return;
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
    if (!effectivePermissions.canOperate) return;
    const scopeAtImport = activeScope;
    const ws = workspaces[scopeAtImport];

    const isAllowedByScope = (m: Movement) =>
      effectivePermissions.isAdmin ||
      effectivePermissions.getModuleCompanyScope('intercompany') === 'all' ||
      effectivePermissions.isCompanyAllowed(m.sociedad, 'intercompany') ||
      effectivePermissions.isCompanyAllowed(m.contraparte, 'intercompany');

    // Reject closed-month movements and (if company-scoped) out-of-scope movements
    const safeNewMovements = newMovements.filter(
      (m) => !ws.closedMonths[m.mes || 'Septiembre 2026'] && isAllowedByScope(m)
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
                  (m) =>
                    Boolean(prev.closedMonths[m.mes || 'Septiembre 2026']) ||
                    !isAllowedByScope(m)
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

  const launcherMetrics = useMemo<LauncherLiveMetrics>(() => {
    let totalBankItems = 0;
    let totalBankMatched = 0;
    let totalBankPending = 0;

    visibleBankWorkspace.accounts.forEach((acc) => {
      const s = computeBankReconciliationSummary(
        acc,
        visibleBankWorkspace.statementItems,
        visibleBankWorkspace.ledgerItems,
        visibleBankWorkspace.matches,
        visibleBankWorkspace.selectedMonth
      );
      totalBankItems += s.totalBankItems + s.totalLedgerItems;
      totalBankMatched += s.matchedBankItemsCount + s.matchedLedgerItemsCount;
      totalBankPending += s.unmatchedBankItemsCount + s.unmatchedLedgerItemsCount;
    });

    const bankReconciledPct =
      totalBankItems > 0 ? Math.round((totalBankMatched / totalBankItems) * 100) : 100;

    const viatScope = resolveViaticosConsultantScope(
      viaticosWorkspace.consultores,
      effectivePermissions
    );
    const visibleViaticos = filterLiquidacionesByPermissions(
      viaticosWorkspace.liquidaciones,
      effectivePermissions,
      viatScope.matchedConsultor
    );
    const viaticosOpenCount = visibleViaticos.filter((l) => l.estado === 'borrador').length;
    const primaryViat = visibleViaticos[0];
    const viaticosTotalLabel = primaryViat
      ? formatViaticoAmount(primaryViat.totalLiquidacion, primaryViat.monedaBase, true)
      : 'Q 0.00';

    return {
      intercompanyEntitiesCount: visibleEntities.length,
      intercompanyMovementsCount: filteredMovements.length,
      intercompanyDifferencesCount: differencesCount,
      intercompanyPeriod: selectedMonth,
      bankAccountsCount: visibleBankWorkspace.accounts.length,
      bankReconciledPct,
      bankPendingCount: totalBankPending,
      bankPeriod: visibleBankWorkspace.selectedMonth,
      viaticosLiquidacionesCount: visibleViaticos.length,
      viaticosOpenCount,
      viaticosTotalLabel,
      configuredUsersCount: permissionRecords.length,
    };
  }, [
    visibleEntities.length,
    filteredMovements.length,
    differencesCount,
    selectedMonth,
    visibleBankWorkspace,
    viaticosWorkspace.consultores,
    viaticosWorkspace.liquidaciones,
    effectivePermissions,
    permissionRecords.length,
  ]);

  // Global slim top banner when an Administrator is previewing another user's permissions
  const previewBanner = effectivePermissions.isPreviewing ? (
    <div className="sticky top-0 z-[60] bg-[#0F214D] text-white border-b border-white/15 px-4 py-2 text-xs">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
          <Eye className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span className="truncate">
            <strong className="font-bold text-amber-200">Vista previa de permisos:</strong>{' '}
            <span className="font-mono">{effectivePermissions.email}</span>
            <span className="text-white/40 mx-1.5">·</span>
            <span>
              Rol: <strong>{ROLE_METADATA[effectivePermissions.role].label}</strong>
            </span>
            <span className="text-white/40 mx-1.5">·</span>
            <span>
              {(() => {
                if (
                  activeModule === 'intercompany' ||
                  activeModule === 'bancos' ||
                  activeModule === 'viaticos'
                ) {
                  const modScope = effectivePermissions.getModuleCompanyScope(activeModule);
                  const modList =
                    effectivePermissions.getAllowedCompaniesForModule(activeModule);
                  return modScope === 'all'
                    ? 'Todas las sociedades en este módulo'
                    : `${modList.length} sociedad(es) en este módulo`;
                }
                const restrictedCount = Object.values(
                  effectivePermissions.moduleCompanyAccess
                ).filter((r) => r?.scope === 'selected').length;
                return restrictedCount === 0
                  ? 'Todas las sociedades'
                  : `Alcance personalizado en ${restrictedCount} módulo(s)`;
              })()}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={handleExitPreview}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white text-[#132B63] hover:bg-blue-50 font-semibold transition-colors shrink-0 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Salir y volver a Ajustes</span>
        </button>
      </div>
    </div>
  ) : null;

  // 0. Access Denied Gate (Strict Mode unregistered user or suspended user)
  if (!effectivePermissions.isAuthorized) {
    return (
      <div className="min-h-screen bg-[#F5F8FC] flex flex-col font-sans text-slate-800 antialiased">
        {previewBanner}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-5">
            <div className="flex justify-center">
              <PremexBrandLogo className="h-12" />
            </div>
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-lg font-bold text-slate-900">
                Acceso restringido a la Suite Premex
              </h1>
              <p className="text-xs text-slate-600 leading-relaxed">
                El correo{' '}
                <strong className="font-mono text-slate-900">
                  {effectivePermissions.email || currentUser?.email}
                </strong>{' '}
                no cuenta con acceso activo en el directorio corporativo de permisos. Solicita la
                habilitación de módulos y sociedades al administrador{' '}
                <strong className="text-[#132B63]">{SUPER_ADMIN_EMAIL}</strong>.
              </p>
            </div>
            <div className="pt-2 flex flex-col gap-2">
              {effectivePermissions.isPreviewing ? (
                <button
                  type="button"
                  onClick={handleExitPreview}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#132B63] hover:bg-[#1E60A8] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Salir de vista previa y volver a Ajustes</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#132B63] hover:bg-[#1E60A8] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Cerrar sesión y cambiar de cuenta</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 1. Modular Premex Suite Launcher Hub
  if (activeModule === 'launcher') {
    return (
      <div className="min-h-screen flex flex-col">
        {previewBanner}
        <div className="flex-1">
          <ModuleLauncher
            onOpenModule={handleSwitchModule}
            currentUser={currentUser}
            onSignInWithGoogle={() => {
              handleSignInWithGoogle().catch((err) => {
                console.error('Google sign in failed:', err);
              });
            }}
            onSignOut={handleSignOut}
            metrics={launcherMetrics}
            permissions={effectivePermissions}
          />
        </div>
      </div>
    );
  }

  // 2. Ajustes y Configuraciones Module (Administrators Only)
  if (activeModule === 'ajustes' && effectivePermissions.isAdmin) {
    return (
      <div className="min-h-screen flex flex-col">
        {previewBanner}
        <div className="flex-1">
          <SettingsModuleWorkspace
            records={permissionRecords}
            policy={accessPolicy}
            moduleCompanyDatabases={moduleCompanyDatabases}
            moduleDbSyncStatus={moduleDbSyncStatus}
            currentUser={currentUser}
            onSignInWithGoogle={() => {
              handleSignInWithGoogle().catch((err) => {
                console.error('Google sign in failed:', err);
              });
            }}
            onSignOut={handleSignOut}
            onSwitchModule={handleSwitchModule}
            onUpsertRecord={handleUpsertPermissionRecord}
            onDeleteRecord={handleDeletePermissionRecord}
            onTogglePolicyStrictMode={handleTogglePolicyStrictMode}
            onSyncAllToCloud={handleSyncAllPermissionsToCloud}
            onSaveModuleCompanies={handleSaveModuleCompanies}
            onStartPreviewAs={handleStartPreviewAs}
            lastCloudSyncIso={lastPermSyncIso}
            hasPendingCloudSync={hasPendingPermSync}
          />
        </div>
      </div>
    );
  }

  // 3. Conciliación Bancaria Module
  if (activeModule === 'bancos') {
    return (
      <div className="min-h-screen flex flex-col">
        {previewBanner}
        <div className="flex-1">
          <BankModuleWorkspace
            data={visibleBankWorkspace}
            onUpdateData={handleUpdateBankWorkspace}
            onSaveToCloud={handleSaveBankToCloud}
            currentUser={currentUser}
            onSignInWithGoogle={() => {
              handleSignInWithGoogle().catch((err) => {
                console.error('Google sign in failed:', err);
              });
            }}
            onSignOut={handleSignOut}
            onSwitchModule={handleSwitchModule}
            permissions={effectivePermissions}
            moduleCompanies={moduleCompanyDatabases.bancos}
          />
        </div>
      </div>
    );
  }

  // 4. Liquidación de Viáticos Module
  if (activeModule === 'viaticos') {
    return (
      <div className="min-h-screen flex flex-col">
        {previewBanner}
        <div className="flex-1">
          <ViaticosModuleWorkspace
            data={viaticosWorkspace}
            onUpdateData={handleUpdateViaticosWorkspace}
            onSaveToCloud={handleSaveViaticosToCloud}
            currentUser={currentUser}
            onSignInWithGoogle={() => {
              handleSignInWithGoogle().catch((err) => {
                console.error('Google sign in failed:', err);
              });
            }}
            onSignOut={handleSignOut}
            onSwitchModule={handleSwitchModule}
            permissions={effectivePermissions}
            moduleCompanies={moduleCompanyDatabases.viaticos}
          />
        </div>
      </div>
    );
  }

  // 5. Conciliación Intercompany Module (Anitox Workspace with RBAC & Company Scoping)
  return (
    <div className="min-h-screen bg-[#F5F8FC] flex flex-col font-sans text-slate-800 antialiased selection:bg-[#1E60A8] selection:text-white">
      {previewBanner}
      {/* Lateral Menu (Sidebar) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        differencesCount={differencesCount}
        movementsCount={visibleMovements.length}
        entitiesCount={visibleEntities.length}
        onSwitchModule={handleSwitchModule}
        permissions={effectivePermissions}
      />

      {/* Main Layout Area */}
      <div className="lg:pl-72 flex flex-col flex-1 transition-all">
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
          onOpenGoogleSheetsModal={() => {
            if (!effectivePermissions.isReadOnly) setIsSheetsModalOpen(true);
          }}
          onOpenSaveModal={() => {
            if (effectivePermissions.canOperate) setIsSaveModalOpen(true);
          }}
          hasUnsavedChanges={effectivePermissions.canOperate ? hasUnsavedChanges : false}
          hasToken={!!accessToken}
          selectedMonth={selectedMonth}
          setSelectedMonth={handleSetSelectedMonth}
          availableMonths={availableMonths}
          closedMonths={closedMonths}
          entities={visibleEntities}
          onSwitchModule={handleSwitchModule}
          permissions={effectivePermissions}
        />

        {/* Company Scope / Cloud Sync / Shared Link Status Strip */}
        {(effectivePermissions.getModuleCompanyScope('intercompany') === 'selected' ||
          lastSavedAtIso ||
          (effectivePermissions.canOperate && hasUnsavedChanges)) && (
          <div className="px-4 sm:px-6 lg:px-8 pt-4 max-w-7xl mx-auto w-full space-y-2">
            {effectivePermissions.getModuleCompanyScope('intercompany') === 'selected' && (
              <div className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
                <span className="truncate">
                  <strong className="font-semibold text-slate-800">
                    Alcance Intercompany:
                  </strong>{' '}
                  {effectivePermissions.getAllowedCompaniesForModule('intercompany').length > 0
                    ? effectivePermissions
                        .getAllowedCompaniesForModule('intercompany')
                        .join(', ')
                    : 'Sin sociedades asignadas'}
                </span>
              </div>
            )}

            {(lastSavedAtIso || (effectivePermissions.canOperate && hasUnsavedChanges)) && (
              <div
                className={`px-4 py-2.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  effectivePermissions.canOperate && hasUnsavedChanges
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-blue-50/80 border-blue-200 text-blue-900'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Cloud
                    className={`w-4 h-4 shrink-0 ${
                      effectivePermissions.canOperate && hasUnsavedChanges
                        ? 'text-amber-600'
                        : 'text-blue-600'
                    }`}
                  />
                  {effectivePermissions.canOperate && hasUnsavedChanges ? (
                    <span className="truncate">
                      <strong>Cambios locales sin guardar (Anitox):</strong> Presiona{' '}
                      <strong>Guardar Conciliación</strong> para actualizar el enlace compartido.
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
                  {effectivePermissions.canOperate && hasUnsavedChanges ? (
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
            )}
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
              onOpenGoogleSheets={() => {
                if (!effectivePermissions.isReadOnly) setIsSheetsModalOpen(true);
              }}
              onOpenSaveModal={
                effectivePermissions.canOperate ? () => setIsSaveModalOpen(true) : undefined
              }
              activeScope={activeScope}
              readOnly={effectivePermissions.isReadOnly}
            />
          )}

          {activeTab === 'empresas' && (
            <EmpresasView
              key={activeScope}
              entities={visibleEntities}
              setEntities={handleSetEntities}
              movements={visibleMovements}
              onGoToConciliacion={() => setActiveTab('conciliacion')}
              activeScope={activeScope}
              directorySync={directorySyncStatus[activeScope]}
              currentUser={currentUser}
              onSaveDirectoryToCloud={() =>
                effectivePermissions.canManageMasterData
                  ? syncDirectoryToCloud(
                      activeScope,
                      workspacesRef.current[activeScope].entities
                    )
                  : Promise.resolve()
              }
              onSignInWithGoogle={() => {
                handleSignInWithGoogle().catch((err) => {
                  console.error('Google sign in failed:', err);
                });
              }}
              readOnly={effectivePermissions.isReadOnly}
              canManageMasterData={effectivePermissions.canManageMasterData}
            />
          )}

          {activeTab === 'carga' && (
            <CargaArchivosView
              key={activeScope}
              onImportMovements={handleImportMovements}
              currentMovementsCount={visibleMovements.length}
              selectedMonth={selectedMonth}
              registeredEntities={orderedEntityNames}
              entityMappings={visibleEntities}
              onAddMissingEntities={handleAddMissingEntities}
              onGoToEmpresas={() => setActiveTab('empresas')}
              closedMonths={closedMonths}
              readOnly={effectivePermissions.isReadOnly}
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
              readOnly={effectivePermissions.isReadOnly}
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
              onOpenGoogleSheets={() => {
                if (!effectivePermissions.isReadOnly) setIsSheetsModalOpen(true);
              }}
              onOpenSaveModal={
                effectivePermissions.canOperate ? () => setIsSaveModalOpen(true) : undefined
              }
              onOpenCloseMonthModal={
                effectivePermissions.canCloseMonth
                  ? () => setIsCloseMonthModalOpen(true)
                  : undefined
              }
              onInspectDocuments={handleInspectDocuments}
              selectedMonth={selectedMonth}
              setSelectedMonth={handleSetSelectedMonth}
              availableMonths={availableMonths}
              closedMonths={closedMonths}
              activeScope={activeScope}
              readOnly={effectivePermissions.isReadOnly}
            />
          )}

          {activeTab === 'diferencias' && (
            <DiferenciasView
              key={activeScope}
              differences={differences}
              onUpdateComment={handleUpdateComment}
              onBatchUpdateComments={handleBatchUpdateComments}
              onOpenGoogleSheets={() => {
                if (!effectivePermissions.isReadOnly) setIsSheetsModalOpen(true);
              }}
              onOpenSaveModal={
                effectivePermissions.canOperate ? () => setIsSaveModalOpen(true) : undefined
              }
              onOpenCloseMonthModal={
                effectivePermissions.canCloseMonth
                  ? () => setIsCloseMonthModalOpen(true)
                  : undefined
              }
              onInspectDocuments={handleInspectDocuments}
              matrizCxc={matrizCxc}
              matrizCxp={matrizCxp}
              movements={filteredMovements}
              orderedEntities={activeOrderedEntityNames}
              entities={visibleEntities}
              selectedMonth={selectedMonth}
              closedMonths={closedMonths}
              activeScope={activeScope}
              readOnly={effectivePermissions.isReadOnly}
            />
          )}
        </main>
      </div>

      {/* Save & Share Reconciliation Modal */}
      <SaveReconciliationModal
        isOpen={isSaveModalOpen && effectivePermissions.canOperate}
        onClose={() => setIsSaveModalOpen(false)}
        currentUser={currentUser}
        onSignInWithGoogle={handleSignInWithGoogle}
        onSaveToCloud={handleSaveToCloud}
        activeDocId={activeDocId}
        activeDocTitle={activeDocTitle}
        lastSavedAtIso={lastSavedAtIso}
        hasUnsavedChanges={hasUnsavedChanges}
        entitiesCount={visibleEntities.length}
        movementsCount={visibleMovements.length}
        differencesCount={differencesCount}
        selectedMonth={selectedMonth}
        activeScope={activeScope}
      />

      {/* Close & Archive Month Modal (Administrators Only) */}
      <CloseMonthModal
        isOpen={isCloseMonthModalOpen && effectivePermissions.canCloseMonth}
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
        isOpen={isSheetsModalOpen && !effectivePermissions.isReadOnly}
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
