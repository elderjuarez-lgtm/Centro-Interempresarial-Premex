import React, { useMemo, useState } from 'react';
import {
  Search,
  CheckCircle2,
  Mail,
  ListTodo,
  RotateCcw,
  UserCheck,
  Users,
  Calendar,
  X,
  Send,
  Flag,
} from 'lucide-react';
import { ActivitiesWorkspaceData } from '../../types';
import {
  MaterializedActivityAssignment,
  assignmentIncludesEmail,
  assignmentIncludesResponsibleId,
  formatDateTimeEs,
  formatPeriodLabel,
  formatShortDateEs,
  getGoogleTaskLinkForEmail,
} from '../../utils/activities';

export interface PeriodClosureStatus {
  closureExecutionId: string;
  periodKey: string;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  isClosureConfirmed: boolean;
  confirmedAtIso?: string;
  confirmedByName?: string;
  origin?: 'panel' | 'google_tasks';
  isLinkedInGoogleTasks: boolean;
  emailSentAtIso?: string;
  recipientsCount: number;
  recipientEmails: string[];
}

interface ActivitiesExecutionListViewProps {
  data: ActivitiesWorkspaceData;
  assignments: MaterializedActivityAssignment[];
  closureStatus: PeriodClosureStatus;
  currentUserEmail?: string | null;
  isAdmin: boolean;
  canOperate: boolean;
  isSyncingGoogleTasks: boolean;
  onOpenCompleteModal: (assignment: MaterializedActivityAssignment) => void;
  onReopenActivity: (assignment: MaterializedActivityAssignment) => void;
  onRequestSendSubtleReminder: (assignment: MaterializedActivityAssignment) => void;
  onRequestSyncSingleTask: (assignment: MaterializedActivityAssignment) => void;
  onRequestSyncClosureTask: () => void;
  onRequestConfirmPeriodClosure: () => void;
}

type StatusFilter = 'ALL' | 'PENDING' | 'URGENT' | 'COMPLETED';

export const ActivitiesExecutionListView: React.FC<ActivitiesExecutionListViewProps> = ({
  data,
  assignments,
  closureStatus,
  currentUserEmail,
  isAdmin,
  canOperate,
  isSyncingGoogleTasks,
  onOpenCompleteModal,
  onReopenActivity,
  onRequestSendSubtleReminder,
  onRequestSyncSingleTask,
  onRequestSyncClosureTask,
  onRequestConfirmPeriodClosure,
}) => {
  const myAssignmentsCount = useMemo(
    () => assignments.filter((a) => assignmentIncludesEmail(a, currentUserEmail)).length,
    [assignments, currentUserEmail]
  );

  const [scope, setScope] = useState<'mine' | 'all'>(() =>
    !isAdmin || myAssignmentsCount > 0 ? 'mine' : 'all'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [societyFilter, setSocietyFilter] = useState('ALL');
  const [responsibleFilter, setResponsibleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const effectiveScope: 'mine' | 'all' = isAdmin ? scope : 'mine';

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const list = assignments.filter((item) => {
      if (effectiveScope === 'mine' && currentUserEmail) {
        if (!assignmentIncludesEmail(item, currentUserEmail)) return false;
      }
      if (societyFilter !== 'ALL' && item.society.codigo !== societyFilter) return false;
      if (
        isAdmin &&
        responsibleFilter !== 'ALL' &&
        !assignmentIncludesResponsibleId(item, responsibleFilter)
      ) {
        return false;
      }

      if (statusFilter === 'PENDING' && item.execution.estado === 'realizada') return false;
      if (
        statusFilter === 'URGENT' &&
        item.trafficLight !== 'vencida' &&
        item.trafficLight !== 'proxima'
      ) {
        return false;
      }
      if (statusFilter === 'COMPLETED' && item.execution.estado !== 'realizada') return false;

      if (q) {
        const respEmails = item.responsibles.map((r) => r.email).join(' ');
        const hay = `${item.activity.nombre} ${item.society.codigo} ${item.responsibleNamesLabel} ${respEmails} ${item.execution.comentarioCierre || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const priorityWeight: Record<string, number> = {
      vencida: 0,
      proxima: 1,
      pendiente: 2,
      realizada: 3,
    };

    return list.sort((a, b) => {
      const pw = priorityWeight[a.trafficLight] - priorityWeight[b.trafficLight];
      if (pw !== 0) return pw;
      const dateCmp = a.execution.fechaSugerida.localeCompare(b.execution.fechaSugerida);
      if (dateCmp !== 0) return dateCmp;
      return a.activity.nombre.localeCompare(b.activity.nombre);
    });
  }, [
    assignments,
    effectiveScope,
    currentUserEmail,
    societyFilter,
    responsibleFilter,
    isAdmin,
    statusFilter,
    searchQuery,
  ]);

  const counts = useMemo(() => {
    const base =
      effectiveScope === 'mine' && currentUserEmail
        ? assignments.filter((a) => assignmentIncludesEmail(a, currentUserEmail))
        : assignments;
    return {
      total: base.length,
      pending: base.filter((a) => a.execution.estado !== 'realizada').length,
      urgent: base.filter(
        (a) => a.trafficLight === 'vencida' || a.trafficLight === 'proxima'
      ).length,
      completed: base.filter((a) => a.execution.estado === 'realizada').length,
    };
  }, [assignments, effectiveScope, currentUserEmail]);

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#0F766E]">
              {formatPeriodLabel(data.selectedPeriod)}
            </div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight mt-0.5">
              {isAdmin ? 'Seguimiento y Confirmaciones' : 'Mis Actividades Asignadas'}
            </h3>
          </div>

          {isAdmin && (
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 self-start md:self-auto">
              <button
                type="button"
                onClick={() => setScope('mine')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  scope === 'mine'
                    ? 'bg-white text-[#132B63] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Mis actividades</span>
                <span className="font-mono text-[11px] tabular-nums opacity-75">
                  ({myAssignmentsCount})
                </span>
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  scope === 'all'
                    ? 'bg-white text-[#132B63] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Todo el equipo</span>
                <span className="font-mono text-[11px] tabular-nums opacity-75">
                  ({assignments.length})
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `Todas (${counts.total})` },
                { id: 'PENDING', label: `Pendientes (${counts.pending})` },
                { id: 'URGENT', label: `Pronto / Vencidas (${counts.urgent})` },
                { id: 'COMPLETED', label: `Cumplidas (${counts.completed})` },
              ] as { id: StatusFilter; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                  statusFilter === opt.id
                    ? 'bg-[#132B63] text-white border-[#132B63]'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:bg-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              aria-label="Filtrar por sociedad"
              value={societyFilter}
              onChange={(e) => setSocietyFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
            >
              <option value="ALL">Todas las sociedades</option>
              {data.societies
                .filter((s) => s.activa)
                .map((s) => (
                  <option key={s.id} value={s.codigo}>
                    {s.codigo}
                  </option>
                ))}
            </select>

            {isAdmin && effectiveScope === 'all' && (
              <select
                aria-label="Filtrar por responsable"
                value={responsibleFilter}
                onChange={(e) => setResponsibleFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
              >
                <option value="ALL">Todos los responsables</option>
                {data.responsibles
                  .filter((r) => r.activo)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
              </select>
            )}
          </div>
        </div>
      </section>

      {/* Independent Monthly Closure Confirmation Task Card */}
      {(closureStatus.totalTasks > 0 || closureStatus.isClosureConfirmed) && (
        <section
          className={`rounded-2xl border p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
            closureStatus.isClosureConfirmed
              ? 'bg-emerald-50/70 border-emerald-300'
              : 'bg-white border-[#1E60A8]/30 shadow-2xs'
          }`}
        >
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${
                  closureStatus.isClosureConfirmed ? 'text-emerald-800' : 'text-[#1E60A8]'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Tarea Independiente de Cierre · {formatPeriodLabel(closureStatus.periodKey)}</span>
              </span>
              {closureStatus.isLinkedInGoogleTasks && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <ListTodo className="w-3 h-3" />
                  <span>Habilitada en Google Tasks</span>
                </span>
              )}
            </div>

            <div className="text-sm font-extrabold text-slate-900">
              Confirmar cumplimiento total de actividades ({closureStatus.completedTasks} de{' '}
              {closureStatus.totalTasks} cumplidas)
            </div>

            <div className="text-xs text-slate-600 leading-relaxed">
              {closureStatus.isClosureConfirmed ? (
                <span>
                  Cierre confirmado el{' '}
                  <strong>{formatDateTimeEs(closureStatus.confirmedAtIso)}</strong>
                  {closureStatus.origin === 'google_tasks'
                    ? ' desde Google Tasks (Gmail)'
                    : ' desde el Panel Premex'}
                  {closureStatus.emailSentAtIso
                    ? ` · Notificación enviada por Gmail (${formatDateTimeEs(
                        closureStatus.emailSentAtIso
                      )}).`
                    : '.'}
                </span>
              ) : (
                <span>
                  Al concluir tus tareas, marca esta tarea independiente (aquí o directamente en Google Tasks) para enviar el correo de cumplimiento a{' '}
                  <strong className="font-mono text-slate-800">
                    {closureStatus.recipientEmails.length > 0
                      ? closureStatus.recipientEmails.join(', ')
                      : 'los destinatarios configurados'}
                  </strong>
                  .
                </span>
              )}
            </div>
          </div>

          {canOperate && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isSyncingGoogleTasks}
                onClick={onRequestSyncClosureTask}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#132B63] bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
              >
                <ListTodo className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  {closureStatus.isLinkedInGoogleTasks
                    ? 'Actualizar [CIERRE] en Tasks'
                    : 'Habilitar [CIERRE] en Tasks'}
                </span>
              </button>

              <button
                type="button"
                disabled={isSyncingGoogleTasks}
                onClick={onRequestConfirmPeriodClosure}
                className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white rounded-xl transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60 ${
                  closureStatus.isClosureConfirmed
                    ? 'bg-[#1E60A8] hover:bg-[#132B63]'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {closureStatus.isClosureConfirmed
                    ? 'Reenviar cierre por Gmail'
                    : 'Confirmar cierre y notificar'}
                </span>
              </button>
            </div>
          )}
        </section>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[860px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Actividad</th>
                <th className="px-3 py-3">Sociedad</th>
                <th className="px-3 py-3">Responsable(s)</th>
                <th className="px-3 py-3">Fecha</th>
                <th className="px-3 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 text-xs">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    {!isAdmin && myAssignmentsCount === 0
                      ? 'No tienes actividades asignadas para tu correo en este periodo.'
                      : 'No se encontraron actividades con los filtros seleccionados.'}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isDone = item.execution.estado === 'realizada';
                  const isOverdue = item.trafficLight === 'vencida';
                  const isUpcoming = item.trafficLight === 'proxima';
                  const hasAnyEmail = item.responsibles.some(
                    (r) => r.email && r.email.includes('@')
                  );
                  const isLinkedForUser = Boolean(
                    getGoogleTaskLinkForEmail(item.execution, currentUserEmail)
                  );

                  const statusClass = isDone
                    ? 'bg-emerald-600 text-white'
                    : isOverdue
                    ? 'bg-red-600 text-white'
                    : isUpcoming
                    ? 'bg-amber-400 text-amber-950'
                    : 'bg-slate-100 text-slate-700 border border-slate-200';

                  return (
                    <tr key={item.executionId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5 align-middle max-w-[300px]">
                        <button
                          type="button"
                          onClick={() => onOpenCompleteModal(item)}
                          className="text-left group cursor-pointer"
                        >
                          <div className="font-bold text-slate-900 group-hover:text-[#1E60A8] transition-colors leading-snug">
                            {item.activity.nombre}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                            <span className="font-semibold text-[#1E60A8]">
                              {item.activity.periodicidad}
                            </span>
                            {item.execution.comentarioCierre && (
                              <span className="truncate max-w-[200px] text-slate-500">
                                · {item.execution.comentarioCierre}
                              </span>
                            )}
                          </div>
                        </button>
                      </td>

                      <td className="px-3 py-3.5 align-middle whitespace-nowrap">
                        <span className="font-bold text-slate-800">{item.society.codigo}</span>
                      </td>

                      <td className="px-3 py-3.5 align-middle">
                        <div className="font-semibold text-slate-800 flex flex-wrap items-center gap-1.5">
                          <span>{item.responsibleNamesLabel}</span>
                          {item.responsibles.length > 1 && (
                            <span className="text-[10px] font-bold text-[#1E60A8] bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-md">
                              Compartida ({item.responsibles.length})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 truncate max-w-[240px]">
                          {item.responsibles
                            .map((r) => r.email)
                            .filter(Boolean)
                            .join(', ') || 'Sin correo'}
                        </div>
                      </td>

                      <td className="px-3 py-3.5 align-middle whitespace-nowrap tabular-nums">
                        <div className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {isDone
                              ? formatShortDateEs(
                                  item.execution.completadaAtIso || item.execution.fechaSugerida
                                )
                              : formatShortDateEs(item.execution.fechaSugerida)}
                          </span>
                        </div>
                        <div
                          className={`text-[11px] mt-0.5 font-semibold ${
                            isDone
                              ? 'text-emerald-700'
                              : isOverdue
                              ? 'text-red-600'
                              : isUpcoming
                              ? 'text-amber-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {isDone
                            ? 'Fecha cumplimiento'
                            : isOverdue
                            ? `Vencida hace ${Math.abs(item.daysLeft)} d.`
                            : item.daysLeft === 0
                            ? 'Vence hoy'
                            : `En ${item.daysLeft} día(s)`}
                        </div>
                      </td>

                      <td className="px-3 py-3.5 align-middle">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold ${statusClass}`}
                        >
                          {isDone
                            ? 'Cumplido'
                            : isOverdue
                            ? 'Vencido'
                            : isUpcoming
                            ? 'Pronto a cumplir'
                            : 'Programada'}
                        </span>

                        <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                          {isDone && item.execution.completadaPorNombre && (
                            <div className="text-slate-700 font-medium">
                              Por: {item.execution.completadaPorNombre}
                            </div>
                          )}
                          {isDone && item.execution.origenConfirmacion === 'google_tasks' && (
                            <div className="text-emerald-700 font-medium">Vía Google Tasks</div>
                          )}
                          {isLinkedForUser && (
                            <div className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                              <ListTodo className="w-3 h-3" />
                              <span>En Google Tasks</span>
                            </div>
                          )}
                          {item.execution.ultimoRecordatorioIso && !isDone && (
                            <div className="text-[#1E60A8]">
                              Aviso: {formatDateTimeEs(item.execution.ultimoRecordatorioIso)}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 align-middle text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {canOperate && !isDone && (
                            <button
                              type="button"
                              onClick={() => onOpenCompleteModal(item)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Cumplir</span>
                            </button>
                          )}

                          {canOperate && isDone && (
                            <button
                              type="button"
                              onClick={() => onReopenActivity(item)}
                              title="Reabrir como pendiente"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Reabrir</span>
                            </button>
                          )}

                          {isAdmin && canOperate && !isDone && hasAnyEmail && (
                            <button
                              type="button"
                              onClick={() => onRequestSendSubtleReminder(item)}
                              title="Enviar recordatorio por Gmail"
                              className="p-2 text-[#1E60A8] bg-blue-50/80 hover:bg-blue-100 border border-blue-200/80 rounded-xl transition-colors cursor-pointer"
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canOperate && (
                            <button
                              type="button"
                              onClick={() => onRequestSyncSingleTask(item)}
                              title="Habilitar en Google Tasks (Gmail)"
                              className="p-2 text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100 border border-emerald-200/80 rounded-xl transition-colors cursor-pointer"
                            >
                              <ListTodo className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
