import { DifferenceRow, DocumentComparisonRow } from '../types';
import { formatCurrency } from './reconciliation';

const GENERIC_MAILBOX_TOKENS = new Set([
  'contabilidad',
  'tesoreria',
  'facturacion',
  'finanzas',
  'cobros',
  'pagos',
  'admin',
  'administracion',
  'info',
  'soporte',
  'contacto',
  'ventas',
  'compras',
  'cxc',
  'cxp',
  'auditoria',
  'noreply',
  'no-reply',
  'gerencia',
  'intercompany',
  'conciliaciones',
]);

const capitalizeWord = (word: string): string => {
  if (!word) return '';
  const lower = word.toLocaleLowerCase('es');
  return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1);
};

/**
 * Extracts "Primer Nombre Primer Apellido" from a corporate email such as
 * "elder.juarez@premexcorp.com" -> "Elder Juarez".
 * Returns empty string for empty or generic mailbox addresses.
 */
export const extractPersonNameFromEmail = (email: string): string => {
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0) return '';

  const localPart = trimmed.slice(0, atIndex).trim();
  if (!localPart) return '';

  const rawTokens = localPart
    .split(/[._-]+/)
    .map((t) => t.replace(/\d+/g, '').trim())
    .filter((t) => t.length >= 2 && /[a-záéíóúüñ]/i.test(t));

  if (rawTokens.length === 0) return '';

  const firstLower = rawTokens[0].toLocaleLowerCase('es');
  if (rawTokens.length === 1 && GENERIC_MAILBOX_TOKENS.has(firstLower)) {
    return '';
  }

  const meaningful = rawTokens.filter(
    (t) => !GENERIC_MAILBOX_TOKENS.has(t.toLocaleLowerCase('es'))
  );
  if (meaningful.length === 0) return '';

  // Use first name and first surname (up to 2 tokens)
  const selected = meaningful.slice(0, 2).map(capitalizeWord);
  return selected.join(' ');
};

const wrapTextLines = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] => {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return ['—'];

  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
        current = '';
      }
      // Handle very long unbroken tokens (e.g. long invoice codes)
      if (ctx.measureText(word).width > maxWidth) {
        let slice = '';
        for (const ch of word) {
          if (ctx.measureText(slice + ch).width > maxWidth && slice) {
            lines.push(slice);
            slice = ch;
          } else {
            slice += ch;
          }
        }
        current = slice;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : ['—'];
};

export interface RenderDiffImageParams {
  recipientLabel: string;
  periodLabel: string;
  pairs: DifferenceRow[];
  unreconciledDocs: DocumentComparisonRow[];
}

export interface RenderedDiffImage {
  blob: Blob;
  dataUrl: string;
}

export const renderDifferencesSummaryPng = async ({
  recipientLabel,
  periodLabel,
  pairs,
  unreconciledDocs,
}: RenderDiffImageParams): Promise<RenderedDiffImage> => {
  const scale = 2;
  const width = 980;
  const padX = 28;
  const tableWidth = width - padX * 2; // 924

  const canvas = document.createElement('canvas');
  const measureCtx = canvas.getContext('2d');
  if (!measureCtx) {
    throw new Error('No se pudo inicializar el lienzo para generar la imagen.');
  }

  const cellFont = '12px Inter, Arial, Helvetica, sans-serif';
  const boldCellFont = 'bold 12px Inter, Arial, Helvetica, sans-serif';
  const monoBoldFont = 'bold 12px Consolas, "Courier New", monospace';
  const lineHeight = 16;
  const cellPadY = 9;
  const cellPadX = 10;

  // Section 1 column widths (sum = 924)
  const diffCols = [
    { label: 'Sociedad', width: 165, align: 'left' as const },
    { label: 'Contraparte', width: 165, align: 'left' as const },
    { label: 'CxC', width: 112, align: 'right' as const },
    { label: 'CxP', width: 112, align: 'right' as const },
    { label: 'Diferencia', width: 115, align: 'right' as const },
    { label: 'Comentario', width: 255, align: 'left' as const },
  ];

  // Section 2 column widths (sum = 924)
  const docCols = [
    { label: 'Factura', width: 120, align: 'left' as const },
    { label: 'Mes', width: 92, align: 'left' as const },
    { label: 'Sociedad → Contraparte', width: 222, align: 'left' as const },
    { label: 'CxC', width: 98, align: 'right' as const },
    { label: 'CxP', width: 98, align: 'right' as const },
    { label: 'Diferencia', width: 102, align: 'right' as const },
    { label: 'Motivo', width: 192, align: 'left' as const },
  ];

  measureCtx.font = cellFont;
  const diffPrepared = pairs.map((p) => {
    measureCtx.font = boldCellFont;
    const socLines = wrapTextLines(measureCtx, p.sociedad, diffCols[0].width - cellPadX * 2);
    measureCtx.font = cellFont;
    const cpLines = wrapTextLines(measureCtx, p.contraparte, diffCols[1].width - cellPadX * 2);
    const commentText = p.comentario?.trim() || 'Sin comentario registrado';
    const commLines = wrapTextLines(measureCtx, commentText, diffCols[5].width - cellPadX * 2);
    const maxLines = Math.max(socLines.length, cpLines.length, commLines.length, 1);
    const rowHeight = maxLines * lineHeight + cellPadY * 2;
    return { p, socLines, cpLines, commLines, rowHeight };
  });

  const docPrepared = unreconciledDocs.map((doc) => {
    const reason =
      doc.status === 'diferencia_valor'
        ? 'Diferencia en valor'
        : doc.cxcValor > 0
        ? `Falta CXP en ${doc.contraparte}`
        : `Falta CXC en ${doc.sociedad}`;
    measureCtx.font = boldCellFont;
    const facLines = wrapTextLines(measureCtx, doc.facturaDisplay, docCols[0].width - cellPadX * 2);
    measureCtx.font = cellFont;
    const mesLines = wrapTextLines(measureCtx, doc.mes, docCols[1].width - cellPadX * 2);
    const pairLines = wrapTextLines(
      measureCtx,
      `${doc.sociedad} → ${doc.contraparte}`,
      docCols[2].width - cellPadX * 2
    );
    const reasonLines = wrapTextLines(measureCtx, reason, docCols[6].width - cellPadX * 2);
    const maxLines = Math.max(
      facLines.length,
      mesLines.length,
      pairLines.length,
      reasonLines.length,
      1
    );
    const rowHeight = maxLines * lineHeight + cellPadY * 2;
    return { doc, facLines, mesLines, pairLines, reasonLines, rowHeight };
  });

  const headerBannerH = 82;
  const sectionTitleH = 30;
  const tableHeaderH = 34;
  const totalsRowH = 36;
  const gapBetweenSections = 22;
  const footerH = 38;

  const diffTableHeight =
    sectionTitleH +
    tableHeaderH +
    diffPrepared.reduce((sum, r) => sum + r.rowHeight, 0) +
    totalsRowH;

  const docsTableHeight =
    docPrepared.length > 0
      ? gapBetweenSections +
        sectionTitleH +
        tableHeaderH +
        docPrepared.reduce((sum, r) => sum + r.rowHeight, 0)
      : 0;

  const logicalHeight = headerBannerH + 22 + diffTableHeight + docsTableHeight + footerH;

  canvas.width = width * scale;
  canvas.height = logicalHeight * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo obtener el contexto de dibujo 2D.');
  }

  ctx.scale(scale, scale);

  // Outer card background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, logicalHeight);

  // Top Corporate Navy Banner
  ctx.fillStyle = '#1b365d';
  ctx.fillRect(0, 0, width, headerBannerH);

  // Subtle accent strip
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(0, headerBannerH - 4, width, 4);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 17px Inter, Arial, Helvetica, sans-serif';
  ctx.fillText('CONCILIACIÓN INTEREMPRESARIAL — DIFERENCIAS NO CONCILIADAS', padX, 34);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '13px Inter, Arial, Helvetica, sans-serif';
  ctx.fillText(
    `Período: ${periodLabel}   •   Para: ${recipientLabel}`,
    padX,
    58
  );

  let y = headerBannerH + 22;

  // Section 1 title
  ctx.fillStyle = '#1b365d';
  ctx.font = 'bold 13px Inter, Arial, Helvetica, sans-serif';
  ctx.fillText(`1. RESUMEN DE DIFERENCIAS PENDIENTES (${pairs.length})`, padX, y + 18);
  y += sectionTitleH;

  // Section 1 header row
  ctx.fillStyle = '#1b365d';
  ctx.fillRect(padX, y, tableWidth, tableHeaderH);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px Inter, Arial, Helvetica, sans-serif';

  let colX = padX;
  diffCols.forEach((col) => {
    ctx.textAlign = col.align === 'right' ? 'right' : 'left';
    const textX = col.align === 'right' ? colX + col.width - cellPadX : colX + cellPadX;
    ctx.fillText(col.label.toUpperCase(), textX, y + 21);
    colX += col.width;
  });
  ctx.textAlign = 'left';
  y += tableHeaderH;

  // Section 1 body rows
  let sumCxc = 0;
  let sumCxp = 0;
  diffPrepared.forEach((row, idx) => {
    const { p, socLines, cpLines, commLines, rowHeight } = row;
    sumCxc += p.cxc;
    sumCxp += p.cxp;

    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(padX, y, tableWidth, rowHeight);

    // Borders
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(padX, y, tableWidth, rowHeight);

    let x = padX;
    // Vertical dividers
    diffCols.slice(0, -1).forEach((col) => {
      x += col.width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + rowHeight);
      ctx.stroke();
    });

    // Cell values
    let cx = padX;

    // Sociedad
    ctx.fillStyle = '#0f172a';
    ctx.font = boldCellFont;
    socLines.forEach((line, lIdx) => {
      ctx.fillText(line, cx + cellPadX, y + cellPadY + 12 + lIdx * lineHeight);
    });
    cx += diffCols[0].width;

    // Contraparte
    ctx.fillStyle = '#334155';
    ctx.font = cellFont;
    cpLines.forEach((line, lIdx) => {
      ctx.fillText(line, cx + cellPadX, y + cellPadY + 12 + lIdx * lineHeight);
    });
    cx += diffCols[1].width;

    // CxC
    ctx.textAlign = 'right';
    ctx.fillStyle = '#1e3a8a';
    ctx.font = '12px Consolas, "Courier New", monospace';
    ctx.fillText(formatCurrency(p.cxc), cx + diffCols[2].width - cellPadX, y + cellPadY + 12);
    cx += diffCols[2].width;

    // CxP
    ctx.fillStyle = '#312e81';
    ctx.fillText(formatCurrency(p.cxp), cx + diffCols[3].width - cellPadX, y + cellPadY + 12);
    cx += diffCols[3].width;

    // Diferencia
    ctx.fillStyle = p.diferencia >= 0 ? '#b45309' : '#be123c';
    ctx.font = monoBoldFont;
    ctx.fillText(
      formatCurrency(p.diferencia),
      cx + diffCols[4].width - cellPadX,
      y + cellPadY + 12
    );
    cx += diffCols[4].width;
    ctx.textAlign = 'left';

    // Comentario
    ctx.fillStyle = p.comentario?.trim() ? '#334155' : '#94a3b8';
    ctx.font = cellFont;
    commLines.forEach((line, lIdx) => {
      ctx.fillText(line, cx + cellPadX, y + cellPadY + 12 + lIdx * lineHeight);
    });

    y += rowHeight;
  });

  // Section 1 totals row
  const netDiff = Math.round((sumCxc - sumCxp + Number.EPSILON) * 100) / 100;
  ctx.fillStyle = '#eef2f6';
  ctx.fillRect(padX, y, tableWidth, totalsRowH);
  ctx.strokeStyle = '#94a3b8';
  ctx.strokeRect(padX, y, tableWidth, totalsRowH);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 12px Inter, Arial, Helvetica, sans-serif';
  ctx.fillText('TOTAL DIFERENCIAS SELECCIONADAS', padX + cellPadX, y + 22);

  let totX = padX + diffCols[0].width + diffCols[1].width;
  ctx.textAlign = 'right';
  ctx.font = monoBoldFont;
  ctx.fillStyle = '#1e3a8a';
  ctx.fillText(formatCurrency(sumCxc), totX + diffCols[2].width - cellPadX, y + 22);
  totX += diffCols[2].width;

  ctx.fillStyle = '#312e81';
  ctx.fillText(formatCurrency(sumCxp), totX + diffCols[3].width - cellPadX, y + 22);
  totX += diffCols[3].width;

  ctx.fillStyle = Math.abs(netDiff) < 0.01 ? '#047857' : '#b45309';
  ctx.fillText(formatCurrency(netDiff), totX + diffCols[4].width - cellPadX, y + 22);
  ctx.textAlign = 'left';

  y += totalsRowH;

  // Section 2: Unreconciled Documents
  if (docPrepared.length > 0) {
    y += gapBetweenSections;
    ctx.fillStyle = '#1b365d';
    ctx.font = 'bold 13px Inter, Arial, Helvetica, sans-serif';
    ctx.fillText(`2. DOCUMENTOS NO CONCILIADOS (${docPrepared.length})`, padX, y + 18);
    y += sectionTitleH;

    // Header row
    ctx.fillStyle = '#1b365d';
    ctx.fillRect(padX, y, tableWidth, tableHeaderH);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Inter, Arial, Helvetica, sans-serif';

    let dColX = padX;
    docCols.forEach((col) => {
      ctx.textAlign = col.align === 'right' ? 'right' : 'left';
      const textX = col.align === 'right' ? dColX + col.width - cellPadX : dColX + cellPadX;
      ctx.fillText(col.label.toUpperCase(), textX, y + 21);
      dColX += col.width;
    });
    ctx.textAlign = 'left';
    y += tableHeaderH;

    docPrepared.forEach((row, idx) => {
      const { doc, facLines, mesLines, pairLines, reasonLines, rowHeight } = row;
      ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillRect(padX, y, tableWidth, rowHeight);

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(padX, y, tableWidth, rowHeight);

      let dx = padX;
      docCols.slice(0, -1).forEach((col) => {
        dx += col.width;
        ctx.beginPath();
        ctx.moveTo(dx, y);
        ctx.lineTo(dx, y + rowHeight);
        ctx.stroke();
      });

      let cx = padX;

      // Factura
      ctx.fillStyle = '#0f172a';
      ctx.font = boldCellFont;
      facLines.forEach((line, lIdx) => {
        ctx.fillText(line, cx + cellPadX, y + cellPadY + 12 + lIdx * lineHeight);
      });
      cx += docCols[0].width;

      // Mes
      ctx.fillStyle = '#475569';
      ctx.font = cellFont;
      mesLines.forEach((line, lIdx) => {
        ctx.fillText(line, cx + cellPadX, y + cellPadY + 12 + lIdx * lineHeight);
      });
      cx += docCols[1].width;

      // Par
      ctx.fillStyle = '#334155';
      pairLines.forEach((line, lIdx) => {
        ctx.fillText(line, cx + cellPadX, y + cellPadY + 12 + lIdx * lineHeight);
      });
      cx += docCols[2].width;

      // CxC / CxP / Diferencia
      ctx.textAlign = 'right';
      ctx.font = '12px Consolas, "Courier New", monospace';
      ctx.fillStyle = '#1e3a8a';
      ctx.fillText(formatCurrency(doc.cxcValor), cx + docCols[3].width - cellPadX, y + cellPadY + 12);
      cx += docCols[3].width;

      ctx.fillStyle = '#312e81';
      ctx.fillText(formatCurrency(doc.cxpValor), cx + docCols[4].width - cellPadX, y + cellPadY + 12);
      cx += docCols[4].width;

      ctx.fillStyle = '#b91c1c';
      ctx.font = monoBoldFont;
      ctx.fillText(
        formatCurrency(doc.diferencia),
        cx + docCols[5].width - cellPadX,
        y + cellPadY + 12
      );
      cx += docCols[5].width;
      ctx.textAlign = 'left';

      // Motivo
      ctx.fillStyle = '#475569';
      ctx.font = cellFont;
      reasonLines.forEach((line, lIdx) => {
        ctx.fillText(line, cx + cellPadX, y + cellPadY + 12 + lIdx * lineHeight);
      });

      y += rowHeight;
    });
  }

  // Footer
  ctx.fillStyle = '#64748b';
  ctx.font = '11px Inter, Arial, Helvetica, sans-serif';
  ctx.fillText(
    'Centro Interempresarial • Por favor validar estas diferencias y confirmar observaciones para cierre.',
    padX,
    logicalHeight - 14
  );

  // Border around full image
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, logicalHeight - 2);

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('No se pudo exportar la imagen PNG.'));
    }, 'image/png');
  });

  return { blob, dataUrl };
};
