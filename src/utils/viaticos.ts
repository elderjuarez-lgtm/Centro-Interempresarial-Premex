import {
  EffectivePermissions,
  ViaticoCategory,
  ViaticoConsultor,
  ViaticoCurrency,
  ViaticoExpenseItem,
  ViaticoLiquidation,
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
  permissions: EffectivePermissions
): {
  matchedConsultor: ViaticoConsultor | null;
  availableConsultores: ViaticoConsultor[];
  isLockedToOwnConsultor: boolean;
  detectedFromEmailLabel: string | null;
} => {
  const viaticosScope = permissions.getModuleCompanyScope('viaticos');
  const viaticosAllowedCompanies = permissions.getAllowedCompaniesForModule('viaticos');
  const companyAllowedConsultores = consultores.filter(
    (c) =>
      permissions.isAdmin ||
      viaticosScope === 'all' ||
      permissions.isCompanyAllowed(c.empresa, 'viaticos')
  );

  if (permissions.isAdmin) {
    const matched = matchConsultorFromEmail(permissions.email, consultores);
    return {
      matchedConsultor: matched,
      availableConsultores: consultores,
      isLockedToOwnConsultor: false,
      detectedFromEmailLabel: matched
        ? `${matched.nombreCompleto} (Administrador · acceso total)`
        : null,
    };
  }

  const matched = matchConsultorFromEmail(permissions.email, consultores);

  // Operador (Liquidador): scoped automatically to their own consultant profile detected via email
  if (permissions.role === 'operador' && permissions.email) {
    if (matched) {
      return {
        matchedConsultor: matched,
        availableConsultores: [matched],
        isLockedToOwnConsultor: true,
        detectedFromEmailLabel: `${matched.nombreCompleto} (identificado desde ${permissions.email})`,
      };
    }

    // Auto-build virtual consultant entry from `primerNombre.primerApellido@correo`
    const derivedName =
      permissions.displayName && !permissions.displayName.includes('@')
        ? permissions.displayName
        : formatConsultorNameFromEmail(permissions.email);
    const derivedEmpresa =
      viaticosScope === 'selected' && viaticosAllowedCompanies[0]
        ? viaticosAllowedCompanies[0]
        : 'Premex Corp';
    const virtualConsultor: ViaticoConsultor = {
      id: `cons-auto-${normalizeTextToken(permissions.email).replace(/\s+/g, '-')}`,
      nombreCompleto: derivedName,
      email: normalizeEmail(permissions.email),
      empresa: derivedEmpresa,
      cargo: 'Consultor / Liquidador',
      monedaBase: 'Quetzales',
      activo: true,
    };
    return {
      matchedConsultor: virtualConsultor,
      availableConsultores: [virtualConsultor],
      isLockedToOwnConsultor: true,
      detectedFromEmailLabel: `${virtualConsultor.nombreCompleto} (detectado desde ${permissions.email})`,
    };
  }

  // Solo Consulta: can inspect liquidaciones of their own matched consultant or permitted Viáticos companies
  return {
    matchedConsultor: matched,
    availableConsultores:
      viaticosScope === 'selected' ? companyAllowedConsultores : consultores,
    isLockedToOwnConsultor: false,
    detectedFromEmailLabel: matched ? matched.nombreCompleto : null,
  };
};

export const filterLiquidacionesByPermissions = (
  liquidaciones: ViaticoLiquidation[],
  permissions: EffectivePermissions,
  matchedConsultor: ViaticoConsultor | null
): ViaticoLiquidation[] => {
  if (permissions.isAdmin) return liquidaciones;

  const viaticosScope = permissions.getModuleCompanyScope('viaticos');

  return liquidaciones.filter((liq) => {
    const companyOk =
      viaticosScope === 'all' || permissions.isCompanyAllowed(liq.empresa, 'viaticos');
    if (!companyOk) return false;

    if (permissions.role === 'operador' && permissions.email) {
      const userEmail = normalizeEmail(permissions.email);
      if (normalizeEmail(liq.consultorEmail) === userEmail) return true;
      if (matchedConsultor && liq.consultorId === matchedConsultor.id) return true;
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
    monedaBase: 'Quetzales',
    activo: true,
  },
  {
    id: 'cons-melania-castillo',
    nombreCompleto: 'Melania Castillo Lopez',
    email: 'melania.castillo@premexcorp.com',
    empresa: 'Premex S.A.S.',
    cargo: 'Consultora Técnica Comercial',
    monedaBase: 'Quetzales',
    activo: true,
  },
  {
    id: 'cons-cecilia-morales',
    nombreCompleto: 'Cecilia Morales Estrada',
    email: 'cecilia.morales@premexcorp.com',
    empresa: 'Anitox Corporation',
    cargo: 'Especialista Nutrición Animal',
    monedaBase: 'Quetzales',
    activo: true,
  },
  {
    id: 'cons-carlos-mendoza',
    nombreCompleto: 'Carlos Mendoza Rivas',
    email: 'carlos.mendoza@premexcorp.com',
    empresa: 'Premex S.A.S.',
    cargo: 'Consultor de Operaciones',
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
