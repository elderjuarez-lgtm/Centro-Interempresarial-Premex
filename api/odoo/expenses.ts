import type { IncomingMessage, ServerResponse } from 'http';

export interface OdooExpenseLineInput {
  rowKey: string;
  liquidationId: string;
  itemId: string;
  empresa: string;
  semana: string;
  name: string;
  product_id: string;
  total_amount_currency: number;
  currency_id: string;
  tax_ids: string;
  employee_id: string;
  expense_type: 'Gasto' | 'Tarjeta' | string;
  date: string;
  accounting_date?: string;
  Partner_id: string;
  Journal: string;
  vendor_ref: string;
  serial_number: string;
  payment_reference: string;
  l10n_gt_edi_doc_type: string;
  analytic_distribution: string;
  costCenterLabel?: string;
  attachmentId?: string;
  attachmentName?: string;
  attachmentMimeType?: string;
}

export interface OdooAttachmentBinaryInput {
  fileName: string;
  mimeType: string;
  base64Data: string;
}

export interface OdooPostExpensesRequestBody {
  action?: 'preview' | 'post';
  attachReceipts?: boolean;
  createExpenseSheet?: boolean;
  lines?: OdooExpenseLineInput[];
  attachments?: Record<string, OdooAttachmentBinaryInput>;
}

interface OdooEnvConfig {
  protocol: 'rest' | 'jsonrpc';
  restUrl: string;
  url: string;
  db: string;
  username: string;
  apiKey: string;
  authHeader: string;
  authPrefix: string;
  restBatchMode: 'batch' | 'per_item';
  createExpenseSheetDefault: boolean;
  missingEnvVars: string[];
  configured: boolean;
  safeHost: string | null;
}

function getOdooServerConfig(): OdooEnvConfig {
  const rawProtocol = String(process.env.ODOO_API_PROTOCOL || 'rest')
    .trim()
    .toLowerCase();
  const protocol: 'rest' | 'jsonrpc' =
    rawProtocol === 'jsonrpc' ? 'jsonrpc' : 'rest';

  const rawRestUrl = String(process.env.ODOO_REST_URL || '').trim().replace(/\/+$/, '');
  const rawBaseUrl = String(process.env.ODOO_URL || '').trim().replace(/\/+$/, '');
  const db = String(process.env.ODOO_DB || '').trim();
  const username = String(process.env.ODOO_USERNAME || '').trim();
  const apiKey = String(process.env.ODOO_API_KEY || process.env.ODOO_REST_TOKEN || '').trim();
  const authHeader = String(process.env.ODOO_AUTH_HEADER || 'Authorization').trim();
  const authPrefix =
    process.env.ODOO_AUTH_PREFIX !== undefined
      ? String(process.env.ODOO_AUTH_PREFIX).trim()
      : 'Bearer';
  const restBatchMode: 'batch' | 'per_item' =
    String(process.env.ODOO_REST_BATCH_MODE || 'batch')
      .trim()
      .toLowerCase() === 'per_item'
      ? 'per_item'
      : 'batch';
  const createExpenseSheetDefault =
    String(process.env.ODOO_CREATE_EXPENSE_SHEET || '')
      .trim()
      .toLowerCase() === 'true';

  const chosenUrlRaw = protocol === 'rest' ? rawRestUrl || rawBaseUrl : rawBaseUrl || rawRestUrl;

  let safeHost: string | null = null;
  let validUrl = '';
  if (chosenUrlRaw) {
    try {
      const parsed = new URL(chosenUrlRaw);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        validUrl =
          parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, ''));
        safeHost = parsed.host;
      }
    } catch {
      validUrl = '';
    }
  }

  const missingEnvVars: string[] = [];
  if (protocol === 'rest') {
    if (!validUrl) missingEnvVars.push('ODOO_REST_URL (o ODOO_URL)');
  } else {
    if (!validUrl) missingEnvVars.push('ODOO_URL');
    if (!db) missingEnvVars.push('ODOO_DB');
    if (!username) missingEnvVars.push('ODOO_USERNAME');
    if (!apiKey) missingEnvVars.push('ODOO_API_KEY');
  }

  return {
    protocol,
    restUrl: validUrl,
    url: validUrl,
    db,
    username,
    apiKey,
    authHeader,
    authPrefix,
    restBatchMode,
    createExpenseSheetDefault,
    missingEnvVars,
    configured:
      protocol === 'rest'
        ? Boolean(validUrl)
        : Boolean(validUrl && db && username && apiKey),
    safeHost,
  };
}

function buildRestHeaders(cfg: OdooEnvConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'Premex-Suite-Odoo-REST/1.0',
  };

  if (cfg.apiKey && cfg.authHeader) {
    const value = cfg.authPrefix ? `${cfg.authPrefix} ${cfg.apiKey}` : cfg.apiKey;
    headers[cfg.authHeader] = value;
  } else if (cfg.username && cfg.apiKey && cfg.authHeader.toLowerCase() === 'authorization') {
    const encoded = Buffer.from(`${cfg.username}:${cfg.apiKey}`, 'utf8').toString('base64');
    headers.Authorization = `Basic ${encoded}`;
  }

  return headers;
}

function normalizeNit(raw: string): string {
  return String(raw || '')
    .replace(/[-‐‑‒–—.\s]+/g, '')
    .trim()
    .toUpperCase();
}

function parseAnalyticDistributionObject(raw: string): Record<string, number> | null {
  const txt = String(raw || '').trim();
  if (!txt) return null;
  try {
    const parsed = JSON.parse(txt);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, number> = {};
      Object.entries(parsed).forEach(([k, v]) => {
        const key = String(k).trim();
        const num = Number(v);
        if (key && Number.isFinite(num) && num > 0) {
          out[key] = num;
        }
      });
      return Object.keys(out).length > 0 ? out : null;
    }
  } catch {
    const numericOnly = txt.match(/^\d+$/);
    if (numericOnly) {
      return { [txt]: 100.0 };
    }
  }
  return null;
}

function extractProductCodeAndName(rawProduct: string): { code: string; name: string } {
  const s = String(rawProduct || '').trim();
  const bracketMatch = s.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (bracketMatch) {
    return {
      code: bracketMatch[1].trim(),
      name: bracketMatch[2].trim() || s,
    };
  }
  const leadingDigits = s.match(/^(\d{4,10})\s+(.+)$/);
  if (leadingDigits) {
    return {
      code: leadingDigits[1].trim(),
      name: leadingDigits[2].trim(),
    };
  }
  return { code: '', name: s };
}

function extractDocTypeCode(rawDocType: string): string {
  const s = String(rawDocType || '').trim();
  const prefix = s.match(/^([A-Z0-9_]+)\s*-/i);
  return prefix ? prefix[1].trim().toUpperCase() : s;
}

function extractTaxCode(rawTax: string): string {
  const s = String(rawTax || '').trim();
  const prefix = s.match(/^([A-Z0-9]{2,6})\s*-/i);
  return prefix ? prefix[1].trim().toUpperCase() : s;
}

async function callOdooJsonRpc<T = unknown>(
  baseUrl: string,
  service: 'common' | 'object',
  method: string,
  args: unknown[],
  timeoutMs = 15000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const endpoint = `${baseUrl}/jsonrpc`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Premex-Suite-Odoo-Expenses/1.0',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service,
          method,
          args,
        },
        id: Math.floor(Math.random() * 1_000_000_000),
      }),
    });

    if (!response.ok) {
      throw new Error(`Odoo HTTP ${response.status} (${response.statusText || 'Error'})`);
    }

    const payload = (await response.json()) as {
      result?: T;
      error?: {
        message?: string;
        data?: { message?: string; debug?: string };
      };
    };

    if (payload.error) {
      const detail =
        payload.error.data?.message || payload.error.message || 'Error JSON-RPC en Odoo';
      throw new Error(detail);
    }

    return payload.result as T;
  } finally {
    clearTimeout(timer);
  }
}

async function executeKw<T = unknown>(
  cfg: OdooEnvConfig,
  uid: number,
  model: string,
  method: string,
  args: unknown[],
  kwargs?: Record<string, unknown>
): Promise<T> {
  const fullArgs: unknown[] = [cfg.db, uid, cfg.apiKey, model, method, args];
  if (kwargs && Object.keys(kwargs).length > 0) {
    fullArgs.push(kwargs);
  }
  return callOdooJsonRpc<T>(cfg.url, 'object', 'execute_kw', fullArgs, 20000);
}

interface LinePreflightIssue {
  rowKey: string;
  severity: 'error' | 'warning';
  field: string;
  message: string;
}

function validateAndBuildPreparedRecord(line: OdooExpenseLineInput): {
  prepared: Record<string, unknown>;
  issues: LinePreflightIssue[];
} {
  const issues: LinePreflightIssue[] = [];
  const rowKey = String(line.rowKey || `${line.liquidationId}__${line.itemId}`);

  if (!String(line.name || '').trim()) {
    issues.push({
      rowKey,
      severity: 'error',
      field: 'name',
      message: 'Falta la descripción del gasto (name).',
    });
  }
  if (!String(line.product_id || '').trim()) {
    issues.push({
      rowKey,
      severity: 'error',
      field: 'product_id',
      message: 'Falta la categoría / producto Odoo (product_id).',
    });
  }
  if (!(Number(line.total_amount_currency) > 0)) {
    issues.push({
      rowKey,
      severity: 'error',
      field: 'total_amount_currency',
      message: 'El monto total debe ser mayor a 0.',
    });
  }
  if (!String(line.employee_id || '').trim()) {
    issues.push({
      rowKey,
      severity: 'error',
      field: 'employee_id',
      message: 'Falta el nombre del empleado Odoo (employee_id).',
    });
  }
  if (!String(line.date || '').trim() || !/^\d{4}-\d{2}-\d{2}$/.test(String(line.date).trim())) {
    issues.push({
      rowKey,
      severity: 'error',
      field: 'date',
      message: 'Fecha del gasto inválida (esperado YYYY-MM-DD).',
    });
  }

  const analyticObj = parseAnalyticDistributionObject(line.analytic_distribution);
  if (!analyticObj) {
    issues.push({
      rowKey,
      severity: 'warning',
      field: 'analytic_distribution',
      message: 'Sin Distribución Analítica JSON válida (ej. {"549": 100.0}).',
    });
  }

  if (!normalizeNit(line.Partner_id)) {
    issues.push({
      rowKey,
      severity: 'warning',
      field: 'Partner_id',
      message: 'Sin NIT de proveedor (Partner_id); en Odoo quedará sin proveedor vinculado si no existe.',
    });
  }

  const prepared = {
    rowKey,
    liquidationId: String(line.liquidationId || ''),
    itemId: String(line.itemId || ''),
    empresa: String(line.empresa || '').trim(),
    semana: String(line.semana || '').trim(),
    name: String(line.name || '').trim().slice(0, 180),
    product_id: String(line.product_id || '').trim(),
    total_amount_currency: Number(Number(line.total_amount_currency || 0).toFixed(2)),
    currency_id: String(line.currency_id || 'GTQ').trim().toUpperCase(),
    tax_ids: String(line.tax_ids || '').trim(),
    employee_id: String(line.employee_id || '').trim(),
    expense_type: line.expense_type === 'Tarjeta' ? 'Tarjeta' : 'Gasto',
    payment_mode: line.expense_type === 'Tarjeta' ? 'company_account' : 'own_account',
    date: String(line.date || '').trim(),
    accounting_date: String(line.accounting_date || line.date || '').trim(),
    Partner_id: normalizeNit(line.Partner_id),
    Journal: String(line.Journal || '').trim(),
    vendor_ref: String(line.vendor_ref || '').trim(),
    serial_number: String(line.serial_number || '').trim(),
    payment_reference: String(line.payment_reference || '').trim(),
    l10n_gt_edi_doc_type: String(line.l10n_gt_edi_doc_type || '').trim(),
    analytic_distribution: analyticObj || {},
    analytic_distribution_raw: String(line.analytic_distribution || '').trim(),
    cost_center_label: String(line.costCenterLabel || '').trim(),
    ...(line.attachmentId ? { attachmentId: line.attachmentId } : {}),
    ...(line.attachmentName ? { attachmentName: line.attachmentName } : {}),
  };

  return { prepared, issues };
}

function extractNumericId(val: unknown): number | null {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export async function processOdooStatusRequest(probe = false): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const cfg = getOdooServerConfig();
  const baseBody: Record<string, unknown> = {
    ok: true,
    protocol: cfg.protocol,
    configured: cfg.configured,
    missingEnvVars: cfg.missingEnvVars,
    odooHost: cfg.safeHost,
    odooDbConfigured: Boolean(cfg.db),
    odooUsernameConfigured: Boolean(cfg.username),
    odooApiKeyConfigured: Boolean(cfg.apiKey),
    createExpenseSheetDefault: cfg.createExpenseSheetDefault,
    checkedAtIso: new Date().toISOString(),
  };

  if (!probe) {
    return { status: 200, body: baseBody };
  }

  if (!cfg.configured) {
    return {
      status: 200,
      body: {
        ...baseBody,
        probeResult: {
          reachable: false,
          authenticated: false,
          hrExpenseAvailable: false,
          checkedAtIso: new Date().toISOString(),
          message: `Falta configurar en el servidor: ${cfg.missingEnvVars.join(
            ', '
          )}. La conexión está lista en formato API REST (JSON); solo agrega la URL cuando la tengas disponible.`,
        },
      },
    };
  }

  if (cfg.protocol === 'rest') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(cfg.restUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: buildRestHeaders(cfg),
      });
      const httpStatus = response.status;
      // In REST APIs, a POST-only endpoint often responds 200/204/405/401/403 when probed with GET
      const reachable = httpStatus >= 200 && httpStatus < 500;
      const authFailed = httpStatus === 401 || httpStatus === 403;
      return {
        status: 200,
        body: {
          ...baseBody,
          probeResult: {
            reachable,
            authenticated: reachable && !authFailed,
            httpStatus,
            hrExpenseAvailable: reachable && !authFailed,
            checkedAtIso: new Date().toISOString(),
            message: authFailed
              ? `Endpoint REST (${cfg.safeHost}) alcanzó respuesta HTTP ${httpStatus}, pero requiere revisar token/credenciales.`
              : reachable
              ? `Endpoint API REST JSON accesible (${cfg.safeHost} · HTTP ${httpStatus}). Listo para enviar gastos por POST JSON.`
              : `El endpoint REST respondió HTTP ${httpStatus}.`,
          },
        },
      };
    } catch (err: any) {
      return {
        status: 200,
        body: {
          ...baseBody,
          probeResult: {
            reachable: false,
            authenticated: false,
            httpStatus: null,
            hrExpenseAvailable: false,
            checkedAtIso: new Date().toISOString(),
            message: `No se pudo contactar la URL REST (${cfg.safeHost || 'sin host'}): ${String(
              err?.message || 'Error de red'
            )}`,
          },
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // Secondary JSON-RPC probe if ODOO_API_PROTOCOL=jsonrpc
  try {
    const versionInfo = await callOdooJsonRpc<{
      server_version?: string;
    }>(cfg.url, 'common', 'version', []);

    const uid = await callOdooJsonRpc<number | false>(cfg.url, 'common', 'authenticate', [
      cfg.db,
      cfg.username,
      cfg.apiKey,
      {},
    ]);

    if (!uid || typeof uid !== 'number') {
      return {
        status: 200,
        body: {
          ...baseBody,
          probeResult: {
            reachable: true,
            authenticated: false,
            serverVersion: versionInfo?.server_version || null,
            hrExpenseAvailable: false,
            checkedAtIso: new Date().toISOString(),
            message:
              'El servidor Odoo respondió, pero rechazó las credenciales (ODOO_DB / ODOO_USERNAME / ODOO_API_KEY).',
          },
        },
      };
    }

    const expenseFields = await executeKw<Record<string, unknown>>(
      cfg,
      uid,
      'hr.expense',
      'fields_get',
      [],
      { attributes: ['string', 'type'] }
    );

    return {
      status: 200,
      body: {
        ...baseBody,
        probeResult: {
          reachable: true,
          authenticated: true,
          uid,
          serverVersion: versionInfo?.server_version || null,
          hrExpenseAvailable: Boolean(expenseFields && typeof expenseFields === 'object'),
          detectedExpenseFieldsCount: expenseFields ? Object.keys(expenseFields).length : 0,
          checkedAtIso: new Date().toISOString(),
          message: `Conexión JSON-RPC exitosa a Odoo (${versionInfo?.server_version || ''}) · UID ${uid}.`,
        },
      },
    };
  } catch (err: any) {
    return {
      status: 200,
      body: {
        ...baseBody,
        probeResult: {
          reachable: false,
          authenticated: false,
          hrExpenseAvailable: false,
          checkedAtIso: new Date().toISOString(),
          message: `No se pudo conectar con Odoo desde el servidor: ${String(
            err?.message || 'Error de red'
          )}`,
        },
      },
    };
  }
}

async function postExpensesViaRestJson(params: {
  cfg: OdooEnvConfig;
  lines: OdooExpenseLineInput[];
  preparedRecords: Record<string, unknown>[];
  attachReceipts: boolean;
  createExpenseSheet: boolean;
  attachmentsMap: Record<string, OdooAttachmentBinaryInput>;
}): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const { cfg, lines, preparedRecords, attachReceipts, createExpenseSheet, attachmentsMap } =
    params;
  const headers = buildRestHeaders(cfg);

  const createdResults: {
    rowKey: string;
    liquidationId: string;
    odooExpenseId: number | null;
    odooAttachmentId: number | null;
    status: 'created' | 'error';
    warnings: string[];
    error?: string;
  }[] = [];
  const expenseIdsByLiq: Record<string, number[]> = {};
  const sheetIdsByLiq: Record<string, number> = {};

  if (cfg.restBatchMode === 'per_item') {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const rec = preparedRecords[i];
      const attBinary =
        attachReceipts && line.attachmentId ? attachmentsMap[line.attachmentId] : undefined;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch(cfg.restUrl, {
          method: 'POST',
          signal: controller.signal,
          headers,
          body: JSON.stringify({
            model: 'hr.expense',
            source: 'premex-viaticos',
            createExpenseSheet,
            ...rec,
            ...(attBinary ? { attachment: attBinary } : {}),
          }),
        });
        const text = await res.text();
        let parsed: Record<string, any> = {};
        try {
          parsed = text ? (JSON.parse(text) as Record<string, any>) : {};
        } catch {
          parsed = { raw: text };
        }
        if (!res.ok) {
          throw new Error(
            String(parsed?.error || parsed?.message || `HTTP ${res.status} desde API REST`)
          );
        }

        const expId =
          extractNumericId(parsed?.id) ??
          extractNumericId(parsed?.odooExpenseId) ??
          extractNumericId(parsed?.expense_id) ??
          extractNumericId(parsed?.data?.id);
        const attId =
          extractNumericId(parsed?.attachment_id) ??
          extractNumericId(parsed?.odooAttachmentId);

        if (expId) {
          expenseIdsByLiq[line.liquidationId] = [
            ...(expenseIdsByLiq[line.liquidationId] || []),
            expId,
          ];
        }

        createdResults.push({
          rowKey: line.rowKey,
          liquidationId: line.liquidationId,
          odooExpenseId: expId,
          odooAttachmentId: attId,
          status: 'created',
          warnings: [],
        });
      } catch (err: any) {
        createdResults.push({
          rowKey: line.rowKey,
          liquidationId: line.liquidationId,
          odooExpenseId: null,
          odooAttachmentId: null,
          status: 'error',
          warnings: [],
          error: String(err?.message || 'Error enviando línea a la API REST'),
        });
      } finally {
        clearTimeout(timer);
      }
    }
  } else {
    // Batch JSON REST POST
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const restPayload = {
        model: 'hr.expense',
        source: 'premex-viaticos',
        generatedAtIso: new Date().toISOString(),
        attachReceipts,
        createExpenseSheet,
        totalLines: preparedRecords.length,
        lines: preparedRecords,
        ...(attachReceipts && Object.keys(attachmentsMap).length > 0
          ? { attachments: attachmentsMap }
          : {}),
      };

      const res = await fetch(cfg.restUrl, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: JSON.stringify(restPayload),
      });

      const text = await res.text();
      let parsed: Record<string, any> = {};
      try {
        parsed = text ? (JSON.parse(text) as Record<string, any>) : {};
      } catch {
        parsed = { raw: text };
      }

      if (!res.ok) {
        return {
          status: res.status >= 400 && res.status < 600 ? res.status : 502,
          body: {
            ok: false,
            protocol: 'rest',
            mode: res.status === 401 || res.status === 403 ? 'auth_error' : 'connection_error',
            configured: true,
            odooHost: cfg.safeHost,
            error: String(
              parsed?.error ||
                parsed?.message ||
                `La API REST respondió HTTP ${res.status} (${res.statusText || 'Error'}).`
            ),
          },
        };
      }

      // Parse flexible REST response shapes (results array, ids array, or data array)
      const returnedResults = Array.isArray(parsed?.results)
        ? parsed.results
        : Array.isArray(parsed?.data)
        ? parsed.data
        : null;
      const returnedIds = Array.isArray(parsed?.ids)
        ? parsed.ids
        : Array.isArray(parsed?.expense_ids)
        ? parsed.expense_ids
        : null;

      lines.forEach((line, idx) => {
        const matchedResult =
          returnedResults?.find(
            (r: any) =>
              r?.rowKey === line.rowKey ||
              (r?.itemId && r.itemId === line.itemId)
          ) || returnedResults?.[idx];

        const expId =
          extractNumericId(matchedResult?.odooExpenseId) ??
          extractNumericId(matchedResult?.expense_id) ??
          extractNumericId(matchedResult?.id) ??
          (returnedIds ? extractNumericId(returnedIds[idx]) : null);

        const attId =
          extractNumericId(matchedResult?.odooAttachmentId) ??
          extractNumericId(matchedResult?.attachment_id);

        const hasRowError = matchedResult?.status === 'error' || Boolean(matchedResult?.error);
        if (expId && !hasRowError) {
          expenseIdsByLiq[line.liquidationId] = [
            ...(expenseIdsByLiq[line.liquidationId] || []),
            expId,
          ];
        }

        createdResults.push({
          rowKey: line.rowKey,
          liquidationId: line.liquidationId,
          odooExpenseId: expId,
          odooAttachmentId: attId,
          status: hasRowError ? 'error' : 'created',
          warnings: Array.isArray(matchedResult?.warnings) ? matchedResult.warnings : [],
          ...(hasRowError
            ? { error: String(matchedResult?.error || 'Error reportado por API REST') }
            : {}),
        });
      });

      if (parsed?.expenseIdsByLiq && typeof parsed.expenseIdsByLiq === 'object') {
        Object.entries(parsed.expenseIdsByLiq).forEach(([k, v]) => {
          if (Array.isArray(v)) {
            const clean = v
              .map(extractNumericId)
              .filter((n): n is number => n !== null);
            if (clean.length > 0) expenseIdsByLiq[k] = clean;
          }
        });
      }
      if (parsed?.sheetIdsByLiq && typeof parsed.sheetIdsByLiq === 'object') {
        Object.entries(parsed.sheetIdsByLiq).forEach(([k, v]) => {
          const clean = extractNumericId(v);
          if (clean !== null) sheetIdsByLiq[k] = clean;
        });
      }
    } catch (err: any) {
      return {
        status: 502,
        body: {
          ok: false,
          protocol: 'rest',
          mode: 'connection_error',
          configured: true,
          odooHost: cfg.safeHost,
          error: `Error conectando con API REST (${cfg.safeHost}): ${String(
            err?.message || 'Error de red'
          )}`,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  const successCount = createdResults.filter((r) => r.status === 'created').length;
  const errorCount = createdResults.filter((r) => r.status === 'error').length;

  return {
    status: errorCount === createdResults.length && createdResults.length > 0 ? 500 : 200,
    body: {
      ok: errorCount === 0,
      protocol: 'rest',
      mode: 'posted',
      configured: true,
      odooHost: cfg.safeHost,
      successCount,
      errorCount,
      expenseIdsByLiq,
      sheetIdsByLiq,
      results: createdResults,
      message:
        errorCount === 0
          ? `Se enviaron ${successCount} línea(s) de gasto vía API REST (JSON) hacia ${cfg.safeHost}.`
          : `Se enviaron ${successCount} línea(s) vía API REST y ${errorCount} línea(s) presentaron error.`,
    },
  };
}

export async function processOdooExpensesRequest(
  rawBody: OdooPostExpensesRequestBody
): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const cfg = getOdooServerConfig();
  const action = rawBody?.action === 'post' ? 'post' : 'preview';
  const attachReceipts = rawBody?.attachReceipts !== false;
  const createExpenseSheet =
    typeof rawBody?.createExpenseSheet === 'boolean'
      ? rawBody.createExpenseSheet
      : cfg.createExpenseSheetDefault;
  const lines = Array.isArray(rawBody?.lines) ? rawBody.lines.slice(0, 400) : [];
  const attachmentsMap =
    rawBody?.attachments && typeof rawBody.attachments === 'object'
      ? rawBody.attachments
      : {};

  if (lines.length === 0) {
    return {
      status: 400,
      body: {
        ok: false,
        error: 'No se recibieron líneas de gastos (hr.expense) para procesar.',
      },
    };
  }

  const allIssues: LinePreflightIssue[] = [];
  const preparedLines = lines.map((line) => {
    const { prepared, issues } = validateAndBuildPreparedRecord(line);
    allIssues.push(...issues);
    return {
      rowKey: line.rowKey,
      liquidationId: line.liquidationId,
      itemId: line.itemId,
      hasAttachmentBinary: Boolean(line.attachmentId && attachmentsMap[line.attachmentId]),
      prepared,
    };
  });

  const blockingErrors = allIssues.filter((i) => i.severity === 'error');

  // Return dry-run/prepared payload if action is 'preview' OR URL isn't configured yet
  if (action === 'preview' || !cfg.configured) {
    return {
      status: 200,
      body: {
        ok: blockingErrors.length === 0,
        protocol: cfg.protocol,
        mode: 'prepared_dry_run',
        configured: cfg.configured,
        missingEnvVars: cfg.missingEnvVars,
        odooHost: cfg.safeHost,
        model: 'hr.expense',
        totalLines: preparedLines.length,
        blockingErrorsCount: blockingErrors.length,
        issues: allIssues,
        preparedLines,
        message: !cfg.configured
          ? `Payload JSON REST validado para ${preparedLines.length} línea(s) de Gastos (hr.expense). Pendiente agregar en el servidor: ${cfg.missingEnvVars.join(
              ', '
            )}.`
          : `Vista previa JSON REST validada para ${preparedLines.length} línea(s) de Gastos Odoo.`,
      },
    };
  }

  if (blockingErrors.length > 0) {
    return {
      status: 422,
      body: {
        ok: false,
        protocol: cfg.protocol,
        mode: 'validation_failed',
        configured: true,
        error: `Hay ${blockingErrors.length} campo(s) obligatorio(s) faltante(s) antes de enviar por API REST.`,
        issues: allIssues,
        preparedLines,
      },
    };
  }

  // Primary Mode: HTTP REST API (JSON)
  if (cfg.protocol === 'rest') {
    return postExpensesViaRestJson({
      cfg,
      lines,
      preparedRecords: preparedLines.map((p) => p.prepared),
      attachReceipts,
      createExpenseSheet,
      attachmentsMap,
    });
  }

  // Secondary Mode: Odoo native JSON-RPC if explicitly configured with ODOO_API_PROTOCOL=jsonrpc
  try {
    const uid = await callOdooJsonRpc<number | false>(cfg.url, 'common', 'authenticate', [
      cfg.db,
      cfg.username,
      cfg.apiKey,
      {},
    ]);

    if (!uid || typeof uid !== 'number') {
      return {
        status: 401,
        body: {
          ok: false,
          protocol: 'jsonrpc',
          mode: 'auth_error',
          configured: true,
          error:
            'Odoo rechazó la autenticación (ODOO_DB / ODOO_USERNAME / ODOO_API_KEY). Verifica el token API en el servidor.',
        },
      };
    }

    const hrExpenseFields = await executeKw<
      Record<string, { type?: string; string?: string; selection?: [string, string][] }>
    >(cfg, uid, 'hr.expense', 'fields_get', [], {
      attributes: ['type', 'string', 'selection'],
    });

    const companyCache = new Map<string, number | null>();
    const currencyCache = new Map<string, number | null>();
    const productCache = new Map<string, number | null>();
    const employeeCache = new Map<string, number | null>();
    const taxCache = new Map<string, number | null>();
    const partnerCache = new Map<string, number | null>();
    const journalCache = new Map<string, number | null>();

    const resolveCompanyId = async (empresaName: string): Promise<number | null> => {
      const key = String(empresaName || '').trim().toUpperCase();
      if (!key) return null;
      if (companyCache.has(key)) return companyCache.get(key) ?? null;
      const rows = await executeKw<{ id: number; name: string }[]>(
        cfg,
        uid,
        'res.company',
        'search_read',
        [[['name', 'ilike', key.slice(0, 24)]]],
        { fields: ['id', 'name'], limit: 5 }
      );
      const id = rows?.[0]?.id ?? null;
      companyCache.set(key, id);
      return id;
    };

    const resolveCurrencyId = async (code: string): Promise<number | null> => {
      const key = String(code || 'GTQ').trim().toUpperCase();
      if (currencyCache.has(key)) return currencyCache.get(key) ?? null;
      const rows = await executeKw<{ id: number; name: string }[]>(
        cfg,
        uid,
        'res.currency',
        'search_read',
        [[['name', '=', key]]],
        { fields: ['id', 'name'], limit: 1 }
      );
      const id = rows?.[0]?.id ?? null;
      currencyCache.set(key, id);
      return id;
    };

    const resolveProductId = async (rawProduct: string): Promise<number | null> => {
      const key = String(rawProduct || '').trim();
      if (!key) return null;
      if (productCache.has(key)) return productCache.get(key) ?? null;
      const { code, name } = extractProductCodeAndName(key);
      let rows: { id: number; name: string; default_code?: string }[] = [];
      if (code) {
        rows = await executeKw(
          cfg,
          uid,
          'product.product',
          'search_read',
          [[['can_be_expensed', '=', true], ['default_code', '=', code]]],
          { fields: ['id', 'name', 'default_code'], limit: 1 }
        );
      }
      if (!rows?.length && name) {
        rows = await executeKw(
          cfg,
          uid,
          'product.product',
          'search_read',
          [[['can_be_expensed', '=', true], ['name', 'ilike', name]]],
          { fields: ['id', 'name', 'default_code'], limit: 1 }
        );
      }
      const id = rows?.[0]?.id ?? null;
      productCache.set(key, id);
      return id;
    };

    const resolveEmployeeId = async (rawEmployee: string): Promise<number | null> => {
      const key = String(rawEmployee || '').trim();
      if (!key) return null;
      if (employeeCache.has(key)) return employeeCache.get(key) ?? null;
      const rows = await executeKw<{ id: number; name: string }[]>(
        cfg,
        uid,
        'hr.employee',
        'search_read',
        [[['name', 'ilike', key]]],
        { fields: ['id', 'name'], limit: 3 }
      );
      const exact = rows?.find((r) => r.name.trim().toUpperCase() === key.toUpperCase());
      const id = exact?.id ?? rows?.[0]?.id ?? null;
      employeeCache.set(key, id);
      return id;
    };

    const resolveTaxId = async (rawTax: string, companyId: number | null): Promise<number | null> => {
      const key = `${companyId || 0}__${String(rawTax || '').trim()}`;
      if (!String(rawTax || '').trim()) return null;
      if (taxCache.has(key)) return taxCache.get(key) ?? null;

      const taxCode = extractTaxCode(rawTax);
      const baseDomain: unknown[] = [
        ['type_tax_use', '=', 'purchase'],
        '|',
        ['name', 'ilike', rawTax.trim()],
        ['name', 'ilike', `${taxCode} -`],
      ];
      if (companyId) baseDomain.unshift(['company_id', '=', companyId]);

      let rows = await executeKw<{ id: number; name: string }[]>(
        cfg,
        uid,
        'account.tax',
        'search_read',
        [baseDomain],
        { fields: ['id', 'name'], limit: 3 }
      );
      if (!rows?.length && taxCode) {
        const fallbackDomain: unknown[] = [
          ['type_tax_use', '=', 'purchase'],
          ['name', '=like', `${taxCode}%`],
        ];
        if (companyId) fallbackDomain.unshift(['company_id', '=', companyId]);
        rows = await executeKw(cfg, uid, 'account.tax', 'search_read', [fallbackDomain], {
          fields: ['id', 'name'],
          limit: 3,
        });
      }
      const id = rows?.[0]?.id ?? null;
      taxCache.set(key, id);
      return id;
    };

    const resolvePartnerId = async (rawNit: string): Promise<number | null> => {
      const cleanNit = normalizeNit(rawNit);
      if (!cleanNit || cleanNit === 'CF') return null;
      if (partnerCache.has(cleanNit)) return partnerCache.get(cleanNit) ?? null;
      const rows = await executeKw<{ id: number; name: string; vat?: string }[]>(
        cfg,
        uid,
        'res.partner',
        'search_read',
        [['|', ['vat', '=', cleanNit], ['vat', 'ilike', cleanNit]]],
        { fields: ['id', 'name', 'vat'], limit: 3 }
      );
      const id = rows?.[0]?.id ?? null;
      partnerCache.set(cleanNit, id);
      return id;
    };

    const resolveJournalId = async (
      rawJournal: string,
      companyId: number | null
    ): Promise<number | null> => {
      const key = `${companyId || 0}__${String(rawJournal || '').trim()}`;
      if (!String(rawJournal || '').trim()) return null;
      if (journalCache.has(key)) return journalCache.get(key) ?? null;
      const domain: unknown[] = [['name', 'ilike', rawJournal.trim()]];
      if (companyId) domain.unshift(['company_id', '=', companyId]);
      const rows = await executeKw<{ id: number; name: string }[]>(
        cfg,
        uid,
        'account.journal',
        'search_read',
        [domain],
        { fields: ['id', 'name'], limit: 2 }
      );
      const id = rows?.[0]?.id ?? null;
      journalCache.set(key, id);
      return id;
    };

    const createdResults: {
      rowKey: string;
      liquidationId: string;
      odooExpenseId: number | null;
      odooAttachmentId: number | null;
      status: 'created' | 'error';
      warnings: string[];
      error?: string;
    }[] = [];

    const createdIdsByLiq = new Map<
      string,
      { ids: number[]; employeeId: number | null; companyId: number | null; sheetLabel: string }
    >();

    for (const line of lines) {
      const lineWarnings: string[] = [];
      try {
        const companyId = await resolveCompanyId(line.empresa);
        const currencyId = await resolveCurrencyId(line.currency_id || 'GTQ');
        const productId = await resolveProductId(line.product_id);
        const employeeId = await resolveEmployeeId(line.employee_id);
        const taxId = line.tax_ids ? await resolveTaxId(line.tax_ids, companyId) : null;
        const partnerId = line.Partner_id ? await resolvePartnerId(line.Partner_id) : null;
        const journalId = line.Journal ? await resolveJournalId(line.Journal, companyId) : null;

        if (!productId) {
          throw new Error(`No se encontró la categoría/producto en Odoo: "${line.product_id}"`);
        }
        if (!employeeId) {
          throw new Error(`No se encontró el empleado en Odoo: "${line.employee_id}"`);
        }
        if (line.tax_ids && !taxId) {
          lineWarnings.push(`Impuesto no encontrado en Odoo: "${line.tax_ids}"`);
        }
        if (line.Partner_id && normalizeNit(line.Partner_id) !== 'CF' && !partnerId) {
          lineWarnings.push(`Proveedor con NIT "${line.Partner_id}" no encontrado en Odoo`);
        }

        const vals: Record<string, unknown> = {
          name: String(line.name || '').trim().slice(0, 180),
          product_id: productId,
          employee_id: employeeId,
          date: String(line.date || '').trim(),
          payment_mode: line.expense_type === 'Tarjeta' ? 'company_account' : 'own_account',
        };

        if ('total_amount_currency' in hrExpenseFields) {
          vals.total_amount_currency = Number(Number(line.total_amount_currency || 0).toFixed(2));
        } else if ('total_amount' in hrExpenseFields) {
          vals.total_amount = Number(Number(line.total_amount_currency || 0).toFixed(2));
        }
        if (currencyId && 'currency_id' in hrExpenseFields) vals.currency_id = currencyId;
        if (companyId && 'company_id' in hrExpenseFields) vals.company_id = companyId;
        if (taxId && 'tax_ids' in hrExpenseFields) {
          vals.tax_ids = [[6, 0, [taxId]]];
        } else if ('tax_ids' in hrExpenseFields && !line.tax_ids) {
          vals.tax_ids = [[6, 0, []]];
        }
        if ('expense_type' in hrExpenseFields) {
          const fieldMeta = hrExpenseFields.expense_type;
          if (fieldMeta?.type === 'selection' && Array.isArray(fieldMeta.selection)) {
            const want = String(line.expense_type || 'Gasto').toLowerCase();
            const matchOpt = fieldMeta.selection.find(
              ([k, lbl]) =>
                String(k).toLowerCase() === want || String(lbl).toLowerCase() === want
            );
            if (matchOpt) vals.expense_type = matchOpt[0];
          }
        }
        if (partnerId && 'partner_id' in hrExpenseFields) vals.partner_id = partnerId;
        if (journalId && 'journal_id' in hrExpenseFields) vals.journal_id = journalId;
        if (line.accounting_date && 'accounting_date' in hrExpenseFields) {
          vals.accounting_date = line.accounting_date;
        }
        if (line.vendor_ref) {
          if ('vendor_ref' in hrExpenseFields) vals.vendor_ref = line.vendor_ref;
          else if ('reference' in hrExpenseFields) vals.reference = line.vendor_ref;
        }
        if (line.serial_number && 'serial_number' in hrExpenseFields) {
          vals.serial_number = line.serial_number;
        }
        if (line.payment_reference && 'payment_reference' in hrExpenseFields) {
          vals.payment_reference = line.payment_reference;
        }
        if (line.l10n_gt_edi_doc_type && 'l10n_gt_edi_doc_type' in hrExpenseFields) {
          const docField = hrExpenseFields.l10n_gt_edi_doc_type;
          const docCode = extractDocTypeCode(line.l10n_gt_edi_doc_type);
          if (docField?.type === 'selection' && Array.isArray(docField.selection)) {
            const matchedSel = docField.selection.find(
              ([k, lbl]) =>
                String(k).toUpperCase() === docCode ||
                String(lbl).toUpperCase().includes(docCode) ||
                String(lbl).toUpperCase() === line.l10n_gt_edi_doc_type.trim().toUpperCase()
            );
            if (matchedSel) vals.l10n_gt_edi_doc_type = matchedSel[0];
          } else if (docField?.type === 'char') {
            vals.l10n_gt_edi_doc_type = docCode;
          }
        }
        const analyticObj = parseAnalyticDistributionObject(line.analytic_distribution);
        if (analyticObj && 'analytic_distribution' in hrExpenseFields) {
          vals.analytic_distribution = analyticObj;
        }

        const createdId = await executeKw<number>(cfg, uid, 'hr.expense', 'create', [vals]);

        let attachmentIdOdoo: number | null = null;
        if (attachReceipts && line.attachmentId && attachmentsMap[line.attachmentId]) {
          const att = attachmentsMap[line.attachmentId];
          if (att?.base64Data) {
            attachmentIdOdoo = await executeKw<number>(cfg, uid, 'ir.attachment', 'create', [
              {
                name: att.fileName || line.attachmentName || `recibo_${createdId}.pdf`,
                type: 'binary',
                datas: att.base64Data,
                mimetype: att.mimeType || line.attachmentMimeType || 'application/pdf',
                res_model: 'hr.expense',
                res_id: createdId,
              },
            ]);
          }
        }

        createdResults.push({
          rowKey: line.rowKey,
          liquidationId: line.liquidationId,
          odooExpenseId: createdId,
          odooAttachmentId: attachmentIdOdoo,
          status: 'created',
          warnings: lineWarnings,
        });

        const bucket = createdIdsByLiq.get(line.liquidationId);
        if (bucket) {
          bucket.ids.push(createdId);
        } else {
          createdIdsByLiq.set(line.liquidationId, {
            ids: [createdId],
            employeeId,
            companyId,
            sheetLabel:
              String(line.payment_reference || '').trim() ||
              `LIQ. SEM ${line.semana || ''} · ${line.employee_id}`.trim(),
          });
        }
      } catch (lineErr: any) {
        createdResults.push({
          rowKey: line.rowKey,
          liquidationId: line.liquidationId,
          odooExpenseId: null,
          odooAttachmentId: null,
          status: 'error',
          warnings: lineWarnings,
          error: String(lineErr?.message || 'Error creando línea hr.expense en Odoo'),
        });
      }
    }

    const sheetIdsByLiq: Record<string, number> = {};
    if (createExpenseSheet) {
      for (const [liqId, group] of createdIdsByLiq.entries()) {
        if (group.ids.length === 0 || !group.employeeId) continue;
        try {
          const sheetVals: Record<string, unknown> = {
            name: group.sheetLabel.slice(0, 120),
            employee_id: group.employeeId,
            expense_line_ids: [[6, 0, group.ids]],
          };
          if (group.companyId) sheetVals.company_id = group.companyId;
          const sheetId = await executeKw<number>(
            cfg,
            uid,
            'hr.expense.sheet',
            'create',
            [sheetVals]
          );
          sheetIdsByLiq[liqId] = sheetId;
        } catch {
          // Non-fatal
        }
      }
    }

    const successCount = createdResults.filter((r) => r.status === 'created').length;
    const errorCount = createdResults.filter((r) => r.status === 'error').length;

    const expenseIdsByLiq: Record<string, number[]> = {};
    createdIdsByLiq.forEach((v, k) => {
      expenseIdsByLiq[k] = v.ids;
    });

    return {
      status: errorCount === createdResults.length ? 500 : 200,
      body: {
        ok: errorCount === 0,
        protocol: 'jsonrpc',
        mode: 'posted',
        configured: true,
        odooHost: cfg.safeHost,
        successCount,
        errorCount,
        expenseIdsByLiq,
        sheetIdsByLiq,
        results: createdResults,
        message:
          errorCount === 0
            ? `Se contabilizaron ${successCount} línea(s) de gasto directamente en Odoo (hr.expense).`
            : `Se contabilizaron ${successCount} línea(s) en Odoo y ${errorCount} línea(s) presentaron error.`,
      },
    };
  } catch (err: any) {
    return {
      status: 502,
      body: {
        ok: false,
        protocol: 'jsonrpc',
        mode: 'connection_error',
        configured: true,
        error: `Error al comunicarse con Odoo: ${String(err?.message || 'Error de red')}`,
      },
    };
  }
}

type VercelLikeReq = IncomingMessage & { body?: unknown; url?: string };
type VercelLikeRes = ServerResponse & {
  status?: (code: number) => VercelLikeRes;
  json?: (data: unknown) => void;
};

async function readJsonBody(req: VercelLikeReq): Promise<OdooPostExpensesRequestBody> {
  if (req.body && typeof req.body === 'object') {
    return req.body as OdooPostExpensesRequestBody;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body) as OdooPostExpensesRequestBody;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? (JSON.parse(raw) as OdooPostExpensesRequestBody) : {};
}

function sendJson(res: VercelLikeRes, status: number, payload: Record<string, unknown>) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (typeof res.status === 'function') {
    const sRes = res.status(status);
    if (typeof sRes.json === 'function') {
      sRes.json(payload);
      return;
    }
  }
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

export default async function handler(req: VercelLikeReq, res: VercelLikeRes) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method === 'GET') {
    const reqUrl = String(req.url || '');
    const probe = reqUrl.includes('probe=1') || reqUrl.includes('probe=true');
    const result = await processOdooStatusRequest(probe);
    sendJson(res, result.status, result.body);
    return;
  }
  if (req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const result = await processOdooExpensesRequest(body);
      sendJson(res, result.status, result.body);
    } catch {
      sendJson(res, 400, { ok: false, error: 'Cuerpo JSON inválido en solicitud Odoo.' });
    }
    return;
  }
  sendJson(res, 405, { ok: false, error: 'Método no permitido.' });
}
