import {
  BankAccount,
  BankCurrency,
  BankMatchGroup,
  BankMonthlyBalance,
  BankPendingCategory,
  BankReconcilingSection,
  BankReconciliationSummary,
  BankStatementItem,
  BookLedgerItem,
  OfficialReconcilingLineItem,
  SapDocumentClass,
  SapOpenItem,
  SapSubaccountType,
} from '../types';

// ============================================================================
// SAP 00 / 01 / 02 Treasury Catalogs, Root Extraction & Classification Engine
// ============================================================================

export const SAP_DOCUMENT_CLASS_LABELS: Record<string, string> = {
  CB: 'Extracto Bancario',
  DZ: 'Recibo de caja',
  AB: 'Documento Contable',
  KZ: 'Comprobante de Pago',
  KR: 'Factura Acreedor',
  DC: 'Documento Compensación',
};

export const SAP_SUBACCOUNT_META: Record<
  SapSubaccountType,
  { code: SapSubaccountType; title: string; short: string; description: string }
> = {
  '00': {
    code: '00',
    title: 'Subcuenta 00 · Principal Bancaria',
    short: 'Cta 00 (Banco)',
    description: 'Movimientos bancarios efectivos (equivale al saldo en estado de cuenta).',
  },
  '01': {
    code: '01',
    title: 'Subcuenta 01 · Ingresos Pendientes',
    short: 'Cta 01 (Ingresos)',
    description: 'Movimientos de ingresos/consignaciones pendientes por conciliar.',
  },
  '02': {
    code: '02',
    title: 'Subcuenta 02 · Egresos Pendientes',
    short: 'Cta 02 (Egresos)',
    description: 'Movimientos de egresos/pagos pendientes por liquidar.',
  },
};

export const getSapDocumentClassLabel = (clase: SapDocumentClass): string => {
  const code = String(clase || '').trim().toUpperCase();
  return SAP_DOCUMENT_CLASS_LABELS[code] || (code ? `Clase ${code}` : 'Sin clase');
};

/**
 * Extracts the SAP accounting root (without last 2 digits 00/01/02) and subaccount suffix.
 * Example: "1110050100" -> { raiz: "11100501", subcuenta: "00", cleanAccount: "1110050100" }
 */
export const extractSapAccountRoot = (
  rawCuentaMayor: string
): {
  cleanAccount: string;
  raiz: string;
  subcuenta: SapSubaccountType;
  hasStandardSuffix: boolean;
} => {
  const cleanAccount = String(rawCuentaMayor || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '');

  if (cleanAccount.length >= 3) {
    const suffix = cleanAccount.slice(-2);
    if (suffix === '00' || suffix === '01' || suffix === '02') {
      return {
        cleanAccount,
        raiz: cleanAccount.slice(0, -2),
        subcuenta: suffix,
        hasStandardSuffix: true,
      };
    }
  }

  return {
    cleanAccount,
    raiz: cleanAccount,
    subcuenta: '00',
    hasStandardSuffix: false,
  };
};

/**
 * Derives standard SAP 00/01/02 GL accounts from any base GL account or root.
 */
export const deriveSapSubaccounts = (
  cuenta00OrRoot: string
): { raizContable: string; cuentaMayor00: string; cuentaMayor01: string; cuentaMayor02: string } => {
  const { cleanAccount, raiz, hasStandardSuffix } = extractSapAccountRoot(cuenta00OrRoot);
  if (!cleanAccount) {
    return { raizContable: '', cuentaMayor00: '', cuentaMayor01: '', cuentaMayor02: '' };
  }
  const baseRoot = hasStandardSuffix ? raiz : cleanAccount;
  return {
    raizContable: baseRoot,
    cuentaMayor00: `${baseRoot}00`,
    cuentaMayor01: `${baseRoot}01`,
    cuentaMayor02: `${baseRoot}02`,
  };
};

/**
 * Mandatory SAP FBL3N open-item classification rules:
 * - CB & importe < 0 -> MENOS CHEQUES PENDIENTES (Extracto)
 * - CB & importe > 0 -> MAS CONSIGNACIONES PENDIENTES (Extracto)
 * - Any other class (DZ, AB, KZ, KR, DC, etc.) & importe < 0 -> MAS NOTAS DEBITO NO CONTABILIZADAS (Libros)
 * - Any other class & importe > 0 -> MENOS NOTAS CREDITO NO CONTABILIZADAS (Libros)
 */
export const classifySapOpenItem = (
  claseDocumento: SapDocumentClass,
  importeMonedaLocal: number
): BankReconcilingSection => {
  const clase = String(claseDocumento || '').trim().toUpperCase();
  const isNegative = Number(importeMonedaLocal) < 0;

  if (clase === 'CB') {
    return isNegative ? 'menos_cheques_pendientes' : 'mas_consignaciones_pendientes';
  }
  return isNegative ? 'mas_notas_debito_libros' : 'menos_notas_credito_libros';
};

export const getEffectiveSapItemSection = (item: SapOpenItem): BankReconcilingSection => {
  if (item.seccionManual) return item.seccionManual;
  if (item.seccionAuto) return item.seccionAuto;
  return classifySapOpenItem(item.claseDocumento, item.importeMonedaLocal);
};

/**
 * Deterministic corporate brand monogram + color theme for interactive Bank Cards (Bloque 2).
 */
export interface BankBrandMeta {
  monogram: string;
  badgeBg: string;
  badgeText: string;
  accentBar: string;
}

export const getBankBrandMeta = (bankName: string): BankBrandMeta => {
  const norm = String(bankName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (norm.includes('bancolombia')) {
    return {
      monogram: 'BC',
      badgeBg: 'bg-amber-400',
      badgeText: 'text-slate-950',
      accentBar: 'bg-amber-400',
    };
  }
  if (norm.includes('bbva')) {
    return {
      monogram: 'BB',
      badgeBg: 'bg-[#004481]',
      badgeText: 'text-white',
      accentBar: 'bg-[#004481]',
    };
  }
  if (norm.includes('bogota')) {
    return {
      monogram: 'BG',
      badgeBg: 'bg-[#0033A0]',
      badgeText: 'text-amber-300',
      accentBar: 'bg-[#0033A0]',
    };
  }
  if (norm.includes('occidente')) {
    return {
      monogram: 'BO',
      badgeBg: 'bg-sky-700',
      badgeText: 'text-white',
      accentBar: 'bg-sky-600',
    };
  }
  if (norm.includes('scotia') || norm.includes('colpatria')) {
    return {
      monogram: 'SC',
      badgeBg: 'bg-red-600',
      badgeText: 'text-white',
      accentBar: 'bg-red-600',
    };
  }
  if (norm.includes('davivienda')) {
    return {
      monogram: 'DV',
      badgeBg: 'bg-rose-600',
      badgeText: 'text-white',
      accentBar: 'bg-rose-600',
    };
  }
  if (norm.includes('citi')) {
    return {
      monogram: 'CT',
      badgeBg: 'bg-sky-800',
      badgeText: 'text-white',
      accentBar: 'bg-sky-700',
    };
  }
  if (norm.includes('industrial')) {
    return {
      monogram: 'BI',
      badgeBg: 'bg-blue-700',
      badgeText: 'text-amber-300',
      accentBar: 'bg-blue-700',
    };
  }
  if (norm.includes('santander')) {
    return {
      monogram: 'SN',
      badgeBg: 'bg-red-700',
      badgeText: 'text-white',
      accentBar: 'bg-red-700',
    };
  }
  if (norm.includes('banamex') || norm.includes('banorte') || norm.includes('hsbc')) {
    return {
      monogram: norm.slice(0, 2).toUpperCase(),
      badgeBg: 'bg-rose-700',
      badgeText: 'text-white',
      accentBar: 'bg-rose-700',
    };
  }

  const tokens = String(bankName || 'BK')
    .replace(/\b(banco|bank|s\.?a\.?s?\.?|n\.?a\.?)\b/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const monogram =
    tokens.length >= 2
      ? `${tokens[0][0]}${tokens[1][0]}`.toUpperCase()
      : (tokens[0] || bankName || 'BK').slice(0, 2).toUpperCase();

  return {
    monogram,
    badgeBg: 'bg-slate-700',
    badgeText: 'text-white',
    accentBar: 'bg-slate-600',
  };
};

/**
 * Signed cash impact on bank balance (Bilateral Cruce):
 * - Extracto Bancario: CREDITO (+), DEBITO (-)
 * - Auxiliar Contable: DEBITO (+), CREDITO (-)
 */
export const getBankSignedAmount = (item: Pick<BankStatementItem, 'tipo' | 'valor'>): number => {
  const abs = Math.abs(Number(item.valor) || 0);
  return item.tipo === 'CREDITO' ? abs : -abs;
};

export const getLedgerSignedAmount = (item: Pick<BookLedgerItem, 'tipo' | 'valor'>): number => {
  const abs = Math.abs(Number(item.valor) || 0);
  return item.tipo === 'DEBITO' ? abs : -abs;
};

export const normalizeRefToken = (raw: string): string => {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^0+/, '');
};

export const normalizeAccountMatchKey = (raw: string): string => {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
};

const SPANISH_MONTH_INDEX: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const SPANISH_MONTH_UPPER: string[] = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];

/**
 * Converts YYYY-MM-DD (or DD/MM/YYYY) into DD/MM/YYYY for the official corporate sheet.
 */
export const formatSheetDate = (raw?: string): string => {
  const clean = String(raw || '').trim();
  if (!clean) return '';
  const iso = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`;
  }
  const dmy = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${dmy[1].padStart(2, '0')}/${dmy[2].padStart(2, '0')}/${year}`;
  }
  return clean;
};

/**
 * Infers last calendar day (YYYY-MM-DD) from a Spanish month label like "Octubre 2026" or "2026-10".
 */
export const inferCutoffDateFromMonth = (monthLabel: string): string => {
  const clean = String(monthLabel || '').trim();
  if (!clean || clean === 'ALL') return new Date().toISOString().slice(0, 10);

  const isoMatch = clean.match(/^(\d{4})-(\d{1,2})/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    if (y >= 2000 && m >= 1 && m <= 12) {
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
  }

  const lower = clean
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const yearMatch = lower.match(/(20\d{2})/);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();

  for (const [name, mIdx] of Object.entries(SPANISH_MONTH_INDEX)) {
    if (lower.includes(name)) {
      const lastDay = new Date(Date.UTC(year, mIdx, 0)).getUTCDate();
      return `${year}-${String(mIdx).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
  }

  return new Date().toISOString().slice(0, 10);
};

/**
 * Formats period header line (e.g. "Octubre 2026" -> "OCTUBRE 2026").
 */
export const formatOfficialMonthBanner = (selectedMonth: string): string => {
  const clean = String(selectedMonth || '').trim();
  if (!clean || clean === 'ALL') return 'CONSOLIDADO';
  const isoMatch = clean.match(/^(\d{4})-(\d{1,2})/);
  if (isoMatch) {
    const mIdx = Number(isoMatch[2]) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      return `${SPANISH_MONTH_UPPER[mIdx]} ${isoMatch[1]}`;
    }
  }
  return clean.toUpperCase();
};

/**
 * Builds the 4th header line matching the Premex format:
 * e.g. "Fondo de Valores RENTA LIQUIDEZ-1 No. 06411-9 (COP)"
 */
export const formatAccountProductLine = (account: BankAccount): string => {
  const product = String(account.productoCuenta || '').trim();
  const num = String(account.numeroCuenta || '').trim();
  const base = product
    ? num && !product.toLowerCase().includes(num.toLowerCase())
      ? `${product} No. ${num}`
      : product
    : `Cuenta ${account.tipoCuenta} No. ${num}`;
  return account.moneda ? `${base} · ${account.moneda}` : base;
};

/**
 * Builds the 5th header line showing Society Code and SAP GL 00 account.
 */
export const formatAccountSapHeaderLine = (account: BankAccount): string => {
  const soc = String(account.codigoSociedad || '').trim();
  const cta00 = String(account.cuentaMayor00 || account.codigoContable || '').trim();
  if (soc && cta00) return `Soc. ${soc} · Cta. Mayor 00: ${cta00}`;
  if (cta00) return cta00;
  if (soc) return `Sociedad ${soc}`;
  return account.pais || '';
};

/**
 * Resolves SAP 00/01/02 balances, Saldo en Libros, Saldo en Extracto, and cutoff date
 * for a specific corporate bank account and period.
 */
export const resolveAccountBalancesForMonth = (
  account: BankAccount | null,
  selectedMonth: string
): {
  saldoLibros: number;
  saldoExtracto: number;
  saldoCuenta00: number;
  saldoCuenta01: number;
  saldoCuenta02: number;
  hasSapSubaccounts: boolean;
  saldoExtractoManual: boolean;
  fechaCorte: string;
  hasMonthEntry: boolean;
  monthEntry?: BankMonthlyBalance;
} => {
  if (!account) {
    return {
      saldoLibros: 0,
      saldoExtracto: 0,
      saldoCuenta00: 0,
      saldoCuenta01: 0,
      saldoCuenta02: 0,
      hasSapSubaccounts: false,
      saldoExtractoManual: false,
      fechaCorte: inferCutoffDateFromMonth(selectedMonth),
      hasMonthEntry: false,
    };
  }

  const resolveFromEntry = (entry: BankMonthlyBalance, hasMonthEntry: boolean) => {
    const hasSap =
      entry.saldoCuenta00 !== undefined ||
      entry.saldoCuenta01 !== undefined ||
      entry.saldoCuenta02 !== undefined;
    const c00 = hasSap ? Number(entry.saldoCuenta00) || 0 : Number(entry.saldoExtracto) || 0;
    const c01 = hasSap ? Number(entry.saldoCuenta01) || 0 : 0;
    const c02 = hasSap ? Number(entry.saldoCuenta02) || 0 : 0;
    const saldoLibros = hasSap
      ? Math.round((c00 + c01 + c02) * 100) / 100
      : Number(entry.saldoLibros) || 0;
    const saldoExtracto =
      entry.saldoExtracto !== undefined && Number.isFinite(Number(entry.saldoExtracto))
        ? Number(entry.saldoExtracto)
        : c00;
    return {
      saldoLibros,
      saldoExtracto,
      saldoCuenta00: c00,
      saldoCuenta01: c01,
      saldoCuenta02: c02,
      hasSapSubaccounts: hasSap,
      saldoExtractoManual: Boolean(entry.saldoExtractoManual) || Math.abs(saldoExtracto - c00) > 0.01,
      fechaCorte: entry.fechaCorte || account.fechaCorte || inferCutoffDateFromMonth(selectedMonth),
      hasMonthEntry,
      monthEntry: entry,
    };
  };

  const map = account.saldosPorMes || {};
  if (selectedMonth && selectedMonth !== 'ALL' && map[selectedMonth]) {
    return resolveFromEntry(map[selectedMonth], true);
  }

  if (selectedMonth && selectedMonth !== 'ALL') {
    const normTarget = selectedMonth.trim().toLowerCase();
    const matchedKey = Object.keys(map).find((k) => k.trim().toLowerCase() === normTarget);
    if (matchedKey && map[matchedKey]) {
      return resolveFromEntry(map[matchedKey], true);
    }
  }

  const hasAccountSap =
    account.saldoCuenta00 !== undefined ||
    account.saldoCuenta01 !== undefined ||
    account.saldoCuenta02 !== undefined;
  const c00 = hasAccountSap
    ? Number(account.saldoCuenta00) || 0
    : Number(account.saldoFinalExtracto) || 0;
  const c01 = hasAccountSap ? Number(account.saldoCuenta01) || 0 : 0;
  const c02 = hasAccountSap ? Number(account.saldoCuenta02) || 0 : 0;
  const saldoLibros = hasAccountSap
    ? Math.round((c00 + c01 + c02) * 100) / 100
    : Number(account.saldoFinalLibros) || 0;
  const saldoExtracto = Number.isFinite(Number(account.saldoFinalExtracto))
    ? Number(account.saldoFinalExtracto)
    : c00;

  return {
    saldoLibros,
    saldoExtracto,
    saldoCuenta00: c00,
    saldoCuenta01: c01,
    saldoCuenta02: c02,
    hasSapSubaccounts: hasAccountSap,
    saldoExtractoManual:
      Boolean(account.saldoExtractoManual) || Math.abs(saldoExtracto - c00) > 0.01,
    fechaCorte: account.fechaCorte || inferCutoffDateFromMonth(selectedMonth),
    hasMonthEntry: false,
  };
};

const parseIsoDayTimestamp = (dateStr: string): number | null => {
  const clean = String(dateStr || '').trim();
  if (!clean) return null;
  const parsed = Date.parse(clean);
  if (!Number.isNaN(parsed)) return parsed;
  const parts = clean.split(/[/-]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number);
    if (a > 1900) return Date.UTC(a, b - 1, c);
    if (c > 1900) return Date.UTC(c, b - 1, a);
  }
  return null;
};

const daysBetween = (d1: string, d2: string): number => {
  const t1 = parseIsoDayTimestamp(d1);
  const t2 = parseIsoDayTimestamp(d2);
  if (t1 === null || t2 === null) return 999;
  return Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
};

export const formatBankMoney = (
  value: number,
  currency: BankCurrency = 'USD',
  showSign = false
): string => {
  const num = Number.isFinite(value) ? value : 0;
  const decimals = currency === 'COP' ? 0 : 2;
  const locale = currency === 'COP' ? 'es-CO' : 'en-US';
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(num));

  const symbol =
    currency === 'COP'
      ? 'COP $'
      : currency === 'EUR'
      ? '€'
      : currency === 'GTQ'
      ? 'Q'
      : currency === 'MXN'
      ? 'MX$'
      : 'US$';

  if (num < -0.005) return `-${symbol}${formatted}`;
  if (showSign && num > 0.005) return `+${symbol}${formatted}`;
  return `${symbol}${formatted}`;
};

/**
 * Formats value parts for the official Premex spreadsheet cells (currency prefix + right-aligned figure or "-").
 */
export const formatOfficialCellAmount = (
  value: number,
  currency: BankCurrency = 'COP',
  dashZero = false
): { symbol: string; figure: string; isZero: boolean } => {
  const num = Number.isFinite(value) ? value : 0;
  const symbol =
    currency === 'COP'
      ? '$'
      : currency === 'EUR'
      ? '€'
      : currency === 'GTQ'
      ? 'Q'
      : currency === 'MXN'
      ? 'MX$'
      : 'US$';

  if (Math.abs(num) < 0.005) {
    return {
      symbol,
      figure: dashZero ? '-' : currency === 'COP' ? '0' : '0.00',
      isZero: true,
    };
  }

  const decimals = currency === 'COP' ? 0 : 2;
  const locale = currency === 'COP' ? 'es-CO' : 'en-US';
  const absStr = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(num));

  return {
    symbol,
    figure: num < 0 ? `(${absStr})` : absStr,
    isZero: false,
  };
};

export const DEFAULT_PENDING_CATEGORY_LABEL: Record<BankPendingCategory, string> = {
  deposito_transito: 'Consignación / Depósito pendiente (+ Extracto)',
  cheque_transito: 'Cheque / Pago pendiente (- Extracto)',
  nota_debito: 'Nota crédito no contabilizada (- Libros)',
  nota_credito: 'Nota débito no contabilizada (+ Libros)',
  por_identificar: 'Partida por identificar',
};

export const RECONCILING_SECTION_META: Record<
  BankReconcilingSection,
  {
    side: 'libros' | 'extracto';
    signLabel: 'MAS' | 'MENOS';
    title: string;
    shortLabel: string;
    helper: string;
  }
> = {
  mas_notas_debito_libros: {
    side: 'libros',
    signLabel: 'MAS',
    title: 'NOTAS DEBITO NO CONTABILIZADAS',
    shortLabel: 'MAS · Notas Débito no Contabilizadas (+ Libros)',
    helper: 'Partidas contables no-CB con importe negativo (-) o abonos bancarios que suman a Libros',
  },
  menos_notas_credito_libros: {
    side: 'libros',
    signLabel: 'MENOS',
    title: 'NOTAS CREDITO NO CONTABILIZADAS',
    shortLabel: 'MENOS · Notas Crédito no Contabilizadas (- Libros)',
    helper: 'Partidas contables no-CB con importe positivo (+) o cargos bancarios que restan a Libros',
  },
  menos_cheques_pendientes: {
    side: 'extracto',
    signLabel: 'MENOS',
    title: 'CHEQUES PENDIENTES',
    shortLabel: 'MENOS · Cheques / Pagos Pendientes (- Extracto)',
    helper: 'Partidas clase CB con importe negativo (-) o cheques/pagos pendientes de cobro en banco',
  },
  mas_consignaciones_pendientes: {
    side: 'extracto',
    signLabel: 'MAS',
    title: 'CONSIGNACIONES PENDIENTES',
    shortLabel: 'MAS · Consignaciones Pendientes (+ Extracto)',
    helper: 'Partidas clase CB con importe positivo (+) o depósitos pendientes de abono en el banco',
  },
};

export const inferPendingCategoryForBank = (item: BankStatementItem): BankPendingCategory => {
  if (item.categoriaPendiente) return item.categoriaPendiente;
  return item.tipo === 'CREDITO' ? 'nota_credito' : 'nota_debito';
};

export const inferPendingCategoryForLedger = (item: BookLedgerItem): BankPendingCategory => {
  if (item.categoriaPendiente) return item.categoriaPendiente;
  return item.tipo === 'DEBITO' ? 'deposito_transito' : 'cheque_transito';
};

const formatSapLineConcepto = (item: SapOpenItem): string => {
  const parts: string[] = [];
  if (item.texto && item.texto.trim()) parts.push(item.texto.trim());
  if (
    item.claveRef3 &&
    item.claveRef3.trim() &&
    !parts.join(' ').toLowerCase().includes(item.claveRef3.trim().toLowerCase())
  ) {
    parts.push(item.claveRef3.trim());
  }
  return parts.join(' · ') || getSapDocumentClassLabel(item.claseDocumento);
};

/**
 * Computes full SAP 00/01/02 + Bilateral reconciliation metrics and formal 4-quadrant Premex bridge
 * (CONCILIACION DE BANCOS) for a specific corporate bank account & period.
 */
export const computeBankReconciliationSummary = (
  account: BankAccount | null,
  statementItems: BankStatementItem[],
  ledgerItems: BookLedgerItem[],
  matches: BankMatchGroup[],
  selectedMonth: string,
  sapOpenItems: SapOpenItem[] = []
): BankReconciliationSummary => {
  const accountId = account?.id || '';

  // 1. Scoped SAP FBL3N Open Items
  const scopedSapItems = sapOpenItems.filter(
    (item) =>
      item.cuentaId === accountId &&
      (selectedMonth === 'ALL' || !item.mes || item.mes === selectedMonth)
  );

  // 2. Scoped Bilateral Statement & Ledger Items
  const scopedBank = statementItems.filter(
    (item) =>
      item.cuentaId === accountId &&
      (selectedMonth === 'ALL' || item.mes === selectedMonth)
  );
  const scopedLedger = ledgerItems.filter(
    (item) =>
      item.cuentaId === accountId &&
      (selectedMonth === 'ALL' || item.mes === selectedMonth)
  );

  const bankIdSet = new Set(scopedBank.map((i) => i.id));
  const ledgerIdSet = new Set(scopedLedger.map((i) => i.id));

  const matchedBankIds = new Set<string>();
  const matchedLedgerIds = new Set<string>();

  matches.forEach((group) => {
    if (group.cuentaId !== accountId) return;
    const validBank = group.bankItemIds.filter((id) => bankIdSet.has(id));
    const validLedger = group.ledgerItemIds.filter((id) => ledgerIdSet.has(id));
    if (validBank.length > 0 && validLedger.length > 0) {
      validBank.forEach((id) => matchedBankIds.add(id));
      validLedger.forEach((id) => matchedLedgerIds.add(id));
    }
  });

  const unmatchedBankItems = scopedBank.filter((i) => !matchedBankIds.has(i.id));
  const unmatchedLedgerItems = scopedLedger.filter((i) => !matchedLedgerIds.has(i.id));

  const consignacionesPendientesItems = unmatchedLedgerItems.filter((i) => i.tipo === 'DEBITO');
  const chequesPendientesItems = unmatchedLedgerItems.filter((i) => i.tipo === 'CREDITO');
  const notasDebitoLibrosItems = unmatchedBankItems.filter((i) => i.tipo === 'CREDITO');
  const notasCreditoLibrosItems = unmatchedBankItems.filter((i) => i.tipo === 'DEBITO');

  // 3. Build unified 4-section official line items (SAP FBL3N primary + unmatched bilateral items)
  const masNotasDebito: OfficialReconcilingLineItem[] = [];
  const menosNotasCredito: OfficialReconcilingLineItem[] = [];
  const menosCheques: OfficialReconcilingLineItem[] = [];
  const masConsignaciones: OfficialReconcilingLineItem[] = [];

  scopedSapItems.forEach((item) => {
    const section = getEffectiveSapItemSection(item);
    const line: OfficialReconcilingLineItem = {
      id: item.id,
      source: 'sap',
      section,
      dto: item.numeroDocumento || item.referencia || item.claveRef1 || '-',
      fecha: item.fechaDocumento || item.fechaContabilizacion || '',
      concepto: formatSapLineConcepto(item),
      valor: Math.abs(Number(item.importeMonedaLocal) || 0),
      signedImporte: Number(item.importeMonedaLocal) || 0,
      tercero: item.claveRef3 || undefined,
      claseDocumento: item.claseDocumento,
      subcuentaTipo: item.subcuentaTipo,
      comentario: item.comentario,
    };
    if (section === 'mas_notas_debito_libros') masNotasDebito.push(line);
    else if (section === 'menos_notas_credito_libros') menosNotasCredito.push(line);
    else if (section === 'menos_cheques_pendientes') menosCheques.push(line);
    else masConsignaciones.push(line);
  });

  // Include bilateral unmatched items when present on accounts without SAP FBL3N open items,
  // OR if they were explicitly entered via direct reconciliation.
  const includeBilateralFallback = scopedSapItems.length === 0;
  if (includeBilateralFallback) {
    notasDebitoLibrosItems.forEach((b) => {
      masNotasDebito.push({
        id: b.id,
        source: 'bank',
        section: 'mas_notas_debito_libros',
        dto: b.referencia,
        fecha: b.fecha,
        concepto: b.descripcion,
        valor: Math.abs(Number(b.valor) || 0),
        comentario: b.comentario,
      });
    });
    notasCreditoLibrosItems.forEach((b) => {
      menosNotasCredito.push({
        id: b.id,
        source: 'bank',
        section: 'menos_notas_credito_libros',
        dto: b.referencia,
        fecha: b.fecha,
        concepto: b.descripcion,
        valor: Math.abs(Number(b.valor) || 0),
        comentario: b.comentario,
      });
    });
    chequesPendientesItems.forEach((l) => {
      menosCheques.push({
        id: l.id,
        source: 'ledger',
        section: 'menos_cheques_pendientes',
        dto: l.comprobante,
        fecha: l.fecha,
        concepto: l.tercero ? `${l.descripcion} · ${l.tercero}` : l.descripcion,
        valor: Math.abs(Number(l.valor) || 0),
        tercero: l.tercero,
        comentario: l.comentario,
      });
    });
    consignacionesPendientesItems.forEach((l) => {
      masConsignaciones.push({
        id: l.id,
        source: 'ledger',
        section: 'mas_consignaciones_pendientes',
        dto: l.comprobante,
        fecha: l.fecha,
        concepto: l.tercero ? `${l.descripcion} · ${l.tercero}` : l.descripcion,
        valor: Math.abs(Number(l.valor) || 0),
        tercero: l.tercero,
        comentario: l.comentario,
      });
    });
  }

  const notasCreditoNoContabilizadas =
    Math.round(masNotasDebito.reduce((acc, i) => acc + i.valor, 0) * 100) / 100;
  const notasDebitoNoContabilizadas =
    Math.round(menosNotasCredito.reduce((acc, i) => acc + i.valor, 0) * 100) / 100;
  const chequesEnTransito =
    Math.round(menosCheques.reduce((acc, i) => acc + i.valor, 0) * 100) / 100;
  const depositosEnTransito =
    Math.round(masConsignaciones.reduce((acc, i) => acc + i.valor, 0) * 100) / 100;

  const resolvedBalances = resolveAccountBalancesForMonth(account, selectedMonth);
  const saldoExtracto = resolvedBalances.saldoExtracto;
  const saldoLibros = resolvedBalances.saldoLibros;
  const fechaCorte = resolvedBalances.fechaCorte;

  const saldoConciliadoExtracto =
    Math.round((saldoExtracto - chequesEnTransito + depositosEnTransito) * 100) / 100;
  const saldoConciliadoLibros =
    Math.round((saldoLibros + notasCreditoNoContabilizadas - notasDebitoNoContabilizadas) * 100) /
    100;
  const diferenciaNeta =
    Math.round((saldoConciliadoLibros - saldoConciliadoExtracto) * 100) / 100;

  // 4. SAP Subaccount 00 / 01 / 02 Audit Deltas
  const sumSapItems01 =
    Math.round(
      scopedSapItems
        .filter((i) => i.subcuentaTipo === '01')
        .reduce((acc, i) => acc + (Number(i.importeMonedaLocal) || 0), 0) * 100
    ) / 100;
  const sumSapItems02 =
    Math.round(
      scopedSapItems
        .filter((i) => i.subcuentaTipo === '02')
        .reduce((acc, i) => acc + (Number(i.importeMonedaLocal) || 0), 0) * 100
    ) / 100;

  const diffSubcuenta00 =
    Math.round((resolvedBalances.saldoCuenta00 - saldoExtracto) * 100) / 100;
  const diffSubcuenta01 =
    Math.round((resolvedBalances.saldoCuenta01 - sumSapItems01) * 100) / 100;
  const diffSubcuenta02 =
    Math.round((resolvedBalances.saldoCuenta02 - sumSapItems02) * 100) / 100;

  const totalItems = scopedBank.length + scopedLedger.length;
  const matchedTotal = matchedBankIds.size + matchedLedgerIds.size;
  const isSquared = Math.abs(diferenciaNeta) <= 1;
  const reconciledPct = isSquared
    ? 100
    : totalItems > 0
    ? Math.round((matchedTotal / totalItems) * 100)
    : 0;

  return {
    account,
    fechaCorte,
    saldoExtracto,
    saldoCuenta00: resolvedBalances.saldoCuenta00,
    saldoCuenta01: resolvedBalances.saldoCuenta01,
    saldoCuenta02: resolvedBalances.saldoCuenta02,
    hasSapSubaccounts: resolvedBalances.hasSapSubaccounts,
    saldoExtractoMatchesCta00: Math.abs(diffSubcuenta00) <= 0.01,
    sumSapItems01,
    sumSapItems02,
    diffSubcuenta00,
    diffSubcuenta01,
    diffSubcuenta02,
    sapItemsCount: scopedSapItems.length,
    depositosEnTransito,
    chequesEnTransito,
    saldoConciliadoExtracto,
    saldoLibros,
    notasCreditoNoContabilizadas,
    notasDebitoNoContabilizadas,
    saldoConciliadoLibros,
    diferenciaNeta,
    totalBankItems: scopedBank.length,
    matchedBankItemsCount: matchedBankIds.size,
    unmatchedBankItemsCount: unmatchedBankItems.length,
    totalLedgerItems: scopedLedger.length,
    matchedLedgerItemsCount: matchedLedgerIds.size,
    unmatchedLedgerItemsCount: unmatchedLedgerItems.length,
    reconciledPct,
    unmatchedBankItems,
    unmatchedLedgerItems,
    scopedSapItems,
    officialLines: {
      masNotasDebito,
      menosNotasCredito,
      menosCheques,
      masConsignaciones,
    },
    notasDebitoLibrosItems,
    notasCreditoLibrosItems,
    chequesPendientesItems,
    consignacionesPendientesItems,
    matchedBankIds,
    matchedLedgerIds,
  };
};

/**
 * Deterministic 2-pass auto-reconciliation matcher (Cruce Bilateral):
 * Pass 1: Exact normalized reference/voucher + exact signed amount (<= 0.01)
 * Pass 2: Exact signed amount (<= 0.01) + date proximity <= 5 days
 */
export const runAutoBankMatch = (
  accountId: string,
  selectedMonth: string,
  statementItems: BankStatementItem[],
  ledgerItems: BookLedgerItem[],
  existingMatches: BankMatchGroup[]
): {
  newMatches: BankMatchGroup[];
  byRefCount: number;
  byAmountCount: number;
} => {
  const alreadyMatchedBank = new Set<string>();
  const alreadyMatchedLedger = new Set<string>();
  existingMatches.forEach((m) => {
    m.bankItemIds.forEach((id) => alreadyMatchedBank.add(id));
    m.ledgerItemIds.forEach((id) => alreadyMatchedLedger.add(id));
  });

  const availBank = statementItems.filter(
    (item) =>
      item.cuentaId === accountId &&
      (selectedMonth === 'ALL' || item.mes === selectedMonth) &&
      !alreadyMatchedBank.has(item.id)
  );
  const availLedger = ledgerItems.filter(
    (item) =>
      item.cuentaId === accountId &&
      (selectedMonth === 'ALL' || item.mes === selectedMonth) &&
      !alreadyMatchedLedger.has(item.id)
  );

  const usedBank = new Set<string>();
  const usedLedger = new Set<string>();
  const newMatches: BankMatchGroup[] = [];
  const nowIso = new Date().toISOString();
  let byRefCount = 0;
  let byAmountCount = 0;

  // Pass 1: Reference + Signed Amount
  for (const b of availBank) {
    if (usedBank.has(b.id)) continue;
    const bSigned = getBankSignedAmount(b);
    const bRef = normalizeRefToken(b.referencia);
    if (!bRef || bRef.length < 3) continue;

    const candidate = availLedger.find((l) => {
      if (usedLedger.has(l.id)) return false;
      const lSigned = getLedgerSignedAmount(l);
      if (Math.abs(bSigned - lSigned) > 0.01) return false;
      const lRef = normalizeRefToken(l.comprobante);
      if (!lRef || lRef.length < 3) return false;
      return bRef === lRef || bRef.includes(lRef) || lRef.includes(bRef);
    });

    if (candidate) {
      usedBank.add(b.id);
      usedLedger.add(candidate.id);
      byRefCount += 1;
      newMatches.push({
        id: `bm-auto-ref-${Date.now()}-${newMatches.length}`,
        cuentaId: accountId,
        mes: b.mes,
        bankItemIds: [b.id],
        ledgerItemIds: [candidate.id],
        method: 'automatico_ref',
        matchedAt: nowIso,
      });
    }
  }

  // Pass 2: Signed Amount + Closest Date (<= 5 days)
  for (const b of availBank) {
    if (usedBank.has(b.id)) continue;
    const bSigned = getBankSignedAmount(b);

    let bestCandidate: BookLedgerItem | null = null;
    let bestDays = 6;

    for (const l of availLedger) {
      if (usedLedger.has(l.id)) continue;
      const lSigned = getLedgerSignedAmount(l);
      if (Math.abs(bSigned - lSigned) > 0.01) continue;
      const d = daysBetween(b.fecha, l.fecha);
      if (d <= 5 && d < bestDays) {
        bestDays = d;
        bestCandidate = l;
      }
    }

    if (bestCandidate) {
      usedBank.add(b.id);
      usedLedger.add(bestCandidate.id);
      byAmountCount += 1;
      newMatches.push({
        id: `bm-auto-val-${Date.now()}-${newMatches.length}`,
        cuentaId: accountId,
        mes: b.mes,
        bankItemIds: [b.id],
        ledgerItemIds: [bestCandidate.id],
        method: 'automatico_valor',
        matchedAt: nowIso,
      });
    }
  }

  return { newMatches, byRefCount, byAmountCount };
};
