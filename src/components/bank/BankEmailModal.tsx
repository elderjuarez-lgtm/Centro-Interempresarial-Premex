import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Send,
  FileText,
  FileSpreadsheet,
  Files,
  Building2,
  CheckSquare,
  Square,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Mail,
  Download,
  Paperclip,
  Layers,
  UserCheck,
} from 'lucide-react';
import { BankExportMode } from '../../utils/bankOfficialExport';
import { formatBankMoney } from '../../utils/bankReconciliation';
import {
  GmailAttachment,
  GoogleWorkspaceAuthError,
  buildCorporatePlainTextHtmlEmail,
  sendGmailHtmlMessage,
} from '../../services/googleWorkspaceActivities';
import { BankExportAccountItem } from './BankExportModal';

export type BankEmailFormat = 'pdf' | 'excel' | 'both';
export type BankEmailScopeMode = 'all' | 'society' | 'individual' | 'custom';

interface BankEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  items: BankExportAccountItem[];
  initialSocietyKey?: string;
  initialAccountId?: string;
  initialScopeMode?: BankEmailScopeMode;
  buildExcelBytes: (
    selectedItems: BankExportAccountItem[],
    mode: BankExportMode,
    scopeLabel: string
  ) => Promise<{ bytes: Uint8Array<ArrayBuffer>; filename: string } | null>;
  buildPdfBytes: (
    selectedItems: BankExportAccountItem[],
    scopeLabel: string
  ) => Promise<{ bytes: Uint8Array<ArrayBuffer>; filename: string } | null>;
  accessToken?: string | null;
  onReconnectWorkspace?: () => Promise<string | null>;
  onInvalidateWorkspaceToken?: () => void;
  onSentSuccess?: (message: string) => void;
}

const getSocietyKey = (item: BankExportAccountItem): string =>
  (item.account.codigoSociedad || item.account.sociedad || 'SIN-SOC').trim().toUpperCase();

const getItemKey = (item: BankExportAccountItem): string =>
  `${item.period}::${item.account.id}`;

const parseEmailList = (raw: string): string[] =>
  Array.from(
    new Set(
      raw
        .split(/[,;\n\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes('@') && e.includes('.'))
    )
  );

const triggerLocalDownload = (bytes: Uint8Array<ArrayBuffer>, filename: string, mimeType: string) => {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const BankEmailModal: React.FC<BankEmailModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  items,
  initialSocietyKey = 'ALL',
  initialAccountId,
  initialScopeMode,
  buildExcelBytes,
  buildPdfBytes,
  accessToken,
  onReconnectWorkspace,
  onInvalidateWorkspaceToken,
  onSentSuccess,
}) => {
  const [format, setFormat] = useState<BankEmailFormat>('pdf');
  const [scopeMode, setScopeMode] = useState<BankEmailScopeMode>('all');
  const [activeSocietyKey, setActiveSocietyKey] = useState<string>('ALL');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const [toInput, setToInput] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [subject, setSubject] = useState('');
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [bodyText, setBodyText] = useState('');
  const [bodyTouched, setBodyTouched] = useState(false);

  const [isSending, setIsSending] = useState(false);
  const [sendingStep, setSendingStep] = useState<string>('');
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isDownloadingFallback, setIsDownloadingFallback] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsGoogleAuth, setNeedsGoogleAuth] = useState(false);
  const [sentInfo, setSentInfo] = useState<{
    recipients: string[];
    attachments: string[];
  } | null>(null);

  const societyOptions = useMemo(() => {
    const map = new Map<
      string,
      { key: string; code: string; name: string; count: number; itemKeys: string[] }
    >();
    items.forEach((it) => {
      const key = getSocietyKey(it);
      const cur = map.get(key) || {
        key,
        code: (it.account.codigoSociedad || '').trim(),
        name: it.account.sociedad || key,
        count: 0,
        itemKeys: [],
      };
      cur.count += 1;
      cur.itemKeys.push(getItemKey(it));
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const isMultiPeriod = useMemo(
    () => new Set(items.map((it) => it.period)).size > 1,
    [items]
  );

  // Initialize modal state whenever opened
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setNeedsGoogleAuth(false);
    setSentInfo(null);
    setSearch('');
    setSubjectTouched(false);
    setBodyTouched(false);

    const normalizedSoc =
      initialSocietyKey && initialSocietyKey !== 'ALL'
        ? initialSocietyKey.trim().toUpperCase()
        : 'ALL';
    const matchedSoc =
      normalizedSoc !== 'ALL'
        ? societyOptions.find((s) => s.key === normalizedSoc)
        : undefined;

    const preferredMode: BankEmailScopeMode =
      initialScopeMode ||
      (matchedSoc ? 'society' : items.length === 1 ? 'individual' : 'all');

    setScopeMode(preferredMode);

    if (preferredMode === 'individual') {
      const target =
        items.find((it) => it.account.id === initialAccountId) || items[0];
      setActiveSocietyKey('ALL');
      setSelectedKeys(target ? new Set([getItemKey(target)]) : new Set());
    } else if (preferredMode === 'society') {
      const soc = matchedSoc || societyOptions[0];
      if (soc) {
        setActiveSocietyKey(soc.key);
        setSelectedKeys(new Set(soc.itemKeys));
      } else {
        setActiveSocietyKey('ALL');
        setSelectedKeys(new Set(items.map((it) => getItemKey(it))));
      }
    } else {
      setActiveSocietyKey('ALL');
      setSelectedKeys(new Set(items.map((it) => getItemKey(it))));
    }
  }, [isOpen, initialSocietyKey, initialAccountId, initialScopeMode, items, societyOptions]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (scopeMode === 'society' && activeSocietyKey !== 'ALL') {
        if (getSocietyKey(it) !== activeSocietyKey) return false;
      }
      if (!q) return true;
      return (
        it.account.banco.toLowerCase().includes(q) ||
        it.account.sociedad.toLowerCase().includes(q) ||
        (it.account.codigoSociedad || '').toLowerCase().includes(q) ||
        it.account.numeroCuenta.toLowerCase().includes(q) ||
        it.period.toLowerCase().includes(q)
      );
    });
  }, [items, scopeMode, activeSocietyKey, search]);

  const selectedItems = useMemo(
    () => items.filter((it) => selectedKeys.has(getItemKey(it))),
    [items, selectedKeys]
  );

  const effectiveMode: BankExportMode =
    selectedItems.length <= 1 ? 'individual' : 'masivo';

  const derivedScopeLabel = useMemo(() => {
    if (selectedItems.length === 0) return 'Premex';
    if (selectedItems.length === 1) {
      return `${selectedItems[0].account.sociedad}_${selectedItems[0].account.banco}`;
    }
    const uniqueSocs = Array.from(new Set(selectedItems.map((it) => it.account.sociedad)));
    if (uniqueSocs.length === 1) return uniqueSocs[0];
    if (selectedItems.length === items.length) return 'Todas_las_Empresas';
    return `Seleccion_${selectedItems.length}Cuentas`;
  }, [selectedItems, items.length]);

  const periodSummaryLabel = useMemo(() => {
    const periods = Array.from(new Set(selectedItems.map((i) => i.period)));
    if (periods.length === 0) return '';
    if (periods.length === 1) return periods[0];
    return periods.join(', ');
  }, [selectedItems]);

  // Smart default subject & corporate body (updates automatically until edited)
  useEffect(() => {
    if (!isOpen) return;
    const formatText =
      format === 'both'
        ? 'Excel y PDF'
        : format === 'excel'
        ? 'Excel (.xlsx)'
        : 'PDF (.pdf)';

    const companySummary = (() => {
      if (selectedItems.length === 0) return 'Sin cuentas seleccionadas';
      if (selectedItems.length === 1) {
        const a = selectedItems[0].account;
        return `${a.sociedad} · ${a.banco} (${a.numeroCuenta})`;
      }
      const uniqueSocs = Array.from(new Set(selectedItems.map((i) => i.account.sociedad)));
      if (uniqueSocs.length === 1) {
        return `${uniqueSocs[0]} (${selectedItems.length} cuentas)`;
      }
      return `${uniqueSocs.length} empresa(s) · ${selectedItems.length} cuentas`;
    })();

    if (!subjectTouched) {
      setSubject(
        `Conciliación Bancaria Premex · ${companySummary}${
          periodSummaryLabel ? ` · ${periodSummaryLabel}` : ''
        }`
      );
    }

    if (!bodyTouched) {
      const accountLines = selectedItems
        .slice(0, 12)
        .map(
          (it) =>
            `• ${it.account.sociedad} — ${it.account.banco} (${it.account.numeroCuenta}, ${it.account.moneda})${
              isMultiPeriod ? ` [${it.period}]` : ''
            }`
        );
      if (selectedItems.length > 12) {
        accountLines.push(`• ... y ${selectedItems.length - 12} cuenta(s) bancaria(s) adicional(es).`);
      }

      setBodyText(
        [
          'Estimados,',
          '',
          `En respuesta al requerimiento, adjuntamos la conciliación bancaria oficial de Premex en formato ${formatText}${
            periodSummaryLabel ? ` correspondiente al periodo ${periodSummaryLabel}` : ''
          }.`,
          '',
          `Detalle incluido (${selectedItems.length} cuenta(s)):`,
          ...accountLines,
          '',
          'Quedamos atentos a cualquier aclaración adicional.',
          '',
          'Cordialmente,',
          'Tesorería y Contabilidad · Premex',
        ].join('\n')
      );
    }
  }, [
    isOpen,
    format,
    selectedItems,
    periodSummaryLabel,
    isMultiPeriod,
    subjectTouched,
    bodyTouched,
  ]);

  if (!isOpen) return null;

  const handleSelectScopeMode = (nextMode: BankEmailScopeMode) => {
    setScopeMode(nextMode);
    if (nextMode === 'all') {
      setActiveSocietyKey('ALL');
      setSelectedKeys(new Set(items.map((it) => getItemKey(it))));
    } else if (nextMode === 'society') {
      const targetSoc =
        societyOptions.find((s) => s.key === activeSocietyKey) || societyOptions[0];
      if (targetSoc) {
        setActiveSocietyKey(targetSoc.key);
        setSelectedKeys(new Set(targetSoc.itemKeys));
      }
    } else if (nextMode === 'individual') {
      setActiveSocietyKey('ALL');
      const firstSelected =
        items.find((it) => selectedKeys.has(getItemKey(it))) || items[0];
      setSelectedKeys(firstSelected ? new Set([getItemKey(firstSelected)]) : new Set());
    }
  };

  const handlePickSociety = (socKey: string) => {
    setScopeMode('society');
    setActiveSocietyKey(socKey);
    const target = societyOptions.find((s) => s.key === socKey);
    if (target) {
      setSelectedKeys(new Set(target.itemKeys));
    }
  };

  const handleToggleItem = (itemKey: string) => {
    if (scopeMode === 'individual') {
      setSelectedKeys(new Set([itemKey]));
      return;
    }
    if (scopeMode === 'all') {
      setScopeMode('custom');
    }
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(itemKey)) next.delete(itemKey);
      else next.add(itemKey);
      return next;
    });
  };

  const handleSelectVisible = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      filteredItems.forEach((it) => next.add(getItemKey(it)));
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedKeys(new Set());
  };

  const generateRequestedFiles = async (): Promise<
    { bytes: Uint8Array<ArrayBuffer>; filename: string; mimeType: string }[]
  > => {
    const files: { bytes: Uint8Array<ArrayBuffer>; filename: string; mimeType: string }[] = [];

    if (format === 'excel' || format === 'both') {
      const xls = await buildExcelBytes(selectedItems, effectiveMode, derivedScopeLabel);
      if (xls) {
        files.push({
          bytes: xls.bytes,
          filename: xls.filename,
          mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
      }
    }

    if (format === 'pdf' || format === 'both') {
      const pdf = await buildPdfBytes(selectedItems, derivedScopeLabel);
      if (pdf) {
        files.push({
          bytes: pdf.bytes,
          filename: pdf.filename,
          mimeType: 'application/pdf',
        });
      }
    }

    return files;
  };

  const handleAuthorizeGoogle = async () => {
    if (!onReconnectWorkspace) return;
    setIsAuthorizing(true);
    setErrorMsg(null);
    try {
      const token = await onReconnectWorkspace();
      if (token) {
        setNeedsGoogleAuth(false);
      } else {
        setErrorMsg('No se obtuvieron permisos de Gmail. Intenta autorizar nuevamente.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al autorizar Google Workspace.');
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleSendViaGmail = async () => {
    setErrorMsg(null);
    setNeedsGoogleAuth(false);
    setSentInfo(null);

    if (selectedItems.length === 0) {
      setErrorMsg('Selecciona al menos una cuenta bancaria para adjuntar.');
      return;
    }

    const toEmails = parseEmailList(toInput);
    const ccEmails = parseEmailList(ccInput);

    if (toEmails.length === 0) {
      setErrorMsg('Ingresa al menos un correo destinatario válido en el campo "Para".');
      return;
    }

    const cleanSubject = subject.trim();
    if (!cleanSubject) {
      setErrorMsg('Ingresa un asunto para el correo.');
      return;
    }

    setIsSending(true);
    try {
      let activeToken = (accessToken || '').trim();
      if (!activeToken && onReconnectWorkspace) {
        setSendingStep('Autorizando Gmail...');
        activeToken = (await onReconnectWorkspace()) || '';
      }
      if (!activeToken) {
        setNeedsGoogleAuth(true);
        setErrorMsg(
          'Autoriza tu cuenta de Google para enviar la conciliación directamente desde Gmail.'
        );
        return;
      }

      setSendingStep(
        format === 'both'
          ? 'Generando Excel y PDF...'
          : format === 'excel'
          ? 'Generando entregable Excel...'
          : 'Generando documento PDF...'
      );

      const generatedFiles = await generateRequestedFiles();
      if (generatedFiles.length === 0) {
        throw new Error('No se pudieron generar los archivos adjuntos para las cuentas seleccionadas.');
      }

      const gmailAttachments: GmailAttachment[] = generatedFiles.map((f) => ({
        filename: f.filename,
        mimeType: f.mimeType,
        bytes: f.bytes,
      }));

      setSendingStep('Enviando correo por Gmail...');

      const htmlBody = buildCorporatePlainTextHtmlEmail({
        moduleLabel: 'Conciliaciones Bancarias',
        title: cleanSubject,
        subtitle: `${selectedItems.length} cuenta(s) bancaria(s)${
          periodSummaryLabel ? ` · ${periodSummaryLabel}` : ''
        }`,
        bodyText: bodyText.trim(),
        attachmentNames: generatedFiles.map((f) => f.filename),
      });

      await sendGmailHtmlMessage({
        to: toEmails,
        cc: ccEmails.length > 0 ? ccEmails : undefined,
        subject: cleanSubject,
        htmlBody,
        attachments: gmailAttachments,
        accessTokenOverride: activeToken,
      });

      const fileNames = generatedFiles.map((f) => f.filename);
      setSentInfo({
        recipients: [...toEmails, ...ccEmails],
        attachments: fileNames,
      });
      onSentSuccess?.(
        `Conciliación bancaria enviada por Gmail a ${toEmails.join(', ')} (${fileNames.length} adjunto(s)).`
      );
    } catch (err: any) {
      if (err instanceof GoogleWorkspaceAuthError) {
        onInvalidateWorkspaceToken?.();
        setNeedsGoogleAuth(true);
        setErrorMsg(err.message);
      } else {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'No se pudo enviar el correo por Gmail. Verifica tu conexión e inténtalo nuevamente.'
        );
      }
    } finally {
      setIsSending(false);
      setSendingStep('');
    }
  };

  const handleDownloadLocalCopy = async () => {
    if (selectedItems.length === 0) return;
    setIsDownloadingFallback(true);
    setErrorMsg(null);
    try {
      const files = await generateRequestedFiles();
      files.forEach((f) => triggerLocalDownload(f.bytes, f.filename, f.mimeType));
    } catch (err: any) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al generar copia local.');
    } finally {
      setIsDownloadingFallback(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 print:hidden">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-email-modal-title"
        className="bg-white w-full sm:max-w-3xl max-h-[94dvh] sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3 bg-gradient-to-r from-[#0E224D] to-[#1E60A8] text-white shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0 mt-0.5">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3 id="bank-email-modal-title" className="text-base font-bold leading-snug truncate">
                {title}
              </h3>
              <p className="text-xs text-sky-100 mt-0.5 truncate">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            aria-label="Cerrar ventana"
            className="p-2 text-white/80 hover:text-white hover:bg-white/15 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Sent Success Banner */}
          {sentInfo && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Correo enviado exitosamente por Gmail</span>
              </div>
              <div className="text-xs text-emerald-800 space-y-1">
                <div>
                  <strong>Destinatarios:</strong> {sentInfo.recipients.join(', ')}
                </div>
                <div>
                  <strong>Adjuntos:</strong> {sentInfo.attachments.join(' · ')}
                </div>
              </div>
            </div>
          )}

          {/* Error / Auth Recovery Banner */}
          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{errorMsg}</span>
              </div>
              {needsGoogleAuth && onReconnectWorkspace && (
                <button
                  type="button"
                  disabled={isAuthorizing}
                  onClick={() => void handleAuthorizeGoogle()}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isAuthorizing ? 'animate-spin' : ''}`} />
                  <span>{isAuthorizing ? 'Autorizando...' : 'Autorizar Gmail'}</span>
                </button>
              )}
            </div>
          )}

          {/* Step 1: Format Selector */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              1. Formato de adjunto
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  {
                    id: 'pdf' as BankEmailFormat,
                    label: 'PDF (.pdf)',
                    desc: 'Hojas oficiales horizontales',
                    icon: FileText,
                  },
                  {
                    id: 'excel' as BankEmailFormat,
                    label: 'Excel (.xlsx)',
                    desc: 'Libro con fórmulas y detalle SAP',
                    icon: FileSpreadsheet,
                  },
                  {
                    id: 'both' as BankEmailFormat,
                    label: 'Excel + PDF',
                    desc: 'Adjunta ambos entregables',
                    icon: Files,
                  },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const active = format === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormat(opt.id)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      active
                        ? 'bg-[#132B63] text-white border-[#132B63] shadow-xs'
                        : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-white hover:border-[#1E60A8]/50'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-sky-200' : 'text-[#1E60A8]'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight">{opt.label}</div>
                      <div
                        className={`text-[10px] mt-0.5 truncate ${
                          active ? 'text-sky-100/90' : 'text-slate-500'
                        }`}
                      >
                        {opt.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Account Scope Selector */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                2. Cuentas a enviar ({selectedItems.length} de {items.length})
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all' as BankEmailScopeMode, label: 'Todas', icon: Layers },
                    { id: 'society' as BankEmailScopeMode, label: 'Por Empresa', icon: Building2 },
                    { id: 'individual' as BankEmailScopeMode, label: '1 Cuenta', icon: UserCheck },
                    { id: 'custom' as BankEmailScopeMode, label: 'Por Selección', icon: CheckSquare },
                  ] as const
                ).map((modeOpt) => {
                  const Icon = modeOpt.icon;
                  const active = scopeMode === modeOpt.id;
                  return (
                    <button
                      key={modeOpt.id}
                      type="button"
                      onClick={() => handleSelectScopeMode(modeOpt.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#1E60A8] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{modeOpt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Company Quick Strip */}
            {(scopeMode === 'society' || scopeMode === 'custom') && societyOptions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {societyOptions.map((soc) => {
                  const isSocActive = scopeMode === 'society' && activeSocietyKey === soc.key;
                  const allSocSelected = soc.itemKeys.every((k) => selectedKeys.has(k));
                  return (
                    <button
                      key={soc.key}
                      type="button"
                      onClick={() => handlePickSociety(soc.key)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                        isSocActive || (scopeMode === 'custom' && allSocSelected)
                          ? 'bg-[#132B63] text-white border-[#132B63]'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-[#1E60A8]/50'
                      }`}
                    >
                      {soc.code ? `${soc.code} · ` : ''}
                      {soc.name} ({soc.count})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Search & Account Checklist */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filtrar por banco, empresa o número de cuenta..."
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#1E60A8]"
                  />
                </div>
                {scopeMode !== 'individual' && (
                  <div className="flex items-center gap-2 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={handleSelectVisible}
                      className="text-[#1E60A8] hover:underline cursor-pointer"
                    >
                      Seleccionar visibles
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                    >
                      Limpiar
                    </button>
                  </div>
                )}
              </div>

              <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 bg-white">
                {filteredItems.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">
                    No hay cuentas que coincidan con el filtro.
                  </div>
                ) : (
                  filteredItems.map((it) => {
                    const itemKey = getItemKey(it);
                    const checked = selectedKeys.has(itemKey);
                    const isOk = Math.abs(it.summary.diferenciaNeta) <= 1;
                    return (
                      <button
                        key={itemKey}
                        type="button"
                        onClick={() => handleToggleItem(itemKey)}
                        className={`w-full px-3 py-2 flex items-center justify-between gap-3 text-left text-xs transition-colors cursor-pointer ${
                          checked ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {checked ? (
                            <CheckSquare className="w-4 h-4 text-[#1E60A8] shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">
                              {it.account.banco}{' '}
                              <span className="font-normal text-slate-500">
                                · {it.account.numeroCuenta}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {it.account.sociedad} · {it.account.moneda}
                              {isMultiPeriod ? ` · ${it.period}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono tabular-nums text-[11px] font-semibold text-slate-800">
                            {formatBankMoney(it.summary.saldoLibros, it.account.moneda)}
                          </div>
                          <div
                            className={`text-[10px] font-semibold ${
                              isOk ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {isOk ? 'Cuadrada' : 'Con dif.'}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Step 3: Email Details */}
          <div className="space-y-3">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              3. Destinatarios y mensaje
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Para <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={toInput}
                  onChange={(e) => setToInput(e.target.value)}
                  placeholder="auditoria@empresa.com, tesoreria@premexcorp.com"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Separa varios correos con coma o punto y coma.
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  CC (opcional)
                </label>
                <input
                  type="text"
                  value={ccInput}
                  onChange={(e) => setCcInput(e.target.value)}
                  placeholder="copia@premexcorp.com"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Asunto <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => {
                  setSubjectTouched(true);
                  setSubject(e.target.value);
                }}
                className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Mensaje del correo
              </label>
              <textarea
                rows={5}
                value={bodyText}
                onChange={(e) => {
                  setBodyTouched(true);
                  setBodyText(e.target.value);
                }}
                className="w-full px-3 py-2 text-xs leading-relaxed rounded-xl border border-slate-300 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
              />
            </div>

            {/* Attachment Summary */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <Paperclip className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
                <span>
                  Se adjuntará:{' '}
                  <strong className="text-slate-900">
                    {format === 'both'
                      ? 'Excel (.xlsx) + PDF (.pdf)'
                      : format === 'excel'
                      ? 'Excel (.xlsx)'
                      : 'PDF (.pdf)'}
                  </strong>{' '}
                  · {selectedItems.length} cuenta(s) ({effectiveMode === 'individual' ? 'Individual' : 'Masivo'})
                </span>
              </div>
              {!accessToken && onReconnectWorkspace && (
                <button
                  type="button"
                  disabled={isAuthorizing}
                  onClick={() => void handleAuthorizeGoogle()}
                  className="text-[11px] font-semibold text-[#1E60A8] hover:underline cursor-pointer"
                >
                  {isAuthorizing ? 'Autorizando...' : 'Conectar Gmail antes de enviar'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 pb-safe shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="button"
              disabled={selectedItems.length === 0 || isDownloadingFallback || isSending}
              onClick={() => void handleDownloadLocalCopy()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              title="Descargar copia local de los archivos seleccionados"
            >
              {isDownloadingFallback ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5 text-slate-600" />
              )}
              <span>Copia local</span>
            </button>
          </div>

          <button
            type="button"
            disabled={isSending || selectedItems.length === 0}
            onClick={() => void handleSendViaGmail()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{sendingStep || 'Enviando...'}</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Enviar por Gmail</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
