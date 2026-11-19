import { getAccessToken, setAccessToken } from './auth';
import {
  MaterializedActivityAssignment,
  formatPeriodLabel,
  formatShortDateEs,
  formatDateTimeEs,
} from '../utils/activities';
import { ActivityGoogleTaskLink } from '../types';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TASKS_API_BASE = 'https://tasks.googleapis.com/tasks/v1';

export const PREMEX_GOOGLE_TASKS_LIST_TITLE = 'Mis tareas (Gmail)';
export const LEGACY_PREMEX_GOOGLE_TASKS_LIST_TITLE = 'Premex · Panel de Actividades';

export class GoogleWorkspaceAuthError extends Error {
  readonly statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'GoogleWorkspaceAuthError';
    this.statusCode = statusCode;
  }
}

const requireToken = async (tokenOverride?: string | null): Promise<string> => {
  const candidate = (tokenOverride || '').trim() || (await getAccessToken()) || '';
  if (!candidate) {
    throw new GoogleWorkspaceAuthError(
      'Activa tu sesión de Google para habilitar Gmail y Google Tasks.',
      401
    );
  }
  return candidate;
};

const parseWorkspaceError = async (res: Response, serviceName: string): Promise<Error> => {
  const body = await res.json().catch(() => ({}));
  const msg = String(body?.error?.message || `Error HTTP ${res.status}`);
  const lower = msg.toLowerCase();

  if (res.status === 401 || lower.includes('invalid credentials') || lower.includes('unauthenticated')) {
    // Clear stale in-memory token so UI accurately prompts renewal
    setAccessToken(null);
    return new GoogleWorkspaceAuthError(
      `Tu sesión de ${serviceName} expiró. Presiona "Autorizar Google" para renovarla y continuar.`,
      401
    );
  }

  if (
    res.status === 403 &&
    (lower.includes('insufficient') ||
      lower.includes('scope') ||
      lower.includes('permission denied') ||
      lower.includes('request had insufficient authentication'))
  ) {
    setAccessToken(null);
    return new GoogleWorkspaceAuthError(
      `Faltan permisos de ${serviceName} en Google (${msg}). Presiona "Autorizar Google" y acepta los permisos solicitados.`,
      403
    );
  }

  if (res.status === 403 && (lower.includes('has not been used') || lower.includes('disabled'))) {
    return new Error(
      `${serviceName}: La API de ${serviceName} no está habilitada en el proyecto Google Cloud (${msg}).`
    );
  }

  return new Error(`${serviceName} (HTTP ${res.status}): ${msg}`);
};

/**
 * RFC 2047 UTF-8 Base64 encoding for email headers, safely chunked into <=42 UTF-8 byte
 * encoded-words so long Spanish subjects never break strict MIME parsers.
 */
const encodeMimeHeaderUtf8 = (text: string): string => {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let currentChars = '';
  let currentBytes = 0;

  for (const ch of text) {
    const chBytes = encoder.encode(ch).length;
    if (currentBytes + chBytes > 42 && currentChars.length > 0) {
      chunks.push(currentChars);
      currentChars = ch;
      currentBytes = chBytes;
    } else {
      currentChars += ch;
      currentBytes += chBytes;
    }
  }
  if (currentChars.length > 0) {
    chunks.push(currentChars);
  }

  return chunks
    .map((chunk) => {
      const bytes = encoder.encode(chunk);
      let binary = '';
      bytes.forEach((b) => {
        binary += String.fromCharCode(b);
      });
      return `=?UTF-8?B?${btoa(binary)}?=`;
    })
    .join('\r\n ');
};

// RFC 4648 base64url encoding required by Gmail messages.send API
const encodeBase64UrlUtf8 = (rawMime: string): string => {
  const bytes = new TextEncoder().encode(rawMime);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const escapeHtml = (input: string): string =>
  String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const getActivitiesAppUrl = (): string => {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}?m=actividades`;
};

/**
 * Sends a real HTML email via the authenticated user's Gmail account.
 * Caller MUST present an explicit confirmation dialog before invoking this function.
 */
export const sendGmailHtmlMessage = async (params: {
  to: string[];
  cc?: string[];
  subject: string;
  htmlBody: string;
  accessTokenOverride?: string | null;
}): Promise<{ id: string; threadId?: string }> => {
  const token = await requireToken(params.accessTokenOverride);
  const cleanTo = Array.from(
    new Set(params.to.map((e) => e.trim()).filter((e) => e && e.includes('@')))
  );
  if (cleanTo.length === 0) {
    throw new Error('Debes indicar al menos un correo destinatario válido.');
  }
  const cleanCc = Array.from(
    new Set(
      (params.cc || [])
        .map((e) => e.trim())
        .filter((e) => e && e.includes('@') && !cleanTo.includes(e))
    )
  );

  const headers = [
    `To: ${cleanTo.join(', ')}`,
    ...(cleanCc.length > 0 ? [`Cc: ${cleanCc.join(', ')}`] : []),
    `Subject: ${encodeMimeHeaderUtf8(params.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ];

  // Base64-encode HTML body so accented characters and long lines survive SMTP/MIME cleanly
  const bodyBytes = new TextEncoder().encode(params.htmlBody);
  let bodyBin = '';
  bodyBytes.forEach((b) => {
    bodyBin += String.fromCharCode(b);
  });
  const base64Body = (btoa(bodyBin).match(/.{1,76}/g) || []).join('\r\n');

  const rawMime = `${headers.join('\r\n')}\r\n\r\n${base64Body}`;
  const rawEncoded = encodeBase64UrlUtf8(rawMime);

  const res = await fetch(`${GMAIL_API_BASE}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: rawEncoded }),
  });

  if (!res.ok) {
    throw await parseWorkspaceError(res, 'Gmail');
  }

  return (await res.json()) as { id: string; threadId?: string };
};

/**
 * Builds a clean, subtle executive reminder digest email for an assignee.
 */
export const buildSubtleReminderEmail = (params: {
  recipientName: string;
  periodKey: string;
  items: MaterializedActivityAssignment[];
  senderName: string;
  customMessage?: string;
}): { subject: string; htmlBody: string } => {
  const periodLabel = formatPeriodLabel(params.periodKey);
  const appUrl = getActivitiesAppUrl();
  const single = params.items.length === 1;
  const subject = single
    ? `Recordatorio · ${params.items[0].activity.nombre} (${params.items[0].society.codigo}) · ${periodLabel}`
    : `Agenda de actividades pendientes · ${periodLabel} (${params.items.length})`;

  const rowsHtml = params.items
    .map((item) => {
      const statusColor =
        item.trafficLight === 'vencida'
          ? '#DC2626'
          : item.trafficLight === 'proxima'
          ? '#D97706'
          : '#334155';
      const statusLabel =
        item.trafficLight === 'vencida'
          ? 'Vencida'
          : item.trafficLight === 'proxima'
          ? 'Pronto a cumplir'
          : 'Programada';

      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;font-size:13px;color:#0F172A;font-weight:600;">
            ${escapeHtml(item.activity.nombre)}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#334155;">
            ${escapeHtml(item.society.codigo)}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#475569;">
            ${escapeHtml(item.activity.periodicidad)}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;font-size:12px;color:${statusColor};font-weight:600;white-space:nowrap;">
            ${escapeHtml(formatShortDateEs(item.execution.fechaSugerida))} · ${statusLabel}
          </td>
        </tr>`;
    })
    .join('');

  const customNoteBlock = params.customMessage?.trim()
    ? `<p style="margin:0 0 16px 0;padding:12px 14px;background:#F8FAFC;border-left:3px solid #1E60A8;font-size:13px;color:#334155;line-height:1.5;">${escapeHtml(
        params.customMessage.trim()
      )}</p>`
    : '';

  const htmlBody = `
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:660px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
      <div style="background:#132B63;padding:18px 24px;color:#FFFFFF;">
        <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#93C5FD;font-weight:600;">
          Premex · Panel de Actividades · ${escapeHtml(periodLabel)}
        </div>
        <div style="font-size:18px;font-weight:700;margin-top:4px;">
          Recordatorio de actividades programadas
        </div>
      </div>

      <div style="padding:22px 24px;color:#1E293B;font-size:14px;line-height:1.6;">
        <p style="margin:0 0 14px 0;">
          Hola <strong>${escapeHtml(params.recipientName)}</strong>,
        </p>
        <p style="margin:0 0 16px 0;color:#475569;font-size:13px;">
          Te compartimos el resumen de actividades bajo tu responsabilidad para <strong>${escapeHtml(
            periodLabel
          )}</strong> y sus fechas sugeridas de cumplimiento:
        </p>
        ${customNoteBlock}

        <table style="width:100%;border-collapse:collapse;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;margin-bottom:18px;">
          <thead>
            <tr style="background:#F8FAFC;">
              <th style="text-align:left;padding:9px 12px;font-size:11px;text-transform:uppercase;color:#64748B;border-bottom:1px solid #E2E8F0;">Actividad</th>
              <th style="text-align:left;padding:9px 12px;font-size:11px;text-transform:uppercase;color:#64748B;border-bottom:1px solid #E2E8F0;">Sociedad</th>
              <th style="text-align:left;padding:9px 12px;font-size:11px;text-transform:uppercase;color:#64748B;border-bottom:1px solid #E2E8F0;">Frecuencia</th>
              <th style="text-align:left;padding:9px 12px;font-size:11px;text-transform:uppercase;color:#64748B;border-bottom:1px solid #E2E8F0;">Fecha sugerida</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        ${
          appUrl
            ? `<div style="margin-top:6px;">
                 <a href="${escapeHtml(
                   appUrl
                 )}" style="display:inline-block;background:#1E60A8;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:8px;">
                   Abrir Panel de Actividades
                 </a>
               </div>`
            : ''
        }

        <p style="margin:20px 0 0 0;font-size:12px;color:#94A3B8;">
          Premex · ${escapeHtml(params.senderName)}
        </p>
      </div>
    </div>
  `;

  return { subject, htmlBody };
};

/**
 * Builds a clear completion confirmation email sent to admins / designated list via Gmail.
 */
export const buildCompletionConfirmationEmail = (params: {
  items: {
    activityName: string;
    periodicity: string;
    societyCode: string;
    periodKey: string;
    fechaSugerida: string;
    responsibleName: string;
    confirmedByName: string;
    confirmedByEmail: string;
    completedAtIso: string;
    origin: 'panel' | 'google_tasks';
    comment?: string;
  }[];
}): { subject: string; htmlBody: string } => {
  const first = params.items[0];
  const periodLabel = formatPeriodLabel(first?.periodKey || '');
  const appUrl = getActivitiesAppUrl();
  const subject =
    params.items.length === 1
      ? `Actividad cumplida · ${first.activityName} (${first.societyCode}) · ${periodLabel}`
      : `${params.items.length} actividades cumplidas · ${periodLabel}`;

  const rowsHtml = params.items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;font-size:13px;color:#0F172A;font-weight:600;">
          ${escapeHtml(item.activityName)}
          ${
            item.comment
              ? `<div style="font-weight:400;font-size:12px;color:#475569;margin-top:3px;">Nota: ${escapeHtml(
                  item.comment
                )}</div>`
              : ''
          }
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#334155;">
          ${escapeHtml(item.societyCode)}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#334155;">
          ${escapeHtml(item.responsibleName)}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#475569;white-space:nowrap;">
          ${escapeHtml(formatShortDateEs(item.fechaSugerida))}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#059669;font-weight:600;white-space:nowrap;">
          ${escapeHtml(formatDateTimeEs(item.completedAtIso))}
          <div style="font-weight:400;font-size:11px;color:#64748B;">
            ${item.origin === 'google_tasks' ? 'Vía Google Tasks (Gmail)' : 'Vía Panel Premex'}
          </div>
        </td>
      </tr>`
    )
    .join('');

  const htmlBody = `
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
      <div style="background:#059669;padding:18px 24px;color:#FFFFFF;">
        <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#D1FAE5;font-weight:600;">
          Confirmación de Cumplimiento · ${escapeHtml(periodLabel)}
        </div>
        <div style="font-size:18px;font-weight:700;margin-top:4px;">
          ${
            params.items.length === 1
              ? 'Actividad marcada como cumplida'
              : `${params.items.length} actividades marcadas como cumplidas`
          }
        </div>
      </div>

      <div style="padding:22px 24px;color:#1E293B;font-size:13px;line-height:1.6;">
        <p style="margin:0 0 16px 0;color:#475569;">
          Se ha registrado el cumplimiento de la siguiente gestión en el <strong>Panel de Actividades Premex</strong> por <strong>${escapeHtml(
            first?.confirmedByName || first?.confirmedByEmail || 'Usuario'
          )}</strong>:
        </p>

        <table style="width:100%;border-collapse:collapse;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;margin-bottom:18px;">
          <thead>
            <tr style="background:#F8FAFC;">
              <th style="text-align:left;padding:9px 12px;font-size:11px;text-transform:uppercase;color:#64748B;border-bottom:1px solid #E2E8F0;">Actividad</th>
              <th style="text-align:left;padding:9px 12px;font-size:11px;text-transform:uppercase;color:#64748B;border-bottom:1px solid #E2E8F0;">Sociedad</th>
              <th style="text-align:left;padding:9px 12px;font-size:11px;text-transform:uppercase;color:#64748B;border-bottom:1px solid #E2E8F0;">Responsable</th>
              <th style="text-align:left;padding:9px 12px;font-size:11px;text-transform:uppercase;color:#64748B;border-bottom:1px solid #E2E8F0;">Fecha sug.</th>
              <th style="text-align:left;padding:9px 12px;font-size:11px;text-transform:uppercase;color:#64748B;border-bottom:1px solid #E2E8F0;">Cumplida</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        ${
          appUrl
            ? `<a href="${escapeHtml(
                appUrl
              )}" style="display:inline-block;background:#132B63;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:8px;">
                 Ver avance en el Panel de Actividades
               </a>`
            : ''
        }

        <p style="margin:18px 0 0 0;font-size:11px;color:#94A3B8;">
          Notificación enviada desde el Panel de Actividades Premex.
        </p>
      </div>
    </div>
  `;

  return { subject, htmlBody };
};

// ============================================================================
// Google Tasks API (Two-Way Sync with Gmail's Primary "Mis tareas" Sidebar)
// ============================================================================

export interface GoogleTaskItem {
  id: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string;
  completed?: string;
  updated?: string;
  taskListId?: string;
}

export interface GoogleTaskList {
  id: string;
  title: string;
}

const PREMEX_TASK_TAG_REGEX = /\[PREMEX-ACT:([^\]]+)\]/;

export const extractExecutionIdFromTaskNotes = (notes?: string): string | null => {
  if (!notes) return null;
  const match = PREMEX_TASK_TAG_REGEX.exec(notes);
  return match ? match[1].trim() : null;
};

/**
 * Resolves the signed-in user's default Google TaskList ("Mis tareas" in Gmail right sidebar)
 * so every enabled activity is visible immediately upon opening Gmail without switching lists.
 */
export const getDefaultGoogleTaskList = async (
  accessTokenOverride?: string | null
): Promise<GoogleTaskList> => {
  const token = await requireToken(accessTokenOverride);
  const res = await fetch(`${TASKS_API_BASE}/users/@me/lists/@default`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw await parseWorkspaceError(res, 'Google Tasks');
  }
  return (await res.json()) as GoogleTaskList;
};

const fetchTasksFromList = async (
  taskListId: string,
  token: string
): Promise<GoogleTaskItem[]> => {
  const tasks: GoogleTaskItem[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const query = new URLSearchParams({
      showCompleted: 'true',
      showHidden: 'true',
      maxResults: '100',
      ...(pageToken ? { pageToken } : {}),
    });
    const res = await fetch(
      `${TASKS_API_BASE}/lists/${encodeURIComponent(taskListId)}/tasks?${query.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) {
      throw await parseWorkspaceError(res, 'Google Tasks');
    }
    const body = (await res.json()) as { items?: GoogleTaskItem[]; nextPageToken?: string };
    if (Array.isArray(body.items)) {
      tasks.push(...body.items.map((t) => ({ ...t, taskListId })));
    }
    pageToken = body.nextPageToken;
    pages++;
  } while (pageToken && pages < 5);

  return tasks;
};

/**
 * Lists all Premex tasks (both pending and completed) from Gmail's default "Mis tareas" list
 * AND any legacy "Premex · Panel de Actividades" list so two-way sync always detects completions.
 */
export const listPremexGoogleTasks = async (
  accessTokenOverride?: string | null
): Promise<{
  defaultList: GoogleTaskList;
  tasks: GoogleTaskItem[];
}> => {
  const token = await requireToken(accessTokenOverride);

  // Fetch all user lists to identify both @default and any legacy Premex list
  const listsRes = await fetch(`${TASKS_API_BASE}/users/@me/lists?maxResults=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listsRes.ok) {
    throw await parseWorkspaceError(listsRes, 'Google Tasks');
  }
  const listsData = (await listsRes.json()) as { items?: GoogleTaskList[] };
  const allLists = listsData.items || [];

  const defaultList =
    allLists[0] || (await getDefaultGoogleTaskList(token));

  const legacyList = allLists.find(
    (item) =>
      item.id !== defaultList.id &&
      item.title?.trim().toLowerCase() === LEGACY_PREMEX_GOOGLE_TASKS_LIST_TITLE.toLowerCase()
  );

  const listsToScan = legacyList ? [defaultList, legacyList] : [defaultList];
  const combinedTasks: GoogleTaskItem[] = [];

  for (const list of listsToScan) {
    const items = await fetchTasksFromList(list.id, token);
    combinedTasks.push(...items);
  }

  return { defaultList, tasks: combinedTasks };
};

const formatGoogleTaskPayload = (item: MaterializedActivityAssignment) => {
  const periodLabel = formatPeriodLabel(item.periodKey);
  const title = `[${item.society.codigo}] ${item.activity.nombre} · ${periodLabel}`;
  const due = `${item.execution.fechaSugerida}T00:00:00.000Z`;
  const appUrl = getActivitiesAppUrl();
  const respSummary = item.responsibles
    .map((r) => (r.email ? `${r.nombre} (${r.email})` : r.nombre))
    .join(', ');
  const notes = [
    `Sociedad: ${item.society.codigo}`,
    `Periodo: ${periodLabel} (${item.activity.periodicidad})`,
    `Responsable(s): ${respSummary}`,
    `Fecha sugerida: ${formatShortDateEs(item.execution.fechaSugerida)}`,
    item.activity.descripcion ? `Detalle: ${item.activity.descripcion}` : '',
    appUrl ? `Panel Premex: ${appUrl}` : '',
    `[PREMEX-ACT:${item.executionId}]`,
  ]
    .filter(Boolean)
    .join('\n');

  const isDone = item.execution.estado === 'realizada';
  return {
    title,
    notes,
    due,
    status: isDone ? ('completed' as const) : ('needsAction' as const),
    ...(isDone ? { completed: item.execution.completadaAtIso || new Date().toISOString() } : {}),
  };
};

/**
 * Pushes (creates or updates) the given activities directly into the signed-in user's
 * primary Gmail Google Tasks list ("Mis tareas") with due dates so they appear immediately
 * in Gmail's right-hand Tasks sidebar.
 * Caller MUST obtain explicit user confirmation before invoking this function.
 */
export const pushActivitiesToGoogleTasks = async (
  items: MaterializedActivityAssignment[],
  options?: {
    accessTokenOverride?: string | null;
    existingLinksByExecId?: Record<string, ActivityGoogleTaskLink | null>;
  }
): Promise<{
  taskListId: string;
  taskListTitle: string;
  createdCount: number;
  updatedCount: number;
  syncedMap: Record<string, { googleTaskId: string; googleTaskListId: string }>;
}> => {
  const token = await requireToken(options?.accessTokenOverride);
  const { defaultList, tasks: existingTasks } = await listPremexGoogleTasks(token);

  const existingByExecId = new Map<string, GoogleTaskItem>();
  const existingByTaskId = new Map<string, GoogleTaskItem>();
  existingTasks.forEach((t) => {
    existingByTaskId.set(t.id, t);
    const parsedExecId = extractExecutionIdFromTaskNotes(t.notes);
    if (parsedExecId) {
      // Prefer the task in the primary default list if duplicates exist
      const prev = existingByExecId.get(parsedExecId);
      if (!prev || t.taskListId === defaultList.id) {
        existingByExecId.set(parsedExecId, t);
      }
    }
  });

  let createdCount = 0;
  let updatedCount = 0;
  const syncedMap: Record<string, { googleTaskId: string; googleTaskListId: string }> = {};

  for (const item of items) {
    const payload = formatGoogleTaskPayload(item);
    const savedLink = options?.existingLinksByExecId?.[item.executionId];
    const existingTask =
      (savedLink?.taskId ? existingByTaskId.get(savedLink.taskId) : undefined) ||
      existingByExecId.get(item.executionId);

    if (existingTask && existingTask.taskListId) {
      const patchRes = await fetch(
        `${TASKS_API_BASE}/lists/${encodeURIComponent(
          existingTask.taskListId
        )}/tasks/${encodeURIComponent(existingTask.id)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );
      if (!patchRes.ok) {
        throw await parseWorkspaceError(patchRes, 'Google Tasks');
      }
      const updated = (await patchRes.json()) as GoogleTaskItem;
      syncedMap[item.executionId] = {
        googleTaskId: updated.id,
        googleTaskListId: existingTask.taskListId,
      };
      updatedCount++;
    } else {
      const createRes = await fetch(
        `${TASKS_API_BASE}/lists/${encodeURIComponent(defaultList.id)}/tasks`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );
      if (!createRes.ok) {
        throw await parseWorkspaceError(createRes, 'Google Tasks');
      }
      const created = (await createRes.json()) as GoogleTaskItem;
      syncedMap[item.executionId] = {
        googleTaskId: created.id,
        googleTaskListId: defaultList.id,
      };
      createdCount++;
    }
  }

  return {
    taskListId: defaultList.id,
    taskListTitle: defaultList.title || PREMEX_GOOGLE_TASKS_LIST_TITLE,
    createdCount,
    updatedCount,
    syncedMap,
  };
};

/**
 * Updates a single linked Google Task's status (completed / needsAction).
 * Caller MUST obtain explicit user confirmation before invoking this function.
 */
export const updateSingleGoogleTaskStatus = async (params: {
  taskListId: string;
  taskId: string;
  status: 'completed' | 'needsAction';
  accessTokenOverride?: string | null;
}): Promise<GoogleTaskItem> => {
  const token = await requireToken(params.accessTokenOverride);
  const body: Record<string, unknown> =
    params.status === 'completed'
      ? { status: 'completed', completed: new Date().toISOString() }
      : { status: 'needsAction', completed: null };

  const res = await fetch(
    `${TASKS_API_BASE}/lists/${encodeURIComponent(params.taskListId)}/tasks/${encodeURIComponent(
      params.taskId
    )}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    throw await parseWorkspaceError(res, 'Google Tasks');
  }
  return (await res.json()) as GoogleTaskItem;
};

/**
 * Two-way App -> Google Tasks sync for a single activity (on Cumplir or Reabrir).
 * Finds existing task (via saved link or [PREMEX-ACT:id] search across Gmail Tasks)
 * and updates its status; if not yet in Gmail Tasks and createIfMissing is true,
 * creates it in the user's primary "Mis tareas" list with the target status.
 */
export const syncSingleActivityToGoogleTasks = async (params: {
  assignment: MaterializedActivityAssignment;
  status: 'completed' | 'needsAction';
  existingLink?: ActivityGoogleTaskLink | null;
  createIfMissing?: boolean;
  accessTokenOverride?: string | null;
}): Promise<{ taskId: string; taskListId: string } | null> => {
  const token = await requireToken(params.accessTokenOverride);

  // 1. Try updating via known link first
  if (params.existingLink?.taskId && params.existingLink?.taskListId) {
    try {
      const updated = await updateSingleGoogleTaskStatus({
        taskListId: params.existingLink.taskListId,
        taskId: params.existingLink.taskId,
        status: params.status,
        accessTokenOverride: token,
      });
      return { taskId: updated.id, taskListId: params.existingLink.taskListId };
    } catch (err) {
      if (err instanceof GoogleWorkspaceAuthError) throw err;
      // Fall through if the task was deleted in Gmail or moved
    }
  }

  // 2. Scan Gmail Tasks for matching [PREMEX-ACT:{executionId}]
  const { defaultList, tasks } = await listPremexGoogleTasks(token);
  const matched = tasks.find(
    (t) => extractExecutionIdFromTaskNotes(t.notes) === params.assignment.executionId
  );

  if (matched && matched.taskListId) {
    const updated = await updateSingleGoogleTaskStatus({
      taskListId: matched.taskListId,
      taskId: matched.id,
      status: params.status,
      accessTokenOverride: token,
    });
    return { taskId: updated.id, taskListId: matched.taskListId };
  }

  // 3. Optionally create the task directly in Gmail's "Mis tareas" with the target status
  if (!params.createIfMissing) return null;

  const basePayload = formatGoogleTaskPayload(params.assignment);
  const createPayload =
    params.status === 'completed'
      ? { ...basePayload, status: 'completed', completed: new Date().toISOString() }
      : { ...basePayload, status: 'needsAction' };

  const createRes = await fetch(
    `${TASKS_API_BASE}/lists/${encodeURIComponent(defaultList.id)}/tasks`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createPayload),
    }
  );
  if (!createRes.ok) {
    throw await parseWorkspaceError(createRes, 'Google Tasks');
  }
  const created = (await createRes.json()) as GoogleTaskItem;
  return { taskId: created.id, taskListId: defaultList.id };
};
