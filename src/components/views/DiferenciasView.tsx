import React, { useState, useMemo, useEffect } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  FileSpreadsheet, 
  Download, 
  MessageSquare, 
  Check, 
  Save, 
  Sparkles,
  Lock,
  FileSearch,
  ArrowRight,
  Mail,
  ExternalLink,
  X,
  UserCheck,
  Users
} from 'lucide-react';
import {
  DifferenceRow,
  MatrixResult,
  Movement,
  ClosedMonthRecord,
  MovimientosNavigationPreset,
  EntityMapping,
  ReconciliationScope,
} from '../../types';
import { formatCurrency, reconcileByDocument } from '../../utils/reconciliation';
import { exportReconciliationToExcelFile } from '../../utils/excel';
import { extractPersonNameFromEmail } from '../../utils/diffEmailImage';
import { INTERCOMPANY_SCOPE_META, getIntercompanyScopeLabel } from '../../utils/demoData';

interface DiferenciasViewProps {
  differences: DifferenceRow[];
  onUpdateComment: (pairId: string, comment: string) => void;
  onBatchUpdateComments?: (updates: Record<string, string>) => void;
  onOpenGoogleSheets: () => void;
  onOpenSaveModal?: () => void;
  onOpenCloseMonthModal?: () => void;
  onInspectDocuments?: (preset: MovimientosNavigationPreset) => void;
  matrizCxc: MatrixResult;
  matrizCxp: MatrixResult;
  movements: Movement[];
  orderedEntities?: string[];
  entities?: EntityMapping[];
  selectedMonth?: string;
  closedMonths?: Record<string, ClosedMonthRecord>;
  activeScope?: ReconciliationScope;
  readOnly?: boolean;
}

export const DiferenciasView: React.FC<DiferenciasViewProps> = ({
  differences,
  onUpdateComment,
  onBatchUpdateComments,
  onOpenGoogleSheets,
  onOpenSaveModal,
  onOpenCloseMonthModal,
  onInspectDocuments,
  matrizCxc,
  matrizCxp,
  movements,
  orderedEntities,
  entities = [],
  selectedMonth = 'Septiembre 2026',
  closedMonths = {},
  activeScope = 'internacionales',
  readOnly = false,
}) => {
  const scopeLabel = getIntercompanyScopeLabel(activeScope);
  const currencyBannerLabel = INTERCOMPANY_SCOPE_META[activeScope].currencyBannerLabel;
  const isMonthClosed = selectedMonth !== 'ALL' && Boolean(closedMonths[selectedMonth]);
  const isEditingLocked = isMonthClosed || readOnly;
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DIFERENCIA' | 'CONCILIADO'>('ALL');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempComment, setTempComment] = useState('');
  const [justSavedId, setJustSavedId] = useState<string | null>(null);

  const QUICK_TEMPLATES = [
    'Factura en tránsito / transporte',
    'Diferencia por tipo de cambio al cierre',
    'Retención de impuestos pendiente de certificado',
    'Nota de crédito pendiente de aplicación',
    'Aclarado y conciliado por tesorería',
  ];

  const handleStartEdit = (row: DifferenceRow) => {
    if (isEditingLocked) return;
    setEditingId(row.id);
    setTempComment(row.comentario || '');
  };

  const handleSaveComment = (rowId: string) => {
    if (isEditingLocked) return;
    onUpdateComment(rowId, tempComment);
    setEditingId(null);
    setJustSavedId(rowId);
    setTimeout(() => {
      setJustSavedId(null);
    }, 2500);
  };

  const handleApplyTemplate = (template: string) => {
    setTempComment((prev) => (prev ? `${prev} - ${template}` : template));
  };

  const filteredDifferences = useMemo(
    () =>
      differences.filter((d) => {
        if (statusFilter === 'DIFERENCIA' && d.estado === 'conciliado') return false;
        if (statusFilter === 'CONCILIADO' && d.estado !== 'conciliado') return false;

        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const matchSoc = d.sociedad.toLowerCase().includes(term);
          const matchCp = d.contraparte.toLowerCase().includes(term);
          const matchComment = d.comentario.toLowerCase().includes(term);
          if (!matchSoc && !matchCp && !matchComment) return false;
        }
        return true;
      }),
    [differences, statusFilter, searchTerm]
  );

  const totalCxc = filteredDifferences.reduce((sum, d) => sum + d.cxc, 0);
  const totalCxp = filteredDifferences.reduce((sum, d) => sum + d.cxp, 0);
  const totalDiff = Math.round((totalCxc - totalCxp + Number.EPSILON) * 100) / 100;

  const countDiferencias = differences.filter((d) => d.estado !== 'conciliado').length;
  const countConciliadas = differences.filter((d) => d.estado === 'conciliado').length;

  // Document-level reconciliation (strictly used for unreconciled document details in email drafts)
  const docRecon = useMemo(() => reconcileByDocument(movements), [movements]);

  // Only pairs with differences (never reconciled pairs)
  const onlyDifferencePairs = useMemo(
    () => differences.filter((d) => d.estado !== 'conciliado'),
    [differences]
  );

  // Per-row checkbox selection (restricted strictly to unreconciled difference lines)
  const [selectedPairIds, setSelectedPairIds] = useState<string[]>([]);

  useEffect(() => {
    const validDiffIds = new Set(onlyDifferencePairs.map((d) => d.id));
    setSelectedPairIds((prev) => prev.filter((id) => validDiffIds.has(id)));
  }, [onlyDifferencePairs]);

  const selectedPairIdSet = useMemo(() => new Set(selectedPairIds), [selectedPairIds]);

  const togglePairSelection = (pairId: string) => {
    setSelectedPairIds((prev) =>
      prev.includes(pairId) ? prev.filter((id) => id !== pairId) : [...prev, pairId]
    );
  };

  // Map company official name (lowercase) -> contact email configured in EmpresasView
  const entityEmailLookup = useMemo(() => {
    const map = new Map<string, string>();
    entities.forEach((ent) => {
      const key = ent.nombreOficial.trim().toLowerCase();
      if (key && ent.email?.trim()) {
        map.set(key, ent.email.trim());
      }
    });
    return map;
  }, [entities]);

  const resolveCompanyEmail = (companyName: string): string => {
    if (!companyName) return '';
    return entityEmailLookup.get(companyName.trim().toLowerCase()) || '';
  };

  // Email draft modal state
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [modalPairIds, setModalPairIds] = useState<string[]>([]);
  const [excludedDocIds, setExcludedDocIds] = useState<string[]>([]);
  const [recipientCompany, setRecipientCompany] = useState<string>('');
  const [emailTo, setEmailTo] = useState<string>('');
  const [emailCc, setEmailCc] = useState<string>('');
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [emailBody, setEmailBody] = useState<string>('');
  const [isBodyEditedManually, setIsBodyEditedManually] = useState(false);

  const modalPairIdSet = useMemo(() => new Set(modalPairIds), [modalPairIds]);
  const excludedDocIdSet = useMemo(() => new Set(excludedDocIds), [excludedDocIds]);

  // All unreconciled pairs included in this email draft (supports multiple lines across different companies)
  const activeEmailRows = useMemo(
    () =>
      differences.filter(
        (d) => modalPairIdSet.has(d.id) && d.estado !== 'conciliado'
      ),
    [differences, modalPairIdSet]
  );

  // Full list of companies available to send to (involved companies + entire directory)
  const { involvedCandidates, otherDirectoryCandidates, allDirectoryWithEmail } = useMemo(() => {
    const involvedNames = new Set<string>();
    activeEmailRows.forEach((row) => {
      if (row.sociedad?.trim()) involvedNames.add(row.sociedad.trim());
      if (row.contraparte?.trim()) involvedNames.add(row.contraparte.trim());
    });

    const allMap = new Map<string, { name: string; email: string }>();
    entities.forEach((ent) => {
      const name = ent.nombreOficial.trim();
      if (!name) return;
      allMap.set(name.toLowerCase(), {
        name,
        email: ent.email?.trim() || '',
      });
    });

    differences.forEach((d) => {
      [d.sociedad, d.contraparte].forEach((raw) => {
        const clean = raw?.trim();
        if (!clean) return;
        const key = clean.toLowerCase();
        if (!allMap.has(key)) {
          allMap.set(key, { name: clean, email: resolveCompanyEmail(clean) });
        }
      });
    });

    const involved: Array<{ name: string; email: string }> = [];
    const others: Array<{ name: string; email: string }> = [];

    Array.from(allMap.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((item) => {
        if (involvedNames.has(item.name)) {
          involved.push(item);
        } else {
          others.push(item);
        }
      });

    const withEmail = Array.from(allMap.values())
      .filter((item) => Boolean(item.email))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      involvedCandidates: involved,
      otherDirectoryCandidates: others,
      allDirectoryWithEmail: withEmail,
    };
  }, [activeEmailRows, entities, differences, entityEmailLookup]);

  // Standalone unmatched documents (neither matched by document nor by value) for active pairs
  const docsForActivePairs = useMemo(() => {
    if (activeEmailRows.length === 0) return [];
    const allowedPairs = new Set(
      activeEmailRows.map(
        (d) => `${d.sociedad.trim().toLowerCase()}___${d.contraparte.trim().toLowerCase()}`
      )
    );
    return docRecon.rows.filter(
      (r) =>
        r.status === 'sin_contraparte' &&
        allowedPairs.has(
          `${r.sociedad.trim().toLowerCase()}___${r.contraparte.trim().toLowerCase()}`
        )
    );
  }, [docRecon.rows, activeEmailRows]);

  // Final discretionary document list after optional per-document unchecking
  const activeUnreconciledDocs = useMemo(
    () => docsForActivePairs.filter((r) => !excludedDocIdSet.has(r.id)),
    [docsForActivePairs, excludedDocIdSet]
  );

  const buildEmailDraft = (
    targetCompany: string,
    targetEmail: string,
    pairs: DifferenceRow[],
    unreconciledDocs: typeof activeUnreconciledDocs
  ) => {
    const periodLabel = selectedMonth === 'ALL' ? 'Consolidado General' : selectedMonth;
    const personName = extractPersonNameFromEmail(targetEmail);
    const greeting = personName
      ? `Estimado(a) ${personName},`
      : targetCompany
      ? `Estimado equipo de ${targetCompany},`
      : 'Estimados,';

    const subject = targetCompany
      ? `Conciliación Interempresarial (${periodLabel}) - Validación de diferencias no conciliadas (${targetCompany})`
      : `Conciliación Interempresarial (${periodLabel}) - Validación de diferencias no conciliadas`;

    const formatNumberStr = (val: number): string => {
      const rounded = Math.round((val + Number.EPSILON) * 100) / 100;
      return new Intl.NumberFormat('es-CO', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(rounded);
    };

    const measureArialPx = (() => {
      let ctx: CanvasRenderingContext2D | null = null;
      return (text: string): number => {
        if (typeof document === 'undefined') return text.length * 7;
        if (!ctx) {
          const canvas = document.createElement('canvas');
          ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.font = '13px Arial, Helvetica, sans-serif';
          }
        }
        return ctx ? ctx.measureText(text).width : text.length * 7;
      };
    })();

    const spacePx = Math.max(measureArialPx(' '), 1);
    const padEndPx = (text: string, targetPx: number, minSpaces = 0): string => {
      const diff = targetPx - measureArialPx(text);
      const count = Math.max(minSpaces, Math.round(diff / spacePx));
      return `${text}${' '.repeat(count)}`;
    };
    const padStartPx = (text: string, targetPx: number): string => {
      const diff = targetPx - measureArialPx(text);
      const count = Math.max(0, Math.round(diff / spacePx));
      return `${' '.repeat(count)}${text}`;
    };

    const lines: string[] = [];
    lines.push(greeting);
    lines.push('');
    lines.push(
      `Por este medio te enviamos las diferencias no conciliadas correspondientes al período ${periodLabel}, para solicitar tu apoyo validando los saldos y verificando los documentos pendientes de registro.`
    );

    if (pairs.length > 0) {
      type PreparedItem = { dateStr: string; docStr: string; numStr: string };
      type PreparedPair = {
        title: string;
        items: PreparedItem[];
        totalNumStr: string;
      };

      const preparedPairs: PreparedPair[] = [];

      pairs.forEach((p) => {
        const socNorm = p.sociedad.trim().toLowerCase();
        const cpNorm = p.contraparte.trim().toLowerCase();

        const rawPairDocs = docsForActivePairs.filter(
          (doc) =>
            doc.sociedad.trim().toLowerCase() === socNorm &&
            doc.contraparte.trim().toLowerCase() === cpNorm
        );

        const pairDocs = unreconciledDocs.filter(
          (doc) =>
            doc.status === 'sin_contraparte' &&
            doc.sociedad.trim().toLowerCase() === socNorm &&
            doc.contraparte.trim().toLowerCase() === cpNorm
        );

        // If the pair had standalone documents but user manually unchecked all of them, omit the pair
        if (rawPairDocs.length > 0 && pairDocs.length === 0) {
          return;
        }

        const title = `${p.sociedad.toUpperCase()} CxC - ${p.contraparte.toUpperCase()} CxP`;

        if (pairDocs.length === 0) {
          preparedPairs.push({
            title,
            items: [],
            totalNumStr: formatNumberStr(p.diferencia),
          });
        } else {
          let pairTotal = 0;
          const items: PreparedItem[] = pairDocs.map((doc) => {
            const rawDate =
              doc.cxcFecha && doc.cxcFecha !== '—'
                ? doc.cxcFecha
                : doc.cxpFecha && doc.cxpFecha !== '—'
                ? doc.cxpFecha
                : doc.mes;

            const facturaNum =
              doc.cxcValor > 0
                ? doc.facturaDisplay
                : doc.counterpartyFacturaDisplay || doc.facturaDisplay;
            const amount = doc.diferencia;
            pairTotal += amount;

            return {
              dateStr: rawDate.trim(),
              docStr: facturaNum.trim(),
              numStr: formatNumberStr(amount),
            };
          });

          preparedPairs.push({
            title,
            items,
            totalNumStr: formatNumberStr(pairTotal),
          });
        }
      });

      if (preparedPairs.length > 0) {
        const allItems = preparedPairs.flatMap((pp) => pp.items);
        const colGap = '   ';
        const currencyPrefix = '   US$ ';

        const maxDatePx = Math.max(
          measureArialPx('00/00/0000'),
          ...allItems.map((item) => measureArialPx(item.dateStr))
        );
        const maxDocPx = Math.max(
          measureArialPx('000000000000000'),
          ...allItems.map((item) => measureArialPx(item.docStr))
        );
        const labelTargetPx = Math.max(
          measureArialPx('TOTAL') + 6 * spacePx,
          maxDatePx + measureArialPx(colGap) + maxDocPx
        );

        const maxNumPx = Math.max(
          measureArialPx('99,999,999.99'),
          ...allItems.map((item) => measureArialPx(item.numStr)),
          ...preparedPairs.map((pp) => measureArialPx(pp.totalNumStr))
        );

        const rowWidthPx = labelTargetPx + measureArialPx(currencyPrefix) + maxNumPx;
        const dashPx = Math.max(measureArialPx('-'), 1);
        const dashLine = '-'.repeat(Math.max(12, Math.round(rowWidthPx / dashPx)));

        preparedPairs.forEach((pp) => {
          lines.push('');
          lines.push(pp.title);
          lines.push('');

          if (pp.items.length === 0) {
            const totalLabel = padEndPx('TOTAL', labelTargetPx, 2);
            const totalNum = padStartPx(pp.totalNumStr, maxNumPx);
            lines.push(`  ${totalLabel}${currencyPrefix}${totalNum}`);
          } else {
            pp.items.forEach((item) => {
              const dateCol = padEndPx(item.dateStr, maxDatePx);
              const prefix = padEndPx(`${dateCol}${colGap}${item.docStr}`, labelTargetPx);
              const valCol = padStartPx(item.numStr, maxNumPx);
              lines.push(`  ${prefix}${currencyPrefix}${valCol}`);
            });

            lines.push(`  ${dashLine}`);
            const totalLabel = padEndPx('TOTAL', labelTargetPx, 2);
            const totalNum = padStartPx(pp.totalNumStr, maxNumPx);
            lines.push(`  ${totalLabel}${currencyPrefix}${totalNum}`);
          }
        });
      }
    }

    lines.push('');
    lines.push(
      'Te agradecemos revisar y confirmarnos cualquier observación, soporte o ajuste necesario para avanzar con el cierre de la conciliación.'
    );
    lines.push('');
    lines.push('Quedamos atentos a tus comentarios.');
    lines.push('Saludos cordiales.');

    return { subject, body: lines.join('\n') };
  };

  const openEmailModalWithPairIds = (pairIds: string[]) => {
    if (onlyDifferencePairs.length === 0) return;

    const validPairs = differences.filter(
      (d) => pairIds.includes(d.id) && d.estado !== 'conciliado'
    );

    const candidateNames: string[] = [];
    const sourceForDefault = validPairs.length > 0 ? validPairs : onlyDifferencePairs;
    sourceForDefault.forEach((p) => {
      if (p.contraparte && !candidateNames.includes(p.contraparte)) candidateNames.push(p.contraparte);
      if (p.sociedad && !candidateNames.includes(p.sociedad)) candidateNames.push(p.sociedad);
    });
    const firstWithEmail = candidateNames.find((name) => Boolean(resolveCompanyEmail(name)));
    const initialRecipient = firstWithEmail || candidateNames[0] || '';

    setModalPairIds(validPairs.map((p) => p.id));
    setExcludedDocIds([]);
    setRecipientCompany(initialRecipient);
    setEmailTo(resolveCompanyEmail(initialRecipient));
    setEmailCc('');
    setIsBodyEditedManually(false);
    setIsEmailModalOpen(true);
  };

  const handleOpenEmailFromSelectionOrTotals = () => {
    // Respect exact discretionary selection; if none checked yet, open with 0 checked so user chooses manually
    openEmailModalWithPairIds(selectedPairIds);
  };

  const toggleModalPair = (pairId: string) => {
    setModalPairIds((prev) =>
      prev.includes(pairId) ? prev.filter((id) => id !== pairId) : [...prev, pairId]
    );
  };

  const toggleModalDocument = (docId: string) => {
    setExcludedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const handleSelectRecipientCompany = (companyName: string) => {
    setRecipientCompany(companyName);
    setEmailTo(resolveCompanyEmail(companyName));
    setIsBodyEditedManually(false);
  };

  const handleAddCcFromDirectory = (emailToAdd: string) => {
    const clean = emailToAdd.trim();
    if (!clean) return;
    setEmailCc((prev) => {
      const existing = prev
        .split(/[,;]/)
        .map((e) => e.trim())
        .filter(Boolean);
      if (existing.some((e) => e.toLowerCase() === clean.toLowerCase())) {
        return prev;
      }
      return [...existing, clean].join(', ');
    });
  };

  // Update greeting, subject & body reactively from recipient, email name, and selected differences/docs
  useEffect(() => {
    if (!isEmailModalOpen) return;
    const { subject, body } = buildEmailDraft(
      recipientCompany,
      emailTo,
      activeEmailRows,
      activeUnreconciledDocs
    );
    setEmailSubject(subject);
    if (!isBodyEditedManually) {
      setEmailBody(body);
    }
  }, [
    isEmailModalOpen,
    recipientCompany,
    emailTo,
    activeEmailRows,
    activeUnreconciledDocs,
    selectedMonth,
    isBodyEditedManually,
  ]);

  const recordEmailNotificationNotes = () => {
    if (isEditingLocked || activeEmailRows.length === 0) return;
    const now = new Date();
    const fechaHora = now.toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const personName = extractPersonNameFromEmail(emailTo);
    const responsibleLabel = emailTo.trim()
      ? personName
        ? `${personName} (${emailTo.trim()})`
        : emailTo.trim()
      : recipientCompany || 'Responsable';
    const ccPart = emailCc.trim() ? ` | CC: ${emailCc.trim()}` : '';
    const autoNote = `Correo enviado al responsable (${responsibleLabel}${ccPart}) el ${fechaHora} - Notificado de diferencias.`;

    const updates: Record<string, string> = {};
    activeEmailRows.forEach((pair) => {
      const existing = pair.comentario?.trim();
      updates[pair.id] = existing ? `${existing} | ${autoNote}` : autoNote;
    });

    if (onBatchUpdateComments) {
      onBatchUpdateComments(updates);
    } else {
      Object.entries(updates).forEach(([pairId, comment]) => {
        onUpdateComment(pairId, comment);
      });
    }
  };

  const gmailComposeUrl = useMemo(() => {
    const params = new URLSearchParams({
      view: 'cm',
      fs: '1',
      su: emailSubject,
      body: emailBody,
    });
    if (emailTo.trim()) {
      params.set('to', emailTo.trim());
    }
    if (emailCc.trim()) {
      params.set('cc', emailCc.trim());
    }
    return `https://mail.google.com/mail/?${params.toString()}`;
  }, [emailTo, emailCc, emailSubject, emailBody]);

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            3. Tabla de Diferencias de Conciliación
          </h3>
          <p className="text-xs text-slate-500">
            Fórmula de cálculo: <strong className="text-blue-900 font-mono">Diferencia = CxC - CxP de la contraparte</strong>. Selecciona una o varias líneas con diferencia para redactar un solo correo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              const label =
                selectedMonth === 'ALL'
                  ? `CONSOLIDADO HISTÓRICO (${scopeLabel.toUpperCase()}) - ( ${currencyBannerLabel} )`
                  : `${selectedMonth.toUpperCase()} (${scopeLabel.toUpperCase()}) - ( ${currencyBannerLabel} )`;
              exportReconciliationToExcelFile(differences, matrizCxc, matrizCxp, movements, orderedEntities, label);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300/80 rounded-xl transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Descargar Excel</span>
          </button>

          {onOpenSaveModal && (
            <button
              onClick={onOpenSaveModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4 text-blue-100" />
              <span>Guardar Conciliación</span>
            </button>
          )}

          {isMonthClosed ? (
            <button
              type="button"
              onClick={onOpenCloseMonthModal}
              title={`Mes cerrado en ${scopeLabel}. Clic para consultar el cierre.`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-colors cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>Cerrado ({scopeLabel})</span>
            </button>
          ) : (
            onOpenCloseMonthModal && (
              <button
                type="button"
                onClick={onOpenCloseMonthModal}
                title={`Cerrar conciliación de ${scopeLabel} permanentemente`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-amber-700" />
                <span>Cerrar {scopeLabel}</span>
              </button>
            )
          )}

          {!readOnly && (
            <button
              onClick={onOpenGoogleSheets}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
              <span>Guardar en Google Sheets</span>
            </button>
          )}

          {onInspectDocuments && (
            <button
              type="button"
              onClick={() =>
                onInspectDocuments({
                  viewMode: 'documentos',
                  sociedad: 'ALL',
                  contraparte: 'ALL',
                  docStatusFilter: 'NO_CONCILIADOS',
                  directionScope: 'PAIR_BOTH',
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl transition-colors cursor-pointer"
            >
              <FileSearch className="w-4 h-4 text-amber-700" />
              <span>Documentos No Conciliados</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and stats banner */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por sociedad, contraparte o comentario..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status Filter Buttons */}
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-blue-600 text-white font-bold shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos ({differences.length})
            </button>

            <button
              onClick={() => setStatusFilter('DIFERENCIA')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'DIFERENCIA'
                  ? 'bg-amber-600 text-white font-bold shadow-2xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Con Diferencia ({countDiferencias})</span>
            </button>

            <button
              onClick={() => setStatusFilter('CONCILIADO')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'CONCILIADO'
                  ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Conciliados ({countConciliadas})</span>
            </button>
          </div>
        </div>

        {/* Multi-line email selection toolbar */}
        {selectedPairIds.length > 0 && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-blue-900 font-semibold">
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold">
                {selectedPairIds.length}
              </span>
              <span>
                {selectedPairIds.length === 1
                  ? 'línea con diferencia seleccionada para enviar por correo'
                  : 'líneas con diferencia seleccionadas para enviar en un solo correo'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedPairIds([])}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Limpiar selección
              </button>
              <button
                type="button"
                onClick={() => openEmailModalWithPairIds(selectedPairIds)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5 text-blue-100" />
                <span>Enviar Correo ({selectedPairIds.length})</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Differences Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/90 text-slate-700 font-semibold border-b border-slate-200/90 uppercase tracking-wider text-[11px]">
              <tr>
                <th
                  className="px-3 py-3.5 w-12 text-center"
                  title="Marca individualmente las diferencias que deseas enviar"
                >
                  Sel.
                </th>
                <th className="px-4 py-3.5 min-w-[180px]">Sociedad</th>
                <th className="px-4 py-3.5 min-w-[180px]">Contraparte</th>
                <th className="px-4 py-3.5 text-right min-w-[115px]">CxC</th>
                <th className="px-4 py-3.5 text-right min-w-[115px]">CxP</th>
                <th className="px-4 py-3.5 text-right min-w-[120px]">Diferencia</th>
                <th className="px-4 py-3.5 min-w-[155px]">Estado</th>
                <th className="px-4 py-3.5 min-w-[250px]">
                  {isMonthClosed
                    ? 'Comentario (Cerrado)'
                    : readOnly
                    ? 'Comentario (Solo Consulta)'
                    : 'Comentario Editable'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDifferences.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No se encontraron registros con los filtros actuales.
                  </td>
                </tr>
              ) : (
                filteredDifferences.map((row) => {
                  const isRowEditing = editingId === row.id;
                  const isReconciled = row.estado === 'conciliado';
                  const isJustSaved = justSavedId === row.id;
                  const isSelected = !isReconciled && selectedPairIdSet.has(row.id);

                  return (
                    <tr
                      key={row.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-blue-50/70 hover:bg-blue-50'
                          : isRowEditing
                          ? 'bg-blue-50/30 hover:bg-slate-50/80'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Checkbox only enabled on unreconciled global balances */}
                      <td className="px-3 py-3 text-center">
                        {isReconciled ? (
                          <span
                            className="text-[11px] text-slate-300 select-none"
                            title="Saldo global conciliado — no requiere envío de diferencia"
                          >
                            —
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePairSelection(row.id)}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            aria-label={`Seleccionar diferencia ${row.sociedad} vs ${row.contraparte}`}
                          />
                        )}
                      </td>

                      {/* Sociedad */}
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {row.sociedad}
                      </td>

                      {/* Contraparte */}
                      <td className="px-4 py-3 text-slate-700 font-medium">
                        {row.contraparte}
                      </td>

                      {/* CxC */}
                      <td className="px-4 py-3 text-right font-mono font-semibold text-blue-900">
                        {formatCurrency(row.cxc)}
                      </td>

                      {/* CxP */}
                      <td className="px-4 py-3 text-right font-mono font-semibold text-indigo-900">
                        {formatCurrency(row.cxp)}
                      </td>

                      {/* Diferencia: CxC - CxP */}
                      <td className="px-4 py-3 text-right font-mono font-bold">
                        <span
                          className={`${
                            isReconciled
                              ? 'text-emerald-600'
                              : row.diferencia > 0
                              ? 'text-amber-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {formatCurrency(row.diferencia)}
                        </span>
                      </td>

                      {/* Estado + Acceso directo a documentos + Correo por línea */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1.5">
                          <div className="flex items-center gap-1.5">
                            {isReconciled ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Cuadrado</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                <span>Diferencia</span>
                              </span>
                            )}

                            {!isReconciled && (
                              <button
                                type="button"
                                onClick={() => openEmailModalWithPairIds([row.id])}
                                title="Redactar correo para esta diferencia"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors cursor-pointer"
                              >
                                <Mail className="w-3 h-3" />
                                <span>Correo</span>
                              </button>
                            )}
                          </div>

                          {onInspectDocuments && (
                            <button
                              type="button"
                              onClick={() =>
                                onInspectDocuments({
                                  viewMode: 'documentos',
                                  sociedad: row.sociedad,
                                  contraparte: row.contraparte,
                                  docStatusFilter: isReconciled ? 'ALL' : 'NO_CONCILIADOS',
                                  directionScope: 'CXC_TO_CXP',
                                })
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
                            >
                              <FileSearch className="w-3 h-3" />
                              <span>{isReconciled ? 'Ver documentos' : 'Ver no conciliados'}</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Comentario Editable */}
                      <td className="px-4 py-3">
                        {isRowEditing && !isEditingLocked ? (
                          <div className="space-y-2">
                            <textarea
                              rows={2}
                              value={tempComment}
                              onChange={(e) => setTempComment(e.target.value)}
                              placeholder="Escribe el motivo o justificación de la diferencia..."
                              className="w-full p-2 text-xs border border-blue-400 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                              autoFocus
                            />

                            {/* Quick template snippets */}
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-[10px] text-slate-400 flex items-center gap-0.5 mr-1">
                                <Sparkles className="w-2.5 h-2.5" /> Plantillas:
                              </span>
                              {QUICK_TEMPLATES.map((tmpl, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleApplyTemplate(tmpl)}
                                  className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 hover:bg-blue-100 hover:text-blue-900 transition-colors"
                                >
                                  {tmpl}
                                </button>
                              ))}
                            </div>

                            <div className="flex items-center justify-end gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded-md"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveComment(row.id)}
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-2xs"
                              >
                                <Save className="w-3 h-3" />
                                <span>Guardar</span>
                              </button>
                            </div>
                          </div>
                        ) : isEditingLocked ? (
                          <div className="p-1.5 text-xs text-slate-600">
                            {row.comentario ? (
                              <p className="italic">"{row.comentario}"</p>
                            ) : (
                              <p className="text-slate-400 italic">
                                {isMonthClosed
                                  ? 'Sin comentario (Mes cerrado)'
                                  : 'Sin comentario (Solo Consulta)'}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2 group">
                            <div
                              onClick={() => handleStartEdit(row)}
                              className="flex-1 cursor-pointer min-h-[28px] p-1.5 rounded-lg hover:bg-blue-50/60 transition-colors"
                            >
                              {row.comentario ? (
                                <p className="text-xs text-slate-700 italic">
                                  "{row.comentario}"
                                </p>
                              ) : (
                                <p className="text-xs text-slate-400 italic flex items-center gap-1">
                                  <MessageSquare className="w-3 h-3 text-slate-300" />
                                  <span>Clic para agregar comentario...</span>
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {isJustSaved && (
                                <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                                  <Check className="w-3 h-3" />
                                  <span>Guardado</span>
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleStartEdit(row)}
                                className="opacity-0 group-hover:opacity-100 text-[11px] font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-all"
                              >
                                {row.comentario ? 'Editar' : 'Comentar'}
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Total Footer */}
            {filteredDifferences.length > 0 && (
              <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-xs">
                <tr>
                  <td colSpan={3} className="px-4 py-3.5 text-slate-900 font-sans uppercase">
                    Totales Conciliación ({filteredDifferences.length} pares)
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-blue-950">
                    {formatCurrency(totalCxc)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-indigo-950">
                    {formatCurrency(totalCxp)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-sm">
                    <span
                      className={`${
                        Math.abs(totalDiff) < 0.01
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {formatCurrency(totalDiff)}
                    </span>
                  </td>
                  <td colSpan={2} className="px-4 py-3.5 text-slate-500 font-normal">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {Math.abs(totalDiff) < 0.01
                          ? '✓ Cartera intercompany perfectamente compensada'
                          : 'Discrepancia neta consolidada'}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {onlyDifferencePairs.length > 0 && (
                          <button
                            type="button"
                            onClick={handleOpenEmailFromSelectionOrTotals}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-2xs transition-colors cursor-pointer"
                          >
                            <Mail className="w-3.5 h-3.5 text-blue-100" />
                            <span>
                              {selectedPairIds.length > 0
                                ? `Enviar Correo (${selectedPairIds.length} sel.)`
                                : 'Enviar Correo por Diferencias'}
                            </span>
                          </button>
                        )}
                        {onInspectDocuments && (Math.abs(totalDiff) >= 0.01 || onlyDifferencePairs.length > 0) && (
                          <button
                            type="button"
                            onClick={() =>
                              onInspectDocuments({
                                viewMode: 'documentos',
                                sociedad: 'ALL',
                                contraparte: 'ALL',
                                docStatusFilter: 'NO_CONCILIADOS',
                                directionScope: 'PAIR_BOTH',
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-[11px] transition-colors cursor-pointer"
                          >
                            <FileSearch className="w-3.5 h-3.5 text-amber-700" />
                            <span>Abrir documentos no conciliados</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Email Draft Modal */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-xs">
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-600/30 border border-blue-400/30">
                  <Mail className="w-5 h-5 text-blue-300" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">
                    Borrador de Correo — Diferencias y Documentos No Conciliados
                  </h4>
                  <p className="text-[11px] text-slate-300">
                    {activeEmailRows.length} línea(s) con diferencia y {activeUnreconciledDocs.length} documento(s) sin conciliar.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
                aria-label="Cerrar ventana"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              {/* Recipient Company (All Companies) + To + CC */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Enviar correo a (Todas las empresas)
                  </label>
                  <div className="relative">
                    <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <select
                      value={recipientCompany}
                      onChange={(e) => handleSelectRecipientCompany(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    >
                      {involvedCandidates.length > 0 && (
                        <optgroup label="Empresas en las diferencias seleccionadas">
                          {involvedCandidates.map((cand) => (
                            <option key={`inv-${cand.name}`} value={cand.name}>
                              {cand.name} — {cand.email || 'Sin correo registrado'}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {otherDirectoryCandidates.length > 0 && (
                        <optgroup label="Todas las demás empresas">
                          {otherDirectoryCandidates.map((cand) => (
                            <option key={`dir-${cand.name}`} value={cand.name}>
                              {cand.name} — {cand.email || 'Sin correo registrado'}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Correo destinatario (Para)
                  </label>
                  <input
                    type="email"
                    value={emailTo}
                    onChange={(e) => {
                      setEmailTo(e.target.value);
                      setIsBodyEditedManually(false);
                    }}
                    placeholder="nombre.apellido@empresa.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* CC Field + Quick Directory Add */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <span>Con copia (CC) — opcional</span>
                  </label>
                  <input
                    type="text"
                    value={emailCc}
                    onChange={(e) => setEmailCc(e.target.value)}
                    placeholder="persona1@empresa.com, persona2@empresa.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Agregar copia desde empresas registradas
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) handleAddCcFromDirectory(e.target.value);
                    }}
                    disabled={allDirectoryWithEmail.length === 0}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    <option value="">
                      {allDirectoryWithEmail.length === 0
                        ? 'No hay correos guardados en Empresas a Conciliar'
                        : '+ Seleccionar contacto para agregar a CC...'}
                    </option>
                    {allDirectoryWithEmail.map((cand) => (
                      <option key={`cc-${cand.name}`} value={cand.email}>
                        {cand.name} ({cand.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Editable Subject */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Asunto
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Discretionary Differences Selection inside Modal */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-800">
                    Diferencias a incluir en el correo (a discreción: {activeEmailRows.length} de {onlyDifferencePairs.length})
                  </span>
                  {modalPairIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setModalPairIds([]);
                        setIsBodyEditedManually(false);
                      }}
                      className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer"
                    >
                      Desmarcar todas
                    </button>
                  )}
                </div>

                <div className="max-h-36 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-1.5 pr-1">
                  {onlyDifferencePairs.map((pair) => {
                    const checked = modalPairIdSet.has(pair.id);
                    return (
                      <label
                        key={`modal-pair-${pair.id}`}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer transition-colors ${
                          checked
                            ? 'bg-blue-50 border-blue-300 text-slate-900 font-semibold'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              toggleModalPair(pair.id);
                              setIsBodyEditedManually(false);
                            }}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                          />
                          <span className="truncate">
                            {pair.sociedad} &rarr; {pair.contraparte}
                          </span>
                        </span>
                        <span className="font-mono font-bold text-amber-700 shrink-0">
                          {formatCurrency(pair.diferencia)}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {docsForActivePairs.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-700">
                        Facturas no conciliadas incluidas ({activeUnreconciledDocs.length} de {docsForActivePairs.length})
                      </span>
                      {excludedDocIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setExcludedDocIds([]);
                            setIsBodyEditedManually(false);
                          }}
                          className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
                        >
                          Incluir todas las facturas
                        </button>
                      )}
                    </div>
                    <div className="max-h-28 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-1.5 pr-1">
                      {docsForActivePairs.map((doc) => {
                        const included = !excludedDocIdSet.has(doc.id);
                        return (
                          <label
                            key={`modal-doc-${doc.id}`}
                            className={`flex items-center justify-between gap-2 px-2.5 py-1 rounded-md border text-[11px] cursor-pointer transition-colors ${
                              included
                                ? 'bg-white border-slate-200 text-slate-800'
                                : 'bg-slate-100 border-slate-200 text-slate-400 line-through'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={included}
                                onChange={() => {
                                  toggleModalDocument(doc.id);
                                  setIsBodyEditedManually(false);
                                }}
                                className="w-3 h-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                              />
                              <span className="truncate">
                                {doc.facturaDisplay} ({doc.sociedad} &rarr; {doc.contraparte})
                              </span>
                            </span>
                            <span className="font-mono font-semibold text-rose-700 shrink-0">
                              {formatCurrency(doc.diferencia)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Editable Plain-Text Body sent directly to Gmail */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">
                    Cuerpo del correo (se carga directo en Gmail)
                  </label>
                  {isBodyEditedManually && (
                    <button
                      type="button"
                      onClick={() => setIsBodyEditedManually(false)}
                      className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
                    >
                      Restablecer texto automático
                    </button>
                  )}
                </div>
                <textarea
                  rows={11}
                  value={emailBody}
                  onChange={(e) => {
                    setEmailBody(e.target.value);
                    setIsBodyEditedManually(true);
                  }}
                  className="w-full p-3 border border-slate-300 rounded-xl font-[Arial,Helvetica,sans-serif] text-[13px] leading-relaxed text-slate-800 bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
                {activeEmailRows.length === 0 && (
                  <p className="mt-1.5 text-[11px] text-amber-700 font-semibold">
                    Marca al menos una diferencia en la lista superior para incluir su detalle en el borrador.
                  </p>
                )}
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
              <a
                href={gmailComposeUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={activeEmailRows.length === 0}
                onClick={(e) => {
                  if (activeEmailRows.length === 0) {
                    e.preventDefault();
                    return;
                  }
                  recordEmailNotificationNotes();
                }}
                className={`inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-sm transition-colors ${
                  activeEmailRows.length === 0
                    ? 'bg-slate-400 cursor-not-allowed opacity-70'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                }`}
              >
                <Mail className="w-4 h-4 text-blue-100" />
                <span>Abrir Borrador en Gmail</span>
                <ExternalLink className="w-3.5 h-3.5 text-blue-100" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
