import { StoredReceiptMedia } from './viaticosMediaStore';
import {
  OdooApiExpensePayloadItem,
  OdooExpenseUploadRow,
  buildOdooExpenseApiPayloads,
} from '../utils/viaticosOdooExport';

export interface OdooServerProbeResult {
  reachable: boolean;
  authenticated: boolean;
  httpStatus?: number | null;
  uid?: number;
  serverVersion?: string | null;
  hrExpenseAvailable: boolean;
  detectedExpenseFieldsCount?: number;
  checkedAtIso: string;
  message: string;
}

export interface OdooConnectorStatusResponse {
  ok: boolean;
  protocol?: 'rest' | 'jsonrpc';
  configured: boolean;
  missingEnvVars: string[];
  odooHost: string | null;
  odooDbConfigured: boolean;
  odooUsernameConfigured: boolean;
  odooApiKeyConfigured: boolean;
  createExpenseSheetDefault: boolean;
  checkedAtIso: string;
  probeResult?: OdooServerProbeResult;
}

export interface OdooPreflightIssue {
  rowKey: string;
  severity: 'error' | 'warning';
  field: string;
  message: string;
}

export interface OdooPreparedLinePreview {
  rowKey: string;
  liquidationId: string;
  itemId: string;
  hasAttachmentBinary: boolean;
  prepared: Record<string, unknown>;
}

export interface OdooPostedLineResult {
  rowKey: string;
  liquidationId: string;
  odooExpenseId: number | null;
  odooAttachmentId: number | null;
  status: 'created' | 'error';
  warnings: string[];
  error?: string;
}

export interface OdooExpensesPostResponse {
  ok: boolean;
  protocol?: 'rest' | 'jsonrpc';
  mode: 'prepared_dry_run' | 'validation_failed' | 'auth_error' | 'posted' | 'connection_error';
  configured: boolean;
  missingEnvVars?: string[];
  odooHost?: string | null;
  model?: string;
  totalLines?: number;
  blockingErrorsCount?: number;
  issues?: OdooPreflightIssue[];
  preparedLines?: OdooPreparedLinePreview[];
  successCount?: number;
  errorCount?: number;
  expenseIdsByLiq?: Record<string, number[]>;
  sheetIdsByLiq?: Record<string, number>;
  results?: OdooPostedLineResult[];
  message?: string;
  error?: string;
}

function extractBase64FromDataUrl(dataUrl: string): string {
  const idx = dataUrl.indexOf('base64,');
  if (idx >= 0) {
    return dataUrl.slice(idx + 7).trim();
  }
  return dataUrl.trim();
}

export function buildAttachmentBinariesMap(
  rows: OdooExpenseUploadRow[],
  mediaMap: Record<string, StoredReceiptMedia>
): Record<string, { fileName: string; mimeType: string; base64Data: string }> {
  const out: Record<string, { fileName: string; mimeType: string; base64Data: string }> = {};
  const maxPerAttachmentChars = 5_500_000; // ~4 MB binary ceiling per request attachment

  rows.forEach((row) => {
    const attId = row.attachmentId;
    if (!attId || out[attId]) return;
    const media = mediaMap[attId];
    if (!media?.dataUrl) return;
    const base64Data = extractBase64FromDataUrl(media.dataUrl);
    if (!base64Data || base64Data.length > maxPerAttachmentChars) return;
    out[attId] = {
      fileName: media.fileName || row.attachmentName || 'comprobante.pdf',
      mimeType: media.mimeType || row.attachmentMimeType || 'application/pdf',
      base64Data,
    };
  });

  return out;
}

export async function fetchOdooExpensesStatus(
  probe = false
): Promise<OdooConnectorStatusResponse> {
  const res = await fetch(`/api/odoo/expenses${probe ? '?probe=1' : ''}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const data = (await res.json()) as OdooConnectorStatusResponse;
  if (!res.ok) {
    throw new Error('No se pudo consultar el estado del conector Odoo en el servidor.');
  }
  return data;
}

export async function submitOdooExpensesApi(params: {
  action: 'preview' | 'post';
  rows: OdooExpenseUploadRow[];
  attachReceipts: boolean;
  createExpenseSheet: boolean;
  mediaMap: Record<string, StoredReceiptMedia>;
}): Promise<OdooExpensesPostResponse> {
  const lines: OdooApiExpensePayloadItem[] = buildOdooExpenseApiPayloads(params.rows);
  const attachments = params.attachReceipts
    ? buildAttachmentBinariesMap(params.rows, params.mediaMap)
    : {};

  const res = await fetch('/api/odoo/expenses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      action: params.action,
      attachReceipts: params.attachReceipts,
      createExpenseSheet: params.createExpenseSheet,
      lines,
      attachments,
    }),
  });

  const data = (await res.json()) as OdooExpensesPostResponse;
  if (!res.ok && !data?.mode) {
    throw new Error(
      data?.error || 'Error inesperado al comunicar el lote de gastos con el servidor.'
    );
  }
  return data;
}
