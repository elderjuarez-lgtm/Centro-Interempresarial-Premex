import React, { useMemo, useState } from 'react';
import {
  Search,
  Download,
  Plus,
  ListTodo,
  X,
  Calendar,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import {
  ActivityPeriodicity,
  ActivitiesWorkspaceData,
} from '../../types';
import {
  MaterializedActivityAssignment,
  assignmentIncludesEmail,
  computeSuggestedDateForPeriod,
  exportActivitiesMatrixToExcel,
  formatPeriodLabel,
  formatShortDateEs,
  getEffectiveResponsibleIdsForCell,
  getGoogleTaskLinkForEmail,
  getPeriodActivationStatus,
  hasAnyGoogleTaskLink,
  makeExecutionId,
} from '../../utils/activities';
import { normalizeActivityCountry, getNextMonthPeriodKey } from '../../utils/countryHolidays';
import { PeriodClosureStatus } from './ActivitiesExecutionListView';

interface ActivitiesMatrixViewProps {
  data: ActivitiesWorkspaceData;
  assignments: MaterializedActivityAssignment[];
  closureStatus: PeriodClosureStatus;
  currentUserEmail?: string | null;
  hasWorkspaceToken: boolean;
  isConnectingWorkspace: boolean;
  isSyncingGoogleTasks: boolean;
  isAdmin: boolean;
  canOperate: boolean;
  onSelectAssignment: (assignment: MaterializedActivityAssignment) => void;
  onOpenNewActivity: () => void;
  onConnectWorkspace: () => void;
  onRequestEnableGoogleTasks: (
    items: MaterializedActivityAssignment[],
    scopeLabel: string,
    includeClosureTask?: boolean
  ) => void;
  onRequestSyncClosureTask: () => void;
}

export const ActivitiesMatrixView: React.FC<ActivitiesMatrixViewProps> = ({
  data,
  assignments,
  closureStatus,
  currentUserEmail,
  hasWorkspaceToken,
  isConnectingWorkspace,
  isSyncingGoogleTasks,
  isAdmin,
  canOperate,
  onSelectAssignment,
  onOpenNewActivity,
  onConnectWorkspace,
  onRequestEnableGoogleTasks,
  onRequestSyncClosureTask,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [periodicityFilter, setPeriodicityFilter] = useState<'ALL' | ActivityPeriodicity>('ALL');
  const [responsibleFilter, setResponsibleFilter] = useState<string>('ALL');

  const activeSocieties = useMemo(
    () => data.societies.filter((s) => s.activa),
    [data.societies]
  );

  const allActiveResponsibleIds = useMemo(
    () => data.responsibles.filter((r) => r.activo).map((r) => r.id),
    [data.responsibles]
  );

  const periodActivation = useMemo(
    () => getPeriodActivationStatus(data.selectedPeriod),
    [data.selectedPeriod]
  );

  const assignmentByExecId = useMemo(
    () => new Map(assignments.map((a) => [a.executionId, a])),
    [assignments]
  );

  const filteredActivities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return data.activities.filter((act) => {
      if (!act.activa) return false;
      if (periodicityFilter !== 'ALL' && act.periodicidad !== periodicityFilter) return false;
      if (isAdmin && responsibleFilter !== 'ALL') {
        const hasResp = activeSocieties.some((soc) => {
          const { ids } = getEffectiveResponsibleIdsForCell(act, soc, allActiveResponsibleIds);
          return ids.includes(responsibleFilter);
        });
        if (!hasResp) return false;
      }
      if (q) {
        const matchesName = act.nombre.toLowerCase().includes(q);
        const matchesDesc = (act.descripcion || '').toLowerCase().includes(q);
        if (!matchesName && !matchesDesc) return false;
      }
      return true;
    });
  }, [
    data.activities,
    searchQuery,
    periodicityFilter,
    responsibleFilter,
    isAdmin,
    activeSocieties,
    allActiveResponsibleIds,
  ]);

  const kpis = useMemo(() => {
    const total = assignments.length;
    const completed = assignments.filter((a) => a.execution.estado === 'realizada').length;
    const overdue = assignments.filter((a) => a.trafficLight === 'vencida').length;
    const upcoming = assignments.filter((a) => a.trafficLight === 'proxima').length;
    const linkedTasks = assignments.filter((a) =>
      currentUserEmail
        ? Boolean(getGoogleTaskLinkForEmail(a.execution, currentUserEmail))
        : hasAnyGoogleTaskLink(a.execution)
    ).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, overdue, upcoming, linkedTasks, pct };
  }, [assignments, currentUserEmail]);

  const pendingForTasksEnable = useMemo(() => {
    const allPending = assignments.filter((a) => a.execution.estado !== 'realizada');
    const myPending = currentUserEmail
      ? allPending.filter((a) => assignmentIncludesEmail(a, currentUserEmail))
      : [];
    const targetPool = myPending.length > 0 ? myPending : isAdmin ? allPending : [];
    const unlinked = targetPool.filter(
      (a) => !getGoogleTaskLinkForEmail(a.execution, currentUserEmail)
    );
    return {
      items: unlinked,
      isPersonal: myPending.length > 0,
    };
  }, [assignments, currentUserEmail, isAdmin]);

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#0F766E]">
                {formatPeriodLabel(data.selectedPeriod)}
              </span>
              <span className="text-slate-300">·</span>
              <span
                className={`text-[11px] font-semibold ${
                  periodActivation.isActive ? 'text-emerald-700' : 'text-slate-500'
                }`}
              >
                {periodActivation.statusLabel}
              </span>
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 tracking-tight mt-0.5">
              {isAdmin
                ? 'Matriz de Actividades por Sociedad'
                : 'Mis Actividades por Sociedad'}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => exportActivitiesMatrixToExcel(data, assignments)}
              disabled={assignments.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-[#1E60A8]" />
              <span>Exportar Excel</span>
            </button>
            {isAdmin && canOperate && (
              <button
                type="button"
                onClick={onOpenNewActivity}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nueva Actividad</span>
              </button>
            )}
          </div>
        </div>

        <div className="pt-5 grid grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-0 lg:divide-x lg:divide-slate-200">
          <div className="lg:pr-6">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Cumplido
            </div>
            <div className="mt-1.5 flex items-baseline gap-2 tabular-nums">
              <span className="text-2xl font-extrabold text-emerald-600">{kpis.pct}%</span>
              <span className="text-xs text-slate-500">
                {kpis.completed} de {kpis.total}
              </span>
            </div>
          </div>

          <div className="lg:px-6">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Pronto a Cumplir
            </div>
            <div className="mt-1.5 flex items-baseline gap-2 tabular-nums">
              <span className="text-2xl font-extrabold text-amber-500">{kpis.upcoming}</span>
              <span className="text-xs text-slate-500">≤ {data.subtleReminderDaysBefore} días</span>
            </div>
          </div>

          <div className="lg:px-6">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Vencido
            </div>
            <div className="mt-1.5 flex items-baseline gap-2 tabular-nums">
              <span
                className={`text-2xl font-extrabold ${
                  kpis.overdue > 0 ? 'text-red-600' : 'text-slate-900'
                }`}
              >
                {kpis.overdue}
              </span>
              <span className="text-xs text-slate-500">fuera de fecha</span>
            </div>
          </div>

          <div className="lg:pl-6">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              En Google Tasks
            </div>
            <div className="mt-1.5 flex items-baseline gap-2 tabular-nums">
              <span className="text-2xl font-extrabold text-[#1E60A8]">{kpis.linkedTasks}</span>
              <span className="text-xs text-slate-500">en Gmail</span>
            </div>
          </div>
        </div>
      </section>

      {/* Google Session or Day-15 Auto-Activation / Unlinked Google Tasks Quick Action Strip */}
      {canOperate &&
        (!hasWorkspaceToken ||
          pendingForTasksEnable.items.length > 0 ||
          (!closureStatus.isLinkedInGoogleTasks && closureStatus.totalTasks > 0)) && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white px-4 py-3">
            {!hasWorkspaceToken ? (
              <>
                <div className="flex items-center gap-2.5 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="font-semibold">
                    Activa tu sesión de Google para notificar por Gmail y sincronizar Google Tasks.
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isConnectingWorkspace}
                  onClick={onConnectWorkspace}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isConnectingWorkspace ? 'animate-spin' : ''}`}
                  />
                  <span>Activar Gmail y Google Tasks</span>
                </button>
              </>
            ) : pendingForTasksEnable.items.length > 0 ? (
              <>
                <div className="flex items-center gap-2.5 text-xs text-slate-700">
                  <ListTodo className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    {periodActivation.isActive && (
                      <strong className="text-emerald-700">Activación día 15 · </strong>
                    )}
                    <strong className="text-slate-900 tabular-nums">
                      {pendingForTasksEnable.items.length} actividad(es)
                    </strong>{' '}
                    {pendingForTasksEnable.isPersonal
                      ? 'asignada(s) y tu tarea independiente de cierre listas para habilitar en Google Tasks (Gmail).'
                      : 'pendientes y tarea independiente de cierre listas para habilitar en Google Tasks (Gmail).'}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isSyncingGoogleTasks}
                  onClick={() =>
                    onRequestEnableGoogleTasks(
                      pendingForTasksEnable.items,
                      pendingForTasksEnable.isPersonal
                        ? 'tus actividades asignadas'
                        : `las pendientes de ${formatPeriodLabel(data.selectedPeriod)}`,
                      true
                    )
                  }
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  <ListTodo className="w-3.5 h-3.5" />
                  <span>
                    Habilitar en Google Tasks ({pendingForTasksEnable.items.length} + Cierre)
                  </span>
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2.5 text-xs text-slate-700">
                  <ListTodo className="w-4 h-4 text-[#1E60A8] shrink-0" />
                  <span>
                    Habilita tu <strong className="text-slate-900">tarea independiente de cierre</strong>{' '}
                    en Google Tasks para enviar la notificación por Gmail al concluir todas las actividades.
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isSyncingGoogleTasks}
                  onClick={onRequestSyncClosureTask}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  <ListTodo className="w-3.5 h-3.5" />
                  <span>Habilitar tarea de cierre en Tasks</span>
                </button>
              </>
            )}
          </div>
        )}

      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar actividad..."
            className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:bg-white"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filtrar periodicidad"
            value={periodicityFilter}
            onChange={(e) => setPeriodicityFilter(e.target.value as 'ALL' | ActivityPeriodicity)}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 cursor-pointer"
          >
            <option value="ALL">Todas las periodicidades</option>
            <option value="MENSUAL">Mensual</option>
            <option value="TRIMESTRAL">Trimestral</option>
            <option value="SEMANAL">Semanal</option>
            <option value="ANUAL">Anual</option>
          </select>

          {isAdmin && (
            <select
              aria-label="Filtrar responsable"
              value={responsibleFilter}
              onChange={(e) => setResponsibleFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 cursor-pointer"
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

      {activeSocieties.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-10 text-center text-xs text-slate-500">
          No tienes sociedades ni actividades asignadas a tu correo en el catálogo actual.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left min-w-[780px]">
              <thead>
                <tr className="bg-[#132B63] text-white">
                  <th
                    colSpan={3}
                    className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-sky-200 border-r border-white/15"
                  >
                    Cierre {formatPeriodLabel(data.selectedPeriod)} · Vence{' '}
                    {formatPeriodLabel(getNextMonthPeriodKey(data.selectedPeriod))}
                  </th>
                  <th
                    colSpan={activeSocieties.length}
                    className="px-4 py-2 text-center text-[11px] font-bold uppercase tracking-widest text-white"
                  >
                    SOCIEDAD / RESPONSABLE
                  </th>
                </tr>
                <tr className="bg-slate-100/95 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                  <th className="sticky left-0 z-10 bg-slate-100/95 px-4 py-3 min-w-[260px] border-r border-slate-200">
                    ACTIVIDADES
                  </th>
                  <th className="px-3 py-3 w-28 border-r border-slate-200">PERIODICIDAD</th>
                  <th className="px-3 py-3 w-32 border-r border-slate-200">DÍA HÁBIL</th>
                  {activeSocieties.map((soc) => (
                    <th
                      key={soc.id}
                      className="px-3 py-3 text-center min-w-[146px] border-r last:border-r-0 border-slate-200"
                    >
                      <div>{soc.codigo}</div>
                      <div className="text-[9px] font-semibold text-slate-500 normal-case tracking-normal mt-0.5">
                        {normalizeActivityCountry(soc.pais)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 text-xs">
                {filteredActivities.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3 + activeSocieties.length}
                      className="px-6 py-12 text-center text-slate-500"
                    >
                      No hay actividades que coincidan con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredActivities.map((act) => {
                    const resolvedDates = Array.from(
                      new Set(
                        activeSocieties.map((s) =>
                          computeSuggestedDateForPeriod(
                            data.selectedPeriod,
                            act.diaSugerido,
                            s.pais
                          )
                        )
                      )
                    );
                    const uniformDate = resolvedDates.length === 1 ? resolvedDates[0] : null;
                    const countryBreakdownTitle = activeSocieties
                      .map(
                        (s) =>
                          `${s.codigo} (${normalizeActivityCountry(s.pais)}): ${formatShortDateEs(
                            computeSuggestedDateForPeriod(
                              data.selectedPeriod,
                              act.diaSugerido,
                              s.pais
                            )
                          )}`
                      )
                      .join(' · ');

                    return (
                      <tr key={act.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="sticky left-0 z-10 bg-white px-4 py-3 border-r border-slate-200 align-middle">
                          <div className="font-bold text-slate-900 leading-snug">{act.nombre}</div>
                          {act.descripcion && (
                            <div className="text-[11px] text-slate-500 truncate max-w-[280px] mt-0.5">
                              {act.descripcion}
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3 border-r border-slate-200 align-middle whitespace-nowrap">
                          <span
                            className={`text-[11px] font-bold tracking-wide ${
                              act.periodicidad === 'MENSUAL'
                                ? 'text-[#1E60A8]'
                                : act.periodicidad === 'TRIMESTRAL'
                                ? 'text-indigo-700'
                                : 'text-slate-600'
                            }`}
                          >
                            {act.periodicidad}
                          </span>
                        </td>

                        <td
                          title={countryBreakdownTitle}
                          className="px-3 py-3 border-r border-slate-200 align-middle whitespace-nowrap tabular-nums"
                        >
                          <div className="inline-flex items-center gap-1 font-bold text-slate-800">
                            <Calendar className="w-3 h-3 text-[#1E60A8]" />
                            <span>Hábil #{act.diaSugerido}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                            {uniformDate ? formatShortDateEs(uniformDate) : 'Según país'}
                          </div>
                        </td>

                        {activeSocieties.map((soc) => {
                          const execId = makeExecutionId(data.selectedPeriod, act.id, soc.codigo);
                          const item = assignmentByExecId.get(execId);

                          if (!item) {
                            return (
                              <td
                                key={soc.id}
                                className="p-1.5 border-r last:border-r-0 border-slate-200/80 align-middle text-center"
                              >
                                <span className="text-slate-300 text-xs select-none">—</span>
                              </td>
                            );
                          }

                          const isDone = item.execution.estado === 'realizada';
                          const isOverdue = item.trafficLight === 'vencida';
                          const isUpcoming = item.trafficLight === 'proxima';

                          const cellStyle = isDone
                            ? 'bg-emerald-600 border-emerald-700 hover:bg-emerald-700 text-white shadow-2xs'
                            : isOverdue
                            ? 'bg-red-600 border-red-700 hover:bg-red-700 text-white shadow-2xs'
                            : isUpcoming
                            ? 'bg-amber-400 border-amber-500 hover:bg-amber-500 text-amber-950 shadow-2xs'
                            : 'bg-white border-slate-200 hover:border-[#1E60A8] hover:bg-slate-50 text-slate-900';

                          const dateTextClass = isDone
                            ? 'text-emerald-100'
                            : isOverdue
                            ? 'text-red-100'
                            : isUpcoming
                            ? 'text-amber-950/90'
                            : 'text-slate-500';

                          const displayDate = isDone
                            ? formatShortDateEs(
                                item.execution.completadaAtIso || item.execution.fechaSugerida
                              )
                            : formatShortDateEs(item.execution.fechaSugerida);

                          const skippedText =
                            item.businessDayInfo.skippedHolidays.length > 0
                              ? ` · Omite feriados: ${item.businessDayInfo.skippedHolidays
                                  .map((h) => `${formatShortDateEs(h.dateYmd)} (${h.name})`)
                                  .join(', ')}`
                              : '';

                          return (
                            <td
                              key={soc.id}
                              className="p-1.5 border-r last:border-r-0 border-slate-200/80 align-middle"
                            >
                              <button
                                type="button"
                                onClick={() => onSelectAssignment(item)}
                                title={
                                  isDone && item.execution.completadaPorNombre
                                    ? `${item.responsibleNamesLabel} · Cumplida por ${item.execution.completadaPorNombre} (${displayDate})`
                                    : `${item.responsibleNamesLabel} · Día hábil #${item.activity.diaSugerido} (${item.businessDayInfo.country}): ${displayDate}${skippedText}`
                                }
                                className={`w-full min-h-[54px] px-2.5 py-2 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${cellStyle}`}
                              >
                                <span className="font-bold text-[12px] leading-tight line-clamp-2">
                                  {item.responsibleNamesLabel}
                                </span>
                                <span
                                  className={`text-[11px] font-semibold tabular-nums leading-none ${dateTextClass}`}
                                >
                                  {displayDate}
                                </span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-600">
            <div className="flex flex-wrap items-center gap-4 font-medium">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-emerald-600" />
                Cumplido
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-amber-400 border border-amber-500" />
                Pronto a cumplir
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-red-600" />
                Vencido
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-white border border-slate-300" />
                Programada
              </span>
            </div>
            <span className="tabular-nums text-slate-500">
              {filteredActivities.length} actividad(es) · {activeSocieties.length} sociedades
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
