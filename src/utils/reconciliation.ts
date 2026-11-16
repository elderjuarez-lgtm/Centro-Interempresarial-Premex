import {
  Movement,
  MatrixResult,
  MatrixCell,
  DifferenceRow,
  SymmetricMatrixResult,
  SymmetricMatrixCell,
  DocumentComparisonRow,
  DocumentReconciliationStatus,
  MovementDocStatus
} from '../types';
import { ORDERED_ENTITIES } from './demoData';

export const buildSymmetricMatrix = (
  customOrder: string[] = ORDERED_ENTITIES,
  movements: Movement[]
): SymmetricMatrixResult => {
  // Strictly use the configured entities list in its exact order
  const orderedList: string[] = [];
  const lookupMap = new Map<string, string>();
  customOrder.forEach((raw) => {
    const clean = raw.trim();
    if (!clean) return;
    const norm = clean.toLowerCase();
    if (!lookupMap.has(norm)) {
      lookupMap.set(norm, clean);
      orderedList.push(clean);
    }
  });

  const cxcGrid: Record<string, Record<string, SymmetricMatrixCell>> = {};
  const cxpGrid: Record<string, Record<string, SymmetricMatrixCell>> = {};
  let cxcGrandTotal = 0;
  let cxpGrandTotal = 0;

  // Pre-calculate sums by pair (sociedad, contraparte) only for configured entities
  const cxcMap: Record<string, { total: number; movs: Movement[] }> = {};
  const cxpMap: Record<string, { total: number; movs: Movement[] }> = {};

  movements.forEach((m) => {
    const soc = lookupMap.get(m.sociedad.trim().toLowerCase());
    const cp = lookupMap.get(m.contraparte.trim().toLowerCase());
    if (!soc || !cp) return;

    const key = `${soc}___${cp}`;
    if (m.tipo === 'CXC') {
      if (!cxcMap[key]) cxcMap[key] = { total: 0, movs: [] };
      cxcMap[key].total += m.valor;
      cxcMap[key].movs.push(m);
      cxcGrandTotal += m.valor;
    } else {
      if (!cxpMap[key]) cxpMap[key] = { total: 0, movs: [] };
      cxpMap[key].total += m.valor;
      cxpMap[key].movs.push(m);
      cxpGrandTotal += m.valor;
    }
  });

  // Build N x N matrices
  orderedList.forEach((soc) => {
    cxcGrid[soc] = {};
    cxpGrid[soc] = {};

    orderedList.forEach((cp) => {
      const isDiagonal = soc === cp;
      const cxcKey = `${soc}___${cp}`;
      const cxpMirrorKey = `${cp}___${soc}`; // What cp registered as CXP towards soc

      const cxcRecord = cxcMap[cxcKey];
      const cxpMirrorRecord = cxpMap[cxpMirrorKey];

      const cxcVal = cxcRecord ? Math.round((cxcRecord.total + Number.EPSILON) * 100) / 100 : 0;
      const cxpMirrorVal = cxpMirrorRecord ? Math.round((cxpMirrorRecord.total + Number.EPSILON) * 100) / 100 : 0;
      const cxcDiff = Math.abs(cxcVal - cxpMirrorVal);

      let cxcStatus: SymmetricMatrixCell['status'] = 'empty';
      if (isDiagonal) {
        cxcStatus = 'diagonal';
      } else if (cxcVal > 0) {
        if (cxpMirrorVal > 0 && cxcDiff < 1.01) {
          cxcStatus = 'reconciled'; // Green
        } else {
          cxcStatus = 'discrepancy'; // Yellow
        }
      }

      cxcGrid[soc][cp] = {
        sociedad: soc,
        contraparte: cp,
        valor: cxcVal,
        reciprocalValor: cxpMirrorVal,
        difference: cxcDiff,
        status: cxcStatus,
        count: cxcRecord ? cxcRecord.movs.length : 0,
        movimientos: cxcRecord ? cxcRecord.movs : [],
      };

      // Now for CXP: soc owes cp
      const cxpKey = `${soc}___${cp}`;
      const cxcMirrorKey = `${cp}___${soc}`; // What cp registered as CXC towards soc

      const cxpRecord = cxpMap[cxpKey];
      const cxcMirrorRecord = cxcMap[cxcMirrorKey];

      const cxpVal = cxpRecord ? Math.round((cxpRecord.total + Number.EPSILON) * 100) / 100 : 0;
      const cxcMirrorVal = cxcMirrorRecord ? Math.round((cxcMirrorRecord.total + Number.EPSILON) * 100) / 100 : 0;
      const cxpDiff = Math.abs(cxpVal - cxcMirrorVal);

      let cxpStatus: SymmetricMatrixCell['status'] = 'empty';
      if (isDiagonal) {
        cxpStatus = 'diagonal';
      } else if (cxpVal > 0) {
        if (cxcMirrorVal > 0 && cxpDiff < 1.01) {
          cxpStatus = 'reconciled'; // Green
        } else {
          cxpStatus = 'discrepancy'; // Yellow
        }
      }

      cxpGrid[soc][cp] = {
        sociedad: soc,
        contraparte: cp,
        valor: cxpVal,
        reciprocalValor: cxcMirrorVal,
        difference: cxpDiff,
        status: cxpStatus,
        count: cxpRecord ? cxpRecord.movs.length : 0,
        movimientos: cxpRecord ? cxpRecord.movs : [],
      };
    });
  });

  return {
    entities: orderedList,
    cxcGrid,
    cxpGrid,
    cxcGrandTotal: Math.round((cxcGrandTotal + Number.EPSILON) * 100) / 100,
    cxpGrandTotal: Math.round((cxpGrandTotal + Number.EPSILON) * 100) / 100,
  };
};

export const buildMatrix = (movements: Movement[], type: 'CXC' | 'CXP'): MatrixResult => {
  const filtered = movements.filter((m) => m.tipo === type);

  // Collect distinct societies and counterparties
  const societiesSet = new Set<string>();
  const counterpartiesSet = new Set<string>();

  filtered.forEach((m) => {
    societiesSet.add(m.sociedad);
    counterpartiesSet.add(m.contraparte);
  });

  const societies = Array.from(societiesSet).sort((a, b) => a.localeCompare(b));
  const counterparties = Array.from(counterpartiesSet).sort((a, b) => a.localeCompare(b));

  const grid: Record<string, Record<string, MatrixCell>> = {};
  const rowTotals: Record<string, number> = {};
  const colTotals: Record<string, number> = {};
  let grandTotal = 0;

  // Initialize grid and totals
  societies.forEach((soc) => {
    grid[soc] = {};
    rowTotals[soc] = 0;
    counterparties.forEach((cp) => {
      grid[soc][cp] = {
        sociedad: soc,
        contraparte: cp,
        valor: 0,
        count: 0,
        movimientos: [],
      };
    });
  });

  counterparties.forEach((cp) => {
    colTotals[cp] = 0;
  });

  // Populate grid
  filtered.forEach((m) => {
    const soc = m.sociedad;
    const cp = m.contraparte;

    if (!grid[soc]) {
      grid[soc] = {};
      rowTotals[soc] = 0;
    }

    if (!grid[soc][cp]) {
      grid[soc][cp] = {
        sociedad: soc,
        contraparte: cp,
        valor: 0,
        count: 0,
        movimientos: [],
      };
    }

    grid[soc][cp].valor += m.valor;
    grid[soc][cp].count += 1;
    grid[soc][cp].movimientos.push(m);

    rowTotals[soc] = (rowTotals[soc] || 0) + m.valor;
    colTotals[cp] = (colTotals[cp] || 0) + m.valor;
    grandTotal += m.valor;
  });

  // Round values
  societies.forEach((soc) => {
    rowTotals[soc] = Math.round((rowTotals[soc] + Number.EPSILON) * 100) / 100;
    counterparties.forEach((cp) => {
      if (grid[soc]?.[cp]) {
        grid[soc][cp].valor = Math.round((grid[soc][cp].valor + Number.EPSILON) * 100) / 100;
      }
    });
  });

  counterparties.forEach((cp) => {
    colTotals[cp] = Math.round((colTotals[cp] + Number.EPSILON) * 100) / 100;
  });

  grandTotal = Math.round((grandTotal + Number.EPSILON) * 100) / 100;

  return {
    societies,
    counterparties,
    grid,
    rowTotals,
    colTotals,
    grandTotal,
  };
};

export const calculateDifferences = (
  movements: Movement[],
  savedComments: Record<string, string> = {}
): DifferenceRow[] => {
  // Aggregate CXC by (sociedad -> contraparte)
  const cxcMap: Record<string, number> = {};
  // Aggregate CXP by (sociedad -> contraparte)
  const cxpMap: Record<string, number> = {};

  const allPairs = new Set<string>();

  movements.forEach((m) => {
    if (m.tipo === 'CXC') {
      const key = `${m.sociedad}___${m.contraparte}`;
      cxcMap[key] = (cxcMap[key] || 0) + m.valor;
      allPairs.add(key);
      // Also register reciprocal key to check mirror
      allPairs.add(`${m.contraparte}___${m.sociedad}`);
    } else if (m.tipo === 'CXP') {
      const key = `${m.sociedad}___${m.contraparte}`;
      cxpMap[key] = (cxpMap[key] || 0) + m.valor;
      allPairs.add(key);
      allPairs.add(`${m.contraparte}___${m.sociedad}`);
    }
  });

  const rows: DifferenceRow[] = [];

  allPairs.forEach((pairKey) => {
    const [sociedad, contraparte] = pairKey.split('___');
    if (!sociedad || !contraparte || sociedad === contraparte) return;

    // CxC is what Sociedad claims Contraparte owes
    const cxcVal = Math.round(((cxcMap[pairKey] || 0) + Number.EPSILON) * 100) / 100;

    // CxP de la contraparte is what Contraparte registered as payable to Sociedad
    const reciprocalKey = `${contraparte}___${sociedad}`;
    const cxpVal = Math.round(((cxpMap[reciprocalKey] || 0) + Number.EPSILON) * 100) / 100;

    // Skip if neither party registered anything in this direction
    if (cxcVal === 0 && cxpVal === 0) return;

    // Formula specified by user: CxC - CxP de la contraparte
    const rawDiff = cxcVal - cxpVal;
    const diff = Math.round((rawDiff + Number.EPSILON) * 100) / 100;

    const rowId = `${sociedad}___${contraparte}`;
    const comment = savedComments[rowId] || '';

    let estado: 'conciliado' | 'diferencia' | 'sin_reciprocidad' = 'diferencia';
    if (Math.abs(diff) < 0.01) {
      estado = 'conciliado';
    } else if (cxcVal === 0 || cxpVal === 0) {
      estado = 'sin_reciprocidad';
    }

    rows.push({
      id: rowId,
      sociedad,
      contraparte,
      cxc: cxcVal,
      cxp: cxpVal,
      diferencia: diff,
      comentario: comment,
      estado,
    });
  });

  // Sort by difference magnitude (largest discrepancies first), then by sociedad
  return rows.sort((a, b) => {
    const absDiffA = Math.abs(a.diferencia);
    const absDiffB = Math.abs(b.diferencia);
    if (absDiffB !== absDiffA) return absDiffB - absDiffA;
    return a.sociedad.localeCompare(b.sociedad);
  });
};

export const formatCurrency = (val: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
};

export const formatNumber = (val: number): string => {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
};

export const normalizeDocumentKey = (factura: string): string => {
  const cleaned = (factura || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return cleaned || (factura || '').trim().toUpperCase();
};

export interface DocumentReconciliationResult {
  rows: DocumentComparisonRow[];
  movementStatusMap: Record<string, MovementDocStatus>;
  summary: {
    totalDocs: number;
    conciliados: number;
    conciliadosPorDocumento: number;
    conciliadosPorValor: number;
    conDiferenciaValor: number;
    sinContraparte: number;
    noConciliados: number;
    totalCxc: number;
    totalCxp: number;
    diferenciaGlobal: number;
  };
}

const hasPartialDocSimilarity = (aKey: string, bKey: string): boolean => {
  if (!aKey || !bKey) return false;
  if (aKey.includes(bKey) || bKey.includes(aKey)) return true;
  const aDigits = aKey.replace(/\D/g, '');
  const bDigits = bKey.replace(/\D/g, '');
  if (aDigits && bDigits && (aDigits === bDigits || aDigits.endsWith(bDigits) || bDigits.endsWith(aDigits))) {
    return true;
  }
  return false;
};

export const reconcileByDocument = (movements: Movement[]): DocumentReconciliationResult => {
  interface Bucket {
    id: string;
    pairMonthKey: string;
    docKey: string;
    facturaDisplay: string;
    mes: string;
    creditor: string;
    debtor: string;
    cxcMovements: Movement[];
    cxpMovements: Movement[];
    cxcTotal: number;
    cxpTotal: number;
  }

  const buckets = new Map<string, Bucket>();

  movements.forEach((m) => {
    const mes = (m.mes || 'Septiembre 2026').trim();
    const rawDocKey = normalizeDocumentKey(m.factura);
    const isMissingDocNum =
      !rawDocKey ||
      rawDocKey === 'SINNUM' ||
      rawDocKey === 'SN' ||
      rawDocKey === 'NA' ||
      rawDocKey === 'SINDOCUMENTO';
    const docKey = isMissingDocNum ? `NO_DOC_${m.id}` : rawDocKey;
    const creditor = m.tipo === 'CXC' ? m.sociedad.trim() : m.contraparte.trim();
    const debtor = m.tipo === 'CXC' ? m.contraparte.trim() : m.sociedad.trim();

    if (!creditor || !debtor) return;

    const pairMonthKey = `${creditor.toLowerCase()}___${debtor.toLowerCase()}___${mes.toLowerCase()}`;
    const bucketKey = `${pairMonthKey}___${docKey}`;
    let bucket = buckets.get(bucketKey);

    if (!bucket) {
      bucket = {
        id: bucketKey,
        pairMonthKey,
        docKey: rawDocKey || 'SIN-NUM',
        facturaDisplay: (m.factura || 'SIN-NUM').trim(),
        mes,
        creditor,
        debtor,
        cxcMovements: [],
        cxpMovements: [],
        cxcTotal: 0,
        cxpTotal: 0,
      };
      buckets.set(bucketKey, bucket);
    }

    if (m.tipo === 'CXC') {
      bucket.cxcMovements.push(m);
      bucket.cxcTotal += m.valor;
      if (m.factura && m.factura.trim()) {
        bucket.facturaDisplay = m.factura.trim();
      }
    } else {
      bucket.cxpMovements.push(m);
      bucket.cxpTotal += m.valor;
    }
  });

  const rows: DocumentComparisonRow[] = [];
  const movementStatusMap: Record<string, MovementDocStatus> = {};
  const consumedMovementIds = new Set<string>();

  let conciliadosPorDocumento = 0;
  let conciliadosPorValor = 0;
  let conDiferenciaValor = 0;
  let sinContraparte = 0;
  let totalCxc = 0;
  let totalCxp = 0;

  const unmatchedCxcByPair = new Map<string, Bucket[]>();
  const unmatchedCxpByPair = new Map<string, Bucket[]>();

  const registerFinalPair = (
    cxcBucket: Bucket | null,
    cxpBucket: Bucket | null,
    matchMethod?: 'documento' | 'valor'
  ) => {
    const cxcMovs = (cxcBucket ? cxcBucket.cxcMovements : []).filter(
      (m) => !consumedMovementIds.has(m.id)
    );
    const cxpMovs = (cxpBucket ? cxpBucket.cxpMovements : []).filter(
      (m) => !consumedMovementIds.has(m.id)
    );

    if (cxcMovs.length === 0 && cxpMovs.length === 0) return;

    cxcMovs.forEach((m) => consumedMovementIds.add(m.id));
    cxpMovs.forEach((m) => consumedMovementIds.add(m.id));

    const cxcValor =
      cxcMovs.length > 0
        ? Math.round((cxcMovs.reduce((s, m) => s + m.valor, 0) + Number.EPSILON) * 100) / 100
        : 0;
    const cxpValor =
      cxpMovs.length > 0
        ? Math.round((cxpMovs.reduce((s, m) => s + m.valor, 0) + Number.EPSILON) * 100) / 100
        : 0;
    const diferencia = Math.round((cxcValor - cxpValor + Number.EPSILON) * 100) / 100;

    let status: DocumentReconciliationStatus = 'sin_contraparte';
    let resolvedMethod: 'documento' | 'valor' | undefined = undefined;

    if (cxcMovs.length > 0 && cxpMovs.length > 0) {
      if (Math.abs(diferencia) < 0.01) {
        status = 'conciliado';
        resolvedMethod = matchMethod || 'documento';
        if (resolvedMethod === 'valor') {
          conciliadosPorValor += 1;
        } else {
          conciliadosPorDocumento += 1;
        }
      } else {
        status = 'diferencia_valor';
        resolvedMethod = 'documento';
        conDiferenciaValor += 1;
      }
    } else {
      status = 'sin_contraparte';
      sinContraparte += 1;
    }

    totalCxc += cxcValor;
    totalCxp += cxpValor;

    const primary = cxcBucket || cxpBucket!;
    const cxcFactura = cxcBucket?.facturaDisplay || primary.facturaDisplay;
    const cxpFactura = cxpBucket?.facturaDisplay;

    rows.push({
      id: cxpBucket && cxcBucket && cxcBucket.id !== cxpBucket.id
        ? `${cxcBucket.id}__VAL__${cxpBucket.id}`
        : primary.id,
      docKey: primary.docKey,
      facturaDisplay: cxcFactura,
      counterpartyFacturaDisplay:
        resolvedMethod === 'valor' && cxpFactura && cxpFactura !== cxcFactura
          ? cxpFactura
          : undefined,
      mes: primary.mes,
      sociedad: primary.creditor,
      contraparte: primary.debtor,
      cxcValor,
      cxpValor,
      diferencia,
      status,
      matchMethod: resolvedMethod,
      cxcMovements: cxcMovs,
      cxpMovements: cxpMovs,
      cxcFecha: cxcMovs[0]?.fecha_factura || '—',
      cxpFecha: cxpMovs[0]?.fecha_factura || '—',
    });

    cxcMovs.forEach((m) => {
      movementStatusMap[m.id] = {
        status,
        matchMethod: resolvedMethod,
        matchedCounterpartyFactura:
          resolvedMethod === 'valor' ? cxpFactura : undefined,
        counterpartyValue: cxpValor,
        difference: diferencia,
        expectedReciprocalType: 'CXP',
        counterpartyMovements: cxpMovs,
      };
    });

    cxpMovs.forEach((m) => {
      movementStatusMap[m.id] = {
        status,
        matchMethod: resolvedMethod,
        matchedCounterpartyFactura:
          resolvedMethod === 'valor' ? cxcFactura : undefined,
        counterpartyValue: cxcValor,
        difference: Math.round((cxpValor - cxcValor + Number.EPSILON) * 100) / 100,
        expectedReciprocalType: 'CXC',
        counterpartyMovements: cxcMovs,
      };
    });
  };

  // Step 1: Primary verification by normalized document number (locks matched docs immediately)
  buckets.forEach((b) => {
    if (b.cxcMovements.length > 0 && b.cxpMovements.length > 0) {
      registerFinalPair(b, b, 'documento');
    } else if (b.cxcMovements.length > 0) {
      const list = unmatchedCxcByPair.get(b.pairMonthKey) || [];
      list.push(b);
      unmatchedCxcByPair.set(b.pairMonthKey, list);
    } else if (b.cxpMovements.length > 0) {
      const list = unmatchedCxpByPair.get(b.pairMonthKey) || [];
      list.push(b);
      unmatchedCxpByPair.set(b.pairMonthKey, list);
    }
  });

  // Step 2: Strict 1-to-1 secondary verification by exact non-zero amount for unmatched docs
  // Once a document is matched by value, both sides are marked consumed and cannot match any other document/value.
  const allPairKeys = new Set<string>([
    ...unmatchedCxcByPair.keys(),
    ...unmatchedCxpByPair.keys(),
  ]);

  allPairKeys.forEach((pairKey) => {
    const cxcList = unmatchedCxcByPair.get(pairKey) || [];
    const cxpList = unmatchedCxpByPair.get(pairKey) || [];
    const usedCxcIds = new Set<string>();
    const usedCxpIds = new Set<string>();

    // Phase 2A: Exact value + partial invoice similarity (gives priority to close invoice numbers)
    cxcList.forEach((cxcB) => {
      if (usedCxcIds.has(cxcB.id)) return;
      const cxcVal = Math.round((cxcB.cxcTotal + Number.EPSILON) * 100) / 100;
      if (Math.abs(cxcVal) < 0.01) return;

      const matchedCxp = cxpList.find((cxpB) => {
        if (usedCxpIds.has(cxpB.id)) return false;
        const cxpVal = Math.round((cxpB.cxpTotal + Number.EPSILON) * 100) / 100;
        return (
          Math.abs(cxpVal) >= 0.01 &&
          Math.abs(cxcVal - cxpVal) < 0.01 &&
          hasPartialDocSimilarity(cxcB.docKey, cxpB.docKey)
        );
      });

      if (matchedCxp) {
        usedCxcIds.add(cxcB.id);
        usedCxpIds.add(matchedCxp.id);
        registerFinalPair(cxcB, matchedCxp, 'valor');
      }
    });

    // Phase 2B: Strict 1-to-1 exact value fallback ONLY among remaining unused documents
    cxcList.forEach((cxcB) => {
      if (usedCxcIds.has(cxcB.id)) return;
      const cxcVal = Math.round((cxcB.cxcTotal + Number.EPSILON) * 100) / 100;
      if (Math.abs(cxcVal) < 0.01) return;

      const matchedCxp = cxpList.find((cxpB) => {
        if (usedCxpIds.has(cxpB.id)) return false;
        const cxpVal = Math.round((cxpB.cxpTotal + Number.EPSILON) * 100) / 100;
        return Math.abs(cxpVal) >= 0.01 && Math.abs(cxcVal - cxpVal) < 0.01;
      });

      if (matchedCxp) {
        usedCxcIds.add(cxcB.id);
        usedCxpIds.add(matchedCxp.id);
        registerFinalPair(cxcB, matchedCxp, 'valor');
      }
    });

    // Register remaining truly unmatched CXC & CXP documents as alerts
    cxcList.forEach((cxcB) => {
      if (!usedCxcIds.has(cxcB.id)) {
        registerFinalPair(cxcB, null);
      }
    });

    cxpList.forEach((cxpB) => {
      if (!usedCxpIds.has(cxpB.id)) {
        registerFinalPair(null, cxpB);
      }
    });
  });

  // Sort un-reconciled documents first (by largest absolute difference), then reconciled
  rows.sort((a, b) => {
    const aUnrec = a.status === 'conciliado' ? 0 : 1;
    const bUnrec = b.status === 'conciliado' ? 0 : 1;
    if (bUnrec !== aUnrec) return bUnrec - aUnrec;
    const diffCompare = Math.abs(b.diferencia) - Math.abs(a.diferencia);
    if (Math.abs(diffCompare) >= 0.01) return diffCompare;
    return a.facturaDisplay.localeCompare(b.facturaDisplay);
  });

  totalCxc = Math.round((totalCxc + Number.EPSILON) * 100) / 100;
  totalCxp = Math.round((totalCxp + Number.EPSILON) * 100) / 100;
  const diferenciaGlobal = Math.round((totalCxc - totalCxp + Number.EPSILON) * 100) / 100;
  const conciliados = conciliadosPorDocumento + conciliadosPorValor;

  return {
    rows,
    movementStatusMap,
    summary: {
      totalDocs: rows.length,
      conciliados,
      conciliadosPorDocumento,
      conciliadosPorValor,
      conDiferenciaValor,
      sinContraparte,
      noConciliados: conDiferenciaValor + sinContraparte,
      totalCxc,
      totalCxp,
      diferenciaGlobal,
    },
  };
};
