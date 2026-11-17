import {
  BankAccount,
  BankCurrency,
  BankMatchGroup,
  BankPendingCategory,
  BankReconciliationSummary,
  BankStatementItem,
  BookLedgerItem,
} from '../types';

/**
 * Signed cash impact on bank balance:
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
  const formatted = new Intl.NumberFormat('en-US', {
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

export const DEFAULT_PENDING_CATEGORY_LABEL: Record<BankPendingCategory, string> = {
  deposito_transito: 'Depósito en tránsito',
  cheque_transito: 'Cheque / Pago en tránsito',
  nota_debito: 'Nota débito / Comisión bancaria',
  nota_credito: 'Nota crédito / Rendimiento',
  por_identificar: 'Partida por identificar',
};

export const inferPendingCategoryForBank = (
  item: BankStatementItem
): BankPendingCategory => {
  if (item.categoriaPendiente) return item.categoriaPendiente;
  return item.tipo === 'CREDITO' ? 'nota_credito' : 'nota_debito';
};

export const inferPendingCategoryForLedger = (
  item: BookLedgerItem
): BankPendingCategory => {
  if (item.categoriaPendiente) return item.categoriaPendiente;
  return item.tipo === 'DEBITO' ? 'deposito_transito' : 'cheque_transito';
};

/**
 * Computes full reconciliation metrics and formal bridge (Cuadre Bancario)
 * for a specific corporate bank account & period.
 */
export const computeBankReconciliationSummary = (
  account: BankAccount | null,
  statementItems: BankStatementItem[],
  ledgerItems: BookLedgerItem[],
  matches: BankMatchGroup[],
  selectedMonth: string
): BankReconciliationSummary => {
  const accountId = account?.id || '';
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

  // Reconciling items on Bank Statement side (items recorded in Books, not yet cleared in Bank)
  const depositosEnTransito = unmatchedLedgerItems
    .filter((i) => i.tipo === 'DEBITO')
    .reduce((acc, i) => acc + Math.abs(Number(i.valor) || 0), 0);

  const chequesEnTransito = unmatchedLedgerItems
    .filter((i) => i.tipo === 'CREDITO')
    .reduce((acc, i) => acc + Math.abs(Number(i.valor) || 0), 0);

  // Reconciling items on Books side (items in Bank Statement, not yet recorded in Books)
  const notasCreditoNoContabilizadas = unmatchedBankItems
    .filter((i) => i.tipo === 'CREDITO')
    .reduce((acc, i) => acc + Math.abs(Number(i.valor) || 0), 0);

  const notasDebitoNoContabilizadas = unmatchedBankItems
    .filter((i) => i.tipo === 'DEBITO')
    .reduce((acc, i) => acc + Math.abs(Number(i.valor) || 0), 0);

  const saldoExtracto = Number(account?.saldoFinalExtracto) || 0;
  const saldoLibros = Number(account?.saldoFinalLibros) || 0;

  const saldoConciliadoExtracto =
    saldoExtracto + depositosEnTransito - chequesEnTransito;
  const saldoConciliadoLibros =
    saldoLibros + notasCreditoNoContabilizadas - notasDebitoNoContabilizadas;
  const diferenciaNeta =
    Math.round((saldoConciliadoExtracto - saldoConciliadoLibros) * 100) / 100;

  const totalItems = scopedBank.length + scopedLedger.length;
  const matchedTotal = matchedBankIds.size + matchedLedgerIds.size;
  const reconciledPct =
    totalItems > 0 ? Math.round((matchedTotal / totalItems) * 100) : 100;

  return {
    account,
    saldoExtracto,
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
    matchedBankIds,
    matchedLedgerIds,
  };
};

/**
 * Deterministic 2-pass auto-reconciliation matcher:
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
