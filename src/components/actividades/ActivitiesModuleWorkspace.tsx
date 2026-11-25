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
  CLOSURE_ACTIVITY_ID,
  CLOSURE_SOCIETY_CODE,
  MaterializedActivityAssignment,
  assignmentIncludesEmail,
  collectResponsibleNotifyEmails,
  computeSuggestedDateForPeriod,
  formatDateTimeEs,
  formatPeriodLabel,
  formatShortDateEs,
  getGoogleTaskLinkForEmail,
  getPeriodActivationStatus,
  hasAnyGoogleTaskLink,
  makeClosureExecutionId,
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
  buildPeriodClosureNotificationEmail,
  buildSubtleReminderEmail,
  completeMultipleGoogleTasksForUser,
  extractClosureExecutionIdFromTaskNotes,
  extractExecutionIdFromTaskNotes,
  listPremexGoogleTasks,
  pushActivitiesToGoogleTasks,
  sendGmailHtmlMessage,
  syncClosureConfirmationTaskToGoogleTasks,
  syncSingleActivityToGoogleTasks,
} from '../../services/googleWorkspaceActivities';
import { ActivitiesSidebar } from './ActivitiesSidebar';
import { ActivitiesHeader } from './ActivitiesHeader';
import { ActivitiesMatrixView } from './ActivitiesMatrixView';
import {
  ActivitiesExecutionListView,
  PeriodClosureStatus,
} from './ActivitiesExecutionListView';
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
    overrideWorkspace?: ActivitiesWorkspaceData;
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

interface RemoteCompletedGoogleTaskSyncItem {
  executionId: string;
  activityName: string;
  societyCode: string;
  completedByName: string;
  completedAtIso: string;
  taskId: string;
  taskListId: string;
  updatedNotes?: string;
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
  const [remoteCompletedPendingMyTasks, setRemoteCompletedPendingMyTasks] = useState<
    RemoteCompletedGoogleTaskSyncItem[]
  >([]);

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

  const myResponsibleRecords = useMemo(() => {
    const norm = normalizeEmail(effectiveUserEmail);
    if (!norm) return [];
    return data.responsibles.filter((r) => normalizeEmail(r.email) === norm);
  }, [data.responsibles, effectiveUserEmail]);

  const myPeriodAssignments = useMemo(() => {
    const own = effectiveUserEmail
      ? assignments.filter((a) => assignmentIncludesEmail(a, effectiveUserEmail))
      : [];
    return own.length > 0 ? own : isAdmin ? assignments : [];
  }, [assignments, effectiveUserEmail, isAdmin]);

  const getRecipientsForAssignment = (assignment: MaterializedActivityAssignment) => {
    const responsibleNotifyEmails = collectResponsibleNotifyEmails([
      ...assignment.responsibles,
      ...myResponsibleRecords,
    ]);
    return resolveCompletionNotificationRecipients({
      notificationRecipients: data.notificationRecipients,
      responsibleNotifyEmails,
      allResponsibles: data.responsibles,
      activityExtraEmails: assignment.activity.notificarAdicionales,
    });
  };

  const resolvedCompletionRecipients = useMemo(() => {
    if (!completingAssignment) {
      return resolveCompletionNotificationRecipients({
        notificationRecipients: data.notificationRecipients,
        responsibleNotifyEmails: collectResponsibleNotifyEmails(myResponsibleRecords),
        allResponsibles: data.responsibles,
      });
    }
    return resolveCompletionNotificationRecipients({
      notificationRecipients: data.notificationRecipients,
      responsibleNotifyEmails: collectResponsibleNotifyEmails([
        ...completingAssignment.responsibles,
        ...myResponsibleRecords,
      ]),
      allResponsibles: data.responsibles,
      activityExtraEmails: completingAssignment.activity.notificarAdicionales,
    });
  }, [
    data.notificationRecipients,
    data.responsibles,
    myResponsibleRecords,
    completingAssignment,
  ]);

  const generalCompletionRecipients = useMemo(
    () =>
      resolveCompletionNotificationRecipients({
        notificationRecipients: data.notificationRecipients,
        allResponsibles: data.responsibles,
      }),
    [data.notificationRecipients, data.responsibles]
  );

  const closureRecipients = useMemo(
    () =>
      resolveCompletionNotificationRecipients({
        notificationRecipients: data.notificationRecipients,
        responsibleNotifyEmails: collectResponsibleNotifyEmails(myResponsibleRecords),
        allResponsibles: data.responsibles,
      }),
    [data.notificationRecipients, data.responsibles, myResponsibleRecords]
  );

  const closureExecutionId = useMemo(
    () => makeClosureExecutionId(data.selectedPeriod, effectiveUserEmail || 'general'),
    [data.selectedPeriod, effectiveUserEmail]
  );

  const closureDueDateYmd = useMemo(() => {
    if (myPeriodAssignments.length > 0) {
      const sortedDates = myPeriodAssignments
        .map((a) => a.execution.fechaSugerida)
        .filter(Boolean)
        .sort();
      const latest = sortedDates[sortedDates.length - 1];
      if (latest) return latest;
    }
    return computeSuggestedDateForPeriod(data.selectedPeriod, 28, data.societies[0]?.pais);
  }, [myPeriodAssignments, data.selectedPeriod, data.societies]);

  const closureStatus = useMemo<PeriodClosureStatus>(() => {
    const rec = data.executions[closureExecutionId];
    const totalTasks = myPeriodAssignments.length;
    const completedTasks = myPeriodAssignments.filter(
      (a) => a.execution.estado === 'realizada'
    ).length;
    const pendingTasks = Math.max(0, totalTasks - completedTasks);
    const linked = Boolean(rec && getGoogleTaskLinkForEmail(rec, effectiveUserEmail));
    return {
      closureExecutionId,
      periodKey: data.selectedPeriod,
      totalTasks,
      completedTasks,
      pendingTasks,
      isClosureConfirmed: rec?.estado === 'realizada',
      confirmedAtIso: rec?.completadaAtIso,
      confirmedByName: rec?.completadaPorNombre,
      origin: rec?.origenConfirmacion,
      isLinkedInGoogleTasks: linked,
      emailSentAtIso: rec?.notificacionCierreEnviadaIso,
      recipientsCount: closureRecipients.length,
      recipientEmails: closureRecipients.map((r) => r.email),
    };
  }, [
    data.executions,
    closureExecutionId,
    data.selectedPeriod,
    myPeriodAssignments,
    effectiveUserEmail,
    closureRecipients,
  ]);

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
    const recipients = getRecipientsForAssignment(assignment);
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
    const recipients = getRecipientsForAssignment(assignment);
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

  // ---------- Helper: Build updated closure record ----------
  const buildClosureExecutionBase = (): ActivityExecutionRecord => {
    const existing = data.executions[closureExecutionId];
    if (existing) return existing;
    return {
      id: closureExecutionId,
      periodKey: data.selectedPeriod,
      activityId: CLOSURE_ACTIVITY_ID,
      societyCode: CLOSURE_SOCIETY_CODE,
      responsibleId: myResponsibleRecords[0]?.id || 'closure-user',
      responsibleName: currentUserName,
      responsibleEmail: effectiveUserEmail,
      responsibleIds: myResponsibleRecords.map((r) => r.id),
      responsibleNames: [currentUserName],
      responsibleEmails: effectiveUserEmail ? [effectiveUserEmail] : [],
      fechaSugerida: closureDueDateYmd,
      estado: 'pendiente',
    };
  };

  // ---------- Sync Independent Closure Task (`[CIERRE]`) to Google Tasks ----------
  const handleRequestSyncClosureTask = () => {
    const periodLabel = formatPeriodLabel(data.selectedPeriod);
    setWorkspaceConfirm({
      kind: 'tasks_push',
      title: `Habilitar tarea independiente de cierre · ${periodLabel}`,
      description: `Se creará o actualizará la tarea "[CIERRE] Confirmar cumplimiento total de actividades · ${periodLabel}" en tu lista "${PREMEX_GOOGLE_TASKS_LIST_TITLE}" de Gmail. Al marcarla completada en Google Tasks se notificará por Gmail a los destinatarios configurados.`,
      itemsSummary: [
        `Avance actual: ${closureStatus.completedTasks} de ${closureStatus.totalTasks} actividad(es) cumplida(s)`,
        `Destinatarios al cerrar: ${
          closureStatus.recipientEmails.length > 0
            ? closureStatus.recipientEmails.join(', ')
            : 'Sin destinatarios configurados aún'
        }`,
      ],
      confirmLabel: 'Habilitar tarea [CIERRE]',
      onConfirm: async () => {
        setIsSyncingGoogleTasks(true);
        try {
          const activeToken = await resolveWorkspaceToken(true);
          if (!activeToken) {
            throw new GoogleWorkspaceAuthError(
              'Autoriza tu cuenta de Google para habilitar la tarea de cierre en Google Tasks.'
            );
          }
          const baseRec = buildClosureExecutionBase();
          const existingLink = getGoogleTaskLinkForEmail(baseRec, effectiveUserEmail);
          const synced = await syncClosureConfirmationTaskToGoogleTasks({
            closureExecutionId,
            periodKey: data.selectedPeriod,
            userName: currentUserName,
            userEmail: effectiveUserEmail,
            totalTasks: closureStatus.totalTasks,
            completedTasks: closureStatus.completedTasks,
            pendingTasks: closureStatus.pendingTasks,
            dueDateYmd: closureDueDateYmd,
            recipientLabels: closureRecipients.map((r) => r.email),
            status: baseRec.estado === 'realizada' ? 'completed' : 'needsAction',
            completedAtIso: baseRec.completadaAtIso,
            existingLink,
            accessTokenOverride: activeToken,
          });
          const nowIso = new Date().toISOString();
          const updatedClosure = withUpdatedGoogleTaskLink(baseRec, effectiveUserEmail, {
            taskId: synced.taskId,
            taskListId: synced.taskListId,
            syncedAtIso: nowIso,
          });
          const executionPatches = { [closureExecutionId]: updatedClosure };
          onUpdateWorkspace((prev) => ({
            ...prev,
            executions: { ...prev.executions, ...executionPatches },
            lastGoogleTasksSyncIso: nowIso,
          }));
          if (permissions.canOperate && currentUser) {
            onSaveToCloud({ executionPatches, lastGoogleTasksSyncIso: nowIso }).catch(() => {});
          }
          setFeedbackBanner({
            type: 'success',
            message: `Tarea independiente "[CIERRE]" ${
              synced.created ? 'creada' : 'actualizada'
            } en tu Google Tasks (Gmail).`,
          });
        } catch (err) {
          handleWorkspaceError(err, 'No se pudo habilitar la tarea de cierre en Google Tasks.');
        } finally {
          setIsSyncingGoogleTasks(false);
        }
      },
    });
  };

  // ---------- Confirm Independent Closure & Send Consolidated Gmail Notification ----------
  const handleRequestConfirmPeriodClosure = () => {
    const periodLabel = formatPeriodLabel(data.selectedPeriod);
    const recipientEmails = closureRecipients.map((r) => r.email);
    const nowIso = new Date().toISOString();
    const { subject, htmlBody } = buildPeriodClosureNotificationEmail({
      periodKey: data.selectedPeriod,
      confirmedByName: currentUserName,
      confirmedByEmail: effectiveUserEmail,
      completedAtIso: nowIso,
      origin: 'panel',
      assignments: myPeriodAssignments,
    });

    setWorkspaceConfirm({
      kind: 'gmail_completion',
      title: `Confirmar cierre total · ${periodLabel}`,
      description:
        recipientEmails.length > 0
          ? 'Se marcará como completada tu tarea independiente de cierre (también en Google Tasks) y se enviará el correo consolidado de cumplimiento por Gmail.'
          : 'No hay destinatarios configurados en Catálogo > Destinatarios ni en tu usuario responsable. Se registrará el cierre en la app y Google Tasks sin envío de correo.',
      recipients: recipientEmails,
      subjectPreview: recipientEmails.length > 0 ? subject : undefined,
      itemsSummary: [
        `Actividades cumplidas: ${closureStatus.completedTasks} de ${closureStatus.totalTasks}`,
        ...(closureStatus.pendingTasks > 0
          ? [`Actividades aún pendientes: ${closureStatus.pendingTasks}`]
          : ['100% de actividades cumplidas']),
        'Actualiza la tarea [CIERRE] como completada en Google Tasks',
      ],
      confirmLabel:
        recipientEmails.length > 0 ? 'Confirmar cierre y enviar Gmail' : 'Confirmar cierre',
      onConfirm: async () => {
        setIsSyncingGoogleTasks(true);
        try {
          const activeToken = await resolveWorkspaceToken(true);
          if (!activeToken) {
            throw new GoogleWorkspaceAuthError(
              'Autoriza tu cuenta de Google para enviar la notificación y actualizar Google Tasks.'
            );
          }

          let gmailSentIso: string | undefined;
          if (recipientEmails.length > 0) {
            await sendGmailHtmlMessage({
              to: recipientEmails,
              subject,
              htmlBody,
              accessTokenOverride: activeToken,
            });
            gmailSentIso = new Date().toISOString();
          }

          const baseRec = buildClosureExecutionBase();
          const existingLink = getGoogleTaskLinkForEmail(baseRec, effectiveUserEmail);
          let syncedLink: ActivityGoogleTaskLink | null = existingLink;
          try {
            const synced = await syncClosureConfirmationTaskToGoogleTasks({
              closureExecutionId,
              periodKey: data.selectedPeriod,
              userName: currentUserName,
              userEmail: effectiveUserEmail,
              totalTasks: closureStatus.totalTasks,
              completedTasks: closureStatus.completedTasks,
              pendingTasks: closureStatus.pendingTasks,
              dueDateYmd: closureDueDateYmd,
              recipientLabels: recipientEmails,
              status: 'completed',
              completedAtIso: nowIso,
              existingLink,
              accessTokenOverride: activeToken,
            });
            syncedLink = {
              taskId: synced.taskId,
              taskListId: synced.taskListId,
              syncedAtIso: new Date().toISOString(),
            };
          } catch (taskErr) {
            if (taskErr instanceof GoogleWorkspaceAuthError) throw taskErr;
          }

          let updatedClosure: ActivityExecutionRecord = {
            ...baseRec,
            estado: 'realizada',
            completadaAtIso: nowIso,
            completadaPorNombre: currentUserName,
            completadaPorEmail: effectiveUserEmail,
            origenConfirmacion: 'panel',
            ...(gmailSentIso
              ? {
                  notificacionCierreEnviadaIso: gmailSentIso,
                  notificacionCierreDestinatarios: recipientEmails,
                }
              : {}),
          };
          if (syncedLink) {
            updatedClosure = withUpdatedGoogleTaskLink(
              updatedClosure,
              effectiveUserEmail,
              syncedLink
            );
          }

          const executionPatches = { [closureExecutionId]: updatedClosure };
          onUpdateWorkspace((prev) => ({
            ...prev,
            executions: { ...prev.executions, ...executionPatches },
            lastGoogleTasksSyncIso: new Date().toISOString(),
          }));
          if (permissions.canOperate && currentUser) {
            onSaveToCloud({
              executionPatches,
              lastGoogleTasksSyncIso: new Date().toISOString(),
            }).catch(() => {});
          }

          setFeedbackBanner({
            type: 'success',
            message:
              recipientEmails.length > 0
                ? `Cierre de ${periodLabel} confirmado en Google Tasks y notificado por Gmail a ${recipientEmails.length} destinatario(s).`
                : `Cierre de ${periodLabel} confirmado y sincronizado en Google Tasks.`,
          });
        } catch (err) {
          handleWorkspaceError(err, 'No se pudo completar la confirmación de cierre.');
        } finally {
          setIsSyncingGoogleTasks(false);
        }
      },
    });
  };

  // ---------- Cross-User Multi-User Sync: Mark Teammate-Completed Tasks in My Google Tasks ----------
  const handleRequestSyncRemoteCompletedToMyTasks = () => {
    if (remoteCompletedPendingMyTasks.length === 0) return;
    const itemsToComplete = [...remoteCompletedPendingMyTasks];

    setWorkspaceConfirm({
      kind: 'tasks_complete',
      title: `Actualizar ${itemsToComplete.length} tarea(s) compartida(s) en tu Google Tasks`,
      description:
        'Otro responsable asignado ya marcó estas actividades como cumplidas. Confirma para marcarlas como completadas también en tu lista de Google Tasks (Gmail).',
      itemsSummary: itemsToComplete.map(
        (it) =>
          `[${it.societyCode}] ${it.activityName} · Cumplida por ${it.completedByName}`
      ),
      confirmLabel: 'Marcar completadas en mi Tasks',
      onConfirm: async () => {
        setIsSyncingGoogleTasks(true);
        try {
          const activeToken = await resolveWorkspaceToken(true);
          if (!activeToken) {
            throw new GoogleWorkspaceAuthError(
              'Autoriza tu cuenta de Google para actualizar tus tareas en Google Tasks.'
            );
          }
          const updatedCount = await completeMultipleGoogleTasksForUser({
            items: itemsToComplete.map((it) => ({
              taskListId: it.taskListId,
              taskId: it.taskId,
              completedAtIso: it.completedAtIso,
              notes: it.updatedNotes,
            })),
            accessTokenOverride: activeToken,
          });
          setRemoteCompletedPendingMyTasks([]);
          setFeedbackBanner({
            type: 'success',
            message: `${updatedCount} tarea(s) compartida(s) marcada(s) como completada(s) en tu Google Tasks.`,
          });
        } catch (err) {
          handleWorkspaceError(err, 'No se pudieron actualizar las tareas compartidas en Google Tasks.');
        } finally {
          setIsSyncingGoogleTasks(false);
        }
      },
    });
  };

  // ---------- Push to Google Tasks (Gmail's Primary "Mis tareas" Sidebar + Independent Closure Task) ----------
  const handleRequestPushTasks = (
    items: MaterializedActivityAssignment[],
    scopeLabel: string,
    includeClosureTask = false
  ) => {
    if (items.length === 0 && !includeClosureTask) return;
    const remoteSyncCount = includeClosureTask ? remoteCompletedPendingMyTasks.length : 0;

    setWorkspaceConfirm({
      kind: 'tasks_push',
      title: `Habilitar ${items.length} actividad(es)${
        includeClosureTask ? ' + tarea de cierre' : ''
      } en Google Tasks`,
      description: `Se publicarán ${scopeLabel}${
        includeClosureTask ? ' junto con tu tarea independiente [CIERRE]' : ''
      } en tu lista "${PREMEX_GOOGLE_TASKS_LIST_TITLE}" para que aparezcan en el panel lateral de Gmail y puedas cumplirlas desde tu correo.`,
      itemsSummary: [
        ...items.map(
          (i) =>
            `[${i.society.codigo}] ${i.activity.nombre} · ${formatShortDateEs(
              i.execution.fechaSugerida
            )}`
        ),
        ...(includeClosureTask
          ? [
              `[CIERRE] Confirmar cumplimiento total de actividades · ${formatPeriodLabel(
                data.selectedPeriod
              )}`,
            ]
          : []),
        ...(remoteSyncCount > 0
          ? [`También se marcarán como completadas ${remoteSyncCount} tarea(s) compartida(s) ya cumplida(s) por otro usuario`]
          : []),
      ],
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

          let closureSynced = false;
          if (includeClosureTask) {
            const baseRec = buildClosureExecutionBase();
            const existingClosureLink = getGoogleTaskLinkForEmail(baseRec, effectiveUserEmail);
            const syncedClosure = await syncClosureConfirmationTaskToGoogleTasks({
              closureExecutionId,
              periodKey: data.selectedPeriod,
              userName: currentUserName,
              userEmail: effectiveUserEmail,
              totalTasks: closureStatus.totalTasks,
              completedTasks: closureStatus.completedTasks,
              pendingTasks: closureStatus.pendingTasks,
              dueDateYmd: closureDueDateYmd,
              recipientLabels: closureRecipients.map((r) => r.email),
              status: baseRec.estado === 'realizada' ? 'completed' : 'needsAction',
              completedAtIso: baseRec.completadaAtIso,
              existingLink: existingClosureLink,
              accessTokenOverride: activeToken,
            });
            executionPatches[closureExecutionId] = withUpdatedGoogleTaskLink(
              baseRec,
              effectiveUserEmail,
              {
                taskId: syncedClosure.taskId,
                taskListId: syncedClosure.taskListId,
                syncedAtIso: nowIso,
              }
            );
            closureSynced = true;
          }

          let remoteUpdatedCount = 0;
          if (includeClosureTask && remoteCompletedPendingMyTasks.length > 0) {
            remoteUpdatedCount = await completeMultipleGoogleTasksForUser({
              items: remoteCompletedPendingMyTasks.map((it) => ({
                taskListId: it.taskListId,
                taskId: it.taskId,
                completedAtIso: it.completedAtIso,
                notes: it.updatedNotes,
              })),
              accessTokenOverride: activeToken,
            });
            setRemoteCompletedPendingMyTasks([]);
          }

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
            message: `Habilitadas en Google Tasks · ${result.taskListTitle} (${result.createdCount} nueva(s), ${result.updatedCount} actualizada(s)${
              closureSynced ? ', tarea [CIERRE] activa' : ''
            }${
              remoteUpdatedCount > 0
                ? `, ${remoteUpdatedCount} compartida(s) marcada(s) completada(s)`
                : ''
            }). Ya aparecen en el panel derecho de tu Gmail.`,
          });
        } catch (err) {
          handleWorkspaceError(err, 'No se pudieron publicar las tareas en Google Tasks.');
        } finally {
          setIsSyncingGoogleTasks(false);
        }
      },
    });
  };

  // ---------- Two-Way Pull from Google Tasks (Gmail -> App + Independent Closure + Multi-User Cross-Sync) ----------
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
      const closureTaskByExecId = new Map<string, (typeof tasks)[number]>();
      const taskById = new Map<string, (typeof tasks)[number]>();
      tasks.forEach((t) => {
        taskById.set(t.id, t);
        const parsed = extractExecutionIdFromTaskNotes(t.notes);
        if (parsed) {
          const prev = taskByExecId.get(parsed);
          if (
            !prev ||
            (t.status === 'completed' && prev.status !== 'completed') ||
            (t.status === prev.status && t.taskListId === defaultList.id)
          ) {
            taskByExecId.set(parsed, t);
          }
        }
        const parsedClosure = extractClosureExecutionIdFromTaskNotes(t.notes);
        if (parsedClosure) {
          const prevC = closureTaskByExecId.get(parsedClosure);
          if (
            !prevC ||
            (t.status === 'completed' && prevC.status !== 'completed') ||
            (t.status === prevC.status && t.taskListId === defaultList.id)
          ) {
            closureTaskByExecId.set(parsedClosure, t);
          }
        }
      });

      const newlyCompleted: {
        assignment: MaterializedActivityAssignment;
        completedAtIso: string;
      }[] = [];

      const remoteCompletedOutOfSync: RemoteCompletedGoogleTaskSyncItem[] = [];
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
        } else if (item.execution.estado === 'realizada' && matchedTask.status !== 'completed') {
          // Another responsible (or another session) already completed this shared task in App/Firestore,
          // while this user's own Google Task is still open -> queue for 1-click completion in this user's Google Tasks!
          const doneBy =
            item.execution.completadaPorNombre ||
            item.execution.completadaPorEmail ||
            'Otro responsable';
          const doneIso = item.execution.completadaAtIso || nowIso;
          const existingNotes = matchedTask.notes || '';
          const syncFooter = `Estado: CUMPLIDA por ${doneBy} (${formatDateTimeEs(doneIso)})`;
          const updatedNotes = existingNotes.includes('Estado: CUMPLIDA por')
            ? existingNotes
            : [existingNotes, syncFooter].filter(Boolean).join('\n');

          remoteCompletedOutOfSync.push({
            executionId: item.executionId,
            activityName: item.activity.nombre,
            societyCode: item.society.codigo,
            completedByName: doneBy,
            completedAtIso: doneIso,
            taskId: matchedTask.id,
            taskListId: targetListId,
            updatedNotes,
          });
        } else if (
          effectiveUserEmail &&
          (!userLink || userLink.taskId !== matchedTask.id || userLink.taskListId !== targetListId)
        ) {
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

      setRemoteCompletedPendingMyTasks(remoteCompletedOutOfSync);

      // Check the Independent Closure Confirmation Task (`[PREMEX-CLOSURE:{closureExecutionId}]`)
      const baseClosureRec = buildClosureExecutionBase();
      const closureLink = getGoogleTaskLinkForEmail(baseClosureRec, effectiveUserEmail);
      const matchedClosureTask =
        closureTaskByExecId.get(closureExecutionId) ||
        (closureLink?.taskId ? taskById.get(closureLink.taskId) : undefined);

      let closureNewlyCompletedIso: string | null = null;
      if (matchedClosureTask) {
        const targetListId = matchedClosureTask.taskListId || defaultList.id;
        if (
          matchedClosureTask.status === 'completed' &&
          baseClosureRec.estado !== 'realizada'
        ) {
          closureNewlyCompletedIso = matchedClosureTask.completed || nowIso;
          executionPatches[closureExecutionId] = withUpdatedGoogleTaskLink(
            {
              ...baseClosureRec,
              estado: 'realizada',
              completadaAtIso: closureNewlyCompletedIso,
              completadaPorNombre: currentUserName,
              completadaPorEmail: effectiveUserEmail,
              origenConfirmacion: 'google_tasks',
            },
            effectiveUserEmail,
            {
              taskId: matchedClosureTask.id,
              taskListId: targetListId,
              syncedAtIso: nowIso,
            }
          );
        } else if (
          effectiveUserEmail &&
          (!closureLink ||
            closureLink.taskId !== matchedClosureTask.id ||
            closureLink.taskListId !== targetListId)
        ) {
          executionPatches[closureExecutionId] = withUpdatedGoogleTaskLink(
            baseClosureRec,
            effectiveUserEmail,
            {
              taskId: matchedClosureTask.id,
              taskListId: targetListId,
              syncedAtIso: nowIso,
            }
          );
        }
      }

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

      // Priority 1: Independent Closure Task was completed in Google Tasks -> open consolidated Gmail notification modal!
      if (closureNewlyCompletedIso) {
        const updatedAssignmentsForEmail = myPeriodAssignments.map((a) =>
          executionPatches[a.executionId]
            ? { ...a, execution: executionPatches[a.executionId] }
            : a
        );
        const recipientEmails = closureRecipients.map((r) => r.email);
        const periodLabel = formatPeriodLabel(data.selectedPeriod);

        setFeedbackBanner({
          type: 'success',
          message: `Se detectó tu confirmación de cierre [CIERRE] de ${periodLabel} desde Google Tasks.`,
        });

        if (recipientEmails.length > 0) {
          const { subject, htmlBody } = buildPeriodClosureNotificationEmail({
            periodKey: data.selectedPeriod,
            confirmedByName: currentUserName,
            confirmedByEmail: effectiveUserEmail,
            completedAtIso: closureNewlyCompletedIso,
            origin: 'google_tasks',
            assignments: updatedAssignmentsForEmail,
          });

          setWorkspaceConfirm({
            kind: 'gmail_completion',
            title: `Enviar notificación de cierre · ${periodLabel}`,
            description:
              'Marcaste la tarea independiente [CIERRE] como completada en Google Tasks. Confirma el envío del correo de cumplimiento a los destinatarios configurados.',
            recipients: recipientEmails,
            subjectPreview: subject,
            itemsSummary: [
              `Confirmado vía Google Tasks por ${currentUserName}`,
              `Actividades cumplidas: ${
                updatedAssignmentsForEmail.filter((a) => a.execution.estado === 'realizada').length
              } de ${updatedAssignmentsForEmail.length}`,
            ],
            confirmLabel: 'Enviar correo de cierre por Gmail',
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
                const latestClosure = executionPatches[closureExecutionId] || baseClosureRec;
                const notifyPatches: Record<string, ActivityExecutionRecord> = {
                  [closureExecutionId]: {
                    ...latestClosure,
                    notificacionCierreEnviadaIso: sentIso,
                    notificacionCierreDestinatarios: recipientEmails,
                  },
                };
                onUpdateWorkspace((prev) => ({
                  ...prev,
                  executions: { ...prev.executions, ...notifyPatches },
                }));
                if (permissions.canOperate && currentUser) {
                  onSaveToCloud({ executionPatches: notifyPatches }).catch(() => {});
                }
                setFeedbackBanner({
                  type: 'success',
                  message: `Correo de cierre enviado por Gmail a ${recipientEmails.length} destinatario(s).`,
                });
              } catch (err) {
                handleWorkspaceError(err, 'No se pudo enviar el correo de cierre por Gmail.');
              }
            },
          });
        }
        return;
      }

      if (newlyCompleted.length === 0) {
        if (!isSilent) {
          setFeedbackBanner({
            type: 'info',
            message:
              remoteCompletedOutOfSync.length > 0
                ? `Sincronización completada: ${remoteCompletedOutOfSync.length} tarea(s) compartida(s) ya fueron cumplidas por otro usuario y están listas para actualizarse en tu Google Tasks.`
                : `Sincronización completada (${tasks.length} tareas revisadas en Google Tasks). Sin nuevas confirmaciones.`,
          });
        }
        return;
      }

      setFeedbackBanner({
        type: 'success',
        message: `${newlyCompleted.length} actividad(es) marcada(s) como cumplida(s) desde Google Tasks (sincronizadas para todos los responsables). Al concluir todas, marca la tarea [CIERRE] para enviar el correo de cierre.`,
      });
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

      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <ActivitiesHeader
          activeTab={activeTab}
          selectedPeriod={data.selectedPeriod}
          onChangePeriod={(periodKey) => {
            const actStatus = getPeriodActivationStatus(periodKey);
            if (!actStatus.isActive) {
              setFeedbackBanner({
                type: 'info',
                message: `El periodo ${formatPeriodLabel(
                  periodKey
                )} se habilitará automáticamente el ${formatShortDateEs(
                  actStatus.activationDateIso
                )}.`,
              });
              return;
            }
            onUpdateWorkspace((prev) => ({ ...prev, selectedPeriod: periodKey }));
          }}
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
          {permissions.canOperate && remoteCompletedPendingMyTasks.length > 0 && (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
              <div className="flex items-start gap-2.5 text-emerald-950">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">
                  <strong>
                    {remoteCompletedPendingMyTasks.length} tarea(s) compartida(s)
                  </strong>{' '}
                  ya fueron cumplidas por otro responsable. Actualiza tu Google Tasks para marcarlas también en tu correo.
                </span>
              </div>
              <button
                type="button"
                disabled={isSyncingGoogleTasks}
                onClick={handleRequestSyncRemoteCompletedToMyTasks}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingGoogleTasks ? 'animate-spin' : ''}`} />
                <span>Actualizar mi Google Tasks</span>
              </button>
            </div>
          )}

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
              closureStatus={closureStatus}
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
              onRequestSyncClosureTask={handleRequestSyncClosureTask}
            />
          )}

          {activeTab === 'pendientes' && (
            <ActivitiesExecutionListView
              data={data}
              assignments={assignments}
              closureStatus={closureStatus}
              currentUserEmail={effectiveUserEmail}
              isAdmin={isAdmin}
              canOperate={permissions.canOperate}
              isSyncingGoogleTasks={isSyncingGoogleTasks}
              onOpenCompleteModal={(a) => setCompletingExecId(a.executionId)}
              onReopenActivity={(a) => {
                handleReopenActivity(a, true).catch(() => {});
              }}
              onRequestSendSubtleReminder={handleRequestSendSingleReminder}
              onRequestSyncSingleTask={(a) =>
                handleRequestPushTasks([a], `"${a.activity.nombre}" (${a.society.codigo})`, false)
              }
              onRequestSyncClosureTask={handleRequestSyncClosureTask}
              onRequestConfirmPeriodClosure={handleRequestConfirmPeriodClosure}
            />
          )}

          {activeTab === 'sincronizacion' && (
            <ActivitiesWorkspaceSyncView
              data={data}
              assignments={assignments}
              closureStatus={closureStatus}
              remoteCompletedPendingCount={remoteCompletedPendingMyTasks.length}
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
              onRequestSyncClosureTask={handleRequestSyncClosureTask}
              onRequestConfirmPeriodClosure={handleRequestConfirmPeriodClosure}
              onRequestSyncRemoteCompletedToMyTasks={handleRequestSyncRemoteCompletedToMyTasks}
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
