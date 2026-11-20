import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
  RefreshCw,
  LayoutGrid,
  CheckSquare,
  MailCheck,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ActiveModuleId,
  ActivitiesTab,
  ActivityExecutionRecord,
  ActivityGoogleTaskLink,
  ActivitiesWorkspaceData,
  EffectivePermissions,
  UserPermissionRecord,
} from '../../types';
import {
  MaterializedActivityAssignment,
  assignmentIncludesEmail,
  formatPeriodLabel,
  formatShortDateEs,
  getGoogleTaskLinkForEmail,
  hasAnyGoogleTaskLink,
  materializePeriodAssignments,
  resolveCompletionNotificationRecipients,
  withUpdatedGoogleTaskLink,
} from '../../utils/activities';
import { normalizeEmail } from '../../utils/permissions';
import { getAccessToken } from '../../services/auth';
import {
  GoogleWorkspaceAuthError,
  PREMEX_GOOGLE_TASKS_LIST_TITLE,
  buildCompletionConfirmationEmail,
  buildSubtleReminderEmail,
  extractExecutionIdFromTaskNotes,
  listPremexGoogleTasks,
  pushActivitiesToGoogleTasks,
  sendGmailHtmlMessage,
  syncSingleActivityToGoogleTasks,
} from '../../services/googleWorkspaceActivities';
import { ActivitiesSidebar } from './ActivitiesSidebar';
import { ActivitiesHeader } from './ActivitiesHeader';
import { ActivitiesMatrixView } from './ActivitiesMatrixView';
import { ActivitiesExecutionListView } from './ActivitiesExecutionListView';
import {
  ActivitiesWorkspaceSyncView,
  ResponsibleDigestGroup,
} from './ActivitiesWorkspaceSyncView';
import { ActivitiesConfigSubTab, ActivitiesConfigView } from './ActivitiesConfigView';
import {
  CompleteActivityModal,
  CompleteActivityResult,
  WorkspaceActionConfirmModal,
  WorkspaceConfirmPayload,
} from './ActivitiesModals';

interface ActivitiesModuleWorkspaceProps {
  data: ActivitiesWorkspaceData;
  onUpdateWorkspace: (updater: (prev: ActivitiesWorkspaceData) => ActivitiesWorkspaceData) => void;
  onSaveToCloud: (patch?: {
    executionPatches?: Record<string, ActivityExecutionRecord>;
    lastGoogleTasksSyncIso?: string;
  }) => Promise<void>;
  isSavingCloud: boolean;
  currentUser: User | null;
  accessToken: string | null;
  onSignInWithGoogle: () => void;
  onReconnectWorkspace: () => Promise<string | null>;
  onInvalidateWorkspaceToken: () => void;
  onSignOut: () => void;
  onSwitchModule: (moduleId: ActiveModuleId) => void;
  permissions: EffectivePermissions;
  permissionRecords: UserPermissionRecord[];
}

interface FeedbackBannerState {
  type: 'success' | 'info' | 'error' | 'auth';
  message: string;
}

const AUTO_PULL_MIN_INTERVAL_MS = 20_000;

export const ActivitiesModuleWorkspace: React.FC<ActivitiesModuleWorkspaceProps> = ({
  data,
  onUpdateWorkspace,
  onSaveToCloud,
  isSavingCloud,
  currentUser,
  accessToken,
  onSignInWithGoogle,
  onReconnectWorkspace,
  onInvalidateWorkspaceToken,
  onSignOut,
  onSwitchModule,
  permissions,
  permissionRecords,
}) => {
  const [activeTab, setActiveTab] = useState<ActivitiesTab>('matriz');
  const [configSubTab, setConfigSubTab] = useState<ActivitiesConfigSubTab>('actividades');
  const [newActivityTrigger, setNewActivityTrigger] = useState(0);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [completingExecId, setCompletingExecId] = useState<string | null>(null);
  const [workspaceConfirm, setWorkspaceConfirm] = useState<WorkspaceConfirmPayload | null>(null);

  const [isSyncingGoogleTasks, setIsSyncingGoogleTasks] = useState(false);
  const [isConnectingWorkspace, setIsConnectingWorkspace] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<FeedbackBannerState | null>(null);

  const lastAutoPullRef = useRef<number>(0);
  const isPullingRef = useRef<boolean>(false);

  const isAdmin = permissions.isAdmin;
  const hasWorkspaceToken = Boolean(accessToken);
  const effectiveUserEmail = permissions.email || currentUser?.email || '';
  const currentUserName = currentUser?.displayName || effectiveUserEmail || 'Usuario Premex';

  useEffect(() => {
    if (!isAdmin && activeTab === 'configuracion') {
      setActiveTab('matriz');
    }
  }, [isAdmin, activeTab]);

  const assignments = useMemo(() => materializePeriodAssignments(data), [data]);

  const assignmentByExecId = useMemo(
    () => new Map(assignments.map((a) => [a.executionId, a])),
    [assignments]
  );

  const completingAssignment = useMemo(
    () => (completingExecId ? assignmentByExecId.get(completingExecId) || null : null),
    [completingExecId, assignmentByExecId]
  );

  const sidebarMetrics = useMemo(() => {
    const totalAssignments = assignments.length;
    const completedCount = assignments.filter((a) => a.execution.estado === 'realizada').length;
    const pendingCount = totalAssignments - completedCount;
    const overdueCount = assignments.filter((a) => a.trafficLight === 'vencida').length;
    const myPendingCount = effectiveUserEmail
      ? assignments.filter(
          (a) =>
            a.execution.estado !== 'realizada' &&
            assignmentIncludesEmail(a, effectiveUserEmail)
        ).length
      : 0;
    const syncedTasksCount = assignments.filter((a) =>
      effectiveUserEmail
        ? Boolean(getGoogleTaskLinkForEmail(a.execution, effectiveUserEmail))
        : hasAnyGoogleTaskLink(a.execution)
    ).length;
    return {
      totalAssignments,
      completedCount,
      pendingCount,
      overdueCount,
      myPendingCount,
      syncedTasksCount,
    };
  }, [assignments, effectiveUserEmail]);

  const resolvedCompletionRecipients = useMemo(
    () =>
      resolveCompletionNotificationRecipients({
        notificationRecipients: data.notificationRecipients,
        notifyAdminsAutomatically: data.notifyAdminsAutomatically,
        suitePermissionRecords: permissionRecords,
        activityExtraEmails: completingAssignment?.activity.notificarAdicionales,
      }),
    [
      data.notificationRecipients,
      data.notifyAdminsAutomatically,
      permissionRecords,
      completingAssignment,
    ]
  );

  const generalCompletionRecipients = useMemo(
    () =>
      resolveCompletionNotificationRecipients({
        notificationRecipients: data.notificationRecipients,
        notifyAdminsAutomatically: data.notifyAdminsAutomatically,
        suitePermissionRecords: permissionRecords,
      }),
    [data.notificationRecipients, data.notifyAdminsAutomatically, permissionRecords]
  );

  const handleWorkspaceError = (err: unknown, fallbackMsg: string) => {
    if (err instanceof GoogleWorkspaceAuthError) {
      onInvalidateWorkspaceToken();
      setFeedbackBanner({
        type: 'auth',
        message: err.message,
      });
      return;
    }
    const msg = err instanceof Error ? err.message : fallbackMsg;
    setFeedbackBanner({ type: 'error', message: msg });
  };

  /**
   * Resolves a valid in-memory Google Workspace OAuth access token.
   * When interactive is true and no token exists, launches the consent popup immediately
   * inside the user click gesture so Gmail and Google Tasks succeed on the first try.
   */
  const resolveWorkspaceToken = async (interactive: boolean): Promise<string | null> => {
    const existing = (accessToken || '').trim() || (await getAccessToken()) || '';
    if (existing) return existing;
    if (!interactive) return null;
    setIsConnectingWorkspace(true);
    try {
      const token = await onReconnectWorkspace();
      return token && token.trim() ? token.trim() : null;
    } finally {
      setIsConnectingWorkspace(false);
    }
  };

  const handleConnectWorkspace = async (): Promise<string | null> => {
    setIsConnectingWorkspace(true);
    try {
      const token = await onReconnectWorkspace();
      if (token) {
        setFeedbackBanner({
          type: 'success',
          message: 'Sesión de Google activada para Gmail y Google Tasks.',
        });
        return token;
      }
      setFeedbackBanner({
        type: 'auth',
        message: 'No se completó la autorización de Gmail y Google Tasks.',
      });
      return null;
    } catch (err) {
      handleWorkspaceError(err, 'No se pudo conectar con Google Workspace.');
      return null;
    } finally {
      setIsConnectingWorkspace(false);
    }
  };

  // ---------- Confirm Activity Completed (Matrix / List -> Cumplir + Gmail + Google Tasks) ----------
  const handleConfirmComplete = async (options: {
    assignment: MaterializedActivityAssignment;
    comment: string;
    sendGmailConfirmation: boolean;
    markGoogleTaskCompleted: boolean;
  }): Promise<CompleteActivityResult> => {
    const { assignment, comment, sendGmailConfirmation, markGoogleTaskCompleted } = options;
    const nowIso = new Date().toISOString();
    const recipients = resolveCompletionNotificationRecipients({
      notificationRecipients: data.notificationRecipients,
      notifyAdminsAutomatically: data.notifyAdminsAutomatically,
      suitePermissionRecords: permissionRecords,
      activityExtraEmails: assignment.activity.notificarAdicionales,
    });
    const recipientEmails = recipients.map((r) => r.email);

    const wantsGmail = sendGmailConfirmation && recipientEmails.length > 0;
    const needsWorkspaceCall = wantsGmail || markGoogleTaskCompleted;

    let activeToken: string | null = null;
    if (needsWorkspaceCall) {
      try {
        activeToken = await resolveWorkspaceToken(true);
      } catch (err) {
        if (err instanceof GoogleWorkspaceAuthError) {
          onInvalidateWorkspaceToken();
        }
        activeToken = null;
      }
    }

    let gmailSent = false;
    let gmailSentIso: string | undefined;
    let gmailError: string | undefined;
    let needsAuth = false;

    if (wantsGmail) {
      if (!activeToken) {
        needsAuth = true;
        gmailError =
          'Actividad marcada como cumplida, pero faltó autorizar Google para enviar la notificación por Gmail.';
      } else {
        try {
          const { subject, htmlBody } = buildCompletionConfirmationEmail({
            items: [
              {
                activityName: assignment.activity.nombre,
                periodicity: assignment.activity.periodicidad,
                societyCode: assignment.society.codigo,
                periodKey: assignment.periodKey,
                fechaSugerida: assignment.execution.fechaSugerida,
                responsibleName: assignment.responsibleNamesLabel,
                confirmedByName: currentUserName,
                confirmedByEmail: effectiveUserEmail,
                completedAtIso: nowIso,
                origin: 'panel',
                comment: comment || undefined,
              },
            ],
          });

          await sendGmailHtmlMessage({
            to: recipientEmails,
            subject,
            htmlBody,
            accessTokenOverride: activeToken,
          });
          gmailSent = true;
          gmailSentIso = new Date().toISOString();
        } catch (err) {
          if (err instanceof GoogleWorkspaceAuthError) {
            onInvalidateWorkspaceToken();
            needsAuth = true;
            gmailError = err.message;
          } else {
            gmailError =
              err instanceof Error
                ? err.message
                : 'No se pudo enviar la notificación por Gmail.';
          }
        }
      }
    }

    let taskSynced = false;
    let taskError: string | undefined;
    let syncedTaskLink: ActivityGoogleTaskLink | null = null;

    if (markGoogleTaskCompleted) {
      if (!activeToken) {
        taskError = 'Sin sesión activa de Google para actualizar Google Tasks.';
      } else {
        try {
          const existingLink = getGoogleTaskLinkForEmail(
            assignment.execution,
            effectiveUserEmail
          );
          const linked = await syncSingleActivityToGoogleTasks({
            assignment,
            status: 'completed',
            existingLink,
            createIfMissing: true,
            accessTokenOverride: activeToken,
          });
          if (linked) {
            taskSynced = true;
            syncedTaskLink = {
              taskId: linked.taskId,
              taskListId: linked.taskListId,
              syncedAtIso: new Date().toISOString(),
            };
          }
        } catch (err) {
          if (err instanceof GoogleWorkspaceAuthError) {
            onInvalidateWorkspaceToken();
            needsAuth = true;
            taskError = err.message;
          } else {
            taskError =
              err instanceof Error
                ? err.message
                : 'No se pudo actualizar la tarea en Google Tasks.';
          }
        }
      }
    }

    let updatedExec: ActivityExecutionRecord = {
      ...assignment.execution,
      estado: 'realizada',
      completadaAtIso: nowIso,
      completadaPorNombre: currentUserName,
      completadaPorEmail: effectiveUserEmail,
      origenConfirmacion: 'panel',
      comentarioCierre: comment || undefined,
      ...(gmailSentIso
        ? {
            notificacionCierreEnviadaIso: gmailSentIso,
            notificacionCierreDestinatarios: recipientEmails,
          }
        : {}),
    };

    if (syncedTaskLink) {
      updatedExec = withUpdatedGoogleTaskLink(updatedExec, effectiveUserEmail, syncedTaskLink);
    }

    const executionPatches: Record<string, ActivityExecutionRecord> = {
      [assignment.executionId]: updatedExec,
    };

    onUpdateWorkspace((prev) => ({
      ...prev,
      executions: {
        ...prev.executions,
        ...executionPatches,
      },
      ...(taskSynced ? { lastGoogleTasksSyncIso: new Date().toISOString() } : {}),
    }));

    if (permissions.canOperate && currentUser) {
      onSaveToCloud({
        executionPatches,
        ...(taskSynced ? { lastGoogleTasksSyncIso: new Date().toISOString() } : {}),
      }).catch(() => {});
    }

    if (gmailError) {
      setFeedbackBanner({
        type: needsAuth ? 'auth' : 'error',
        message: gmailError,
      });
    } else if (taskError) {
      setFeedbackBanner({
        type: needsAuth ? 'auth' : 'error',
        message: gmailSent
          ? `"${assignment.activity.nombre}" (${assignment.society.codigo}) cumplida y notificada por Gmail, pero Google Tasks respondió: ${taskError}`
          : `"${assignment.activity.nombre}" (${assignment.society.codigo}) marcada como cumplida, pero Google Tasks respondió: ${taskError}`,
      });
    } else if (gmailSent) {
      setFeedbackBanner({
        type: 'success',
        message: `"${assignment.activity.nombre}" (${assignment.society.codigo}) cumplida y notificada por Gmail a ${recipientEmails.length} destinatario(s)${
          taskSynced ? ' · Google Tasks actualizado' : ''
        }.`,
      });
    } else {
      setFeedbackBanner({
        type: 'success',
        message: `"${assignment.activity.nombre}" (${assignment.society.codigo}) marcada como cumplida${
          taskSynced ? ' y sincronizada en Google Tasks' : ''
        }.`,
      });
    }

    return {
      completed: true,
      gmailSent,
      gmailError,
      needsAuth,
      taskSynced,
      taskError,
      recipientsSent: gmailSent ? recipientEmails : undefined,
    };
  };

  // ---------- Resend Completion Notification via Gmail ----------
  const handleResendGmailNotification = async (
    assignment: MaterializedActivityAssignment
  ): Promise<CompleteActivityResult> => {
    const recipients = resolveCompletionNotificationRecipients({
      notificationRecipients: data.notificationRecipients,
      notifyAdminsAutomatically: data.notifyAdminsAutomatically,
      suitePermissionRecords: permissionRecords,
      activityExtraEmails: assignment.activity.notificarAdicionales,
    });
    const recipientEmails = recipients.map((r) => r.email);

    if (recipientEmails.length === 0) {
      return {
        completed: true,
        gmailSent: false,
        gmailError: 'No hay destinatarios configurados en Catálogo y Destinatarios.',
        taskSynced: false,
      };
    }

    let activeToken: string | null = null;
    try {
      activeToken = await resolveWorkspaceToken(true);
    } catch (err) {
      if (err instanceof GoogleWorkspaceAuthError) {
        onInvalidateWorkspaceToken();
      }
      activeToken = null;
    }

    if (!activeToken) {
      const msg = 'Autoriza tu cuenta de Google para enviar la notificación por Gmail.';
      setFeedbackBanner({ type: 'auth', message: msg });
      return {
        completed: true,
        gmailSent: false,
        gmailError: msg,
        needsAuth: true,
        taskSynced: false,
      };
    }

    try {
      const { subject, htmlBody } = buildCompletionConfirmationEmail({
        items: [
          {
            activityName: assignment.activity.nombre,
            periodicity: assignment.activity.periodicidad,
            societyCode: assignment.society.codigo,
            periodKey: assignment.periodKey,
            fechaSugerida: assignment.execution.fechaSugerida,
            responsibleName: assignment.responsibleNamesLabel,
            confirmedByName: assignment.execution.completadaPorNombre || currentUserName,
            confirmedByEmail: assignment.execution.completadaPorEmail || effectiveUserEmail,
            completedAtIso: assignment.execution.completadaAtIso || new Date().toISOString(),
            origin: assignment.execution.origenConfirmacion || 'panel',
            comment: assignment.execution.comentarioCierre || undefined,
          },
        ],
      });

      await sendGmailHtmlMessage({
        to: recipientEmails,
        subject,
        htmlBody,
        accessTokenOverride: activeToken,
      });

      const sentIso = new Date().toISOString();
      const updatedExec: ActivityExecutionRecord = {
        ...assignment.execution,
        notificacionCierreEnviadaIso: sentIso,
        notificacionCierreDestinatarios: recipientEmails,
      };
      const executionPatches = { [assignment.executionId]: updatedExec };

      onUpdateWorkspace((prev) => ({
        ...prev,
        executions: {
          ...prev.executions,
          ...executionPatches,
        },
      }));

      if (permissions.canOperate && currentUser) {
        onSaveToCloud({ executionPatches }).catch(() => {});
      }

      setFeedbackBanner({
        type: 'success',
        message: `Notificación enviada por Gmail a ${recipientEmails.join(', ')}.`,
      });

      return {
        completed: true,
        gmailSent: true,
        taskSynced: false,
        recipientsSent: recipientEmails,
      };
    } catch (err) {
      if (err instanceof GoogleWorkspaceAuthError) {
        onInvalidateWorkspaceToken();
        setFeedbackBanner({ type: 'auth', message: err.message });
        return {
          completed: true,
          gmailSent: false,
          gmailError: err.message,
          needsAuth: true,
          taskSynced: false,
        };
      }
      const msg =
        err instanceof Error ? err.message : 'No se pudo enviar la notificación por Gmail.';
      setFeedbackBanner({ type: 'error', message: msg });
      return {
        completed: true,
        gmailSent: false,
        gmailError: msg,
        taskSynced: false,
      };
    }
  };

  // ---------- Reopen Activity (Optional Two-Way Reopen in Google Tasks) ----------
  const handleReopenActivity = async (
    assignment: MaterializedActivityAssignment,
    reopenGoogleTask = false
  ): Promise<void> => {
    let taskReopened = false;
    const existingLink = getGoogleTaskLinkForEmail(assignment.execution, effectiveUserEmail);

    if (reopenGoogleTask && existingLink) {
      try {
        const activeToken = await resolveWorkspaceToken(true);
        if (activeToken) {
          await syncSingleActivityToGoogleTasks({
            assignment,
            status: 'needsAction',
            existingLink,
            createIfMissing: false,
            accessTokenOverride: activeToken,
          });
          taskReopened = true;
        }
      } catch (err) {
        if (err instanceof GoogleWorkspaceAuthError) {
          onInvalidateWorkspaceToken();
        }
      }
    }

    const reopenedExec: ActivityExecutionRecord = {
      ...assignment.execution,
      estado: 'pendiente',
      completadaAtIso: undefined,
      completadaPorNombre: undefined,
      completadaPorEmail: undefined,
      origenConfirmacion: undefined,
    };
    const executionPatches = { [assignment.executionId]: reopenedExec };

    onUpdateWorkspace((prev) => ({
      ...prev,
      executions: {
        ...prev.executions,
        ...executionPatches,
      },
    }));
    if (permissions.canOperate && currentUser) {
      onSaveToCloud({ executionPatches }).catch(() => {});
    }
    setFeedbackBanner({
      type: 'info',
      message: `"${assignment.activity.nombre}" (${assignment.society.codigo}) reabierta como pendiente${
        taskReopened ? ' y reactivada en Google Tasks' : ''
      }.`,
    });
  };

  // ---------- Gmail Reminders (Admin Only, Explicit Confirmation Modal) ----------
  const openSubtleDigestConfirmModal = (
    group: ResponsibleDigestGroup,
    customMessage?: string
  ) => {
    if (!isAdmin) return;
    if (!group.responsibleEmail || !group.responsibleEmail.includes('@')) {
      setFeedbackBanner({
        type: 'error',
        message: `Configura un correo válido para ${group.responsibleName}.`,
      });
      return;
    }

    const { subject, htmlBody } = buildSubtleReminderEmail({
      recipientName: group.responsibleName,
      periodKey: data.selectedPeriod,
      items: group.items,
      senderName: currentUserName,
      customMessage,
    });

    setWorkspaceConfirm({
      kind: 'gmail_reminder',
      title: `Enviar recordatorio a ${group.responsibleName}`,
      description: 'Se enviará 1 correo desde tu cuenta Gmail con el resumen de pendientes.',
      recipients: [group.responsibleEmail],
      subjectPreview: subject,
      itemsSummary: group.items.map(
        (i) =>
          `${i.society.codigo} · ${i.activity.nombre} (${formatShortDateEs(
            i.execution.fechaSugerida
          )})`
      ),
      confirmLabel: 'Enviar por Gmail',
      onConfirm: async () => {
        try {
          const activeToken = await resolveWorkspaceToken(true);
          if (!activeToken) {
            throw new GoogleWorkspaceAuthError(
              'Autoriza tu cuenta de Google para enviar recordatorios por Gmail.'
            );
          }
          await sendGmailHtmlMessage({
            to: [group.responsibleEmail],
            subject,
            htmlBody,
            accessTokenOverride: activeToken,
          });
          const nowIso = new Date().toISOString();
          const executionPatches: Record<string, ActivityExecutionRecord> = {};
          group.items.forEach((item) => {
            const cur = data.executions[item.executionId] || item.execution;
            executionPatches[item.executionId] = {
              ...cur,
              ultimoRecordatorioIso: nowIso,
              recordatoriosEnviadosCount: (cur.recordatoriosEnviadosCount || 0) + 1,
            };
          });
          onUpdateWorkspace((prev) => ({
            ...prev,
            executions: { ...prev.executions, ...executionPatches },
          }));
          if (permissions.canOperate && currentUser) {
            onSaveToCloud({ executionPatches }).catch(() => {});
          }
          setFeedbackBanner({
            type: 'success',
            message: `Recordatorio enviado por Gmail a ${group.responsibleName}.`,
          });
        } catch (err) {
          handleWorkspaceError(err, 'No se pudo enviar el recordatorio por Gmail.');
        }
      },
    });
  };

  const handleRequestSendSingleReminder = (assignment: MaterializedActivityAssignment) => {
    if (!isAdmin) return;
    const validResps = assignment.responsibles.filter((r) => r.email && r.email.includes('@'));
    if (validResps.length === 0) return;

    if (validResps.length === 1) {
      const target = validResps[0];
      openSubtleDigestConfirmModal({
        responsibleId: target.id,
        responsibleName: target.nombre,
        responsibleEmail: target.email,
        items: [assignment],
        overdueCount: assignment.trafficLight === 'vencida' ? 1 : 0,
        upcomingCount: assignment.trafficLight === 'proxima' ? 1 : 0,
      });
      return;
    }

    handleRequestSendBatchDigests(
      validResps.map((r) => ({
        responsibleId: r.id,
        responsibleName: r.nombre,
        responsibleEmail: r.email,
        items: [assignment],
        overdueCount: assignment.trafficLight === 'vencida' ? 1 : 0,
        upcomingCount: assignment.trafficLight === 'proxima' ? 1 : 0,
      }))
    );
  };

  const handleRequestSendBatchDigests = (
    groups: ResponsibleDigestGroup[],
    customMessage?: string
  ) => {
    if (!isAdmin) return;
    const validGroups = groups.filter((g) => g.responsibleEmail && g.responsibleEmail.includes('@'));
    if (validGroups.length === 0) return;

    setWorkspaceConfirm({
      kind: 'gmail_reminder',
      title: `Enviar ${validGroups.length} recordatorio(s) por Gmail`,
      description: 'Cada responsable recibirá 1 correo consolidado con sus actividades pendientes.',
      recipients: validGroups.map((g) => `${g.responsibleName} <${g.responsibleEmail}>`),
      subjectPreview: `Actividades pendientes · ${formatPeriodLabel(data.selectedPeriod)}`,
      itemsSummary: validGroups.map(
        (g) => `${g.responsibleName}: ${g.items.length} actividad(es)`
      ),
      confirmLabel: `Enviar ${validGroups.length} correo(s)`,
      onConfirm: async () => {
        try {
          const activeToken = await resolveWorkspaceToken(true);
          if (!activeToken) {
            throw new GoogleWorkspaceAuthError(
              'Autoriza tu cuenta de Google para enviar correos por Gmail.'
            );
          }
          const nowIso = new Date().toISOString();
          const sentExecIds = new Set<string>();

          for (const grp of validGroups) {
            const { subject, htmlBody } = buildSubtleReminderEmail({
              recipientName: grp.responsibleName,
              periodKey: data.selectedPeriod,
              items: grp.items,
              senderName: currentUserName,
              customMessage,
            });
            await sendGmailHtmlMessage({
              to: [grp.responsibleEmail],
              subject,
              htmlBody,
              accessTokenOverride: activeToken,
            });
            grp.items.forEach((it) => sentExecIds.add(it.executionId));
          }

          const executionPatches: Record<string, ActivityExecutionRecord> = {};
          sentExecIds.forEach((execId) => {
            const found = assignmentByExecId.get(execId);
            const cur = data.executions[execId] || found?.execution;
            if (cur) {
              executionPatches[execId] = {
                ...cur,
                ultimoRecordatorioIso: nowIso,
                recordatoriosEnviadosCount: (cur.recordatoriosEnviadosCount || 0) + 1,
              };
            }
          });

          onUpdateWorkspace((prev) => ({
            ...prev,
            executions: { ...prev.executions, ...executionPatches },
          }));
          if (permissions.canOperate && currentUser) {
            onSaveToCloud({ executionPatches }).catch(() => {});
          }

          setFeedbackBanner({
            type: 'success',
            message: `${validGroups.length} recordatorio(s) enviado(s) por Gmail.`,
          });
        } catch (err) {
          handleWorkspaceError(err, 'No se pudo completar el envío por Gmail.');
        }
      },
    });
  };

  // ---------- Push to Google Tasks (Gmail's Primary "Mis tareas" Sidebar) ----------
  const handleRequestPushTasks = (
    items: MaterializedActivityAssignment[],
    scopeLabel: string
  ) => {
    if (items.length === 0) return;

    setWorkspaceConfirm({
      kind: 'tasks_push',
      title: `Habilitar ${items.length} actividad(es) en Google Tasks`,
      description: `Se publicarán ${scopeLabel} en tu lista "${PREMEX_GOOGLE_TASKS_LIST_TITLE}" para que aparezcan en el panel lateral de Gmail y puedas cumplirlas desde tu correo.`,
      itemsSummary: items.map(
        (i) =>
          `[${i.society.codigo}] ${i.activity.nombre} · ${formatShortDateEs(
            i.execution.fechaSugerida
          )}`
      ),
      confirmLabel: 'Habilitar en Google Tasks',
      onConfirm: async () => {
        setIsSyncingGoogleTasks(true);
        try {
          const activeToken = await resolveWorkspaceToken(true);
          if (!activeToken) {
            throw new GoogleWorkspaceAuthError(
              'Autoriza tu cuenta de Google para habilitar actividades en Google Tasks.'
            );
          }

          const existingLinksByExecId: Record<string, ActivityGoogleTaskLink | null> = {};
          items.forEach((item) => {
            existingLinksByExecId[item.executionId] = getGoogleTaskLinkForEmail(
              item.execution,
              effectiveUserEmail
            );
          });

          const result = await pushActivitiesToGoogleTasks(items, {
            accessTokenOverride: activeToken,
            existingLinksByExecId,
          });
          const nowIso = new Date().toISOString();

          const executionPatches: Record<string, ActivityExecutionRecord> = {};
          items.forEach((item) => {
            const linked = result.syncedMap[item.executionId];
            if (linked) {
              const baseExec = data.executions[item.executionId] || item.execution;
              executionPatches[item.executionId] = withUpdatedGoogleTaskLink(
                baseExec,
                effectiveUserEmail,
                {
                  taskId: linked.googleTaskId,
                  taskListId: linked.googleTaskListId,
                  syncedAtIso: nowIso,
                }
              );
            }
          });

          onUpdateWorkspace((prev) => ({
            ...prev,
            executions: {
              ...prev.executions,
              ...executionPatches,
            },
            lastGoogleTasksSyncIso: nowIso,
          }));
          if (permissions.canOperate && currentUser) {
            onSaveToCloud({ executionPatches, lastGoogleTasksSyncIso: nowIso }).catch(() => {});
          }

          setFeedbackBanner({
            type: 'success',
            message: `Habilitadas en Google Tasks · ${result.taskListTitle} (${result.createdCount} nueva(s), ${result.updatedCount} actualizada(s)). Ya aparecen en el panel derecho de tu Gmail.`,
          });
        } catch (err) {
          handleWorkspaceError(err, 'No se pudieron publicar las tareas en Google Tasks.');
        } finally {
          setIsSyncingGoogleTasks(false);
        }
      },
    });
  };

  // ---------- Two-Way Pull from Google Tasks (Gmail -> App) ----------
  const handlePullFromGoogleTasks = async (options?: {
    silent?: boolean;
    tokenOverride?: string | null;
  }): Promise<void> => {
    if (isPullingRef.current) return;
    isPullingRef.current = true;
    const isSilent = Boolean(options?.silent);
    if (!isSilent) {
      setIsSyncingGoogleTasks(true);
    }

    try {
      const activeToken =
        (options?.tokenOverride || '').trim() || (await resolveWorkspaceToken(!isSilent));
      if (!activeToken) {
        if (!isSilent) {
          throw new GoogleWorkspaceAuthError(
            'Autoriza tu cuenta de Google para sincronizar Google Tasks.'
          );
        }
        return;
      }

      const { defaultList, tasks } = await listPremexGoogleTasks(activeToken);
      const nowIso = new Date().toISOString();
      lastAutoPullRef.current = Date.now();

      const taskByExecId = new Map<string, (typeof tasks)[number]>();
      const taskById = new Map<string, (typeof tasks)[number]>();
      tasks.forEach((t) => {
        taskById.set(t.id, t);
        const parsed = extractExecutionIdFromTaskNotes(t.notes);
        if (parsed) {
          const prev = taskByExecId.get(parsed);
          // Prefer completed task or primary defaultList task if duplicates exist
          if (
            !prev ||
            (t.status === 'completed' && prev.status !== 'completed') ||
            (t.status === prev.status && t.taskListId === defaultList.id)
          ) {
            taskByExecId.set(parsed, t);
          }
        }
      });

      const newlyCompleted: {
        assignment: MaterializedActivityAssignment;
        completedAtIso: string;
      }[] = [];

      const executionPatches: Record<string, ActivityExecutionRecord> = {};

      assignments.forEach((item) => {
        const userLink = getGoogleTaskLinkForEmail(item.execution, effectiveUserEmail);
        const matchedTask =
          taskByExecId.get(item.executionId) ||
          (userLink?.taskId ? taskById.get(userLink.taskId) : undefined);

        if (!matchedTask) return;

        const targetListId = matchedTask.taskListId || defaultList.id;

        if (matchedTask.status === 'completed' && item.execution.estado !== 'realizada') {
          const doneIso = matchedTask.completed || nowIso;
          executionPatches[item.executionId] = withUpdatedGoogleTaskLink(
            {
              ...item.execution,
              estado: 'realizada',
              completadaAtIso: doneIso,
              completadaPorNombre: currentUserName,
              completadaPorEmail: effectiveUserEmail,
              origenConfirmacion: 'google_tasks',
            },
            effectiveUserEmail,
            {
              taskId: matchedTask.id,
              taskListId: targetListId,
              syncedAtIso: nowIso,
            }
          );
          newlyCompleted.push({ assignment: item, completedAtIso: doneIso });
        } else if (
          effectiveUserEmail &&
          (!userLink || userLink.taskId !== matchedTask.id || userLink.taskListId !== targetListId)
        ) {
          // Keep per-user link metadata synchronized even for still-pending tasks
          executionPatches[item.executionId] = withUpdatedGoogleTaskLink(
            item.execution,
            effectiveUserEmail,
            {
              taskId: matchedTask.id,
              taskListId: targetListId,
              syncedAtIso: nowIso,
            }
          );
        }
      });

      const hasPatches = Object.keys(executionPatches).length > 0;
      if (hasPatches || !isSilent) {
        onUpdateWorkspace((prev) => ({
          ...prev,
          ...(hasPatches
            ? {
                executions: {
                  ...prev.executions,
                  ...executionPatches,
                },
              }
            : {}),
          lastGoogleTasksSyncIso: nowIso,
        }));
      }

      if (hasPatches && permissions.canOperate && currentUser) {
        onSaveToCloud({ executionPatches, lastGoogleTasksSyncIso: nowIso }).catch(() => {});
      }

      if (newlyCompleted.length === 0) {
        if (!isSilent) {
          setFeedbackBanner({
            type: 'info',
            message: `Sincronización completada (${tasks.length} tareas revisadas en Google Tasks). Sin nuevas confirmaciones.`,
          });
        }
        return;
      }

      setFeedbackBanner({
        type: 'success',
        message: `${newlyCompleted.length} actividad(es) marcada(s) como cumplida(s) desde Google Tasks (Gmail).`,
      });

      const recipientEmails = Array.from(
        new Set([
          ...generalCompletionRecipients.map((r) => r.email),
          ...newlyCompleted.flatMap((nc) =>
            (nc.assignment.activity.notificarAdicionales || []).map((e) => normalizeEmail(e))
          ),
        ])
      ).filter((e) => e.includes('@'));

      if (recipientEmails.length > 0) {
        const { subject, htmlBody } = buildCompletionConfirmationEmail({
          items: newlyCompleted.map(({ assignment, completedAtIso }) => ({
            activityName: assignment.activity.nombre,
            periodicity: assignment.activity.periodicidad,
            societyCode: assignment.society.codigo,
            periodKey: assignment.periodKey,
            fechaSugerida: assignment.execution.fechaSugerida,
            responsibleName: assignment.responsibleNamesLabel,
            confirmedByName: currentUserName,
            confirmedByEmail: effectiveUserEmail,
            completedAtIso,
            origin: 'google_tasks',
          })),
        });

        setWorkspaceConfirm({
          kind: 'gmail_completion',
          title: `Notificar ${newlyCompleted.length} cumplimiento(s) por Gmail`,
          description:
            'Se detectaron actividades cumplidas desde tu correo (Google Tasks). Confirma el envío del aviso a los destinatarios.',
          recipients: recipientEmails,
          subjectPreview: subject,
          itemsSummary: newlyCompleted.map(
            ({ assignment }) =>
              `${assignment.society.codigo} · ${assignment.activity.nombre} (${assignment.responsibleNamesLabel})`
          ),
          confirmLabel: 'Enviar por Gmail',
          onConfirm: async () => {
            try {
              const sendToken = activeToken || (await resolveWorkspaceToken(true));
              if (!sendToken) {
                throw new GoogleWorkspaceAuthError(
                  'Autoriza tu cuenta de Google para enviar la notificación por Gmail.'
                );
              }
              await sendGmailHtmlMessage({
                to: recipientEmails,
                subject,
                htmlBody,
                accessTokenOverride: sendToken,
              });
              const sentIso = new Date().toISOString();
              const notifyPatches: Record<string, ActivityExecutionRecord> = {};
              newlyCompleted.forEach(({ assignment }) => {
                const cur = executionPatches[assignment.executionId] || assignment.execution;
                notifyPatches[assignment.executionId] = {
                  ...cur,
                  notificacionCierreEnviadaIso: sentIso,
                  notificacionCierreDestinatarios: recipientEmails,
                };
              });
              onUpdateWorkspace((prev) => ({
                ...prev,
                executions: { ...prev.executions, ...notifyPatches },
              }));
              if (permissions.canOperate && currentUser) {
                onSaveToCloud({ executionPatches: notifyPatches }).catch(() => {});
              }
              setFeedbackBanner({
                type: 'success',
                message: `Confirmación enviada por Gmail a ${recipientEmails.length} destinatario(s).`,
              });
            } catch (err) {
              handleWorkspaceError(err, 'No se pudo enviar el correo de confirmación.');
            }
          },
        });
      }
    } catch (err) {
      if (isSilent) {
        if (err instanceof GoogleWorkspaceAuthError) {
          onInvalidateWorkspaceToken();
        }
      } else {
        handleWorkspaceError(err, 'No se pudo sincronizar con Google Tasks.');
      }
    } finally {
      isPullingRef.current = false;
      if (!isSilent) {
        setIsSyncingGoogleTasks(false);
      }
    }
  };

  // Keep a ref to the latest pull handler so focus/visibility listeners never read stale state
  const latestPullRef = useRef(handlePullFromGoogleTasks);
  latestPullRef.current = handlePullFromGoogleTasks;

  // Automatic read-only pull from Google Tasks when session is active and when returning from Gmail tab
  useEffect(() => {
    if (!hasWorkspaceToken || !permissions.canOperate || assignments.length === 0) return;

    const triggerThrottledPull = () => {
      if (Date.now() - lastAutoPullRef.current < AUTO_PULL_MIN_INTERVAL_MS) return;
      latestPullRef.current({ silent: true }).catch(() => {});
    };

    // Initial check upon entering Panel de Actividades or activating Google session
    triggerThrottledPull();

    const onWindowFocus = () => triggerThrottledPull();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerThrottledPull();
      }
    };

    window.addEventListener('focus', onWindowFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onWindowFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [hasWorkspaceToken, permissions.canOperate, data.selectedPeriod, assignments.length]);

  const completingIsLinkedForUser = Boolean(
    completingAssignment &&
      getGoogleTaskLinkForEmail(completingAssignment.execution, effectiveUserEmail)
  );

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-slate-900 flex">
      <ActivitiesSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        selectedPeriod={data.selectedPeriod}
        totalAssignments={sidebarMetrics.totalAssignments}
        completedCount={sidebarMetrics.completedCount}
        pendingCount={sidebarMetrics.pendingCount}
        overdueCount={sidebarMetrics.overdueCount}
        myPendingCount={sidebarMetrics.myPendingCount}
        syncedTasksCount={sidebarMetrics.syncedTasksCount}
        onSwitchModule={onSwitchModule}
        permissions={permissions}
      />

      <div className="flex-1 lg:pl-72 flex flex-col min-w-0">
        <ActivitiesHeader
          activeTab={activeTab}
          selectedPeriod={data.selectedPeriod}
          onChangePeriod={(periodKey) =>
            onUpdateWorkspace((prev) => ({ ...prev, selectedPeriod: periodKey }))
          }
          onToggleMobileMenu={() => setIsMobileSidebarOpen((v) => !v)}
          onSwitchModule={onSwitchModule}
          currentUser={currentUser}
          onSignInWithGoogle={onSignInWithGoogle}
          onSignOut={onSignOut}
          permissions={permissions}
          hasUnsavedChanges={data.hasUnsavedChanges}
          isSavingCloud={isSavingCloud}
          onSaveToCloud={() => {
            onSaveToCloud().catch((err) =>
              setFeedbackBanner({
                type: 'error',
                message: err instanceof Error ? err.message : 'Error al guardar en la nube.',
              })
            );
          }}
          isSyncingGoogleTasks={isSyncingGoogleTasks}
          onPullFromGoogleTasks={() => {
            handlePullFromGoogleTasks({ silent: false }).catch(() => {});
          }}
        />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-5 sm:py-6 pb-24 lg:pb-6 max-w-[1600px] w-full mx-auto space-y-5">
          {feedbackBanner && (
            <div
              className={`sticky top-[4.5rem] z-20 shadow-md rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                feedbackBanner.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : feedbackBanner.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : feedbackBanner.type === 'auth'
                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                  : 'bg-blue-50 border-blue-200 text-[#132B63]'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {feedbackBanner.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : feedbackBanner.type === 'error' || feedbackBanner.type === 'auth' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-4 h-4 text-[#1E60A8] shrink-0 mt-0.5" />
                )}
                <span className="font-medium leading-relaxed">{feedbackBanner.message}</span>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {feedbackBanner.type === 'auth' && (
                  <button
                    type="button"
                    disabled={isConnectingWorkspace}
                    onClick={() => {
                      handleConnectWorkspace().catch(() => {});
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl whitespace-nowrap cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isConnectingWorkspace ? 'animate-spin' : ''}`}
                    />
                    <span>Autorizar Google</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFeedbackBanner(null)}
                  aria-label="Cerrar aviso"
                  className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'matriz' && (
            <ActivitiesMatrixView
              data={data}
              assignments={assignments}
              currentUserEmail={effectiveUserEmail}
              hasWorkspaceToken={hasWorkspaceToken}
              isConnectingWorkspace={isConnectingWorkspace}
              isSyncingGoogleTasks={isSyncingGoogleTasks}
              isAdmin={isAdmin}
              canOperate={permissions.canOperate}
              onSelectAssignment={(assignment) => setCompletingExecId(assignment.executionId)}
              onOpenNewActivity={() => {
                if (!isAdmin) return;
                setConfigSubTab('actividades');
                setNewActivityTrigger((n) => n + 1);
                setActiveTab('configuracion');
              }}
              onConnectWorkspace={() => {
                handleConnectWorkspace().catch(() => {});
              }}
              onRequestEnableGoogleTasks={handleRequestPushTasks}
            />
          )}

          {activeTab === 'pendientes' && (
            <ActivitiesExecutionListView
              data={data}
              assignments={assignments}
              currentUserEmail={effectiveUserEmail}
              isAdmin={isAdmin}
              canOperate={permissions.canOperate}
              onOpenCompleteModal={(a) => setCompletingExecId(a.executionId)}
              onReopenActivity={(a) => {
                handleReopenActivity(a, true).catch(() => {});
              }}
              onRequestSendSubtleReminder={handleRequestSendSingleReminder}
              onRequestSyncSingleTask={(a) =>
                handleRequestPushTasks([a], `"${a.activity.nombre}" (${a.society.codigo})`)
              }
            />
          )}

          {activeTab === 'sincronizacion' && (
            <ActivitiesWorkspaceSyncView
              data={data}
              assignments={assignments}
              currentUserEmail={effectiveUserEmail}
              hasWorkspaceToken={hasWorkspaceToken}
              isAdmin={isAdmin}
              canOperate={permissions.canOperate}
              isSyncingGoogleTasks={isSyncingGoogleTasks}
              isConnectingWorkspace={isConnectingWorkspace}
              resolvedCompletionRecipients={generalCompletionRecipients}
              onConnectWorkspace={async () => {
                await handleConnectWorkspace();
              }}
              onRequestPushTasks={handleRequestPushTasks}
              onPullFromGoogleTasks={() => handlePullFromGoogleTasks({ silent: false })}
              onRequestSendSubtleDigest={openSubtleDigestConfirmModal}
              onRequestSendBatchDigests={handleRequestSendBatchDigests}
              onNavigateConfigRecipients={() => {
                if (!isAdmin) return;
                setConfigSubTab('destinatarios');
                setActiveTab('configuracion');
              }}
            />
          )}

          {isAdmin && activeTab === 'configuracion' && (
            <ActivitiesConfigView
              data={data}
              suitePermissionRecords={permissionRecords}
              canEdit={permissions.canOperate}
              initialSubTab={configSubTab}
              openNewActivityTrigger={newActivityTrigger}
              onUpdateWorkspace={onUpdateWorkspace}
            />
          )}
        </main>
      </div>

      <CompleteActivityModal
        assignment={completingAssignment}
        recipients={resolvedCompletionRecipients}
        hasWorkspaceToken={hasWorkspaceToken}
        isTaskLinkedForUser={completingIsLinkedForUser}
        canOperate={permissions.canOperate}
        onClose={() => setCompletingExecId(null)}
        onAuthorizeGoogle={handleConnectWorkspace}
        onConfirmComplete={handleConfirmComplete}
        onResendGmailNotification={handleResendGmailNotification}
        onReopenActivity={handleReopenActivity}
        onSyncSingleTask={(a) =>
          handleRequestPushTasks([a], `"${a.activity.nombre}" (${a.society.codigo})`)
        }
      />

      <WorkspaceActionConfirmModal
        payload={workspaceConfirm}
        onClose={() => setWorkspaceConfirm(null)}
      />

      {/* Mobile Bottom Navigation Bar (Panel de Actividades) */}
      <nav
        aria-label="Navegación móvil de actividades"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe print:hidden"
      >
        <div className={`grid h-14 ${isAdmin ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {(
            [
              { id: 'matriz' as ActivitiesTab, label: 'Matriz', icon: LayoutGrid },
              {
                id: 'pendientes' as ActivitiesTab,
                label: isAdmin ? 'Tareas' : 'Mis Act.',
                icon: CheckSquare,
              },
              { id: 'sincronizacion' as ActivitiesTab, label: 'Gmail/Tasks', icon: MailCheck },
              ...(isAdmin
                ? [{ id: 'configuracion' as ActivitiesTab, label: 'Catálogo', icon: SlidersHorizontal }]
                : []),
            ]
          ).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                  isActive ? 'text-[#132B63]' : 'text-slate-500'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-[#0F766E]' : 'text-slate-400'}`} />
                <span className="truncate max-w-[78px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
