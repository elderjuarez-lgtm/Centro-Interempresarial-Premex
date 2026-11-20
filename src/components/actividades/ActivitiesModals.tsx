import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Mail,
  CheckSquare,
  RotateCcw,
  AlertTriangle,
  Send,
  Loader2,
  ListTodo,
  RefreshCw,
  Clock,
  AlertCircle,
} from 'lucide-react';
import {
  MaterializedActivityAssignment,
  formatDateTimeEs,
  formatPeriodLabel,
  formatShortDateEs,
} from '../../utils/activities';

// ============================================================================
// 1. Explicit Workspace Confirmation Modal (Gmail & Google Tasks)
// ============================================================================

export interface WorkspaceConfirmPayload {
  kind: 'gmail_reminder' | 'gmail_completion' | 'tasks_push' | 'tasks_complete' | 'period_reset';
  title: string;
  description: string;
  recipients?: string[];
  subjectPreview?: string;
  itemsSummary: string[];
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}

interface WorkspaceActionConfirmModalProps {
  payload: WorkspaceConfirmPayload | null;
  onClose: () => void;
}

export const WorkspaceActionConfirmModal: React.FC<WorkspaceActionConfirmModalProps> = ({
  payload,
  onClose,
}) => {
  const [isExecuting, setIsExecuting] = useState(false);

  if (!payload) return null;

  const isGmail = payload.kind === 'gmail_reminder' || payload.kind === 'gmail_completion';
  const isReset = payload.kind === 'period_reset';

  const handleConfirm = async () => {
    setIsExecuting(true);
    try {
      await payload.onConfirm();
      onClose();
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={() => {
        if (!isExecuting) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isReset
                  ? 'bg-amber-100 text-amber-800'
                  : isGmail
                  ? 'bg-[#1E60A8]/10 text-[#1E60A8]'
                  : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {isReset ? (
                <RotateCcw className="w-5 h-5" />
              ) : isGmail ? (
                <Mail className="w-5 h-5" />
              ) : (
                <ListTodo className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {isReset
                  ? 'Confirmar reinicio de periodo'
                  : isGmail
                  ? 'Confirmar envío por Gmail'
                  : 'Confirmar en Google Tasks'}
              </div>
              <h3 className="text-base font-bold text-slate-900 leading-snug">{payload.title}</h3>
            </div>
          </div>
          <button
            type="button"
            disabled={isExecuting}
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-slate-600 leading-relaxed">{payload.description}</p>

          {payload.recipients && payload.recipients.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Destinatarios ({payload.recipients.length})
              </div>
              <div className="text-xs font-mono text-slate-800 break-words leading-relaxed">
                {payload.recipients.join(', ')}
              </div>
            </div>
          )}

          {payload.subjectPreview && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Asunto
              </div>
              <div className="text-xs font-semibold text-slate-900">{payload.subjectPreview}</div>
            </div>
          )}

          {payload.itemsSummary.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-3.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Detalle ({payload.itemsSummary.length})
              </div>
              <ul className="space-y-1.5 text-xs text-slate-700 max-h-40 overflow-y-auto">
                {payload.itemsSummary.map((line, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-[#1E60A8] font-bold">·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={isExecuting}
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-200/60 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isExecuting}
            onClick={handleConfirm}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-xl transition-colors cursor-pointer disabled:opacity-60 ${
              isReset
                ? 'bg-amber-600 hover:bg-amber-700'
                : isGmail
                ? 'bg-[#1E60A8] hover:bg-[#132B63]'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isExecuting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isReset ? (
              <RotateCcw className="w-3.5 h-3.5" />
            ) : isGmail ? (
              <Send className="w-3.5 h-3.5" />
            ) : (
              <CheckSquare className="w-3.5 h-3.5" />
            )}
            <span>{isExecuting ? 'Ejecutando...' : payload.confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. Unified Streamlined "Cumplir Actividad" Modal (NO Responsible Assignment)
// ============================================================================

export interface CompleteActivityResult {
  completed: boolean;
  gmailSent: boolean;
  gmailError?: string;
  needsAuth?: boolean;
  taskSynced: boolean;
  taskError?: string;
  recipientsSent?: string[];
}

interface CompleteActivityModalProps {
  assignment: MaterializedActivityAssignment | null;
  recipients: { email: string; nombre: string; origen: string }[];
  hasWorkspaceToken: boolean;
  isTaskLinkedForUser: boolean;
  canOperate: boolean;
  onClose: () => void;
  onAuthorizeGoogle: () => Promise<string | null>;
  onConfirmComplete: (options: {
    assignment: MaterializedActivityAssignment;
    comment: string;
    sendGmailConfirmation: boolean;
    markGoogleTaskCompleted: boolean;
  }) => Promise<CompleteActivityResult>;
  onResendGmailNotification: (
    assignment: MaterializedActivityAssignment
  ) => Promise<CompleteActivityResult>;
  onReopenActivity: (
    assignment: MaterializedActivityAssignment,
    reopenGoogleTask: boolean
  ) => Promise<void>;
  onSyncSingleTask: (assignment: MaterializedActivityAssignment) => void;
}

export const CompleteActivityModal: React.FC<CompleteActivityModalProps> = ({
  assignment,
  recipients,
  hasWorkspaceToken,
  isTaskLinkedForUser,
  canOperate,
  onClose,
  onAuthorizeGoogle,
  onConfirmComplete,
  onResendGmailNotification,
  onReopenActivity,
  onSyncSingleTask,
}) => {
  const [comment, setComment] = useState('');
  const [sendGmailConfirmation, setSendGmailConfirmation] = useState(true);
  const [markGoogleTaskCompleted, setMarkGoogleTaskCompleted] = useState(true);
  const [reopenGoogleTask, setReopenGoogleTask] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isSendingNotice, setIsSendingNotice] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [inlineError, setInlineError] = useState<{ message: string; needsAuth?: boolean } | null>(
    null
  );
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (assignment) {
      setComment(assignment.execution.comentarioCierre || '');
      setSendGmailConfirmation(recipients.length > 0);
      setMarkGoogleTaskCompleted(true);
      setReopenGoogleTask(isTaskLinkedForUser);
      setInlineError(null);
      setInlineSuccess(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.executionId]);

  useEffect(() => {
    setReopenGoogleTask(isTaskLinkedForUser);
  }, [isTaskLinkedForUser]);

  if (!assignment) return null;

  const isCompleted = assignment.execution.estado === 'realizada';
  const isOverdue = assignment.trafficLight === 'vencida';
  const isUpcoming = assignment.trafficLight === 'proxima';

  const handleAuthorize = async () => {
    setIsAuthorizing(true);
    setInlineError(null);
    try {
      const token = await onAuthorizeGoogle();
      if (token) {
        setInlineSuccess('Sesión de Google activada para Gmail y Google Tasks.');
      } else {
        setInlineError({
          message: 'No se completó la autorización de Google. Inténtalo nuevamente.',
          needsAuth: true,
        });
      }
    } catch (err) {
      setInlineError({
        message: err instanceof Error ? err.message : 'Error al autorizar Google.',
        needsAuth: true,
      });
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canOperate) return;
    setIsSubmitting(true);
    setInlineError(null);
    setInlineSuccess(null);
    try {
      const result = await onConfirmComplete({
        assignment,
        comment: comment.trim(),
        sendGmailConfirmation: sendGmailConfirmation && recipients.length > 0,
        markGoogleTaskCompleted,
      });

      if (result.gmailError) {
        // Keep modal open so the user sees why Gmail did not send and can retry in 1 click
        setInlineError({
          message: result.gmailError,
          needsAuth: result.needsAuth,
        });
        return;
      }

      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendGmail = async () => {
    setIsSendingNotice(true);
    setInlineError(null);
    setInlineSuccess(null);
    try {
      const res = await onResendGmailNotification(assignment);
      if (res.gmailSent) {
        setInlineSuccess(
          `Notificación enviada por Gmail a ${(res.recipientsSent || []).join(', ')}.`
        );
      } else if (res.gmailError) {
        setInlineError({ message: res.gmailError, needsAuth: res.needsAuth });
      }
    } finally {
      setIsSendingNotice(false);
    }
  };

  const handleReopen = async () => {
    setIsReopening(true);
    setInlineError(null);
    try {
      await onReopenActivity(assignment, reopenGoogleTask && isTaskLinkedForUser);
      onClose();
    } finally {
      setIsReopening(false);
    }
  };

  const headerTone = isCompleted
    ? 'bg-emerald-600 text-white'
    : isOverdue
    ? 'bg-red-600 text-white'
    : isUpcoming
    ? 'bg-amber-400 text-amber-950'
    : 'bg-[#132B63] text-white';

  const headerSubTone = isUpcoming ? 'text-amber-950/80' : 'text-white/80';

  return (
    <div
      className="fixed inset-0 z-[65] bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={() => {
        if (!isSubmitting && !isSendingNotice && !isReopening) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with strong semaphore color */}
        <div className={`px-6 py-4 flex items-start justify-between gap-3 ${headerTone}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isUpcoming ? 'bg-amber-950/15 text-amber-950' : 'bg-white/15 text-white'
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : isOverdue ? (
                <AlertCircle className="w-5 h-5" />
              ) : (
                <Clock className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className={`text-[11px] font-bold uppercase tracking-wider ${headerSubTone}`}>
                {isCompleted
                  ? 'Actividad Cumplida'
                  : isOverdue
                  ? 'Vencida · Confirmar Cumplimiento'
                  : isUpcoming
                  ? 'Pronto a Cumplir'
                  : 'Cumplir Actividad'}
              </div>
              <h3 className="text-base font-bold leading-snug">{assignment.activity.nombre}</h3>
            </div>
          </div>
          <button
            type="button"
            disabled={isSubmitting || isSendingNotice || isReopening}
            onClick={onClose}
            aria-label="Cerrar"
            className={`p-1.5 rounded-lg cursor-pointer ${
              isUpcoming
                ? 'text-amber-950/70 hover:text-amber-950 hover:bg-amber-950/10'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[72vh] overflow-y-auto">
          {/* Summary Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <div>
              <div className="text-slate-400 font-medium">Sociedad</div>
              <div className="font-bold text-slate-900 mt-0.5">{assignment.society.codigo}</div>
            </div>
            <div>
              <div className="text-slate-400 font-medium">Periodo</div>
              <div className="font-bold text-slate-900 mt-0.5">
                {formatPeriodLabel(assignment.periodKey)}
              </div>
            </div>
            <div>
              <div className="text-slate-400 font-medium">Responsable(s)</div>
              <div className="font-semibold text-slate-800 mt-0.5">
                {assignment.responsibleNamesLabel}
              </div>
            </div>
            <div>
              <div className="text-slate-400 font-medium">
                {isCompleted ? 'Fecha de cumplimiento' : 'Fecha a cumplir'}
              </div>
              <div
                className={`font-bold mt-0.5 tabular-nums ${
                  isCompleted
                    ? 'text-emerald-700'
                    : isOverdue
                    ? 'text-red-600'
                    : isUpcoming
                    ? 'text-amber-700'
                    : 'text-slate-800'
                }`}
              >
                {isCompleted
                  ? formatShortDateEs(
                      assignment.execution.completadaAtIso || assignment.execution.fechaSugerida
                    )
                  : formatShortDateEs(assignment.execution.fechaSugerida)}
              </div>
            </div>
          </div>

          {/* Inline Error or Success Feedback */}
          {inlineError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-900 space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="font-semibold leading-relaxed">{inlineError.message}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {inlineError.needsAuth && (
                  <button
                    type="button"
                    disabled={isAuthorizing}
                    onClick={handleAuthorize}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-lg cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isAuthorizing ? 'animate-spin' : ''}`} />
                    <span>Autorizar Google</span>
                  </button>
                )}
                {isCompleted && recipients.length > 0 && (
                  <button
                    type="button"
                    disabled={isSendingNotice}
                    onClick={handleResendGmail}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer disabled:opacity-60"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Reenviar notificación Gmail</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {inlineSuccess && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{inlineSuccess}</span>
            </div>
          )}

          {!isCompleted ? (
            <>
              <div>
                <label
                  htmlFor="completion-comment"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Nota de soporte (opcional)
                </label>
                <textarea
                  id="completion-comment"
                  rows={2}
                  disabled={!canOperate}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Ej. Asiento contabilizado o soporte cargado."
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                />
              </div>

              {/* Gmail Notification & Google Tasks Options */}
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendGmailConfirmation && recipients.length > 0}
                    disabled={recipients.length === 0 || !canOperate}
                    onChange={(e) => setSendGmailConfirmation(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-[#1E60A8] focus:ring-[#1E60A8]"
                  />
                  <div className="text-xs min-w-0 flex-1">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-[#1E60A8]" />
                      <span>Notificar cumplimiento por Gmail ({recipients.length})</span>
                    </div>
                    <div className="text-slate-600 font-mono text-[11px] break-all mt-1">
                      {recipients.length > 0
                        ? recipients.map((r) => r.email).join(', ')
                        : 'Sin destinatarios configurados en Catálogo.'}
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 pt-2.5 border-t border-slate-100 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canOperate}
                    checked={markGoogleTaskCompleted}
                    onChange={(e) => setMarkGoogleTaskCompleted(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <div className="text-xs">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <ListTodo className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Marcar cumplida en Google Tasks (Gmail)</span>
                    </div>
                    {assignment.responsibles.length > 1 && (
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Tarea compartida ({assignment.responsibles.length} usuarios): al cumplirla se reflejará automáticamente en la app y en el Google Tasks de los demás responsables.
                      </div>
                    )}
                  </div>
                </label>

                {!hasWorkspaceToken && (
                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-amber-800 bg-amber-50/80 -mx-3.5 -mb-3.5 px-3.5 py-2.5 rounded-b-xl">
                    <span className="font-medium">
                      Se pedirá autorización rápida de Google al enviar.
                    </span>
                    <button
                      type="button"
                      disabled={isAuthorizing}
                      onClick={handleAuthorize}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-[#132B63] bg-white border border-amber-300 hover:bg-amber-100 rounded-lg shrink-0 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isAuthorizing ? 'animate-spin' : ''}`} />
                      <span>Autorizar ahora</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Already Completed Details View */
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-1.5 text-xs">
                <div className="font-bold text-emerald-900">
                  Cumplida el {formatDateTimeEs(assignment.execution.completadaAtIso)}
                </div>
                <div className="text-emerald-800">
                  Confirmada por{' '}
                  <strong>
                    {assignment.execution.completadaPorNombre ||
                      assignment.execution.completadaPorEmail ||
                      'Usuario'}
                  </strong>
                  {assignment.execution.origenConfirmacion === 'google_tasks'
                    ? ' · desde Google Tasks (Gmail)'
                    : ' · desde Panel Premex'}
                </div>
                {assignment.execution.comentarioCierre && (
                  <div className="text-slate-700 pt-1 border-t border-emerald-200/70 mt-1.5">
                    Nota: {assignment.execution.comentarioCierre}
                  </div>
                )}
              </div>

              {/* Gmail Notification Status + Send/Resend Button */}
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900">
                    <Mail className="w-3.5 h-3.5 text-[#1E60A8]" />
                    <span>Notificación Gmail</span>
                  </div>
                  {assignment.execution.notificacionCierreEnviadaIso ? (
                    <span className="text-[11px] font-semibold text-emerald-700">
                      Enviada · {formatDateTimeEs(assignment.execution.notificacionCierreEnviadaIso)}
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-amber-700">
                      Pendiente de envío
                    </span>
                  )}
                </div>

                {recipients.length > 0 && (
                  <div className="text-[11px] font-mono text-slate-600 break-all">
                    {recipients.map((r) => r.email).join(', ')}
                  </div>
                )}

                {canOperate && recipients.length > 0 && (
                  <button
                    type="button"
                    disabled={isSendingNotice}
                    onClick={handleResendGmail}
                    className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-60 ${
                      assignment.execution.notificacionCierreEnviadaIso
                        ? 'text-[#132B63] bg-slate-100 hover:bg-slate-200/80'
                        : 'text-white bg-[#1E60A8] hover:bg-[#132B63]'
                    }`}
                  >
                    {isSendingNotice ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isSendingNotice
                        ? 'Enviando correo...'
                        : assignment.execution.notificacionCierreEnviadaIso
                        ? 'Reenviar notificación por Gmail'
                        : 'Enviar notificación por Gmail ahora'}
                    </span>
                  </button>
                )}
              </div>

              {/* Google Tasks Status + Reopen Option */}
              {canOperate && (
                <div className="rounded-xl border border-slate-200 p-3.5 flex flex-col gap-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                      <ListTodo className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Google Tasks (Gmail)</span>
                    </div>
                    {isTaskLinkedForUser ? (
                      <span className="text-[11px] font-semibold text-emerald-700">
                        Sincronizada
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onSyncSingleTask(assignment);
                        }}
                        className="text-[11px] font-semibold text-[#1E60A8] hover:underline cursor-pointer"
                      >
                        Sincronizar ahora
                      </button>
                    )}
                  </div>

                  {isTaskLinkedForUser && (
                    <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reopenGoogleTask}
                        onChange={(e) => setReopenGoogleTask(e.target.checked)}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-600"
                      />
                      <span>Al reabrir, reactivar también en Google Tasks</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2.5">
          {!isCompleted ? (
            <>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-200/60 cursor-pointer"
              >
                Cancelar
              </button>
              {canOperate && (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors cursor-pointer disabled:opacity-60 shadow-2xs"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isSubmitting
                      ? 'Procesando...'
                      : sendGmailConfirmation && recipients.length > 0
                      ? 'Cumplir y Notificar'
                      : 'Cumplir'}
                  </span>
                </button>
              )}
            </>
          ) : (
            <>
              {canOperate ? (
                <button
                  type="button"
                  disabled={isReopening}
                  onClick={handleReopen}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isReopening ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  <span>Reabrir actividad</span>
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                disabled={isReopening || isSendingNotice}
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl cursor-pointer"
              >
                Cerrar
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
};
