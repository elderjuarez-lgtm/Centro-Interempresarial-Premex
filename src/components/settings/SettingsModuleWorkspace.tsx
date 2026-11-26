import React, { useState, useMemo, useRef } from 'react';
import { User } from 'firebase/auth';
import * as XLSX from 'xlsx';
import {
  Users,
  ShieldCheck,
  SlidersHorizontal,
  Plus,
  Search,
  Pencil,
  Trash2,
  Eye,
  Check,
  X,
  ArrowLeft,
  ChevronRight,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Building2,
  LogOut,
  Menu,
  Lock,
  Power,
  Database,
  Upload,
  Download,
  Copy,
  Link2,
  Server,
} from 'lucide-react';
import {
  AccessControlPolicy,
  ActiveModuleId,
  CompanyAccessScope,
  FunctionalModuleId,
  ModuleCompaniesMap,
  ModuleCompanyEntry,
  ModuleCompanyScopeMap,
  ReconciliationScope,
  SuiteModuleId,
  UserPermissionRecord,
  UserRole,
  UserTypeId,
  ViaticoOdooCatalogs,
  ViaticosTab,
} from '../../types';
import {
  INTERCOMPANY_SCOPES,
  INTERCOMPANY_SCOPE_META,
  getIntercompanyScopeLabel,
} from '../../utils/demoData';
import {
  ALL_FUNCTIONAL_MODULES,
  ALL_SUITE_MODULES,
  ALL_USER_TYPES,
  ALL_VIATICOS_PANELS,
  deriveLegacyCompanyFields,
  emailToPermissionDocId,
  getRecordModuleCompanyRule,
  isValidEmailFormat,
  normalizeCompanyKey,
  normalizeEmail,
  ROLE_METADATA,
  sanitizeModuleCompanyAccess,
  sanitizeUserType,
  sanitizeViaticosPanels,
  SUPER_ADMIN_EMAIL,
  USER_TYPE_METADATA,
  VIATICOS_PANEL_METADATA,
} from '../../utils/permissions';
import {
  MODULE_COMPANY_DB_META,
  sanitizeModuleCompanyEntry,
  sanitizeModuleCompanyList,
} from '../../utils/moduleCompanies';
import {
  findMatchingCostCenterEntry,
  formatAnalyticDistributionJson,
  mergeOdooCatalogsWithDefaults,
} from '../../utils/viaticosOdooCatalogs';
import { activeFirebaseInfo } from '../../services/auth';
import { AjustesModuleLogo, ModuleEmblem, PremexBrandLogo } from '../ModuleIcons';
import { AppSwitcherMenu } from '../AppSwitcherMenu';

export interface ModuleDbSyncState {
  status: 'idle' | 'saving' | 'saved' | 'pending' | 'error';
  lastSyncedAtIso?: string;
  updatedByName?: string;
  errorMsg?: string;
}

interface SettingsModuleWorkspaceProps {
  records: UserPermissionRecord[];
  policy: AccessControlPolicy;
  moduleCompanyDatabases: ModuleCompaniesMap;
  moduleDbSyncStatus: Record<FunctionalModuleId, ModuleDbSyncState>;
  intercompanyScopeCompanies?: Record<ReconciliationScope, ModuleCompanyEntry[]>;
  intercompanyScopeSyncStatus?: Record<ReconciliationScope, ModuleDbSyncState>;
  onSaveIntercompanyScopeCompanies?: (
    scope: ReconciliationScope,
    companies: ModuleCompanyEntry[]
  ) => Promise<void>;
  currentUser: User | null;
  onSignInWithGoogle: () => void;
  onSignOut: () => void;
  onSwitchModule: (moduleId: ActiveModuleId) => void;
  onUpsertRecord: (record: UserPermissionRecord) => Promise<void>;
  onDeleteRecord: (email: string) => Promise<void>;
  onTogglePolicyStrictMode: (strictMode: boolean) => Promise<void>;
  onSyncAllToCloud: () => Promise<void>;
  onSaveModuleCompanies: (
    moduleId: FunctionalModuleId,
    companies: ModuleCompanyEntry[]
  ) => Promise<void>;
  onStartPreviewAs: (email: string) => void;
  lastCloudSyncIso: string | null;
  hasPendingCloudSync: boolean;
  odooCatalogs?: ViaticoOdooCatalogs;
}

type SettingsTab = 'usuarios' | 'empresas_modulos' | 'roles' | 'politica';

const ROLE_CAPABILITY_ROWS: {
  capability: string;
  admin: string;
  operador: string;
  consulta: string;
}[] = [
  {
    capability: 'Ingresar a módulos asignados por correo electrónico',
    admin: 'Todos los módulos',
    operador: 'Solo módulos autorizados',
    consulta: 'Solo módulos autorizados',
  },
  {
    capability: 'Empresas visibles según la base de datos de cada módulo',
    admin: 'Todas las sociedades',
    operador: 'Independiente por módulo (Todas o seleccionadas)',
    consulta: 'Independiente por módulo (Todas o seleccionadas)',
  },
  {
    capability: 'Consultar matrices, movimientos, diferencias, bancos y viáticos',
    admin: 'Permitido',
    operador: 'Permitido',
    consulta: 'Permitido',
  },
  {
    capability: 'Exportar reportes a Excel y PDF',
    admin: 'Permitido',
    operador: 'Permitido',
    consulta: 'Permitido',
  },
  {
    capability: 'Cargar archivos Excel / CSV / facturas y editar movimientos',
    admin: 'Permitido',
    operador: 'Permitido',
    consulta: 'Bloqueado',
  },
  {
    capability: 'Ejecutar cruces bancarios, liquidaciones y editar comentarios',
    admin: 'Permitido',
    operador: 'Permitido',
    consulta: 'Bloqueado',
  },
  {
    capability: 'Guardar cambios compartidos en Firestore y exportar a Google Sheets',
    admin: 'Permitido',
    operador: 'Permitido',
    consulta: 'Bloqueado',
  },
  {
    capability: 'Administrar base de datos independiente de empresas por módulo',
    admin: 'Permitido (CRUD + Excel)',
    operador: 'Solo consulta',
    consulta: 'Bloqueado',
  },
  {
    capability: 'Ejecutar cierre mensual definitivo (inmutable)',
    admin: 'Permitido',
    operador: 'Bloqueado',
    consulta: 'Bloqueado',
  },
  {
    capability: 'Acceso a Ajustes, políticas de Firebase y gestión de correos',
    admin: 'Permitido',
    operador: 'Bloqueado',
    consulta: 'Bloqueado',
  },
];

const formatCloudError = (err: unknown, fallback: string): string => {
  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err
      ? String((err as { message?: unknown }).message || '')
      : '';

  const trimmed = rawMessage.trim();
  if (!trimmed) return fallback;

  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as {
        error?: string;
        operationType?: string;
        path?: string;
      };
      if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
        const location = parsed.path ? ` en "${parsed.path}"` : '';
        const op = parsed.operationType ? `${parsed.operationType}` : 'operación';
        return `Error Firestore (${op}${location}): ${parsed.error}`;
      }
    } catch {
      // Keep original message if not structured JSON
    }
  }

  return trimmed;
};

const formatShortDate = (iso?: string | null): string => {
  if (!iso) return 'Sin sincronizar';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
};

export const SettingsModuleWorkspace: React.FC<SettingsModuleWorkspaceProps> = ({
  records,
  policy,
  moduleCompanyDatabases,
  moduleDbSyncStatus,
  intercompanyScopeCompanies,
  intercompanyScopeSyncStatus,
  onSaveIntercompanyScopeCompanies,
  currentUser,
  onSignInWithGoogle,
  onSignOut,
  onSwitchModule,
  onUpsertRecord,
  onDeleteRecord,
  onTogglePolicyStrictMode,
  onSyncAllToCloud,
  onSaveModuleCompanies,
  onStartPreviewAs,
  lastCloudSyncIso,
  hasPendingCloudSync,
  odooCatalogs,
}) => {
  const resolvedOdooCatalogs = useMemo(
    () => mergeOdooCatalogsWithDefaults(odooCatalogs),
    [odooCatalogs]
  );
  const [activeTab, setActiveTab] = useState<SettingsTab>('usuarios');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState<string | null>(null);
  const [copiedShareUrl, setCopiedShareUrl] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  // User Permission Editor Modal State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('operador');
  const [formUserType, setFormUserType] = useState<UserTypeId>('liquidador');
  const [formModules, setFormModules] = useState<SuiteModuleId[]>([
    'intercompany',
    'bancos',
    'viaticos',
    'actividades',
  ]);
  const [formViaticosPanels, setFormViaticosPanels] = useState<ViaticosTab[]>([
    'liquidador',
    'cerradas',
  ]);
  const [formModuleCompanyAccess, setFormModuleCompanyAccess] =
    useState<ModuleCompanyScopeMap>({
      intercompany: { scope: 'all', companies: [] },
      bancos: { scope: 'all', companies: [] },
      viaticos: { scope: 'all', companies: [] },
      actividades: { scope: 'all', companies: [] },
    });
  const [activeConfigModule, setActiveConfigModule] =
    useState<FunctionalModuleId>('intercompany');
  const [formActive, setFormActive] = useState(true);
  const [formNotes, setFormNotes] = useState('');
  const [formAssignedEmployees, setFormAssignedEmployees] = useState<string[]>([]);
  const [employeeAssignSearch, setEmployeeAssignSearch] = useState('');
  const [formCentroCosto, setFormCentroCosto] = useState('');
  const [formOdooAnalyticDistribution, setFormOdooAnalyticDistribution] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [quickAddCompanyInput, setQuickAddCompanyInput] = useState('');
  const [isQuickAddingCompany, setIsQuickAddingCompany] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Per-Module Company Database Tab State
  const [selectedDbModule, setSelectedDbModule] =
    useState<FunctionalModuleId>('intercompany');
  const [selectedIntercompanyScope, setSelectedIntercompanyScope] =
    useState<ReconciliationScope>('internacionales');
  const [dbSearchQuery, setDbSearchQuery] = useState('');
  const [isCompanyFormOpen, setIsCompanyFormOpen] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [compNombre, setCompNombre] = useState('');
  const [compCodigo, setCompCodigo] = useState('');
  const [compNit, setCompNit] = useState('');
  const [compPais, setCompPais] = useState('');
  const [compMoneda, setCompMoneda] = useState('USD');
  const [compActivo, setCompActivo] = useState(true);
  const [compFormError, setCompFormError] = useState<string | null>(null);
  const [confirmDeleteCompId, setConfirmDeleteCompId] = useState<string | null>(null);
  const [copySourceModule, setCopySourceModule] = useState<string>('');
  const excelInputRef = useRef<HTMLInputElement | null>(null);

  const isEditingSuperAdmin = normalizeEmail(formEmail) === SUPER_ADMIN_EMAIL;

  const stats = useMemo(() => {
    const active = records.filter((r) => r.active).length;
    const admins = records.filter((r) => r.role === 'admin' && r.active).length;
    const operadores = records.filter((r) => r.role === 'operador' && r.active).length;
    const consulta = records.filter((r) => r.role === 'consulta' && r.active).length;
    return { total: records.length, active, admins, operadores, consulta };
  }, [records]);

  const totalCatalogCompanies = useMemo(
    () =>
      ALL_FUNCTIONAL_MODULES.reduce(
        (sum, modId) =>
          sum + moduleCompanyDatabases[modId].filter((c) => c.activo !== false).length,
        0
      ),
    [moduleCompanyDatabases]
  );

  const anyModuleDbPending = useMemo(() => {
    const hasStandalonePending = ALL_FUNCTIONAL_MODULES.some(
      (m) =>
        moduleDbSyncStatus[m]?.status === 'pending' ||
        moduleDbSyncStatus[m]?.status === 'error'
    );
    const hasIntercompanyScopePending = intercompanyScopeSyncStatus
      ? INTERCOMPANY_SCOPES.some(
          (sc) =>
            intercompanyScopeSyncStatus[sc]?.status === 'pending' ||
            intercompanyScopeSyncStatus[sc]?.status === 'error'
        )
      : false;
    return hasStandalonePending || hasIntercompanyScopePending;
  }, [moduleDbSyncStatus, intercompanyScopeSyncStatus]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((rec) => {
      if (roleFilter !== 'ALL' && rec.role !== roleFilter) return false;
      if (!q) return true;
      const moduleCompaniesMatch = ALL_FUNCTIONAL_MODULES.some((modId) => {
        const rule = getRecordModuleCompanyRule(rec, modId);
        return rule.companies.some((c) => c.toLowerCase().includes(q));
      });
      return (
        rec.email.toLowerCase().includes(q) ||
        rec.displayName.toLowerCase().includes(q) ||
        rec.allowedCompanies.some((c) => c.toLowerCase().includes(q)) ||
        moduleCompaniesMatch
      );
    });
  }, [records, searchQuery, roleFilter]);

  const enabledFunctionalModulesInForm = useMemo(
    () =>
      ALL_FUNCTIONAL_MODULES.filter(
        (m) => formRole === 'admin' || formModules.includes(m)
      ),
    [formRole, formModules]
  );

  const effectiveActiveConfigModule: FunctionalModuleId = useMemo(() => {
    if (enabledFunctionalModulesInForm.includes(activeConfigModule)) {
      return activeConfigModule;
    }
    return enabledFunctionalModulesInForm[0] || 'intercompany';
  }, [enabledFunctionalModulesInForm, activeConfigModule]);

  const activeModuleRule = useMemo(() => {
    const rule = formModuleCompanyAccess[effectiveActiveConfigModule];
    return rule || { scope: 'all' as CompanyAccessScope, companies: [] as string[] };
  }, [formModuleCompanyAccess, effectiveActiveConfigModule]);

  const activeModuleCompanyOptions = useMemo(() => {
    const dbList = moduleCompanyDatabases[effectiveActiveConfigModule] || [];
    const map = new Map<string, ModuleCompanyEntry>();
    dbList.forEach((c) => {
      if (c.activo !== false) {
        map.set(normalizeCompanyKey(c.nombre), c);
      }
    });
    activeModuleRule.companies.forEach((name, idx) => {
      const k = normalizeCompanyKey(name);
      if (k && !map.has(k)) {
        map.set(k, {
          id: `assigned-${idx}-${k}`,
          nombre: name,
          codigo: '',
          nit: '',
          pais: '',
          moneda: MODULE_COMPANY_DB_META[effectiveActiveConfigModule].defaultCurrency,
          activo: true,
        });
      }
    });
    const q = companySearch.trim().toLowerCase();
    return Array.from(map.values())
      .filter(
        (c) =>
          !q ||
          c.nombre.toLowerCase().includes(q) ||
          (c.codigo || '').toLowerCase().includes(q) ||
          (c.pais || '').toLowerCase().includes(q)
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [moduleCompanyDatabases, effectiveActiveConfigModule, activeModuleRule.companies, companySearch]);

  // Selected DB module filtered table rows (supports 3 independent scopes for Intercompany)
  const isIntercompanyDbSelected =
    selectedDbModule === 'intercompany' &&
    Boolean(intercompanyScopeCompanies && onSaveIntercompanyScopeCompanies);

  const selectedDbMeta = MODULE_COMPANY_DB_META[selectedDbModule];
  const activeDbDisplayName = isIntercompanyDbSelected
    ? `Conciliación Intercompany — ${getIntercompanyScopeLabel(selectedIntercompanyScope)}`
    : selectedDbMeta.name;
  const activeDbShortName = isIntercompanyDbSelected
    ? `Intercompany (${getIntercompanyScopeLabel(selectedIntercompanyScope)})`
    : selectedDbMeta.shortName;
  const activeDbFirestorePath = isIntercompanyDbSelected
    ? `company_directories/${selectedIntercompanyScope}`
    : selectedDbMeta.firestorePath;
  const activeDbDefaultCurrency = isIntercompanyDbSelected
    ? INTERCOMPANY_SCOPE_META[selectedIntercompanyScope].defaultCurrency
    : selectedDbMeta.defaultCurrency;
  const activeDbDefaultCountry = isIntercompanyDbSelected
    ? INTERCOMPANY_SCOPE_META[selectedIntercompanyScope].defaultCountry
    : '';

  const selectedDbCompanies = isIntercompanyDbSelected
    ? intercompanyScopeCompanies?.[selectedIntercompanyScope] || []
    : moduleCompanyDatabases[selectedDbModule] || [];

  const selectedDbSync = isIntercompanyDbSelected
    ? intercompanyScopeSyncStatus?.[selectedIntercompanyScope] ||
      moduleDbSyncStatus.intercompany || { status: 'idle' }
    : moduleDbSyncStatus[selectedDbModule] || { status: 'idle' };

  const saveCurrentDbCompanies = async (nextList: ModuleCompanyEntry[]) => {
    if (isIntercompanyDbSelected && onSaveIntercompanyScopeCompanies) {
      await onSaveIntercompanyScopeCompanies(selectedIntercompanyScope, nextList);
      return;
    }
    await onSaveModuleCompanies(selectedDbModule, nextList);
  };

  const filteredDbCompanies = useMemo(() => {
    const q = dbSearchQuery.trim().toLowerCase();
    return selectedDbCompanies.filter((c) => {
      if (!q) return true;
      return (
        c.nombre.toLowerCase().includes(q) ||
        (c.codigo || '').toLowerCase().includes(q) ||
        (c.nit || '').toLowerCase().includes(q) ||
        (c.pais || '').toLowerCase().includes(q)
      );
    });
  }, [selectedDbCompanies, dbSearchQuery]);

  // --- User Permission Modal Handlers ---

  const openNewUserModal = () => {
    setIsEditingExisting(false);
    setFormEmail('');
    setFormName('');
    setFormRole('operador');
    setFormUserType('liquidador');
    setFormModules(['intercompany', 'bancos', 'viaticos', 'actividades']);
    setFormViaticosPanels([...USER_TYPE_METADATA.liquidador.defaultViaticosPanels]);
    setFormModuleCompanyAccess({
      intercompany: { scope: 'all', companies: [] },
      bancos: { scope: 'all', companies: [] },
      viaticos: { scope: 'all', companies: [] },
      actividades: { scope: 'all', companies: [] },
    });
    setActiveConfigModule('intercompany');
    setFormActive(true);
    setFormNotes('');
    setFormAssignedEmployees([]);
    setEmployeeAssignSearch('');
    setFormCentroCosto('');
    setFormOdooAnalyticDistribution('');
    setCompanySearch('');
    setQuickAddCompanyInput('');
    setFormError(null);
    setIsEditorOpen(true);
  };

  const openEditUserModal = (rec: UserPermissionRecord) => {
    setIsEditingExisting(true);
    setFormEmail(rec.email);
    setFormName(rec.displayName);
    setFormRole(rec.role);
    const resolvedUserType: UserTypeId =
      rec.role === 'admin' ? 'administrador' : sanitizeUserType(rec.userType, rec.role);
    setFormUserType(resolvedUserType);
    const nextModules: SuiteModuleId[] =
      rec.role === 'admin' ? [...ALL_SUITE_MODULES] : [...rec.allowedModules];
    setFormModules(nextModules);

    const resolvedPanels: ViaticosTab[] =
      rec.role === 'admin'
        ? [...ALL_VIATICOS_PANELS]
        : !nextModules.includes('viaticos')
        ? []
        : Array.isArray(rec.viaticosPanels)
        ? sanitizeViaticosPanels(rec.viaticosPanels, rec.role, nextModules, resolvedUserType)
        : rec.userType
        ? sanitizeViaticosPanels(undefined, rec.role, nextModules, resolvedUserType)
        : [...ALL_VIATICOS_PANELS];
    setFormViaticosPanels(resolvedPanels);

    const sanitizedPerMod =
      rec.role === 'admin'
        ? {}
        : sanitizeModuleCompanyAccess(
            rec.moduleCompanyAccess,
            nextModules,
            rec.companyScope,
            rec.allowedCompanies
          );
    setFormModuleCompanyAccess(sanitizedPerMod);
    const firstFunctional =
      ALL_FUNCTIONAL_MODULES.find((m) => nextModules.includes(m)) || 'intercompany';
    setActiveConfigModule(firstFunctional);
    setFormActive(rec.active);
    setFormNotes(rec.notes || '');
    const initialAssigned = Array.isArray(rec.assignedEmployees)
      ? rec.assignedEmployees.map((n) => String(n || '').trim().toUpperCase()).filter(Boolean)
      : rec.odooEmployeeName
      ? [rec.odooEmployeeName.trim().toUpperCase()]
      : [];
    setFormAssignedEmployees(Array.from(new Set(initialAssigned)));
    setEmployeeAssignSearch('');
    const initialCC = rec.centroCosto || '';
    setFormCentroCosto(initialCC);
    const matchedCC = findMatchingCostCenterEntry(
      initialCC,
      rec.odooAnalyticDistribution,
      resolvedOdooCatalogs.costCenters
    );
    setFormOdooAnalyticDistribution(
      rec.odooAnalyticDistribution || matchedCC?.analyticDistribution || ''
    );
    setCompanySearch('');
    setQuickAddCompanyInput('');
    setFormError(null);
    setIsEditorOpen(true);
  };

  const handleSelectUserType = (nextType: UserTypeId) => {
    if (isEditingSuperAdmin && nextType !== 'administrador') return;
    const meta = USER_TYPE_METADATA[nextType];
    setFormUserType(nextType);
    setFormRole(meta.recommendedRole);
    if (nextType === 'administrador') {
      setFormModules([...ALL_SUITE_MODULES]);
      setFormViaticosPanels([...ALL_VIATICOS_PANELS]);
      return;
    }

    setFormModules((prev) => {
      const cleaned = prev.filter((m) => m !== 'ajustes');
      const base =
        cleaned.length > 0 ? cleaned : (['intercompany', 'bancos', 'viaticos'] as SuiteModuleId[]);
      const needsViaticos =
        nextType === 'liquidador' || nextType === 'contabilidad' || nextType === 'autorizador';
      const nextMods =
        needsViaticos && !base.includes('viaticos')
          ? ([...base, 'viaticos'] as SuiteModuleId[])
          : base;
      setFormModuleCompanyAccess((prevMap) =>
        sanitizeModuleCompanyAccess(prevMap, nextMods, 'all', [])
      );
      return nextMods;
    });
    setFormViaticosPanels([...meta.defaultViaticosPanels]);
  };

  const handleToggleViaticosPanel = (panelId: ViaticosTab) => {
    if (formRole === 'admin') return;
    setFormViaticosPanels((prev) => {
      const exists = prev.includes(panelId);
      const next = exists ? prev.filter((p) => p !== panelId) : [...prev, panelId];
      return ALL_VIATICOS_PANELS.filter((p) => next.includes(p));
    });
  };

  const handleToggleModule = (modId: FunctionalModuleId) => {
    if (formRole === 'admin') return;
    setFormModules((prev) => {
      const exists = prev.includes(modId);
      if (exists) {
        return prev.filter((m) => m !== modId);
      }
      setFormModuleCompanyAccess((prevMap) => ({
        ...prevMap,
        [modId]: prevMap[modId] || { scope: 'all', companies: [] },
      }));
      if (modId === 'viaticos') {
        setFormViaticosPanels((currPanels) =>
          currPanels.length > 0
            ? currPanels
            : [...USER_TYPE_METADATA[formUserType].defaultViaticosPanels]
        );
      }
      setActiveConfigModule(modId);
      return [...prev, modId];
    });
  };

  const setModuleScopeInForm = (
    modId: FunctionalModuleId,
    scope: CompanyAccessScope
  ) => {
    setFormModuleCompanyAccess((prev) => ({
      ...prev,
      [modId]: {
        scope,
        companies: prev[modId]?.companies || [],
      },
    }));
  };

  const handleToggleCompanyForActiveModule = (companyName: string) => {
    const modId = effectiveActiveConfigModule;
    const targetKey = normalizeCompanyKey(companyName);
    setFormModuleCompanyAccess((prev) => {
      const cur = prev[modId] || { scope: 'selected', companies: [] };
      const exists = cur.companies.some((c) => normalizeCompanyKey(c) === targetKey);
      const nextCompanies = exists
        ? cur.companies.filter((c) => normalizeCompanyKey(c) !== targetKey)
        : [...cur.companies, companyName];
      return {
        ...prev,
        [modId]: {
          scope: 'selected',
          companies: nextCompanies,
        },
      };
    });
  };

  const handleSelectAllCompaniesInActiveModule = () => {
    const modId = effectiveActiveConfigModule;
    const allNames = activeModuleCompanyOptions.map((c) => c.nombre);
    setFormModuleCompanyAccess((prev) => ({
      ...prev,
      [modId]: {
        scope: 'selected',
        companies: allNames,
      },
    }));
  };

  const handleClearCompaniesInActiveModule = () => {
    const modId = effectiveActiveConfigModule;
    setFormModuleCompanyAccess((prev) => ({
      ...prev,
      [modId]: {
        scope: 'selected',
        companies: [],
      },
    }));
  };

  const handleQuickAddCompanyToModuleDb = async () => {
    const clean = quickAddCompanyInput.trim();
    if (!clean) return;
    const modId = effectiveActiveConfigModule;
    const key = normalizeCompanyKey(clean);
    const currentDb = moduleCompanyDatabases[modId] || [];

    setIsQuickAddingCompany(true);
    try {
      if (!currentDb.some((c) => normalizeCompanyKey(c.nombre) === key)) {
        const newEntry = sanitizeModuleCompanyEntry(
          {
            id: `${modId}-comp-${Date.now()}`,
            nombre: clean,
            moneda: MODULE_COMPANY_DB_META[modId].defaultCurrency,
            activo: true,
          },
          currentDb.length
        );
        await onSaveModuleCompanies(modId, [...currentDb, newEntry]);
      }

      setFormModuleCompanyAccess((prev) => {
        const cur = prev[modId] || { scope: 'selected', companies: [] };
        const alreadyChecked = cur.companies.some(
          (c) => normalizeCompanyKey(c) === key
        );
        return {
          ...prev,
          [modId]: {
            scope: 'selected',
            companies: alreadyChecked ? cur.companies : [...cur.companies, clean],
          },
        };
      });
      setQuickAddCompanyInput('');
    } catch (err: unknown) {
      setFormError(
        formatCloudError(
          err,
          `No se pudo agregar "${clean}" a la base de datos de ${MODULE_COMPANY_DB_META[modId].shortName}.`
        )
      );
    } finally {
      setIsQuickAddingCompany(false);
    }
  };

  const handleQuickRemoveCompanyFromModuleDb = async (company: ModuleCompanyEntry) => {
    const modId = effectiveActiveConfigModule;
    const key = normalizeCompanyKey(company.nombre);
    const currentDb = moduleCompanyDatabases[modId] || [];

    setIsQuickAddingCompany(true);
    try {
      const nextDb = currentDb.filter(
        (c) => c.id !== company.id && normalizeCompanyKey(c.nombre) !== key
      );
      await onSaveModuleCompanies(modId, nextDb);
      setFormModuleCompanyAccess((prev) => {
        const cur = prev[modId] || { scope: 'selected', companies: [] };
        return {
          ...prev,
          [modId]: {
            ...cur,
            companies: cur.companies.filter((c) => normalizeCompanyKey(c) !== key),
          },
        };
      });
    } catch (err: unknown) {
      setFormError(
        formatCloudError(
          err,
          `No se pudo quitar "${company.nombre}" de la base de datos de ${MODULE_COMPANY_DB_META[modId].shortName}.`
        )
      );
    } finally {
      setIsQuickAddingCompany(false);
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cleanEmail = normalizeEmail(formEmail);
    if (!isValidEmailFormat(cleanEmail)) {
      setFormError(
        'Ingresa un correo electrónico corporativo válido (ej. usuario@premexcorp.com).'
      );
      return;
    }

    if (
      !isEditingExisting &&
      records.some((r) => normalizeEmail(r.email) === cleanEmail)
    ) {
      setFormError(
        'Este correo ya tiene permisos registrados. Edita el registro existente.'
      );
      return;
    }

    const effectiveRole: UserRole =
      cleanEmail === SUPER_ADMIN_EMAIL ? 'admin' : formRole;
    const cleanedAllowedModules: SuiteModuleId[] =
      effectiveRole === 'admin'
        ? [...ALL_SUITE_MODULES]
        : formModules.filter((m) => m !== 'ajustes');

    if (effectiveRole !== 'admin' && cleanedAllowedModules.length === 0) {
      setFormError('Selecciona al menos un módulo permitido para este correo.');
      return;
    }

    const sanitizedAccess: ModuleCompanyScopeMap =
      effectiveRole === 'admin'
        ? {}
        : sanitizeModuleCompanyAccess(
            formModuleCompanyAccess,
            cleanedAllowedModules,
            'all',
            []
          );

    if (effectiveRole !== 'admin') {
      const invalidMod = ALL_FUNCTIONAL_MODULES.find((modId) => {
        if (!cleanedAllowedModules.includes(modId)) return false;
        const rule = sanitizedAccess[modId];
        return rule && rule.scope === 'selected' && rule.companies.length === 0;
      });
      if (invalidMod) {
        setActiveConfigModule(invalidMod);
        setFormError(
          `En el módulo "${MODULE_COMPANY_DB_META[invalidMod].name}" elegiste sociedades específicas pero no marcaste ninguna. Selecciona al menos una sociedad o cambia ese módulo a "Todas".`
        );
        return;
      }
    }

    const effectiveUserType: UserTypeId =
      effectiveRole === 'admin'
        ? 'administrador'
        : formUserType === 'administrador'
        ? 'personalizado'
        : formUserType;

    const cleanedViaticosPanels: ViaticosTab[] =
      effectiveRole === 'admin'
        ? [...ALL_VIATICOS_PANELS]
        : cleanedAllowedModules.includes('viaticos')
        ? sanitizeViaticosPanels(
            formViaticosPanels,
            effectiveRole,
            cleanedAllowedModules,
            effectiveUserType
          )
        : [];

    if (
      effectiveRole !== 'admin' &&
      cleanedAllowedModules.includes('viaticos') &&
      cleanedViaticosPanels.length === 0
    ) {
      setFormError(
        'Habilitaste el módulo de Liquidación de Viáticos: selecciona al menos una opción o panel lateral visible para este usuario.'
      );
      return;
    }

    const legacy = deriveLegacyCompanyFields(
      sanitizedAccess,
      cleanedAllowedModules,
      effectiveRole
    );

    const resolvedAnalyticJson = formOdooAnalyticDistribution.trim()
      ? formatAnalyticDistributionJson(formOdooAnalyticDistribution)
      : findMatchingCostCenterEntry(formCentroCosto, undefined, resolvedOdooCatalogs.costCenters)
          ?.analyticDistribution || '';

    const cleanedAssignedEmployees = Array.from(
      new Set(
        formAssignedEmployees
          .map((n) => n.trim().toUpperCase())
          .filter(Boolean)
      )
    );

    const nextRecord: UserPermissionRecord = {
      id: emailToPermissionDocId(cleanEmail),
      email: cleanEmail,
      displayName: formName.trim() || cleanEmail.split('@')[0],
      role: effectiveRole,
      userType: effectiveUserType,
      allowedModules: cleanedAllowedModules,
      viaticosPanels: cleanedViaticosPanels,
      companyScope: legacy.companyScope,
      allowedCompanies: legacy.allowedCompanies,
      moduleCompanyAccess: sanitizedAccess,
      active: cleanEmail === SUPER_ADMIN_EMAIL ? true : formActive,
      notes: formNotes.trim() || undefined,
      odooEmployeeName: undefined,
      assignedEmployees:
        cleanedAssignedEmployees.length > 0 ? cleanedAssignedEmployees : undefined,
      centroCosto: formCentroCosto.trim() || undefined,
      odooAnalyticDistribution: resolvedAnalyticJson || undefined,
      updatedAtIso: new Date().toISOString(),
    };

    setIsSaving(true);
    try {
      await onUpsertRecord(nextRecord);
      setIsEditorOpen(false);
      setFeedback({
        type: 'success',
        message: currentUser
          ? `Permisos por módulo y sociedades de ${cleanEmail} guardados y sincronizados en Firestore.`
          : `Permisos de ${cleanEmail} guardados localmente. Inicia sesión con Google para publicarlos en Firestore.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: formatCloudError(
          err,
          'Se guardó localmente, pero ocurrió un error al sincronizar con Firestore.'
        ),
      });
      setIsEditorOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickToggleActive = async (rec: UserPermissionRecord) => {
    if (normalizeEmail(rec.email) === SUPER_ADMIN_EMAIL) return;
    setIsSaving(true);
    try {
      await onUpsertRecord({
        ...rec,
        active: !rec.active,
        updatedAtIso: new Date().toISOString(),
      });
      setFeedback({
        type: 'info',
        message: `Acceso de ${rec.email} ${!rec.active ? 'activado' : 'suspendido'}.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: formatCloudError(err, 'Error actualizando el estado del usuario en Firestore.'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDeleteUser = async (email: string) => {
    setIsSaving(true);
    try {
      await onDeleteRecord(email);
      setConfirmDeleteEmail(null);
      setFeedback({
        type: 'info',
        message: `Regla de permisos para ${email} eliminada.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: formatCloudError(err, 'No se pudo eliminar el registro en Firestore.'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Per-Module Company Database Handlers ---

  const openAddCompanyForm = () => {
    setEditingCompanyId(null);
    setCompNombre('');
    setCompCodigo('');
    setCompNit('');
    setCompPais(activeDbDefaultCountry);
    setCompMoneda(activeDbDefaultCurrency);
    setCompActivo(true);
    setCompFormError(null);
    setIsCompanyFormOpen(true);
  };

  const openEditCompanyForm = (comp: ModuleCompanyEntry) => {
    setEditingCompanyId(comp.id);
    setCompNombre(comp.nombre);
    setCompCodigo(comp.codigo || '');
    setCompNit(comp.nit || '');
    setCompPais(comp.pais || activeDbDefaultCountry);
    setCompMoneda(comp.moneda || activeDbDefaultCurrency);
    setCompActivo(comp.activo !== false);
    setCompFormError(null);
    setIsCompanyFormOpen(true);
  };

  const handleSaveCompanyEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompFormError(null);
    const cleanName = compNombre.trim();
    if (!cleanName) {
      setCompFormError('El nombre oficial de la sociedad es obligatorio.');
      return;
    }

    const key = normalizeCompanyKey(cleanName);
    const duplicate = selectedDbCompanies.find(
      (c) => normalizeCompanyKey(c.nombre) === key && c.id !== editingCompanyId
    );
    if (duplicate) {
      setCompFormError(
        `Ya existe una sociedad llamada "${duplicate.nombre}" en la base de datos de ${activeDbShortName}.`
      );
      return;
    }

    const entry = sanitizeModuleCompanyEntry({
      id:
        editingCompanyId ||
        `${isIntercompanyDbSelected ? `ic-${selectedIntercompanyScope}` : selectedDbModule}-comp-${Date.now()}`,
      nombre: cleanName,
      codigo: compCodigo,
      nit: compNit,
      pais: compPais || activeDbDefaultCountry,
      moneda: compMoneda || activeDbDefaultCurrency,
      activo: selectedDbModule === 'intercompany' ? true : compActivo,
    });

    const nextList = editingCompanyId
      ? selectedDbCompanies.map((c) => (c.id === editingCompanyId ? entry : c))
      : [...selectedDbCompanies, entry];

    setIsSaving(true);
    try {
      await saveCurrentDbCompanies(nextList);
      setIsCompanyFormOpen(false);
      setEditingCompanyId(null);
      setFeedback({
        type: 'success',
        message: currentUser
          ? `Sociedad "${entry.nombre}" guardada en ${activeDbDisplayName} y sincronizada en Firestore.`
          : `Sociedad "${entry.nombre}" guardada localmente en ${activeDbDisplayName}. Inicia sesión con Google para sincronizar en Firestore.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: formatCloudError(
          err,
          'No se pudo sincronizar la base de datos de sociedades en Firestore.'
        ),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleCompanyActive = async (comp: ModuleCompanyEntry) => {
    if (selectedDbModule === 'intercompany') return;
    const nextList = selectedDbCompanies.map((c) =>
      c.id === comp.id ? { ...c, activo: !(c.activo !== false) } : c
    );
    setIsSaving(true);
    try {
      await saveCurrentDbCompanies(nextList);
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: formatCloudError(err, 'Error al actualizar el estado de la sociedad.'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCompanyEntry = async (compId: string) => {
    const target = selectedDbCompanies.find((c) => c.id === compId);
    const nextList = selectedDbCompanies.filter((c) => c.id !== compId);
    setIsSaving(true);
    try {
      await saveCurrentDbCompanies(nextList);
      setConfirmDeleteCompId(null);
      setFeedback({
        type: 'info',
        message: `Sociedad "${target?.nombre || ''}" eliminada de ${activeDbShortName}.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: formatCloudError(err, 'Error al eliminar la sociedad en Firestore.'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyFromAnotherModule = async (sourceModId: FunctionalModuleId) => {
    if (sourceModId === selectedDbModule) return;
    const sourceList = moduleCompanyDatabases[sourceModId] || [];
    const existingKeys = new Set(
      selectedDbCompanies.map((c) => normalizeCompanyKey(c.nombre))
    );
    const additions: ModuleCompanyEntry[] = [];
    sourceList.forEach((src, idx) => {
      if (src.activo === false) return;
      const key = normalizeCompanyKey(src.nombre);
      if (!key || existingKeys.has(key)) return;
      existingKeys.add(key);
      additions.push(
        sanitizeModuleCompanyEntry(
          {
            id: `${selectedDbModule}-copy-${Date.now()}-${idx}`,
            nombre: src.nombre,
            codigo: src.codigo,
            nit: src.nit,
            pais: src.pais || activeDbDefaultCountry,
            moneda: src.moneda || activeDbDefaultCurrency,
            activo: true,
          },
          idx
        )
      );
    });

    setCopySourceModule('');
    if (additions.length === 0) {
      setFeedback({
        type: 'info',
        message: `Todas las sociedades activas de ${MODULE_COMPANY_DB_META[sourceModId].shortName} ya existen en ${activeDbShortName}.`,
      });
      return;
    }

    setIsSaving(true);
    try {
      await saveCurrentDbCompanies([...selectedDbCompanies, ...additions]);
      setFeedback({
        type: 'success',
        message: `Se copiaron ${additions.length} sociedad(es) independientes desde ${MODULE_COMPANY_DB_META[sourceModId].shortName} hacia ${activeDbShortName}.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: formatCloudError(err, 'Error al copiar sociedades entre módulos.'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportModuleCompaniesExcel = () => {
    const rows = selectedDbCompanies.map((c) => ({
      Nombre: c.nombre,
      Codigo: c.codigo || '',
      NIT: c.nit || '',
      Pais: c.pais || activeDbDefaultCountry,
      Moneda: c.moneda || activeDbDefaultCurrency,
      Activo: c.activo !== false ? 'SI' : 'NO',
    }));
    const ws = XLSX.utils.json_to_sheet(
      rows.length > 0
        ? rows
        : [
            {
              Nombre: 'Ejemplo Sociedad S.A.',
              Codigo: 'SOC-01',
              NIT: '900000000-1',
              Pais: activeDbDefaultCountry || 'Colombia',
              Moneda: activeDbDefaultCurrency,
              Activo: 'SI',
            },
          ]
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeDbShortName.slice(0, 31));
    const fileSuffix = isIntercompanyDbSelected
      ? `intercompany_${selectedIntercompanyScope}`
      : selectedDbModule;
    XLSX.writeFile(wb, `BD_Sociedades_${fileSuffix}.xlsx`);
  };

  const handleImportModuleCompaniesExcel = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) throw new Error('El archivo Excel no contiene hojas.');
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets[firstSheet],
        { defval: '' }
      );
      if (rawRows.length === 0) {
        throw new Error('No se encontraron filas de sociedades en el archivo.');
      }

      const pickCol = (row: Record<string, unknown>, candidates: string[]): string => {
        const entries = Object.entries(row);
        for (const cand of candidates) {
          const hit = entries.find(([k]) =>
            normalizeCompanyKey(k).includes(cand)
          );
          if (hit && String(hit[1] ?? '').trim()) {
            return String(hit[1]).trim();
          }
        }
        return '';
      };

      const existingKeys = new Set(
        selectedDbCompanies.map((c) => normalizeCompanyKey(c.nombre))
      );
      const imported: ModuleCompanyEntry[] = [];

      rawRows.forEach((row, idx) => {
        const nombre = pickCol(row, [
          'nombre',
          'sociedad',
          'empresa',
          'razon social',
          'compania',
        ]);
        const key = normalizeCompanyKey(nombre);
        if (!key || existingKeys.has(key)) return;
        existingKeys.add(key);

        const activeRaw = pickCol(row, ['activo', 'estado']).toLowerCase();
        const activo =
          activeRaw === 'no' || activeRaw === 'false' || activeRaw === 'inactivo'
            ? false
            : true;

        imported.push(
          sanitizeModuleCompanyEntry(
            {
              id: `${selectedDbModule}-xls-${Date.now()}-${idx}`,
              nombre,
              codigo: pickCol(row, ['codigo', 'cod', 'clave']),
              nit: pickCol(row, ['nit', 'tax', 'rfc', 'ruc', 'identificacion']),
              pais: pickCol(row, ['pais', 'country']) || activeDbDefaultCountry,
              moneda:
                pickCol(row, ['moneda', 'currency', 'divisa']) ||
                activeDbDefaultCurrency,
              activo: selectedDbModule === 'intercompany' ? true : activo,
            },
            idx
          )
        );
      });

      if (imported.length === 0) {
        setFeedback({
          type: 'info',
          message:
            'No se importaron sociedades nuevas (todas ya existían o faltaba la columna Nombre/Sociedad).',
        });
        return;
      }

      const merged = sanitizeModuleCompanyList([...selectedDbCompanies, ...imported]);
      setIsSaving(true);
      await saveCurrentDbCompanies(merged);
      setFeedback({
        type: 'success',
        message: `Se importaron ${imported.length} sociedad(es) a ${activeDbDisplayName}.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: formatCloudError(
          err,
          'No se pudo leer o sincronizar el archivo Excel de sociedades. Verifica las columnas Nombre, Codigo, NIT, Pais, Moneda.'
        ),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncClick = async () => {
    if (!currentUser) {
      setFeedback({
        type: 'info',
        message:
          'Inicia sesión con tu cuenta administradora de Google para publicar permisos y bases de empresas en Firestore.',
      });
      onSignInWithGoogle();
      return;
    }

    setFeedback(null);
    setIsSaving(true);
    try {
      await onSyncAllToCloud();
      setFeedback({
        type: 'success',
        message:
          'Permisos por correo, políticas, los 3 ámbitos de Intercompany (Internacionales, Nacionales y Anitox) y las bases de datos de empresas por módulo fueron publicados en Firestore.',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: formatCloudError(
          err,
          'No se pudo publicar en Firestore. Verifica tu conexión y que tu cuenta tenga permisos de administrador.'
        ),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const shareableAppUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : '';

  const navItems: {
    id: SettingsTab;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    counter?: string;
  }[] = [
    {
      id: 'usuarios',
      label: 'Usuarios y Permisos',
      description: 'Correos, módulos y empresas',
      icon: Users,
      counter: String(stats.total),
    },
    {
      id: 'empresas_modulos',
      label: 'BD Empresas por Módulo',
      description: 'Catálogo independiente (8 mód.)',
      icon: Database,
      counter: String(totalCatalogCompanies),
    },
    {
      id: 'roles',
      label: 'Matriz de Roles',
      description: 'Admin, Operador y Consulta',
      icon: ShieldCheck,
    },
    {
      id: 'politica',
      label: 'Política y Firebase Cloud',
      description: 'Seguridad y enlace compartido',
      icon: SlidersHorizontal,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F5F8FC] flex flex-col font-sans text-slate-800 antialiased">
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden backdrop-blur-xs"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-gradient-to-b from-[#0E224D] via-[#132E66] to-[#0B1C3F] text-white flex flex-col border-r border-blue-900/40 shadow-xl transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-white/10 bg-[#0A1838]/70">
          <button
            type="button"
            onClick={() => onSwitchModule('launcher')}
            title="Volver al Portal de Módulos Premex"
            className="bg-white rounded-xl px-2.5 py-1.5 flex items-center shadow-xs hover:opacity-95 transition-opacity cursor-pointer"
          >
            <PremexBrandLogo className="h-7 w-auto" />
          </button>

          <div className="flex items-center gap-1">
            <AppSwitcherMenu
              currentModule="ajustes"
              onSelectModule={(mod) => {
                setIsMobileMenuOpen(false);
                onSwitchModule(mod);
              }}
              canAccessModule={() => true}
              variant="dark"
            />
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              className="lg:hidden p-1.5 text-blue-200 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
              aria-label="Cerrar menú"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2.5">
          <AjustesModuleLogo className="w-8 h-8 shrink-0" />
          <div className="min-w-0">
            <h1 className="font-bold text-xs tracking-tight text-white truncate">
              Ajustes y Configuraciones
            </h1>
            <p className="text-[11px] text-sky-200/75 truncate">
              RBAC y BD por Módulo
            </p>
          </div>
        </div>

        <div className="px-4 pt-3 pb-1.5 text-[10px] font-semibold tracking-wider text-sky-200/55 uppercase">
          Administración
        </div>

        <nav className="flex-1 px-2.5 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={item.description}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#1E60A8] text-white font-semibold shadow-xs'
                    : 'text-blue-100/90 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-white' : 'text-sky-200/80'
                    }`}
                  />
                  <span className="text-[13px] font-medium leading-tight truncate">
                    {item.label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                  {item.counter && (
                    <span className="text-[11px] font-mono font-semibold tabular-nums opacity-85">
                      {item.counter}
                    </span>
                  )}
                  {active && <ChevronRight className="w-3.5 h-3.5 text-sky-200" />}
                </div>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10 bg-[#0A1838]/70">
          <button
            type="button"
            onClick={() => onSwitchModule('launcher')}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/8 hover:bg-white/14 border border-white/12 text-xs font-semibold text-sky-100 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver al Portal de Módulos</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
          <div className="px-4 sm:px-6 lg:px-8 min-h-[56px] py-2 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                aria-label="Abrir menú"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                  <button
                    type="button"
                    onClick={() => onSwitchModule('launcher')}
                    className="hover:text-[#1E60A8] transition-colors cursor-pointer"
                  >
                    Premex
                  </button>
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                  <span className="text-[#19377B] font-semibold">Ajustes y Configuraciones</span>
                </div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate leading-tight">
                  {activeTab === 'usuarios'
                    ? 'Permisos por Correo, Módulos y Sociedades'
                    : activeTab === 'empresas_modulos'
                    ? 'Base de Datos Independiente de Empresas por Módulo'
                    : activeTab === 'roles'
                    ? 'Matriz de Permisos por Rol'
                    : 'Política de Seguridad y Conexión Firebase / Google Cloud'}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSyncClick}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3.5 py-1.5 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Cloud className="w-3.5 h-3.5" />
                )}
                <span>
                  {isSaving
                    ? 'Publicando...'
                    : hasPendingCloudSync || anyModuleDbPending
                    ? 'Publicar Todo en Nube'
                    : 'Sincronizar Nube'}
                </span>
              </button>

              {currentUser ? (
                <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
                  {currentUser.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt={currentUser.displayName || 'Admin'}
                      className="w-7 h-7 rounded-full border border-slate-200"
                      title={currentUser.email || 'Administrador'}
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[#19377B]/10 text-[#19377B] flex items-center justify-center font-bold text-xs">
                      {currentUser.displayName ? currentUser.displayName[0] : 'A'}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={onSignOut}
                    title="Cerrar sesión"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onSignInWithGoogle}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Iniciar Sesión Google
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Feedback Banner */}
        {feedback && (
          <div className="px-4 sm:px-6 lg:px-8 pt-4 max-w-7xl mx-auto w-full">
            <div
              className={`px-4 py-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : feedback.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
            >
              <div className="flex items-start gap-2 min-w-0">
                {feedback.type === 'error' ? (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span className="font-medium break-words select-text leading-relaxed">
                  {feedback.message}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="p-1 opacity-70 hover:opacity-100 shrink-0 cursor-pointer"
                aria-label="Cerrar aviso"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
          {/* TAB 1: Usuarios y Permisos */}
          {activeTab === 'usuarios' && (
            <>
              {/* Clean Single-Elevation Stat Strip */}
              <section className="bg-white rounded-2xl border border-slate-200/90 grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                <div className="p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Correos Configurados
                  </div>
                  <div className="mt-1.5 text-2xl font-bold text-slate-900 font-mono tabular-nums">
                    {stats.total}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
                    {stats.active} activos · {stats.total - stats.active} suspendidos
                  </div>
                </div>

                <div className="p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Administradores
                  </div>
                  <div className="mt-1.5 text-2xl font-bold text-[#19377B] font-mono tabular-nums">
                    {stats.admins}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Control total de módulos y BD
                  </div>
                </div>

                <div className="p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Operadores
                  </div>
                  <div className="mt-1.5 text-2xl font-bold text-teal-700 font-mono tabular-nums">
                    {stats.operadores}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Operación por módulo y sociedad
                  </div>
                </div>

                <div className="p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Solo Consulta
                  </div>
                  <div className="mt-1.5 text-2xl font-bold text-slate-700 font-mono tabular-nums">
                    {stats.consulta}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Lectura y reportes por módulo
                  </div>
                </div>
              </section>

              {/* Toolbar */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={openNewUserModal}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Agregar Correo con Permisos</span>
                  </button>

                  <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/70">
                    {(
                      [
                        { id: 'ALL', label: 'Todos' },
                        { id: 'admin', label: 'Admins' },
                        { id: 'operador', label: 'Operadores' },
                        { id: 'consulta', label: 'Consulta' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setRoleFilter(tab.id)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                          roleFilter === tab.id
                            ? 'bg-white text-[#19377B] shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative w-full lg:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por correo, nombre o sociedad..."
                    className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      aria-label="Limpiar búsqueda"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Directory Table */}
              <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Directorio de Permisos por Correo
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {filteredRecords.length} de {records.length} usuarios
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-5">Usuario y Correo</th>
                        <th className="py-3 px-4">Rol</th>
                        <th className="py-3 px-4">
                          Módulos y Sociedades Autorizadas
                        </th>
                        <th className="py-3 px-5 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredRecords.map((rec) => {
                        const isSuper = normalizeEmail(rec.email) === SUPER_ADMIN_EMAIL;
                        const roleColor =
                          rec.role === 'admin'
                            ? 'text-[#19377B]'
                            : rec.role === 'operador'
                            ? 'text-teal-700'
                            : 'text-slate-600';

                        const functionalAssigned = ALL_FUNCTIONAL_MODULES.filter((m) =>
                          rec.allowedModules.includes(m)
                        );

                        return (
                          <tr
                            key={rec.id}
                            className={`transition-colors align-top ${
                              rec.active
                                ? 'hover:bg-slate-50/70'
                                : 'bg-slate-50/80 opacity-65'
                            }`}
                          >
                            <td className="py-3.5 px-5">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <span>{rec.displayName}</span>
                                {!rec.active && (
                                  <span className="text-[11px] font-semibold text-rose-600">
                                    · Suspendido
                                  </span>
                                )}
                              </div>
                              <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                                {rec.email}
                              </div>
                              {rec.notes && (
                                <div className="text-[11px] text-slate-400 mt-1 max-w-xs truncate">
                                  {rec.notes}
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className={`font-bold ${roleColor}`}>
                                {ROLE_METADATA[rec.role].label}
                              </div>
                              {rec.userType && (
                                <div className="text-[11px] font-medium text-slate-600 mt-0.5">
                                  {USER_TYPE_METADATA[rec.userType]?.shortLabel || rec.userType}
                                </div>
                              )}
                              {isSuper && (
                                <div className="text-[10px] text-slate-400">
                                  Principal protegido
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-4 max-w-[440px]">
                              {rec.role === 'admin' ? (
                                <div className="space-y-1">
                                  <div className="text-slate-700 font-medium">
                                    Todos los módulos y todas las bases de sociedades · Incluye
                                    Ajustes
                                  </div>
                                  {Array.isArray(rec.assignedEmployees) &&
                                    rec.assignedEmployees.length > 0 && (
                                      <div className="text-[10px] font-medium text-[#132B63]">
                                        Empleados asignados a liquidar ({rec.assignedEmployees.length}):{' '}
                                        {rec.assignedEmployees.join(', ')}
                                      </div>
                                    )}
                                </div>
                              ) : functionalAssigned.length === 0 ? (
                                <span className="text-rose-600 font-medium">
                                  Sin módulos asignados
                                </span>
                              ) : (
                                <div className="space-y-1.5">
                                  {functionalAssigned.map((modId) => {
                                    const rule = getRecordModuleCompanyRule(rec, modId);
                                    const modMeta = MODULE_COMPANY_DB_META[modId];
                                    const grantedPanels =
                                      modId === 'viaticos'
                                        ? Array.isArray(rec.viaticosPanels)
                                          ? rec.viaticosPanels
                                          : rec.userType
                                          ? USER_TYPE_METADATA[rec.userType]?.defaultViaticosPanels ||
                                            ALL_VIATICOS_PANELS
                                          : ALL_VIATICOS_PANELS
                                        : null;
                                    return (
                                      <div
                                        key={modId}
                                        className="flex items-start gap-2 text-xs leading-snug"
                                      >
                                        <ModuleEmblem
                                          moduleId={modId}
                                          className="w-4 h-4 shrink-0 mt-0.5"
                                        />
                                        <div className="min-w-0 flex-1">
                                          <div>
                                            <span className="font-semibold text-slate-800">
                                              {modMeta.shortName}:
                                            </span>{' '}
                                            {rule.scope === 'all' ? (
                                              <span className="text-slate-600">
                                                Todas las sociedades ({moduleCompanyDatabases[modId].filter((c) => c.activo !== false).length})
                                              </span>
                                            ) : (
                                              <span className="text-[#19377B]">
                                                <strong className="tabular-nums">
                                                  {rule.companies.length}
                                                </strong>{' '}
                                                —{' '}
                                                <span className="text-slate-600">
                                                  {rule.companies.join(', ') || 'Ninguna'}
                                                </span>
                                              </span>
                                            )}
                                          </div>
                                          {modId === 'viaticos' && grantedPanels && (
                                            <div className="text-[11px] text-[#1E60A8] mt-0.5">
                                              Paneles:{' '}
                                              <span className="font-medium text-slate-600">
                                                {grantedPanels
                                                  .map(
                                                    (p) =>
                                                      VIATICOS_PANEL_METADATA[p]?.shortLabel || p
                                                  )
                                                  .join(', ') || 'Ninguno'}
                                              </span>
                                            </div>
                                          )}
                                          {modId === 'viaticos' &&
                                            ((rec.assignedEmployees && rec.assignedEmployees.length > 0) ||
                                              rec.odooEmployeeName) && (
                                              <div className="text-[11px] text-slate-600 mt-0.5">
                                                <span className="font-semibold text-[#132B63]">
                                                  Empleados a liquidar (
                                                  {rec.assignedEmployees && rec.assignedEmployees.length > 0
                                                    ? rec.assignedEmployees.length
                                                    : 1}
                                                  ):
                                                </span>{' '}
                                                <span>
                                                  {rec.assignedEmployees && rec.assignedEmployees.length > 0
                                                    ? rec.assignedEmployees.slice(0, 3).join(', ') +
                                                      (rec.assignedEmployees.length > 3
                                                        ? ` +${rec.assignedEmployees.length - 3}`
                                                        : '')
                                                    : rec.odooEmployeeName}
                                                </span>
                                              </div>
                                            )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1">
                                {!isSuper && (
                                  <button
                                    type="button"
                                    onClick={() => onStartPreviewAs(rec.email)}
                                    title={`Previsualizar la plataforma con los permisos de ${rec.email}`}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#1E60A8] hover:bg-[#1E60A8]/10 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Previsualizar</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => openEditUserModal(rec)}
                                  title="Editar permisos"
                                  className="p-1.5 text-slate-500 hover:text-[#19377B] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>

                                {!isSuper && (
                                  <button
                                    type="button"
                                    onClick={() => handleQuickToggleActive(rec)}
                                    title={
                                      rec.active ? 'Suspender acceso' : 'Reactivar acceso'
                                    }
                                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                      rec.active
                                        ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                        : 'text-emerald-600 hover:bg-emerald-50'
                                    }`}
                                  >
                                    <Power className="w-4 h-4" />
                                  </button>
                                )}

                                {!isSuper &&
                                  (confirmDeleteEmail === rec.email ? (
                                    <div className="inline-flex items-center gap-1 ml-1">
                                      <button
                                        type="button"
                                        onClick={() => handleConfirmDeleteUser(rec.email)}
                                        className="px-2 py-1 text-[11px] font-semibold bg-rose-600 text-white rounded-lg cursor-pointer"
                                      >
                                        Eliminar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteEmail(null)}
                                        className="px-2 py-1 text-[11px] font-semibold text-slate-600 bg-slate-100 rounded-lg cursor-pointer"
                                      >
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteEmail(rec.email)}
                                      title="Eliminar regla"
                                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {/* TAB 2: Base de Datos de Empresas por Módulo */}
          {activeTab === 'empresas_modulos' && (
            <div className="space-y-6">
              {/* 6-Module Independent Database Selector */}
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {ALL_FUNCTIONAL_MODULES.map((modId) => {
                  const meta = MODULE_COMPANY_DB_META[modId];
                  const list = moduleCompanyDatabases[modId] || [];
                  const activeCount = list.filter((c) => c.activo !== false).length;
                  const sync = moduleDbSyncStatus[modId] || { status: 'idle' };
                  const isSelected = selectedDbModule === modId;

                  return (
                    <button
                      key={modId}
                      type="button"
                      onClick={() => {
                        setSelectedDbModule(modId);
                        setDbSearchQuery('');
                        setIsCompanyFormOpen(false);
                        setConfirmDeleteCompId(null);
                      }}
                      className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-white border-[#1E60A8] ring-2 ring-[#1E60A8]/20 shadow-xs'
                          : 'bg-white border-slate-200/90 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <ModuleEmblem moduleId={modId} className="w-9 h-9 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900 truncate">
                              {meta.name}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                              <span>{meta.status}</span>
                              <span className="text-slate-300">·</span>
                              <span
                                className={
                                  sync.status === 'saved'
                                    ? 'text-emerald-700 font-medium'
                                    : sync.status === 'pending'
                                    ? 'text-amber-700 font-medium'
                                    : sync.status === 'error'
                                    ? 'text-rose-600 font-medium'
                                    : 'text-slate-400'
                                }
                              >
                                {sync.status === 'saved'
                                  ? 'En Firestore'
                                  : sync.status === 'saving'
                                  ? 'Guardando...'
                                  : sync.status === 'pending'
                                  ? 'Pendiente nube'
                                  : sync.status === 'error'
                                  ? 'Error nube'
                                  : 'Catálogo listo'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-lg font-bold font-mono tabular-nums text-[#132B63]">
                            {activeCount}
                          </div>
                          <div className="text-[10px] text-slate-400">activas</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </section>

              {/* Selected Module Company Database Manager */}
              <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <ModuleEmblem
                      moduleId={selectedDbModule}
                      className="w-11 h-11 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-[#132B63]">
                          Base de Datos de Empresas — {activeDbDisplayName}
                        </h3>
                        <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          /{activeDbFirestorePath}
                        </span>
                      </div>
                      {selectedDbSync.lastSyncedAtIso && (
                        <div className="text-[11px] text-slate-400 mt-1">
                          Sincronizado: {formatShortDate(selectedDbSync.lastSyncedAtIso)}
                          {selectedDbSync.updatedByName ? ` · ${selectedDbSync.updatedByName}` : ''}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={openAddCompanyForm}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Agregar Sociedad</span>
                    </button>

                    <select
                      aria-label="Copiar sociedades desde otro módulo"
                      value={copySourceModule}
                      onChange={(e) => {
                        const val = e.target.value as FunctionalModuleId | '';
                        setCopySourceModule(val);
                        if (val) void handleCopyFromAnotherModule(val);
                      }}
                      className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl cursor-pointer focus:outline-hidden focus:border-[#1E60A8]"
                    >
                      <option value="">Copiar desde otro módulo...</option>
                      {ALL_FUNCTIONAL_MODULES.filter((m) => m !== selectedDbModule).map(
                        (m) => (
                          <option key={m} value={m}>
                            Copiar desde {MODULE_COMPANY_DB_META[m].shortName} (
                            {moduleCompanyDatabases[m].length})
                          </option>
                        )
                      )}
                    </select>

                    <input
                      ref={excelInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleImportModuleCompaniesExcel}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => excelInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Importar Excel</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportModuleCompaniesExcel}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Exportar Excel</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={async () => {
                        if (!currentUser) {
                          onSignInWithGoogle();
                          return;
                        }
                        setIsSaving(true);
                        try {
                          await saveCurrentDbCompanies(selectedDbCompanies);
                          setFeedback({
                            type: 'success',
                            message: `Catálogo de ${activeDbDisplayName} publicado en Firestore.`,
                          });
                        } catch (err: unknown) {
                          setFeedback({
                            type: 'error',
                            message: formatCloudError(
                              err,
                              'No se pudo publicar el catálogo en Firestore.'
                            ),
                          });
                        } finally {
                          setIsSaving(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#19377B] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors cursor-pointer"
                    >
                      <Cloud className="w-3.5 h-3.5" />
                      <span>Guardar Nube</span>
                    </button>
                  </div>
                </div>

                {/* Intercompany 3-Scope Sub-Selector (Internacionales | Nacionales | Anitox) */}
                {isIntercompanyDbSelected && (
                  <div className="px-5 py-3 bg-[#F5F8FC] border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="text-xs font-semibold text-[#132B63]">
                      Ámbito de Conciliación Intercompany:
                    </div>
                    <div className="inline-flex flex-wrap items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200/90">
                      {INTERCOMPANY_SCOPES.map((sc) => {
                        const meta = INTERCOMPANY_SCOPE_META[sc];
                        const count = (intercompanyScopeCompanies?.[sc] || []).length;
                        const scSync = intercompanyScopeSyncStatus?.[sc];
                        const isScActive = selectedIntercompanyScope === sc;
                        return (
                          <button
                            key={sc}
                            type="button"
                            onClick={() => {
                              setSelectedIntercompanyScope(sc);
                              setDbSearchQuery('');
                              setIsCompanyFormOpen(false);
                              setConfirmDeleteCompId(null);
                            }}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              isScActive
                                ? 'bg-[#1E60A8] text-white shadow-2xs'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            <span>{meta.label}</span>
                            <span
                              className={`text-[10px] font-mono tabular-nums ${
                                isScActive ? 'text-sky-100' : 'text-slate-400'
                              }`}
                            >
                              {count} · {meta.defaultCurrency}
                            </span>
                            {scSync?.status === 'pending' && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-amber-400"
                                title="Pendiente por sincronizar"
                              />
                            )}
                            {scSync?.status === 'error' && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-rose-400"
                                title={scSync.errorMsg || 'Error de sincronización'}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Inline Add / Edit Society Form */}
                {isCompanyFormOpen && (
                  <form
                    onSubmit={handleSaveCompanyEntry}
                    className="p-5 bg-slate-50/90 border-b border-slate-200 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#132B63]">
                        {editingCompanyId
                          ? `Editar Sociedad en ${activeDbShortName}`
                          : `Nueva Sociedad para ${activeDbDisplayName}`}
                      </h4>
                      <button
                        type="button"
                        onClick={() => setIsCompanyFormOpen(false)}
                        className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {compFormError && (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{compFormError}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                      <div className="lg:col-span-2">
                        <label className="block font-semibold text-slate-700 mb-1">
                          Nombre Oficial / Sociedad *
                        </label>
                        <input
                          type="text"
                          required
                          value={compNombre}
                          onChange={(e) => setCompNombre(e.target.value)}
                          placeholder="Ej. Premex S.A.S."
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-hidden focus:border-[#1E60A8]"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Código Interno
                        </label>
                        <input
                          type="text"
                          value={compCodigo}
                          onChange={(e) => setCompCodigo(e.target.value)}
                          placeholder="Ej. SOC-100"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono focus:outline-hidden focus:border-[#1E60A8]"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          NIT / Tax ID
                        </label>
                        <input
                          type="text"
                          value={compNit}
                          onChange={(e) => setCompNit(e.target.value)}
                          placeholder="Ej. 890900148-1"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono focus:outline-hidden focus:border-[#1E60A8]"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          País / Moneda
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                          <input
                            type="text"
                            value={compPais}
                            onChange={(e) => setCompPais(e.target.value)}
                            placeholder="País"
                            className="col-span-2 px-2.5 py-2 rounded-xl border border-slate-300 bg-white focus:outline-hidden focus:border-[#1E60A8]"
                          />
                          <input
                            type="text"
                            value={compMoneda}
                            onChange={(e) => setCompMoneda(e.target.value.toUpperCase())}
                            placeholder="USD"
                            maxLength={10}
                            className="px-2 py-2 rounded-xl border border-slate-300 bg-white font-mono uppercase focus:outline-hidden focus:border-[#1E60A8]"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      {selectedDbModule !== 'intercompany' ? (
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={compActivo}
                            onChange={(e) => setCompActivo(e.target.checked)}
                            className="rounded border-slate-300 text-[#1E60A8] focus:ring-[#1E60A8]"
                          />
                          <span>Sociedad activa disponible para asignar permisos</span>
                        </label>
                      ) : (
                        <span className="text-[11px] text-slate-500">
                          Sincronizado con {activeDbShortName}.
                        </span>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsCompanyFormOpen(false)}
                          className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-xl cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={isSaving}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] disabled:opacity-60 rounded-xl cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            {editingCompanyId ? 'Actualizar Sociedad' : 'Guardar Sociedad'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* Search & Count Strip */}
                <div className="px-5 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/40">
                  <div className="relative w-full sm:w-80">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={dbSearchQuery}
                      onChange={(e) => setDbSearchQuery(e.target.value)}
                      placeholder={`Buscar en BD de ${activeDbShortName}...`}
                      className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-[#1E60A8]"
                    />
                    {dbSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setDbSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 tabular-nums">
                    {filteredDbCompanies.length} de {selectedDbCompanies.length} sociedades en{' '}
                    <strong className="text-slate-700">{activeDbShortName}</strong>
                  </div>
                </div>

                {/* Societies Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-5">Sociedad / Razón Social</th>
                        <th className="py-3 px-4">Código</th>
                        <th className="py-3 px-4">NIT / Tax ID</th>
                        <th className="py-3 px-4">País</th>
                        <th className="py-3 px-4">Moneda</th>
                        <th className="py-3 px-4">Estado</th>
                        <th className="py-3 px-5 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDbCompanies.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="py-10 px-5 text-center text-slate-500"
                          >
                            No hay sociedades registradas en este filtro. Agrega una sociedad
                            manualmente, importa desde Excel o copia desde otro módulo.
                          </td>
                        </tr>
                      ) : (
                        filteredDbCompanies.map((comp) => {
                          const isActive = comp.activo !== false;
                          return (
                            <tr
                              key={comp.id}
                              className={`transition-colors ${
                                isActive
                                  ? 'hover:bg-slate-50/70'
                                  : 'bg-slate-50/80 opacity-60'
                              }`}
                            >
                              <td className="py-3 px-5 font-semibold text-slate-900">
                                {comp.nombre}
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-600">
                                {comp.codigo || '—'}
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-600">
                                {comp.nit || '—'}
                              </td>
                              <td className="py-3 px-4 text-slate-600">
                                {comp.pais || '—'}
                              </td>
                              <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                                {comp.moneda || selectedDbMeta.defaultCurrency}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`font-semibold ${
                                    isActive ? 'text-emerald-700' : 'text-slate-400'
                                  }`}
                                >
                                  {isActive ? 'Activa' : 'Inactiva'}
                                </span>
                              </td>
                              <td className="py-3 px-5 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openEditCompanyForm(comp)}
                                    title="Editar sociedad"
                                    className="p-1.5 text-slate-500 hover:text-[#19377B] hover:bg-slate-100 rounded-lg cursor-pointer"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>

                                  {selectedDbModule !== 'intercompany' && (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleCompanyActive(comp)}
                                      title={
                                        isActive
                                          ? 'Desactivar sociedad'
                                          : 'Activar sociedad'
                                      }
                                      className={`p-1.5 rounded-lg cursor-pointer ${
                                        isActive
                                          ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                          : 'text-emerald-600 hover:bg-emerald-50'
                                      }`}
                                    >
                                      <Power className="w-4 h-4" />
                                    </button>
                                  )}

                                  {confirmDeleteCompId === comp.id ? (
                                    <div className="inline-flex items-center gap-1 ml-1">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteCompanyEntry(comp.id)}
                                        className="px-2 py-1 text-[11px] font-semibold bg-rose-600 text-white rounded-lg cursor-pointer"
                                      >
                                        Eliminar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteCompId(null)}
                                        className="px-2 py-1 text-[11px] font-semibold text-slate-600 bg-slate-100 rounded-lg cursor-pointer"
                                      >
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteCompId(comp.id)}
                                      title="Eliminar sociedad"
                                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* TAB 3: Matriz de Roles */}
          {activeTab === 'roles' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {(['admin', 'operador', 'consulta'] as UserRole[]).map((role) => {
                  const meta = ROLE_METADATA[role];
                  return (
                    <div
                      key={role}
                      className="bg-white rounded-2xl border border-slate-200/90 p-6 flex flex-col justify-between"
                    >
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Nivel de Acceso
                        </div>
                        <h3 className="text-lg font-bold text-[#132B63] mt-1">
                          {meta.label}
                        </h3>
                        <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                          {meta.description}
                        </p>
                        <ul className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-700">
                          {meta.capabilities.map((cap, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <Check className="w-3.5 h-3.5 text-[#1E60A8] shrink-0 mt-0.5" />
                              <span>{cap}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>

              <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h4 className="text-sm font-bold text-slate-900">
                    Comparativa de Permisos por Rol
                  </h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-5">Acción / Funcionalidad</th>
                        <th className="py-3 px-4 text-[#19377B]">Administrador</th>
                        <th className="py-3 px-4 text-teal-800">Operador</th>
                        <th className="py-3 px-5 text-slate-700">Solo Consulta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ROLE_CAPABILITY_ROWS.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/60">
                          <td className="py-3 px-5 font-medium text-slate-800">
                            {row.capability}
                          </td>
                          <td className="py-3 px-4 font-semibold text-emerald-700">
                            {row.admin}
                          </td>
                          <td
                            className={`py-3 px-4 font-medium ${
                              row.operador === 'Bloqueado'
                                ? 'text-rose-600'
                                : 'text-slate-700'
                            }`}
                          >
                            {row.operador}
                          </td>
                          <td
                            className={`py-3 px-5 font-medium ${
                              row.consulta === 'Bloqueado'
                                ? 'text-rose-600'
                                : 'text-slate-700'
                            }`}
                          >
                            {row.consulta}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* TAB 4: Política de Seguridad y Firebase / Google Cloud */}
          {activeTab === 'politica' && (
            <div className="space-y-6 max-w-4xl">
              {/* Strict Mode Policy Card */}
              <section className="bg-white rounded-2xl border border-slate-200/90 p-6 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Lock className="w-5 h-5 text-[#19377B] shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Modo Estricto por Lista Autorizada
                      </h3>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        Activo: solo ingresan correos registrados. Desactivado: correos no listados entran en <strong>Solo Consulta</strong>.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={policy.strictMode}
                    onClick={async () => {
                      setIsSaving(true);
                      try {
                        await onTogglePolicyStrictMode(!policy.strictMode);
                        setFeedback({
                          type: 'success',
                          message: !policy.strictMode
                            ? 'Modo Estricto activado: solo correos registrados podrán ingresar.'
                            : 'Modo Estricto desactivado: correos no listados ingresan como Solo Consulta.',
                        });
                      } catch (err: unknown) {
                        setFeedback({
                          type: 'error',
                          message: formatCloudError(
                            err,
                            'Error al actualizar la política en Firestore.'
                          ),
                        });
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${
                      policy.strictMode ? 'bg-[#1E60A8]' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform ${
                        policy.strictMode ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="pt-4 border-t border-slate-100 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-800">
                      Administrador Principal Protegido
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                      {SUPER_ADMIN_EMAIL} · Nunca pierde privilegios de administrador
                    </div>
                  </div>

                  <div className="sm:text-right">
                    <div className="font-semibold text-slate-800">
                      Última Sincronización RBAC
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {lastCloudSyncIso
                        ? formatShortDate(lastCloudSyncIso)
                        : 'Pendiente de sincronización en la nube'}
                    </div>
                  </div>
                </div>
              </section>

              {/* Firebase & Google Cloud Sharing Connection Card (Read-only Metadata, Zero API Key UI) */}
              <section className="bg-white rounded-2xl border border-slate-200/90 p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Server className="w-5 h-5 text-[#1E60A8] shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Conexión Activa con Firebase y Google Cloud
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Entorno Firestore y enlace compartido de la plataforma.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSyncClick}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] disabled:opacity-60 rounded-xl transition-colors shrink-0 cursor-pointer"
                  >
                    {isSaving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Cloud className="w-3.5 h-3.5" />
                    )}
                    <span>Publicar Todo en Firestore</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Proyecto Firebase / Google Cloud
                    </div>
                    <div className="font-mono font-semibold text-slate-900 mt-1 truncate">
                      {activeFirebaseInfo.projectId || 'No configurado'}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Base de Datos Firestore
                    </div>
                    <div className="font-mono font-semibold text-slate-900 mt-1 truncate">
                      {activeFirebaseInfo.databaseId}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Dominio de Autenticación Google
                    </div>
                    <div className="font-mono text-slate-800 mt-1 truncate">
                      {activeFirebaseInfo.authDomain || 'Dominio predeterminado'}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Origen de Credenciales
                    </div>
                    <div className="font-semibold text-slate-800 mt-1">
                      {activeFirebaseInfo.configSource === 'env'
                        ? 'Variables de entorno (.env personalizado)'
                        : 'Configuración integrada del proyecto Firebase'}
                    </div>
                  </div>
                </div>

                {/* Shareable App URL */}
                {shareableAppUrl && (
                  <div className="p-4 rounded-xl bg-[#F5F8FC] border border-blue-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Link2 className="w-4 h-4 text-[#1E60A8] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-[#132B63]">
                          Enlace para compartir la Suite con tu equipo
                        </div>
                        <div className="font-mono text-[11px] text-slate-600 truncate">
                          {shareableAppUrl}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(shareableAppUrl);
                        setCopiedShareUrl(true);
                        setTimeout(() => setCopiedShareUrl(false), 2000);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#132B63] bg-white hover:bg-blue-50 border border-blue-200 rounded-lg shrink-0 cursor-pointer"
                    >
                      {copiedShareUrl ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Enlace Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#1E60A8]" />
                          <span>Copiar Enlace</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Per-Module Firestore Sync Matrix */}
                <div className="pt-2">
                  <div className="text-xs font-bold text-slate-800 mb-2.5">
                    Estado en Firestore de las Bases de Datos de Sociedades por Módulo
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                    {ALL_FUNCTIONAL_MODULES.map((modId) => {
                      const meta = MODULE_COMPANY_DB_META[modId];
                      const sync = moduleDbSyncStatus[modId] || { status: 'idle' };
                      const count = moduleCompanyDatabases[modId].filter(
                        (c) => c.activo !== false
                      ).length;
                      return (
                        <div
                          key={modId}
                          className="p-3 rounded-xl border border-slate-200/80 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <ModuleEmblem
                              moduleId={modId}
                              className="w-6 h-6 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 truncate">
                                {meta.shortName}
                              </div>
                              <div className="text-[10px] text-slate-500 tabular-nums">
                                {count} soc. ·{' '}
                                {sync.status === 'saved'
                                  ? 'Sincronizado'
                                  : sync.status === 'pending'
                                  ? 'Pendiente'
                                  : sync.status === 'error'
                                  ? 'Error'
                                  : 'Local / listo'}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDbModule(modId);
                              setActiveTab('empresas_modulos');
                            }}
                            className="text-[11px] font-semibold text-[#1E60A8] hover:underline shrink-0 cursor-pointer"
                          >
                            Ver BD
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      {/* Add / Edit User Permission Modal */}
      {isEditorOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsEditorOpen(false)}
        >
          <form
            onSubmit={handleSubmitForm}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#132B63]">
                  {isEditingExisting
                    ? 'Editar Permisos de Usuario'
                    : 'Asignar Permisos por Correo'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                aria-label="Cerrar editor"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto text-xs">
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Identity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Correo Electrónico Corporativo *
                  </label>
                  <input
                    type="email"
                    required
                    disabled={isEditingExisting}
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="nombre.apellido@premexcorp.com"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs disabled:bg-slate-100 disabled:text-slate-500 focus:outline-hidden focus:border-[#1E60A8]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nombre Completo / Cargo
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ej. María Gómez — Analista Contable"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#1E60A8]"
                  />
                </div>
              </div>

              {/* User Functional Profile Type */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="font-semibold text-slate-700">
                    Tipo de Usuario / Perfil Funcional *
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Preconfigura el rol y los paneles sugeridos
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {ALL_USER_TYPES.map((typeId) => {
                    const meta = USER_TYPE_METADATA[typeId];
                    const selected = formUserType === typeId;
                    const disabled = isEditingSuperAdmin && typeId !== 'administrador';
                    return (
                      <button
                        key={typeId}
                        type="button"
                        disabled={disabled}
                        onClick={() => handleSelectUserType(typeId)}
                        className={`text-left p-3 rounded-xl border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          selected
                            ? 'border-[#1E60A8] bg-[#1E60A8]/8 ring-1 ring-[#1E60A8]/30'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-bold text-slate-900">{meta.label}</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1E60A8]">
                            {ROLE_METADATA[meta.recommendedRole].shortLabel}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                          {meta.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block font-semibold text-slate-700 mb-2">
                  Nivel de Permisos (Rol Base) *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(['admin', 'operador', 'consulta'] as UserRole[]).map((role) => {
                    const selected = formRole === role;
                    const disabled = isEditingSuperAdmin && role !== 'admin';
                    return (
                      <button
                        key={role}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setFormRole(role);
                          if (role === 'admin') {
                            setFormUserType('administrador');
                            setFormModules([...ALL_SUITE_MODULES]);
                            setFormViaticosPanels([...ALL_VIATICOS_PANELS]);
                          } else {
                            if (formUserType === 'administrador') {
                              const fallbackType: UserTypeId =
                                role === 'operador' ? 'liquidador' : 'auditor';
                              setFormUserType(fallbackType);
                              setFormViaticosPanels([
                                ...USER_TYPE_METADATA[fallbackType].defaultViaticosPanels,
                              ]);
                            }
                            setFormModules((prev) => {
                              const cleaned = prev.filter((m) => m !== 'ajustes');
                              const next =
                                cleaned.length > 0
                                  ? cleaned
                                  : (['intercompany', 'bancos'] as SuiteModuleId[]);
                              setFormModuleCompanyAccess((prevMap) =>
                                sanitizeModuleCompanyAccess(prevMap, next, 'all', [])
                              );
                              return next;
                            });
                          }
                        }}
                        className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          selected
                            ? 'border-[#1E60A8] bg-[#1E60A8]/8 ring-1 ring-[#1E60A8]/30'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="font-bold text-slate-900">
                          {ROLE_METADATA[role].label}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                          {role === 'admin'
                            ? 'Control total de módulos, BD de empresas y permisos.'
                            : role === 'operador'
                            ? 'Opera y guarda en sus módulos y sociedades asignadas.'
                            : 'Solo lectura y exportación en sus módulos asignados.'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 1: Enable Modules */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-semibold text-slate-700">
                    1. Módulos Habilitados para este Correo
                  </label>
                  {formRole === 'admin' && (
                    <span className="text-[11px] text-[#1E60A8] font-medium">
                      Administradores acceden a todos los módulos y a todas las sociedades
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {ALL_FUNCTIONAL_MODULES.map((modId) => {
                    const meta = MODULE_COMPANY_DB_META[modId];
                    const checked = formRole === 'admin' || formModules.includes(modId);
                    const dbCount = moduleCompanyDatabases[modId].filter(
                      (c) => c.activo !== false
                    ).length;
                    return (
                      <label
                        key={modId}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-colors ${
                          formRole === 'admin'
                            ? 'bg-slate-50 border-slate-200 cursor-default'
                            : checked
                            ? 'bg-[#1E60A8]/6 border-[#1E60A8]/45 cursor-pointer'
                            : 'bg-white border-slate-200 hover:bg-slate-50 cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={formRole === 'admin'}
                          onChange={() => handleToggleModule(modId)}
                          className="rounded border-slate-300 text-[#1E60A8] focus:ring-[#1E60A8]"
                        />
                        <ModuleEmblem moduleId={modId} className="w-7 h-7 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">
                            {meta.shortName}
                          </div>
                          <div className="text-[10px] text-slate-500 tabular-nums">
                            {dbCount} soc. en BD · {meta.status}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Granular Viáticos Lateral Panels Selector */}
                {(formRole === 'admin' || formModules.includes('viaticos')) && (
                  <div className="mt-3 p-4 rounded-2xl border border-[#1E60A8]/25 bg-sky-50/45 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-[#132B63]">
                          Opciones / Paneles Laterales visibles en Liquidación de Viáticos
                        </div>
                        <div className="text-[11px] text-slate-600">
                          Elige exactamente qué pestañas del menú lateral verá este usuario al ingresar a Viáticos.
                        </div>
                      </div>
                      {formRole !== 'admin' && (
                        <div className="flex items-center gap-2.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() => setFormViaticosPanels([...ALL_VIATICOS_PANELS])}
                            className="font-semibold text-[#1E60A8] hover:underline cursor-pointer"
                          >
                            Todas
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() =>
                              setFormViaticosPanels([
                                'cerradas',
                                'contabilidad',
                                'historial',
                                'correos',
                              ])
                            }
                            className="font-semibold text-slate-700 hover:underline cursor-pointer"
                          >
                            Perfil Contabilidad
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {ALL_VIATICOS_PANELS.map((panelId) => {
                        const pMeta = VIATICOS_PANEL_METADATA[panelId];
                        const isChecked =
                          formRole === 'admin' || formViaticosPanels.includes(panelId);
                        return (
                          <label
                            key={panelId}
                            className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-colors ${
                              formRole === 'admin'
                                ? 'bg-white/70 border-slate-200 cursor-default'
                                : isChecked
                                ? 'bg-white border-[#1E60A8]/50 shadow-2xs cursor-pointer'
                                : 'bg-white/60 border-slate-200 hover:bg-white cursor-pointer'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={formRole === 'admin'}
                              onChange={() => handleToggleViaticosPanel(panelId)}
                              className="mt-0.5 rounded border-slate-300 text-[#1E60A8] focus:ring-[#1E60A8]"
                            />
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 leading-tight">
                                {pMeta.label}
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                                {pMeta.description}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    {/* Employee Assignment from Empleados Catalog (No forced principal) */}
                    <div className="pt-3 mt-2 border-t border-[#1E60A8]/15 space-y-2.5">
                      <div>
                        <div className="text-xs font-bold text-[#132B63]">
                          Empleados asignados para liquidar (BD Empleados)
                        </div>
                        <div className="text-[11px] text-slate-600">
                          Selecciona únicamente los empleados del listado oficial que este usuario podrá elegir en <strong>Nombre / Liquidador</strong> (sin empleado principal sugerido).
                        </div>
                      </div>

                      {/* Multi-Employee Assignment Checklist for Liquidaciones */}
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[11px] font-bold text-[#132B63]">
                            Asignados ({formAssignedEmployees.length})
                          </div>
                          <div className="flex items-center gap-2">
                            {formAssignedEmployees.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setFormAssignedEmployees([])}
                                className="text-[10px] font-semibold text-rose-600 hover:underline cursor-pointer"
                              >
                                Limpiar ({formAssignedEmployees.length})
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={employeeAssignSearch}
                            onChange={(e) => setEmployeeAssignSearch(e.target.value)}
                            placeholder="Buscar empleado en BD Empleados por nombre o centro de costo..."
                            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:bg-white focus:outline-hidden focus:border-[#1E60A8]"
                          />
                        </div>

                        <div className="max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
                          {resolvedOdooCatalogs.employees
                            .filter((emp) => {
                              if (emp.activo === false) return false;
                              const q = employeeAssignSearch.trim().toLowerCase();
                              if (!q) return true;
                              return (
                                emp.nombreCompleto.toLowerCase().includes(q) ||
                                (emp.centroCosto || '').toLowerCase().includes(q) ||
                                (emp.email || '').toLowerCase().includes(q)
                              );
                            })
                            .map((emp) => {
                              const upperName = emp.nombreCompleto.trim().toUpperCase();
                              const isChecked = formAssignedEmployees.includes(upperName);
                              return (
                                <label
                                  key={emp.id}
                                  className={`flex items-start gap-2 p-2 rounded-lg border text-[11px] cursor-pointer transition-colors ${
                                    isChecked
                                      ? 'bg-[#1E60A8]/8 border-[#1E60A8]/40 text-[#132B63]'
                                      : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-100/70'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      setFormAssignedEmployees((prev) =>
                                        prev.includes(upperName)
                                          ? prev.filter((x) => x !== upperName)
                                          : [...prev, upperName]
                                      );
                                    }}
                                    className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 text-[#1E60A8]"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="font-bold truncate">{emp.nombreCompleto}</div>
                                    <div className="text-[10px] text-slate-500 truncate">
                                      {emp.centroCosto || 'Sin C.C.'}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                        </div>
                      </div>

                      {/* Optional Cost Center Override */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Centro de Costo (Opcional / Hereda del empleado)
                          </label>
                          <select
                            value={formCentroCosto}
                            onChange={(e) => {
                              const nextCC = e.target.value;
                              setFormCentroCosto(nextCC);
                              const ccEntry = findMatchingCostCenterEntry(
                                nextCC,
                                undefined,
                                resolvedOdooCatalogs.costCenters
                              );
                              if (ccEntry) {
                                setFormOdooAnalyticDistribution(ccEntry.analyticDistribution);
                              }
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs focus:outline-hidden focus:border-[#1E60A8]"
                          >
                            <option value="">-- Heredar de cada empleado --</option>
                            {resolvedOdooCatalogs.costCenters
                              .filter((cc) => cc.activo !== false)
                              .map((cc) => (
                                <option key={cc.id} value={cc.cuentaAnalitica}>
                                  {cc.cuentaAnalitica} ({cc.analyticDistribution})
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            C.C. Interno Odoo (`analytic_distribution`)
                          </label>
                          <input
                            type="text"
                            value={formOdooAnalyticDistribution}
                            onChange={(e) =>
                              setFormOdooAnalyticDistribution(e.target.value)
                            }
                            placeholder='Opcional: {"520": 100.0}'
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono focus:outline-hidden focus:border-[#1E60A8]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2: Independent Per-Module Company Access */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-[#1E60A8]" />
                    <span>2. Sociedades Permitidas por Módulo</span>
                  </label>
                </div>

                {formRole === 'admin' ? (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600">
                    El rol Administrador consulta y administra todas las bases de datos de
                    sociedades de todos los módulos.
                  </div>
                ) : enabledFunctionalModulesInForm.length === 0 ? (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
                    Activa al menos un módulo arriba para asignar sus sociedades permitidas.
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50/40">
                    {/* Enabled Module Sub-Tabs */}
                    <div className="flex flex-wrap gap-1 p-2 bg-slate-100/90 border-b border-slate-200">
                      {enabledFunctionalModulesInForm.map((modId) => {
                        const meta = MODULE_COMPANY_DB_META[modId];
                        const rule = formModuleCompanyAccess[modId] || {
                          scope: 'all' as CompanyAccessScope,
                          companies: [] as string[],
                        };
                        const isActiveTab = effectiveActiveConfigModule === modId;
                        const missingCompanies =
                          rule.scope === 'selected' && rule.companies.length === 0;

                        return (
                          <button
                            key={modId}
                            type="button"
                            onClick={() => {
                              setActiveConfigModule(modId);
                              setCompanySearch('');
                              setQuickAddCompanyInput('');
                            }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              isActiveTab
                                ? 'bg-white text-[#132B63] shadow-2xs ring-1 ring-[#1E60A8]/30'
                                : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                            }`}
                          >
                            <ModuleEmblem moduleId={modId} className="w-4 h-4 shrink-0" />
                            <span>{meta.shortName}</span>
                            <span
                              className={`text-[10px] font-mono tabular-nums ${
                                missingCompanies
                                  ? 'text-rose-600 font-bold'
                                  : rule.scope === 'selected'
                                  ? 'text-[#1E60A8]'
                                  : 'text-slate-400'
                              }`}
                            >
                              {rule.scope === 'all'
                                ? '(Todas)'
                                : `(${rule.companies.length})`}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Selected Module's Company Picker */}
                    <div className="p-4 space-y-3 bg-white">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-600">
                          Configurando alcance para{' '}
                          <strong className="text-[#132B63]">
                            {MODULE_COMPANY_DB_META[effectiveActiveConfigModule].name}
                          </strong>{' '}
                          <span className="font-mono text-[10px] text-slate-400">
                            (/{MODULE_COMPANY_DB_META[effectiveActiveConfigModule].firestorePath})
                          </span>
                        </div>
                      </div>

                      <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200/70 w-full">
                        <button
                          type="button"
                          onClick={() =>
                            setModuleScopeInForm(effectiveActiveConfigModule, 'all')
                          }
                          className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                            activeModuleRule.scope === 'all'
                              ? 'bg-white text-[#19377B] shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Todas las de{' '}
                          {MODULE_COMPANY_DB_META[effectiveActiveConfigModule].shortName} (
                          {
                            moduleCompanyDatabases[effectiveActiveConfigModule].filter(
                              (c) => c.activo !== false
                            ).length
                          }
                          )
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setModuleScopeInForm(effectiveActiveConfigModule, 'selected')
                          }
                          className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                            activeModuleRule.scope === 'selected'
                              ? 'bg-white text-[#19377B] shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Solo sociedades seleccionadas ({activeModuleRule.companies.length})
                        </button>
                      </div>

                      {activeModuleRule.scope === 'selected' && (
                        <div className="space-y-3 pt-1">
                          <div className="flex flex-col sm:flex-row gap-2">
                            <div className="relative flex-1">
                              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={companySearch}
                                onChange={(e) => setCompanySearch(e.target.value)}
                                placeholder={`Filtrar sociedades de ${MODULE_COMPANY_DB_META[effectiveActiveConfigModule].shortName}...`}
                                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#1E60A8]"
                              />
                            </div>
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                value={quickAddCompanyInput}
                                onChange={(e) => setQuickAddCompanyInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleQuickAddCompanyToModuleDb();
                                  }
                                }}
                                placeholder={`Nueva en BD ${MODULE_COMPANY_DB_META[effectiveActiveConfigModule].shortName}...`}
                                className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg w-44 focus:outline-hidden focus:border-[#1E60A8]"
                              />
                              <button
                                type="button"
                                disabled={
                                  isQuickAddingCompany || !quickAddCompanyInput.trim()
                                }
                                onClick={() => void handleQuickAddCompanyToModuleDb()}
                                className="px-2.5 py-1.5 text-xs font-semibold text-[#19377B] bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-300 rounded-lg cursor-pointer whitespace-nowrap"
                              >
                                {isQuickAddingCompany ? 'Añadiendo...' : '+ Añadir a BD'}
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>
                              Sociedades en{' '}
                              <strong className="text-slate-700">
                                {MODULE_COMPANY_DB_META[effectiveActiveConfigModule].shortName}
                              </strong>
                            </span>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={handleSelectAllCompaniesInActiveModule}
                                className="text-[#1E60A8] font-semibold hover:underline cursor-pointer"
                              >
                                Marcar todas
                              </button>
                              <button
                                type="button"
                                onClick={handleClearCompaniesInActiveModule}
                                className="text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                              >
                                Limpiar
                              </button>
                            </div>
                          </div>

                          <div className="max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
                            {activeModuleCompanyOptions.length === 0 ? (
                              <div className="col-span-2 py-4 text-center text-slate-400">
                                No se encontraron sociedades en la BD de este módulo. Usa
                                &ldquo;+ Añadir a BD&rdquo; para crear una.
                              </div>
                            ) : (
                              activeModuleCompanyOptions.map((opt) => {
                                const checked = activeModuleRule.companies.some(
                                  (c) =>
                                    normalizeCompanyKey(c) ===
                                    normalizeCompanyKey(opt.nombre)
                                );
                                return (
                                  <div
                                    key={opt.id}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                                      checked
                                        ? 'bg-[#1E60A8]/8 border-[#1E60A8]/40 text-[#132B63] font-semibold'
                                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer py-0.5">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          handleToggleCompanyForActiveModule(opt.nombre)
                                        }
                                        className="rounded border-slate-300 text-[#1E60A8] focus:ring-[#1E60A8]"
                                      />
                                      <span className="truncate flex-1">{opt.nombre}</span>
                                      {(opt.codigo || opt.pais) && (
                                        <span className="text-[10px] font-normal text-slate-400 shrink-0 font-mono">
                                          {opt.codigo || opt.pais}
                                        </span>
                                      )}
                                    </label>
                                    <button
                                      type="button"
                                      disabled={isQuickAddingCompany}
                                      onClick={() => void handleQuickRemoveCompanyFromModuleDb(opt)}
                                      title={`Quitar "${opt.nombre}" de la BD de ${MODULE_COMPANY_DB_META[effectiveActiveConfigModule].shortName}`}
                                      aria-label={`Quitar ${opt.nombre}`}
                                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer shrink-0 disabled:opacity-40"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Status & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Notas Administrativas (Opcional)
                  </label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Ej. Acceso temporal cierre Q3"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#1E60A8]"
                  />
                </div>

                <div className="pt-5">
                  <label className="inline-flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isEditingSuperAdmin ? true : formActive}
                      disabled={isEditingSuperAdmin}
                      onChange={(e) => setFormActive(e.target.checked)}
                      className="rounded border-slate-300 text-[#1E60A8] focus:ring-[#1E60A8]"
                    />
                    <span className="font-semibold text-slate-700">
                      Acceso habilitado (activo)
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] disabled:opacity-60 rounded-xl cursor-pointer"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{isEditingExisting ? 'Guardar Permisos' : 'Crear Permisos'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
