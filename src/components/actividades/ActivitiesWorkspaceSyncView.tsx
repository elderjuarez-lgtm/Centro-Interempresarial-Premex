import React, { useMemo, useState } from 'react';
import {
  Mail,
  ListTodo,
  RefreshCw,
  Send,
  CheckCircle2,
  UploadCloud,
  DownloadCloud,
  Users,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Settings2,
  Flag,
} from 'lucide-react';
import { ActivitiesWorkspaceData } from '../../types';
import {
  MaterializedActivityAssignment,
  assignmentIncludesEmail,
  formatDateTimeEs,
  formatPeriodLabel,
  formatShortDateEs,
  getGoogleTaskLinkForEmail,
  getPeriodActivationStatus,
  hasAnyGoogleTaskLink,
} from '../../utils/activities';
import { PREMEX_GOOGLE_TASKS_LIST_TITLE } from '../../services/googleWorkspaceActivities';
import { PeriodClosureStatus } from './ActivitiesExecutionListView';

export interface ResponsibleDigestGroup {
  responsibleId: string;
  responsibleName: string;
  responsibleEmail: string;
  items: MaterializedActivityAssignment[];
  overdueCount: number;
  upcomingCount: number;
  lastReminderIso?: string;
}

interface ActivitiesWorkspaceSyncViewProps {
  data: ActivitiesWorkspaceData;
  assignments: MaterializedActivityAssignment[];
  closureStatus: PeriodClosureStatus;
  remoteCompletedPendingCount: number;
  currentUserEmail?: string | null;
  hasWorkspaceToken: boolean;
  isAdmin: boolean;
  canOperate: boolean;
  isSyncingGoogleTasks: boolean;
  isConnectingWorkspace: boolean;
  resolvedCompletionRecipients: { email: string; nombre: string; origen: string }[];
  onConnectWorkspace: () => Promise<void>;
  onRequestPushTasks: (
    items: MaterializedActivityAssignment[],
    scopeLabel: string,
    includeClosureTask?: boolean
  ) => void;
  onPullFromGoogleTasks: () => Promise<void>;
  onRequestSyncClosureTask: () => void;
  onRequestConfirmPeriodClosure: () => void;
  onRequestSyncRemoteCompletedToMyTasks: () => void;
  onRequestSendSubtleDigest: (group: ResponsibleDigestGroup, customMessage?: string) => void;
  onRequestSendBatchDigests: (groups: ResponsibleDigestGroup[], customMessage?: string) => void;
  onNavigateConfigRecipients: () => void;
}

export const ActivitiesWorkspaceSyncView: React.FC<ActivitiesWorkspaceSyncViewProps> = ({
  data,
  assignments,
  closureStatus,
  remoteCompletedPendingCount,
  currentUserEmail,
  hasWorkspaceToken,
  isAdmin,
  canOperate,
  isSyncingGoogleTasks,
  isConnectingWorkspace,
  resolvedCompletionRecipients,
  onConnectWorkspace,
  onRequestPushTasks,
  onPullFromGoogleTasks,
  onRequestSyncClosureTask,
  onRequestConfirmPeriodClosure,
  onRequestSyncRemoteCompletedToMyTasks,
  onRequestSendSubtleDigest,
  onRequestSendBatchDigests,
  onNavigateConfigRecipients,
}) => {
  const [tasksPushScope, setTasksPushScope] = useState<'mine' | 'all'>(() => {
    if (!isAdmin) return 'mine';
    const hasMine = assignments.some(
      (a) => a.execution.estado !== 'realizada' && assignmentIncludesEmail(a, currentUserEmail)
    );
    return hasMine ? 'mine' : 'all';
  });

  const [reminderFilter, setReminderFilter] = useState<'upcoming' | 'all_pending'>('all_pending');
  const [customMessage, setCustomMessage] = useState('');
  const [selectedResponsibleIds, setSelectedResponsibleIds] = useState<string[]>([]);

  const pendingAssignments = useMemo(
    () => assignments.filter((a) => a.execution.estado !== 'realizada'),
    [assignments]
  );

  const myPendingAssignments = useMemo(
    () => pendingAssignments.filter((a) => assignmentIncludesEmail(a, currentUserEmail)),
    [pendingAssignments, currentUserEmail]
  );

  const effectiveTasksScope: 'mine' | 'all' = isAdmin ? tasksPushScope : 'mine';
  const tasksToPush =
    effectiveTasksScope === 'mine' ? myPendingAssignments : pendingAssignments;

  const linkedTasksCount = useMemo(
    () =>
      assignments.filter((a) =>
        currentUserEmail
          ? Boolean(getGoogleTaskLinkForEmail(a.execution, currentUserEmail))
          : hasAnyGoogleTaskLink(a.execution)
      ).length,
    [assignments, currentUserEmail]
  );

  const digestGroups = useMemo<ResponsibleDigestGroup[]>(() => {
    if (!isAdmin) return [];
    const candidates =
      reminderFilter === 'upcoming'
        ? pendingAssignments.filter(
            (a) => a.trafficLight === 'vencida' || a.trafficLight === 'proxima'
          )
        : pendingAssignments;

    const map = new Map<string, ResponsibleDigestGroup>();
    candidates.forEach((item) => {
      item.responsibles.forEach((resp) => {
        const existing = map.get(resp.id);
        if (existing) {
          existing.items.push(item);
          if (item.trafficLight === 'vencida') existing.overdueCount++;
          if (item.trafficLight === 'proxima') existing.upcomingCount++;
          if (
            item.execution.ultimoRecordatorioIso &&
            (!existing.lastReminderIso ||
              item.execution.ultimoRecordatorioIso > existing.lastReminderIso)
          ) {
            existing.lastReminderIso = item.execution.ultimoRecordatorioIso;
          }
        } else {
          map.set(resp.id, {
            responsibleId: resp.id,
            responsibleName: resp.nombre,
            responsibleEmail: resp.email,
            items: [item],
            overdueCount: item.trafficLight === 'vencida' ? 1 : 0,
            upcomingCount: item.trafficLight === 'proxima' ? 1 : 0,
            lastReminderIso: item.execution.ultimoRecordatorioIso,
          });
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [pendingAssignments, reminderFilter, isAdmin]);

  const toggleResponsibleSelection = (respId: string) => {
    setSelectedResponsibleIds((prev) =>
      prev.includes(respId) ? prev.filter((id) => id !== respId) : [...prev, respId]
    );
  };

  const selectedGroups = useMemo(
    () =>
      digestGroups.filter(
        (g) => selectedResponsibleIds.includes(g.responsibleId) && Boolean(g.responsibleEmail)
      ),
    [digestGroups, selectedResponsibleIds]
  );

  return (
    <div className="space-y-6">
      {/* 1. Google Workspace Session Bar */}
      <section className="bg-white rounded-2xl border border-slate-200/90 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#0F766E]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Google Workspace</span>
          </div>
          <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
            Gmail y Google Tasks
          </h3>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          <div
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              hasWorkspaceToken
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            {hasWorkspaceToken ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>
              {hasWorkspaceToken ? 'Sesión Google activa' : 'Renovar permisos si expiró la sesión'}
            </span>
          </div>

          {!hasWorkspaceToken && (
            <button
              type="button"
              disabled={isConnectingWorkspace}
              onClick={onConnectWorkspace}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-2xs transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {isConnectingWorkspace ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#1E60A8]" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-[#1E60A8]" />
              )}
              <span>Renovar acceso Google</span>
            </button>
          )}
        </div>
      </section>

      {/* 2. Two-Way Google Tasks Sync */}
      <section className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 space-y-5">
        <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              <span>{formatPeriodLabel(data.selectedPeriod)}</span>
              <span className="text-slate-300">·</span>
              <span className="normal-case font-semibold text-slate-600">
                {getPeriodActivationStatus(data.selectedPeriod).statusLabel}
              </span>
            </div>
            <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
              Google Tasks · {PREMEX_GOOGLE_TASKS_LIST_TITLE}
            </h3>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              {linkedTasksCount} tarea(s) vinculada(s) · Última sincronización:{' '}
              <span className="font-medium text-slate-700">
                {formatDateTimeEs(data.lastGoogleTasksSyncIso)}
              </span>
            </p>
          </div>
        </div>

        {canOperate && remoteCompletedPendingCount > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-emerald-950">
              <strong className="font-bold">
                {remoteCompletedPendingCount} tarea(s) compartida(s) ya fueron cumplidas por otro responsable.
              </strong>{' '}
              Actualiza tu lista de Google Tasks para marcarlas como completadas en tu correo.
            </div>
            <button
              type="button"
              disabled={isSyncingGoogleTasks}
              onClick={onRequestSyncRemoteCompletedToMyTasks}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Actualizar en mi Google Tasks ({remoteCompletedPendingCount})</span>
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Push to Google Tasks */}
          <div className="rounded-xl border border-slate-200 p-4 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    Publicar en Google Tasks
                  </div>
                  <div className="text-xs text-slate-500">
                    Envía tus pendientes con fecha sugerida a Tareas de Gmail.
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTasksPushScope('mine')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer tabular-nums ${
                      tasksPushScope === 'mine'
                        ? 'bg-[#132B63] text-white border-[#132B63]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Mis pendientes ({myPendingAssignments.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTasksPushScope('all')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer tabular-nums ${
                      tasksPushScope === 'all'
                        ? 'bg-[#132B63] text-white border-[#132B63]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Todo el periodo ({pendingAssignments.length})
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={!canOperate || tasksToPush.length === 0 || isSyncingGoogleTasks}
              onClick={() =>
                onRequestPushTasks(
                  tasksToPush,
                  effectiveTasksScope === 'mine'
                    ? 'tus actividades pendientes'
                    : `todas las pendientes de ${formatPeriodLabel(data.selectedPeriod)}`,
                  true
                )
              }
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              <ListTodo className="w-4 h-4" />
              <span>Enviar {tasksToPush.length} tarea(s) + Cierre a Google Tasks</span>
            </button>
          </div>

          {/* Pull from Google Tasks */}
          <div className="rounded-xl border border-slate-200 p-4 flex flex-col justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1E60A8] flex items-center justify-center shrink-0">
                <DownloadCloud className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">
                  Sincronizar desde Google Tasks
                </div>
                <div className="text-xs text-slate-500">
                  Importa cumplimientos, detecta el cierre total [CIERRE] y sincroniza tareas compartidas entre usuarios.
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={!canOperate || isSyncingGoogleTasks}
              onClick={onPullFromGoogleTasks}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSyncingGoogleTasks ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>
                {isSyncingGoogleTasks
                  ? 'Sincronizando...'
                  : 'Sincronizar completadas desde Google Tasks'}
              </span>
            </button>
          </div>
        </div>

        {/* Independent Monthly Closure Confirmation Task Panel */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#132B63]">
              <Flag className="w-4 h-4 text-[#1E60A8] shrink-0" />
              <span>
                Tarea independiente de confirmación de cierre ({closureStatus.completedTasks}/
                {closureStatus.totalTasks})
              </span>
              {closureStatus.isClosureConfirmed && (
                <span className="text-[11px] font-semibold text-emerald-700">· Confirmada</span>
              )}
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Al concluir todas tus actividades del mes, marca la tarea{' '}
              <strong className="text-slate-800">[CIERRE] Confirmar cumplimiento total</strong> en Google Tasks (o aquí) para enviar el correo de cumplimiento a:{' '}
              <span className="font-mono text-[11px] text-slate-800">
                {closureStatus.recipientEmails.length > 0
                  ? closureStatus.recipientEmails.join(', ')
                  : 'Sin destinatarios configurados'}
              </span>
              .
            </p>
          </div>

          {canOperate && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isSyncingGoogleTasks}
                onClick={onRequestSyncClosureTask}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#132B63] bg-white hover:bg-slate-100 border border-slate-300 rounded-xl whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <ListTodo className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  {closureStatus.isLinkedInGoogleTasks
                    ? 'Actualizar [CIERRE] en Tasks'
                    : 'Crear [CIERRE] en Tasks'}
                </span>
              </button>
              <button
                type="button"
                disabled={isSyncingGoogleTasks}
                onClick={onRequestConfirmPeriodClosure}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {closureStatus.isClosureConfirmed
                    ? 'Reenviar cierre Gmail'
                    : 'Confirmar cierre y notificar'}
                </span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 3. Admin-Only Gmail Reminder Dispatcher */}
      {isAdmin && (
        <section className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#1E60A8]">
                Notificaciones por Gmail
              </div>
              <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
                Recordatorios por Responsable
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setReminderFilter('upcoming')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    reminderFilter === 'upcoming'
                      ? 'bg-white text-[#132B63] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Próximas / Vencidas (≤ {data.subtleReminderDaysBefore}d)
                </button>
                <button
                  type="button"
                  onClick={() => setReminderFilter('all_pending')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    reminderFilter === 'all_pending'
                      ? 'bg-white text-[#132B63] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas las pendientes
                </button>
              </div>

              {canOperate && selectedGroups.length > 0 && (
                <button
                  type="button"
                  onClick={() => onRequestSendBatchDigests(selectedGroups, customMessage)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar a seleccionados ({selectedGroups.length})</span>
                </button>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="subtle-gmail-note"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              Nota opcional en el correo
            </label>
            <input
              id="subtle-gmail-note"
              type="text"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Ej. Recordatorio de cierre mensual."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:bg-white"
            />
          </div>

          {digestGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
              No hay actividades pendientes en el filtro seleccionado.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {digestGroups.map((group) => {
                const isSelected = selectedResponsibleIds.includes(group.responsibleId);
                const hasEmail = Boolean(
                  group.responsibleEmail && group.responsibleEmail.includes('@')
                );

                return (
                  <div
                    key={group.responsibleId}
                    className={`rounded-xl border p-4 transition-colors flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'border-[#1E60A8] bg-blue-50/30'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <label className="flex items-start gap-2.5 cursor-pointer min-w-0">
                          <input
                            type="checkbox"
                            disabled={!hasEmail}
                            checked={isSelected}
                            onChange={() => toggleResponsibleSelection(group.responsibleId)}
                            className="mt-1 rounded border-slate-300 text-[#1E60A8] focus:ring-[#1E60A8]"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900 truncate">
                              {group.responsibleName}
                            </div>
                            <div className="text-xs font-mono text-slate-500 truncate">
                              {hasEmail ? group.responsibleEmail : 'Sin correo'}
                            </div>
                          </div>
                        </label>

                        <div className="text-right shrink-0 tabular-nums">
                          <div className="text-xs font-bold text-slate-800">
                            {group.items.length} pend.
                          </div>
                          {(group.overdueCount > 0 || group.upcomingCount > 0) && (
                            <div className="text-[11px] font-medium text-amber-700">
                              {group.overdueCount > 0 ? `${group.overdueCount} venc.` : ''}
                              {group.overdueCount > 0 && group.upcomingCount > 0 ? ' · ' : ''}
                              {group.upcomingCount > 0 ? `${group.upcomingCount} próx.` : ''}
                            </div>
                          )}
                        </div>
                      </div>

                      <ul className="space-y-1 text-xs text-slate-700 bg-slate-50 rounded-lg p-2.5 max-h-36 overflow-y-auto">
                        {group.items.map((item) => (
                          <li
                            key={item.executionId}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="truncate">
                              <strong className="text-slate-800">{item.society.codigo}</strong> ·{' '}
                              {item.activity.nombre}
                            </span>
                            <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                              {formatShortDateEs(item.execution.fechaSugerida)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <span className="text-[11px] text-slate-400 truncate">
                        {group.lastReminderIso
                          ? `Último aviso: ${formatDateTimeEs(group.lastReminderIso)}`
                          : 'Sin avisos previos'}
                      </span>

                      {canOperate && (
                        <button
                          type="button"
                          disabled={!hasEmail}
                          onClick={() => onRequestSendSubtleDigest(group, customMessage)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#132B63] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45"
                        >
                          <Mail className="w-3.5 h-3.5 text-[#1E60A8]" />
                          <span>Enviar</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <Users className="w-4 h-4 text-[#0F766E] shrink-0 mt-0.5" />
              <div className="text-xs min-w-0">
                <div className="font-bold text-slate-900">
                  Destinatarios generales de cierre ({resolvedCompletionRecipients.length})
                </div>
                <div className="text-slate-600 font-mono text-[11px] break-words mt-0.5">
                  {resolvedCompletionRecipients.length > 0
                    ? resolvedCompletionRecipients.map((r) => r.email).join(', ')
                    : 'Sin destinatarios generales (se usarán únicamente los configurados en cada responsable).'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onNavigateConfigRecipients}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5 text-[#1E60A8]" />
              <span>Editar destinatarios</span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
