import {
  EffectivePermissions,
  UserPermissionRecord,
  ViaticoCategory,
  ViaticoConsultor,
  ViaticoCurrency,
  ViaticoEmailGroup,
  ViaticoExpenseItem,
  ViaticoLiquidation,
  ViaticoOdooCatalogs,
  ViaticoOdooConfig,
} from '../types';
import { normalizeEmail } from './permissions';

export const VIATICO_CURRENCIES: ViaticoCurrency[] = [
  'Quetzales',
  'Dólares',
  'Pesos Colombianos',
  'Lempiras',
  'Pesos Mexicanos',
  'Euros',
  'Colones',
];

export const VIATICO_CATEGORIES: ViaticoCategory[] = [
  'Alimentación',
  'Combustible / Lub',
  'Taxis / Buses',
  'Hospedaje',
  'Peajes / Parqueo',
  'Boletos Aéreos',
  'Atención a Clientes',
  'Otros Gastos',
];

export const CURRENCY_SYMBOLS: Record<ViaticoCurrency, string> = {
  Quetzales: 'Q',
  Dólares: 'US$',
  'Pesos Colombianos': 'COP',
  Lempiras: 'L',
  'Pesos Mexicanos': 'MX$',
  Euros: '€',
  Colones: '₡',
};

export const DEFAULT_TAX_RATE_BY_CURRENCY: Record<ViaticoCurrency, number> = {
  Quetzales: 12,
  Dólares: 0,
  'Pesos Colombianos': 19,
  Lempiras: 15,
  'Pesos Mexicanos': 16,
  Euros: 21,
  Colones: 13,
};

export const roundMoney = (val: number): number => {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
};

export const roundExchangeRate = (val: number): number => {
  if (!Number.isFinite(val)) return 1;
  return Math.round((val + Number.EPSILON) * 10000) / 10000;
};

export const formatViaticoAmount = (
  amount: number,
  currency?: ViaticoCurrency,
  showSymbol = false
): string => {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (!showSymbol || !currency) return formatted;
  return `${CURRENCY_SYMBOLS[currency] || ''} ${formatted}`.trim();
};

export const calculateTaxBreakdown = (params: {
  valorFactura: number;
  aplicaImpuestos: boolean;
  porcentajeImpuesto: number;
  montoImpuestoOverride?: number;
}): {
  montoImpuesto: number;
  valorSinImpuesto: number;
} => {
  const total = Math.max(0, roundMoney(params.valorFactura));
  if (!params.aplicaImpuestos || total <= 0) {
    return { montoImpuesto: 0, valorSinImpuesto: total };
  }

  if (
    typeof params.montoImpuestoOverride === 'number' &&
    Number.isFinite(params.montoImpuestoOverride) &&
    params.montoImpuestoOverride >= 0 &&
    params.montoImpuestoOverride <= total
  ) {
    const tax = roundMoney(params.montoImpuestoOverride);
    return {
      montoImpuesto: tax,
      valorSinImpuesto: roundMoney(Math.max(0, total - tax)),
    };
  }

  const rate = Math.max(0, params.porcentajeImpuesto);
  if (rate <= 0) {
    return { montoImpuesto: 0, valorSinImpuesto: total };
  }

  const base = roundMoney(total / (1 + rate / 100));
  const tax = roundMoney(total - base);
  return { montoImpuesto: tax, valorSinImpuesto: base };
};

export const recalculateLiquidationTotals = (
  liq: ViaticoLiquidation
): ViaticoLiquidation => {
  let totalLiquidacion = 0;
  let totalConImpuestos = 0;
  let totalSinImpuestos = 0;
  let totalImpuestos = 0;

  liq.items.forEach((item) => {
    const reintegrar = roundMoney(item.valorReintegrar);
    totalLiquidacion += reintegrar;

    const itemFx = item.tipoCambio > 0 ? item.tipoCambio : 1;
    if (item.aplicaImpuestos) {
      totalConImpuestos += reintegrar;
      totalImpuestos += roundMoney(item.montoImpuesto * itemFx);
    } else {
      totalSinImpuestos += reintegrar;
    }
  });

  return {
    ...liq,
    totalLiquidacion: roundMoney(totalLiquidacion),
    totalConImpuestos: roundMoney(totalConImpuestos),
    totalSinImpuestos: roundMoney(totalSinImpuestos),
    totalImpuestos: roundMoney(totalImpuestos),
  };
};

export const normalizeTextToken = (raw: string): string =>
  String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Extracts first name and first surname tokens from corporate emails such as
 * `elder.juarez@premexcorp.com` -> { firstName: 'elder', lastName: 'juarez' }
 */
export const parseNameTokensFromEmail = (
  email: string | null | undefined
): { firstName: string; lastName: string; tokens: string[] } => {
  const clean = normalizeEmail(email || '');
  const localPart = clean.split('@')[0] || '';
  const tokens = localPart
    .split(/[._-]+/)
    .map((t) => normalizeTextToken(t).replace(/[0-9]+$/g, ''))
    .filter((t) => t.length >= 2);
  return {
    firstName: tokens[0] || '',
    lastName: tokens[1] || '',
    tokens,
  };
};

export const formatConsultorNameFromEmail = (email: string | null | undefined): string => {
  const { firstName, lastName } = parseNameTokensFromEmail(email);
  const cap = (w: string) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : '');
  return [cap(firstName), cap(lastName)].filter(Boolean).join(' ') || 'Consultor Premex';
};

/**
 * Matches a signed-in user's email against the Consultores catalog using:
 * 1) Exact email match, OR
 * 2) Corporate `primerNombre.primerApellido` matching against `nombreCompleto`.
 */
export const matchConsultorFromEmail = (
  email: string | null | undefined,
  consultores: ViaticoConsultor[]
): ViaticoConsultor | null => {
  const cleanEmail = normalizeEmail(email || '');
  if (!cleanEmail) return null;

  const exact = consultores.find((c) => normalizeEmail(c.email) === cleanEmail);
  if (exact) return exact;

  const { firstName, lastName } = parseNameTokensFromEmail(cleanEmail);
  if (!firstName || !lastName) return null;

  const byTokens = consultores.find((c) => {
    const words = normalizeTextToken(c.nombreCompleto).split(' ').filter(Boolean);
    return words.includes(firstName) && words.includes(lastName);
  });
  return byTokens || null;
};

export const resolveViaticosConsultantScope = (
  consultores: ViaticoConsultor[],
  permissions: EffectivePermissions,
  odooCatalogs?: ViaticoOdooCatalogs,
  permissionRecords?: UserPermissionRecord[]
): {
  matchedConsultor: ViaticoConsultor | null;
  availableConsultores: ViaticoConsultor[];
  isLockedToOwnConsultor: boolean;
  detectedFromEmailLabel: string | null;
} => {
  const cleanEmail = normalizeEmail(permissions.email || '');
  const viaticosScope = permissions.getModuleCompanyScope('viaticos');
  const viaticosAllowedCompanies = permissions.getAllowedCompaniesForModule('viaticos');
  const companyAllowedConsultores = consultores.filter(
    (c) =>
      permissions.isAdmin ||
      viaticosScope === 'all' ||
      permissions.isCompanyAllowed(c.empresa, 'viaticos')
  );

  // Enrich matched consultant from UserPermissionRecord / Odoo Employees DB
  const permRec =
    cleanEmail && Array.isArray(permissionRecords)
      ? permissionRecords.find((p) => normalizeEmail(p.email) === cleanEmail)
      : undefined;
  const linkedOdooEmp = (() => {
    if (!odooCatalogs?.employees?.length) return undefined;
    const explicitOdooName = (
      permissions.odooEmployeeName ||
      permRec?.odooEmployeeName ||
      ''
    )
      .trim()
      .toUpperCase();
    if (explicitOdooName) {
      const byExact = odooCatalogs.employees.find(
        (e) => e.nombreCompleto.trim().toUpperCase() === explicitOdooName
      );
      if (byExact) return byExact;
    }
    if (cleanEmail) {
      const byEmail = odooCatalogs.employees.find(
        (e) => normalizeEmail(e.email || '') === cleanEmail
      );
      if (byEmail) return byEmail;
      const { firstName, lastName } = parseNameTokensFromEmail(cleanEmail);
      if (firstName && lastName) {
        return odooCatalogs.employees.find((e) => {
          const words = normalizeTextToken(e.nombreCompleto).split(' ').filter(Boolean);
          return words.includes(firstName) && words.includes(lastName);
        });
      }
    }
    return undefined;
  })();

  const enrichMatched = (c: ViaticoConsultor | null): ViaticoConsultor | null => {
    if (!c) return null;
    const resolvedEmpName =
      c.odooEmployeeName ||
      permissions.odooEmployeeName ||
      permRec?.odooEmployeeName ||
      linkedOdooEmp?.nombreCompleto;
    const resolvedCC =
      c.centroCosto ||
      permissions.centroCosto ||
      permRec?.centroCosto ||
      linkedOdooEmp?.centroCosto;
    const resolvedAnalytic =
      c.odooAnalyticDistribution ||
      permissions.odooAnalyticDistribution ||
      permRec?.odooAnalyticDistribution ||
      linkedOdooEmp?.analyticDistribution;
    return {
      ...c,
      odooEmployeeName: resolvedEmpName,
      centroCosto: resolvedCC,
      odooAnalyticDistribution: resolvedAnalytic,
      permissionId: c.permissionId || permRec?.id,
    };
  };

  const buildConsultorFromAssignedName = (empUpper: string): ViaticoConsultor | null => {
    const cleanUpper = String(empUpper || '').trim().toUpperCase();
    if (!cleanUpper) return null;
    const empEntry = odooCatalogs?.employees?.find(
      (e) => e.nombreCompleto.trim().toUpperCase() === cleanUpper
    );
    const existingConsultor = consultores.find(
      (c) =>
        (c.odooEmployeeName || '').trim().toUpperCase() === cleanUpper ||
        normalizeTextToken(c.nombreCompleto) === normalizeTextToken(cleanUpper) ||
        (empEntry?.email && normalizeEmail(c.email) === normalizeEmail(empEntry.email))
    );

    if (existingConsultor) {
      return {
        ...existingConsultor,
        odooEmployeeName:
          empEntry?.nombreCompleto || existingConsultor.odooEmployeeName || cleanUpper,
        centroCosto: existingConsultor.centroCosto || empEntry?.centroCosto || '',
        odooAnalyticDistribution:
          existingConsultor.odooAnalyticDistribution ||
          empEntry?.analyticDistribution ||
          '',
        permissionId: existingConsultor.permissionId || empEntry?.permissionDocId || permRec?.id,
      };
    }

    const derivedEmpresa =
      viaticosScope === 'selected' && viaticosAllowedCompanies[0]
        ? viaticosAllowedCompanies[0]
        : empEntry?.empresa || 'Premex Corp';

    return {
      id: empEntry?.id
        ? `cons-odoo-${empEntry.id}`
        : `cons-odoo-${normalizeTextToken(cleanUpper).replace(/\s+/g, '-')}`,
      nombreCompleto: empEntry?.nombreCompleto || cleanUpper,
      email: (empEntry?.email && normalizeEmail(empEntry.email)) || cleanEmail,
      empresa: derivedEmpresa,
      cargo: 'Consultor / Liquidador',
      centroCosto:
        empEntry?.centroCosto ||
        permissions.centroCosto ||
        permRec?.centroCosto ||
        '',
      odooEmployeeName: empEntry?.nombreCompleto || cleanUpper,
      odooAnalyticDistribution:
        empEntry?.analyticDistribution ||
        permissions.odooAnalyticDistribution ||
        permRec?.odooAnalyticDistribution ||
        '',
      permissionId: empEntry?.permissionDocId || permRec?.id,
      monedaBase: 'Quetzales',
      activo: true,
    };
  };

  const dedupeConsultores = (list: ViaticoConsultor[]): ViaticoConsultor[] => {
    const out: ViaticoConsultor[] = [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    list.forEach((c) => {
      const nameKey = (c.odooEmployeeName || c.nombreCompleto || '').trim().toUpperCase();
      if (seenIds.has(c.id) || (nameKey && seenNames.has(nameKey))) return;
      seenIds.add(c.id);
      if (nameKey) seenNames.add(nameKey);
      out.push(c);
    });
    return out;
  };

  const rawAssigned =
    permissions.assignedEmployees && permissions.assignedEmployees.length > 0
      ? permissions.assignedEmployees
      : permRec?.assignedEmployees && permRec.assignedEmployees.length > 0
      ? permRec.assignedEmployees
      : [];
  const primaryOdooName = (
    permissions.odooEmployeeName ||
    permRec?.odooEmployeeName ||
    ''
  )
    .trim()
    .toUpperCase();
  const combinedAssignedNames = Array.from(
    new Set(
      rawAssigned
        .map((n) => String(n || '').trim().toUpperCase())
        .filter(Boolean)
    )
  );
  const assignedConsultores = dedupeConsultores(
    combinedAssignedNames
      .map(buildConsultorFromAssignedName)
      .filter((c): c is ViaticoConsultor => Boolean(c))
  );

  const matched = enrichMatched(matchConsultorFromEmail(permissions.email, consultores));

  // Strictly enforce explicit assignedEmployees from Permisos for the Nombre selector across all roles
  if (assignedConsultores.length > 0) {
    const primaryMatched =
      (matched &&
        assignedConsultores.find(
          (c) =>
            c.id === matched.id ||
            (c.odooEmployeeName || '').trim().toUpperCase() ===
              (matched.odooEmployeeName || '').trim().toUpperCase()
        )) ||
      (primaryOdooName &&
        assignedConsultores.find(
          (c) =>
            (c.odooEmployeeName || c.nombreCompleto || '').trim().toUpperCase() ===
            primaryOdooName
        )) ||
      assignedConsultores[0];
    return {
      matchedConsultor: primaryMatched,
      availableConsultores: assignedConsultores,
      isLockedToOwnConsultor: assignedConsultores.length <= 1,
      detectedFromEmailLabel:
        assignedConsultores.length > 1
          ? `${assignedConsultores.length} empleados asignados (${permissions.email || 'permisos'})`
          : `${primaryMatched.odooEmployeeName || primaryMatched.nombreCompleto} (asignado en permisos)`,
    };
  }

  const odooEmployeeConsultores = (odooCatalogs?.employees || [])
    .filter((e) => {
      if (e.activo === false) return false;
      if (permissions.isAdmin || viaticosScope === 'all') return true;
      return !e.empresa || permissions.isCompanyAllowed(e.empresa, 'viaticos');
    })
    .map((e) => buildConsultorFromAssignedName(e.nombreCompleto))
    .filter((c): c is ViaticoConsultor => Boolean(c));

  if (permissions.isAdmin) {
    const allAdminConsultores = dedupeConsultores([
      ...consultores,
      ...odooEmployeeConsultores,
    ]);
    const adminMatched =
      enrichMatched(matchConsultorFromEmail(permissions.email, allAdminConsultores)) ||
      null;
    return {
      matchedConsultor: adminMatched,
      availableConsultores: allAdminConsultores,
      isLockedToOwnConsultor: false,
      detectedFromEmailLabel: adminMatched
        ? `${adminMatched.odooEmployeeName || adminMatched.nombreCompleto} (Administrador · acceso total)`
        : null,
    };
  }

  const isBroadReviewerProfile =
    permissions.isAdmin ||
    permissions.userType === 'contabilidad' ||
    permissions.userType === 'autorizador' ||
    permissions.userType === 'auditor' ||
    permissions.canAccessViaticosPanel('contabilidad');

  // Operador (Liquidador) without assignedEmployees: scoped to matched profile or auto-built profile
  if (permissions.role === 'operador' && permissions.email && !isBroadReviewerProfile) {
    if (matched) {
      return {
        matchedConsultor: matched,
        availableConsultores: [matched],
        isLockedToOwnConsultor: true,
        detectedFromEmailLabel: `${matched.odooEmployeeName || matched.nombreCompleto} (vinculado a ${permissions.email})`,
      };
    }

    // Auto-build virtual consultant entry from Odoo Employee DB / Permisos / correo
    const derivedName =
      permissions.odooEmployeeName ||
      permRec?.odooEmployeeName ||
      linkedOdooEmp?.nombreCompleto ||
      (permissions.displayName && !permissions.displayName.includes('@')
        ? permissions.displayName
        : formatConsultorNameFromEmail(permissions.email));
    const derivedEmpresa =
      viaticosScope === 'selected' && viaticosAllowedCompanies[0]
        ? viaticosAllowedCompanies[0]
        : linkedOdooEmp?.empresa || 'Premex Corp';
    const virtualConsultor: ViaticoConsultor = {
      id: `cons-auto-${normalizeTextToken(permissions.email).replace(/\s+/g, '-')}`,
      nombreCompleto: derivedName,
      email: cleanEmail,
      empresa: derivedEmpresa,
      cargo: 'Consultor / Liquidador',
      centroCosto:
        permissions.centroCosto ||
        permRec?.centroCosto ||
        linkedOdooEmp?.centroCosto ||
        '',
      odooEmployeeName:
        permissions.odooEmployeeName ||
        permRec?.odooEmployeeName ||
        linkedOdooEmp?.nombreCompleto ||
        derivedName.toUpperCase(),
      odooAnalyticDistribution:
        permissions.odooAnalyticDistribution ||
        permRec?.odooAnalyticDistribution ||
        linkedOdooEmp?.analyticDistribution ||
        '',
      permissionId: permRec?.id,
      monedaBase: 'Quetzales',
      activo: true,
    };
    return {
      matchedConsultor: virtualConsultor,
      availableConsultores: [virtualConsultor],
      isLockedToOwnConsultor: true,
      detectedFromEmailLabel: `${virtualConsultor.odooEmployeeName || virtualConsultor.nombreCompleto} (detectado desde ${permissions.email})`,
    };
  }

  // Contabilidad / Autorizador / Auditor / Solo Consulta without explicit assignedEmployees
  const broadAvailable = dedupeConsultores([
    ...(viaticosScope === 'selected' ? companyAllowedConsultores : consultores),
    ...odooEmployeeConsultores,
  ]);
  return {
    matchedConsultor: matched || null,
    availableConsultores: broadAvailable,
    isLockedToOwnConsultor: false,
    detectedFromEmailLabel: matched
      ? matched.odooEmployeeName || matched.nombreCompleto
      : null,
  };
};

export const filterLiquidacionesByPermissions = (
  liquidaciones: ViaticoLiquidation[],
  permissions: EffectivePermissions,
  matchedConsultor: ViaticoConsultor | null,
  availableConsultores?: ViaticoConsultor[]
): ViaticoLiquidation[] => {
  if (permissions.isAdmin) return liquidaciones;

  const viaticosScope = permissions.getModuleCompanyScope('viaticos');
  const isBroadReviewerProfile =
    permissions.userType === 'contabilidad' ||
    permissions.userType === 'autorizador' ||
    permissions.userType === 'auditor' ||
    permissions.canAccessViaticosPanel('contabilidad');

  const assignedUpperSet = new Set(
    (permissions.assignedEmployees || [])
      .map((n) => String(n || '').trim().toUpperCase())
      .filter(Boolean)
  );
  if (permissions.odooEmployeeName && assignedUpperSet.size === 0) {
    assignedUpperSet.add(permissions.odooEmployeeName.trim().toUpperCase());
  }

  return liquidaciones.filter((liq) => {
    const companyOk =
      viaticosScope === 'all' || permissions.isCompanyAllowed(liq.empresa, 'viaticos');
    if (!companyOk) return false;

    if (permissions.role === 'operador' && permissions.email && !isBroadReviewerProfile) {
      const userEmail = normalizeEmail(permissions.email);
      if (normalizeEmail(liq.consultorEmail) === userEmail) return true;
      if (matchedConsultor && liq.consultorId === matchedConsultor.id) return true;

      if (availableConsultores && availableConsultores.length > 0) {
        const matchesAssignedConsultor = availableConsultores.some((c) => {
          if (liq.consultorId && liq.consultorId === c.id) return true;
          if (c.email && liq.consultorEmail && normalizeEmail(c.email) === normalizeEmail(liq.consultorEmail)) {
            return true;
          }
          if (
            c.odooEmployeeName &&
            liq.odooEmployeeName &&
            c.odooEmployeeName.trim().toUpperCase() === liq.odooEmployeeName.trim().toUpperCase()
          ) {
            return true;
          }
          if (
            normalizeTextToken(c.nombreCompleto) &&
            normalizeTextToken(c.nombreCompleto) === normalizeTextToken(liq.consultorNombre)
          ) {
            return true;
          }
          return false;
        });
        if (matchesAssignedConsultor) return true;
      }

      if (assignedUpperSet.size > 0) {
        const liqEmp = (liq.odooEmployeeName || '').trim().toUpperCase();
        const liqNom = (liq.consultorNombre || '').trim().toUpperCase();
        if ((liqEmp && assignedUpperSet.has(liqEmp)) || (liqNom && assignedUpperSet.has(liqNom))) {
          return true;
        }
      }

      const { firstName, lastName } = parseNameTokensFromEmail(userEmail);
      if (firstName && lastName) {
        const liqWords = normalizeTextToken(liq.consultorNombre).split(' ');
        if (liqWords.includes(firstName) && liqWords.includes(lastName)) return true;
      }
      return false;
    }

    return true;
  });
};

/**
 * Consolidates liquidaciones across ALL liquidadores for the Contabilidad view,
 * respecting the user's allowed Viáticos societies while never restricting to a single consultant.
 */
export const filterLiquidacionesForAccounting = (
  liquidaciones: ViaticoLiquidation[],
  permissions: EffectivePermissions
): ViaticoLiquidation[] => {
  if (permissions.isAdmin) return liquidaciones;
  const viaticosScope = permissions.getModuleCompanyScope('viaticos');
  if (viaticosScope === 'all') return liquidaciones;
  return liquidaciones.filter((liq) =>
    permissions.isCompanyAllowed(liq.empresa, 'viaticos')
  );
};

/**
 * Resolves the authoritative Cost Center (Centro de Costo) for a liquidation,
 * falling back cleanly to the linked consultant profile in the master catalog.
 */
export const resolveLiquidationCostCenter = (
  liquidation: Pick<
    ViaticoLiquidation,
    'centroCosto' | 'consultorId' | 'consultorEmail' | 'consultorNombre'
  >,
  consultores: ViaticoConsultor[],
  odooCatalogs?: ViaticoOdooCatalogs,
  permissionRecords?: UserPermissionRecord[]
): string => {
  const direct = String(liquidation.centroCosto || '').trim();
  if (direct) return direct;

  const byId = consultores.find((c) => c.id === liquidation.consultorId);
  if (byId?.centroCosto?.trim()) return byId.centroCosto.trim();

  const cleanEmail = normalizeEmail(liquidation.consultorEmail || '');
  if (cleanEmail) {
    const byEmail = consultores.find((c) => normalizeEmail(c.email) === cleanEmail);
    if (byEmail?.centroCosto?.trim()) return byEmail.centroCosto.trim();

    if (permissionRecords?.length) {
      const byPerm = permissionRecords.find((p) => normalizeEmail(p.email) === cleanEmail);
      if (byPerm?.centroCosto?.trim()) return byPerm.centroCosto.trim();
    }
    if (odooCatalogs?.employees?.length) {
      const byOdooEmail = odooCatalogs.employees.find(
        (e) => normalizeEmail(e.email || '') === cleanEmail
      );
      if (byOdooEmail?.centroCosto?.trim()) return byOdooEmail.centroCosto.trim();
    }
  }

  const normName = normalizeTextToken(liquidation.consultorNombre || '');
  if (normName) {
    const byName = consultores.find(
      (c) => normalizeTextToken(c.nombreCompleto) === normName
    );
    if (byName?.centroCosto?.trim()) return byName.centroCosto.trim();

    if (odooCatalogs?.employees?.length) {
      const byOdooName = odooCatalogs.employees.find(
        (e) => normalizeTextToken(e.nombreCompleto) === normName
      );
      if (byOdooName?.centroCosto?.trim()) return byOdooName.centroCosto.trim();
    }
  }

  return '';
};

const ODOO_CONFIG_STORAGE_KEY = 'premex_viaticos_odoo_config_v1';

export const DEFAULT_VIATICO_ODOO_CONFIG: ViaticoOdooConfig = {
  diarioNombre: 'Liquidación de Viáticos',
  diarioCodigo: 'VIAT',
  prefijoReferencia: 'VIAT',
  cuentaIvaCodigo: '1140101',
  cuentaIvaNombre: 'IVA Crédito Fiscal por Cobrar',
  etiquetaImpuesto: 'IVA 12% Compras',
  cuentaContrapartidaCodigo: '2110201',
  cuentaContrapartidaNombre: 'Viáticos por Reembolsar Empleados',
  criterioFechaContable: 'fecha_cierre',
  cuentasPorCategoria: {
    Alimentación: {
      accountCode: '520101',
      accountName: 'Viáticos - Alimentación',
    },
    'Combustible / Lub': {
      accountCode: '520102',
      accountName: 'Viáticos - Combustibles y Lubricantes',
    },
    'Taxis / Buses': {
      accountCode: '520103',
      accountName: 'Viáticos - Transporte Local (Taxis / Buses)',
    },
    Hospedaje: {
      accountCode: '520104',
      accountName: 'Viáticos - Hospedaje y Alojamiento',
    },
    'Peajes / Parqueo': {
      accountCode: '520105',
      accountName: 'Viáticos - Peajes y Estacionamientos',
    },
    'Boletos Aéreos': {
      accountCode: '520106',
      accountName: 'Viáticos - Boletos Aéreos',
    },
    'Atención a Clientes': {
      accountCode: '520107',
      accountName: 'Gastos de Representación y Atención a Clientes',
    },
    'Otros Gastos': {
      accountCode: '520199',
      accountName: 'Viáticos - Otros Gastos de Viaje',
    },
  },
};

export const loadViaticoOdooConfig = (): ViaticoOdooConfig => {
  try {
    const raw = localStorage.getItem(ODOO_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_VIATICO_ODOO_CONFIG;
    const parsed = JSON.parse(raw) as Partial<ViaticoOdooConfig>;
    return {
      ...DEFAULT_VIATICO_ODOO_CONFIG,
      ...parsed,
      cuentasPorCategoria: {
        ...DEFAULT_VIATICO_ODOO_CONFIG.cuentasPorCategoria,
        ...(parsed.cuentasPorCategoria || {}),
      },
    };
  } catch {
    return DEFAULT_VIATICO_ODOO_CONFIG;
  }
};

export const saveViaticoOdooConfig = (config: ViaticoOdooConfig): void => {
  try {
    localStorage.setItem(ODOO_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage quota errors
  }
};

export const getCurrentIsoWeekNumber = (): string => {
  const now = new Date();
  const target = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return String(weekNo);
};

export const normalizeExtractedCurrency = (raw: string | undefined): ViaticoCurrency => {
  const t = normalizeTextToken(raw || '');
  if (t.includes('quetzal') || t === 'gtq' || t === 'q') return 'Quetzales';
  if (t.includes('dolar') || t.includes('dollar') || t === 'usd') return 'Dólares';
  if (t.includes('colomb') || t === 'cop') return 'Pesos Colombianos';
  if (t.includes('lempira') || t === 'hnl') return 'Lempiras';
  if (t.includes('mexic') || t === 'mxn') return 'Pesos Mexicanos';
  if (t.includes('euro') || t === 'eur') return 'Euros';
  if (t.includes('colon') || t === 'crc') return 'Colones';
  return 'Quetzales';
};

export const normalizeExtractedCategory = (raw: string | undefined): ViaticoCategory => {
  const t = normalizeTextToken(raw || '');
  if (t.includes('aliment') || t.includes('desayuno') || t.includes('almuerzo') || t.includes('cena') || t.includes('restaur')) {
    return 'Alimentación';
  }
  if (t.includes('combust') || t.includes('gasolin') || t.includes('lub')) {
    return 'Combustible / Lub';
  }
  if (t.includes('taxi') || t.includes('uber') || t.includes('bus') || t.includes('transporte')) {
    return 'Taxis / Buses';
  }
  if (t.includes('hosped') || t.includes('hotel') || t.includes('airbnb')) {
    return 'Hospedaje';
  }
  if (t.includes('peaje') || t.includes('parqueo') || t.includes('estacion')) {
    return 'Peajes / Parqueo';
  }
  if (t.includes('aereo') || t.includes('vuelo') || t.includes('boleto')) {
    return 'Boletos Aéreos';
  }
  if (t.includes('cliente') || t.includes('atencion')) {
    return 'Atención a Clientes';
  }
  return 'Otros Gastos';
};

// ============================================================================
// Initial Premex Corporate Seed Data (faithful to Premex template)
// ============================================================================

export const INITIAL_VIATICO_CONSULTORES: ViaticoConsultor[] = [
  {
    id: 'cons-elder-juarez',
    nombreCompleto: 'Elder Juarez Hernandez',
    email: 'elder.juarez@premexcorp.com',
    empresa: 'Premex Corp',
    cargo: 'Consultor Financiero / Regional',
    centroCosto: 'GT10000601 CONTABILIDAD',
    odooEmployeeName: 'ELDER YOVANI JUAREZ HERNANDEZ',
    odooAnalyticDistribution: '{"520": 100.0}',
    monedaBase: 'Quetzales',
    activo: true,
  },
  {
    id: 'cons-melania-castillo',
    nombreCompleto: 'Melania Castillo Lopez',
    email: 'melania.castillo@premexcorp.com',
    empresa: 'Premex S.A.S.',
    cargo: 'Consultora Técnica Comercial',
    centroCosto: 'CC-201 Comercial Guatemala',
    monedaBase: 'Quetzales',
    activo: true,
  },
  {
    id: 'cons-cecilia-morales',
    nombreCompleto: 'Cecilia Morales Estrada',
    email: 'cecilia.morales@premexcorp.com',
    empresa: 'Anitox Corporation',
    cargo: 'Especialista Nutrición Animal',
    centroCosto: 'CC-301 Nutrición Anitox',
    monedaBase: 'Quetzales',
    activo: true,
  },
  {
    id: 'cons-carlos-mendoza',
    nombreCompleto: 'Carlos Mendoza Rivas',
    email: 'carlos.mendoza@premexcorp.com',
    empresa: 'Premex S.A.S.',
    cargo: 'Consultor de Operaciones',
    centroCosto: 'CC-205 Operaciones Latam',
    monedaBase: 'Dólares',
    activo: true,
  },
];

const makeSeedItem = (
  item: Omit<ViaticoExpenseItem, 'valorReintegrar' | 'montoImpuesto' | 'valorSinImpuesto'>
): ViaticoExpenseItem => {
  const valorReintegrar = roundMoney(item.valorFactura * item.tipoCambio);
  const { montoImpuesto, valorSinImpuesto } = calculateTaxBreakdown({
    valorFactura: item.valorFactura,
    aplicaImpuestos: item.aplicaImpuestos,
    porcentajeImpuesto: item.porcentajeImpuesto,
  });
  return {
    ...item,
    valorReintegrar,
    montoImpuesto,
    valorSinImpuesto,
  };
};

const SEED_PREMICOL_ITEMS: ViaticoExpenseItem[] = [
  makeSeedItem({
    id: 'viat-item-1',
    fechaDoc: '28/07/2026',
    serieDoc: 'FD0887E5',
    noDoc: '4261236653',
    nit: '28155106',
    proveedor: 'La paneria, s.a.',
    moneda: 'Quetzales',
    valorFactura: 217.0,
    tipoCambio: 1.0,
    categoria: 'Alimentación',
    clienteContacto: 'Premicol - Sarmientos y Bodega',
    objetivoComercial: 'Seguimiento comercial planta Honduras',
    descripcionGasto: 'Desayuno 28 de julio, Elder-Melania y Cecilia',
    kilometraje: '',
    aplicaImpuestos: true,
    porcentajeImpuesto: 12,
  }),
  makeSeedItem({
    id: 'viat-item-2',
    fechaDoc: '31/07/2026',
    serieDoc: '65387fe9',
    noDoc: '1851936308',
    nit: '4605896',
    proveedor: 'Federico Guillermo Catalan Acevedo',
    moneda: 'Quetzales',
    valorFactura: 90.0,
    tipoCambio: 1.0,
    categoria: 'Alimentación',
    clienteContacto: 'Premicol - Sarmientos y Bodega',
    objetivoComercial: 'Seguimiento comercial planta Honduras',
    descripcionGasto: 'Refrigerio, Elder-Melania y Cecilia',
    kilometraje: '',
    aplicaImpuestos: true,
    porcentajeImpuesto: 12,
  }),
  makeSeedItem({
    id: 'viat-item-3',
    fechaDoc: '31/07/2026',
    serieDoc: '946c5118',
    noDoc: '1124483591',
    nit: '4605896',
    proveedor: 'Federico Guillermo Catalan Acevedo',
    moneda: 'Quetzales',
    valorFactura: 200.0,
    tipoCambio: 1.0,
    categoria: 'Combustible / Lub',
    clienteContacto: 'Premicol - Sarmientos y Bodega',
    objetivoComercial: 'Traslado terrestre visita Premicol',
    descripcionGasto: 'Combustible visita Premicol Honduras',
    kilometraje: '310 km',
    aplicaImpuestos: true,
    porcentajeImpuesto: 12,
  }),
  makeSeedItem({
    id: 'viat-item-4',
    fechaDoc: '31/07/2026',
    serieDoc: '7e257e6f',
    noDoc: '980895701',
    nit: '321052',
    proveedor: 'Uno Guatemala, s. a',
    moneda: 'Quetzales',
    valorFactura: 200.0,
    tipoCambio: 1.0,
    categoria: 'Combustible / Lub',
    clienteContacto: 'Premicol - Sarmientos y Bodega',
    objetivoComercial: 'Traslado terrestre visita Premicol',
    descripcionGasto: 'Combustible visita Premicol Honduras',
    kilometraje: '485 km',
    aplicaImpuestos: true,
    porcentajeImpuesto: 12,
  }),
  makeSeedItem({
    id: 'viat-item-5',
    fechaDoc: '31/07/2026',
    serieDoc: '4c30168c',
    noDoc: '980895701',
    nit: '321052',
    proveedor: 'Uno Guatemala, s. a',
    moneda: 'Quetzales',
    valorFactura: 346.04,
    tipoCambio: 1.0,
    categoria: 'Combustible / Lub',
    clienteContacto: 'Premicol - Sarmientos y Bodega',
    objetivoComercial: 'Traslado terrestre visita Premicol',
    descripcionGasto: 'Combustible visita Premicol Honduras',
    kilometraje: '740 km',
    aplicaImpuestos: true,
    porcentajeImpuesto: 12,
  }),
  makeSeedItem({
    id: 'viat-item-6',
    fechaDoc: '28/07/2026',
    serieDoc: '',
    noDoc: '01',
    nit: '',
    proveedor: 'Uber',
    moneda: 'Quetzales',
    valorFactura: 89.42,
    tipoCambio: 1.0,
    categoria: 'Taxis / Buses',
    clienteContacto: 'Premicol - Sarmientos y Bodega',
    objetivoComercial: 'Logística de viaje',
    descripcionGasto: 'UBER Recoleccion de Vehiculo',
    kilometraje: '',
    aplicaImpuestos: false,
    porcentajeImpuesto: 0,
  }),
  makeSeedItem({
    id: 'viat-item-7',
    fechaDoc: '31/07/2026',
    serieDoc: '',
    noDoc: '02',
    nit: '',
    proveedor: 'Uber',
    moneda: 'Quetzales',
    valorFactura: 53.15,
    tipoCambio: 1.0,
    categoria: 'Taxis / Buses',
    clienteContacto: 'Premicol - Sarmientos y Bodega',
    objetivoComercial: 'Logística de viaje',
    descripcionGasto: 'UBER entrega de Vehiculo',
    kilometraje: '',
    aplicaImpuestos: false,
    porcentajeImpuesto: 0,
  }),
  makeSeedItem({
    id: 'viat-item-8',
    fechaDoc: '23/07/2026',
    serieDoc: '',
    noDoc: 'RC4AM3PJBD',
    nit: '',
    proveedor: 'AIRBNB',
    moneda: 'Dólares',
    valorFactura: 345.78,
    tipoCambio: 7.9,
    categoria: 'Hospedaje',
    clienteContacto: 'Premicol - Sarmientos y Bodega',
    objetivoComercial: 'Visita técnica San Pedro Sula',
    descripcionGasto: 'Hospedaje del 28 al 31 de julio, San Pedro Sula Honduras',
    kilometraje: '',
    aplicaImpuestos: false,
    porcentajeImpuesto: 0,
  }),
];

export const INITIAL_VIATICO_LIQUIDACIONES: ViaticoLiquidation[] = [
  recalculateLiquidationTotals({
    id: 'liq-premicol-sem31',
    lineaLiquidacion: 'Visita Premicol SA de CV',
    semana: '31',
    consultorId: 'cons-elder-juarez',
    consultorNombre: 'Elder Juarez Hernandez',
    consultorEmail: 'elder.juarez@premexcorp.com',
    empresa: 'Premex Corp',
    centroCosto: 'GT10000601 CONTABILIDAD',
    odooEmployeeName: 'ELDER YOVANI JUAREZ HERNANDEZ',
    odooAnalyticDistribution: '{"520": 100.0}',
    monedaBase: 'Quetzales',
    estado: 'borrador',
    items: SEED_PREMICOL_ITEMS,
    totalLiquidacion: 3927.27,
    totalConImpuestos: 0,
    totalSinImpuestos: 0,
    totalImpuestos: 0,
    createdAtIso: '2026-07-31T16:00:00.000Z',
    updatedAtIso: '2026-07-31T18:30:00.000Z',
  }),
];

export const INITIAL_VIATICO_EMAIL_GROUPS: ViaticoEmailGroup[] = [
  {
    id: 'mailgrp-equipo-contable',
    nombre: 'Equipo Contable',
    tipo: 'copia',
    descripcion: 'Copia automática de respaldo contable en cada envío de liquidación.',
    porDefecto: true,
    activo: true,
    miembros: [],
  },
  {
    id: 'mailgrp-jefe-ventas',
    nombre: 'Jefe de Ventas',
    tipo: 'dirigido',
    descripcion: 'Grupo de autorizadores comerciales para aprobación de viáticos.',
    porDefecto: false,
    activo: true,
    miembros: [],
  },
];
