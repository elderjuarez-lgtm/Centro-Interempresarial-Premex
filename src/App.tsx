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
  LayoutDashboard,
  Grid3X3,
  AlertTriangle,
  ReceiptText,
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
  BankClosedReconciliation,
  BankSociety,
  BankStatementItem,
  BookLedgerItem,
  BankMatchGroup,
  SapBalanceRow,
  SapOpenItem,
  AccessControlPolicy,
  UserPermissionRecord,
  ViaticoConsultor,
  ViaticoEmailGroup,
  ViaticoLiquidation,
  ViaticosWorkspaceData,
  ActivitiesWorkspaceData,
  ActivitySociety,
  ActivityResponsible,
  ActivityTemplate,
  ActivityExecutionRecord,
  ActivityNotificationRecipient,
  FunctionalModuleId,
  ModuleCompaniesMap,
  ModuleCompanyEntry,
  StandaloneCompanyDbModuleId,
} from './types';
import {
  INITIAL_MOVEMENTS,
  INITIAL_COMMENTS,
  INTERCOMPANY_SCOPES,
  INTERCOMPANY_SCOPE_META,
  getInitialEntitiesForScope,
  getIntercompanyScopeLabel,
} from './utils/demoData';
import {
  INITIAL_BANK_SOCIETIES,
  INITIAL_BANK_ACCOUNTS,
  INITIAL_SAP_BALANCE_ROWS,
  INITIAL_SAP_OPEN_ITEMS,
  INITIAL_BANK_STATEMENT_ITEMS,
  INITIAL_BOOK_LEDGER_ITEMS,
  INITIAL_BANK_MATCHES,
} from './utils/bankDemoData';
import { buildMatrix, calculateDifferences, buildSymmetricMatrix } from './utils/reconciliation';
import { computeBankReconciliationSummary } from './utils/bankReconciliation';
import {
  INITIAL_VIATICO_CONSULTORES,
  INITIAL_VIATICO_LIQUIDACIONES,
  INITIAL_VIATICO_EMAIL_GROUPS,
  filterLiquidacionesByPermissions,
  formatViaticoAmount,
  resolveViaticosConsultantScope,
} from './utils/viaticos';
import {
  loadLocalOdooCatalogs,
  mergeOdooCatalogsWithDefaults,
  saveLocalOdooCatalogs,
} from './utils/viaticosOdooCatalogs';
import {
  DEFAULT_START_PERIOD,
  INITIAL_ACTIVITY_SOCIETIES,
  INITIAL_ACTIVITY_RESPONSIBLES,
  INITIAL_ACTIVITY_TEMPLATES,
  INITIAL_ACTIVITY_NOTIFICATION_RECIPIENTS,
  getCurrentPeriodKey,
  formatPeriodLabel,
  materializePeriodAssignments,
  filterActivitiesWorkspaceForUser,
  normalizeActivitySociety,
  normalizeActivityTemplate,
} from './utils/activities';
import {
  ALL_SUITE_MODULES,
  INITIAL_ACCESS_POLICY,
  INITIAL_USER_PERMISSIONS,
  ROLE_METADATA,
  SUPER_ADMIN_EMAIL,
  emailToPermissionDocId,
  ensureSuperAdminRecord,
  filterBankByPermissions,
  filterClosedBankReconciliationsByPermissions,
  filterIntercompanyByPermissions,
  normalizeCompanyKey,
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
import {
  auth,
  initAuth,
  googleSignIn,
  reconnectGoogleWorkspace,
  logout,
  unsubscribeAllFirestoreListeners,
} from './services/auth';
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
  DEFAULT_ACTIVITIES_DOC_ID,
  subscribeToActivitiesWorkspace,
  saveActivitiesWorkspaceToCloud,
} from './services/activitiesStore';
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
import { LoginGateView } from './components/LoginGateView';
import { BankModuleWorkspace, BankWorkspaceData } from './components/bank/BankModuleWorkspace';
import { ViaticosModuleWorkspace } from './components/viaticos/ViaticosModuleWorkspace';
import { ActivitiesModuleWorkspace } from './components/actividades/ActivitiesModuleWorkspace';
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
  SOCIETIES: 'premex_bancos_societies_v2',
  ACCOUNTS: 'premex_bancos_accounts_v2',
  SAP_OPEN_ITEMS: 'premex_bancos_sap_open_items_v2',
  SAP_BALANCE_ROWS: 'premex_bancos_sap_balance_rows_v2',
  STATEMENTS: 'premex_bancos_statements_v1',
  LEDGER: 'premex_bancos_ledger_v1',
  MATCHES: 'premex_bancos_matches_v1',
  SELECTED_ACCOUNT: 'premex_bancos_selected_account_v2',
  SELECTED_MONTH: 'premex_bancos_selected_month_v2',
  OPEN_PERIOD: 'premex_bancos_open_period_v2',
  CLOSED_RECONCILIATIONS: 'premex_bancos_closed_reconciliations_v2',
  DOC_ID: 'premex_bancos_doc_id_v1',
};
const VIATICOS_STORAGE_KEYS = {
  CONSULTORES: 'premex_viaticos_consultores_v1',
  LIQUIDACIONES: 'premex_viaticos_liquidaciones_v1',
  EMAIL_GROUPS: 'premex_viaticos_email_groups_v1',
  ACTIVE_ID: 'premex_viaticos_active_id_v1',
  DOC_ID: 'premex_viaticos_doc_id_v1',
};
const ACTIVITIES_STORAGE_KEYS = {
  DOC_ID: 'premex_actividades_doc_id_v1',
  PERIOD: 'premex_actividades_period_v1',
  SOCIETIES: 'premex_actividades_societies_v1',
  RESPONSIBLES: 'premex_actividades_responsibles_v1',
  TEMPLATES: 'premex_actividades_templates_v1',
  EXECUTIONS: 'premex_actividades_executions_v1',
  RECIPIENTS: 'premex_actividades_recipients_v1',
  SETTINGS: 'premex_actividades_settings_v1',
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
  anitox: {
    MOVEMENTS: 'centro_interempresarial_anitox_movimientos_v1',
    ENTITIES: 'centro_interempresarial_anitox_entidades_v1',
    COMMENTS: 'centro_interempresarial_anitox_comentarios_v1',
    CLOSED_MONTHS: 'centro_interempresarial_anitox_meses_cerrados_v1',
    DOC_ID: 'centro_interempresarial_doc_id_anitox_v1',
  },
};

const PENDING_DIRECTORY_SYNC_KEYS: Record<ReconciliationScope, string> = {
  internacionales: 'centro_interempresarial_pending_dir_internacionales_v1',
  nacionales: 'centro_interempresarial_pending_dir_nacionales_v1',
  anitox: 'centro_interempresarial_pending_dir_anitox_v1',
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
  const rawEntities = readJsonStorage<EntityMapping[]>(
    keys.ENTITIES,
    getInitialEntitiesForScope(scope)
  );
  const entities =
    Array.isArray(rawEntities) && rawEntities.length > 0
      ? rawEntities
      : getInitialEntitiesForScope(scope);
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
    if (raw === 'nacionales' || raw === 'internacionales' || raw === 'anitox') return raw;
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
  if (m === 'actividades') return 'actividades';
  if (m === 'ajustes') return 'ajustes';
  return 'launcher';
}

function deriveSocietiesFromAccounts(accounts: BankAccount[]): BankSociety[] {
  const map = new Map<string, BankSociety>();
  accounts.forEach((a, idx) => {
    const code = (a.codigoSociedad || `${(idx + 1) * 1000}`).trim().toUpperCase();
    const key = a.codigoSociedad ? code : a.sociedad.trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        id: `soc-auto-${code}`,
        codigoSociedad: code,
        nombre: a.sociedad,
        pais: a.pais || 'Colombia',
        moneda: a.moneda || 'COP',
        activa: true,
      });
    }
  });
  return Array.from(map.values());
}

function loadInitialBankWorkspace(): BankWorkspaceData {
  const accounts = readJsonStorage<BankAccount[]>(
    BANK_STORAGE_KEYS.ACCOUNTS,
    INITIAL_BANK_ACCOUNTS
  );
  const rawSocieties = readJsonStorage<BankSociety[]>(
    BANK_STORAGE_KEYS.SOCIETIES,
    INITIAL_BANK_SOCIETIES
  );
  const societies =
    Array.isArray(rawSocieties) && rawSocieties.length > 0
      ? rawSocieties
      : deriveSocietiesFromAccounts(accounts);
  const sapOpenItems = readJsonStorage<SapOpenItem[]>(
    BANK_STORAGE_KEYS.SAP_OPEN_ITEMS,
    INITIAL_SAP_OPEN_ITEMS
  );
  const sapBalanceRows = readJsonStorage<SapBalanceRow[]>(
    BANK_STORAGE_KEYS.SAP_BALANCE_ROWS,
    INITIAL_SAP_BALANCE_ROWS
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

  const closedReconciliations = readJsonStorage<BankClosedReconciliation[]>(
    BANK_STORAGE_KEYS.CLOSED_RECONCILIATIONS,
    []
  );

  const firstMonth =
    sapOpenItems[0]?.mes ||
    sapBalanceRows[0]?.mes ||
    (accounts[0]?.saldosPorMes ? Object.keys(accounts[0].saldosPorMes)[0] : '') ||
    statementItems[0]?.mes ||
    'Octubre 2026';

  const savedSelectedMonth = (() => {
    try {
      const m = localStorage.getItem(BANK_STORAGE_KEYS.SELECTED_MONTH);
      if (m && m.trim() && m !== 'ALL') return m.trim();
    } catch {
      // ignore
    }
    return firstMonth;
  })();

  const savedOpenPeriod: string | null = (() => {
    try {
      const raw = localStorage.getItem(BANK_STORAGE_KEYS.OPEN_PERIOD);
      if (raw === '__NONE__') return null;
      if (raw && raw.trim()) return raw.trim();
    } catch {
      // ignore
    }
    const alreadyClosed = closedReconciliations.some(
      (c) => c.period.trim().toLowerCase() === savedSelectedMonth.trim().toLowerCase()
    );
    return alreadyClosed ? null : savedSelectedMonth;
  })();

  return {
    docId: savedDocId,
    societies,
    accounts,
    sapOpenItems,
    sapBalanceRows,
    statementItems,
    ledgerItems,
    matches,
    selectedAccountId: savedAccId,
    selectedMonth: savedOpenPeriod || savedSelectedMonth,
    openPeriod: savedOpenPeriod,
    closedReconciliations: Array.isArray(closedReconciliations) ? closedReconciliations : [],
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
  const emailGroups = readJsonStorage<ViaticoEmailGroup[]>(
    VIATICOS_STORAGE_KEYS.EMAIL_GROUPS,
    INITIAL_VIATICO_EMAIL_GROUPS
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

  const odooCatalogs = loadLocalOdooCatalogs();
  return {
    docId: savedDocId,
    consultores: consultores.length > 0 ? consultores : INITIAL_VIATICO_CONSULTORES,
    liquidaciones,
    emailGroups:
      Array.isArray(emailGroups) && emailGroups.length > 0
        ? emailGroups
        : INITIAL_VIATICO_EMAIL_GROUPS,
    odooCatalogs,
    activeLiquidationId: savedActiveId,
    lastSavedAtIso: null,
    hasUnsavedChanges: false,
  };
}

function loadInitialActivitiesWorkspace(): ActivitiesWorkspaceData {
  const savedDocId = (() => {
    try {
      const raw = localStorage.getItem(ACTIVITIES_STORAGE_KEYS.DOC_ID);
      if (raw && /^[a-zA-Z0-9_-]{1,128}$/.test(raw)) return raw;
    } catch {
      // ignore
    }
    return DEFAULT_ACTIVITIES_DOC_ID;
  })();

  const savedPeriod = (() => {
    try {
      const raw = localStorage.getItem(ACTIVITIES_STORAGE_KEYS.PERIOD);
      if (raw && /^\d{4}-\d{2}$/.test(raw) && raw >= DEFAULT_START_PERIOD) return raw;
    } catch {
      // ignore
    }
    return DEFAULT_START_PERIOD;
  })();

  const rawSocieties = readJsonStorage<ActivitySociety[]>(
    ACTIVITIES_STORAGE_KEYS.SOCIETIES,
    INITIAL_ACTIVITY_SOCIETIES
  );
  const societies =
    Array.isArray(rawSocieties) && rawSocieties.length > 0
      ? rawSocieties.map(normalizeActivitySociety)
      : INITIAL_ACTIVITY_SOCIETIES;
  const responsibles = readJsonStorage<ActivityResponsible[]>(
    ACTIVITIES_STORAGE_KEYS.RESPONSIBLES,
    INITIAL_ACTIVITY_RESPONSIBLES
  );
  const rawActivities = readJsonStorage<ActivityTemplate[]>(
    ACTIVITIES_STORAGE_KEYS.TEMPLATES,
    INITIAL_ACTIVITY_TEMPLATES
  );
  const activities =
    Array.isArray(rawActivities) && rawActivities.length > 0
      ? rawActivities.map(normalizeActivityTemplate)
      : INITIAL_ACTIVITY_TEMPLATES;
  const executions = readJsonStorage<Record<string, ActivityExecutionRecord>>(
    ACTIVITIES_STORAGE_KEYS.EXECUTIONS,
    {}
  );
  const notificationRecipients = readJsonStorage<ActivityNotificationRecipient[]>(
    ACTIVITIES_STORAGE_KEYS.RECIPIENTS,
    INITIAL_ACTIVITY_NOTIFICATION_RECIPIENTS
  );
  const settings = readJsonStorage<{
    notifyAdminsAutomatically?: boolean;
    subtleReminderDaysBefore?: number;
    lastGoogleTasksSyncIso?: string | null;
  }>(ACTIVITIES_STORAGE_KEYS.SETTINGS, {});

  return {
    docId: savedDocId,
    selectedPeriod: savedPeriod,
    societies,
    responsibles: responsibles.length > 0 ? responsibles : INITIAL_ACTIVITY_RESPONSIBLES,
    activities,
    executions: executions && typeof executions === 'object' ? executions : {},
    notificationRecipients: Array.isArray(notificationRecipients)
      ? notificationRecipients
      : INITIAL_ACTIVITY_NOTIFICATION_RECIPIENTS,
    notifyAdminsAutomatically: false,
    subtleReminderDaysBefore:
      typeof settings.subtleReminderDaysBefore === 'number'
        ? settings.subtleReminderDaysBefore
        : 3,
    lastGoogleTasksSyncIso: settings.lastGoogleTasksSyncIso || null,
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
  const [activeScope, setActiveScope] = useState<ReconciliationScope>(
    () => initialLaunch.scope
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>('inicio');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isCloseMonthModalOpen, setIsCloseMonthModalOpen] = useState(false);
  const [movimientosPreset, setMovimientosPreset] = useState<MovimientosNavigationPreset | null>(null);
  const [copiedBannerLink, setCopiedBannerLink] = useState<boolean>(false);

  // Auth state & mandatory login gate lifecycle
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

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
  const [ownPermState, setOwnPermState] = useState<'idle' | 'loading' | 'cloud' | 'fallback'>(
    'idle'
  );
  const [policyLoaded, setPolicyLoaded] = useState<boolean>(false);
  const [previewEmail, setPreviewEmail] = useState<string | null>(null);
  const [lastPermSyncIso, setLastPermSyncIso] = useState<string | null>(null);
  const [hasPendingPermSync, setHasPendingPermSync] = useState<boolean>(false);

  const isVerifiedUser = Boolean(
    currentUser?.uid && currentUser?.email && currentUser?.emailVerified
  );
  const realUserEmail =
    isVerifiedUser && currentUser?.email ? normalizeEmail(currentUser.email) : null;

  const permissionsResolved = Boolean(
    isVerifiedUser &&
      policyLoaded &&
      (ownPermState === 'cloud' || ownPermState === 'fallback')
  );

  const realIsAdmin = useMemo(() => {
    if (!isVerifiedUser || !realUserEmail) return false;
    if (realUserEmail === SUPER_ADMIN_EMAIL) return true;
    const matched =
      ownPermState === 'cloud'
        ? ownPermissionDoc
        : ownPermissionDoc ||
          permissionRecords.find((r) => normalizeEmail(r.email) === realUserEmail) ||
          null;
    return Boolean(matched && matched.active && matched.role === 'admin');
  }, [isVerifiedUser, realUserEmail, ownPermState, ownPermissionDoc, permissionRecords]);

  const effectivePermissions = useMemo(
    () =>
      resolveEffectivePermissions({
        currentUser,
        permissionsList: permissionRecords,
        ownPermissionDoc,
        ownPermissionResolved: ownPermState === 'cloud',
        policy: accessPolicy,
        previewEmail: realIsAdmin ? previewEmail : null,
      }),
    [
      currentUser,
      permissionRecords,
      ownPermissionDoc,
      ownPermState,
      accessPolicy,
      realIsAdmin,
      previewEmail,
    ]
  );

  const canLoadCloudData = Boolean(
    isVerifiedUser && permissionsResolved && effectivePermissions.isAuthorized
  );
  const canAccessIntercompany = effectivePermissions.canAccessModule('intercompany');
  const canAccessBancos = effectivePermissions.canAccessModule('bancos');
  const canAccessViaticos = effectivePermissions.canAccessModule('viaticos');
  const canAccessActividades = effectivePermissions.canAccessModule('actividades');

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
  const viaticosWorkspaceRef = useRef<ViaticosWorkspaceData>(viaticosWorkspace);
  viaticosWorkspaceRef.current = viaticosWorkspace;
  const viaticosUnsavedRef = useRef<boolean>(false);
  viaticosUnsavedRef.current = viaticosWorkspace.hasUnsavedChanges;
  const viaticosMutationSeqRef = useRef<number>(0);
  const viaticosSyncInFlightRef = useRef<boolean>(false);

  // Panel de Actividades module workspace state
  const [activitiesWorkspace, setActivitiesWorkspace] = useState<ActivitiesWorkspaceData>(() =>
    loadInitialActivitiesWorkspace()
  );
  const [isSavingActivitiesCloud, setIsSavingActivitiesCloud] = useState<boolean>(false);
  const activitiesWorkspaceRef = useRef<ActivitiesWorkspaceData>(activitiesWorkspace);
  activitiesWorkspaceRef.current = activitiesWorkspace;
  const activitiesUnsavedRef = useRef<boolean>(false);
  activitiesUnsavedRef.current = activitiesWorkspace.hasUnsavedChanges;

  // Independent per-module company databases (bancos, viaticos, actividades, anticipos, cxc, cxp)
  // Intercompany uses /company_directories/internacionales as its single source of truth.
  const [standaloneModuleCompanies, setStandaloneModuleCompanies] = useState<
    Record<StandaloneCompanyDbModuleId, ModuleCompanyEntry[]>
  >(() => loadInitialStandaloneModuleCompanies());
  const standaloneModuleCompaniesRef = useRef(standaloneModuleCompanies);
  standaloneModuleCompaniesRef.current = standaloneModuleCompanies;

  const pendingStandaloneDbSyncRef = useRef<Record<StandaloneCompanyDbModuleId, boolean>>({
    bancos: false,
    viaticos: false,
    actividades: false,
    clara: false,
    anticipos: false,
    cxc: false,
    cxp: false,
  });

  const [standaloneDbSyncStatus, setStandaloneDbSyncStatus] = useState<
    Record<StandaloneCompanyDbModuleId, ModuleDbSyncState>
  >({
    bancos: { status: 'idle' },
    viaticos: { status: 'idle' },
    actividades: { status: 'idle' },
    clara: { status: 'idle' },
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
          : nextModule === 'intercompany' && activeScope !== 'internacionales'
          ? `${window.location.pathname}?m=intercompany&s=${activeScope}`
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

    // Ensure the currently signed-in verified admin is present in records before publishing access_control
    let recordsToSync = ensureSuperAdminRecord(permissionRecords);
    if (currentUser?.email) {
      const signedEmail = normalizeEmail(currentUser.email);
      const alreadyListed = recordsToSync.some(
        (r) => normalizeEmail(r.email) === signedEmail
      );
      if (!alreadyListed) {
        recordsToSync = ensureSuperAdminRecord([
          ...recordsToSync,
          {
            id: emailToPermissionDocId(signedEmail),
            email: signedEmail,
            displayName:
              currentUser.displayName || signedEmail.split('@')[0] || 'Administrador',
            role: 'admin',
            allowedModules: [...ALL_SUITE_MODULES],
            companyScope: 'all',
            allowedCompanies: [],
            moduleCompanyAccess: {},
            active: true,
            notes: 'Administrador registrado automáticamente al publicar configuración.',
          },
        ]);
        setPermissionRecords(recordsToSync);
      }
    }

    const res = await saveUserPermissionAndRegistryToCloud({
      allRecords: recordsToSync,
      policy: accessPolicy,
    });
    setLastPermSyncIso(res.updatedAtIso);
    setHasPendingPermSync(false);

    // Publish all 3 Intercompany company catalogs (Internacionales, Nacionales, Anitox)
    for (const scope of INTERCOMPANY_SCOPES) {
      await syncDirectoryToCloud(scope, workspacesRef.current[scope].entities, true);
    }

    // Publish all 5 standalone module company DBs
    for (const modId of STANDALONE_COMPANY_DB_MODULES) {
      await handleSaveModuleCompanies(modId, standaloneModuleCompaniesRef.current[modId]);
    }
  };

  const handleSaveIntercompanyScopeCompanies = async (
    targetScope: ReconciliationScope,
    nextCompanies: ModuleCompanyEntry[]
  ) => {
    if (!realIsAdmin) {
      throw new Error(
        'Solo los administradores pueden modificar las bases de datos de sociedades.'
      );
    }
    const mergedEntities = mergeModuleCompanyEntriesToEntities(
      nextCompanies,
      workspacesRef.current[targetScope].entities
    );
    workspacesRef.current = {
      ...workspacesRef.current,
      [targetScope]: {
        ...workspacesRef.current[targetScope],
        entities: mergedEntities,
      },
    };
    updateScopeWorkspace(
      targetScope,
      (prev) => ({
        ...prev,
        entities: mergedEntities,
      }),
      false
    );
    await syncDirectoryToCloud(targetScope, mergedEntities, true);
  };

  const handleSaveModuleCompanies = async (
    moduleId: FunctionalModuleId,
    nextCompanies: ModuleCompanyEntry[]
  ) => {
    const canManageViaticosSocieties =
      moduleId === 'viaticos' &&
      effectivePermissions.canOperate &&
      effectivePermissions.canAccessViaticosPanel('sociedades');
    if (!realIsAdmin && !canManageViaticosSocieties) {
      throw new Error(
        'No tienes permisos para modificar el catálogo de sociedades.'
      );
    }

    if (moduleId === 'intercompany') {
      await handleSaveIntercompanyScopeCompanies(activeScope, nextCompanies);
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
    if (markUnsaved) {
      viaticosMutationSeqRef.current += 1;
    }
    setViaticosWorkspace((prev) => {
      const next = updater(prev);
      const nextState: ViaticosWorkspaceData = {
        ...next,
        hasUnsavedChanges: markUnsaved ? true : next.hasUnsavedChanges,
      };
      viaticosWorkspaceRef.current = nextState;
      return nextState;
    });
  };

  const handleUpdateActivitiesWorkspace = (
    updater: (prev: ActivitiesWorkspaceData) => ActivitiesWorkspaceData
  ) => {
    setActivitiesWorkspace((prev) => {
      const candidate = updater(prev);
      const safeNext: ActivitiesWorkspaceData = effectivePermissions.isAdmin
        ? candidate
        : {
            ...prev,
            selectedPeriod: candidate.selectedPeriod,
            executions: candidate.executions,
            lastGoogleTasksSyncIso: candidate.lastGoogleTasksSyncIso,
          };

      const onlyPeriodChanged =
        safeNext.selectedPeriod !== prev.selectedPeriod &&
        safeNext.societies === prev.societies &&
        safeNext.responsibles === prev.responsibles &&
        safeNext.activities === prev.activities &&
        safeNext.executions === prev.executions &&
        safeNext.notificationRecipients === prev.notificationRecipients &&
        safeNext.notifyAdminsAutomatically === prev.notifyAdminsAutomatically &&
        safeNext.subtleReminderDaysBefore === prev.subtleReminderDaysBefore;

      if (!onlyPeriodChanged && !effectivePermissions.canOperate) {
        return prev;
      }

      const nextState: ActivitiesWorkspaceData = {
        ...safeNext,
        hasUnsavedChanges: onlyPeriodChanged ? prev.hasUnsavedChanges : true,
      };
      activitiesWorkspaceRef.current = nextState;
      return nextState;
    });
  };

  // Three independent Intercompany scopes: Internacionales, Nacionales, and Anitox
  const [workspaces, setWorkspaces] = useState<Record<ReconciliationScope, ScopeWorkspaceState>>(() => {
    const intlWs = loadInitialWorkspace(
      'internacionales',
      initialLaunch.scope === 'internacionales' ? initialLaunch.docIdFromUrl : null
    );
    const nacWs = loadInitialWorkspace(
      'nacionales',
      initialLaunch.scope === 'nacionales' ? initialLaunch.docIdFromUrl : null
    );
    const anitoxWs = loadInitialWorkspace(
      'anitox',
      initialLaunch.scope === 'anitox' ? initialLaunch.docIdFromUrl : null
    );
    return {
      internacionales: intlWs,
      nacionales: nacWs,
      anitox: anitoxWs,
    };
  });

  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;

  const hasUnsavedRef = useRef<Record<ReconciliationScope, boolean>>({
    internacionales: false,
    nacionales: false,
    anitox: false,
  });
  const isHydratingRef = useRef<Record<ReconciliationScope, boolean>>({
    internacionales: false,
    nacionales: false,
    anitox: false,
  });
  const hasIndependentDirectoryRef = useRef<Record<ReconciliationScope, boolean>>({
    internacionales: false,
    nacionales: false,
    anitox: false,
  });
  const pendingDirectorySyncRef = useRef<Record<ReconciliationScope, boolean>>({
    internacionales: readPendingDirSync('internacionales'),
    nacionales: readPendingDirSync('nacionales'),
    anitox: readPendingDirSync('anitox'),
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
    anitox: {
      status: readPendingDirSync('anitox') ? 'pending' : 'idle',
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

  // Persist all 3 Intercompany scopes (Internacionales, Nacionales, Anitox) to localStorage
  useEffect(() => {
    INTERCOMPANY_SCOPES.forEach((scope) => {
      const ws = workspaces[scope];
      const keys = STORAGE_KEYS_BY_SCOPE[scope];
      try {
        localStorage.setItem(keys.MOVEMENTS, JSON.stringify(ws.movements));
        localStorage.setItem(keys.ENTITIES, JSON.stringify(ws.entities));
        localStorage.setItem(keys.COMMENTS, JSON.stringify(ws.comments));
        localStorage.setItem(keys.CLOSED_MONTHS, JSON.stringify(ws.closedMonths));
        localStorage.setItem(keys.DOC_ID, ws.docId);
      } catch (e) {
        console.warn(`Failed to save ${scope} workspace:`, e);
      }
    });
  }, [workspaces.internacionales, workspaces.nacionales, workspaces.anitox]);

  // Persist Bank Reconciliation workspace to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(BANK_STORAGE_KEYS.SOCIETIES, JSON.stringify(bankWorkspace.societies));
      localStorage.setItem(BANK_STORAGE_KEYS.ACCOUNTS, JSON.stringify(bankWorkspace.accounts));
      localStorage.setItem(
        BANK_STORAGE_KEYS.SAP_OPEN_ITEMS,
        JSON.stringify(bankWorkspace.sapOpenItems)
      );
      localStorage.setItem(
        BANK_STORAGE_KEYS.SAP_BALANCE_ROWS,
        JSON.stringify(bankWorkspace.sapBalanceRows)
      );
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
      localStorage.setItem(
        BANK_STORAGE_KEYS.SELECTED_MONTH,
        bankWorkspace.selectedMonth
      );
      localStorage.setItem(
        BANK_STORAGE_KEYS.OPEN_PERIOD,
        bankWorkspace.openPeriod ? bankWorkspace.openPeriod : '__NONE__'
      );
      localStorage.setItem(
        BANK_STORAGE_KEYS.CLOSED_RECONCILIATIONS,
        JSON.stringify(bankWorkspace.closedReconciliations)
      );
      localStorage.setItem(BANK_STORAGE_KEYS.DOC_ID, bankWorkspace.docId);
    } catch (e) {
      console.warn('Failed to save Bank workspace:', e);
    }
  }, [bankWorkspace]);

  // Subscribe to Bank Reconciliation cloud document ONLY when authenticated & authorized for Bancos
  useEffect(() => {
    if (!canLoadCloudData || !canAccessBancos) return;
    const unsubscribe = subscribeToBankReconciliation(
      bankWorkspace.docId,
      (savedDoc) => {
        if (!savedDoc) return;
        if (bankUnsavedRef.current) return;
        setBankWorkspace((prev) => {
          const nextAccounts = savedDoc.accounts.length > 0 ? savedDoc.accounts : prev.accounts;
          const nextSocieties =
            savedDoc.societies && savedDoc.societies.length > 0
              ? savedDoc.societies
              : prev.societies.length > 0
              ? prev.societies
              : deriveSocietiesFromAccounts(nextAccounts);
          const hasSapPayload =
            (savedDoc.societies && savedDoc.societies.length > 0) ||
            (savedDoc.sapOpenItems && savedDoc.sapOpenItems.length > 0) ||
            (savedDoc.sapBalanceRows && savedDoc.sapBalanceRows.length > 0);
          const nextClosed =
            savedDoc.closedReconciliations && savedDoc.closedReconciliations.length > 0
              ? savedDoc.closedReconciliations
              : savedDoc.openPeriod !== undefined
              ? savedDoc.closedReconciliations || []
              : prev.closedReconciliations;
          const nextMonth =
            savedDoc.selectedMonth && savedDoc.selectedMonth !== 'ALL'
              ? savedDoc.selectedMonth
              : prev.selectedMonth;
          const nextOpenPeriod =
            savedDoc.openPeriod !== undefined
              ? savedDoc.openPeriod
              : nextClosed.some(
                  (c) => c.period.trim().toLowerCase() === nextMonth.trim().toLowerCase()
                )
              ? null
              : nextMonth;
          return {
            ...prev,
            societies: nextSocieties,
            accounts: nextAccounts,
            sapOpenItems: hasSapPayload ? savedDoc.sapOpenItems || [] : prev.sapOpenItems,
            sapBalanceRows: hasSapPayload ? savedDoc.sapBalanceRows || [] : prev.sapBalanceRows,
            statementItems: savedDoc.statementItems,
            ledgerItems: savedDoc.ledgerItems,
            matches: savedDoc.matches,
            selectedMonth: nextMonth,
            openPeriod: nextOpenPeriod,
            closedReconciliations: nextClosed,
            selectedAccountId:
              savedDoc.selectedAccountId &&
              nextAccounts.some((a) => a.id === savedDoc.selectedAccountId)
                ? savedDoc.selectedAccountId
                : nextAccounts[0]?.id || prev.selectedAccountId,
            lastSavedAtIso: savedDoc.updatedAtIso || new Date().toISOString(),
            hasUnsavedChanges: false,
          };
        });
      },
      (err) => {
        console.warn('Error loading cloud bank reconciliation:', err);
      }
    );
    return () => {
      unsubscribe();
    };
  }, [bankWorkspace.docId, canLoadCloudData, canAccessBancos]);

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
        VIATICOS_STORAGE_KEYS.EMAIL_GROUPS,
        JSON.stringify(viaticosWorkspace.emailGroups || INITIAL_VIATICO_EMAIL_GROUPS)
      );
      if (viaticosWorkspace.odooCatalogs) {
        saveLocalOdooCatalogs(
          mergeOdooCatalogsWithDefaults(viaticosWorkspace.odooCatalogs)
        );
      }
      localStorage.setItem(
        VIATICOS_STORAGE_KEYS.ACTIVE_ID,
        viaticosWorkspace.activeLiquidationId
      );
      localStorage.setItem(VIATICOS_STORAGE_KEYS.DOC_ID, viaticosWorkspace.docId);
    } catch (e) {
      console.warn('Failed to save Viáticos workspace locally:', e);
    }
  }, [viaticosWorkspace]);

  // Subscribe to Viáticos cloud document ONLY when authenticated & authorized (primitive deps prevent duplicate Target IDs)
  useEffect(() => {
    if (!canLoadCloudData || !canAccessViaticos) {
      return;
    }
    const unsubscribe = subscribeToViaticosWorkspace(
      viaticosWorkspace.docId,
      (savedDoc) => {
        if (!savedDoc) return;
        if (viaticosUnsavedRef.current || viaticosSyncInFlightRef.current) return;
        setViaticosWorkspace((prev) => ({
          ...prev,
          consultores:
            savedDoc.consultores.length > 0 ? savedDoc.consultores : prev.consultores,
          liquidaciones:
            savedDoc.liquidaciones.length > 0
              ? savedDoc.liquidaciones
              : prev.liquidaciones,
          emailGroups:
            savedDoc.emailGroups && savedDoc.emailGroups.length > 0
              ? savedDoc.emailGroups
              : prev.emailGroups || INITIAL_VIATICO_EMAIL_GROUPS,
          odooCatalogs: savedDoc.odooCatalogs
            ? mergeOdooCatalogsWithDefaults(savedDoc.odooCatalogs)
            : prev.odooCatalogs || loadLocalOdooCatalogs(),
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
  }, [viaticosWorkspace.docId, canLoadCloudData, canAccessViaticos]);

  // Persist Panel de Actividades workspace locally
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVITIES_STORAGE_KEYS.DOC_ID, activitiesWorkspace.docId);
      localStorage.setItem(ACTIVITIES_STORAGE_KEYS.PERIOD, activitiesWorkspace.selectedPeriod);
      localStorage.setItem(
        ACTIVITIES_STORAGE_KEYS.SOCIETIES,
        JSON.stringify(activitiesWorkspace.societies)
      );
      localStorage.setItem(
        ACTIVITIES_STORAGE_KEYS.RESPONSIBLES,
        JSON.stringify(activitiesWorkspace.responsibles)
      );
      localStorage.setItem(
        ACTIVITIES_STORAGE_KEYS.TEMPLATES,
        JSON.stringify(activitiesWorkspace.activities)
      );
      localStorage.setItem(
        ACTIVITIES_STORAGE_KEYS.EXECUTIONS,
        JSON.stringify(activitiesWorkspace.executions)
      );
      localStorage.setItem(
        ACTIVITIES_STORAGE_KEYS.RECIPIENTS,
        JSON.stringify(activitiesWorkspace.notificationRecipients)
      );
      localStorage.setItem(
        ACTIVITIES_STORAGE_KEYS.SETTINGS,
        JSON.stringify({
          notifyAdminsAutomatically: activitiesWorkspace.notifyAdminsAutomatically,
          subtleReminderDaysBefore: activitiesWorkspace.subtleReminderDaysBefore,
          lastGoogleTasksSyncIso: activitiesWorkspace.lastGoogleTasksSyncIso,
        })
      );
    } catch (e) {
      console.warn('Failed to save Panel de Actividades locally:', e);
    }
  }, [activitiesWorkspace]);

  // Subscribe to Panel de Actividades cloud document ONLY when authenticated & authorized
  useEffect(() => {
    if (!canLoadCloudData || !canAccessActividades) {
      return;
    }
    const unsubscribe = subscribeToActivitiesWorkspace(
      activitiesWorkspace.docId,
      (savedDoc) => {
        if (!savedDoc) return;
        if (activitiesUnsavedRef.current) return;
        setActivitiesWorkspace((prev) => {
          const normalizedPeriod =
            savedDoc.selectedPeriod && savedDoc.selectedPeriod >= DEFAULT_START_PERIOD
              ? savedDoc.selectedPeriod
              : prev.selectedPeriod >= DEFAULT_START_PERIOD
              ? prev.selectedPeriod
              : DEFAULT_START_PERIOD;
          return {
            ...prev,
            selectedPeriod: normalizedPeriod,
            societies: savedDoc.societies.length > 0 ? savedDoc.societies : prev.societies,
            responsibles:
              savedDoc.responsibles.length > 0 ? savedDoc.responsibles : prev.responsibles,
            activities: savedDoc.activities.length > 0 ? savedDoc.activities : prev.activities,
            executions: savedDoc.executions || prev.executions,
            notificationRecipients: Array.isArray(savedDoc.notificationRecipients)
              ? savedDoc.notificationRecipients
              : prev.notificationRecipients,
            notifyAdminsAutomatically: false,
            subtleReminderDaysBefore: savedDoc.subtleReminderDaysBefore,
            lastSavedAtIso: savedDoc.updatedAtIso || new Date().toISOString(),
            hasUnsavedChanges: false,
          };
        });
      },
      (err) => {
        console.warn('Error loading cloud Panel de Actividades:', err);
      }
    );
    return () => {
      unsubscribe();
    };
  }, [activitiesWorkspace.docId, canLoadCloudData, canAccessActividades]);

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
    if (!currentUser?.uid || !currentUser?.email || !currentUser?.emailVerified) {
      setOwnPermissionDoc(null);
      setOwnPermState('idle');
      setPolicyLoaded(false);
      return;
    }

    let isActive = true;
    setOwnPermissionDoc(null);
    setOwnPermState('loading');
    setPolicyLoaded(false);

    // Safety fallback so slow/offline networks never keep the user stuck on the loading gate
    const fallbackTimer = setTimeout(() => {
      if (!isActive) return;
      setOwnPermState((prev) => (prev === 'loading' ? 'fallback' : prev));
      setPolicyLoaded(true);
    }, 4500);

    const unsubOwn = subscribeToOwnUserPermission(
      currentUser.email,
      (rec) => {
        if (!isActive) return;
        setOwnPermissionDoc(rec);
      },
      (fromCloud) => {
        if (!isActive) return;
        setOwnPermState((prev) =>
          prev === 'cloud' ? 'cloud' : fromCloud ? 'cloud' : 'fallback'
        );
      }
    );
    const unsubPolicy = subscribeToAccessPolicy(
      (pol) => {
        if (!isActive) return;
        setAccessPolicy(pol);
      },
      () => {
        if (!isActive) return;
        setPolicyLoaded(true);
      }
    );

    return () => {
      isActive = false;
      clearTimeout(fallbackTimer);
      unsubOwn();
      unsubPolicy();
    };
  }, [currentUser?.uid, currentUser?.email, currentUser?.emailVerified]);

  // Subscribe to consolidated admin RBAC directory ONLY for verified Admins
  useEffect(() => {
    if (!isVerifiedUser || !permissionsResolved || !realIsAdmin) return;
    const unsubAdmin = subscribeToAdminAccessRegistry((cloudRecords) => {
      if (cloudRecords.length > 0) {
        setPermissionRecords(ensureSuperAdminRecord(cloudRecords));
        setHasPendingPermSync(false);
      }
    });
    return () => unsubAdmin();
  }, [isVerifiedUser, permissionsResolved, realIsAdmin]);

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

  // Subscribe to independent per-module company DBs in Firestore ONLY when verified & authorized
  useEffect(() => {
    if (!canLoadCloudData) return;
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
  }, [canLoadCloudData]);

  // Flush any pending local standalone module company DB changes once verified Admin signs in
  useEffect(() => {
    if (!isVerifiedUser || !permissionsResolved || !realIsAdmin) return;
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
  }, [isVerifiedUser, permissionsResolved, realIsAdmin]);

  // Clear preview if signed-in account is not an Admin
  useEffect(() => {
    if (currentUser && !realIsAdmin && previewEmail) {
      setPreviewEmail(null);
    }
  }, [currentUser, realIsAdmin, previewEmail]);

  // Enforce module & tab access guards automatically AFTER auth & permissions resolve
  // (preserves incoming deep links such as ?m=bancos during sign-in, and redirects if unauthorized)
  useEffect(() => {
    if (!authReady || !canLoadCloudData) return;
    if (activeModule !== 'launcher' && !effectivePermissions.canAccessModule(activeModule)) {
      setActiveModule('launcher');
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  }, [authReady, canLoadCloudData, activeModule, effectivePermissions]);

  useEffect(() => {
    if (effectivePermissions.isReadOnly && activeTab === 'carga') {
      setActiveTab('inicio');
    }
  }, [effectivePermissions.isReadOnly, activeTab]);

  const handleSaveBankToCloud = async (overrideData?: BankWorkspaceData) => {
    if (!effectivePermissions.canOperate) {
      throw new Error(
        'Tu perfil tiene permisos de Solo Consulta y no puede guardar cambios en la nube.'
      );
    }
    const source = overrideData || bankWorkspace;
    const result = await saveBankReconciliationToCloud({
      targetId: source.docId,
      title: `Conciliación Bancaria Premex - ${source.selectedMonth}`,
      selectedMonth: source.selectedMonth,
      selectedAccountId: source.selectedAccountId,
      openPeriod: source.openPeriod,
      closedReconciliations: source.closedReconciliations,
      societies: source.societies,
      accounts: source.accounts,
      sapOpenItems: source.sapOpenItems,
      sapBalanceRows: source.sapBalanceRows,
      statementItems: source.statementItems,
      ledgerItems: source.ledgerItems,
      matches: source.matches,
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
    const seqAtStart = viaticosMutationSeqRef.current;
    const source = overrideData || viaticosWorkspaceRef.current;
    viaticosSyncInFlightRef.current = true;
    try {
      const result = await saveViaticosWorkspaceToCloud({
        targetId: source.docId,
        title: 'Liquidación de Viáticos Premex',
        activeLiquidationId: source.activeLiquidationId,
        consultores: source.consultores,
        liquidaciones: source.liquidaciones,
        emailGroups: source.emailGroups || INITIAL_VIATICO_EMAIL_GROUPS,
        odooCatalogs: source.odooCatalogs,
      });
      setViaticosWorkspace((prev) => {
        const hasNewerMutations = viaticosMutationSeqRef.current !== seqAtStart;
        const nextState: ViaticosWorkspaceData = {
          ...prev,
          docId: result.id,
          lastSavedAtIso: result.updatedAtIso,
          hasUnsavedChanges: hasNewerMutations ? prev.hasUnsavedChanges : false,
        };
        viaticosWorkspaceRef.current = nextState;
        return nextState;
      });
    } finally {
      viaticosSyncInFlightRef.current = false;
    }
  };

  const handleSaveActivitiesToCloud = async (patch?: {
    executionPatches?: Record<string, ActivityExecutionRecord>;
    lastGoogleTasksSyncIso?: string;
    overrideWorkspace?: ActivitiesWorkspaceData;
  }) => {
    if (!effectivePermissions.canOperate) {
      throw new Error(
        'Tu perfil tiene permisos de Solo Consulta y no puede guardar cambios en la nube.'
      );
    }
    const base = patch?.overrideWorkspace || activitiesWorkspaceRef.current;
    const mergedExecutions = patch?.executionPatches
      ? { ...base.executions, ...patch.executionPatches }
      : base.executions;

    setIsSavingActivitiesCloud(true);
    try {
      const result = await saveActivitiesWorkspaceToCloud({
        targetId: base.docId,
        title: `Panel de Actividades Premex - ${formatPeriodLabel(base.selectedPeriod)}`,
        selectedPeriod: base.selectedPeriod,
        societies: base.societies,
        responsibles: base.responsibles,
        activities: base.activities,
        executions: mergedExecutions,
        notificationRecipients: base.notificationRecipients,
        notifyAdminsAutomatically: false,
        subtleReminderDaysBefore: base.subtleReminderDaysBefore,
      });
      setActivitiesWorkspace((prev) => {
        const nextBase = patch?.overrideWorkspace ? patch.overrideWorkspace : prev;
        const nextState: ActivitiesWorkspaceData = {
          ...nextBase,
          docId: result.id,
          executions: patch?.executionPatches
            ? { ...nextBase.executions, ...patch.executionPatches }
            : nextBase.executions,
          lastGoogleTasksSyncIso: patch?.lastGoogleTasksSyncIso ?? nextBase.lastGoogleTasksSyncIso,
          lastSavedAtIso: result.updatedAtIso,
          hasUnsavedChanges: false,
        };
        activitiesWorkspaceRef.current = nextState;
        return nextState;
      });
    } finally {
      setIsSavingActivitiesCloud(false);
    }
  };

  // Keep unsaved refs in sync per scope
  useEffect(() => {
    hasUnsavedRef.current.internacionales = workspaces.internacionales.hasUnsavedChanges;
    hasUnsavedRef.current.nacionales = workspaces.nacionales.hasUnsavedChanges;
    hasUnsavedRef.current.anitox = workspaces.anitox.hasUnsavedChanges;
  }, [
    workspaces.internacionales.hasUnsavedChanges,
    workspaces.nacionales.hasUnsavedChanges,
    workspaces.anitox.hasUnsavedChanges,
  ]);

  const syncDirectoryToCloud = async (
    targetScope: ReconciliationScope,
    nextEntities: EntityMapping[],
    throwOnError = false
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
      if (throwOnError) {
        throw err;
      }
    }
  };

  // Auth listener (resolves session state before any UI or Firestore reads)
  useEffect(() => {
    const unsubscribe = initAuth((user, token) => {
      setCurrentUser(user);
      setAccessToken(token);
      setAuthReady(true);
      if (user && user.emailVerified) {
        void testFirestoreConnection();
      }
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Flush any pending local company directory changes for all 3 Intercompany scopes on verified authorized sign-in
  useEffect(() => {
    if (!canLoadCloudData || !effectivePermissions.canManageMasterData) return;
    INTERCOMPANY_SCOPES.forEach((scope) => {
      if (pendingDirectorySyncRef.current[scope]) {
        void syncDirectoryToCloud(scope, workspacesRef.current[scope].entities);
      }
    });
  }, [canLoadCloudData, effectivePermissions.canManageMasterData]);

  // Subscribe independently to all 3 Master Company Directories ONLY when verified & authorized
  useEffect(() => {
    if (!canLoadCloudData || (!canAccessIntercompany && !realIsAdmin)) return;
    const unsubscribers = INTERCOMPANY_SCOPES.map((targetScope) =>
      subscribeToCompanyDirectory(
        targetScope,
        (savedDir) => {
          if (!savedDir) return;
          hasIndependentDirectoryRef.current[targetScope] = true;
          if (pendingDirectorySyncRef.current[targetScope]) return;

          setWorkspaces((prev) => ({
            ...prev,
            [targetScope]: {
              ...prev[targetScope],
              entities:
                savedDir.entities.length > 0 ? savedDir.entities : prev[targetScope].entities,
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
          console.warn(
            `Error loading company directory (${getIntercompanyScopeLabel(targetScope)}):`,
            err
          );
        }
      )
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [canLoadCloudData, canAccessIntercompany, realIsAdmin]);

  // Subscribe independently to Internacionales, Nacionales, and Anitox cloud reconciliation documents ONLY when authorized
  useEffect(() => {
    if (!canLoadCloudData || !canAccessIntercompany) return;
    const scopesToWatch: { scope: ReconciliationScope; docId: string }[] = [
      { scope: 'internacionales', docId: workspaces.internacionales.docId },
      { scope: 'nacionales', docId: workspaces.nacionales.docId },
      { scope: 'anitox', docId: workspaces.anitox.docId },
    ];

    const unsubscribers = scopesToWatch.map(({ scope: targetScope, docId: targetDocId }) =>
      subscribeToReconciliation(
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
          console.warn(
            `Error loading cloud reconciliation (${getIntercompanyScopeLabel(targetScope)}):`,
            err
          );
        }
      )
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [
    canLoadCloudData,
    canAccessIntercompany,
    workspaces.internacionales.docId,
    workspaces.nacionales.docId,
    workspaces.anitox.docId,
  ]);

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

  const handleChangeScope = (nextScope: ReconciliationScope) => {
    setActiveScope(nextScope);
    setMovimientosPreset(null);
    if (typeof window !== 'undefined' && activeModule === 'intercompany') {
      const nextUrl =
        nextScope === 'internacionales'
          ? `${window.location.pathname}?m=intercompany`
          : `${window.location.pathname}?m=intercompany&s=${nextScope}`;
      window.history.replaceState(null, '', nextUrl);
    }
  };

  const handleSignInWithGoogle = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setCurrentUser(res.user);
        setAccessToken(res.accessToken);
      }
      return res;
    } catch (err: any) {
      const code = String(err?.code || '');
      let message =
        'No se pudo completar el inicio de sesión con Google. Inténtalo nuevamente.';
      if (code === 'auth/popup-blocked') {
        message =
          'El navegador bloqueó la ventana emergente de Google. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.';
      } else if (code === 'auth/unauthorized-domain') {
        message =
          'Este dominio aún no está autorizado en Firebase Authentication (Authorized domains). Contacta al administrador.';
      } else if (code === 'auth/network-request-failed') {
        message =
          'Error de red al conectar con Google. Verifica tu conexión a internet e inténtalo nuevamente.';
      } else if (err?.message) {
        message = `Error al iniciar sesión con Google: ${err.message}`;
      }
      setAuthError(message);
      return null;
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleReconnectGoogleWorkspace = async (): Promise<string | null> => {
    const token = await reconnectGoogleWorkspace();
    if (token) {
      if (auth.currentUser) {
        setCurrentUser(auth.currentUser);
      }
      setAccessToken(token);
      return token;
    }
    return null;
  };

  const handleSignOut = async () => {
    try {
      // Unsubscribe every active Firestore listener BEFORE revoking Firebase auth state
      unsubscribeAllFirestoreListeners();
      await logout();
      setCurrentUser(null);
      setAccessToken(null);
      setOwnPermissionDoc(null);
      setOwnPermState('idle');
      setPolicyLoaded(false);
      setPreviewEmail(null);
      setAuthError(null);
      setActiveModule('launcher');
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname);
      }
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
      const scopeQuery =
        scopeAtSave === 'internacionales' ? '' : `s=${scopeAtSave}&`;
      const nextUrl = `${window.location.pathname}?${scopeQuery}c=${encodeURIComponent(result.id)}`;
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
    const scopeLabel = getIntercompanyScopeLabel(scopeAtClose);

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
      const scopeQuery =
        scopeAtClose === 'internacionales' ? '' : `s=${scopeAtClose}&`;
      const nextUrl = `${window.location.pathname}?${scopeQuery}c=${encodeURIComponent(saveResult.id)}`;
      window.history.replaceState(null, '', nextUrl);
    }

    return {
      url: saveResult.url,
      closedRecord,
    };
  };

  // Independent company databases per Intercompany scope (Internacionales, Nacionales, Anitox)
  const intercompanyScopeCompanies = useMemo<Record<ReconciliationScope, ModuleCompanyEntry[]>>(
    () => ({
      internacionales: entityMappingsToModuleCompanies(workspaces.internacionales.entities),
      nacionales: entityMappingsToModuleCompanies(workspaces.nacionales.entities),
      anitox: entityMappingsToModuleCompanies(workspaces.anitox.entities),
    }),
    [
      workspaces.internacionales.entities,
      workspaces.nacionales.entities,
      workspaces.anitox.entities,
    ]
  );

  // Independent company databases for each of the 6 functional modules
  const moduleCompanyDatabases = useMemo<ModuleCompaniesMap>(() => {
    const mergedIntercompany: ModuleCompanyEntry[] = [];
    const seenIc = new Set<string>();
    INTERCOMPANY_SCOPES.forEach((scope) => {
      intercompanyScopeCompanies[scope].forEach((entry) => {
        const key = normalizeCompanyKey(entry.nombre);
        if (!key || seenIc.has(key)) return;
        seenIc.add(key);
        mergedIntercompany.push(entry);
      });
    });

    const bancosList = mergeRuntimeSocietyNames(
      standaloneModuleCompanies.bancos,
      [
        ...bankWorkspace.societies.map((s) => ({
          nombre: s.nombre,
          pais: s.pais,
          moneda: s.moneda,
        })),
        ...bankWorkspace.accounts.map((a) => ({
          nombre: a.sociedad,
          pais: a.pais,
          moneda: a.moneda,
        })),
      ],
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
    const actividadesList = mergeRuntimeSocietyNames(
      standaloneModuleCompanies.actividades,
      activitiesWorkspace.societies.map((s) => ({
        nombre: s.codigo,
        pais: s.pais || 'Colombia',
      })),
      'act'
    );

    return {
      intercompany: mergedIntercompany,
      bancos: bancosList,
      viaticos: viaticosList,
      actividades: actividadesList,
      clara: standaloneModuleCompanies.clara,
      anticipos: standaloneModuleCompanies.anticipos,
      cxc: standaloneModuleCompanies.cxc,
      cxp: standaloneModuleCompanies.cxp,
    };
  }, [
    intercompanyScopeCompanies,
    standaloneModuleCompanies,
    bankWorkspace.societies,
    bankWorkspace.accounts,
    viaticosWorkspace.consultores,
    viaticosWorkspace.liquidaciones,
    activitiesWorkspace.societies,
  ]);

  const moduleDbSyncStatus = useMemo<Record<FunctionalModuleId, ModuleDbSyncState>>(() => {
    const scopeStatuses = INTERCOMPANY_SCOPES.map((s) => directorySyncStatus[s]);
    const aggregateIntercompanySync: ModuleDbSyncState =
      scopeStatuses.find((s) => s.status === 'error') ||
      scopeStatuses.find((s) => s.status === 'saving') ||
      scopeStatuses.find((s) => s.status === 'pending') ||
      scopeStatuses.find((s) => s.status === 'saved') || { status: 'idle' };

    return {
      intercompany: aggregateIntercompanySync,
      bancos: standaloneDbSyncStatus.bancos,
      viaticos: standaloneDbSyncStatus.viaticos,
      actividades: standaloneDbSyncStatus.actividades,
      clara: standaloneDbSyncStatus.clara,
      anticipos: standaloneDbSyncStatus.anticipos,
      cxc: standaloneDbSyncStatus.cxc,
      cxp: standaloneDbSyncStatus.cxp,
    };
  }, [directorySyncStatus, standaloneDbSyncStatus]);

  const visibleActivitiesWorkspace = useMemo<ActivitiesWorkspaceData>(
    () =>
      filterActivitiesWorkspaceForUser(
        activitiesWorkspace,
        effectivePermissions,
        effectivePermissions.email || currentUser?.email || null
      ),
    [activitiesWorkspace, effectivePermissions, currentUser?.email]
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
      effectivePermissions,
      bankWorkspace.societies,
      bankWorkspace.sapOpenItems,
      bankWorkspace.sapBalanceRows
    );
    const filteredClosed = filterClosedBankReconciliationsByPermissions(
      bankWorkspace.closedReconciliations,
      effectivePermissions
    );
    const selectedValid = filtered.accounts.some(
      (a) => a.id === bankWorkspace.selectedAccountId
    );
    return {
      ...bankWorkspace,
      societies: filtered.societies,
      accounts: filtered.accounts,
      sapOpenItems: filtered.sapOpenItems,
      sapBalanceRows: filtered.sapBalanceRows,
      statementItems: filtered.statementItems,
      ledgerItems: filtered.ledgerItems,
      matches: filtered.matches,
      closedReconciliations: filteredClosed,
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
    const defaultCountry = INTERCOMPANY_SCOPE_META[scopeAtAdd].defaultCountry;
    const defaultCurrency = INTERCOMPANY_SCOPE_META[scopeAtAdd].defaultCurrency;
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
      anitox: buildInfo(workspaces.anitox),
    };
  }, [workspaces.internacionales, workspaces.nacionales, workspaces.anitox]);

  const scopeSummary: Record<ReconciliationScope, { entities: number; movements: number }> = {
    internacionales: {
      entities: workspaces.internacionales.entities.length,
      movements: workspaces.internacionales.movements.length,
    },
    nacionales: {
      entities: workspaces.nacionales.entities.length,
      movements: workspaces.nacionales.movements.length,
    },
    anitox: {
      entities: workspaces.anitox.entities.length,
      movements: workspaces.anitox.movements.length,
    },
  };

  const launcherMetrics = useMemo<LauncherLiveMetrics>(() => {
    let squaredAccounts = 0;
    let totalBankPending = 0;

    visibleBankWorkspace.accounts.forEach((acc) => {
      const s = computeBankReconciliationSummary(
        acc,
        visibleBankWorkspace.statementItems,
        visibleBankWorkspace.ledgerItems,
        visibleBankWorkspace.matches,
        visibleBankWorkspace.selectedMonth,
        visibleBankWorkspace.sapOpenItems
      );
      if (Math.abs(s.diferenciaNeta) <= 1) squaredAccounts += 1;
      totalBankPending +=
        s.sapItemsCount > 0
          ? s.sapItemsCount
          : s.unmatchedBankItemsCount + s.unmatchedLedgerItemsCount;
    });

    const bankReconciledPct =
      visibleBankWorkspace.accounts.length > 0
        ? Math.round((squaredAccounts / visibleBankWorkspace.accounts.length) * 100)
        : 100;

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

    const activityAssignments = materializePeriodAssignments(visibleActivitiesWorkspace);
    const activitiesCompletedCount = activityAssignments.filter(
      (a) => a.execution.estado === 'realizada'
    ).length;
    const activitiesTotalCount = activityAssignments.length;

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
      activitiesTotalCount,
      activitiesCompletedCount,
      activitiesPendingCount: Math.max(0, activitiesTotalCount - activitiesCompletedCount),
      activitiesPeriod: formatPeriodLabel(visibleActivitiesWorkspace.selectedPeriod),
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
    visibleActivitiesWorkspace,
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
                  activeModule === 'viaticos' ||
                  activeModule === 'actividades'
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

  // 0A. Mandatory Google Sign-In & Session Verification Gate (zero module visibility before auth + permissions)
  if (!authReady) {
    return (
      <LoginGateView
        mode="checking_session"
        currentUser={null}
        isSigningIn={false}
        authError={null}
        onSignInWithGoogle={() => {
          void handleSignInWithGoogle();
        }}
        onSignOut={handleSignOut}
      />
    );
  }

  if (!currentUser) {
    return (
      <LoginGateView
        mode="sign_in"
        currentUser={null}
        isSigningIn={isSigningIn}
        authError={authError}
        onSignInWithGoogle={() => {
          void handleSignInWithGoogle();
        }}
        onSignOut={handleSignOut}
      />
    );
  }

  if (!currentUser.emailVerified) {
    return (
      <LoginGateView
        mode="unverified_email"
        currentUser={currentUser}
        isSigningIn={false}
        authError={null}
        onSignInWithGoogle={() => {
          void handleSignInWithGoogle();
        }}
        onSignOut={handleSignOut}
      />
    );
  }

  if (!permissionsResolved) {
    return (
      <LoginGateView
        mode="loading_permissions"
        currentUser={currentUser}
        isSigningIn={false}
        authError={null}
        onSignInWithGoogle={() => {
          void handleSignInWithGoogle();
        }}
        onSignOut={handleSignOut}
      />
    );
  }

  // 0B. Access Denied Gate (Strict Mode unregistered user or suspended user)
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
              <h1 className="text-lg font-bold text-slate-900">Acceso restringido</h1>
              <p className="text-xs text-slate-600 leading-relaxed">
                El correo{' '}
                <strong className="font-mono text-slate-900">
                  {effectivePermissions.email || currentUser?.email}
                </strong>{' '}
                no tiene permisos activos. Contacta a{' '}
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

  // 1. Modular Premex Suite Launcher Hub (also immediately catches any unauthorized deep-linked module)
  if (
    activeModule === 'launcher' ||
    !effectivePermissions.canAccessModule(activeModule)
  ) {
    return (
      <div className="min-h-screen flex flex-col">
        {previewBanner}
        <div className="flex-1">
          <ModuleLauncher
            onOpenModule={handleSwitchModule}
            currentUser={currentUser}
            onSignInWithGoogle={() => {
              void handleSignInWithGoogle();
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
            intercompanyScopeCompanies={intercompanyScopeCompanies}
            intercompanyScopeSyncStatus={directorySyncStatus}
            onSaveIntercompanyScopeCompanies={handleSaveIntercompanyScopeCompanies}
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
            odooCatalogs={viaticosWorkspace.odooCatalogs}
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
            accessToken={accessToken}
            onSignInWithGoogle={() => {
              handleSignInWithGoogle().catch((err) => {
                console.error('Google sign in failed:', err);
              });
            }}
            onReconnectWorkspace={handleReconnectGoogleWorkspace}
            onInvalidateWorkspaceToken={() => setAccessToken(null)}
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
            accessToken={accessToken}
            onSignInWithGoogle={() => {
              handleSignInWithGoogle().catch((err) => {
                console.error('Google sign in failed:', err);
              });
            }}
            onReconnectWorkspace={handleReconnectGoogleWorkspace}
            onInvalidateWorkspaceToken={() => setAccessToken(null)}
            onSignOut={handleSignOut}
            onSwitchModule={handleSwitchModule}
            permissions={effectivePermissions}
            moduleCompanies={moduleCompanyDatabases.viaticos}
            onSaveModuleCompanies={(nextCompanies) =>
              handleSaveModuleCompanies('viaticos', nextCompanies)
            }
            permissionRecords={permissionRecords}
            onUpsertPermissionRecord={
              realIsAdmin ? handleUpsertPermissionRecord : undefined
            }
          />
        </div>
      </div>
    );
  }

  // 4B. Panel de Actividades Module (Matriz corporativa + Gmail & Google Tasks)
  if (activeModule === 'actividades') {
    return (
      <div className="min-h-screen flex flex-col">
        {previewBanner}
        <div className="flex-1">
          <ActivitiesModuleWorkspace
            data={visibleActivitiesWorkspace}
            onUpdateWorkspace={handleUpdateActivitiesWorkspace}
            onSaveToCloud={handleSaveActivitiesToCloud}
            isSavingCloud={isSavingActivitiesCloud}
            currentUser={currentUser}
            accessToken={accessToken}
            onSignInWithGoogle={() => {
              handleSignInWithGoogle().catch((err) => {
                console.error('Google sign in failed:', err);
              });
            }}
            onReconnectWorkspace={handleReconnectGoogleWorkspace}
            onInvalidateWorkspaceToken={() => setAccessToken(null)}
            onSignOut={handleSignOut}
            onSwitchModule={handleSwitchModule}
            permissions={effectivePermissions}
            permissionRecords={permissionRecords}
          />
        </div>
      </div>
    );
  }

  // 5. Conciliación Intercompany Module (Internacionales, Nacionales y Anitox with RBAC & Company Scoping)
  return (
    <div className="min-h-screen bg-[#F5F8FC] flex flex-col font-sans text-slate-800 antialiased selection:bg-[#1E60A8] selection:text-white">
      {previewBanner}
      {/* Lateral Menu (Sidebar) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeScope={activeScope}
        onChangeScope={handleChangeScope}
        scopeSummary={scopeSummary}
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
          activeScope={activeScope}
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
                      <strong>
                        Cambios locales sin guardar ({getIntercompanyScopeLabel(activeScope)}):
                      </strong>{' '}
                      Presiona <strong>Guardar Conciliación</strong> para actualizar el enlace
                      compartido.
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
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-7xl mx-auto w-full">
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
              accessToken={accessToken}
              onReconnectWorkspace={handleReconnectGoogleWorkspace}
              onInvalidateWorkspaceToken={() => setAccessToken(null)}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Intercompany) */}
      <nav
        aria-label="Navegación móvil intercompany"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe print:hidden"
      >
        <div className="grid grid-cols-4 h-14">
          {(
            [
              { id: 'inicio' as ActiveTab, label: 'Inicio', icon: LayoutDashboard },
              { id: 'conciliacion' as ActiveTab, label: 'Matrices', icon: Grid3X3 },
              {
                id: 'diferencias' as ActiveTab,
                label: differencesCount > 0 ? `Dif. (${differencesCount})` : 'Diferencias',
                icon: AlertTriangle,
              },
              { id: 'movimientos' as ActiveTab, label: 'Movim.', icon: ReceiptText },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                  isActive ? 'text-[#132B63]' : 'text-slate-500'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-[#1E60A8]' : 'text-slate-400'}`} />
                <span className="truncate max-w-[78px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

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
