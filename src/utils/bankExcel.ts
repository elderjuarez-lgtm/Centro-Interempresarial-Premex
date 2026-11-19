import * as XLSX from 'xlsx';
import {
  BankAccount,
  BankAccountType,
  BankCurrency,
  BankMatchGroup,
  BankReconcilingSection,
  BankReconciliationSummary,
  BankSociety,
  BankStatementItem,
  BookLedgerItem,
  SapBalanceRow,
  SapOpenItem,
  SapSubaccountType,
} from '../types';
import {
  classifySapOpenItem,
  deriveSapSubaccounts,
  extractSapAccountRoot,
  inferCutoffDateFromMonth,
  normalizeAccountMatchKey,
} from './bankReconciliation';
import { normalizeCompanyKey } from './permissions';

const normalizeHeader = (h: string): string =>
  String(h || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const normalizeTextToken = (raw: unknown): string =>
  String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const parseNumericValue = (raw: unknown): number => {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const str = String(raw || '').trim();
  if (!str || str === '-' || str === '$ -' || str === '$-') return 0;
  // Handle SAP trailing minus "155.735-" and accounting parentheses "(1,200.50)"
  const isTrailingNeg = /-$/.test(str);
  const isNeg = /^\(.*\)$/.test(str) || str.startsWith('-') || isTrailingNeg;
  const cleaned = str
    .replace(/[()$€Q\s]/g, '')
    .replace(/COP|USD|MXN|MX|GTQ|EUR/gi, '')
    .replace(/-$/g, '');
  let normalized = cleaned;
  const dotCount = (normalized.match(/\./g) || []).length;
  const commaCount = (normalized.match(/,/g) || []).length;
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');

  if (dotCount >= 2 && commaCount === 0) {
    normalized = normalized.replace(/\./g, '');
  } else if (lastComma > lastDot && lastComma >= normalized.length - 3) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (dotCount === 1 && commaCount === 0 && normalized.length - lastDot - 1 === 3) {
    normalized = normalized.replace(/\./g, '');
  } else {
    normalized = normalized.replace(/,/g, '');
  }
  const num = parseFloat(normalized.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(num)) return 0;
  return isNeg ? -Math.abs(num) : num;
};

export const formatDateValue = (raw: unknown, fallbackDate?: string): string => {
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + raw * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const str = String(raw || '').trim();
  if (!str) return fallbackDate || new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  // Support SAP DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const m = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const month = m[2].padStart(2, '0');
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${month}-${day}`;
  }
  return str.slice(0, 20);
};

export const parseCurrencyValue = (raw: unknown, fallback: BankCurrency = 'COP'): BankCurrency => {
  const token = String(raw || '').trim().toUpperCase();
  if (token.includes('USD') || token === 'US$' || token.includes('DOLAR')) return 'USD';
  if (token.includes('COP') || token.includes('PESO')) return 'COP';
  if (token.includes('GTQ') || token.includes('QUETZ')) return 'GTQ';
  if (token.includes('MXN') || token.includes('MX')) return 'MXN';
  if (token.includes('EUR')) return 'EUR';
  return fallback;
};

export const parseAccountTypeValue = (raw: unknown, producto?: string): BankAccountType => {
  const combined = normalizeTextToken(`${raw || ''} ${producto || ''}`);
  if (combined.includes('fondo') || combined.includes('liquidez') || combined.includes('inversion')) {
    return 'Fondo de Inversión';
  }
  if (combined.includes('fiduc') || combined.includes('encargo')) return 'Fiduciaria';
  if (combined.includes('ahorro')) return 'Ahorros';
  if (combined.includes('recaud')) return 'Recaudadora';
  return 'Corriente';
};

export const matchExistingAccount = (
  existingAccounts: BankAccount[],
  sociedad: string,
  banco: string,
  numeroCuenta: string,
  codigoContable?: string,
  codigoSociedad?: string
): BankAccount | null => {
  const normSoc = normalizeCompanyKey(sociedad);
  const normSocCode = normalizeAccountMatchKey(codigoSociedad || '');
  const normAcc = normalizeAccountMatchKey(numeroCuenta);
  const normBank = normalizeCompanyKey(banco);
  const { raiz: targetRaiz, cleanAccount: targetCleanGl } = extractSapAccountRoot(
    codigoContable || ''
  );

  // Pass 0: SAP Sociedad Code/Name + Raíz Contable
  if (targetRaiz && targetRaiz.length >= 4) {
    const bySapRoot = existingAccounts.find((a) => {
      const aRoot =
        a.raizContable || extractSapAccountRoot(a.cuentaMayor00 || a.codigoContable || '').raiz;
      if (!aRoot || aRoot !== targetRaiz) return false;
      if (normSocCode && a.codigoSociedad) {
        return normalizeAccountMatchKey(a.codigoSociedad) === normSocCode;
      }
      if (normSoc) {
        return normalizeCompanyKey(a.sociedad) === normSoc;
      }
      return true;
    });
    if (bySapRoot) return bySapRoot;

    // Fallback by exact GL 00/01/02
    const byGlExact = existingAccounts.find((a) => {
      const gls = [a.cuentaMayor00, a.cuentaMayor01, a.cuentaMayor02, a.codigoContable]
        .filter(Boolean)
        .map((g) => extractSapAccountRoot(String(g)).cleanAccount);
      return gls.includes(targetCleanGl);
    });
    if (byGlExact) return byGlExact;
  }

  // Pass 1: Exact Company + Account Number
  if (normSoc && normAcc) {
    const exact = existingAccounts.find(
      (a) =>
        normalizeCompanyKey(a.sociedad) === normSoc &&
        normalizeAccountMatchKey(a.numeroCuenta) === normAcc
    );
    if (exact) return exact;
  }

  // Pass 2: Exact Account Number
  if (normAcc && normAcc.length >= 4) {
    const byNum = existingAccounts.find(
      (a) => normalizeAccountMatchKey(a.numeroCuenta) === normAcc
    );
    if (byNum) return byNum;
  }

  // Pass 3: Company + Bank (when only one account of that bank exists for the company)
  if (normSoc && normBank) {
    const candidates = existingAccounts.filter(
      (a) =>
        normalizeCompanyKey(a.sociedad) === normSoc &&
        (normalizeCompanyKey(a.banco) === normBank ||
          normalizeCompanyKey(a.banco).includes(normBank) ||
          normBank.includes(normalizeCompanyKey(a.banco)))
    );
    if (candidates.length === 1) return candidates[0];
  }

  return null;
};

// ============================================================================
// SAP PARSER 1: Catálogo Masivo de Sociedades y Cuentas por Sociedad (00/01/02)
// ============================================================================

export interface ParsedSapCatalogSociety {
  codigoSociedad: string;
  nombre: string;
  pais: string;
  moneda: BankCurrency;
  nit?: string;
}

export interface ParsedSapCatalogAccount {
  codigoSociedad: string;
  sociedadNombre: string;
  banco: string;
  numeroCuenta: string;
  productoCuenta: string;
  tipoCuenta: BankAccountType;
  moneda: BankCurrency;
  pais: string;
  raizContable: string;
  cuentaMayor00: string;
  cuentaMayor01: string;
  cuentaMayor02: string;
  matchedAccountId: string | null;
}

export interface ParsedSapCatalogResult {
  societies: ParsedSapCatalogSociety[];
  accounts: ParsedSapCatalogAccount[];
  warnings: string[];
  sheetNames: string[];
}

export const parseSapCatalogFile = async (
  file: File,
  existingSocieties: BankSociety[],
  existingAccounts: BankAccount[]
): Promise<ParsedSapCatalogResult> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const warnings: string[] = [];
  const socMap = new Map<string, ParsedSapCatalogSociety>();
  const accounts: ParsedSapCatalogAccount[] = [];

  const socNameByCode = new Map<string, string>();
  existingSocieties.forEach((s) => {
    socNameByCode.set(s.codigoSociedad.trim().toUpperCase(), s.nombre);
  });

  const parseSocRows = (rawRows: Record<string, unknown>[]) => {
    rawRows.forEach((row) => {
      const m: Record<string, unknown> = {};
      Object.entries(row).forEach(([k, v]) => {
        m[normalizeHeader(k)] = v;
      });
      const codigo = String(
        m.codigosociedad || m.sociedadcodigo || m.codigo || m.sociedad || ''
      ).trim();
      const nombre = String(
        m.nombre || m.razonsocial || m.empresa || m.nombresociedad || m.denominacion || ''
      ).trim();
      if (!codigo && !nombre) return;
      const safeCode = (codigo || nombre.slice(0, 8)).toUpperCase();
      const safeName = nombre || socNameByCode.get(safeCode) || `Sociedad ${safeCode}`;
      const pais = String(m.pais || m.country || 'Colombia').trim();
      const moneda = parseCurrencyValue(m.moneda || m.divisa || m.currency, 'COP');
      const nit = String(m.nit || m.ruc || m.taxid || '').trim();
      socMap.set(safeCode, {
        codigoSociedad: safeCode,
        nombre: safeName,
        pais,
        moneda,
        nit: nit || undefined,
      });
      socNameByCode.set(safeCode, safeName);
    });
  };

  const parseAccRows = (rawRows: Record<string, unknown>[]) => {
    rawRows.forEach((row, idx) => {
      const m: Record<string, unknown> = {};
      Object.entries(row).forEach(([k, v]) => {
        m[normalizeHeader(k)] = v;
      });
      const banco = String(m.banco || m.entidad || m.entidadbancaria || m.nombrebanco || '').trim();
      const numeroCuenta = String(
        m.numerocuenta || m.nocuenta || m.numerodecuenta || m.cuenta || m.cuentabancaria || ''
      ).trim();
      const cta00Raw = String(
        m.cuentamayor00 ||
          m.cta00 ||
          m.subcuenta00 ||
          m.ctamayor00 ||
          m.ctamayor ||
          m.cuentacontable ||
          ''
      ).trim();
      const cta01Raw = String(m.cuentamayor01 || m.cta01 || m.subcuenta01 || m.ctamayor01 || '').trim();
      const cta02Raw = String(m.cuentamayor02 || m.cta02 || m.subcuenta02 || m.ctamayor02 || '').trim();

      if (!banco && !numeroCuenta && !cta00Raw) return;

      const codigoSoc = String(
        m.codigosociedad || m.sociedadcodigo || m.sociedad || m.codsociedad || ''
      ).trim();
      const socNombreRaw = String(
        m.nombresociedad || m.razonsocial || m.empresa || ''
      ).trim();

      const resolvedCode = (codigoSoc || '1000').toUpperCase();
      const resolvedName =
        socNombreRaw ||
        socNameByCode.get(resolvedCode) ||
        (codigoSoc && !/^\d+$/.test(codigoSoc) ? codigoSoc : `Sociedad ${resolvedCode}`);

      if (!socMap.has(resolvedCode)) {
        socMap.set(resolvedCode, {
          codigoSociedad: resolvedCode,
          nombre: resolvedName,
          pais: String(m.pais || 'Colombia').trim(),
          moneda: parseCurrencyValue(m.moneda || m.divisa, 'COP'),
        });
      }

      const derived = deriveSapSubaccounts(cta00Raw || cta01Raw || cta02Raw);
      const cuentaMayor00 = cta00Raw ? extractSapAccountRoot(cta00Raw).cleanAccount : derived.cuentaMayor00;
      const cuentaMayor01 = cta01Raw ? extractSapAccountRoot(cta01Raw).cleanAccount : derived.cuentaMayor01;
      const cuentaMayor02 = cta02Raw ? extractSapAccountRoot(cta02Raw).cleanAccount : derived.cuentaMayor02;
      const raizContable = derived.raizContable;

      const productoCuenta = String(
        m.producto || m.productocuenta || m.descripcion || m.denominacion || ''
      ).trim();
      const tipoCuenta = parseAccountTypeValue(m.tipo || m.tipocuenta, productoCuenta);
      const moneda = parseCurrencyValue(m.moneda || m.divisa, socMap.get(resolvedCode)?.moneda || 'COP');
      const pais = String(m.pais || socMap.get(resolvedCode)?.pais || 'Colombia').trim();

      const matched = matchExistingAccount(
        existingAccounts,
        resolvedName,
        banco,
        numeroCuenta,
        cuentaMayor00,
        resolvedCode
      );

      accounts.push({
        codigoSociedad: resolvedCode,
        sociedadNombre: resolvedName,
        banco: (banco || matched?.banco || `Banco ${idx + 1}`).slice(0, 120),
        numeroCuenta: (numeroCuenta || matched?.numeroCuenta || cuentaMayor00 || `CTA-${idx + 1}`).slice(0, 80),
        productoCuenta: productoCuenta.slice(0, 140),
        tipoCuenta,
        moneda,
        pais,
        raizContable,
        cuentaMayor00,
        cuentaMayor01,
        cuentaMayor02,
        matchedAccountId: matched?.id || null,
      });
    });
  };

  let handledSocietiesSheet = false;
  let handledAccountsSheet = false;

  workbook.SheetNames.forEach((name) => {
    const norm = normalizeHeader(name);
    const sheet = workbook.Sheets[name];
    if (!sheet) return;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (rows.length === 0) return;

    if (norm.includes('sociedad') && !norm.includes('cuenta')) {
      parseSocRows(rows);
      handledSocietiesSheet = true;
    } else if (norm.includes('cuenta') || norm.includes('banco')) {
      parseAccRows(rows);
      handledAccountsSheet = true;
    }
  });

  // Fallback for single-sheet or non-standard sheet names
  if (!handledSocietiesSheet && !handledAccountsSheet && workbook.SheetNames.length > 0) {
    const firstRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[workbook.SheetNames[0]],
      { defval: '' }
    );
    parseAccRows(firstRows);
    if (workbook.SheetNames.length >= 2) {
      const secondRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[workbook.SheetNames[1]],
        { defval: '' }
      );
      parseSocRows(secondRows);
    }
  }

  if (socMap.size === 0 && accounts.length === 0) {
    warnings.push(
      'No se detectaron columnas válidas de Sociedades ni Cuentas Bancarias. Descarga la plantilla SAP de Catálogo.'
    );
  }

  return {
    societies: Array.from(socMap.values()),
    accounts,
    warnings,
    sheetNames: workbook.SheetNames,
  };
};

// ============================================================================
// SAP PARSER 2: Balance de Saldos SAP (00 / 01 / 02) agrupado por Sociedad + Raíz
// ============================================================================

export interface ParsedSapBalanceGroup {
  groupKey: string;
  sociedadCodigo: string;
  sociedadNombre: string;
  raizContable: string;
  cuentaMayor00: string;
  cuentaMayor01: string;
  cuentaMayor02: string;
  denominacionPrincipal: string;
  bancoInferido: string;
  moneda: BankCurrency;
  mes: string;
  fechaCorte: string;
  saldoCuenta00: number;
  saldoCuenta01: number;
  saldoCuenta02: number;
  saldoLibrosTotal: number;
  saldoExtractoPreload: number;
  matchedAccountId: string | null;
  matchedAccountLabel?: string;
  willAutoCreateAccount: boolean;
  willAutoCreateSociety: boolean;
}

export interface ParsedSapBalanceResult {
  rawRows: SapBalanceRow[];
  groups: ParsedSapBalanceGroup[];
  warnings: string[];
  sheetName: string;
}

const inferBankNameFromGlDescription = (denominacion: string, raiz: string): string => {
  const clean = String(denominacion || '').trim();
  if (!clean) return `BANCO CTA ${raiz}`;
  const stripped = clean
    .replace(/\b(ingresos?|egresos?|pendientes?|por conciliar|por liquidar|principal|saldo|cta\.?|cuenta)\b/gi, '')
    .replace(/\((00|01|02)\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (stripped || clean).toUpperCase().slice(0, 90);
};

export const parseSapBalance000102File = async (
  file: File,
  defaultMonth: string,
  existingSocieties: BankSociety[],
  existingAccounts: BankAccount[]
): Promise<ParsedSapBalanceResult> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const warnings: string[] = [];

  let chosenSheet = workbook.SheetNames[0] || '';
  if (workbook.SheetNames.length > 1) {
    const found = workbook.SheetNames.find((n) => {
      const norm = normalizeHeader(n);
      return norm.includes('balance') || norm.includes('saldo') || norm.includes('00');
    });
    if (found) chosenSheet = found;
  }

  const sheet = workbook.Sheets[chosenSheet];
  const rows = sheet
    ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    : [];

  const socByCode = new Map<string, BankSociety>();
  const socByName = new Map<string, BankSociety>();
  existingSocieties.forEach((s) => {
    socByCode.set(s.codigoSociedad.trim().toUpperCase(), s);
    socByName.set(normalizeCompanyKey(s.nombre), s);
  });

  const rawRows: SapBalanceRow[] = [];
  const groupMap = new Map<string, ParsedSapBalanceGroup>();

  rows.forEach((row, idx) => {
    const m: Record<string, unknown> = {};
    Object.entries(row).forEach(([k, v]) => {
      m[normalizeHeader(k)] = v;
    });

    const rawSoc = String(
      m.sociedad || m.codigosociedad || m.empresa || m.compania || m.soc || ''
    ).trim();
    const rawCuentaMayor = String(
      m.ctamayor ||
        m.cuentamayor ||
        m.cuentademayor ||
        m.cuentacontable ||
        m.cuenta ||
        m.glaccount ||
        ''
    ).trim();

    if (!rawSoc && !rawCuentaMayor) return;
    if (!rawCuentaMayor) {
      warnings.push(`Fila ${idx + 2}: omitida porque falta Cta.mayor.`);
      return;
    }

    const parsedGl = extractSapAccountRoot(rawCuentaMayor);
    if (!parsedGl.cleanAccount) {
      warnings.push(`Fila ${idx + 2}: cuenta contable "${rawCuentaMayor}" inválida.`);
      return;
    }
    if (!parsedGl.hasStandardSuffix) {
      warnings.push(
        `Fila ${idx + 2}: la cuenta ${parsedGl.cleanAccount} no termina en 00, 01 o 02; se asignó como subcuenta 00.`
      );
    }

    const rawSaldo =
      m.nuevosaldo ??
      m.saldo ??
      m.saldofinal ??
      m.saldolibros ??
      m.importe ??
      m.valor ??
      m.monto;
    if (rawSaldo === undefined || String(rawSaldo).trim() === '') {
      warnings.push(`Fila ${idx + 2}: sin "Nuevo Saldo" numérico para cuenta ${parsedGl.cleanAccount}.`);
      return;
    }

    const nuevoSaldo = Math.round(parseNumericValue(rawSaldo) * 100) / 100;
    const denominacion = String(
      m.denominacioncuenta ||
        m.denominacion ||
        m.descripcioncuenta ||
        m.nombrecuenta ||
        m.descripcion ||
        m.texto ||
        `Cuenta ${parsedGl.cleanAccount}`
    ).trim();
    const mes = String(m.mes || m.periodo || defaultMonth || 'Octubre 2026').trim();
    const fechaCorte = formatDateValue(
      m.fechacorte || m.fecha || m.corte,
      inferCutoffDateFromMonth(mes)
    );

    const socCodeCandidate = rawSoc.toUpperCase();
    const matchedSoc =
      socByCode.get(socCodeCandidate) || socByName.get(normalizeCompanyKey(rawSoc)) || null;
    const sociedadCodigo = matchedSoc
      ? matchedSoc.codigoSociedad
      : socCodeCandidate || '1000';
    const rawSocName = String(m.nombresociedad || m.razonsocial || '').trim();
    const sociedadNombre = matchedSoc
      ? matchedSoc.nombre
      : rawSocName || (/^\d+$/.test(rawSoc) ? `Sociedad ${rawSoc}` : rawSoc || 'Sociedad SAP');

    const moneda = parseCurrencyValue(
      m.moneda || m.monedalocal || m.divisa || m.currency,
      matchedSoc?.moneda || 'COP'
    );

    rawRows.push({
      id: `sbal-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      sociedadCodigo,
      sociedadNombre,
      cuentaMayor: parsedGl.cleanAccount,
      raizContable: parsedGl.raiz,
      subcuentaTipo: parsedGl.subcuenta,
      denominacion: denominacion.slice(0, 180),
      nuevoSaldo,
      moneda,
      mes: mes.slice(0, 60),
      fechaCorte,
    });

    const groupKey = `${sociedadCodigo.toUpperCase()}::${parsedGl.raiz}::${mes}`;
    let group = groupMap.get(groupKey);
    if (!group) {
      const derived = deriveSapSubaccounts(parsedGl.cleanAccount);
      const matchedAcc = matchExistingAccount(
        existingAccounts,
        sociedadNombre,
        '',
        '',
        derived.cuentaMayor00,
        sociedadCodigo
      );
      group = {
        groupKey,
        sociedadCodigo,
        sociedadNombre: matchedAcc?.sociedad || sociedadNombre,
        raizContable: derived.raizContable,
        cuentaMayor00: derived.cuentaMayor00,
        cuentaMayor01: derived.cuentaMayor01,
        cuentaMayor02: derived.cuentaMayor02,
        denominacionPrincipal: denominacion,
        bancoInferido:
          matchedAcc?.banco || inferBankNameFromGlDescription(denominacion, derived.raizContable),
        moneda: matchedAcc?.moneda || moneda,
        mes,
        fechaCorte,
        saldoCuenta00: 0,
        saldoCuenta01: 0,
        saldoCuenta02: 0,
        saldoLibrosTotal: 0,
        saldoExtractoPreload: 0,
        matchedAccountId: matchedAcc?.id || null,
        matchedAccountLabel: matchedAcc
          ? `${matchedAcc.sociedad} · ${matchedAcc.banco} (${matchedAcc.numeroCuenta})`
          : undefined,
        willAutoCreateAccount: !matchedAcc,
        willAutoCreateSociety: !matchedSoc,
      };
      groupMap.set(groupKey, group);
    }

    if (parsedGl.subcuenta === '00') {
      group.saldoCuenta00 = Math.round((group.saldoCuenta00 + nuevoSaldo) * 100) / 100;
      if (denominacion) {
        group.denominacionPrincipal = denominacion;
        if (!group.matchedAccountId) {
          group.bancoInferido = inferBankNameFromGlDescription(denominacion, group.raizContable);
        }
      }
    } else if (parsedGl.subcuenta === '01') {
      group.saldoCuenta01 = Math.round((group.saldoCuenta01 + nuevoSaldo) * 100) / 100;
    } else {
      group.saldoCuenta02 = Math.round((group.saldoCuenta02 + nuevoSaldo) * 100) / 100;
    }

    group.saldoLibrosTotal =
      Math.round((group.saldoCuenta00 + group.saldoCuenta01 + group.saldoCuenta02) * 100) / 100;
    group.saldoExtractoPreload = group.saldoCuenta00;
  });

  return {
    rawRows,
    groups: Array.from(groupMap.values()),
    warnings,
    sheetName: chosenSheet,
  };
};

// ============================================================================
// SAP PARSER 3: Partidas Abiertas SAP (FBL3N) con Clasificación Automática
// ============================================================================

export interface ParsedSapOpenItemRow {
  rowIndex: number;
  sociedadCodigo: string;
  sociedadNombre: string;
  cuentaMayor: string;
  raizContable: string;
  subcuentaTipo: SapSubaccountType;
  claveRef1: string;
  claveRef3: string;
  referencia: string;
  numeroDocumento: string;
  claseDocumento: string;
  fechaDocumento: string;
  fechaContabilizacion: string;
  importeMonedaLocal: number;
  monedaLocal: BankCurrency;
  texto: string;
  mes: string;
  seccionAuto: BankReconcilingSection;
  matchedAccountId: string | null;
  matchedAccountLabel?: string;
}

export interface ParsedSapFbl3nResult {
  items: ParsedSapOpenItemRow[];
  warnings: string[];
  sheetName: string;
}

export const parseSapFbl3nOpenItemsFile = async (
  file: File,
  defaultMonth: string,
  existingSocieties: BankSociety[],
  existingAccounts: BankAccount[],
  fallbackAccount?: BankAccount | null
): Promise<ParsedSapFbl3nResult> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const warnings: string[] = [];

  let chosenSheet = workbook.SheetNames[0] || '';
  if (workbook.SheetNames.length > 1) {
    const found = workbook.SheetNames.find((n) => {
      const norm = normalizeHeader(n);
      return norm.includes('fbl3n') || norm.includes('partida') || norm.includes('abierta');
    });
    if (found) chosenSheet = found;
  }

  const sheet = workbook.Sheets[chosenSheet];
  const rows = sheet
    ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    : [];

  const socByCode = new Map<string, BankSociety>();
  const socByName = new Map<string, BankSociety>();
  existingSocieties.forEach((s) => {
    socByCode.set(s.codigoSociedad.trim().toUpperCase(), s);
    socByName.set(normalizeCompanyKey(s.nombre), s);
  });

  const items: ParsedSapOpenItemRow[] = [];

  rows.forEach((row, idx) => {
    const m: Record<string, unknown> = {};
    Object.entries(row).forEach(([k, v]) => {
      m[normalizeHeader(k)] = v;
    });

    const rawSoc = String(
      m.sociedad || m.codigosociedad || m.empresa || fallbackAccount?.codigoSociedad || ''
    ).trim();
    const rawCuentaMayor = String(
      m.cuentademayor ||
        m.ctamayor ||
        m.cuentamayor ||
        m.cuentacontable ||
        m.cuenta ||
        fallbackAccount?.cuentaMayor01 ||
        fallbackAccount?.codigoContable ||
        ''
    ).trim();

    const rawImporte =
      m.importeenmonedalocal ??
      m.importemonedalocal ??
      m.importeml ??
      m.importe ??
      m.valor ??
      m.monto;

    if (!rawCuentaMayor && (rawImporte === undefined || String(rawImporte).trim() === '')) {
      return;
    }

    const importeMonedaLocal = Math.round(parseNumericValue(rawImporte) * 100) / 100;
    if (Math.abs(importeMonedaLocal) < 0.001) {
      return;
    }

    const parsedGl = extractSapAccountRoot(rawCuentaMayor);
    const socCodeCandidate = rawSoc.toUpperCase();
    const matchedSoc =
      socByCode.get(socCodeCandidate) || socByName.get(normalizeCompanyKey(rawSoc)) || null;
    const sociedadCodigo = matchedSoc
      ? matchedSoc.codigoSociedad
      : socCodeCandidate || fallbackAccount?.codigoSociedad || '1000';
    const sociedadNombre = matchedSoc
      ? matchedSoc.nombre
      : /^\d+$/.test(rawSoc)
      ? fallbackAccount?.sociedad || `Sociedad ${rawSoc}`
      : rawSoc || fallbackAccount?.sociedad || 'Sociedad SAP';

    const matchedAcc =
      matchExistingAccount(
        existingAccounts,
        sociedadNombre,
        '',
        '',
        parsedGl.cleanAccount,
        sociedadCodigo
      ) || null;

    const mes = String(m.mes || m.periodo || defaultMonth || 'Octubre 2026').trim();
    const fallbackCutoff = inferCutoffDateFromMonth(mes);
    const fechaDocumento = formatDateValue(
      m.fechadedocumento || m.fechadocumento || m.fechadoc || m.fecha,
      fallbackCutoff
    );
    const fechaContabilizacion = formatDateValue(
      m.fecontabilizacion || m.fechacontabilizacion || m.fecontab || m.fechacontable,
      fechaDocumento
    );

    const claseDocumento = String(
      m.clasededocumento || m.clasedocumento || m.clasedoc || m.clase || 'AB'
    )
      .trim()
      .toUpperCase()
      .slice(0, 12);
    const numeroDocumento = String(
      m.ndocumento ||
        m.nodocumento ||
        m.numdocumento ||
        m.numerodocumento ||
        m.documento ||
        m.dto ||
        `DOC-${idx + 1}`
    ).trim();
    const referencia = String(m.referencia || m.ref || numeroDocumento).trim();
    const claveRef1 = String(m.clavereferencia1 || m.claveref1 || m.ref1 || '').trim();
    const claveRef3 = String(
      m.clavereferencia3 || m.claveref3 || m.ref3 || m.tercero || m.quienpago || ''
    ).trim();
    const texto = String(
      m.texto || m.concepto || m.descripcion || m.detalle || m.asignacion || 'Partida abierta SAP'
    ).trim();

    const monedaLocal = parseCurrencyValue(
      m.monedalocal || m.moneda || m.divisa || m.ml,
      matchedAcc?.moneda || matchedSoc?.moneda || 'COP'
    );

    const seccionAuto = classifySapOpenItem(claseDocumento, importeMonedaLocal);

    items.push({
      rowIndex: idx + 2,
      sociedadCodigo,
      sociedadNombre: matchedAcc?.sociedad || sociedadNombre,
      cuentaMayor: parsedGl.cleanAccount,
      raizContable: parsedGl.raiz,
      subcuentaTipo: parsedGl.subcuenta,
      claveRef1: claveRef1.slice(0, 80),
      claveRef3: claveRef3.slice(0, 120),
      referencia: referencia.slice(0, 80),
      numeroDocumento: numeroDocumento.slice(0, 80),
      claseDocumento,
      fechaDocumento,
      fechaContabilizacion,
      importeMonedaLocal,
      monedaLocal,
      texto: texto.slice(0, 220),
      mes: mes.slice(0, 60),
      seccionAuto,
      matchedAccountId: matchedAcc?.id || null,
      matchedAccountLabel: matchedAcc
        ? `${matchedAcc.sociedad} · ${matchedAcc.banco} (${matchedAcc.cuentaMayor00 || matchedAcc.numeroCuenta})`
        : undefined,
    });
  });

  if (items.length === 0) {
    warnings.push(
      'No se encontraron partidas abiertas con importe numérico. Verifica que existan columnas "Cuenta de mayor", "Clase de documento" e "Importe en moneda local".'
    );
  }

  return {
    items,
    warnings,
    sheetName: chosenSheet,
  };
};

// ============================================================================
// SAP DOWNLOADABLE EXCEL TEMPLATES
// ============================================================================

export const downloadSapCatalogTemplate = (
  societies: BankSociety[],
  accounts: BankAccount[]
) => {
  const wb = XLSX.utils.book_new();

  const socRows =
    societies.length > 0
      ? societies.map((s) => ({
          Codigo_Sociedad: s.codigoSociedad,
          Nombre: s.nombre,
          Pais: s.pais,
          Moneda: s.moneda,
          NIT: s.nit || '',
        }))
      : [
          {
            Codigo_Sociedad: '1000',
            Nombre: 'Premex S.A.S.',
            Pais: 'Colombia',
            Moneda: 'COP',
            NIT: '890903865-1',
          },
        ];

  const accRows =
    accounts.length > 0
      ? accounts.map((a) => ({
          Codigo_Sociedad: a.codigoSociedad || '1000',
          Nombre_Sociedad: a.sociedad,
          Banco: a.banco,
          Numero_Cuenta: a.numeroCuenta,
          Tipo_Cuenta: a.tipoCuenta,
          Producto: a.productoCuenta || '',
          Moneda: a.moneda,
          Pais: a.pais,
          Cuenta_Mayor_00: a.cuentaMayor00 || a.codigoContable || '',
          Cuenta_Mayor_01: a.cuentaMayor01 || '',
          Cuenta_Mayor_02: a.cuentaMayor02 || '',
        }))
      : [
          {
            Codigo_Sociedad: '1000',
            Nombre_Sociedad: 'Premex S.A.S.',
            Banco: 'BANCO BANCOLOMBIA S.A',
            Numero_Cuenta: '06411-9',
            Tipo_Cuenta: 'Fondo de Inversión',
            Producto: 'Fondo de Valores RENTA LIQUIDEZ-1',
            Moneda: 'COP',
            Pais: 'Colombia',
            Cuenta_Mayor_00: '8001502800',
            Cuenta_Mayor_01: '8001502801',
            Cuenta_Mayor_02: '8001502802',
          },
        ];

  const wsSoc = XLSX.utils.json_to_sheet(socRows);
  wsSoc['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 16 }, { wch: 10 }, { wch: 18 }];
  const wsAcc = XLSX.utils.json_to_sheet(accRows);
  wsAcc['!cols'] = [
    { wch: 16 },
    { wch: 24 },
    { wch: 26 },
    { wch: 20 },
    { wch: 18 },
    { wch: 30 },
    { wch: 10 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
  ];

  XLSX.utils.book_append_sheet(wb, wsSoc, 'Sociedades');
  XLSX.utils.book_append_sheet(wb, wsAcc, 'Cuentas_Bancarias');
  XLSX.writeFile(wb, 'Plantilla_Catalogo_Sociedades_Cuentas_SAP.xlsx');
};

export const downloadSapBalanceTemplate = (
  accounts: BankAccount[],
  selectedMonth: string
) => {
  const wb = XLSX.utils.book_new();
  const sampleMonth = selectedMonth === 'ALL' ? 'Octubre 2026' : selectedMonth;

  const rows: Record<string, unknown>[] = [];
  const sourceAccs = accounts.slice(0, 4);
  if (sourceAccs.length > 0) {
    sourceAccs.forEach((a) => {
      const derived = deriveSapSubaccounts(a.cuentaMayor00 || a.codigoContable || '1110050100');
      const soc = a.codigoSociedad || '1000';
      rows.push(
        {
          Sociedad: soc,
          'Cta.mayor': a.cuentaMayor00 || derived.cuentaMayor00,
          'Denominación cuenta': `${a.banco} ${a.numeroCuenta} (00)`,
          'Nuevo Saldo': a.saldoCuenta00 ?? a.saldoFinalExtracto,
          Moneda: a.moneda,
          Mes: sampleMonth,
        },
        {
          Sociedad: soc,
          'Cta.mayor': a.cuentaMayor01 || derived.cuentaMayor01,
          'Denominación cuenta': `${a.banco} INGRESOS PENDIENTES (01)`,
          'Nuevo Saldo': a.saldoCuenta01 ?? 0,
          Moneda: a.moneda,
          Mes: sampleMonth,
        },
        {
          Sociedad: soc,
          'Cta.mayor': a.cuentaMayor02 || derived.cuentaMayor02,
          'Denominación cuenta': `${a.banco} EGRESOS PENDIENTES (02)`,
          'Nuevo Saldo': a.saldoCuenta02 ?? 0,
          Moneda: a.moneda,
          Mes: sampleMonth,
        }
      );
    });
  } else {
    rows.push(
      {
        Sociedad: '1000',
        'Cta.mayor': '8001502800',
        'Denominación cuenta': 'BANCO BANCOLOMBIA RENTA LIQUIDEZ (00)',
        'Nuevo Saldo': 19206707,
        Moneda: 'COP',
        Mes: sampleMonth,
      },
      {
        Sociedad: '1000',
        'Cta.mayor': '8001502801',
        'Denominación cuenta': 'BANCO BANCOLOMBIA INGRESOS PEND (01)',
        'Nuevo Saldo': 0,
        Moneda: 'COP',
        Mes: sampleMonth,
      },
      {
        Sociedad: '1000',
        'Cta.mayor': '8001502802',
        'Denominación cuenta': 'BANCO BANCOLOMBIA EGRESOS PEND (02)',
        'Nuevo Saldo': -155735,
        Moneda: 'COP',
        Mes: sampleMonth,
      }
    );
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 44 }, { wch: 18 }, { wch: 10 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Balance_SAP_00_01_02');
  XLSX.writeFile(wb, `Plantilla_Balance_SAP_00_01_02_${sampleMonth.replace(/\s+/g, '_')}.xlsx`);
};

export const downloadSapFbl3nTemplate = (
  accounts: BankAccount[],
  selectedMonth: string
) => {
  const wb = XLSX.utils.book_new();
  const sampleMonth = selectedMonth === 'ALL' ? 'Octubre 2026' : selectedMonth;
  const cutoff = inferCutoffDateFromMonth(sampleMonth);
  const first = accounts[0];
  const soc = first?.codigoSociedad || '1000';
  const gl01 = first?.cuentaMayor01 || '1110050101';
  const gl02 = first?.cuentaMayor02 || '1110050102';
  const curr = first?.moneda || 'COP';

  const rows = [
    {
      Sociedad: soc,
      'Cuenta de mayor': gl02,
      'Clave referencia 1': 'REND-10',
      'Clave referencia 3': 'FIDUCIARIA BANCOLOMBIA',
      Referencia: '6000020548',
      'Nº documento': '6000020548',
      'Clase de documento': 'AB',
      'Fecha de documento': cutoff,
      'Fe.contabilización': cutoff,
      'Importe en moneda local': -155735,
      'Moneda local': curr,
      Texto: 'RENDIMIENTOS PENDIENTES DE CONTABILIZAR',
    },
    {
      Sociedad: soc,
      'Cuenta de mayor': gl01,
      'Clave referencia 1': 'CHQ-CANJE',
      'Clave referencia 3': 'AGROPECUARIA EL NORTE S.A.',
      Referencia: 'RC-4419',
      'Nº documento': '1400084419',
      'Clase de documento': 'CB',
      'Fecha de documento': cutoff,
      'Fe.contabilización': cutoff,
      'Importe en moneda local': 16900000,
      'Moneda local': curr,
      Texto: 'CONSIGNACION PENDIENTE EN CANJE',
    },
    {
      Sociedad: soc,
      'Cuenta de mayor': gl02,
      'Clave referencia 1': 'PAGO-9041',
      'Clave referencia 3': 'EMPAQUES INDUSTRIALES DE COLOMBIA',
      Referencia: 'CE-9041',
      'Nº documento': '1500090411',
      'Clase de documento': 'CB',
      'Fecha de documento': cutoff,
      'Fe.contabilización': cutoff,
      'Importe en moneda local': -11450000,
      'Moneda local': curr,
      Texto: 'TRANSFERENCIA ACH EN TRANSITO',
    },
    {
      Sociedad: soc,
      'Cuenta de mayor': gl01,
      'Clave referencia 1': 'GMF-10',
      'Clave referencia 3': 'BANCOLOMBIA S.A.',
      Referencia: 'ND-GMF10',
      'Nº documento': '1900021104',
      'Clase de documento': 'KR',
      'Fecha de documento': cutoff,
      'Fe.contabilización': cutoff,
      'Importe en moneda local': 485000,
      'Moneda local': curr,
      Texto: 'IMPUESTO 4X1000 NO CONTABILIZADO',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 11 },
    { wch: 16 },
    { wch: 16 },
    { wch: 28 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 20 },
    { wch: 12 },
    { wch: 38 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Partidas_Abiertas_FBL3N');
  XLSX.writeFile(wb, `Plantilla_Partidas_Abiertas_FBL3N_${sampleMonth.replace(/\s+/g, '_')}.xlsx`);
};

// ============================================================================
// OPTIONAL BILATERAL STATEMENT & LEDGER IMPORTER (for Cruce Bilateral)
// ============================================================================

export interface ParsedBankImportResult {
  statementItems: BankStatementItem[];
  ledgerItems: BookLedgerItem[];
  warnings: string[];
  detectedSheets: string[];
}

export const parseBankExcelFile = async (
  file: File,
  targetAccountId: string,
  defaultMonth: string,
  forcedSide?: 'extracto' | 'libros' | 'auto'
): Promise<ParsedBankImportResult> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const warnings: string[] = [];
  const statementItems: BankStatementItem[] = [];
  const ledgerItems: BookLedgerItem[] = [];
  const detectedSheets = workbook.SheetNames;

  const parseSheetRows = (sheetName: string, side: 'extracto' | 'libros') => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (rows.length === 0) return;

    rows.forEach((row, idx) => {
      const map: Record<string, unknown> = {};
      Object.entries(row).forEach(([k, v]) => {
        map[normalizeHeader(k)] = v;
      });

      const fecha = formatDateValue(
        map.fecha || map.date || map.fechamovimiento || map.fechacontable || map.fechavalor
      );
      const referencia = String(
        map.referencia ||
          map.comprobante ||
          map.documento ||
          map.dto ||
          map.numdocumento ||
          map.ref ||
          map.cheque ||
          `DOC-${idx + 1}`
      ).trim();
      const descripcion = String(
        map.descripcion ||
          map.concepto ||
          map.detalle ||
          map.glosa ||
          map.description ||
          'Movimiento importado'
      ).trim();
      const tercero = String(
        map.tercero || map.beneficiario || map.cliente || map.proveedor || map.nombre || ''
      ).trim();
      const mes = String(map.mes || map.periodo || defaultMonth || 'Octubre 2026').trim();

      const rawDebito = parseNumericValue(
        map.debito ?? map.debitos ?? map.cargo ?? map.cargos ?? map.retiro ?? map.salida ?? 0
      );
      const rawCredito = parseNumericValue(
        map.credito ?? map.creditos ?? map.abono ?? map.abonos ?? map.deposito ?? map.entrada ?? 0
      );
      const rawValor = parseNumericValue(map.valor ?? map.monto ?? map.importe ?? map.amount ?? 0);
      const rawTipo = String(map.tipo || map.naturaleza || map.type || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      let tipo: 'CREDITO' | 'DEBITO';
      let valor = 0;

      if (Math.abs(rawDebito) > 0.001 && Math.abs(rawCredito) <= 0.001) {
        tipo = 'DEBITO';
        valor = Math.abs(rawDebito);
      } else if (Math.abs(rawCredito) > 0.001 && Math.abs(rawDebito) <= 0.001) {
        tipo = 'CREDITO';
        valor = Math.abs(rawCredito);
      } else if (Math.abs(rawValor) > 0.001) {
        valor = Math.abs(rawValor);
        if (rawTipo.includes('CRED') || rawTipo.includes('ABON') || rawTipo === 'C' || rawTipo === 'CR') {
          tipo = 'CREDITO';
        } else if (rawTipo.includes('DEB') || rawTipo.includes('CARG') || rawTipo === 'D' || rawTipo === 'DB') {
          tipo = 'DEBITO';
        } else if (side === 'extracto') {
          tipo = rawValor >= 0 ? 'CREDITO' : 'DEBITO';
        } else {
          tipo = rawValor >= 0 ? 'DEBITO' : 'CREDITO';
        }
      } else {
        return;
      }

      if (side === 'extracto') {
        statementItems.push({
          id: `bs-imp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
          cuentaId: targetAccountId,
          fecha,
          referencia: referencia.slice(0, 80),
          descripcion: descripcion.slice(0, 180),
          tipo,
          valor: Math.round(valor * 100) / 100,
          mes: mes.slice(0, 60),
          origenCarga: 'extracto_completo',
        });
      } else {
        ledgerItems.push({
          id: `bl-imp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
          cuentaId: targetAccountId,
          fecha,
          comprobante: referencia.slice(0, 80),
          tercero: (tercero || 'Tercero general').slice(0, 120),
          descripcion: descripcion.slice(0, 180),
          tipo,
          valor: Math.round(valor * 100) / 100,
          mes: mes.slice(0, 60),
          origenCarga: 'extracto_completo',
        });
      }
    });
  };

  if (forcedSide === 'extracto' || forcedSide === 'libros') {
    parseSheetRows(workbook.SheetNames[0], forcedSide);
  } else {
    let matchedAnySheet = false;
    workbook.SheetNames.forEach((name) => {
      const norm = normalizeHeader(name);
      if (norm.includes('extracto') || norm.includes('banco') || norm.includes('statement')) {
        parseSheetRows(name, 'extracto');
        matchedAnySheet = true;
      } else if (
        norm.includes('auxiliar') ||
        norm.includes('libro') ||
        norm.includes('contab') ||
        norm.includes('ledger')
      ) {
        parseSheetRows(name, 'libros');
        matchedAnySheet = true;
      }
    });

    if (!matchedAnySheet) {
      if (workbook.SheetNames.length >= 2) {
        parseSheetRows(workbook.SheetNames[0], 'extracto');
        parseSheetRows(workbook.SheetNames[1], 'libros');
        warnings.push(
          `Se interpretó la hoja "${workbook.SheetNames[0]}" como Extracto Bancario y "${workbook.SheetNames[1]}" como Auxiliar Contable.`
        );
      } else if (workbook.SheetNames.length === 1) {
        parseSheetRows(workbook.SheetNames[0], 'extracto');
        warnings.push(
          `El archivo contiene 1 hoja ("${workbook.SheetNames[0]}"). Se cargó como Extracto Bancario.`
        );
      }
    }
  }

  return { statementItems, ledgerItems, warnings, detectedSheets };
};

export const downloadBankExcelTemplate = (account?: BankAccount | null) => {
  const wb = XLSX.utils.book_new();
  const sampleMonth = 'Octubre 2026';

  const extractoRows = [
    {
      Fecha: '2026-10-05',
      Referencia: 'TR-90124',
      Descripcion: 'ABONO CLIENTE DISTRIBUIDORA CENTRAL',
      Tipo: 'CREDITO',
      Valor: 25400,
      Mes: sampleMonth,
    },
    {
      Fecha: '2026-10-10',
      Referencia: 'PAG-4421',
      Descripcion: 'TRANSFERENCIA PROVEEDOR MATERIA PRIMA',
      Tipo: 'DEBITO',
      Valor: 11200,
      Mes: sampleMonth,
    },
  ];

  const librosRows = [
    {
      Fecha: '2026-10-05',
      Comprobante: 'TR-90124',
      Tercero: 'Distribuidora Central S.A.',
      Descripcion: 'Recaudo factura cartera',
      Tipo: 'DEBITO',
      Valor: 25400,
      Mes: sampleMonth,
    },
    {
      Fecha: '2026-10-10',
      Comprobante: 'PAG-4421',
      Tercero: 'Químicos Industriales Ltda.',
      Descripcion: 'Pago orden de compra #882',
      Tipo: 'CREDITO',
      Valor: 11200,
      Mes: sampleMonth,
    },
  ];

  const wsExtracto = XLSX.utils.json_to_sheet(extractoRows);
  wsExtracto['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 42 }, { wch: 12 }, { wch: 16 }, { wch: 18 }];
  const wsLibros = XLSX.utils.json_to_sheet(librosRows);
  wsLibros['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 28 }, { wch: 36 }, { wch: 12 }, { wch: 16 }, { wch: 18 }];

  XLSX.utils.book_append_sheet(wb, wsExtracto, 'Extracto Bancario');
  XLSX.utils.book_append_sheet(wb, wsLibros, 'Auxiliar Contable');

  const safeBanco = (account?.banco || 'Premex').replace(/[^a-zA-Z0-9_-]+/g, '_');
  XLSX.writeFile(wb, `Plantilla_Cruce_Bilateral_${safeBanco}.xlsx`);
};

export const exportBankReconciliationExcel = (
  summary: BankReconciliationSummary,
  selectedMonth: string,
  statementItems: BankStatementItem[],
  ledgerItems: BookLedgerItem[],
  matches: BankMatchGroup[]
) => {
  if (!summary.account) return;
  const acc = summary.account;
  const wb = XLSX.utils.book_new();
  const bankMap = new Map(statementItems.map((b) => [b.id, b]));
  const ledgerMap = new Map(ledgerItems.map((l) => [l.id, l]));
  const accountMatches = matches.filter((m) => m.cuentaId === acc.id);

  const matchedRows = accountMatches.map((m, idx) => {
    const bList = m.bankItemIds.map((id) => bankMap.get(id)).filter(Boolean) as BankStatementItem[];
    const lList = m.ledgerItemIds.map((id) => ledgerMap.get(id)).filter(Boolean) as BookLedgerItem[];
    return {
      '#': idx + 1,
      Metodo:
        m.method === 'automatico_ref'
          ? 'Automático (Ref)'
          : m.method === 'automatico_valor'
          ? 'Automático (Valor/Fecha)'
          : 'Manual',
      Referencias_Banco: bList.map((b) => b.referencia).join(', '),
      Valor_Banco: bList.reduce((s, b) => s + (b.tipo === 'CREDITO' ? b.valor : -b.valor), 0),
      Comprobantes_Libros: lList.map((l) => l.comprobante).join(', '),
      Terceros: lList.map((l) => l.tercero).join(', '),
      Valor_Libros: lList.reduce((s, l) => s + (l.tipo === 'DEBITO' ? l.valor : -l.valor), 0),
      Nota: m.note || '',
    };
  });

  const wsMatched = XLSX.utils.json_to_sheet(
    matchedRows.length > 0 ? matchedRows : [{ Estado: 'Sin cruces bilaterales registrados' }]
  );
  XLSX.utils.book_append_sheet(wb, wsMatched, 'Cruce_Bilateral');
  XLSX.writeFile(
    wb,
    `Cruce_Bilateral_${acc.banco.replace(/[^a-zA-Z0-9_-]+/g, '_')}_${selectedMonth.replace(/\s+/g, '_')}.xlsx`
  );
};
