import * as XLSX from 'xlsx';
import {
  ClaraBatchExportLog,
  ClaraConnectorConfig,
  ClaraCostCenterRule,
  ClaraErpTarget,
  ClaraTransaction,
  ClaraVendor,
  ClaraVendorSyncStatus,
  ClaraWorkManagerInvoice,
  ClaraWorkManagerRadicacionStatus,
  ClaraWorkManagerStatus,
  EffectivePermissions,
} from '../types';

import { ClaraExtractedInvoiceData } from '../services/claraAi';

export const DEFAULT_CLARA_DOC_ID = 'premex-clara-principal';

export const INITIAL_CLARA_CONNECTOR_CONFIG: ClaraConnectorConfig = {
  claraMode: 'archivo',
  workManagerMode: 'archivo',
  sapMode: 'archivo_lote',
  odooMode: 'archivo_lote',
  toleranciaCruceMonto: 5,
  diasVentanaCruce: 20,
  detectarExteriorAutomatico: true,
  notaViaticosFutura:
    'Integración futura planificada: las legalizaciones sin soporte en tarjeta corporativa o cruces de reembolso podrán conectarse con Liquidación de Viáticos en una segunda fase.',
  claraUrl: 'https://colombia.clara.com/auth/login',
  workManagerUrl: 'https://pan.iluma.bio:8037/Account/Login',
  agentUrl: 'http://127.0.0.1:4780',
  executionMode: 'hibrido_web',
  sapSociedadDefault: 'CO10',
  sapFondoDefault: 'INTR',
  sapOperacionContableDefault: 'GASTOS TC',
  sapClaseDocDefault: 'KR',
  sapFechaContableDefault: '',
  sapClaseFacturaDefault: 'Documento Soporte',
};

export const INITIAL_CLARA_COST_CENTER_RULES: ClaraCostCenterRule[] = [
  {
    id: 'cc-rule-premex-com',
    sociedad: 'PREMEX',
    centroCostoClara: 'CC-COM-01 Ventas',
    erpDestino: 'SAP',
    codigoCentroCostoErp: 'CO10001500',
    cuentaContableDefault: '5195250001',
    sociedadSap: 'CO10',
    fondoDefault: 'INTR',
    operacionContableDefault: 'GASTOS TC',
    activa: true,
  },
  {
    id: 'cc-rule-premex-ti',
    sociedad: 'PREMEX',
    centroCostoClara: 'CC-TI-04 Tecnología',
    erpDestino: 'SAP',
    codigoCentroCostoErp: 'CO10001500',
    cuentaContableDefault: '5135700002',
    sociedadSap: 'CO10',
    fondoDefault: 'INTR',
    operacionContableDefault: 'GASTOS TC',
    activa: true,
  },
  {
    id: 'cc-rule-adiquim-ops',
    sociedad: 'ADIQUIM',
    centroCostoClara: 'CC-OPS-02 Planta',
    erpDestino: 'SAP',
    codigoCentroCostoErp: 'CO20001500',
    cuentaContableDefault: '5295200005',
    sociedadSap: 'CO20',
    fondoDefault: 'INTR',
    operacionContableDefault: 'GASTOS TC',
    activa: true,
  },
  {
    id: 'cc-rule-nutreo-mkt',
    sociedad: 'NUTREO',
    centroCostoClara: 'CC-MKT-03 Mercadeo',
    erpDestino: 'Odoo',
    codigoCentroCostoErp: 'AN-MKT-03',
    cuentaAnaliticaOdoo: 'Mercadeo Nutreo',
    cuentaContableDefault: '523560',
    diarioOdoo: 'Tarjeta Corporativa Clara',
    activa: true,
  },
  {
    id: 'cc-rule-premexcorp-ger',
    sociedad: 'Premex Corp',
    centroCostoClara: 'CC-GER-01 Dirección',
    erpDestino: 'Odoo',
    codigoCentroCostoErp: 'AN-GER-01',
    cuentaAnaliticaOdoo: 'Dirección General',
    cuentaContableDefault: '611010',
    diarioOdoo: 'Clara USD',
    activa: true,
  },
];

export const INITIAL_CLARA_VENDORS: ClaraVendor[] = [
  {
    id: 'vnd-avianca',
    nitTaxId: '890100577-6',
    razonSocial: 'AEROVIAS DEL CONTINENTE AMERICANO S.A. AVIANCA',
    aliasComerciosClara: ['AVIANCA', 'AVIANCA.COM', 'AEROVIAS DEL CONTINENTE'],
    pais: 'Colombia',
    esExterior: false,
    tipoPersona: 'Jurídica',
    regimenFiscal: 'Responsable de IVA · Gran Contribuyente',
    erpObjetivo: 'Ambos',
    codigoTerceroSap: '20001458',
    partnerIdOdoo: 'ODOO-P-1042',
    cuentaGastoDefault: '5155150001',
    estadoCreacion: 'sincronizado_ambos',
    notas: 'Homologado en SAP y Odoo.',
  },
  {
    id: 'vnd-aws',
    nitTaxId: 'US-91-1646860',
    razonSocial: 'AMAZON WEB SERVICES INC',
    aliasComerciosClara: ['AWS CLOUD', 'AMAZON WEB SERVICES', 'AWS.AMAZON.COM'],
    pais: 'Estados Unidos',
    esExterior: true,
    tipoPersona: 'Extranjero',
    regimenFiscal: 'Proveedor del Exterior (Sin factura DIAN)',
    erpObjetivo: 'SAP',
    codigoTerceroSap: '90000412',
    cuentaGastoDefault: '5135700002',
    estadoCreacion: 'creado_sap',
    notas: 'Gasto exterior recurrente de infraestructura.',
  },
  {
    id: 'vnd-crepes',
    nitTaxId: '860076554-1',
    razonSocial: 'CREPES & WAFFLES S.A.',
    aliasComerciosClara: ['CREPES & WAFFLES', 'CREPES AND WAFFLES'],
    pais: 'Colombia',
    esExterior: false,
    tipoPersona: 'Jurídica',
    regimenFiscal: 'Responsable de IVA / Impoconsumo',
    erpObjetivo: 'SAP',
    codigoTerceroSap: '',
    partnerIdOdoo: '',
    cuentaGastoDefault: '5195600003',
    estadoCreacion: 'pendiente_crear',
    notas: 'Detectado en Clara y WorkManager; pendiente crear tercero en SAP.',
  },
  {
    id: 'vnd-meta',
    nitTaxId: 'IE-9692928F',
    razonSocial: 'META PLATFORMS IRELAND LIMITED',
    aliasComerciosClara: ['FACEBK *ADS', 'META ADS', 'FACEBOOK ADS'],
    pais: 'Irlanda',
    esExterior: true,
    tipoPersona: 'Extranjero',
    regimenFiscal: 'Pauta digital exterior',
    erpObjetivo: 'Odoo',
    codigoTerceroSap: '',
    partnerIdOdoo: '',
    cuentaGastoDefault: '523560',
    estadoCreacion: 'pendiente_crear',
    notas: 'Gasto exterior exento de WorkManager; pendiente crear partner en Odoo.',
  },
];

export const INITIAL_CLARA_WM_INVOICES: ClaraWorkManagerInvoice[] = [
  {
    id: 'wm-inv-1',
    numeroFactura: 'FEAV-984512',
    cufe: 'a418f92c77b8103e9c12011a44129b7f',
    fechaEmision: '2026-11-12',
    nitEmisor: '890100577-6',
    razonSocialEmisor: 'AEROVIAS DEL CONTINENTE AMERICANO S.A. AVIANCA',
    sociedadReceptora: 'PREMEX',
    moneda: 'COP',
    subtotal: 1120000,
    impuesto: 56000,
    total: 1176000,
    estadoDian: 'Aprobada',
    vinculadaClaraTxId: 'clara-tx-1',
    origenCarga: 'demo',
  },
  {
    id: 'wm-inv-2',
    numeroFactura: 'CWF-441092',
    cufe: 'b981a104ef92347ac109234dd19822ab',
    fechaEmision: '2026-11-15',
    nitEmisor: '860076554-1',
    razonSocialEmisor: 'CREPES & WAFFLES S.A.',
    sociedadReceptora: 'PREMEX',
    moneda: 'COP',
    subtotal: 310000,
    impuesto: 24800,
    total: 334800,
    estadoDian: 'Recibida',
    vinculadaClaraTxId: 'clara-tx-2',
    origenCarga: 'demo',
  },
  {
    id: 'wm-inv-3',
    numeroFactura: 'PRX-10984',
    cufe: 'c88234109aa8712cc77112200142ee09',
    fechaEmision: '2026-11-18',
    nitEmisor: '900451890-2',
    razonSocialEmisor: 'PAPELERIA COMERCIAL DEL VALLE S.A.S.',
    sociedadReceptora: 'NUTREO',
    moneda: 'COP',
    subtotal: 245000,
    impuesto: 46550,
    total: 291550,
    estadoDian: 'Recibida',
    origenCarga: 'demo',
  },
];

export const INITIAL_CLARA_TRANSACTIONS: ClaraTransaction[] = [
  {
    id: 'clara-tx-1',
    claraTxId: 'CLR-202611-001',
    fecha: '2026-11-12',
    sociedad: 'PREMEX',
    tarjetahabiente: 'Carlos Mendoza',
    tarjetaUltimos4: '4821',
    comercio: 'AVIANCA.COM',
    nitComercio: '890100577-6',
    pais: 'Colombia',
    moneda: 'COP',
    valor: 1176000,
    centroCosto: 'CC-COM-01 Ventas',
    observacion: 'Tiquete Bogotá - Medellín visita cliente comercial',
    categoria: 'Viajes y Tiquetes',
    estadoClara: 'Autorizada',
    origenGasto: 'nacional',
    workManagerStatus: 'validada',
    workManagerInvoiceId: 'wm-inv-1',
    workManagerNumeroFactura: 'FEAV-984512',
    terceroId: 'vnd-avianca',
    terceroNit: '890100577-6',
    terceroNombre: 'AEROVIAS DEL CONTINENTE AMERICANO S.A. AVIANCA',
    erpDestino: 'SAP',
    cuentaContable: '5155150001',
    indicadorImpuesto: 'V5 (IVA 5%)',
    estadoContable: 'listo_erp',
    origenRegistro: 'demo',
  },
  {
    id: 'clara-tx-2',
    claraTxId: 'CLR-202611-002',
    fecha: '2026-11-15',
    sociedad: 'PREMEX',
    tarjetahabiente: 'Laura Gómez',
    tarjetaUltimos4: '1190',
    comercio: 'CREPES & WAFFLES',
    nitComercio: '860076554-1',
    pais: 'Colombia',
    moneda: 'COP',
    valor: 334800,
    centroCosto: 'CC-COM-01 Ventas',
    observacion: 'Almuerzo cierre comercial con distribuidor regional',
    categoria: 'Alimentación / Representación',
    estadoClara: 'Autorizada',
    origenGasto: 'nacional',
    workManagerStatus: 'validada',
    workManagerInvoiceId: 'wm-inv-2',
    workManagerNumeroFactura: 'CWF-441092',
    terceroId: 'vnd-crepes',
    terceroNit: '860076554-1',
    terceroNombre: 'CREPES & WAFFLES S.A.',
    erpDestino: 'SAP',
    cuentaContable: '5195600003',
    indicadorImpuesto: 'IC8 (Impoconsumo 8%)',
    estadoContable: 'borrador',
    origenRegistro: 'demo',
  },
  {
    id: 'clara-tx-3',
    claraTxId: 'CLR-202611-003',
    fecha: '2026-11-16',
    sociedad: 'PREMEX',
    tarjetahabiente: 'Andrés Salgado',
    tarjetaUltimos4: '7740',
    comercio: 'AWS CLOUD',
    nitComercio: 'US-91-1646860',
    pais: 'Estados Unidos',
    moneda: 'USD',
    valor: 642.5,
    centroCosto: 'CC-TI-04 Tecnología',
    observacion: 'Servidores producción AWS Noviembre 2026',
    categoria: 'Servicios Cloud / Software',
    estadoClara: 'Autorizada',
    origenGasto: 'exterior',
    motivoExterior: 'Proveedor del exterior (USD / Estados Unidos) — exento de WorkManager',
    workManagerStatus: 'exenta_exterior',
    terceroId: 'vnd-aws',
    terceroNit: 'US-91-1646860',
    terceroNombre: 'AMAZON WEB SERVICES INC',
    erpDestino: 'SAP',
    cuentaContable: '5135700002',
    indicadorImpuesto: 'S0 (Exterior 0%)',
    estadoContable: 'listo_erp',
    origenRegistro: 'demo',
  },
  {
    id: 'clara-tx-4',
    claraTxId: 'CLR-202611-004',
    fecha: '2026-11-18',
    sociedad: 'ADIQUIM',
    tarjetahabiente: 'Diana Ríos',
    tarjetaUltimos4: '3308',
    comercio: 'FERRETERIA INDUSTRIAL EL SOL',
    nitComercio: '',
    pais: 'Colombia',
    moneda: 'COP',
    valor: 485000,
    centroCosto: 'CC-OPS-02 Planta',
    observacion: 'Compra urgente insumos mantenimiento línea 2 (pendiente envío factura electrónica)',
    categoria: 'Mantenimiento / Insumos',
    estadoClara: 'Autorizada',
    origenGasto: 'nacional',
    workManagerStatus: 'pendiente_factura',
    erpDestino: 'SAP',
    cuentaContable: '5295200005',
    indicadorImpuesto: 'V19',
    estadoContable: 'borrador',
    origenRegistro: 'demo',
  },
  {
    id: 'clara-tx-5',
    claraTxId: 'CLR-202611-005',
    fecha: '2026-11-19',
    sociedad: 'NUTREO',
    tarjetahabiente: 'Sofía Castro',
    tarjetaUltimos4: '9052',
    comercio: 'FACEBK *ADS',
    nitComercio: '',
    pais: 'Irlanda',
    moneda: 'USD',
    valor: 380,
    centroCosto: 'CC-MKT-03 Mercadeo',
    observacion: 'Campaña pauta digital lanzamiento línea Nutreo Q4',
    categoria: 'Publicidad Digital',
    estadoClara: 'Autorizada',
    origenGasto: 'exterior',
    motivoExterior: 'Pauta digital exterior (Irlanda / USD) — no requiere WorkManager',
    workManagerStatus: 'exenta_exterior',
    terceroId: 'vnd-meta',
    terceroNit: 'IE-9692928F',
    terceroNombre: 'META PLATFORMS IRELAND LIMITED',
    erpDestino: 'Odoo',
    cuentaContable: '523560',
    indicadorImpuesto: 'EX0',
    estadoContable: 'borrador',
    origenRegistro: 'demo',
  },
  {
    id: 'clara-tx-6',
    claraTxId: 'CLR-202611-006',
    fecha: '2026-11-18',
    sociedad: 'NUTREO',
    tarjetahabiente: 'Sofía Castro',
    tarjetaUltimos4: '9052',
    comercio: 'PAPELERIA COMERCIAL DEL VALLE',
    nitComercio: '900451890-2',
    pais: 'Colombia',
    moneda: 'COP',
    valor: 291550,
    centroCosto: 'CC-MKT-03 Mercadeo',
    observacion: 'Material POP y papelería evento comercial',
    categoria: 'Papelería y Material POP',
    estadoClara: 'Autorizada',
    origenGasto: 'nacional',
    workManagerStatus: 'validada',
    workManagerInvoiceId: 'wm-inv-3',
    workManagerNumeroFactura: 'PRX-10984',
    erpDestino: 'Odoo',
    cuentaContable: '523560',
    indicadorImpuesto: 'IVA 19%',
    estadoContable: 'borrador',
    origenRegistro: 'demo',
  },
];

const FOREIGN_COMMERCE_HINTS = [
  'AWS',
  'AMAZON WEB SERVICES',
  'GOOGLE',
  'META',
  'FACEBK',
  'FACEBOOK',
  'MICROSOFT',
  'ADOBE',
  'OPENAI',
  'CHATGPT',
  'ZOOM',
  'GITHUB',
  'ATLASSIAN',
  'SLACK',
  'NOTION',
  'FIGMA',
  'DROPBOX',
  'LINKEDIN',
  'CANVA',
  'BOOKING',
  'EXPEDIA',
  'AIRBNB',
  'AMERICAN AIRLINES',
  'DELTA AIR',
  'UNITED AIR',
  'LUFTHANSA',
  'IBERIA',
  'KLM',
  'STRIPE',
  'GODADDY',
  'CLOUDFLARE',
  'VERCEL',
];

const LOCAL_COUNTRIES = new Set([
  'colombia',
  'co',
  'col',
  'guatemala',
  'gt',
  'gtm',
  'mexico',
  'méxico',
  'mx',
  'honduras',
  'hn',
]);

export const normalizeTextKey = (value?: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeNitKey = (nit?: string): string =>
  String(nit || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

export const formatClaraMoney = (value: number, currency = 'COP'): string => {
  const num = Number.isFinite(value) ? value : 0;
  const code = String(currency || 'COP').trim().toUpperCase();
  const decimals = code === 'COP' ? 0 : 2;
  try {
    return `${code} ${num.toLocaleString('es-CO', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  } catch {
    return `${code} ${num.toFixed(decimals)}`;
  }
};

export const detectIsForeignExpense = (tx: {
  pais?: string;
  moneda?: string;
  comercio?: string;
  sociedad?: string;
}): { isForeign: boolean; reason?: string } => {
  const country = normalizeTextKey(tx.pais);
  const currency = String(tx.moneda || '').trim().toUpperCase();
  const merchant = String(tx.comercio || '').trim().toUpperCase();
  const society = normalizeTextKey(tx.sociedad);

  const isForeignMerchant = FOREIGN_COMMERCE_HINTS.some((hint) => merchant.includes(hint));
  if (isForeignMerchant) {
    return {
      isForeign: true,
      reason: 'Comercio digital / internacional detectado automáticamente',
    };
  }

  if (country && !LOCAL_COUNTRIES.has(country)) {
    return {
      isForeign: true,
      reason: `País del gasto (${tx.pais}) fuera de operación local`,
    };
  }

  const isUsSociety = society.includes('corp') || society.includes('anitox');
  if (!isUsSociety && (currency === 'USD' || currency === 'EUR')) {
    return {
      isForeign: true,
      reason: `Moneda extranjera (${currency}) — exento de validación WorkManager`,
    };
  }

  return { isForeign: false };
};

export const findMatchingVendor = (
  tx: Pick<ClaraTransaction, 'comercio' | 'nitComercio' | 'terceroId'>,
  vendors: ClaraVendor[]
): ClaraVendor | undefined => {
  if (tx.terceroId) {
    const byId = vendors.find((v) => v.id === tx.terceroId);
    if (byId) return byId;
  }

  const txNit = normalizeNitKey(tx.nitComercio);
  if (txNit) {
    const byNit = vendors.find((v) => normalizeNitKey(v.nitTaxId) === txNit);
    if (byNit) return byNit;
  }

  const merchantNorm = normalizeTextKey(tx.comercio);
  if (!merchantNorm) return undefined;

  return vendors.find((v) => {
    const razNorm = normalizeTextKey(v.razonSocial);
    if (razNorm && (razNorm.includes(merchantNorm) || merchantNorm.includes(razNorm))) {
      return true;
    }
    return v.aliasComerciosClara.some((alias) => {
      const aliasNorm = normalizeTextKey(alias);
      return aliasNorm && (merchantNorm.includes(aliasNorm) || aliasNorm.includes(merchantNorm));
    });
  });
};

export const isVendorReadyForErp = (
  vendor: ClaraVendor | undefined,
  erp: ClaraErpTarget
): boolean => {
  if (!vendor) return false;
  if (erp === 'SAP') {
    return (
      Boolean(vendor.codigoTerceroSap?.trim()) ||
      vendor.estadoCreacion === 'creado_sap' ||
      vendor.estadoCreacion === 'sincronizado_ambos'
    );
  }
  if (erp === 'Odoo') {
    return (
      Boolean(vendor.partnerIdOdoo?.trim()) ||
      vendor.estadoCreacion === 'creado_odoo' ||
      vendor.estadoCreacion === 'sincronizado_ambos'
    );
  }
  return vendor.estadoCreacion !== 'pendiente_crear';
};

export const evaluateTransactionReadiness = (
  tx: ClaraTransaction,
  vendors: ClaraVendor[]
): {
  ready: boolean;
  blockers: string[];
  matchedVendor?: ClaraVendor;
} => {
  const blockers: string[] = [];

  if (!tx.valor || tx.valor <= 0) {
    blockers.push('Valor en Clara inválido');
  }
  if (!tx.centroCosto?.trim()) {
    blockers.push('Falta centro de costos de Clara');
  }
  if (!tx.observacion?.trim()) {
    blockers.push('Falta observación / concepto del gasto');
  }
  if (
    tx.origenGasto !== 'exterior' &&
    tx.workManagerStatus !== 'validada' &&
    tx.workManagerStatus !== 'exenta_exterior'
  ) {
    blockers.push(
      tx.workManagerStatus === 'diferencia_valor'
        ? 'Diferencia en factura WorkManager'
        : 'Pendiente validar factura en WorkManager'
    );
  }

  const matchedVendor = findMatchingVendor(tx, vendors);
  if (tx.erpDestino === 'Por definir') {
    blockers.push('Definir ERP destino (SAP u Odoo)');
  }
  if (!matchedVendor) {
    blockers.push('Tercero no creado en catálogo');
  } else if (!isVendorReadyForErp(matchedVendor, tx.erpDestino)) {
    blockers.push(
      tx.erpDestino === 'Por definir'
        ? 'Tercero pendiente de creación en ERP'
        : `Tercero pendiente de crear/homologar en ${tx.erpDestino}`
    );
  }

  if (!tx.cuentaContable?.trim()) {
    blockers.push('Sin cuenta contable asignada');
  }

  return {
    ready: blockers.length === 0,
    blockers,
    matchedVendor,
  };
};

const daysBetweenIso = (dateA: string, dateB: string): number => {
  if (!dateA || !dateB) return 999;
  const a = new Date(`${dateA}T00:00:00Z`).getTime();
  const b = new Date(`${dateB}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 999;
  return Math.abs(Math.round((a - b) / (1000 * 60 * 60 * 24)));
};

export const reconcileClaraState = (params: {
  transactions: ClaraTransaction[];
  workManagerInvoices: ClaraWorkManagerInvoice[];
  vendors: ClaraVendor[];
  costCenterRules: ClaraCostCenterRule[];
  connectorConfig: ClaraConnectorConfig;
}): {
  transactions: ClaraTransaction[];
  workManagerInvoices: ClaraWorkManagerInvoice[];
} => {
  const {
    transactions,
    workManagerInvoices,
    vendors,
    costCenterRules,
    connectorConfig,
  } = params;

  const tolerance = Math.max(0, Number(connectorConfig.toleranciaCruceMonto) || 5);
  const maxDays = Math.max(1, Number(connectorConfig.diasVentanaCruce) || 20);

  const invoiceLinks = new Map<string, string>(); // invoiceId -> claraTxId
  const nextInvoices = workManagerInvoices.map((inv) => ({ ...inv }));

  // Preserve manual links first
  transactions.forEach((tx) => {
    if (tx.workManagerInvoiceId) {
      const inv = nextInvoices.find((i) => i.id === tx.workManagerInvoiceId);
      if (inv) {
        invoiceLinks.set(inv.id, tx.id);
      }
    }
  });

  const nextTransactions = transactions.map((rawTx) => {
    const tx: ClaraTransaction = { ...rawTx };

    // 1. Apply cost center rule defaults when missing or Por definir
    const matchedRule = costCenterRules.find(
      (r) =>
        r.activa &&
        normalizeTextKey(r.sociedad) === normalizeTextKey(tx.sociedad) &&
        (normalizeTextKey(r.centroCostoClara) === normalizeTextKey(tx.centroCosto) ||
          normalizeTextKey(tx.centroCosto).includes(normalizeTextKey(r.centroCostoClara)))
    );
    if (matchedRule) {
      if (tx.erpDestino === 'Por definir') {
        tx.erpDestino = matchedRule.erpDestino;
      }
      if (!tx.cuentaContable?.trim() && matchedRule.cuentaContableDefault) {
        tx.cuentaContable = matchedRule.cuentaContableDefault;
      }
    }

    // 2. Vendor matching
    const vendor = findMatchingVendor(tx, vendors);
    if (vendor) {
      tx.terceroId = vendor.id;
      tx.terceroNit = vendor.nitTaxId || tx.terceroNit;
      tx.terceroNombre = vendor.razonSocial;
      if (!tx.cuentaContable?.trim() && vendor.cuentaGastoDefault) {
        tx.cuentaContable = vendor.cuentaGastoDefault;
      }
    }

    // 3. Foreign origin & Work Manager Radicacion check
    if (tx.origenGasto === 'exterior') {
      tx.workManagerStatus = 'exenta_exterior';
      tx.wmRadicacionStatus = 'exenta_exterior';
      tx.wmMensajeValidacion = tx.motivoExterior || 'Gasto del exterior exento de radicación WM.';
      tx.workManagerInvoiceId = undefined;
      tx.workManagerNumeroFactura = undefined;
    } else {
      let matchedInv = tx.workManagerInvoiceId
        ? nextInvoices.find((inv) => inv.id === tx.workManagerInvoiceId)
        : undefined;

      if (!matchedInv) {
        const txNit = normalizeNitKey(tx.facturaNit || tx.nitComercio || tx.terceroNit);
        const txMerchant = normalizeTextKey(tx.facturaProveedor || tx.comercio);
        const txVendorName = normalizeTextKey(tx.terceroNombre);
        const obsUpper = String(tx.observacion || '').toUpperCase();
        const extractedNumUpper = String(tx.facturaNumero || '').trim().toUpperCase();
        const extractedCufe = String(tx.facturaCufe || '').trim().toLowerCase();

        matchedInv = nextInvoices.find((inv) => {
          const alreadyUsedBy = invoiceLinks.get(inv.id);
          if (alreadyUsedBy && alreadyUsedBy !== tx.id) return false;

          // 0. Exact CUFE match
          if (extractedCufe && inv.cufe && inv.cufe.trim().toLowerCase() === extractedCufe) {
            return true;
          }

          // A. Exact invoice number match from AI extraction or Clara observation
          const invNumUpper = String(inv.numeroFactura || '').trim().toUpperCase();
          if (
            invNumUpper &&
            ((extractedNumUpper &&
              (invNumUpper === extractedNumUpper ||
                invNumUpper.includes(extractedNumUpper) ||
                extractedNumUpper.includes(invNumUpper))) ||
              obsUpper.includes(invNumUpper))
          ) {
            return true;
          }

          const invNit = normalizeNitKey(inv.nitEmisor);
          const invName = normalizeTextKey(inv.razonSocialEmisor);
          const sameNit = Boolean(txNit && invNit && txNit === invNit);
          const sameName = Boolean(
            (txMerchant && (invName.includes(txMerchant) || txMerchant.includes(invName))) ||
              (txVendorName && (invName.includes(txVendorName) || txVendorName.includes(invName)))
          );

          if (!sameNit && !sameName) return false;

          const dayDiff = daysBetweenIso(tx.facturaFecha || tx.fecha, inv.fechaEmision);
          const refTotal = Number(tx.facturaTotal || tx.valor);
          const amountDiff = Math.abs(refTotal - Number(inv.total));
          return dayDiff <= maxDays && amountDiff <= Math.max(tolerance, refTotal * 0.05);
        });
      }

      if (matchedInv) {
        invoiceLinks.set(matchedInv.id, tx.id);
        tx.workManagerInvoiceId = matchedInv.id;
        tx.workManagerNumeroFactura = matchedInv.numeroFactura;
        tx.wmRadicacionNumero = matchedInv.numeroFactura;
        tx.wmRadicacionFecha = matchedInv.fechaEmision;
        if (!tx.nitComercio && matchedInv.nitEmisor) {
          tx.nitComercio = matchedInv.nitEmisor;
        }
        const diff = Math.abs(Number(tx.valor) - Number(matchedInv.total));
        if (matchedInv.estadoDian === 'Con Reclamo') {
          tx.workManagerStatus = 'diferencia_valor';
          tx.wmRadicacionStatus = 'inconsistencia';
          tx.wmMensajeValidacion = 'Factura en Work Manager presenta reclamo o rechazo.';
        } else if (diff <= tolerance) {
          tx.workManagerStatus = 'validada';
          tx.wmRadicacionStatus = 'radicada';
          tx.wmMensajeValidacion = `Radicada y conciliada (${matchedInv.numeroFactura}).`;
        } else {
          tx.workManagerStatus = 'diferencia_valor';
          tx.wmRadicacionStatus = 'inconsistencia';
          tx.wmMensajeValidacion = `Diferencia vs WM de ${formatClaraMoney(diff, tx.moneda)}.`;
        }
      } else {
        tx.workManagerInvoiceId = undefined;
        tx.workManagerNumeroFactura = undefined;
        tx.workManagerStatus = 'pendiente_factura';
        if (tx.wmRadicacionStatus !== 'no_radicada' && tx.wmRadicacionStatus !== 'inconsistencia') {
          tx.wmRadicacionStatus = tx.facturaNumero ? 'no_radicada' : 'pendiente';
        }
      }
    }

    // Evaluate invoice arithmetic & cuadre status
    const cuadre = evaluateClaraInvoiceCuadre(tx, tolerance);
    tx.facturaCuadreEstado = cuadre.status;
    tx.facturaCuadreNota = cuadre.note;

    // 4. Update accounting readiness if not yet exported/posted
    if (tx.estadoContable !== 'exportado' && tx.estadoContable !== 'contabilizado') {
      const readiness = evaluateTransactionReadiness(tx, vendors);
      tx.estadoContable = readiness.ready ? 'listo_erp' : 'borrador';
    }

    return tx;
  });

  const syncedInvoices = nextInvoices.map((inv) => ({
    ...inv,
    vinculadaClaraTxId: invoiceLinks.get(inv.id),
  }));

  return {
    transactions: nextTransactions,
    workManagerInvoices: syncedInvoices,
  };
};

// ============================================================================
// Missing Vendors Detection (Punto 4: "Debemos de crear varios terceros")
// ============================================================================

export interface MissingVendorCandidate {
  key: string;
  comercio: string;
  nitSugerido: string;
  paisSugerido: string;
  esExterior: boolean;
  erpSugerido: 'SAP' | 'Odoo' | 'Ambos';
  transactionIds: string[];
  totalValor: number;
  moneda: string;
  existingVendor?: ClaraVendor;
  reason: 'sin_registro' | 'falta_codigo_sap' | 'falta_id_odoo';
}

export const detectPendingVendorCandidates = (
  transactions: ClaraTransaction[],
  vendors: ClaraVendor[]
): MissingVendorCandidate[] => {
  const map = new Map<string, MissingVendorCandidate>();

  transactions.forEach((tx) => {
    const existing = findMatchingVendor(tx, vendors);
    const needsSap = tx.erpDestino === 'SAP' && !isVendorReadyForErp(existing, 'SAP');
    const needsOdoo = tx.erpDestino === 'Odoo' && !isVendorReadyForErp(existing, 'Odoo');
    const missingCompletely = !existing;

    if (!missingCompletely && !needsSap && !needsOdoo) return;

    const key = existing
      ? `existing:${existing.id}`
      : `new:${normalizeNitKey(tx.nitComercio) || normalizeTextKey(tx.comercio)}`;

    const reason: MissingVendorCandidate['reason'] = missingCompletely
      ? 'sin_registro'
      : needsSap
      ? 'falta_codigo_sap'
      : 'falta_id_odoo';

    const current = map.get(key);
    if (current) {
      current.transactionIds.push(tx.id);
      current.totalValor += Number(tx.valor) || 0;
      if (!current.nitSugerido && tx.nitComercio) {
        current.nitSugerido = tx.nitComercio;
      }
      if (current.erpSugerido !== tx.erpDestino && tx.erpDestino !== 'Por definir') {
        current.erpSugerido = 'Ambos';
      }
    } else {
      map.set(key, {
        key,
        comercio: existing?.razonSocial || tx.comercio,
        nitSugerido: existing?.nitTaxId || tx.nitComercio || '',
        paisSugerido: existing?.pais || tx.pais || (tx.origenGasto === 'exterior' ? 'Estados Unidos' : 'Colombia'),
        esExterior: existing ? existing.esExterior : tx.origenGasto === 'exterior',
        erpSugerido: tx.erpDestino === 'Por definir' ? 'Ambos' : tx.erpDestino,
        transactionIds: [tx.id],
        totalValor: Number(tx.valor) || 0,
        moneda: tx.moneda || 'COP',
        existingVendor: existing,
        reason,
      });
    }
  });

  return Array.from(map.values());
};

// ============================================================================
// Spreadsheet Parsers (Alternativa de carga Excel / CSV)
// ============================================================================

const normalizeHeaderKey = (key: string): string =>
  String(key || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const pickField = (row: Record<string, unknown>, aliases: string[]): unknown => {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const found = entries.find(([k]) => normalizeHeaderKey(k) === alias);
    if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim() !== '') {
      return found[1];
    }
  }
  for (const alias of aliases) {
    const found = entries.find(([k]) => normalizeHeaderKey(k).includes(alias));
    if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim() !== '') {
      return found[1];
    }
  }
  return '';
};

const parseSpreadsheetNumber = (raw: unknown): number => {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  let str = String(raw || '').trim();
  if (!str) return 0;
  str = str.replace(/[^\d.,-]/g, '');
  if (!str) return 0;
  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');
  if (lastComma > lastDot && str.length - lastComma <= 3) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else {
    str = str.replace(/,/g, '');
  }
  const num = Number(str);
  return Number.isFinite(num) ? Math.abs(num) : 0;
};

const parseSpreadsheetDate = (raw: unknown): string => {
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const str = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const ddmmyyyy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`;
  }
  return new Date().toISOString().slice(0, 10);
};

export const parseClaraSpreadsheetFile = async (
  file: File,
  defaultSociedad = 'PREMEX',
  detectExteriorAuto = true
): Promise<ClaraTransaction[]> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const results: ClaraTransaction[] = [];

  rows.forEach((row, index) => {
    const comercio = String(
      pickField(row, [
        'comercio',
        'establecimiento',
        'proveedor',
        'merchant',
        'nombrecomercio',
        'razonsocial',
      ]) || ''
    ).trim();
    const valor = parseSpreadsheetNumber(
      pickField(row, ['valor', 'monto', 'importe', 'total', 'amount', 'valortotal'])
    );
    if (!comercio && valor <= 0) return;

    const fecha = parseSpreadsheetDate(
      pickField(row, ['fecha', 'fechatransaccion', 'fechagasto', 'date', 'createdat'])
    );
    const centroCosto = String(
      pickField(row, [
        'centrocosto',
        'centrodecosto',
        'centrodecostos',
        'costcenter',
        'cc',
        'departamento',
      ]) || ''
    ).trim();
    const observacion = String(
      pickField(row, [
        'observacion',
        'observaciones',
        'comentario',
        'comentarios',
        'nota',
        'notas',
        'memo',
        'descripcion',
      ]) || ''
    ).trim();
    const tarjetahabiente = String(
      pickField(row, ['tarjetahabiente', 'usuario', 'titular', 'empleado', 'cardholder']) ||
        'Usuario Clara'
    ).trim();
    const sociedad = String(
      pickField(row, ['sociedad', 'empresa', 'compania', 'entidad', 'company']) || defaultSociedad
    ).trim();
    const moneda = String(
      pickField(row, ['moneda', 'divisa', 'currency']) || 'COP'
    )
      .trim()
      .toUpperCase();
    const pais = String(pickField(row, ['pais', 'country']) || 'Colombia').trim();
    const nitComercio = String(
      pickField(row, ['nit', 'taxid', 'ruc', 'identificacion']) || ''
    ).trim();
    const claraTxId = String(
      pickField(row, ['idclara', 'idtransaccion', 'transactionid', 'referencia', 'id']) ||
        `CLR-IMP-${Date.now()}-${index + 1}`
    ).trim();
    const erpRaw = String(pickField(row, ['erp', 'erpdestino', 'sistema']) || '').trim().toUpperCase();
    const erpDestino: ClaraErpTarget =
      erpRaw === 'SAP' ? 'SAP' : erpRaw === 'ODOO' ? 'Odoo' : 'Por definir';

    const exteriorFlag = String(
      pickField(row, ['exterior', 'esexterior', 'origengasto', 'origen']) || ''
    )
      .trim()
      .toLowerCase();

    const autoForeign = detectExteriorAuto
      ? detectIsForeignExpense({ pais, moneda, comercio, sociedad })
      : { isForeign: false };
    const isExterior =
      ['si', 'sí', 'true', '1', 'exterior', 'extranjero', 'internacional'].includes(exteriorFlag) ||
      autoForeign.isForeign;

    results.push({
      id: `clara-imp-${Date.now()}-${index}`,
      claraTxId,
      fecha,
      sociedad,
      tarjetahabiente,
      comercio: comercio || 'Comercio sin nombre',
      nitComercio,
      pais,
      moneda: moneda || 'COP',
      valor,
      centroCosto,
      observacion: observacion || `Gasto Clara en ${comercio}`,
      categoria: String(pickField(row, ['categoria', 'category']) || '').trim(),
      estadoClara: 'Autorizada',
      origenGasto: isExterior ? 'exterior' : 'nacional',
      motivoExterior: isExterior
        ? autoForeign.reason || 'Marcado como gasto del exterior en archivo Clara'
        : undefined,
      workManagerStatus: isExterior ? 'exenta_exterior' : 'pendiente_factura',
      erpDestino,
      estadoContable: 'borrador',
      origenRegistro: 'archivo_clara',
    });
  });

  return results;
};

export const parseWorkManagerSpreadsheetFile = async (
  file: File,
  defaultSociedad = 'PREMEX'
): Promise<ClaraWorkManagerInvoice[]> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const results: ClaraWorkManagerInvoice[] = [];

  rows.forEach((row, index) => {
    const numeroFactura = String(
      pickField(row, [
        'numerofactura',
        'nofactura',
        'factura',
        'documento',
        'folio',
        'prefijonumero',
      ]) || ''
    ).trim();
    const razonSocialEmisor = String(
      pickField(row, ['razonsocial', 'emisor', 'proveedor', 'nombreemisor', 'tercero']) || ''
    ).trim();
    const total = parseSpreadsheetNumber(
      pickField(row, ['total', 'valortotal', 'valor', 'importe', 'monto'])
    );
    if (!numeroFactura && !razonSocialEmisor && total <= 0) return;

    const impuesto = parseSpreadsheetNumber(
      pickField(row, ['impuesto', 'iva', 'tax', 'valoriva'])
    );
    const subtotalRaw = parseSpreadsheetNumber(
      pickField(row, ['subtotal', 'base', 'valorbruto'])
    );
    const subtotal = subtotalRaw > 0 ? subtotalRaw : Math.max(0, total - impuesto);

    results.push({
      id: `wm-imp-${Date.now()}-${index}`,
      numeroFactura: numeroFactura || `WM-${index + 1}`,
      cufe: String(pickField(row, ['cufe', 'uuid', 'cude']) || '').trim(),
      fechaEmision: parseSpreadsheetDate(
        pickField(row, ['fechaemision', 'fecha', 'fechafactura', 'date'])
      ),
      nitEmisor: String(
        pickField(row, ['nitemisor', 'nit', 'ruc', 'taxid', 'identificacion']) || ''
      ).trim(),
      razonSocialEmisor: razonSocialEmisor || 'Emisor WorkManager',
      sociedadReceptora: String(
        pickField(row, ['sociedadreceptora', 'sociedad', 'receptor', 'empresa']) ||
          defaultSociedad
      ).trim(),
      moneda: String(pickField(row, ['moneda', 'currency']) || 'COP')
        .trim()
        .toUpperCase(),
      subtotal,
      impuesto,
      total,
      estadoDian: 'Recibida',
      origenCarga: 'archivo_wm',
    });
  });

  return results;
};

// ============================================================================
// Excel Exports (Plantillas de carga, SAP, Odoo y Terceros)
// ============================================================================

export const downloadClaraImportTemplate = () => {
  const wb = XLSX.utils.book_new();
  const sample = [
    {
      ID_Clara: 'CLR-202611-101',
      Fecha: '2026-11-20',
      Sociedad: 'PREMEX',
      Tarjetahabiente: 'Carlos Mendoza',
      Comercio: 'RESTAURANTE LA RESERVA',
      NIT: '900123456-7',
      Pais: 'Colombia',
      Moneda: 'COP',
      Valor: 285000,
      Centro_Costo: 'CC-COM-01 Ventas',
      Observacion: 'Almuerzo reunión cliente zona norte',
      Origen: 'Nacional',
      ERP_Destino: 'SAP',
    },
    {
      ID_Clara: 'CLR-202611-102',
      Fecha: '2026-11-21',
      Sociedad: 'NUTREO',
      Tarjetahabiente: 'Sofía Castro',
      Comercio: 'OPENAI *CHATGPT SUBSCR',
      NIT: '',
      Pais: 'Estados Unidos',
      Moneda: 'USD',
      Valor: 60,
      Centro_Costo: 'CC-MKT-03 Mercadeo',
      Observacion: 'Licencia herramientas IA equipo mercadeo',
      Origen: 'Exterior',
      ERP_Destino: 'Odoo',
    },
  ];
  const ws = XLSX.utils.json_to_sheet(sample);
  XLSX.utils.book_append_sheet(wb, ws, 'Gastos_Clara');
  XLSX.writeFile(wb, 'Plantilla_Carga_Clara_Premex.xlsx');
};

export const downloadWorkManagerImportTemplate = () => {
  const wb = XLSX.utils.book_new();
  const sample = [
    {
      Numero_Factura: 'FE-10452',
      Fecha_Emision: '2026-11-20',
      NIT_Emisor: '900123456-7',
      Razon_Social: 'RESTAURANTE LA RESERVA S.A.S.',
      Sociedad_Receptora: 'PREMEX',
      Moneda: 'COP',
      Subtotal: 263889,
      Impuesto: 21111,
      Total: 285000,
      CUFE: 'demo-cufe-workmanager-001',
    },
  ];
  const ws = XLSX.utils.json_to_sheet(sample);
  XLSX.utils.book_append_sheet(wb, ws, 'Facturas_WorkManager');
  XLSX.writeFile(wb, 'Plantilla_Carga_WorkManager_Premex.xlsx');
};

export const formatDateDdMmYyyy = (rawDate?: string): string => {
  const s = String(rawDate || '').trim();
  if (!s) {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  }
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`;
  }
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) {
    return `${dmy[1].padStart(2, '0')}/${dmy[2].padStart(2, '0')}/${dmy[3]}`;
  }
  return s;
};

export const sanitizeNitSinGuion = (rawNit?: string): string => {
  return String(rawNit || '')
    .trim()
    .replace(/[-\s.]/g, '')
    .toUpperCase();
};

export const resolveSapSociedadCode = (
  tx: ClaraTransaction,
  rule?: ClaraCostCenterRule,
  connectorConfig?: ClaraConnectorConfig
): string => {
  if (tx.sapSociedad?.trim()) return tx.sapSociedad.trim().toUpperCase();
  if (rule?.sociedadSap?.trim()) return rule.sociedadSap.trim().toUpperCase();
  const socKey = normalizeTextKey(tx.sociedad);
  if (socKey.includes('ADIQUIM')) return 'CO20';
  if (socKey.includes('NUTREO')) return 'CO60';
  if (socKey.includes('PREMEX CORP')) return 'CO90';
  if (socKey.includes('PREMEX')) return 'CO10';
  return (connectorConfig?.sapSociedadDefault || 'CO10').trim().toUpperCase();
};

export interface SapBotExcelRow {
  Sociedad: string;
  Fondo: string;
  'Operación contable': string;
  Importe: number;
  Indicador: string;
  'Fecha Doc': string;
  'Fecha contable': string;
  'NIT/Asignacion': string;
  Referencia: string;
  'Detalle/TXT': string;
  'Centro de costos': string;
  'Clase factura': string;
}

export const buildSapBotExcelRows = (params: {
  transactions: ClaraTransaction[];
  vendors: ClaraVendor[];
  rules: ClaraCostCenterRule[];
  connectorConfig?: ClaraConnectorConfig;
}): SapBotExcelRow[] => {
  const { transactions, vendors, rules, connectorConfig } = params;

  return transactions.map((tx) => {
    const vendor = findMatchingVendor(tx, vendors);
    const rule = rules.find(
      (r) =>
        normalizeTextKey(r.sociedad) === normalizeTextKey(tx.sociedad) &&
        (normalizeTextKey(r.centroCostoClara) === normalizeTextKey(tx.centroCosto) ||
          normalizeTextKey(tx.centroCosto).includes(normalizeTextKey(r.centroCostoClara)))
    );

    const sociedad = resolveSapSociedadCode(tx, rule, connectorConfig);
    const fondo = (
      tx.sapFondo ||
      rule?.fondoDefault ||
      connectorConfig?.sapFondoDefault ||
      'INTR'
    )
      .trim()
      .toUpperCase();
    const operacion = (
      tx.sapOperacionContable ||
      rule?.operacionContableDefault ||
      connectorConfig?.sapOperacionContableDefault ||
      'GASTOS TC'
    )
      .trim()
      .toUpperCase();

    const rawTotal = Number(tx.facturaTotal || tx.valor || 0);
    const moneda = String(tx.facturaMoneda || tx.moneda || 'COP').toUpperCase();
    const importe =
      moneda === 'COP'
        ? Math.round(rawTotal)
        : Math.round(rawTotal * 100) / 100;

    const indicador = (
      tx.indicadorImpuesto?.trim().split(/\s+/)[0] ||
      (tx.origenGasto === 'exterior' ? 'S0' : 'V19')
    ).toUpperCase();

    const fechaDoc = formatDateDdMmYyyy(tx.facturaFecha || tx.fecha);
    const fechaContable = formatDateDdMmYyyy(
      tx.sapFechaContable ||
        connectorConfig?.sapFechaContableDefault ||
        tx.facturaFecha ||
        tx.fecha
    );

    const nitAsignacion = sanitizeNitSinGuion(
      vendor?.nitTaxId || tx.facturaNit || tx.nitComercio || ''
    );

    const referencia = String(
      tx.facturaNumero ||
        tx.wmRadicacionNumero ||
        tx.workManagerNumeroFactura ||
        tx.claraTxId ||
        tx.id
    ).trim();

    const rawDesc = String(tx.observacion || tx.categoria || tx.comercio || '')
      .replace(/[\r\n\t]+/g, ' ')
      .trim()
      .toUpperCase();
    const detalleTxt = rawDesc.startsWith(`${referencia.toUpperCase()}-`)
      ? rawDesc
      : rawDesc
      ? `${referencia}-${rawDesc}`
      : referencia;

    const centroCostos = String(
      tx.sapCentroCosto || rule?.codigoCentroCostoErp || tx.centroCosto || ''
    )
      .trim()
      .toUpperCase();

    const claseFactura = String(
      tx.sapClaseFactura ||
        connectorConfig?.sapClaseFacturaDefault ||
        (tx.origenGasto === 'exterior' ? 'Documento Soporte' : 'Factura Electrónica')
    ).trim();

    return {
      Sociedad: sociedad,
      Fondo: fondo,
      'Operación contable': operacion,
      Importe: importe,
      Indicador: indicador,
      'Fecha Doc': fechaDoc,
      'Fecha contable': fechaContable,
      'NIT/Asignacion': nitAsignacion,
      Referencia: referencia,
      'Detalle/TXT': detalleTxt,
      'Centro de costos': centroCostos,
      'Clase factura': claseFactura,
    };
  });
};

export const exportSapBotExcel = (params: {
  transactions: ClaraTransaction[];
  vendors: ClaraVendor[];
  rules: ClaraCostCenterRule[];
  connectorConfig?: ClaraConnectorConfig;
  userName: string;
}): ClaraBatchExportLog => {
  const { transactions, vendors, rules, connectorConfig, userName } = params;
  const wb = XLSX.utils.book_new();
  const dateTag = new Date().toISOString().slice(0, 10);
  const rows = buildSapBotExcelRows({ transactions, vendors, rules, connectorConfig });

  const headers: (keyof SapBotExcelRow)[] = [
    'Sociedad',
    'Fondo',
    'Operación contable',
    'Importe',
    'Indicador',
    'Fecha Doc',
    'Fecha contable',
    'NIT/Asignacion',
    'Referencia',
    'Detalle/TXT',
    'Centro de costos',
    'Clase factura',
  ];

  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });

  // Preservar ceros iniciales y referencias largas como texto (@) evitando notación científica
  const textColIndexes = [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11];
  for (let r = 1; r <= rows.length; r += 1) {
    textColIndexes.forEach((c) => {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell) {
        cell.t = 's';
        cell.v = String(cell.v ?? '');
        cell.z = '@';
      }
    });
    const amountAddr = XLSX.utils.encode_cell({ r, c: 3 });
    if (ws[amountAddr]) {
      ws[amountAddr].t = 'n';
    }
  }

  ws['!cols'] = [
    { wch: 10 }, // Sociedad
    { wch: 9 },  // Fondo
    { wch: 20 }, // Operación contable
    { wch: 14 }, // Importe
    { wch: 10 }, // Indicador
    { wch: 13 }, // Fecha Doc
    { wch: 15 }, // Fecha contable
    { wch: 16 }, // NIT/Asignacion
    { wch: 20 }, // Referencia
    { wch: 44 }, // Detalle/TXT
    { wch: 16 }, // Centro de costos
    { wch: 20 }, // Clase factura
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Bot_SAP_Contabilizacion');
  const fileName = `Archivo_Bot_SAP_Clara_${dateTag}.xlsx`;
  XLSX.writeFile(wb, fileName);

  return {
    id: `batch-sap-${Date.now()}`,
    createdAtIso: new Date().toISOString(),
    createdBy: userName,
    erp: 'SAP',
    tipo: 'sap_bot',
    cantidadRegistros: transactions.length,
    totalMonto: transactions.reduce((s, t) => s + (Number(t.facturaTotal || t.valor) || 0), 0),
    moneda: transactions[0]?.moneda || 'COP',
    archivoNombre: fileName,
  };
};

export const exportAccountingBatchExcel = (params: {
  erp: 'SAP' | 'Odoo';
  transactions: ClaraTransaction[];
  vendors: ClaraVendor[];
  rules: ClaraCostCenterRule[];
  connectorConfig?: ClaraConnectorConfig;
  userName: string;
}): ClaraBatchExportLog => {
  const { erp, transactions, vendors, rules, connectorConfig, userName } = params;

  if (erp === 'SAP') {
    return exportSapBotExcel({
      transactions,
      vendors,
      rules,
      connectorConfig,
      userName,
    });
  }

  const wb = XLSX.utils.book_new();
  const dateTag = new Date().toISOString().slice(0, 10);

  // Odoo format
  const rows = transactions.map((tx) => {
    const vendor = findMatchingVendor(tx, vendors);
    const rule = rules.find(
      (r) =>
        normalizeTextKey(r.sociedad) === normalizeTextKey(tx.sociedad) &&
        normalizeTextKey(r.centroCostoClara) === normalizeTextKey(tx.centroCosto)
    );
    return {
      Empresa_Sociedad: tx.sociedad,
      Diario: rule?.diarioOdoo || 'Tarjeta Corporativa Clara',
      Fecha_Factura: tx.fecha,
      Referencia_Externa: tx.workManagerNumeroFactura || tx.claraTxId || tx.id,
      Partner_Odoo_ID: vendor?.partnerIdOdoo || 'PENDIENTE',
      Partner_Nombre: vendor?.razonSocial || tx.comercio,
      NIT_Tax_ID: vendor?.nitTaxId || tx.nitComercio || '',
      Origen_Gasto: tx.origenGasto === 'exterior' ? 'Exterior (Sin WM)' : 'Nacional (WorkManager OK)',
      Cuenta_Contable: tx.cuentaContable || rule?.cuentaContableDefault || '',
      Cuenta_Analitica_CC: rule?.cuentaAnaliticaOdoo || rule?.codigoCentroCostoErp || tx.centroCosto,
      Descripcion_Observacion: tx.observacion,
      Moneda: tx.moneda,
      Total: tx.valor,
      Impuesto: tx.indicadorImpuesto || (tx.origenGasto === 'exterior' ? 'EX0' : 'IVA 19%'),
      Responsable: tx.tarjetahabiente,
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Odoo_Account_Move');
  const fileName = `Lote_Contable_Odoo_Clara_${dateTag}.xlsx`;
  XLSX.writeFile(wb, fileName);

  return {
    id: `batch-odoo-${Date.now()}`,
    createdAtIso: new Date().toISOString(),
    createdBy: userName,
    erp: 'Odoo',
    tipo: 'gastos',
    cantidadRegistros: transactions.length,
    totalMonto: transactions.reduce((s, t) => s + (Number(t.valor) || 0), 0),
    moneda: transactions[0]?.moneda || 'COP',
    archivoNombre: fileName,
  };
};

export const exportPendingVendorsExcel = (
  vendors: ClaraVendor[],
  erp: 'SAP' | 'Odoo',
  userName: string
): ClaraBatchExportLog => {
  const wb = XLSX.utils.book_new();
  const dateTag = new Date().toISOString().slice(0, 10);

  const rows =
    erp === 'SAP'
      ? vendors.map((v) => ({
          Accion: 'CREAR_TERCERO_XK01_BP',
          NIT_Tax_ID: v.nitTaxId,
          Razon_Social: v.razonSocial,
          Grupo_Cuentas: v.esExterior ? 'EXTE' : 'PROV',
          Pais: v.pais,
          Tipo_Persona: v.tipoPersona,
          Regimen_Fiscal: v.regimenFiscal,
          Cuenta_Gasto_Sugerida: v.cuentaGastoDefault || '',
          Codigo_SAP_Actual: v.codigoTerceroSap || '',
          Alias_Clara: v.aliasComerciosClara.join(' | '),
          Notas: v.notas || '',
        }))
      : vendors.map((v) => ({
          name: v.razonSocial,
          vat: v.nitTaxId,
          company_type: v.tipoPersona === 'Natural' ? 'person' : 'company',
          country_id: v.pais,
          supplier_rank: 1,
          property_account_expense_id: v.cuentaGastoDefault || '',
          ref_clara: v.aliasComerciosClara.join(' | '),
          odoo_partner_id_actual: v.partnerIdOdoo || '',
          comment: v.notas || '',
        }));

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, erp === 'SAP' ? 'Terceros_SAP' : 'Res_Partner_Odoo');
  const fileName = `Creacion_Terceros_${erp}_${dateTag}.xlsx`;
  XLSX.writeFile(wb, fileName);

  return {
    id: `batch-vnd-${erp.toLowerCase()}-${Date.now()}`,
    createdAtIso: new Date().toISOString(),
    createdBy: userName,
    erp,
    tipo: 'terceros',
    cantidadRegistros: vendors.length,
    totalMonto: 0,
    moneda: 'N/A',
    archivoNombre: fileName,
  };
};

export const filterClaraTransactionsByPermissions = (
  transactions: ClaraTransaction[],
  perms: EffectivePermissions
): ClaraTransaction[] => {
  if (perms.isAdmin || perms.getModuleCompanyScope('clara') === 'all') {
    return transactions;
  }
  return transactions.filter((tx) => perms.isCompanyAllowed(tx.sociedad, 'clara'));
};

export const vendorStatusLabel = (status: ClaraVendorSyncStatus): string => {
  switch (status) {
    case 'sincronizado_ambos':
      return 'SAP y Odoo OK';
    case 'creado_sap':
      return 'Creado en SAP';
    case 'creado_odoo':
      return 'Creado en Odoo';
    default:
      return 'Pendiente crear';
  }
};

export const wmStatusLabel = (status: ClaraWorkManagerStatus): string => {
  switch (status) {
    case 'validada':
      return 'Validada en WorkManager';
    case 'exenta_exterior':
      return 'Exenta (Exterior)';
    case 'diferencia_valor':
      return 'Diferencia de valor';
    default:
      return 'Pendiente factura WM';
  }
};

export const evaluateClaraInvoiceCuadre = (
  tx: Pick<
    ClaraTransaction,
    'valor' | 'moneda' | 'facturaTotal' | 'facturaSubtotal' | 'facturaImpuesto' | 'facturaNumero'
  >,
  tolerance = 5
): {
  status: NonNullable<ClaraTransaction['facturaCuadreEstado']>;
  note: string;
} => {
  if (!tx.facturaNumero && !(tx.facturaTotal && tx.facturaTotal > 0)) {
    return {
      status: 'sin_soporte',
      note: 'Sin factura adjunta escaneada aún.',
    };
  }

  const sub = Number(tx.facturaSubtotal || 0);
  const tax = Number(tx.facturaImpuesto || 0);
  const totalInv = Number(tx.facturaTotal || 0);
  const claraVal = Number(tx.valor || 0);
  const tol = Math.max(1, tolerance);

  if (totalInv > 0 && sub > 0 && Math.abs(sub + tax - totalInv) > tol) {
    return {
      status: 'error_aritmetico',
      note: `Subtotal (${sub}) + Impuesto (${tax}) no suma Total factura (${totalInv}).`,
    };
  }

  if (totalInv > 0 && Math.abs(claraVal - totalInv) > Math.max(tol, claraVal * 0.02)) {
    return {
      status: 'diferencia_monto',
      note: `Diferencia Clara (${formatClaraMoney(claraVal, tx.moneda)}) vs Factura (${formatClaraMoney(totalInv, tx.moneda)}).`,
    };
  }

  return {
    status: 'cuadra_ok',
    note: 'Cuadre aritmético y monto Clara validados.',
  };
};

export const applyExtractedInvoiceToTransaction = (
  tx: ClaraTransaction,
  extracted: ClaraExtractedInvoiceData,
  fileName: string,
  tolerance = 5
): ClaraTransaction => {
  const next: ClaraTransaction = {
    ...tx,
    facturaNumero: extracted.numeroFactura || tx.facturaNumero,
    facturaSerie: extracted.serieDoc || tx.facturaSerie,
    facturaCufe: extracted.cufe || tx.facturaCufe,
    facturaFecha: extracted.fechaFactura || tx.facturaFecha,
    facturaNit: extracted.nitEmisor || tx.facturaNit,
    facturaProveedor: extracted.razonSocialEmisor || tx.facturaProveedor,
    facturaMoneda: extracted.moneda || tx.facturaMoneda,
    facturaSubtotal: extracted.subtotal,
    facturaImpuesto: extracted.impuesto,
    facturaPorcentajeImpuesto: extracted.porcentajeImpuesto,
    facturaTotal: extracted.total,
    facturaConfianzaIa: extracted.confianza,
    facturaArchivoNombre: fileName,
    nitComercio: tx.nitComercio || extracted.nitEmisor,
    cuentaContable: tx.cuentaContable || extracted.cuentaMayorSugerida || undefined,
    indicadorImpuesto: tx.indicadorImpuesto || extracted.indicadorImpuestoSap || undefined,
    workManagerNumeroFactura: tx.workManagerNumeroFactura || extracted.numeroFactura || undefined,
    observacion: tx.observacion?.trim()
      ? tx.observacion
      : extracted.descripcionSugerida || tx.observacion,
  };
  const cuadre = evaluateClaraInvoiceCuadre(next, tolerance);
  next.facturaCuadreEstado = cuadre.status;
  next.facturaCuadreNota = cuadre.note;
  return next;
};

export const findBestTxForExtractedInvoice = (
  extracted: ClaraExtractedInvoiceData,
  fileName: string,
  transactions: ClaraTransaction[],
  tolerance = 5
): ClaraTransaction | undefined => {
  const upperFile = fileName.toUpperCase();
  const byTxIdInFile = transactions.find(
    (t) => t.claraTxId && upperFile.includes(t.claraTxId.toUpperCase())
  );
  if (byTxIdInFile) return byTxIdInFile;

  const invNum = String(extracted.numeroFactura || '').trim().toUpperCase();
  if (invNum) {
    const byObsOrWm = transactions.find(
      (t) =>
        String(t.workManagerNumeroFactura || '').toUpperCase() === invNum ||
        String(t.observacion || '').toUpperCase().includes(invNum)
    );
    if (byObsOrWm) return byObsOrWm;
  }

  const invNit = normalizeNitKey(extracted.nitEmisor);
  const invVendor = normalizeTextKey(extracted.razonSocialEmisor);
  const invTotal = Number(extracted.total || 0);

  return transactions.find((t) => {
    if (t.facturaNumero) return false;
    const txNit = normalizeNitKey(t.nitComercio || t.terceroNit);
    const txMerchant = normalizeTextKey(t.comercio);
    const sameParty =
      (invNit && txNit && invNit === txNit) ||
      (invVendor && txMerchant && (invVendor.includes(txMerchant) || txMerchant.includes(invVendor)));
    const amountClose = invTotal > 0 && Math.abs(t.valor - invTotal) <= Math.max(tolerance, t.valor * 0.03);
    return (sameParty && amountClose) || (amountClose && !t.facturaArchivoNombre);
  });
};

export interface SapBotDispatchItem {
  txId: string;
  claraTxId: string;
  sociedadSap: string;
  fondo: string;
  operacionContable: string;
  claseDoc: string;
  claseFactura: string;
  fechaClara: string;
  fechaFactura: string;
  fechaDocDdMmYyyy: string;
  fechaContableDdMmYyyy: string;
  numeroFactura: string;
  cufe: string;
  codigoAcreedorSap: string;
  nitTercero: string;
  nitAsignacionSinGuion: string;
  nombreTercero: string;
  cuentaMayor: string;
  centroCostoSap: string;
  moneda: string;
  subtotal: number;
  impuesto: number;
  total: number;
  indicadorImpuesto: string;
  textoPosicion: string;
  detalleTxt: string;
  tarjetahabiente: string;
  estadoWorkManager: string;
}

export interface SapBotDispatchPackage {
  schemaVersion: 'premex-sap-bot-v1';
  batchId: string;
  generatedAtIso: string;
  generatedBy: string;
  itemsCount: number;
  items: SapBotDispatchItem[];
}

export const buildSapBotDispatchPackage = (params: {
  transactions: ClaraTransaction[];
  vendors: ClaraVendor[];
  rules: ClaraCostCenterRule[];
  connectorConfig: ClaraConnectorConfig;
  userName: string;
}): SapBotDispatchPackage => {
  const { transactions, vendors, rules, connectorConfig, userName } = params;
  const items: SapBotDispatchItem[] = transactions.map((tx) => {
    const vendor = findMatchingVendor(tx, vendors);
    const rule = rules.find(
      (r) =>
        r.activa &&
        normalizeTextKey(r.sociedad) === normalizeTextKey(tx.sociedad) &&
        (normalizeTextKey(r.centroCostoClara) === normalizeTextKey(tx.centroCosto) ||
          normalizeTextKey(tx.centroCosto).includes(normalizeTextKey(r.centroCostoClara)))
    );

    const total = Number(tx.facturaTotal || tx.valor || 0);
    const impuesto = Number(tx.facturaImpuesto || 0);
    const subtotal =
      tx.facturaSubtotal !== undefined
        ? Number(tx.facturaSubtotal)
        : Math.max(0, Math.round((total - impuesto) * 100) / 100);

    const numeroFactura = String(
      tx.facturaNumero ||
        tx.wmRadicacionNumero ||
        tx.workManagerNumeroFactura ||
        tx.claraTxId ||
        tx.id
    ).trim();
    const rawNit = vendor?.nitTaxId || tx.facturaNit || tx.nitComercio || '';
    const rawObs = String(tx.observacion || tx.categoria || tx.comercio || '')
      .replace(/[\r\n\t]+/g, ' ')
      .trim()
      .toUpperCase();
    const detalleTxt = rawObs.startsWith(`${numeroFactura.toUpperCase()}-`)
      ? rawObs
      : rawObs
      ? `${numeroFactura}-${rawObs}`
      : numeroFactura;

    const fechaDocIso = tx.facturaFecha || tx.fecha;
    const fechaContIso =
      tx.sapFechaContable || connectorConfig.sapFechaContableDefault || fechaDocIso;

    return {
      txId: tx.id,
      claraTxId: tx.claraTxId || tx.id,
      sociedadSap: resolveSapSociedadCode(tx, rule, connectorConfig),
      fondo: (tx.sapFondo || rule?.fondoDefault || connectorConfig.sapFondoDefault || 'INTR')
        .trim()
        .toUpperCase(),
      operacionContable: (
        tx.sapOperacionContable ||
        rule?.operacionContableDefault ||
        connectorConfig.sapOperacionContableDefault ||
        'GASTOS TC'
      )
        .trim()
        .toUpperCase(),
      claseDoc: tx.sapClaseDoc || connectorConfig.sapClaseDocDefault || 'KR',
      claseFactura: String(
        tx.sapClaseFactura ||
          connectorConfig.sapClaseFacturaDefault ||
          (tx.origenGasto === 'exterior' ? 'Documento Soporte' : 'Factura Electrónica')
      ).trim(),
      fechaClara: tx.fecha,
      fechaFactura: fechaDocIso,
      fechaDocDdMmYyyy: formatDateDdMmYyyy(fechaDocIso),
      fechaContableDdMmYyyy: formatDateDdMmYyyy(fechaContIso),
      numeroFactura,
      cufe: tx.facturaCufe || '',
      codigoAcreedorSap: vendor?.codigoTerceroSap || '',
      nitTercero: rawNit,
      nitAsignacionSinGuion: sanitizeNitSinGuion(rawNit),
      nombreTercero: vendor?.razonSocial || tx.facturaProveedor || tx.comercio,
      cuentaMayor: tx.cuentaContable || rule?.cuentaContableDefault || vendor?.cuentaGastoDefault || '',
      centroCostoSap: String(
        tx.sapCentroCosto || rule?.codigoCentroCostoErp || tx.centroCosto || ''
      )
        .trim()
        .toUpperCase(),
      moneda: tx.facturaMoneda || tx.moneda || 'COP',
      subtotal,
      impuesto,
      total,
      indicadorImpuesto:
        tx.indicadorImpuesto?.trim().split(/\s+/)[0] || (tx.origenGasto === 'exterior' ? 'S0' : 'V19'),
      textoPosicion: `${tx.tarjetahabiente}: ${tx.observacion}`.trim().slice(0, 50),
      detalleTxt,
      tarjetahabiente: tx.tarjetahabiente,
      estadoWorkManager: tx.wmRadicacionStatus || tx.workManagerStatus,
    };
  });

  return {
    schemaVersion: 'premex-sap-bot-v1',
    batchId: `SAP-BOT-${Date.now()}`,
    generatedAtIso: new Date().toISOString(),
    generatedBy: userName,
    itemsCount: items.length,
    items,
  };
};

export const downloadSapBotPackageJson = (pkg: SapBotDispatchPackage): string => {
  const fileName = `paquete_sap_bot_${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(pkg, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return fileName;
};

export const downloadSapBotPackageTxt = (pkg: SapBotDispatchPackage): string => {
  const fileName = `plano_sap_bot_${new Date().toISOString().slice(0, 10)}.txt`;
  const header = [
    'Sociedad',
    'Fondo',
    'Operación contable',
    'Importe',
    'Indicador',
    'Fecha Doc',
    'Fecha contable',
    'NIT/Asignacion',
    'Referencia',
    'Detalle/TXT',
    'Centro de costos',
    'Clase factura',
  ].join('\t');

  const lines = pkg.items.map((i) =>
    [
      i.sociedadSap,
      i.fondo,
      i.operacionContable,
      i.moneda === 'COP' ? Math.round(i.total) : i.total,
      i.indicadorImpuesto,
      i.fechaDocDdMmYyyy,
      i.fechaContableDdMmYyyy,
      i.nitAsignacionSinGuion,
      i.numeroFactura,
      i.detalleTxt.replace(/\t/g, ' '),
      i.centroCostoSap,
      i.claseFactura,
    ].join('\t')
  );

  const blob = new Blob([[header, ...lines].join('\n')], {
    type: 'text/plain;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return fileName;
};

// ============================================================================
// Python RPA Exchange Helpers (JSON Import / Export for Python Scripts)
// ============================================================================

export interface PythonWmCheckResultItem {
  txId?: string;
  numeroFactura?: string;
  estado: ClaraWorkManagerRadicacionStatus;
  radicacionFecha?: string;
  mensaje?: string;
}

export interface ParsedClaraPythonPayload {
  transactions: ClaraTransaction[];
  wmResults: PythonWmCheckResultItem[];
}

function normalizePythonWmEstado(raw: unknown): ClaraWorkManagerRadicacionStatus {
  const s = normalizeTextKey(String(raw || ''));
  if (s.includes('inconsist') || s.includes('rechaz') || s.includes('reclamo') || s.includes('diferenc')) {
    return 'inconsistencia';
  }
  if (s.includes('exenta') || s.includes('exterior')) {
    return 'exenta_exterior';
  }
  if (s.includes('no radicad') || s.includes('no_radicad') || s.includes('no encontrad')) {
    return 'no_radicada';
  }
  if (s.includes('radicad') || s.includes('validad') || s.includes('aprobad')) {
    return 'radicada';
  }
  return 'pendiente';
}

function mapRawTableRowToClaraTx(
  cols: string[],
  index: number,
  defaultSociedad: string,
  detectExteriorAuto: boolean
): ClaraTransaction | null {
  const cleaned = cols.map((c) => String(c || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (cleaned.length < 2) return null;

  let fecha = new Date().toISOString().slice(0, 10);
  let valor = 0;
  let moneda = 'COP';
  const textCols: string[] = [];

  for (const cell of cleaned) {
    const iso = cell.match(/\b(\d{4})[-/](\d{2})[-/](\d{2})\b/);
    const dmy = cell.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/);
    if (iso) {
      fecha = `${iso[1]}-${iso[2]}-${iso[3]}`;
      continue;
    }
    if (dmy) {
      fecha = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
      continue;
    }

    const currMatch = cell.match(/\b(COP|USD|GTQ|MXN|EUR)\b/i);
    const hasMoneyDigits = /[$€£]|\b(COP|USD|GTQ|MXN|EUR)\b/i.test(cell) || /^\d[\d.,]+$/.test(cell);
    if (hasMoneyDigits && /\d/.test(cell)) {
      const parsedVal = parseSpreadsheetNumber(cell);
      if (parsedVal > 0 && valor === 0) {
        valor = parsedVal;
        if (currMatch) moneda = currMatch[1].toUpperCase();
        continue;
      }
    }
    textCols.push(cell);
  }

  const comercio = textCols[0] || cleaned[0] || `Movimiento Clara #${index + 1}`;
  if (!comercio && valor <= 0) return null;

  const tarjetahabiente = textCols[1] || 'Usuario Clara';
  const centroCosto = textCols[2] || '';
  const observacion = textCols.slice(3).join(' · ') || `Extraído Python en ${comercio}`;
  const autoForeign = detectExteriorAuto
    ? detectIsForeignExpense({ moneda, comercio, sociedad: defaultSociedad })
    : { isForeign: false };

  return {
    id: `clara-py-${Date.now()}-${index}`,
    claraTxId: `PY-DOM-${Date.now().toString().slice(-4)}-${index + 1}`,
    fecha,
    sociedad: defaultSociedad,
    tarjetahabiente,
    comercio,
    nitComercio: '',
    pais: autoForeign.isForeign ? 'Exterior' : 'Colombia',
    moneda,
    valor,
    centroCosto,
    observacion,
    estadoClara: 'Autorizada',
    origenGasto: autoForeign.isForeign ? 'exterior' : 'nacional',
    motivoExterior: autoForeign.reason,
    workManagerStatus: autoForeign.isForeign ? 'exenta_exterior' : 'pendiente_factura',
    wmRadicacionStatus: autoForeign.isForeign ? 'exenta_exterior' : 'pendiente',
    erpDestino: 'SAP',
    estadoContable: 'borrador',
    origenRegistro: 'api_clara',
  };
}

export const parseClaraPythonPayload = (
  rawInput: unknown,
  options?: { defaultSociedad?: string; detectExteriorAuto?: boolean }
): ParsedClaraPythonPayload => {
  const defaultSociedad = options?.defaultSociedad || 'PREMEX';
  const detectExteriorAuto = options?.detectExteriorAuto ?? true;

  const root: Record<string, unknown> = Array.isArray(rawInput)
    ? { transactions: rawInput }
    : rawInput && typeof rawInput === 'object'
    ? (rawInput as Record<string, unknown>)
    : {};

  const rawTxs = Array.isArray(root.transactions)
    ? root.transactions
    : Array.isArray(root.items)
    ? root.items
    : [];
  const rawRows = Array.isArray(root.rows) ? root.rows : [];
  const rawResults = Array.isArray(root.results)
    ? root.results
    : Array.isArray(root.wmResults)
    ? root.wmResults
    : [];

  const transactions: ClaraTransaction[] = [];

  rawTxs.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const obj = entry as Record<string, unknown>;
    const comercio = String(
      obj.comercio ?? obj.merchant ?? obj.merchantName ?? obj.proveedor ?? ''
    ).trim();
    const valor = parseSpreadsheetNumber(obj.valor ?? obj.amount ?? obj.total ?? obj.importe ?? 0);
    if (!comercio && valor <= 0) return;

    const fecha = parseSpreadsheetDate(obj.fecha ?? obj.date ?? obj.createdAt ?? obj.fechaFactura);
    const moneda = String(obj.moneda ?? obj.currency ?? 'COP').trim().toUpperCase() || 'COP';
    const sociedad = String(obj.sociedad ?? obj.company ?? obj.legalEntity ?? defaultSociedad).trim();
    const pais = String(obj.pais ?? obj.country ?? 'Colombia').trim();
    const autoForeign = detectExteriorAuto
      ? detectIsForeignExpense({ pais, moneda, comercio, sociedad })
      : { isForeign: false };
    const isExterior =
      obj.origenGasto === 'exterior' ||
      Boolean(obj.esExterior) ||
      autoForeign.isForeign;

    const facturaNumero = String(obj.facturaNumero ?? obj.numeroFactura ?? obj.invoiceNumber ?? '').trim();
    const wmRaw = obj.wmRadicacionStatus ?? obj.estadoWm ?? obj.estado;
    const wmStatus: ClaraWorkManagerRadicacionStatus = isExterior
      ? 'exenta_exterior'
      : wmRaw
      ? normalizePythonWmEstado(wmRaw)
      : facturaNumero
      ? 'no_radicada'
      : 'pendiente';

    transactions.push({
      id: `clara-py-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 5)}`,
      claraTxId: String(obj.claraTxId ?? obj.id ?? `PY-${Date.now().toString().slice(-4)}-${index + 1}`).trim(),
      fecha,
      sociedad: sociedad || defaultSociedad,
      tarjetahabiente: String(
        obj.tarjetahabiente ?? obj.cardholder ?? obj.usuario ?? obj.titular ?? 'Usuario Clara'
      ).trim(),
      comercio: comercio || 'Comercio Clara',
      nitComercio: String(obj.nitComercio ?? obj.nit ?? obj.taxId ?? '').trim(),
      pais: isExterior && pais === 'Colombia' ? 'Exterior' : pais,
      moneda,
      valor,
      centroCosto: String(obj.centroCosto ?? obj.costCenter ?? '').trim(),
      observacion: String(
        obj.observacion ?? obj.description ?? obj.memo ?? `Gasto Clara en ${comercio}`
      ).trim(),
      categoria: String(obj.categoria ?? obj.category ?? '').trim(),
      estadoClara: 'Autorizada',
      origenGasto: isExterior ? 'exterior' : 'nacional',
      motivoExterior: isExterior ? autoForeign.reason || 'Detectado como exterior en Python' : undefined,
      workManagerStatus:
        wmStatus === 'exenta_exterior'
          ? 'exenta_exterior'
          : wmStatus === 'radicada'
          ? 'validada'
          : wmStatus === 'inconsistencia'
          ? 'diferencia_valor'
          : 'pendiente_factura',
      wmRadicacionStatus: wmStatus,
      wmRadicacionNumero: String(obj.wmRadicacionNumero ?? facturaNumero).trim() || undefined,
      wmRadicacionFecha: String(obj.wmRadicacionFecha ?? obj.radicacionFecha ?? '').trim() || undefined,
      wmMensajeValidacion: String(obj.wmMensajeValidacion ?? obj.mensaje ?? '').trim() || undefined,
      facturaNumero: facturaNumero || undefined,
      facturaFecha: obj.facturaFecha ? parseSpreadsheetDate(obj.facturaFecha) : undefined,
      facturaNit: String(obj.facturaNit ?? '').trim() || undefined,
      facturaTotal:
        obj.facturaTotal !== undefined ? parseSpreadsheetNumber(obj.facturaTotal) : undefined,
      facturaSubtotal:
        obj.facturaSubtotal !== undefined ? parseSpreadsheetNumber(obj.facturaSubtotal) : undefined,
      facturaImpuesto:
        obj.facturaImpuesto !== undefined ? parseSpreadsheetNumber(obj.facturaImpuesto) : undefined,
      facturaCufe: String(obj.facturaCufe ?? obj.cufe ?? '').trim() || undefined,
      erpDestino: 'SAP',
      estadoContable: 'borrador',
      origenRegistro: 'api_clara',
    });
  });

  if (transactions.length === 0 && rawRows.length > 0) {
    rawRows.forEach((row, index) => {
      if (!Array.isArray(row)) return;
      const mapped = mapRawTableRowToClaraTx(
        row.map((c) => String(c ?? '')),
        index,
        defaultSociedad,
        detectExteriorAuto
      );
      if (mapped) transactions.push(mapped);
    });
  }

  const wmResults: PythonWmCheckResultItem[] = [];
  rawResults.forEach((r) => {
    if (!r || typeof r !== 'object') return;
    const item = r as Record<string, unknown>;
    wmResults.push({
      txId: item.txId ? String(item.txId) : undefined,
      numeroFactura: item.numeroFactura ? String(item.numeroFactura).trim() : undefined,
      estado: normalizePythonWmEstado(item.estado ?? item.status),
      radicacionFecha: item.radicacionFecha ? String(item.radicacionFecha) : undefined,
      mensaje: item.mensaje || item.message ? String(item.mensaje ?? item.message) : undefined,
    });
  });

  return { transactions, wmResults };
};

export const downloadWmPendingForPythonJson = (transactions: ClaraTransaction[]): {
  fileName: string;
  count: number;
} => {
  const candidates = transactions.filter((t) => t.origenGasto !== 'exterior');
  const payload = {
    schemaVersion: 'premex-wm-python-input-v1',
    generatedAtIso: new Date().toISOString(),
    workManagerUrl: 'https://pan.iluma.bio:8037/Account/Login',
    invoicesCount: candidates.length,
    invoices: candidates.map((t) => ({
      txId: t.id,
      claraTxId: t.claraTxId || t.id,
      sociedad: t.sociedad,
      comercio: t.comercio,
      nitEmisor: t.facturaNit || t.nitComercio || '',
      numeroFactura: t.facturaNumero || t.workManagerNumeroFactura || '',
      fecha: t.facturaFecha || t.fecha,
      moneda: t.moneda,
      total: t.facturaTotal || t.valor,
      estadoActualWm: t.wmRadicacionStatus || 'pendiente',
    })),
  };

  const fileName = `wm_pendientes_python_${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { fileName, count: candidates.length };
};


