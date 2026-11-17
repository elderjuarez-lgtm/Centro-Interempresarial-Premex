import {
  EntityMapping,
  FunctionalModuleId,
  ModuleCompanyEntry,
  StandaloneCompanyDbModuleId,
} from '../types';
import { normalizeCompanyKey } from './permissions';

export const STANDALONE_COMPANY_DB_MODULES: StandaloneCompanyDbModuleId[] = [
  'bancos',
  'viaticos',
  'anticipos',
  'cxc',
  'cxp',
];

export const MODULE_COMPANY_DB_META: Record<
  FunctionalModuleId,
  {
    name: string;
    shortName: string;
    status: 'Activo' | 'Próximamente';
    firestorePath: string;
    description: string;
    defaultCurrency: string;
  }
> = {
  intercompany: {
    name: 'Conciliación Intercompany',
    shortName: 'Intercompany',
    status: 'Activo',
    firestorePath: 'company_directories/internacionales',
    description:
      'Catálogo maestro de sociedades Anitox sincronizado con la vista Empresas del módulo Intercompany.',
    defaultCurrency: 'USD',
  },
  bancos: {
    name: 'Conciliación Bancaria',
    shortName: 'Bancos',
    status: 'Activo',
    firestorePath: 'module_company_directories/bancos',
    description:
      'Base de datos independiente de sociedades titulares de cuentas bancarias para Conciliación Bancaria.',
    defaultCurrency: 'USD',
  },
  viaticos: {
    name: 'Liquidación de Viáticos',
    shortName: 'Viáticos',
    status: 'Activo',
    firestorePath: 'module_company_directories/viaticos',
    description:
      'Base de datos independiente de empresas / razones sociales habilitadas para consultores y liquidaciones de viáticos.',
    defaultCurrency: 'GTQ',
  },
  anticipos: {
    name: 'Anticipos',
    shortName: 'Anticipos',
    status: 'Próximamente',
    firestorePath: 'module_company_directories/anticipos',
    description:
      'Base de datos independiente de sociedades que gestionarán anticipos a proveedores y empleados.',
    defaultCurrency: 'USD',
  },
  cxc: {
    name: 'Cuentas por Cobrar',
    shortName: 'CxC',
    status: 'Próximamente',
    firestorePath: 'module_company_directories/cxc',
    description:
      'Base de datos independiente de sociedades emisoras de cartera comercial para Cuentas por Cobrar.',
    defaultCurrency: 'USD',
  },
  cxp: {
    name: 'Cuentas por Pagar',
    shortName: 'CxP',
    status: 'Próximamente',
    firestorePath: 'module_company_directories/cxp',
    description:
      'Base de datos independiente de sociedades pagadoras para control de proveedores y Cuentas por Pagar.',
    defaultCurrency: 'USD',
  },
};

export const INITIAL_STANDALONE_MODULE_COMPANIES: Record<
  StandaloneCompanyDbModuleId,
  ModuleCompanyEntry[]
> = {
  bancos: [
    {
      id: 'bnk-comp-1',
      nombre: 'Premex S.A.S.',
      codigo: 'BNK-CO-01',
      nit: '890900148-1',
      pais: 'Colombia',
      moneda: 'COP',
      activo: true,
    },
    {
      id: 'bnk-comp-2',
      nombre: 'Premex Corp',
      codigo: 'BNK-US-01',
      nit: 'US-84-219043',
      pais: 'Estados Unidos',
      moneda: 'USD',
      activo: true,
    },
    {
      id: 'bnk-comp-3',
      nombre: 'Premex Guatemala',
      codigo: 'BNK-GT-01',
      nit: '2948102-3',
      pais: 'Guatemala',
      moneda: 'USD',
      activo: true,
    },
    {
      id: 'bnk-comp-4',
      nombre: 'Anitox Corporation',
      codigo: 'BNK-ANX-01',
      nit: 'US-58-129044',
      pais: 'Estados Unidos',
      moneda: 'USD',
      activo: true,
    },
  ],
  viaticos: [
    {
      id: 'viat-comp-1',
      nombre: 'Premex Corp',
      codigo: 'VTC-PMX-01',
      nit: 'US-84-219043',
      pais: 'Guatemala',
      moneda: 'GTQ',
      activo: true,
    },
    {
      id: 'viat-comp-2',
      nombre: 'Premex S.A.S.',
      codigo: 'VTC-CO-01',
      nit: '890900148-1',
      pais: 'Colombia',
      moneda: 'COP',
      activo: true,
    },
    {
      id: 'viat-comp-3',
      nombre: 'Anitox Corporation',
      codigo: 'VTC-ANX-01',
      nit: 'US-58-129044',
      pais: 'Estados Unidos',
      moneda: 'USD',
      activo: true,
    },
    {
      id: 'viat-comp-4',
      nombre: 'Premicol S.A. de C.V.',
      codigo: 'VTC-HN-01',
      nit: '0501-9001-22410',
      pais: 'Honduras',
      moneda: 'HNL',
      activo: true,
    },
  ],
  anticipos: [
    {
      id: 'ant-comp-1',
      nombre: 'Premex S.A.S.',
      codigo: 'ANT-CO-01',
      pais: 'Colombia',
      moneda: 'COP',
      activo: true,
    },
    {
      id: 'ant-comp-2',
      nombre: 'Premex Corp',
      codigo: 'ANT-US-01',
      pais: 'Estados Unidos',
      moneda: 'USD',
      activo: true,
    },
    {
      id: 'ant-comp-3',
      nombre: 'Premex Guatemala',
      codigo: 'ANT-GT-01',
      pais: 'Guatemala',
      moneda: 'GTQ',
      activo: true,
    },
  ],
  cxc: [
    {
      id: 'cxc-comp-1',
      nombre: 'Premex S.A.S.',
      codigo: 'CXC-CO-01',
      pais: 'Colombia',
      moneda: 'COP',
      activo: true,
    },
    {
      id: 'cxc-comp-2',
      nombre: 'Premex Corp',
      codigo: 'CXC-US-01',
      pais: 'Estados Unidos',
      moneda: 'USD',
      activo: true,
    },
    {
      id: 'cxc-comp-3',
      nombre: 'Pralsa Guatemala',
      codigo: 'CXC-GT-01',
      pais: 'Guatemala',
      moneda: 'GTQ',
      activo: true,
    },
  ],
  cxp: [
    {
      id: 'cxp-comp-1',
      nombre: 'Premex S.A.S.',
      codigo: 'CXP-CO-01',
      pais: 'Colombia',
      moneda: 'COP',
      activo: true,
    },
    {
      id: 'cxp-comp-2',
      nombre: 'Premex Corp',
      codigo: 'CXP-US-01',
      pais: 'Estados Unidos',
      moneda: 'USD',
      activo: true,
    },
    {
      id: 'cxp-comp-3',
      nombre: 'Premicol S.A. de C.V.',
      codigo: 'CXP-HN-01',
      pais: 'Honduras',
      moneda: 'USD',
      activo: true,
    },
  ],
};

export const sanitizeModuleCompanyEntry = (
  raw: Partial<ModuleCompanyEntry>,
  index = 0
): ModuleCompanyEntry => ({
  id: String(raw.id || `comp-${Date.now()}-${index}`).slice(0, 120),
  nombre: String(raw.nombre || '').trim().slice(0, 140),
  codigo: raw.codigo ? String(raw.codigo).trim().slice(0, 40) : '',
  nit: raw.nit ? String(raw.nit).trim().slice(0, 50) : '',
  pais: raw.pais ? String(raw.pais).trim().slice(0, 80) : '',
  moneda: raw.moneda ? String(raw.moneda).trim().slice(0, 20) : 'USD',
  activo: raw.activo !== false,
});

export const sanitizeModuleCompanyList = (
  list: Partial<ModuleCompanyEntry>[]
): ModuleCompanyEntry[] => {
  const seen = new Set<string>();
  const result: ModuleCompanyEntry[] = [];
  list.slice(0, 300).forEach((item, idx) => {
    const clean = sanitizeModuleCompanyEntry(item, idx);
    const key = normalizeCompanyKey(clean.nombre);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(clean);
  });
  return result;
};

export const entityMappingsToModuleCompanies = (
  entities: EntityMapping[]
): ModuleCompanyEntry[] =>
  entities.map((e) => ({
    id: e.id,
    nombre: e.nombreOficial,
    codigo: e.codigoSociedad || '',
    nit: e.nit || '',
    pais: e.pais || '',
    moneda: e.moneda || 'USD',
    activo: true,
  }));

export const mergeModuleCompanyEntriesToEntities = (
  entries: ModuleCompanyEntry[],
  existingEntities: EntityMapping[]
): EntityMapping[] => {
  const byId = new Map<string, EntityMapping>();
  const byName = new Map<string, EntityMapping>();
  existingEntities.forEach((e) => {
    byId.set(e.id, e);
    byName.set(normalizeCompanyKey(e.nombreOficial), e);
  });

  return sanitizeModuleCompanyList(entries)
    .filter((c) => c.activo)
    .map((c, idx) => {
      const prev = byId.get(c.id) || byName.get(normalizeCompanyKey(c.nombre));
      return {
        id: prev?.id || c.id || `ent-${Date.now()}-${idx}`,
        alias: prev?.alias || c.nombre,
        nombreOficial: c.nombre,
        nit: c.nit || prev?.nit || '',
        email: prev?.email || '',
        codigoSociedad: c.codigo || prev?.codigoSociedad || `SOC-${(idx + 1) * 100}`,
        pais: c.pais || prev?.pais || 'Global',
        moneda: c.moneda || prev?.moneda || 'USD',
      };
    });
};

/**
 * Augments a module's base company catalog with any runtime society names present in
 * active transactions/accounts/consultants (without mutating stored records).
 */
export const mergeRuntimeSocietyNames = (
  catalog: ModuleCompanyEntry[],
  runtimeNames: { nombre: string; pais?: string; moneda?: string }[],
  prefix: string
): ModuleCompanyEntry[] => {
  const seen = new Set(catalog.map((c) => normalizeCompanyKey(c.nombre)));
  const extras: ModuleCompanyEntry[] = [];
  runtimeNames.forEach((item, idx) => {
    const cleanName = String(item.nombre || '').trim();
    const key = normalizeCompanyKey(cleanName);
    if (!key || seen.has(key)) return;
    seen.add(key);
    extras.push({
      id: `${prefix}-auto-${idx}-${key.replace(/[^a-z0-9]/g, '').slice(0, 16)}`,
      nombre: cleanName,
      codigo: '',
      nit: '',
      pais: item.pais || '',
      moneda: item.moneda || 'USD',
      activo: true,
    });
  });
  return [...catalog, ...extras];
};
