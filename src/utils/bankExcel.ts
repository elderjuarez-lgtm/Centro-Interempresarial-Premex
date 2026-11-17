import * as XLSX from 'xlsx';
import {
  BankAccount,
  BankMatchGroup,
  BankReconciliationSummary,
  BankStatementItem,
  BookLedgerItem,
} from '../types';
import {
  DEFAULT_PENDING_CATEGORY_LABEL,
  inferPendingCategoryForBank,
  inferPendingCategoryForLedger,
} from './bankReconciliation';

const normalizeHeader = (h: string): string =>
  String(h || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const parseNumericValue = (raw: unknown): number => {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const str = String(raw || '').trim();
  if (!str) return 0;
  // Handle accounting parentheses (1,200.50) -> -1200.50
  const isNeg = /^\(.*\)$/.test(str) || str.startsWith('-');
  const cleaned = str.replace(/[()$€Q\s]/g, '').replace(/COP|USD|MX|GTQ|EUR/gi, '');
  let normalized = cleaned;
  // Detect European/LatAm format like 1.250.000,50
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  if (lastComma > lastDot && lastComma >= normalized.length - 3) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = normalized.replace(/,/g, '');
  }
  const num = parseFloat(normalized.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(num)) return 0;
  return isNeg ? -Math.abs(num) : num;
};

const formatDateValue = (raw: unknown): string => {
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + raw * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const str = String(raw || '').trim();
  if (!str) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const m = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const month = m[2].padStart(2, '0');
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${month}-${day}`;
  }
  return str.slice(0, 20);
};

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
      const mes = String(map.mes || map.periodo || defaultMonth || 'Septiembre 2026').trim();

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
        return; // skip empty row
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
      } else if (norm.includes('auxiliar') || norm.includes('libro') || norm.includes('contab') || norm.includes('ledger')) {
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
  const sampleMonth = 'Septiembre 2026';

  const extractoRows = [
    {
      Fecha: '2026-09-05',
      Referencia: 'TR-90124',
      Descripcion: 'ABONO CLIENTE DISTRIBUIDORA CENTRAL',
      Tipo: 'CREDITO',
      Valor: 25400,
      Mes: sampleMonth,
    },
    {
      Fecha: '2026-09-10',
      Referencia: 'PAG-4421',
      Descripcion: 'TRANSFERENCIA PROVEEDOR MATERIA PRIMA',
      Tipo: 'DEBITO',
      Valor: 11200,
      Mes: sampleMonth,
    },
    {
      Fecha: '2026-09-30',
      Referencia: 'ND-COM09',
      Descripcion: 'COMISION MANEJO CUENTA EMPRESARIAL',
      Tipo: 'DEBITO',
      Valor: 85,
      Mes: sampleMonth,
    },
  ];

  const librosRows = [
    {
      Fecha: '2026-09-05',
      Comprobante: 'TR-90124',
      Tercero: 'Distribuidora Central S.A.',
      Descripcion: 'Recaudo factura cartera',
      Tipo: 'DEBITO',
      Valor: 25400,
      Mes: sampleMonth,
    },
    {
      Fecha: '2026-09-10',
      Comprobante: 'PAG-4421',
      Tercero: 'Químicos Industriales Ltda.',
      Descripcion: 'Pago orden de compra #882',
      Tipo: 'CREDITO',
      Valor: 11200,
      Mes: sampleMonth,
    },
    {
      Fecha: '2026-09-30',
      Comprobante: 'CE-8801',
      Tercero: 'Transportes Nacionales',
      Descripcion: 'Pago en tránsito cierre de mes',
      Tipo: 'CREDITO',
      Valor: 3450,
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
  XLSX.writeFile(wb, `Plantilla_Conciliacion_Bancaria_${safeBanco}.xlsx`);
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

  // Sheet 1: Cuadre Bancario
  const bridgeRows = [
    ['PREMEX — CONCILIACIÓN BANCARIA CORPORATIVA', '', ''],
    ['Sociedad:', acc.sociedad, ''],
    ['Banco / Cuenta:', `${acc.banco} · ${acc.numeroCuenta} (${acc.tipoCuenta})`, ''],
    ['Moneda / Periodo:', `${acc.moneda} · ${selectedMonth === 'ALL' ? 'Todos los meses' : selectedMonth}`, ''],
    ['', '', ''],
    ['SECCIÓN 1: CONCILIACIÓN SEGÚN EXTRACTO BANCARIO', 'SIGNO', `VALOR (${acc.moneda})`],
    ['Saldo Final según Extracto Bancario', '=', summary.saldoExtracto],
    ['(+) Depósitos / Ingresos en Tránsito (en Libros, no en Banco)', '+', summary.depositosEnTransito],
    ['(-) Cheques / Pagos en Tránsito (en Libros, no en Banco)', '-', summary.chequesEnTransito],
    ['SALDO CONCILIADO SEGÚN EXTRACTO', '=', summary.saldoConciliadoExtracto],
    ['', '', ''],
    ['SECCIÓN 2: CONCILIACIÓN SEGÚN LIBROS CONTABLES', 'SIGNO', `VALOR (${acc.moneda})`],
    ['Saldo Final según Auxiliar Contable (Libros)', '=', summary.saldoLibros],
    ['(+) Notas Crédito / Abonos Bancarios no Contabilizados', '+', summary.notasCreditoNoContabilizadas],
    ['(-) Notas Débito / Comisiones Bancarias no Contabilizadas', '-', summary.notasDebitoNoContabilizadas],
    ['SALDO CONCILIADO SEGÚN LIBROS', '=', summary.saldoConciliadoLibros],
    ['', '', ''],
    ['DIFERENCIA NETA DE CONCILIACIÓN', 'Δ', summary.diferenciaNeta],
    ['PORCENTAJE DE PARTIDAS CONCILIADAS', '%', `${summary.reconciledPct}%`],
  ];
  const wsBridge = XLSX.utils.aoa_to_sheet(bridgeRows);
  wsBridge['!cols'] = [{ wch: 56 }, { wch: 10 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsBridge, 'Cuadre Bancario');

  // Sheet 2: Partidas Conciliadas
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
      Fechas_Banco: bList.map((b) => b.fecha).join(', '),
      Valor_Banco: bList.reduce((s, b) => s + (b.tipo === 'CREDITO' ? b.valor : -b.valor), 0),
      Comprobantes_Libros: lList.map((l) => l.comprobante).join(', '),
      Terceros: lList.map((l) => l.tercero).join(', '),
      Valor_Libros: lList.reduce((s, l) => s + (l.tipo === 'DEBITO' ? l.valor : -l.valor), 0),
      Nota: m.note || '',
    };
  });
  const wsMatched = XLSX.utils.json_to_sheet(
    matchedRows.length > 0 ? matchedRows : [{ Estado: 'Sin partidas conciliadas aún' }]
  );
  wsMatched['!cols'] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 22 },
    { wch: 16 },
    { wch: 16 },
    { wch: 22 },
    { wch: 28 },
    { wch: 16 },
    { wch: 26 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMatched, 'Partidas Conciliadas');

  // Sheet 3: Pendientes Extracto
  const pendingBankRows = summary.unmatchedBankItems.map((b) => ({
    Fecha: b.fecha,
    Referencia: b.referencia,
    Descripcion: b.descripcion,
    Tipo_Extracto: b.tipo,
    Valor: b.valor,
    Clasificacion: DEFAULT_PENDING_CATEGORY_LABEL[inferPendingCategoryForBank(b)],
    Comentario: b.comentario || '',
  }));
  const wsPendingBank = XLSX.utils.json_to_sheet(
    pendingBankRows.length > 0 ? pendingBankRows : [{ Estado: 'Sin partidas pendientes en extracto' }]
  );
  wsPendingBank['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 40 }, { wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, wsPendingBank, 'Pendientes Extracto');

  // Sheet 4: Pendientes Libros
  const pendingLedgerRows = summary.unmatchedLedgerItems.map((l) => ({
    Fecha: l.fecha,
    Comprobante: l.comprobante,
    Tercero: l.tercero,
    Descripcion: l.descripcion,
    Tipo_Libros: l.tipo,
    Valor: l.valor,
    Clasificacion: DEFAULT_PENDING_CATEGORY_LABEL[inferPendingCategoryForLedger(l)],
    Comentario: l.comentario || '',
  }));
  const wsPendingLedger = XLSX.utils.json_to_sheet(
    pendingLedgerRows.length > 0 ? pendingLedgerRows : [{ Estado: 'Sin partidas pendientes en libros' }]
  );
  wsPendingLedger['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 28 }, { wch: 36 }, { wch: 14 }, { wch: 16 }, { wch: 28 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, wsPendingLedger, 'Pendientes Libros');

  const safeBanco = acc.banco.replace(/[^a-zA-Z0-9_-]+/g, '_');
  const safeMes = (selectedMonth || 'Consolidado').replace(/[^a-zA-Z0-9_-]+/g, '_');
  XLSX.writeFile(wb, `Conciliacion_Bancaria_${safeBanco}_${safeMes}.xlsx`);
};
