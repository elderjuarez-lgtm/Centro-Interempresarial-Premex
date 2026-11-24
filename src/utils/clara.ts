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
  ClaraWorkManagerStatus,
  EffectivePermissions,
} from '../types';

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
};

export const INITIAL_CLARA_COST_CENTER_RULES: ClaraCostCenterRule[] = [
  {
    id: 'cc-rule-premex-com',
    sociedad: 'PREMEX',
    centroCostoClara: 'CC-COM-01 Ventas',
    erpDestino: 'SAP',
    codigoCentroCostoErp: '1000-COM01',
    cuentaContableDefault: '5195250001',
    sociedadSap: '1000',
    activa: true,
  },
  {
    id: 'cc-rule-premex-ti',
    sociedad: 'PREMEX',
    centroCostoClara: 'CC-TI-04 Tecnología',
    erpDestino: 'SAP',
    codigoCentroCostoErp: '1000-TI004',
    cuentaContableDefault: '5135700002',
    sociedadSap: '1000',
    activa: true,
  },
  {
    id: 'cc-rule-adiquim-ops',
    sociedad: 'ADIQUIM',
    centroCostoClara: 'CC-OPS-02 Planta',
    erpDestino: 'SAP',
    codigoCentroCostoErp: '2000-OPS02',
    cuentaContableDefault: '5295200005',
    sociedadSap: '2000',
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

    // 3. Foreign origin check
    if (tx.origenGasto === 'exterior') {
      tx.workManagerStatus = 'exenta_exterior';
      tx.workManagerInvoiceId = undefined;
      tx.workManagerNumeroFactura = undefined;
    } else {
      // Check manual link first
      let matchedInv = tx.workManagerInvoiceId
        ? nextInvoices.find((inv) => inv.id === tx.workManagerInvoiceId)
        : undefined;

      // Auto-match if not manually linked
      if (!matchedInv) {
        const txNit = normalizeNitKey(tx.nitComercio || tx.terceroNit);
        const txMerchant = normalizeTextKey(tx.comercio);
        const txVendorName = normalizeTextKey(tx.terceroNombre);
        const obsUpper = String(tx.observacion || '').toUpperCase();

        matchedInv = nextInvoices.find((inv) => {
          const alreadyUsedBy = invoiceLinks.get(inv.id);
          if (alreadyUsedBy && alreadyUsedBy !== tx.id) return false;

          // A. Invoice number mentioned in Clara observation
          if (inv.numeroFactura && obsUpper.includes(inv.numeroFactura.toUpperCase())) {
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

          const dayDiff = daysBetweenIso(tx.fecha, inv.fechaEmision);
          const amountDiff = Math.abs(Number(tx.valor) - Number(inv.total));
          return dayDiff <= maxDays && amountDiff <= Math.max(tolerance, tx.valor * 0.05);
        });
      }

      if (matchedInv) {
        invoiceLinks.set(matchedInv.id, tx.id);
        tx.workManagerInvoiceId = matchedInv.id;
        tx.workManagerNumeroFactura = matchedInv.numeroFactura;
        if (!tx.nitComercio && matchedInv.nitEmisor) {
          tx.nitComercio = matchedInv.nitEmisor;
        }
        const diff = Math.abs(Number(tx.valor) - Number(matchedInv.total));
        tx.workManagerStatus = diff <= tolerance ? 'validada' : 'diferencia_valor';
      } else {
        tx.workManagerInvoiceId = undefined;
        tx.workManagerNumeroFactura = undefined;
        tx.workManagerStatus = 'pendiente_factura';
      }
    }

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

export const exportAccountingBatchExcel = (params: {
  erp: 'SAP' | 'Odoo';
  transactions: ClaraTransaction[];
  vendors: ClaraVendor[];
  rules: ClaraCostCenterRule[];
  userName: string;
}): ClaraBatchExportLog => {
  const { erp, transactions, vendors, rules, userName } = params;
  const wb = XLSX.utils.book_new();
  const dateTag = new Date().toISOString().slice(0, 10);

  if (erp === 'SAP') {
    const rows = transactions.map((tx) => {
      const vendor = findMatchingVendor(tx, vendors);
      const rule = rules.find(
        (r) =>
          normalizeTextKey(r.sociedad) === normalizeTextKey(tx.sociedad) &&
          normalizeTextKey(r.centroCostoClara) === normalizeTextKey(tx.centroCosto)
      );
      return {
        Sociedad_SAP: rule?.sociedadSap || tx.sociedad,
        Fecha_Contabilizacion: tx.fecha,
        Fecha_Documento: tx.fecha,
        Clase_Doc: tx.origenGasto === 'exterior' ? 'KR' : 'KR',
        Referencia_Clara: tx.claraTxId || tx.id,
        Factura_WorkManager:
          tx.origenGasto === 'exterior'
            ? 'EXENTO_EXTERIOR'
            : tx.workManagerNumeroFactura || 'SIN_FACTURA',
        Codigo_Acreedor_SAP: vendor?.codigoTerceroSap || 'PENDIENTE',
        NIT_Tercero: vendor?.nitTaxId || tx.nitComercio || '',
        Nombre_Tercero: vendor?.razonSocial || tx.comercio,
        Cuenta_Mayor: tx.cuentaContable || rule?.cuentaContableDefault || '',
        Centro_Costo_SAP: rule?.codigoCentroCostoErp || tx.centroCosto,
        Moneda: tx.moneda,
        Importe: tx.valor,
        Indicador_Impuesto: tx.indicadorImpuesto || (tx.origenGasto === 'exterior' ? 'S0' : 'V19'),
        Texto_Observacion_Clara: tx.observacion,
        Tarjetahabiente: tx.tarjetahabiente,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Lote_SAP_Gastos_TC');
    const fileName = `Lote_Contable_SAP_Clara_${dateTag}.xlsx`;
    XLSX.writeFile(wb, fileName);

    return {
      id: `batch-sap-${Date.now()}`,
      createdAtIso: new Date().toISOString(),
      createdBy: userName,
      erp: 'SAP',
      tipo: 'gastos',
      cantidadRegistros: transactions.length,
      totalMonto: transactions.reduce((s, t) => s + (Number(t.valor) || 0), 0),
      moneda: transactions[0]?.moneda || 'COP',
      archivoNombre: fileName,
    };
  }

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
