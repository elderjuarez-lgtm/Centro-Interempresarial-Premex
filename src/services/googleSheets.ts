import { getAccessToken } from './auth';
import { Movement, DifferenceRow, MatrixResult } from '../types';
import { ORDERED_ENTITIES } from '../utils/demoData';

export interface ExportToSheetsOptions {
  spreadsheetTitle?: string;
  existingSpreadsheetId?: string;
  differences: DifferenceRow[];
  matrizCxc: MatrixResult;
  matrizCxp: MatrixResult;
  movements: Movement[];
  orderedEntities?: string[];
  periodLabel?: string;
}

export const createGoogleSpreadsheet = async (title: string): Promise<{ id: string; url: string }> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('No hay sesión activa de Google. Por favor inicia sesión con Google.');
  }

  const payload = {
    properties: {
      title,
    },
    sheets: [
      { properties: { title: 'Matrices Bilaterales' } },
      { properties: { title: 'Diferencias Conciliacion' } },
      { properties: { title: 'Matriz CxC' } },
      { properties: { title: 'Matriz CxP' } },
      { properties: { title: 'Movimientos Detallados' } },
    ],
  };

  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `Error al crear hoja de cálculo: ${res.statusText}`);
  }

  const data = await res.json();
  return {
    id: data.spreadsheetId,
    url: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
  };
};

export const exportDataToSheets = async (options: ExportToSheetsOptions): Promise<{ id: string; spreadsheetId: string; url: string }> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('No hay sesión de Google activa. Por favor inicia sesión con Google.');
  }

  let spreadsheetId = options.existingSpreadsheetId?.trim();
  let spreadsheetUrl = '';

  if (!spreadsheetId) {
    const today = new Date().toISOString().split('T')[0];
    const defaultTitle = options.spreadsheetTitle || `Centro Interempresarial - Conciliación ${today}`;
    const created = await createGoogleSpreadsheet(defaultTitle);
    spreadsheetId = created.id;
    spreadsheetUrl = created.url;
  } else {
    spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  }

  // 1. Build Sheet: Matrices Bilaterales (strictly using configured Empresas a Conciliar)
  const sourceEntities =
    options.orderedEntities && options.orderedEntities.length > 0
      ? options.orderedEntities
      : ORDERED_ENTITIES;

  const entities: string[] = [];
  const lookupMap = new Map<string, string>();
  sourceEntities.forEach((raw) => {
    const clean = raw.trim();
    if (!clean) return;
    const norm = clean.toLowerCase();
    if (!lookupMap.has(norm)) {
      lookupMap.set(norm, clean);
      entities.push(clean);
    }
  });

  const cxcMap: Record<string, number> = {};
  const cxpMap: Record<string, number> = {};
  options.movements.forEach((m) => {
    const soc = lookupMap.get(m.sociedad.trim().toLowerCase());
    const cp = lookupMap.get(m.contraparte.trim().toLowerCase());
    if (!soc || !cp) return;
    const k = `${soc}___${cp}`;
    if (m.tipo === 'CXC') {
      cxcMap[k] = (cxcMap[k] || 0) + m.valor;
    } else {
      cxpMap[k] = (cxpMap[k] || 0) + m.valor;
    }
  });

  const periodTitle = options.periodLabel || 'SEPTIEMBRE 2026 - ( CIFRAS EN DOLARES )';
  const bilateralRows: any[][] = [
    [periodTitle],
    ['CTAS X COBRAR', ...entities],
  ];

  entities.forEach((soc) => {
    const row: any[] = [soc];
    entities.forEach((cp) => {
      const isDiagonal = soc === cp;
      const val = cxcMap[`${soc}___${cp}`];
      if (isDiagonal) {
        row.push('');
      } else if (val && val > 0) {
        row.push(val);
      } else {
        row.push('');
      }
    });
    bilateralRows.push(row);
  });

  bilateralRows.push([]);
  bilateralRows.push([]);
  bilateralRows.push(['CTAS X PAGAR', ...entities]);

  entities.forEach((soc) => {
    const row: any[] = [soc];
    entities.forEach((cp) => {
      const isDiagonal = soc === cp;
      const val = cxpMap[`${soc}___${cp}`];
      if (isDiagonal) {
        row.push('');
      } else if (val && val > 0) {
        row.push(val);
      } else {
        row.push('');
      }
    });
    bilateralRows.push(row);
  });

  // 2. Build Sheet: Diferencias Conciliacion
  const diffRows: any[][] = [
    ['REPORTE DE DIFERENCIAS INTEREMPRESARIALES'],
    ['Generado por Centro Interempresarial', `Fecha: ${new Date().toLocaleString()}`],
    [],
    ['Sociedad', 'Contraparte', 'CxC (Sociedad)', 'CxP (Contraparte)', 'Diferencia (CxC - CxP)', 'Estado', 'Comentario']
  ];

  options.differences.forEach((d) => {
    diffRows.push([
      d.sociedad,
      d.contraparte,
      d.cxc,
      d.cxp,
      d.diferencia,
      d.diferencia === 0 ? 'CONCILIADO' : (d.diferencia > 0 ? 'DIFERENCIA POSITIVA' : 'DIFERENCIA NEGATIVA'),
      d.comentario || ''
    ]);
  });

  const totalCxc = options.differences.reduce((acc, r) => acc + r.cxc, 0);
  const totalCxp = options.differences.reduce((acc, r) => acc + r.cxp, 0);
  const totalDiff = options.differences.reduce((acc, r) => acc + r.diferencia, 0);
  diffRows.push([]);
  diffRows.push(['TOTAL GENERAL', '', totalCxc, totalCxp, totalDiff, totalDiff === 0 ? 'CONCILIADO' : 'CON DIFERENCIA', '']);

  // 3. Build Sheet: Matriz CxC
  const cxcMatrixRows: (string | number)[][] = [
    ['MATRIZ DE CUENTAS POR COBRAR (CXC)'],
    ['Filas: Sociedad Emisora / Columnas: Contraparte Deudora'],
    []
  ];
  const cxcHeaders = ['Sociedad \\ Contraparte', ...options.matrizCxc.counterparties, 'Total CxC'];
  cxcMatrixRows.push(cxcHeaders);

  options.matrizCxc.societies.forEach((soc) => {
    const row: (string | number)[] = [soc];
    options.matrizCxc.counterparties.forEach((cp) => {
      const cellVal = options.matrizCxc.grid[soc]?.[cp]?.valor || 0;
      row.push(cellVal);
    });
    row.push(options.matrizCxc.rowTotals[soc] || 0);
    cxcMatrixRows.push(row);
  });

  const cxcTotalRow: (string | number)[] = ['Total'];
  options.matrizCxc.counterparties.forEach((cp) => {
    cxcTotalRow.push(options.matrizCxc.colTotals[cp] || 0);
  });
  cxcTotalRow.push(options.matrizCxc.grandTotal);
  cxcMatrixRows.push(cxcTotalRow);

  // 4. Build Sheet: Matriz CxP
  const cxpMatrixRows: (string | number)[][] = [
    ['MATRIZ DE CUENTAS POR PAGAR (CXP)'],
    ['Filas: Sociedad Deudora / Columnas: Contraparte Acreedora'],
    []
  ];
  const cxpHeaders = ['Sociedad \\ Contraparte', ...options.matrizCxp.counterparties, 'Total CxP'];
  cxpMatrixRows.push(cxpHeaders);

  options.matrizCxp.societies.forEach((soc) => {
    const row: (string | number)[] = [soc];
    options.matrizCxp.counterparties.forEach((cp) => {
      const cellVal = options.matrizCxp.grid[soc]?.[cp]?.valor || 0;
      row.push(cellVal);
    });
    row.push(options.matrizCxp.rowTotals[soc] || 0);
    cxpMatrixRows.push(row);
  });

  const cxpTotalRow: (string | number)[] = ['Total'];
  options.matrizCxp.counterparties.forEach((cp) => {
    cxpTotalRow.push(options.matrizCxp.colTotals[cp] || 0);
  });
  cxpTotalRow.push(options.matrizCxp.grandTotal);
  cxpMatrixRows.push(cxpTotalRow);

  // 5. Build Sheet: Movimientos Detallados
  const movRows: any[][] = [
    ['DETALLE COMPLETO DE MOVIMIENTOS INTEREMPRESARIALES'],
    ['Total registros:', options.movements.length],
    [],
    ['ID', 'Mes a Conciliar', 'Tipo', 'Sociedad', 'Contraparte', 'Fecha Factura', 'Factura', 'Valor', 'Notas']
  ];

  options.movements.forEach((m, idx) => {
    movRows.push([
      idx + 1,
      m.mes || 'Septiembre 2026',
      m.tipo,
      m.sociedad,
      m.contraparte,
      m.fecha_factura,
      m.factura,
      m.valor,
      m.notas || ''
    ]);
  });

  // Prepare batchUpdate payload
  const batchData = [
    {
      range: "'Matrices Bilaterales'!A1",
      values: bilateralRows,
    },
    {
      range: "'Diferencias Conciliacion'!A1",
      values: diffRows,
    },
    {
      range: "'Matriz CxC'!A1",
      values: cxcMatrixRows,
    },
    {
      range: "'Matriz CxP'!A1",
      values: cxpMatrixRows,
    },
    {
      range: "'Movimientos Detallados'!A1",
      values: movRows,
    },
  ];

  const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: batchData,
    }),
  });

  if (!updateRes.ok) {
    const err = await updateRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error al guardar los datos en Google Sheets: ${updateRes.statusText}`);
  }

  return {
    id: spreadsheetId,
    spreadsheetId,
    url: spreadsheetUrl,
  };
};
