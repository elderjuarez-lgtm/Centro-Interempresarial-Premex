import { User } from 'firebase/auth';
import {
  AccessControlPolicy,
  BankAccount,
  BankMatchGroup,
  BankStatementItem,
  BookLedgerItem,
  CompanyAccessScope,
  EffectivePermissions,
  EntityMapping,
  FunctionalModuleId,
  ModuleCompanyPermission,
  ModuleCompanyScopeMap,
  Movement,
  SuiteModuleId,
  UserPermissionRecord,
  UserRole,
} from '../types';

export const SUPER_ADMIN_EMAIL = 'elder.juarez@premexcorp.com';

export const ALL_FUNCTIONAL_MODULES: FunctionalModuleId[] = [
  'intercompany',
  'bancos',
  'viaticos',
  'actividades',
  'anticipos',
  'cxc',
  'cxp',
];

export const ALL_SUITE_MODULES: SuiteModuleId[] = [
  'intercompany',
  'bancos',
  'viaticos',
  'actividades',
  'anticipos',
  'cxc',
  'cxp',
  'ajustes',
];

const FUNCTIONAL_MODULE_SET = new Set<FunctionalModuleId>(ALL_FUNCTIONAL_MODULES);

export const ROLE_METADATA: Record<
  UserRole,
  {
    label: string;
    shortLabel: string;
    description: string;
    capabilities: string[];
  }
> = {
  admin: {
    label: 'Administrador',
    shortLabel: 'Admin',
    description:
      'Control total sobre todos los módulos, bases de datos de sociedades, cierres mensuales y gestión de usuarios y permisos.',
    capabilities: [
      'Acceso completo a todos los módulos incluyendo Ajustes y Configuraciones',
      'Administra la base de datos independiente de empresas de cada módulo',
      'Gestiona correos, roles, módulos habilitados y empresas permitidas por módulo',
      'Ejecuta cierres mensuales permanentes y sincroniza políticas en Firebase',
    ],
  },
  operador: {
    label: 'Operador',
    shortLabel: 'Operador',
    description:
      'Opera el día a día dentro de sus módulos y empresas asignadas por módulo: carga archivos, concilia y guarda en la nube.',
    capabilities: [
      'Ingresa únicamente a los módulos y empresas autorizadas para su correo en cada módulo',
      'Importa archivos Excel/CSV/facturas, edita movimientos y comentarios de diferencias',
      'Ejecuta conciliaciones automáticas/manuales y sincroniza en Firestore',
      'Sin acceso a Ajustes de permisos ni cierre mensual definitivo',
    ],
  },
  consulta: {
    label: 'Solo Consulta',
    shortLabel: 'Solo Consulta',
    description:
      'Acceso estrictamente de solo lectura para revisión, auditoría y descarga de reportes de sus empresas asignadas por módulo.',
    capabilities: [
      'Consulta tableros, matrices, movimientos, diferencias, bancos y viáticos',
      'Restringido a los módulos y empresas autorizadas en cada módulo',
      'Permite exportar reportes en Excel / PDF para revisión y auditoría',
      'Bloqueado para importar, editar, emparejar, eliminar o guardar cambios',
    ],
  },
};

export const normalizeEmail = (email: string): string =>
  String(email || '').trim().toLowerCase();

/**
 * Deterministic Firestore document ID generator matching firestore.rules `emailToDocId(email)`.
 * Output always satisfies `^[a-zA-Z0-9_-]{1,128}$`.
 */
export const emailToPermissionDocId = (email: string): string => {
  const cleaned = normalizeEmail(email).replace(/[^a-z0-9]/g, '_');
  return (cleaned || 'usuario').slice(0, 128);
};

export const isValidEmailFormat = (email: string): boolean => {
  const clean = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) && clean.length <= 160;
};

export const normalizeCompanyKey = (name: string): string =>
  String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

/**
 * Sanitizes per-module company permissions so every allowed functional module has
 * an explicit, independent `{ scope, companies }` entry backed by its own company database.
 */
export const sanitizeModuleCompanyAccess = (
  raw: ModuleCompanyScopeMap | undefined,
  allowedModules: SuiteModuleId[],
  fallbackScope: CompanyAccessScope = 'all',
  fallbackCompanies: string[] = []
): ModuleCompanyScopeMap => {
  const result: ModuleCompanyScopeMap = {};
  const cleanFallbackCompanies = Array.from(
    new Set(
      (Array.isArray(fallbackCompanies) ? fallbackCompanies : [])
        .map((c) => String(c || '').trim().slice(0, 140))
        .filter(Boolean)
    )
  ).slice(0, 200);

  const functionalAllowed = allowedModules.filter((m): m is FunctionalModuleId =>
    FUNCTIONAL_MODULE_SET.has(m as FunctionalModuleId)
  );

  functionalAllowed.forEach((modId) => {
    const entry = raw && typeof raw === 'object' ? raw[modId] : undefined;
    if (entry && typeof entry === 'object') {
      const scope: CompanyAccessScope = entry.scope === 'selected' ? 'selected' : 'all';
      const companies =
        scope === 'all'
          ? []
          : Array.from(
              new Set(
                (Array.isArray(entry.companies) ? entry.companies : [])
                  .map((c) => String(c || '').trim().slice(0, 140))
                  .filter(Boolean)
              )
            ).slice(0, 200);
      result[modId] = { scope, companies };
    } else {
      result[modId] = {
        scope: fallbackScope === 'selected' ? 'selected' : 'all',
        companies: fallbackScope === 'selected' ? [...cleanFallbackCompanies] : [],
      };
    }
  });

  return result;
};

/**
 * Derives backwards-compatible flattened `companyScope` and `allowedCompanies` fields
 * from per-module company permissions for Firestore schema compatibility and search.
 */
export const deriveLegacyCompanyFields = (
  moduleCompanyAccess: ModuleCompanyScopeMap,
  allowedModules: SuiteModuleId[],
  role: UserRole
): { companyScope: CompanyAccessScope; allowedCompanies: string[] } => {
  if (role === 'admin') {
    return { companyScope: 'all', allowedCompanies: [] };
  }
  const functionalAllowed = allowedModules.filter((m): m is FunctionalModuleId =>
    FUNCTIONAL_MODULE_SET.has(m as FunctionalModuleId)
  );
  if (functionalAllowed.length === 0) {
    return { companyScope: 'selected', allowedCompanies: [] };
  }

  let anySelected = false;
  const seen = new Set<string>();
  const merged: string[] = [];

  functionalAllowed.forEach((modId) => {
    const cfg = moduleCompanyAccess[modId];
    if (cfg && cfg.scope === 'selected') {
      anySelected = true;
      cfg.companies.forEach((name) => {
        const key = normalizeCompanyKey(name);
        if (key && !seen.has(key)) {
          seen.add(key);
          merged.push(name);
        }
      });
    }
  });

  return {
    companyScope: anySelected ? 'selected' : 'all',
    allowedCompanies: merged.slice(0, 250),
  };
};

export const getRecordModuleCompanyRule = (
  rec: UserPermissionRecord,
  moduleId: FunctionalModuleId
): ModuleCompanyPermission => {
  if (rec.role === 'admin') {
    return { scope: 'all', companies: [] };
  }
  const explicit = rec.moduleCompanyAccess?.[moduleId];
  if (explicit) {
    return {
      scope: explicit.scope === 'selected' ? 'selected' : 'all',
      companies: explicit.scope === 'selected' ? explicit.companies || [] : [],
    };
  }
  return {
    scope: rec.companyScope === 'selected' ? 'selected' : 'all',
    companies: rec.companyScope === 'selected' ? rec.allowedCompanies || [] : [],
  };
};

export const INITIAL_ACCESS_POLICY: AccessControlPolicy = {
  strictMode: true,
};

export const INITIAL_USER_PERMISSIONS: UserPermissionRecord[] = [
  {
    id: emailToPermissionDocId(SUPER_ADMIN_EMAIL),
    email: SUPER_ADMIN_EMAIL,
    displayName: 'Elder Juárez (Administrador Principal)',
    role: 'admin',
    allowedModules: [...ALL_SUITE_MODULES],
    companyScope: 'all',
    allowedCompanies: [],
    moduleCompanyAccess: {},
    active: true,
    notes: 'Administrador principal de la suite corporativa Premex.',
  },
  {
    id: emailToPermissionDocId('operaciones.bancos@premexcorp.com'),
    email: 'operaciones.bancos@premexcorp.com',
    displayName: 'Analista Tesorería (Ejemplo Operador)',
    role: 'operador',
    allowedModules: ['bancos', 'intercompany', 'viaticos', 'actividades'],
    companyScope: 'selected',
    allowedCompanies: ['Premex', 'Anitox Corporation', 'Premex S.A.S.', 'Premex Corp'],
    moduleCompanyAccess: {
      intercompany: {
        scope: 'selected',
        companies: ['Premex', 'Anitox Corporation'],
      },
      bancos: {
        scope: 'selected',
        companies: ['Premex S.A.S.', 'Premex Corp'],
      },
      viaticos: {
        scope: 'selected',
        companies: ['Premex Corp'],
      },
      actividades: {
        scope: 'all',
        companies: [],
      },
    },
    active: true,
    notes: 'Ejemplo editable: opera Bancos, Intercompany, Viáticos y Actividades con sociedades independientes por módulo.',
  },
  {
    id: emailToPermissionDocId('auditoria.lectura@premexcorp.com'),
    email: 'auditoria.lectura@premexcorp.com',
    displayName: 'Auditoría Interna (Ejemplo Solo Consulta)',
    role: 'consulta',
    allowedModules: ['intercompany', 'bancos', 'viaticos', 'actividades'],
    companyScope: 'selected',
    allowedCompanies: ['Premex', 'Premex Corp', 'Anitox Corporation'],
    moduleCompanyAccess: {
      intercompany: {
        scope: 'all',
        companies: [],
      },
      bancos: {
        scope: 'selected',
        companies: ['Premex Corp', 'Anitox Corporation'],
      },
      viaticos: {
        scope: 'selected',
        companies: ['Premex Corp'],
      },
      actividades: {
        scope: 'all',
        companies: [],
      },
    },
    active: true,
    notes: 'Ejemplo editable: acceso de solo lectura con alcance personalizado por módulo.',
  },
];

export const ensureSuperAdminRecord = (
  records: UserPermissionRecord[]
): UserPermissionRecord[] => {
  const superId = emailToPermissionDocId(SUPER_ADMIN_EMAIL);
  const exists = records.some(
    (r) => normalizeEmail(r.email) === SUPER_ADMIN_EMAIL || r.id === superId
  );
  if (exists) {
    return records.map((r) =>
      normalizeEmail(r.email) === SUPER_ADMIN_EMAIL
        ? {
            ...r,
            id: superId,
            email: SUPER_ADMIN_EMAIL,
            role: 'admin',
            allowedModules: [...ALL_SUITE_MODULES],
            companyScope: 'all',
            allowedCompanies: [],
            moduleCompanyAccess: {},
            active: true,
          }
        : r
    );
  }
  return [INITIAL_USER_PERMISSIONS[0], ...records];
};

const buildPermissionsFromRecord = (
  record: UserPermissionRecord,
  isSuperAdmin: boolean,
  isPreviewing: boolean,
  previewEmail: string | null
): EffectivePermissions => {
  const role: UserRole = isSuperAdmin ? 'admin' : record.role;
  const isAdmin = role === 'admin';
  const canOperate = role === 'admin' || role === 'operador';
  const isReadOnly = role === 'consulta';
  const allowedModules: SuiteModuleId[] = isAdmin
    ? [...ALL_SUITE_MODULES]
    : Array.from(new Set(record.allowedModules.filter((m) => m !== 'ajustes')));

  const moduleCompanyAccess: ModuleCompanyScopeMap = isAdmin
    ? {}
    : sanitizeModuleCompanyAccess(
        record.moduleCompanyAccess,
        allowedModules,
        record.companyScope,
        record.allowedCompanies
      );

  const legacy = deriveLegacyCompanyFields(moduleCompanyAccess, allowedModules, role);
  const companyScope = isAdmin ? 'all' : legacy.companyScope;
  const allowedCompanies = isAdmin ? [] : legacy.allowedCompanies;
  const globalAllowedSet = new Set(allowedCompanies.map(normalizeCompanyKey));

  const perModuleAllowedSets = new Map<FunctionalModuleId, Set<string>>();
  ALL_FUNCTIONAL_MODULES.forEach((modId) => {
    const rule = moduleCompanyAccess[modId];
    if (rule && rule.scope === 'selected') {
      perModuleAllowedSets.set(modId, new Set(rule.companies.map(normalizeCompanyKey)));
    }
  });

  const getModuleCompanyScope = (moduleId: FunctionalModuleId): CompanyAccessScope => {
    if (isAdmin) return 'all';
    const rule = moduleCompanyAccess[moduleId];
    if (rule) return rule.scope;
    return companyScope;
  };

  const getAllowedCompaniesForModule = (moduleId: FunctionalModuleId): string[] => {
    if (isAdmin) return [];
    const rule = moduleCompanyAccess[moduleId];
    if (rule) return rule.scope === 'selected' ? rule.companies : [];
    return companyScope === 'selected' ? allowedCompanies : [];
  };

  return {
    email: normalizeEmail(record.email),
    displayName: record.displayName || record.email,
    role,
    isAuthorized: isSuperAdmin || record.active,
    isSuperAdmin,
    isAdmin,
    canOperate,
    isReadOnly,
    canCloseMonth: isAdmin,
    canManageMasterData: isAdmin,
    allowedModules,
    companyScope,
    allowedCompanies,
    moduleCompanyAccess,
    canAccessModule: (moduleId: SuiteModuleId) => {
      if (isAdmin) return true;
      if (!record.active) return false;
      if (moduleId === 'ajustes') return false;
      return allowedModules.includes(moduleId);
    },
    getModuleCompanyScope,
    getAllowedCompaniesForModule,
    isCompanyAllowed: (companyName: string, moduleId?: FunctionalModuleId) => {
      if (isAdmin) return true;
      if (moduleId) {
        const modScope = getModuleCompanyScope(moduleId);
        if (modScope === 'all') return true;
        if (!companyName || !companyName.trim()) return false;
        const modSet = perModuleAllowedSets.get(moduleId);
        if (modSet) return modSet.has(normalizeCompanyKey(companyName));
        return globalAllowedSet.has(normalizeCompanyKey(companyName));
      }
      if (companyScope === 'all') return true;
      if (!companyName || !companyName.trim()) return false;
      return globalAllowedSet.has(normalizeCompanyKey(companyName));
    },
    isPreviewing,
    previewEmail,
  };
};

export const resolveEffectivePermissions = (params: {
  currentUser: User | null;
  permissionsList: UserPermissionRecord[];
  ownPermissionDoc: UserPermissionRecord | null;
  ownPermissionResolved?: boolean;
  policy: AccessControlPolicy;
  previewEmail: string | null;
}): EffectivePermissions => {
  const {
    currentUser,
    permissionsList,
    ownPermissionDoc,
    ownPermissionResolved = false,
    policy,
    previewEmail,
  } = params;

  const isVerifiedSignedIn = Boolean(
    currentUser && currentUser.email && currentUser.emailVerified
  );
  const userEmail = isVerifiedSignedIn && currentUser?.email
    ? normalizeEmail(currentUser.email)
    : null;

  // Unauthenticated or unverified session: zero module or company access
  if (!userEmail) {
    return {
      email: currentUser?.email ? normalizeEmail(currentUser.email) : null,
      displayName: currentUser?.displayName || 'Sin iniciar sesión',
      role: 'consulta',
      isAuthorized: false,
      isSuperAdmin: false,
      isAdmin: false,
      canOperate: false,
      isReadOnly: true,
      canCloseMonth: false,
      canManageMasterData: false,
      allowedModules: [],
      companyScope: 'selected',
      allowedCompanies: [],
      moduleCompanyAccess: {},
      canAccessModule: () => false,
      isCompanyAllowed: () => false,
      getModuleCompanyScope: () => 'selected',
      getAllowedCompaniesForModule: () => [],
      isPreviewing: false,
      previewEmail: null,
    };
  }

  const realIsSuperAdmin = userEmail === SUPER_ADMIN_EMAIL;

  // When Firestore confirmed the signed-in user's own permission doc (found or not found),
  // trust cloud state rather than potentially stale localStorage from a prior session.
  const matchedInList =
    permissionsList.find((r) => normalizeEmail(r.email) === userEmail) || null;
  const realRecord =
    ownPermissionResolved && !realIsSuperAdmin
      ? ownPermissionDoc
      : ownPermissionDoc || matchedInList;

  const realIsAdmin =
    realIsSuperAdmin ||
    Boolean(realRecord && realRecord.active && realRecord.role === 'admin');

  // If real admin is actively previewing another email's permissions
  if (realIsAdmin && previewEmail) {
    const targetEmail = normalizeEmail(previewEmail);
    const previewRec = permissionsList.find(
      (r) => normalizeEmail(r.email) === targetEmail
    );
    if (previewRec) {
      return buildPermissionsFromRecord(previewRec, false, true, targetEmail);
    }
  }

  // Signed-in Super Admin always gets unrestricted Admin access
  if (realIsSuperAdmin) {
    return buildPermissionsFromRecord(
      realRecord || INITIAL_USER_PERMISSIONS[0],
      true,
      false,
      null
    );
  }

  // Signed-in user found in permissions directory
  if (realRecord) {
    return buildPermissionsFromRecord(realRecord, false, false, null);
  }

  // Signed-in user NOT in permissions directory
  if (policy.strictMode) {
    return {
      email: userEmail,
      displayName: currentUser?.displayName || userEmail,
      role: 'consulta',
      isAuthorized: false,
      isSuperAdmin: false,
      isAdmin: false,
      canOperate: false,
      isReadOnly: true,
      canCloseMonth: false,
      canManageMasterData: false,
      allowedModules: [],
      companyScope: 'selected',
      allowedCompanies: [],
      moduleCompanyAccess: {},
      canAccessModule: () => false,
      isCompanyAllowed: () => false,
      getModuleCompanyScope: () => 'selected',
      getAllowedCompaniesForModule: () => [],
      isPreviewing: false,
      previewEmail: null,
    };
  }

  // Non-strict mode: unregistered signed-in user defaults to read-only consulta across active operational modules
  return {
    email: userEmail,
    displayName: currentUser?.displayName || userEmail,
    role: 'consulta',
    isAuthorized: true,
    isSuperAdmin: false,
    isAdmin: false,
    canOperate: false,
    isReadOnly: true,
    canCloseMonth: false,
    canManageMasterData: false,
    allowedModules: ['intercompany', 'bancos', 'viaticos', 'actividades'],
    companyScope: 'all',
    allowedCompanies: [],
    moduleCompanyAccess: {
      intercompany: { scope: 'all', companies: [] },
      bancos: { scope: 'all', companies: [] },
      viaticos: { scope: 'all', companies: [] },
      actividades: { scope: 'all', companies: [] },
    },
    canAccessModule: (m) =>
      m === 'intercompany' || m === 'bancos' || m === 'viaticos' || m === 'actividades',
    isCompanyAllowed: () => true,
    getModuleCompanyScope: () => 'all',
    getAllowedCompaniesForModule: () => [],
    isPreviewing: false,
    previewEmail: null,
  };
};

/**
 * Filters Intercompany entities and movements strictly to the user's allowed companies
 * configured specifically for the `intercompany` module.
 */
export const filterIntercompanyByPermissions = (
  entities: EntityMapping[],
  movements: Movement[],
  perms: EffectivePermissions
): { entities: EntityMapping[]; movements: Movement[] } => {
  if (perms.isAdmin || perms.getModuleCompanyScope('intercompany') === 'all') {
    return { entities, movements };
  }

  const filteredEntities = entities.filter((e) =>
    perms.isCompanyAllowed(e.nombreOficial, 'intercompany')
  );
  const filteredMovements = movements.filter(
    (m) =>
      perms.isCompanyAllowed(m.sociedad, 'intercompany') ||
      perms.isCompanyAllowed(m.contraparte, 'intercompany')
  );

  return {
    entities: filteredEntities,
    movements: filteredMovements,
  };
};

/**
 * Filters Bank Reconciliation societies, accounts, statement items, ledger items,
 * matches, SAP FBL3N open items, and SAP balance rows strictly to the user's allowed companies
 * for the `bancos` module.
 */
export const filterBankByPermissions = (
  accounts: BankAccount[],
  statementItems: BankStatementItem[],
  ledgerItems: BookLedgerItem[],
  matches: BankMatchGroup[],
  perms: EffectivePermissions,
  societies: import('../types').BankSociety[] = [],
  sapOpenItems: import('../types').SapOpenItem[] = [],
  sapBalanceRows: import('../types').SapBalanceRow[] = []
): {
  accounts: BankAccount[];
  statementItems: BankStatementItem[];
  ledgerItems: BookLedgerItem[];
  matches: BankMatchGroup[];
  societies: import('../types').BankSociety[];
  sapOpenItems: import('../types').SapOpenItem[];
  sapBalanceRows: import('../types').SapBalanceRow[];
} => {
  if (perms.isAdmin || perms.getModuleCompanyScope('bancos') === 'all') {
    return {
      accounts,
      statementItems,
      ledgerItems,
      matches,
      societies,
      sapOpenItems,
      sapBalanceRows,
    };
  }

  const allowedAccounts = accounts.filter((a) =>
    perms.isCompanyAllowed(a.sociedad, 'bancos')
  );
  const allowedAccountIds = new Set(allowedAccounts.map((a) => a.id));
  const allowedSocieties = societies.filter((s) =>
    perms.isCompanyAllowed(s.nombre, 'bancos')
  );
  const allowedSocietyCodes = new Set(
    [
      ...allowedSocieties.map((s) => s.codigoSociedad.trim().toUpperCase()),
      ...allowedAccounts
        .map((a) => String(a.codigoSociedad || '').trim().toUpperCase())
        .filter(Boolean),
    ].filter(Boolean)
  );

  return {
    accounts: allowedAccounts,
    statementItems: statementItems.filter((i) => allowedAccountIds.has(i.cuentaId)),
    ledgerItems: ledgerItems.filter((i) => allowedAccountIds.has(i.cuentaId)),
    matches: matches.filter((m) => allowedAccountIds.has(m.cuentaId)),
    societies: allowedSocieties,
    sapOpenItems: sapOpenItems.filter(
      (item) =>
        allowedAccountIds.has(item.cuentaId) ||
        perms.isCompanyAllowed(item.sociedadNombre, 'bancos') ||
        (item.sociedadCodigo &&
          allowedSocietyCodes.has(item.sociedadCodigo.trim().toUpperCase()))
    ),
    sapBalanceRows: sapBalanceRows.filter(
      (row) =>
        perms.isCompanyAllowed(row.sociedadNombre, 'bancos') ||
        (row.sociedadCodigo &&
          allowedSocietyCodes.has(row.sociedadCodigo.trim().toUpperCase()))
    ),
  };
};

/**
 * Filters closed bank reconciliation snapshots strictly to the user's allowed companies
 * for the `bancos` module so historical consultation respects per-society RBAC.
 */
export const filterClosedBankReconciliationsByPermissions = (
  closedReconciliations: import('../types').BankClosedReconciliation[],
  perms: EffectivePermissions
): import('../types').BankClosedReconciliation[] => {
  if (perms.isAdmin || perms.getModuleCompanyScope('bancos') === 'all') {
    return closedReconciliations;
  }

  return closedReconciliations
    .map((rec) => {
      const scoped = filterBankByPermissions(
        rec.accounts,
        [],
        [],
        [],
        perms,
        rec.societies,
        rec.sapOpenItems,
        rec.sapBalanceRows
      );
      return {
        ...rec,
        societies: scoped.societies,
        accounts: scoped.accounts,
        sapOpenItems: scoped.sapOpenItems,
        sapBalanceRows: scoped.sapBalanceRows,
        societiesCount: scoped.societies.length,
        accountsCount: scoped.accounts.length,
        openItemsCount: scoped.sapOpenItems.length,
      };
    })
    .filter((rec) => rec.accounts.length > 0 || rec.societies.length > 0);
};

