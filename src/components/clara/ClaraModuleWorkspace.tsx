import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FileJson,
  FileScan,
  FileSpreadsheet,
  FileText,
  Globe,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  ActiveModuleId,
  ClaraBatchExportLog,
  ClaraCostCenterRule,
  ClaraTab,
  ClaraTransaction,
  ClaraVendor,
  ClaraWorkManagerInvoice,
  ClaraWorkManagerRadicacionStatus,
  ClaraWorkManagerStatus,
  ClaraWorkspaceData,
  EffectivePermissions,
  ModuleCompanyEntry,
} from '../../types';
import {
  applyExtractedInvoiceToTransaction,
  buildSapBotDispatchPackage,
  detectIsForeignExpense,
  detectPendingVendorCandidates,
  downloadClaraImportTemplate,
  downloadSapBotPackageJson,
  downloadSapBotPackageTxt,
  downloadWmPendingForPythonJson,
  downloadWorkManagerImportTemplate,
  evaluateClaraInvoiceCuadre,
  evaluateTransactionReadiness,
  exportAccountingBatchExcel,
  exportPendingVendorsExcel,
  findBestTxForExtractedInvoice,
  findMatchingVendor,
  formatClaraMoney,
  normalizeTextKey,
  parseClaraPythonPayload,
  parseClaraSpreadsheetFile,
  parseWorkManagerSpreadsheetFile,
  reconcileClaraState,
} from '../../utils/clara';
import {
  dispatchSapPackageToLocalAgent,
  extractClaraInvoiceFile,
  LocalAgentHealthResponse,
  openLocalAgentSession,
  pingLocalAgent,
  probeCorporatePortalsFromServer,
  runLocalAgentClaraExtract,
  runLocalAgentWmCheck,
  ServerConnectivityProbeResult,
} from '../../services/claraAi';
import {
  AgentDownloadKey,
  downloadAgentTemplateFile,
  getAgentTemplateSpec,
} from '../../utils/claraAgentTemplates';
import { ClaraSidebar } from './ClaraSidebar';
import { ClaraHeader } from './ClaraHeader';

interface ClaraModuleWorkspaceProps {
  data: ClaraWorkspaceData;
  onUpdateData: (
    updater: (prev: ClaraWorkspaceData) => ClaraWorkspaceData,
    markUnsaved?: boolean
  ) => void;
  onSaveToCloud: (overrideData?: ClaraWorkspaceData) => Promise<void>;
  currentUser: User | null;
  onSignInWithGoogle: () => void;
  onSignOut: () => void;
  onSwitchModule: (moduleId: ActiveModuleId) => void;
  permissions: EffectivePermissions;
  moduleCompanies: ModuleCompanyEntry[];
}

function getEffectiveWmStatus(tx: ClaraTransaction): ClaraWorkManagerRadicacionStatus {
  if (tx.origenGasto === 'exterior' || tx.workManagerStatus === 'exenta_exterior') {
    return 'exenta_exterior';
  }
  if (tx.wmRadicacionStatus) return tx.wmRadicacionStatus;
  if (tx.workManagerStatus === 'validada') return 'radicada';
  if (tx.workManagerStatus === 'diferencia_valor') return 'inconsistencia';
  return tx.facturaNumero ? 'no_radicada' : 'pendiente';
}

export const ClaraModuleWorkspace: React.FC<ClaraModuleWorkspaceProps> = ({
  data,
  onUpdateData,
  onSaveToCloud,
  currentUser,
  onSignInWithGoogle,
  onSignOut,
  onSwitchModule,
  permissions,
  moduleCompanies,
}) => {
  const [activeTab, setActiveTab] = useState<ClaraTab>('bandeja');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSavingCloud, setIsSavingCloud] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CUADRA' | 'PENDIENTE' | 'ALERTA'>('ALL');
  const [wmFilter, setWmFilter] = useState<'ALL' | ClaraWorkManagerRadicacionStatus>('ALL');
  const [bannerFeedback, setBannerFeedback] = useState<{
    type: 'ok' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Batch Gemini AI invoice reader state
  const [batchTargetTxId, setBatchTargetTxId] = useState<string>('AUTO');
  const [isScanningInvoices, setIsScanningInvoices] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; file: string } | null>(
    null
  );

  // Client-only preview ObjectURLs (never stored in Firestore)
  const [invoicePreviewUrls, setInvoicePreviewUrls] = useState<Record<string, string>>({});
  const previewUrlsRef = useRef<Record<string, string>>({});
  useEffect(() => {
    previewUrlsRef.current = invoicePreviewUrls;
  }, [invoicePreviewUrls]);
  useEffect(() => {
    return () => {
      Object.values(previewUrlsRef.current).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  // Detail/Edit Drawer Modal for a transaction
  const [editingTxId, setEditingTxId] = useState<string | null>(null);

  // Manual new expense modal
  const [showAddTxModal, setShowAddTxModal] = useState(false);
  const [newTxForm, setNewTxForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    sociedad: moduleCompanies[0]?.nombre || 'PREMEX',
    tarjetahabiente: permissions.displayName || '',
    comercio: '',
    nitComercio: '',
    moneda: 'COP',
    valor: '',
    centroCosto: data.costCenterRules[0]?.centroCostoClara || '',
    observacion: '',
  });

  // New cost center rule form
  const [newRuleForm, setNewRuleForm] = useState({
    sociedad: moduleCompanies[0]?.nombre || 'PREMEX',
    centroCostoClara: '',
    codigoCentroCostoErp: '',
    sociedadSap: data.connectorConfig.sapSociedadDefault || '1000',
    cuentaContableDefault: '5195250001',
  });

  // Local RPA Agent strictly in-memory credentials (NEVER saved to Firestore or localStorage)
  const [agentBearerToken, setAgentBearerToken] = useState('');
  const [agentHealth, setAgentHealth] = useState<LocalAgentHealthResponse | null>(null);
  const [agentBusyAction, setAgentBusyAction] = useState<string | null>(null);
  const [probeResults, setProbeResults] = useState<ServerConnectivityProbeResult[]>([]);
  const [isProbingServer, setIsProbingServer] = useState(false);

  // Python RPA kit preview / copy modal
  const [showPythonKitModal, setShowPythonKitModal] = useState(false);
  const [selectedPythonKey, setSelectedPythonKey] = useState<AgentDownloadKey>('python_agent_py');
  const [copiedPythonCode, setCopiedPythonCode] = useState(false);

  const claraFileInputRef = useRef<HTMLInputElement>(null);
  const wmFileInputRef = useRef<HTMLInputElement>(null);
  const batchInvoicesInputRef = useRef<HTMLInputElement>(null);
  const singleInvoiceInputRef = useRef<HTMLInputElement>(null);
  const sapResultsInputRef = useRef<HTMLInputElement>(null);
  const pythonJsonInputRef = useRef<HTMLInputElement>(null);

  const actorName = permissions.displayName || currentUser?.email || 'Usuario Premex';

  const availablePeriods = useMemo(() => {
    const set = new Set<string>();
    data.transactions.forEach((t) => {
      if (t.fecha && t.fecha.length >= 7) set.add(t.fecha.slice(0, 7));
    });
    return Array.from(set).sort().reverse();
  }, [data.transactions]);

  const scopedTransactions = useMemo(() => {
    return data.transactions.filter((tx) => {
      if (data.selectedPeriod !== 'ALL' && !tx.fecha.startsWith(data.selectedPeriod)) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = normalizeTextKey(searchQuery);
      return (
        normalizeTextKey(tx.comercio).includes(q) ||
        normalizeTextKey(tx.tarjetahabiente).includes(q) ||
        normalizeTextKey(tx.observacion).includes(q) ||
        normalizeTextKey(tx.facturaNumero).includes(q) ||
        normalizeTextKey(tx.claraTxId).includes(q) ||
        normalizeTextKey(tx.nitComercio || tx.facturaNit).includes(q)
      );
    });
  }, [data.transactions, data.selectedPeriod, searchQuery]);

  const filteredBandejaTxs = useMemo(() => {
    if (statusFilter === 'ALL') return scopedTransactions;
    return scopedTransactions.filter((tx) => {
      const cuadre = tx.facturaCuadreEstado || evaluateClaraInvoiceCuadre(tx, data.connectorConfig.toleranciaCruceMonto).status;
      if (statusFilter === 'CUADRA') return cuadre === 'cuadra_ok';
      if (statusFilter === 'PENDIENTE') return cuadre === 'sin_soporte';
      return cuadre === 'diferencia_monto' || cuadre === 'error_aritmetico';
    });
  }, [scopedTransactions, statusFilter, data.connectorConfig.toleranciaCruceMonto]);

  const filteredWmTxs = useMemo(() => {
    if (wmFilter === 'ALL') return scopedTransactions;
    return scopedTransactions.filter((tx) => getEffectiveWmStatus(tx) === wmFilter);
  }, [scopedTransactions, wmFilter]);

  const missingVendors = useMemo(
    () => detectPendingVendorCandidates(scopedTransactions, data.vendors),
    [scopedTransactions, data.vendors]
  );

  const metrics = useMemo(() => {
    const total = scopedTransactions.length;
    const withInvoice = scopedTransactions.filter((t) => Boolean(t.facturaNumero || (t.facturaTotal && t.facturaTotal > 0))).length;
    const cuadreOk = scopedTransactions.filter((t) => {
      const st = t.facturaCuadreEstado || evaluateClaraInvoiceCuadre(t, data.connectorConfig.toleranciaCruceMonto).status;
      return st === 'cuadra_ok';
    }).length;
    const alerts = scopedTransactions.filter((t) => {
      const st = t.facturaCuadreEstado || evaluateClaraInvoiceCuadre(t, data.connectorConfig.toleranciaCruceMonto).status;
      return st === 'diferencia_monto' || st === 'error_aritmetico';
    }).length;

    const wmCounts = {
      radicada: 0,
      no_radicada: 0,
      inconsistencia: 0,
      pendiente: 0,
      exenta_exterior: 0,
    };
    scopedTransactions.forEach((t) => {
      wmCounts[getEffectiveWmStatus(t)] += 1;
    });

    const sapReady = scopedTransactions.filter((t) => {
      const wm = getEffectiveWmStatus(t);
      const ready = evaluateTransactionReadiness(t, data.vendors).ready;
      return (wm === 'radicada' || wm === 'exenta_exterior') && ready && t.sapDespachoEstado !== 'contabilizado';
    }).length;
    const sapPosted = scopedTransactions.filter((t) => t.sapDespachoEstado === 'contabilizado').length;

    return { total, withInvoice, cuadreOk, alerts, wmCounts, sapReady, sapPosted };
  }, [scopedTransactions, data.vendors, data.connectorConfig.toleranciaCruceMonto]);

  const appendLogAndReconcile = (
    updater: (prev: ClaraWorkspaceData) => {
      next: ClaraWorkspaceData;
      log?: Omit<ClaraBatchExportLog, 'id' | 'createdAtIso' | 'createdBy'>;
    }
  ) => {
    onUpdateData((prev) => {
      const { next, log } = updater(prev);
      const reconciled = reconcileClaraState({
        transactions: next.transactions,
        workManagerInvoices: next.workManagerInvoices,
        vendors: next.vendors,
        costCenterRules: next.costCenterRules,
        connectorConfig: next.connectorConfig,
      });
      const logs = log
        ? [
            {
              id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              createdAtIso: new Date().toISOString(),
              createdBy: actorName,
              ...log,
            },
            ...next.batchLogs,
          ].slice(0, 180)
        : next.batchLogs;

      return {
        ...next,
        transactions: reconciled.transactions,
        workManagerInvoices: reconciled.workManagerInvoices,
        batchLogs: logs,
      };
    }, true);
  };

  const handleSaveCloudClick = async () => {
    setIsSavingCloud(true);
    try {
      await onSaveToCloud();
      setBannerFeedback({
        type: 'ok',
        text: 'Espacio de trabajo Clara · WM · SAP guardado correctamente en Firestore.',
      });
    } catch (err: any) {
      setBannerFeedback({
        type: 'error',
        text: err?.message || 'No se pudo guardar en la nube.',
      });
    } finally {
      setIsSavingCloud(false);
    }
  };

  const handleReconcileAll = () => {
    appendLogAndReconcile((prev) => ({
      next: prev,
      log: {
        erp: 'WorkManager',
        tipo: 'rpa_wm',
        cantidadRegistros: prev.transactions.length,
        totalMonto: prev.transactions.reduce((s, t) => s + (Number(t.valor) || 0), 0),
        moneda: prev.transactions[0]?.moneda || 'COP',
        archivoNombre: 'Cruce automático Clara ↔ Facturas IA ↔ WM',
        estado: 'ok',
        detalle: 'Reglas de centros de costo, terceros, cuadre y radicaciones WM recalculadas.',
      },
    }));
    setBannerFeedback({
      type: 'ok',
      text: 'Cruces recalculados entre Clara, facturas IA, Work Manager y reglas SAP.',
    });
  };

  // Import Clara Excel/CSV
  const handleImportClaraFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const imported = await parseClaraSpreadsheetFile(
        file,
        moduleCompanies[0]?.nombre || 'PREMEX',
        data.connectorConfig.detectarExteriorAutomatico
      );
      if (imported.length === 0) {
        setBannerFeedback({
          type: 'error',
          text: 'No se encontraron movimientos válidos en el archivo de Clara.',
        });
        return;
      }
      const sapImported = imported.map((t) => ({ ...t, erpDestino: 'SAP' as const }));
      appendLogAndReconcile((prev) => ({
        next: {
          ...prev,
          transactions: [...sapImported, ...prev.transactions],
        },
        log: {
          erp: 'Clara',
          tipo: 'rpa_clara',
          cantidadRegistros: sapImported.length,
          totalMonto: sapImported.reduce((s, t) => s + t.valor, 0),
          moneda: sapImported[0]?.moneda || 'COP',
          archivoNombre: file.name,
          estado: 'ok',
          detalle: `${sapImported.length} movimientos importados desde extracto Clara.`,
        },
      }));
      setBannerFeedback({
        type: 'ok',
        text: `Se importaron ${sapImported.length} movimientos de Clara (${file.name}).`,
      });
    } catch (err: any) {
      setBannerFeedback({
        type: 'error',
        text: err?.message || 'Error al leer el archivo de Clara.',
      });
    }
  };

  // Import Work Manager Excel/CSV
  const handleImportWmFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const imported = await parseWorkManagerSpreadsheetFile(
        file,
        moduleCompanies[0]?.nombre || 'PREMEX'
      );
      if (imported.length === 0) {
        setBannerFeedback({
          type: 'error',
          text: 'No se detectaron facturas válidas en el reporte de Work Manager.',
        });
        return;
      }
      appendLogAndReconcile((prev) => ({
        next: {
          ...prev,
          workManagerInvoices: [...imported, ...prev.workManagerInvoices],
        },
        log: {
          erp: 'WorkManager',
          tipo: 'rpa_wm',
          cantidadRegistros: imported.length,
          totalMonto: imported.reduce((s, i) => s + i.total, 0),
          moneda: imported[0]?.moneda || 'COP',
          archivoNombre: file.name,
          estado: 'ok',
          detalle: `${imported.length} facturas radicadas cargadas y cruzadas contra Clara.`,
        },
      }));
      setBannerFeedback({
        type: 'ok',
        text: `Se cargaron ${imported.length} facturas de Work Manager y se ejecutó el cruce automático.`,
      });
    } catch (err: any) {
      setBannerFeedback({
        type: 'error',
        text: err?.message || 'Error leyendo archivo de Work Manager.',
      });
    }
  };

  // Batch Gemini AI Invoice Extraction
  const handleBatchInvoiceFiles = async (files: FileList | null, forcedTxId?: string) => {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files);
    setIsScanningInvoices(true);
    let processedCount = 0;
    let matchedCount = 0;
    const errors: string[] = [];

    const workingTxs = [...data.transactions];
    const tolerance = data.connectorConfig.toleranciaCruceMonto;
    const newPreviewMap: Record<string, string> = {};

    for (let i = 0; i < fileArr.length; i++) {
      const file = fileArr[i];
      setScanProgress({ current: i + 1, total: fileArr.length, file: file.name });

      const targetId = forcedTxId || (batchTargetTxId !== 'AUTO' ? batchTargetTxId : undefined);
      const hintTx = targetId ? workingTxs.find((t) => t.id === targetId) : undefined;

      try {
        const extracted = await extractClaraInvoiceFile({
          file,
          expectedCurrency: hintTx?.moneda,
          expectedAmount: hintTx?.valor,
          expectedMerchant: hintTx?.comercio,
        });
        processedCount += 1;

        let matchedTx =
          hintTx || findBestTxForExtractedInvoice(extracted, file.name, workingTxs, tolerance);

        if (matchedTx) {
          const updatedTx = applyExtractedInvoiceToTransaction(matchedTx, extracted, file.name, tolerance);
          const idx = workingTxs.findIndex((t) => t.id === matchedTx!.id);
          if (idx >= 0) workingTxs[idx] = updatedTx;
          newPreviewMap[matchedTx.id] = URL.createObjectURL(file);
          matchedCount += 1;
        } else {
          // Create new transaction row directly from extracted invoice when no existing movement matches
          const createdId = `clara-ai-${Date.now()}-${i}`;
          const foreignCheck = data.connectorConfig.detectarExteriorAutomatico
            ? detectIsForeignExpense({
                moneda: extracted.moneda,
                comercio: extracted.razonSocialEmisor,
              })
            : { isForeign: false };

          const newTx: ClaraTransaction = applyExtractedInvoiceToTransaction(
            {
              id: createdId,
              claraTxId: `IA-${Date.now().toString().slice(-4)}-${i + 1}`,
              fecha: extracted.fechaFactura || new Date().toISOString().slice(0, 10),
              sociedad: moduleCompanies[0]?.nombre || 'PREMEX',
              tarjetahabiente: extracted.consultorTitular || permissions.displayName || 'Por asignar',
              comercio: extracted.razonSocialEmisor || file.name,
              nitComercio: extracted.nitEmisor,
              pais: foreignCheck.isForeign ? 'Exterior' : 'Colombia',
              moneda: extracted.moneda || 'COP',
              valor: extracted.total || 0,
              centroCosto: extracted.centroCostoSugerido || '',
              observacion: extracted.descripcionSugerida || `Factura ${extracted.numeroFactura}`,
              estadoClara: 'Autorizada',
              origenGasto: foreignCheck.isForeign ? 'exterior' : 'nacional',
              motivoExterior: foreignCheck.reason,
              workManagerStatus: foreignCheck.isForeign ? 'exenta_exterior' : 'pendiente_factura',
              erpDestino: 'SAP',
              estadoContable: 'borrador',
              origenRegistro: 'manual',
            },
            extracted,
            file.name,
            tolerance
          );
          workingTxs.unshift(newTx);
          newPreviewMap[createdId] = URL.createObjectURL(file);
          matchedCount += 1;
        }
      } catch (err: any) {
        errors.push(`${file.name}: ${err?.message || 'Error de lectura'}`);
      }
    }

    if (Object.keys(newPreviewMap).length > 0) {
      setInvoicePreviewUrls((prev) => ({ ...prev, ...newPreviewMap }));
    }

    appendLogAndReconcile((prev) => ({
      next: {
        ...prev,
        transactions: workingTxs,
      },
      log: {
        erp: 'Clara',
        tipo: 'rpa_clara',
        cantidadRegistros: processedCount,
        totalMonto: workingTxs.slice(0, processedCount).reduce((s, t) => s + (Number(t.valor) || 0), 0),
        moneda: workingTxs[0]?.moneda || 'COP',
        archivoNombre: `Lectura IA (${fileArr.length} facturas)`,
        estado: errors.length > 0 ? 'alerta' : 'ok',
        detalle:
          errors.length > 0
            ? `${matchedCount}/${fileArr.length} procesadas. Alertas: ${errors[0]}`
            : `${matchedCount} facturas leídas con Gemini IA y validadas en cuadre.`,
      },
    }));

    setIsScanningInvoices(false);
    setScanProgress(null);

    if (errors.length > 0) {
      setBannerFeedback({
        type: matchedCount > 0 ? 'info' : 'error',
        text: `Lectura IA: ${matchedCount} de ${fileArr.length} facturas procesadas. Error: ${errors[0]}`,
      });
    } else {
      setBannerFeedback({
        type: 'ok',
        text: `Lectura IA completada: ${matchedCount} factura(s) extraída(s) y cuadradas.`,
      });
    }
  };

  // Manual transaction add
  const handleCreateManualTx = (e: React.FormEvent) => {
    e.preventDefault();
    const valorNum = Number(newTxForm.valor);
    if (!newTxForm.comercio.trim() || !Number.isFinite(valorNum) || valorNum <= 0) {
      setBannerFeedback({ type: 'error', text: 'Ingresa comercio y valor válido.' });
      return;
    }
    const autoForeign = data.connectorConfig.detectarExteriorAutomatico
      ? detectIsForeignExpense({
          moneda: newTxForm.moneda,
          comercio: newTxForm.comercio,
          sociedad: newTxForm.sociedad,
        })
      : { isForeign: false };

    const created: ClaraTransaction = {
      id: `clara-man-${Date.now()}`,
      claraTxId: `CLR-MAN-${Date.now().toString().slice(-5)}`,
      fecha: newTxForm.fecha,
      sociedad: newTxForm.sociedad,
      tarjetahabiente: newTxForm.tarjetahabiente || actorName,
      comercio: newTxForm.comercio.trim(),
      nitComercio: newTxForm.nitComercio.trim(),
      pais: autoForeign.isForeign ? 'Exterior' : 'Colombia',
      moneda: newTxForm.moneda,
      valor: valorNum,
      centroCosto: newTxForm.centroCosto.trim(),
      observacion: newTxForm.observacion.trim() || `Gasto en ${newTxForm.comercio.trim()}`,
      estadoClara: 'Autorizada',
      origenGasto: autoForeign.isForeign ? 'exterior' : 'nacional',
      motivoExterior: autoForeign.reason,
      workManagerStatus: autoForeign.isForeign ? 'exenta_exterior' : 'pendiente_factura',
      erpDestino: 'SAP',
      estadoContable: 'borrador',
      origenRegistro: 'manual',
    };

    appendLogAndReconcile((prev) => ({
      next: { ...prev, transactions: [created, ...prev.transactions] },
    }));
    setShowAddTxModal(false);
    setNewTxForm((f) => ({ ...f, comercio: '', nitComercio: '', valor: '', observacion: '' }));
    setBannerFeedback({ type: 'ok', text: `Gasto manual ${created.claraTxId} agregado.` });
  };

  // Server connectivity probe (/api/clara/probe)
  const handleRunServerProbe = async () => {
    setIsProbingServer(true);
    try {
      const res = await probeCorporatePortalsFromServer('all');
      setProbeResults(res.results);
      const summary = res.results
        .map((r) => `${r.target.toUpperCase()}: ${r.reachable ? `HTTP ${r.httpStatus}` : 'Bloqueado/VPN'}`)
        .join(' · ');
      onUpdateData(
        (prev) => ({
          ...prev,
          connectorConfig: {
            ...prev.connectorConfig,
            lastServerProbeIso: res.checkedAtIso,
            lastServerProbeSummary: summary,
          },
        }),
        true
      );
      setBannerFeedback({ type: 'info', text: `Diagnóstico de red completado: ${summary}` });
    } catch (err: any) {
      setBannerFeedback({ type: 'error', text: err?.message || 'Error en diagnóstico de red.' });
    } finally {
      setIsProbingServer(false);
    }
  };

  // Local Agent handlers
  const agentUrl = data.connectorConfig.agentUrl || 'http://127.0.0.1:4780';

  const handleTestLocalAgent = async () => {
    setAgentBusyAction('health');
    try {
      const health = await pingLocalAgent(agentUrl, agentBearerToken);
      setAgentHealth(health);
      setBannerFeedback({
        type: 'ok',
        text: `Agente Puente Local conectado (${health.agent} v${health.version}).`,
      });
    } catch (err: any) {
      setAgentHealth(null);
      setBannerFeedback({
        type: 'error',
        text: err?.message || 'No se pudo conectar al Agente Puente Local en 127.0.0.1:4780.',
      });
    } finally {
      setAgentBusyAction(null);
    }
  };

  const handleOpenAgentBrowserSession = async (target: 'clara' | 'workmanager') => {
    setAgentBusyAction(`open_${target}`);
    try {
      const res = await openLocalAgentSession(agentUrl, agentBearerToken, target);
      setBannerFeedback({ type: 'ok', text: res.message });
    } catch (err: any) {
      setBannerFeedback({ type: 'error', text: err?.message || 'Error abriendo sesión.' });
    } finally {
      setAgentBusyAction(null);
    }
  };

  const handleAgentCheckWorkManager = async () => {
    const candidates = scopedTransactions.filter(
      (t) =>
        t.origenGasto !== 'exterior' &&
        (t.facturaNumero || t.workManagerNumeroFactura)
    );
    if (candidates.length === 0) {
      setBannerFeedback({
        type: 'error',
        text: 'Primero extrae o ingresa el número de factura de los gastos nacionales a verificar.',
      });
      return;
    }
    setAgentBusyAction('wm_check');
    try {
      const payload = candidates.map((t) => ({
        txId: t.id,
        numeroFactura: t.facturaNumero || t.workManagerNumeroFactura || '',
        nitEmisor: t.facturaNit || t.nitComercio || '',
        total: t.facturaTotal || t.valor,
        fecha: t.facturaFecha || t.fecha,
      }));
      const res = await runLocalAgentWmCheck(agentUrl, agentBearerToken, payload);
      const mapByTx = new Map(res.results.map((r) => [r.txId, r]));

      appendLogAndReconcile((prev) => ({
        next: {
          ...prev,
          transactions: prev.transactions.map((tx) => {
            const r = mapByTx.get(tx.id);
            if (!r) return tx;
            return {
              ...tx,
              wmRadicacionStatus: r.estado,
              wmRadicacionNumero: r.numeroFactura || tx.wmRadicacionNumero,
              wmRadicacionFecha: r.radicacionFecha || tx.wmRadicacionFecha,
              wmMensajeValidacion: r.mensaje,
              workManagerStatus:
                r.estado === 'radicada'
                  ? 'validada'
                  : r.estado === 'inconsistencia'
                  ? 'diferencia_valor'
                  : 'pendiente_factura',
            };
          }),
        },
        log: {
          erp: 'WorkManager',
          tipo: 'rpa_wm',
          cantidadRegistros: res.results.length,
          totalMonto: candidates.reduce((s, t) => s + t.valor, 0),
          moneda: candidates[0]?.moneda || 'COP',
          archivoNombre: 'Verificación RPA Work Manager (:8037)',
          estado: 'ok',
          detalle: `${res.results.filter((r) => r.estado === 'radicada').length} radicadas confirmadas vía Agente.`,
        },
      }));
      setBannerFeedback({
        type: 'ok',
        text: `Verificación Work Manager (:8037) completada para ${res.results.length} factura(s).`,
      });
    } catch (err: any) {
      setBannerFeedback({ type: 'error', text: err?.message || 'Error consultando Work Manager.' });
    } finally {
      setAgentBusyAction(null);
    }
  };

  const handleAgentExtractClaraRows = async () => {
    setAgentBusyAction('clara_extract');
    try {
      const res = await runLocalAgentClaraExtract(agentUrl, agentBearerToken, data.selectedPeriod);
      const parsed = parseClaraPythonPayload(
        { transactions: res.transactions, rows: res.rows },
        {
          defaultSociedad: moduleCompanies[0]?.nombre || 'PREMEX',
          detectExteriorAuto: data.connectorConfig.detectarExteriorAutomatico,
        }
      );

      let addedCount = 0;
      appendLogAndReconcile((prev) => {
        const existingIds = new Set(prev.transactions.map((t) => t.claraTxId).filter(Boolean));
        const newTxs = parsed.transactions.filter(
          (t) => !t.claraTxId || !existingIds.has(t.claraTxId)
        );
        addedCount = newTxs.length;
        return {
          next: {
            ...prev,
            transactions: [...newTxs, ...prev.transactions],
          },
          log: {
            erp: 'Clara',
            tipo: 'rpa_clara',
            cantidadRegistros: addedCount || res.rawTableRowsCount,
            totalMonto: newTxs.reduce((s, t) => s + t.valor, 0),
            moneda: newTxs[0]?.moneda || 'COP',
            archivoNombre: `Extracción Clara vía Agente (${res.engine || 'Playwright'})`,
            estado: addedCount > 0 || res.rawTableRowsCount > 0 ? 'ok' : 'alerta',
            detalle:
              addedCount > 0
                ? `${addedCount} movimiento(s) nuevos importados desde Clara vía Agente Local.`
                : `${res.rawTableRowsCount} fila(s) detectadas en tabla Clara.`,
          },
        };
      });

      setBannerFeedback({
        type: addedCount > 0 ? 'ok' : 'info',
        text:
          addedCount > 0
            ? `Agente (${res.engine || 'RPA'}) extrajo e importó ${addedCount} movimiento(s) de Clara automáticamente.`
            : `Agente detectó ${res.rawTableRowsCount} fila(s) en la vista de Clara (sin registros nuevos por importar).`,
      });
    } catch (err: any) {
      setBannerFeedback({ type: 'error', text: err?.message || 'Error extrayendo desde Clara.' });
    } finally {
      setAgentBusyAction(null);
    }
  };

  // Import JSON generated by standalone Python script (clara_wm_extraccion.json / wm_resultados_python.json)
  const handleImportPythonJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const rawText = await file.text();
      const jsonObj = JSON.parse(rawText);
      const parsed = parseClaraPythonPayload(jsonObj, {
        defaultSociedad: moduleCompanies[0]?.nombre || 'PREMEX',
        detectExteriorAuto: data.connectorConfig.detectarExteriorAutomatico,
      });

      if (parsed.transactions.length === 0 && parsed.wmResults.length === 0) {
        setBannerFeedback({
          type: 'error',
          text: 'El JSON no contiene transactions[], rows[] ni results[] de Python válidos.',
        });
        return;
      }

      let addedTxs = 0;
      let updatedWm = 0;

      appendLogAndReconcile((prev) => {
        const existingIds = new Set(prev.transactions.map((t) => t.claraTxId).filter(Boolean));
        const newTxs = parsed.transactions.filter(
          (t) => !t.claraTxId || !existingIds.has(t.claraTxId)
        );
        addedTxs = newTxs.length;

        const wmByTxId = new Map(
          parsed.wmResults.filter((r) => r.txId).map((r) => [String(r.txId), r])
        );
        const wmByFactura = new Map(
          parsed.wmResults
            .filter((r) => r.numeroFactura)
            .map((r) => [String(r.numeroFactura).toUpperCase(), r])
        );

        const mergedTxs = [...newTxs, ...prev.transactions].map((tx): ClaraTransaction => {
          const match =
            wmByTxId.get(tx.id) ||
            (tx.facturaNumero ? wmByFactura.get(tx.facturaNumero.toUpperCase()) : undefined);
          if (!match) return tx;
          updatedWm += 1;
          const nextWorkManagerStatus: ClaraWorkManagerStatus =
            match.estado === 'radicada'
              ? 'validada'
              : match.estado === 'inconsistencia'
              ? 'diferencia_valor'
              : match.estado === 'exenta_exterior'
              ? 'exenta_exterior'
              : 'pendiente_factura';
          return {
            ...tx,
            wmRadicacionStatus: match.estado,
            wmRadicacionNumero: match.numeroFactura || tx.wmRadicacionNumero,
            wmRadicacionFecha: match.radicacionFecha || tx.wmRadicacionFecha,
            wmMensajeValidacion: match.mensaje || tx.wmMensajeValidacion,
            workManagerStatus: nextWorkManagerStatus,
          };
        });

        return {
          next: {
            ...prev,
            transactions: mergedTxs,
          },
          log: {
            erp: updatedWm > 0 && addedTxs === 0 ? 'WorkManager' : 'Clara',
            tipo: updatedWm > 0 && addedTxs === 0 ? 'rpa_wm' : 'rpa_clara',
            cantidadRegistros: addedTxs + updatedWm,
            totalMonto: newTxs.reduce((s, t) => s + t.valor, 0),
            moneda: newTxs[0]?.moneda || 'COP',
            archivoNombre: file.name,
            estado: 'ok',
            detalle: `Importación Python: ${addedTxs} movimiento(s) Clara, ${updatedWm} estado(s) WM aplicados.`,
          },
        };
      });

      setBannerFeedback({
        type: 'ok',
        text: `JSON Python importado (${file.name}): ${addedTxs} movimiento(s) agregado(s) y ${updatedWm} factura(s) actualizadas en Work Manager.`,
      });
    } catch {
      setBannerFeedback({
        type: 'error',
        text: 'Archivo JSON inválido. Usa el formato generado por clara_wm_standalone.py.',
      });
    }
  };

  const handleDownloadWmPendingPython = () => {
    const res = downloadWmPendingForPythonJson(scopedTransactions);
    setBannerFeedback({
      type: 'ok',
      text: `Descargado ${res.fileName} (${res.count} facturas) para procesarlo con clara_wm_standalone.py.`,
    });
  };

  // SAP Bot Dispatch Builders & Exporters
  const readySapTxs = useMemo(() => {
    return scopedTransactions.filter((t) => {
      const wm = getEffectiveWmStatus(t);
      return (wm === 'radicada' || wm === 'exenta_exterior') && evaluateTransactionReadiness(t, data.vendors).ready;
    });
  }, [scopedTransactions, data.vendors]);

  const handleDownloadSapJson = () => {
    const targetTxs = readySapTxs.length > 0 ? readySapTxs : scopedTransactions;
    if (targetTxs.length === 0) {
      setBannerFeedback({ type: 'error', text: 'No hay gastos disponibles para generar paquete SAP.' });
      return;
    }
    const pkg = buildSapBotDispatchPackage({
      transactions: targetTxs,
      vendors: data.vendors,
      rules: data.costCenterRules,
      connectorConfig: data.connectorConfig,
      userName: actorName,
    });
    const fileName = downloadSapBotPackageJson(pkg);
    const idSet = new Set(targetTxs.map((t) => t.id));
    appendLogAndReconcile((prev) => ({
      next: {
        ...prev,
        transactions: prev.transactions.map((t) =>
          idSet.has(t.id)
            ? {
                ...t,
                sapDespachoEstado: t.sapDespachoEstado === 'contabilizado' ? 'contabilizado' : 'en_paquete',
                loteExportacionId: pkg.batchId,
              }
            : t
        ),
      },
      log: {
        erp: 'SAP',
        tipo: 'sap_bot',
        cantidadRegistros: pkg.itemsCount,
        totalMonto: targetTxs.reduce((s, t) => s + t.valor, 0),
        moneda: targetTxs[0]?.moneda || 'COP',
        archivoNombre: fileName,
        estado: 'ok',
        detalle: `Paquete JSON ${pkg.batchId} generado para Bot SAP.`,
      },
    }));
    setBannerFeedback({
      type: 'ok',
      text: `Descargado ${fileName} con ${pkg.itemsCount} registros listos para Bot SAP.`,
    });
  };

  const handleDownloadSapTxt = () => {
    const targetTxs = readySapTxs.length > 0 ? readySapTxs : scopedTransactions;
    if (targetTxs.length === 0) return;
    const pkg = buildSapBotDispatchPackage({
      transactions: targetTxs,
      vendors: data.vendors,
      rules: data.costCenterRules,
      connectorConfig: data.connectorConfig,
      userName: actorName,
    });
    const fileName = downloadSapBotPackageTxt(pkg);
    setBannerFeedback({ type: 'ok', text: `Archivo plano FB60 descargado (${fileName}).` });
  };

  const handleDownloadSapExcel = () => {
    const targetTxs = readySapTxs.length > 0 ? readySapTxs : scopedTransactions;
    if (targetTxs.length === 0) return;
    const log = exportAccountingBatchExcel({
      erp: 'SAP',
      transactions: targetTxs,
      vendors: data.vendors,
      rules: data.costCenterRules,
      userName: actorName,
    });
    appendLogAndReconcile((prev) => ({
      next: prev,
      log: { ...log, estado: 'ok', detalle: 'Lote Excel FB60 descargado para contabilización asistida.' },
    }));
    setBannerFeedback({ type: 'ok', text: `Lote Excel SAP descargado (${log.archivoNombre}).` });
  };

  const handleDispatchSapToLocalAgent = async () => {
    const targetTxs = readySapTxs.length > 0 ? readySapTxs : scopedTransactions;
    if (targetTxs.length === 0) {
      setBannerFeedback({ type: 'error', text: 'No hay registros listos para despachar a SAP.' });
      return;
    }
    const pkg = buildSapBotDispatchPackage({
      transactions: targetTxs,
      vendors: data.vendors,
      rules: data.costCenterRules,
      connectorConfig: data.connectorConfig,
      userName: actorName,
    });
    setAgentBusyAction('sap_dispatch');
    try {
      const res = await dispatchSapPackageToLocalAgent(agentUrl, agentBearerToken, pkg);
      const idSet = new Set(targetTxs.map((t) => t.id));
      appendLogAndReconcile((prev) => ({
        next: {
          ...prev,
          transactions: prev.transactions.map((t) =>
            idSet.has(t.id)
              ? {
                  ...t,
                  sapDespachoEstado: 'enviado_agente',
                  sapMensaje: `Enviado a ${res.savedFile}`,
                  loteExportacionId: pkg.batchId,
                }
              : t
          ),
        },
        log: {
          erp: 'SAP',
          tipo: 'sap_bot',
          cantidadRegistros: res.itemsCount,
          totalMonto: targetTxs.reduce((s, t) => s + t.valor, 0),
          moneda: targetTxs[0]?.moneda || 'COP',
          archivoNombre: res.savedFile,
          estado: 'ok',
          detalle: `Depositado en cola local del Bot SAP (${res.fullPath}).`,
        },
      }));
      setBannerFeedback({
        type: 'ok',
        text: `Paquete enviado al Agente Local (${res.savedFile}). Ejecuta ahora el Bot SAP.`,
      });
    } catch (err: any) {
      setBannerFeedback({ type: 'error', text: err?.message || 'Error enviando al Agente Local.' });
    } finally {
      setAgentBusyAction(null);
    }
  };

  // Re-import sap_results.json generated by sap_posting_bot.py or sap_odata_poster.mjs
  const handleImportSapResultsJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list: Array<{
        txId: string;
        status?: string;
        sapDocContable?: string;
        message?: string;
      }> = Array.isArray(parsed?.results) ? parsed.results : [];
      if (list.length === 0) {
        setBannerFeedback({ type: 'error', text: 'El JSON no contiene el arreglo results[].' });
        return;
      }
      const resMap = new Map(list.map((r) => [r.txId, r]));
      let postedCount = 0;

      appendLogAndReconcile((prev) => ({
        next: {
          ...prev,
          transactions: prev.transactions.map((t) => {
            const r = resMap.get(t.id);
            if (!r) return t;
            const isOk = r.status === 'contabilizado';
            if (isOk) postedCount += 1;
            return {
              ...t,
              sapDocContable: r.sapDocContable || t.sapDocContable,
              sapMensaje: r.message || t.sapMensaje,
              sapDespachoEstado:
                r.status === 'contabilizado'
                  ? 'contabilizado'
                  : r.status === 'error'
                  ? 'error'
                  : 'en_paquete',
              estadoContable: isOk ? 'contabilizado' : t.estadoContable,
            };
          }),
        },
        log: {
          erp: 'SAP',
          tipo: 'sap_bot',
          cantidadRegistros: list.length,
          totalMonto: 0,
          moneda: 'COP',
          archivoNombre: file.name,
          estado: postedCount > 0 ? 'ok' : 'alerta',
          detalle: `Resultado bot SAP importado: ${postedCount} contabilizado(s) de ${list.length}.`,
        },
      }));
      setBannerFeedback({
        type: 'ok',
        text: `Resultados SAP importados (${file.name}): ${postedCount} contabilizado(s).`,
      });
    } catch {
      setBannerFeedback({ type: 'error', text: 'Archivo JSON de resultados SAP inválido.' });
    }
  };

  // Vendor quick create from missing candidates
  const handleQuickCreateVendor = (candidate: ReturnType<typeof detectPendingVendorCandidates>[number]) => {
    const newVendor: ClaraVendor = candidate.existingVendor
      ? {
          ...candidate.existingVendor,
          nitTaxId: candidate.nitSugerido || candidate.existingVendor.nitTaxId,
        }
      : {
          id: `vnd-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          nitTaxId: candidate.nitSugerido || 'PENDIENTE-NIT',
          razonSocial: candidate.comercio.toUpperCase(),
          aliasComerciosClara: [candidate.comercio],
          pais: candidate.paisSugerido,
          esExterior: candidate.esExterior,
          tipoPersona: candidate.esExterior ? 'Extranjero' : 'Jurídica',
          regimenFiscal: candidate.esExterior ? 'Proveedor del Exterior' : 'Responsable de IVA',
          erpObjetivo: 'SAP',
          codigoTerceroSap: '',
          estadoCreacion: 'pendiente_crear',
          notas: 'Creado automáticamente desde detección Clara/IA.',
        };

    appendLogAndReconcile((prev) => ({
      next: {
        ...prev,
        vendors: candidate.existingVendor
          ? prev.vendors.map((v) => (v.id === newVendor.id ? newVendor : v))
          : [newVendor, ...prev.vendors],
      },
    }));
    setBannerFeedback({
      type: 'ok',
      text: `Tercero ${newVendor.razonSocial} registrado en el catálogo. Asigna su Código Acreedor SAP.`,
    });
  };

  const handleAddCostCenterRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleForm.centroCostoClara.trim() || !newRuleForm.codigoCentroCostoErp.trim()) return;
    const rule: ClaraCostCenterRule = {
      id: `cc-rule-${Date.now()}`,
      sociedad: newRuleForm.sociedad,
      centroCostoClara: newRuleForm.centroCostoClara.trim(),
      erpDestino: 'SAP',
      codigoCentroCostoErp: newRuleForm.codigoCentroCostoErp.trim(),
      sociedadSap: newRuleForm.sociedadSap.trim() || '1000',
      cuentaContableDefault: newRuleForm.cuentaContableDefault.trim(),
      activa: true,
    };
    appendLogAndReconcile((prev) => ({
      next: { ...prev, costCenterRules: [rule, ...prev.costCenterRules] },
    }));
    setNewRuleForm((r) => ({ ...r, centroCostoClara: '', codigoCentroCostoErp: '' }));
  };

  const editingTx = useMemo(
    () => data.transactions.find((t) => t.id === editingTxId) || null,
    [data.transactions, editingTxId]
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex font-sans antialiased">
      <ClaraSidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onSwitchModule={onSwitchModule}
        permissions={permissions}
        transactionsCount={scopedTransactions.length}
        pendingWmCount={metrics.wmCounts.pendiente + metrics.wmCounts.no_radicada + metrics.wmCounts.inconsistencia}
        readySapCount={metrics.sapReady}
        pendingVendorsCount={missingVendors.length}
        logsCount={data.batchLogs.length}
        agentConnected={Boolean(agentHealth?.ok)}
      />

      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <ClaraHeader
          activeTab={activeTab}
          selectedPeriod={data.selectedPeriod}
          availablePeriods={availablePeriods}
          onChangePeriod={(p) => onUpdateData((prev) => ({ ...prev, selectedPeriod: p }), false)}
          onToggleMobileMenu={() => setIsMobileMenuOpen(true)}
          onSwitchModule={onSwitchModule}
          onReconcileAll={handleReconcileAll}
          onDownloadClaraTemplate={downloadClaraImportTemplate}
          onDownloadWmTemplate={downloadWorkManagerImportTemplate}
          onDownloadSapJson={handleDownloadSapJson}
          onDownloadSapExcel={handleDownloadSapExcel}
          onSaveToCloud={handleSaveCloudClick}
          isSavingCloud={isSavingCloud}
          hasUnsavedChanges={data.hasUnsavedChanges}
          currentUser={currentUser}
          onSignInWithGoogle={onSignInWithGoogle}
          onSignOut={onSignOut}
          permissions={permissions}
        />

        {/* Hidden file inputs */}
        <input
          ref={claraFileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleImportClaraFile}
        />
        <input
          ref={wmFileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleImportWmFile}
        />
        <input
          ref={batchInvoicesInputRef}
          type="file"
          multiple
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => {
            void handleBatchInvoiceFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={singleInvoiceInputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => {
            if (editingTx) {
              void handleBatchInvoiceFiles(e.target.files, editingTx.id);
            }
            e.target.value = '';
          }}
        />
        <input
          ref={sapResultsInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportSapResultsJson}
        />
        <input
          ref={pythonJsonInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportPythonJson}
        />

        <main className="flex-1 p-4 lg:p-6 max-w-7xl w-full mx-auto space-y-5 pb-16">
          {bannerFeedback && (
            <div
              className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between gap-3 ${
                bannerFeedback.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : bannerFeedback.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-sky-50 border-sky-200 text-sky-900'
              }`}
            >
              <span>{bannerFeedback.text}</span>
              <button
                type="button"
                onClick={() => setBannerFeedback(null)}
                className="p-1 rounded-lg hover:bg-black/5 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Search & Period Filter Bar (shown on main operational tabs) */}
          {activeTab !== 'conectores' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar comercio, NIT, factura, titular o ID Clara..."
                  className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
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

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-medium">
                  Modo activo:{' '}
                  <strong className="text-slate-800">
                    {agentHealth?.ok ? 'Agente Local Playwright + IA' : 'Web Híbrido + Gemini IA'}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('conectores')}
                  className="text-[#1E60A8] hover:underline font-semibold cursor-pointer"
                >
                  Configurar conectores
                </button>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 1: EXTRACCIÓN CLARA & LECTURA IA DE FACTURAS                 */}
          {/* ================================================================ */}
          {activeTab === 'bandeja' && (
            <div className="space-y-5">
              {/* Single-surface summary strip */}
              <div className="bg-white rounded-xl border border-slate-200 grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`p-4 text-left transition-colors cursor-pointer ${
                    statusFilter === 'ALL' ? 'bg-slate-50/70' : 'hover:bg-slate-50/40'
                  }`}
                >
                  <div className="text-xs font-medium text-slate-500">Movimientos Clara</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                    {metrics.total}
                  </div>
                </button>
                <div className="p-4">
                  <div className="text-xs font-medium text-slate-500">Con Factura IA Leída</div>
                  <div className="mt-1 text-2xl font-bold text-[#19377B] tabular-nums">
                    {metrics.withInvoice}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStatusFilter('CUADRA')}
                  className={`p-4 text-left transition-colors cursor-pointer ${
                    statusFilter === 'CUADRA' ? 'bg-emerald-50/60' : 'hover:bg-slate-50/40'
                  }`}
                >
                  <div className="text-xs font-medium text-slate-500">Cuadre OK (Clara = Factura)</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
                    {metrics.cuadreOk}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALERTA')}
                  className={`p-4 text-left transition-colors cursor-pointer ${
                    statusFilter === 'ALERTA' ? 'bg-amber-50/60' : 'hover:bg-slate-50/40'
                  }`}
                >
                  <div className="text-xs font-medium text-slate-500">Diferencias / Inconsistencias</div>
                  <div className="mt-1 text-2xl font-bold text-amber-700 tabular-nums">
                    {metrics.alerts}
                  </div>
                </button>
              </div>

              {/* Action & AI Batch Extraction Panel */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 lg:p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#1E60A8]" />
                      <span>Motor de Extracción Clara y Lectura Inteligente de Facturas</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Importa movimientos de Clara (Excel/CSV o vía Agente RPA) y carga múltiples fotos o PDFs de facturas para extraer número, CUFE, NIT, subtotal, IVA y cuadre automático.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!permissions.canOperate}
                      onClick={() => claraFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-45"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#1E60A8]" />
                      <span>Importar Excel Clara</span>
                    </button>

                    <button
                      type="button"
                      disabled={!permissions.canOperate}
                      onClick={() => pythonJsonInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-45"
                      title="Importar JSON generado por clara_wm_standalone.py"
                    >
                      <FileJson className="w-3.5 h-3.5 text-amber-600" />
                      <span>Importar JSON Python</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowPythonKitModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#132B63] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors cursor-pointer"
                    >
                      <Code2 className="w-3.5 h-3.5 text-[#1E60A8]" />
                      <span>Programar / Kit Python</span>
                    </button>

                    <button
                      type="button"
                      disabled={!permissions.canOperate || agentBusyAction === 'clara_extract'}
                      onClick={() => {
                        if (!agentHealth?.ok) {
                          setActiveTab('conectores');
                          setBannerFeedback({
                            type: 'info',
                            text: 'Inicia clara_wm_agent.py (o agent.mjs) y conéctalo en "Conectores RPA" para leer Clara en vivo.',
                          });
                          return;
                        }
                        void handleAgentExtractClaraRows();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-45"
                    >
                      <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Leer Clara vía Agente</span>
                    </button>

                    <button
                      type="button"
                      disabled={!permissions.canOperate}
                      onClick={() => setShowAddTxModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl transition-colors cursor-pointer disabled:opacity-45"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Nuevo Gasto</span>
                    </button>
                  </div>
                </div>

                {/* Multi-file Invoice AI Dropzone Strip */}
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#1E60A8]/10 text-[#1E60A8] flex items-center justify-center shrink-0">
                      {isScanningInvoices ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <FileScan className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800">
                        {scanProgress
                          ? `Analizando con Gemini IA (${scanProgress.current}/${scanProgress.total}): ${scanProgress.file}`
                          : 'Lector Masivo de Facturas IA (JPG, PNG, WebP o PDF)'}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {batchTargetTxId === 'AUTO'
                          ? 'Auto-empareja cada factura contra movimientos Clara existentes (por monto, NIT o nombre) o crea una fila nueva.'
                          : 'Adjuntará la factura escaneada directamente al movimiento seleccionado.'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      aria-label="Destino de factura IA"
                      value={batchTargetTxId}
                      onChange={(e) => setBatchTargetTxId(e.target.value)}
                      className="max-w-[220px] px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
                    >
                      <option value="AUTO">Auto-emparejar movimientos</option>
                      {scopedTransactions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.claraTxId || t.id} · {t.comercio.slice(0, 22)}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={!permissions.canOperate || isScanningInvoices}
                      onClick={() => batchInvoicesInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer disabled:opacity-45"
                    >
                      {isScanningInvoices ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>Cargar Facturas (Lote IA)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Main Movements + Extracted Invoice Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-3.5">Fecha</th>
                        <th className="py-3 px-3.5">Comercio / Titular</th>
                        <th className="py-3 px-3.5">Sociedad / CC</th>
                        <th className="py-3 px-3.5 text-right">Monto Clara</th>
                        <th className="py-3 px-3.5">Factura IA Extraída</th>
                        <th className="py-3 px-3.5">Cuadre</th>
                        <th className="py-3 px-3.5">Work Manager</th>
                        <th className="py-3 px-3.5 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredBandejaTxs.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-slate-500">
                            No hay movimientos en el filtro actual. Importa un Excel de Clara o carga facturas IA.
                          </td>
                        </tr>
                      ) : (
                        filteredBandejaTxs.map((tx) => {
                          const cuadre = evaluateClaraInvoiceCuadre(
                            tx,
                            data.connectorConfig.toleranciaCruceMonto
                          );
                          const wmStatus = getEffectiveWmStatus(tx);
                          return (
                            <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-3 px-3.5 whitespace-nowrap font-mono text-slate-700 tabular-nums">
                                <div>{tx.fecha}</div>
                                <div className="text-[11px] text-slate-400">{tx.claraTxId || tx.id}</div>
                              </td>
                              <td className="py-3 px-3.5 max-w-[230px]">
                                <div className="font-semibold text-slate-900 truncate" title={tx.comercio}>
                                  {tx.comercio}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {tx.tarjetahabiente} · {tx.nitComercio || tx.facturaNit || 'Sin NIT'}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate" title={tx.observacion}>
                                  {tx.observacion}
                                </div>
                              </td>
                              <td className="py-3 px-3.5 whitespace-nowrap">
                                <div className="font-semibold text-slate-800">{tx.sociedad}</div>
                                <div className="text-[11px] text-slate-500 truncate max-w-[140px]">
                                  {tx.centroCosto || 'Sin CC'}
                                </div>
                              </td>
                              <td className="py-3 px-3.5 text-right whitespace-nowrap font-mono font-semibold text-slate-900 tabular-nums">
                                {formatClaraMoney(tx.valor, tx.moneda)}
                              </td>
                              <td className="py-3 px-3.5 whitespace-nowrap">
                                {tx.facturaNumero ? (
                                  <div>
                                    <div className="font-semibold text-[#132B63] font-mono">
                                      {tx.facturaNumero}
                                    </div>
                                    <div className="text-[11px] text-slate-500 tabular-nums">
                                      Sub {formatClaraMoney(tx.facturaSubtotal || 0, tx.facturaMoneda || tx.moneda)} · Imp{' '}
                                      {formatClaraMoney(tx.facturaImpuesto || 0, tx.facturaMoneda || tx.moneda)}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">Sin factura escaneada</span>
                                )}
                              </td>
                              <td className="py-3 px-3.5 whitespace-nowrap">
                                <span
                                  title={cuadre.note}
                                  className={`font-semibold ${
                                    cuadre.status === 'cuadra_ok'
                                      ? 'text-emerald-700'
                                      : cuadre.status === 'sin_soporte'
                                      ? 'text-slate-400'
                                      : 'text-amber-700'
                                  }`}
                                >
                                  {cuadre.status === 'cuadra_ok'
                                    ? 'Cuadra OK'
                                    : cuadre.status === 'sin_soporte'
                                    ? 'Sin soporte'
                                    : cuadre.status === 'error_aritmetico'
                                    ? 'Error aritm.'
                                    : 'Diferencia'}
                                </span>
                              </td>
                              <td className="py-3 px-3.5 whitespace-nowrap">
                                <span
                                  className={`font-semibold ${
                                    wmStatus === 'radicada'
                                      ? 'text-emerald-700'
                                      : wmStatus === 'exenta_exterior'
                                      ? 'text-sky-700'
                                      : wmStatus === 'inconsistencia'
                                      ? 'text-rose-700'
                                      : wmStatus === 'no_radicada'
                                      ? 'text-amber-700'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  {wmStatus === 'radicada'
                                    ? 'Radicada'
                                    : wmStatus === 'exenta_exterior'
                                    ? 'Exenta ext.'
                                    : wmStatus === 'inconsistencia'
                                    ? 'Inconsistencia'
                                    : wmStatus === 'no_radicada'
                                    ? 'No radicada'
                                    : 'Pendiente'}
                                </span>
                              </td>
                              <td className="py-3 px-3.5 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => setEditingTxId(tx.id)}
                                  className="px-2.5 py-1.5 text-xs font-semibold text-[#1E60A8] hover:bg-sky-50 rounded-lg cursor-pointer"
                                >
                                  Revisar / Factura
                                </button>
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
          )}

          {/* ================================================================ */}
          {/* TAB 2: VALIDACIÓN DE RADICACIÓN EN WORK MANAGER (:8037)          */}
          {/* ================================================================ */}
          {activeTab === 'workmanager' && (
            <div className="space-y-5">
              <div className="bg-white rounded-xl border border-slate-200 grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                {(
                  [
                    { key: 'radicada', label: 'Radicadas', val: metrics.wmCounts.radicada, color: 'text-emerald-700' },
                    { key: 'no_radicada', label: 'No Radicadas', val: metrics.wmCounts.no_radicada, color: 'text-amber-700' },
                    { key: 'inconsistencia', label: 'Inconsistencias', val: metrics.wmCounts.inconsistencia, color: 'text-rose-700' },
                    { key: 'pendiente', label: 'Pendientes', val: metrics.wmCounts.pendiente, color: 'text-slate-700' },
                    { key: 'exenta_exterior', label: 'Exentas Exterior', val: metrics.wmCounts.exenta_exterior, color: 'text-sky-700' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setWmFilter((cur) => (cur === item.key ? 'ALL' : item.key))}
                    className={`p-4 text-left transition-colors cursor-pointer ${
                      wmFilter === item.key ? 'bg-slate-50' : 'hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="text-xs font-medium text-slate-500">{item.label}</div>
                    <div className={`mt-1 text-2xl font-bold tabular-nums ${item.color}`}>
                      {item.val}
                    </div>
                  </button>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 lg:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Motor de Validación en Work Manager ({data.connectorConfig.workManagerUrl || 'pan.iluma.bio:8037'})
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cruza automáticamente por número de factura, CUFE, NIT emisor y monto; o consulta directamente en vivo contra el puerto :8037 mediante el Agente Puente Local.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleReconcileAll}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#1E60A8]" />
                    <span>Cruzar vs Base WM</span>
                  </button>

                  <button
                    type="button"
                    disabled={!permissions.canOperate}
                    onClick={() => wmFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl cursor-pointer disabled:opacity-45"
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Importar Excel WM</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadWmPendingPython}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
                    title="Descarga wm_pendientes_python.json para procesarlo con tu script Python"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-600" />
                    <span>Exportar JSON Python</span>
                  </button>

                  <button
                    type="button"
                    disabled={!permissions.canOperate}
                    onClick={() => pythonJsonInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl cursor-pointer disabled:opacity-45"
                    title="Cargar wm_resultados_python.json devuelto por Python"
                  >
                    <Upload className="w-3.5 h-3.5 text-amber-600" />
                    <span>Importar Resultados Python</span>
                  </button>

                  <button
                    type="button"
                    disabled={!permissions.canOperate || agentBusyAction === 'wm_check'}
                    onClick={() => {
                      if (!agentHealth?.ok) {
                        setActiveTab('conectores');
                        setBannerFeedback({
                          type: 'info',
                          text: 'Para consultar el puerto :8037 en vivo desde tu equipo/VPN, inicia clara_wm_agent.py y conéctalo en Conectores RPA.',
                        });
                        return;
                      }
                      void handleAgentCheckWorkManager();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl cursor-pointer disabled:opacity-45"
                  >
                    {agentBusyAction === 'wm_check' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    )}
                    <span>Consultar WM (:8037) vía Agente</span>
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-3.5">Movimiento Clara</th>
                        <th className="py-3 px-3.5">Factura / NIT / CUFE</th>
                        <th className="py-3 px-3.5 text-right">Valor</th>
                        <th className="py-3 px-3.5">Estado Radicación WM</th>
                        <th className="py-3 px-3.5">Detalle / Evidencia</th>
                        <th className="py-3 px-3.5 text-right">Validación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredWmTxs.map((tx) => {
                        const wmStatus = getEffectiveWmStatus(tx);
                        return (
                          <tr key={tx.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-3.5">
                              <div className="font-semibold text-slate-900">{tx.comercio}</div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                {tx.fecha} · {tx.claraTxId || tx.id}
                              </div>
                            </td>
                            <td className="py-3 px-3.5">
                              <div className="font-mono font-semibold text-[#132B63]">
                                {tx.facturaNumero || tx.wmRadicacionNumero || tx.workManagerNumeroFactura || 'Sin N° factura'}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                                NIT: {tx.facturaNit || tx.nitComercio || '-'}
                              </div>
                            </td>
                            <td className="py-3 px-3.5 text-right font-mono font-semibold tabular-nums">
                              {formatClaraMoney(tx.valor, tx.moneda)}
                            </td>
                            <td className="py-3 px-3.5">
                              <select
                                aria-label={`Estado Work Manager ${tx.comercio}`}
                                disabled={!permissions.canOperate || tx.origenGasto === 'exterior'}
                                value={wmStatus}
                                onChange={(e) => {
                                  const nextWm = e.target.value as ClaraWorkManagerRadicacionStatus;
                                  appendLogAndReconcile((prev) => ({
                                    next: {
                                      ...prev,
                                      transactions: prev.transactions.map((item) =>
                                        item.id === tx.id
                                          ? {
                                              ...item,
                                              wmRadicacionStatus: nextWm,
                                              workManagerStatus:
                                                nextWm === 'radicada'
                                                  ? 'validada'
                                                  : nextWm === 'inconsistencia'
                                                  ? 'diferencia_valor'
                                                  : nextWm === 'exenta_exterior'
                                                  ? 'exenta_exterior'
                                                  : 'pendiente_factura',
                                              wmMensajeValidacion:
                                                nextWm === 'radicada'
                                                  ? 'Radicación confirmada manualmente.'
                                                  : item.wmMensajeValidacion,
                                            }
                                          : item
                                      ),
                                    },
                                  }));
                                }}
                                className="px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-800"
                              >
                                <option value="radicada">Radicada</option>
                                <option value="no_radicada">No radicada</option>
                                <option value="inconsistencia">Inconsistencia</option>
                                <option value="pendiente">Pendiente</option>
                                <option value="exenta_exterior">Exenta exterior</option>
                              </select>
                            </td>
                            <td className="py-3 px-3.5 text-slate-600 max-w-[260px]">
                              <div className="truncate" title={tx.wmMensajeValidacion}>
                                {tx.wmMensajeValidacion || 'Sin verificación ejecutada aún.'}
                              </div>
                              {tx.wmRadicacionFecha && (
                                <div className="text-[11px] text-slate-400 font-mono">
                                  Fecha WM: {tx.wmRadicacionFecha}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3.5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setEditingTxId(tx.id)}
                                className="px-2.5 py-1.5 text-xs font-semibold text-[#1E60A8] hover:bg-sky-50 rounded-lg cursor-pointer"
                              >
                                Editar / Soporte
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 3: CENTRO DE DESPACHO PARA BOT SAP                           */}
          {/* ================================================================ */}
          {activeTab === 'contabilizacion' && (
            <div className="space-y-5">
              <div className="bg-white rounded-xl border border-slate-200 grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
                <div className="p-4">
                  <div className="text-xs font-medium text-slate-500">Listos para Bot SAP</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
                    {metrics.sapReady}
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-xs font-medium text-slate-500">Contabilizados en SAP</div>
                  <div className="mt-1 text-2xl font-bold text-[#132B63] tabular-nums">
                    {metrics.sapPosted}
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-xs font-medium text-slate-500">Pendientes WM / Tercero</div>
                  <div className="mt-1 text-2xl font-bold text-amber-700 tabular-nums">
                    {Math.max(0, metrics.total - metrics.sapReady - metrics.sapPosted)}
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-xs font-medium text-slate-500">Sociedad / Clase SAP Base</div>
                  <div className="mt-1 text-lg font-bold text-slate-900 font-mono">
                    {data.connectorConfig.sapSociedadDefault || '1000'} ·{' '}
                    {data.connectorConfig.sapClaseDocDefault || 'KR'}
                  </div>
                </div>
              </div>

              {/* Dispatch Control Card */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 lg:p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Despacho Estructurado hacia Bot SAP Independiente o Contabilización Asistida
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Solo los gastos con factura radicada (o exenta exterior), tercero homologado y cuenta/CC asignados pasan al paquete final de contabilización FB60/OData.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadSapJson}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl cursor-pointer"
                    >
                      <FileJson className="w-3.5 h-3.5" />
                      <span>Descargar Paquete Bot SAP (JSON)</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadSapExcel}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Excel FB60</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadSapTxt}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-600" />
                      <span>Plano TXT</span>
                    </button>

                    <button
                      type="button"
                      disabled={!permissions.canOperate || agentBusyAction === 'sap_dispatch'}
                      onClick={() => {
                        if (!agentHealth?.ok) {
                          setActiveTab('conectores');
                          setBannerFeedback({
                            type: 'info',
                            text: 'Para enviar directo a la carpeta de cola local del Bot SAP, conecta el Agente Puente Local.',
                          });
                          return;
                        }
                        void handleDispatchSapToLocalAgent();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#132B63] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl cursor-pointer disabled:opacity-45"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Enviar a Agente Local</span>
                    </button>

                    <button
                      type="button"
                      disabled={!permissions.canOperate}
                      onClick={() => sapResultsInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl cursor-pointer disabled:opacity-45"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#1E60A8]" />
                      <span>Importar sap_results.json</span>
                    </button>
                  </div>
                </div>

                {/* SAP Bot Download Templates Strip */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-600">
                    Plantillas ejecutables para tu bot independiente SAP:
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => downloadAgentTemplateFile('sap_python_bot')}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-[#1E60A8]" />
                      <span>sap_posting_bot.py (SAP GUI FB60)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadAgentTemplateFile('sap_odata_bot')}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-[#1E60A8]" />
                      <span>sap_odata_poster.mjs (OData REST)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* SAP Dispatch Queue Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-3.5">Factura / Comercio</th>
                        <th className="py-3 px-3.5">Acreedor SAP</th>
                        <th className="py-3 px-3.5">Cuenta Mayor</th>
                        <th className="py-3 px-3.5">CC SAP</th>
                        <th className="py-3 px-3.5">Ind. Imp.</th>
                        <th className="py-3 px-3.5 text-right">Total</th>
                        <th className="py-3 px-3.5">Estado / Bloqueos</th>
                        <th className="py-3 px-3.5">N° Doc SAP (BELNR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {scopedTransactions.map((tx) => {
                        const readiness = evaluateTransactionReadiness(tx, data.vendors);
                        const wmStatus = getEffectiveWmStatus(tx);
                        const vendor = findMatchingVendor(tx, data.vendors);
                        const canDispatch =
                          (wmStatus === 'radicada' || wmStatus === 'exenta_exterior') && readiness.ready;
                        return (
                          <tr key={tx.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-3.5">
                              <div className="font-semibold text-slate-900">
                                {tx.facturaNumero || tx.workManagerNumeroFactura || tx.comercio}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                                {tx.comercio} · {tx.fecha}
                              </div>
                            </td>
                            <td className="py-3 px-3.5 font-mono text-slate-700">
                              {vendor?.codigoTerceroSap || 'SIN CODIGO'}
                            </td>
                            <td className="py-3 px-3.5">
                              <input
                                type="text"
                                disabled={!permissions.canOperate}
                                value={tx.cuentaContable || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  onUpdateData(
                                    (prev) => ({
                                      ...prev,
                                      transactions: prev.transactions.map((item) =>
                                        item.id === tx.id ? { ...item, cuentaContable: val } : item
                                      ),
                                    }),
                                    true
                                  );
                                }}
                                placeholder="Cuenta mayor"
                                className="w-28 px-2 py-1 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                              />
                            </td>
                            <td className="py-3 px-3.5">
                              <input
                                type="text"
                                disabled={!permissions.canOperate}
                                value={tx.sapCentroCosto || tx.centroCosto || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  onUpdateData(
                                    (prev) => ({
                                      ...prev,
                                      transactions: prev.transactions.map((item) =>
                                        item.id === tx.id ? { ...item, sapCentroCosto: val } : item
                                      ),
                                    }),
                                    true
                                  );
                                }}
                                className="w-28 px-2 py-1 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                              />
                            </td>
                            <td className="py-3 px-3.5">
                              <input
                                type="text"
                                disabled={!permissions.canOperate}
                                value={tx.indicadorImpuesto || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  onUpdateData(
                                    (prev) => ({
                                      ...prev,
                                      transactions: prev.transactions.map((item) =>
                                        item.id === tx.id ? { ...item, indicadorImpuesto: val } : item
                                      ),
                                    }),
                                    true
                                  );
                                }}
                                placeholder="V19"
                                className="w-20 px-2 py-1 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                              />
                            </td>
                            <td className="py-3 px-3.5 text-right font-mono font-semibold tabular-nums">
                              {formatClaraMoney(tx.facturaTotal || tx.valor, tx.moneda)}
                            </td>
                            <td className="py-3 px-3.5 max-w-[210px]">
                              {tx.sapDespachoEstado === 'contabilizado' ? (
                                <span className="font-semibold text-emerald-700">Contabilizado SAP</span>
                              ) : canDispatch ? (
                                <span className="font-semibold text-[#132B63]">
                                  {tx.sapDespachoEstado === 'enviado_agente'
                                    ? 'En cola local Bot'
                                    : tx.sapDespachoEstado === 'en_paquete'
                                    ? 'En paquete JSON'
                                    : 'Listo para Bot SAP'}
                                </span>
                              ) : (
                                <span className="text-amber-700 truncate block" title={readiness.blockers.join(' · ')}>
                                  {readiness.blockers[0] || 'Pendiente WM'}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3.5">
                              <input
                                type="text"
                                disabled={!permissions.canOperate}
                                value={tx.sapDocContable || ''}
                                onChange={(e) => {
                                  const belnr = e.target.value;
                                  onUpdateData(
                                    (prev) => ({
                                      ...prev,
                                      transactions: prev.transactions.map((item) =>
                                        item.id === tx.id
                                          ? {
                                              ...item,
                                              sapDocContable: belnr,
                                              sapDespachoEstado: belnr.trim()
                                                ? 'contabilizado'
                                                : item.sapDespachoEstado,
                                              estadoContable: belnr.trim()
                                                ? 'contabilizado'
                                                : item.estadoContable,
                                            }
                                          : item
                                      ),
                                    }),
                                    true
                                  );
                                }}
                                placeholder="Ej. 190004512"
                                className="w-28 px-2 py-1 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 4: TERCEROS Y REGLAS DE CENTROS DE COSTO                      */}
          {/* ================================================================ */}
          {activeTab === 'terceros' && (
            <div className="space-y-6">
              {missingVendors.length > 0 && (
                <div className="bg-white rounded-xl border border-amber-200 p-4 lg:p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Terceros Detectados Pendientes de Creación / Homologación ({missingVendors.length})</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Detectados automáticamente en movimientos Clara o facturas escaneadas sin código de acreedor SAP.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const log = exportPendingVendorsExcel(data.vendors, 'SAP', actorName);
                        appendLogAndReconcile((prev) => ({ next: prev, log }));
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl cursor-pointer shrink-0"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Exportar Plantilla Terceros SAP</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {missingVendors.map((c) => (
                      <div
                        key={c.key}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">{c.comercio}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            NIT: {c.nitSugerido || 'Por completar'} · {c.transactionIds.length} mov. ·{' '}
                            {formatClaraMoney(c.totalValor, c.moneda)}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!permissions.canOperate}
                          onClick={() => handleQuickCreateVendor(c)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-lg shrink-0 cursor-pointer disabled:opacity-45"
                        >
                          Registrar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Vendors Catalog */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#1E60A8]" />
                    <span>Catálogo de Proveedores / Terceros SAP</span>
                  </h3>
                  <span className="text-xs text-slate-500 tabular-nums">{data.vendors.length} registrados</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-2.5 px-3.5">Razón Social</th>
                        <th className="py-2.5 px-3.5">NIT / Tax ID</th>
                        <th className="py-2.5 px-3.5">Código Acreedor SAP</th>
                        <th className="py-2.5 px-3.5">Cuenta Gasto Default</th>
                        <th className="py-2.5 px-3.5">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {data.vendors.map((v) => (
                        <tr key={v.id} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3.5">
                            <div className="font-semibold text-slate-900">{v.razonSocial}</div>
                            <div className="text-[11px] text-slate-400">
                              Alias: {v.aliasComerciosClara.join(', ') || '-'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3.5 font-mono text-slate-700">{v.nitTaxId}</td>
                          <td className="py-2.5 px-3.5">
                            <input
                              type="text"
                              disabled={!permissions.canOperate}
                              value={v.codigoTerceroSap || ''}
                              onChange={(e) => {
                                const code = e.target.value;
                                appendLogAndReconcile((prev) => ({
                                  next: {
                                    ...prev,
                                    vendors: prev.vendors.map((item) =>
                                      item.id === v.id
                                        ? {
                                            ...item,
                                            codigoTerceroSap: code,
                                            estadoCreacion: code.trim()
                                              ? item.partnerIdOdoo
                                                ? 'sincronizado_ambos'
                                                : 'creado_sap'
                                              : 'pendiente_crear',
                                          }
                                        : item
                                    ),
                                  },
                                }));
                              }}
                              placeholder="Ej. 20001458"
                              className="w-32 px-2 py-1 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                            />
                          </td>
                          <td className="py-2.5 px-3.5">
                            <input
                              type="text"
                              disabled={!permissions.canOperate}
                              value={v.cuentaGastoDefault || ''}
                              onChange={(e) => {
                                const acc = e.target.value;
                                onUpdateData(
                                  (prev) => ({
                                    ...prev,
                                    vendors: prev.vendors.map((item) =>
                                      item.id === v.id ? { ...item, cuentaGastoDefault: acc } : item
                                    ),
                                  }),
                                  true
                                );
                              }}
                              placeholder="5195..."
                              className="w-32 px-2 py-1 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                            />
                          </td>
                          <td className="py-2.5 px-3.5">
                            <span
                              className={`font-semibold ${
                                v.codigoTerceroSap ? 'text-emerald-700' : 'text-amber-700'
                              }`}
                            >
                              {v.codigoTerceroSap ? 'Homologado SAP' : 'Pendiente código'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cost Center Rules */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 lg:p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Reglas de Homologación: Centro de Costo Clara → Centro de Costo & Cuenta SAP
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Asigna automáticamente la sociedad SAP, centro de costo y cuenta mayor cuando se importan movimientos de Clara.
                  </p>
                </div>

                {permissions.canOperate && (
                  <form onSubmit={handleAddCostCenterRule} className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                    <select
                      value={newRuleForm.sociedad}
                      onChange={(e) => setNewRuleForm((r) => ({ ...r, sociedad: e.target.value }))}
                      className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                    >
                      {(moduleCompanies.length > 0 ? moduleCompanies : [{ id: '1', nombre: 'PREMEX' }]).map((c) => (
                        <option key={c.id} value={c.nombre}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={newRuleForm.centroCostoClara}
                      onChange={(e) => setNewRuleForm((r) => ({ ...r, centroCostoClara: e.target.value }))}
                      placeholder="CC en Clara (ej. CC-COM-01 Ventas)"
                      className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg"
                    />
                    <input
                      type="text"
                      value={newRuleForm.codigoCentroCostoErp}
                      onChange={(e) => setNewRuleForm((r) => ({ ...r, codigoCentroCostoErp: e.target.value }))}
                      placeholder="CC SAP (ej. 1000-COM01)"
                      className="px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                    />
                    <input
                      type="text"
                      value={newRuleForm.cuentaContableDefault}
                      onChange={(e) => setNewRuleForm((r) => ({ ...r, cuentaContableDefault: e.target.value }))}
                      placeholder="Cuenta Mayor Default"
                      className="px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                    />
                    <button
                      type="submit"
                      className="px-3 py-2 text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-lg cursor-pointer"
                    >
                      Agregar Regla
                    </button>
                  </form>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-2 px-3">Sociedad</th>
                        <th className="py-2 px-3">Centro de Costo Clara</th>
                        <th className="py-2 px-3">Código CC SAP</th>
                        <th className="py-2 px-3">Sociedad SAP</th>
                        <th className="py-2 px-3">Cuenta Mayor Default</th>
                        <th className="py-2 px-3 text-right">Eliminar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {data.costCenterRules.map((rule) => (
                        <tr key={rule.id}>
                          <td className="py-2 px-3 font-semibold">{rule.sociedad}</td>
                          <td className="py-2 px-3">{rule.centroCostoClara}</td>
                          <td className="py-2 px-3 font-mono font-semibold text-[#132B63]">
                            {rule.codigoCentroCostoErp}
                          </td>
                          <td className="py-2 px-3 font-mono">{rule.sociedadSap || '1000'}</td>
                          <td className="py-2 px-3 font-mono">{rule.cuentaContableDefault || '-'}</td>
                          <td className="py-2 px-3 text-right">
                            {permissions.canOperate && (
                              <button
                                type="button"
                                onClick={() =>
                                  appendLogAndReconcile((prev) => ({
                                    next: {
                                      ...prev,
                                      costCenterRules: prev.costCenterRules.filter((r) => r.id !== rule.id),
                                    },
                                  }))
                                }
                                className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 5: CONECTORES RPA, PORTALES (:8037) Y BITÁCORA               */}
          {/* ================================================================ */}
          {activeTab === 'conectores' && (
            <div className="space-y-5">
              {/* Top 3 Connection Cards: Clara, Work Manager, Local Playwright Agent */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Clara Card */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Origen 1 · Tarjetas Corporativas
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-0.5">Portal Clara</h3>
                    </div>
                    <Globe className="w-4 h-4 text-[#1E60A8]" />
                  </div>
                  <input
                    type="url"
                    value={data.connectorConfig.claraUrl || 'https://colombia.clara.com/auth/login'}
                    onChange={(e) =>
                      onUpdateData(
                        (prev) => ({
                          ...prev,
                          connectorConfig: { ...prev.connectorConfig, claraUrl: e.target.value },
                        }),
                        true
                      )
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg bg-slate-50"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={data.connectorConfig.claraUrl || 'https://colombia.clara.com/auth/login'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir Clara</span>
                    </a>
                    <button
                      type="button"
                      disabled={!agentHealth?.ok || agentBusyAction === 'open_clara'}
                      onClick={() => void handleOpenAgentBrowserSession('clara')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-lg cursor-pointer disabled:opacity-45"
                    >
                      <span>Abrir Sesión RPA</span>
                    </button>
                  </div>
                </div>

                {/* Work Manager Card */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Origen 2 · Puerto :8037
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-0.5">Work Manager (WM)</h3>
                    </div>
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  </div>
                  <input
                    type="url"
                    value={
                      data.connectorConfig.workManagerUrl ||
                      'https://pan.iluma.bio:8037/Account/Login'
                    }
                    onChange={(e) =>
                      onUpdateData(
                        (prev) => ({
                          ...prev,
                          connectorConfig: {
                            ...prev.connectorConfig,
                            workManagerUrl: e.target.value,
                          },
                        }),
                        true
                      )
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg bg-slate-50"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={
                        data.connectorConfig.workManagerUrl ||
                        'https://pan.iluma.bio:8037/Account/Login'
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir WM</span>
                    </a>
                    <button
                      type="button"
                      disabled={!agentHealth?.ok || agentBusyAction === 'open_workmanager'}
                      onClick={() => void handleOpenAgentBrowserSession('workmanager')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-lg cursor-pointer disabled:opacity-45"
                    >
                      <span>Abrir Sesión RPA</span>
                    </button>
                  </div>
                </div>

                {/* Local Playwright Agent Bridge Card */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Puente Local Playwright
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                        Agente Conector ({agentHealth?.ok ? 'Conectado' : 'No conectado'})
                      </h3>
                    </div>
                    <Link2 className={`w-4 h-4 ${agentHealth?.ok ? 'text-emerald-600' : 'text-slate-400'}`} />
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      type="url"
                      value={agentUrl}
                      onChange={(e) =>
                        onUpdateData(
                          (prev) => ({
                            ...prev,
                            connectorConfig: { ...prev.connectorConfig, agentUrl: e.target.value },
                          }),
                          true
                        )
                      }
                      placeholder="http://127.0.0.1:4780"
                      className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg bg-slate-50"
                    />
                    <input
                      type="password"
                      value={agentBearerToken}
                      onChange={(e) => setAgentBearerToken(e.target.value)}
                      placeholder="AGENT_TOKEN (solo en memoria de sesión)"
                      className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={agentBusyAction === 'health'}
                      onClick={handleTestLocalAgent}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      {agentBusyAction === 'health' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Cpu className="w-3.5 h-3.5" />
                      )}
                      <span>Probar Agente Local</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Network Diagnostics + SAP Params + Downloadable Agent Bundle */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl border border-slate-200 p-4 lg:p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Diagnóstico de Red Cloud vs Red Interna (:8037)
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Verifica si los servidores cloud alcanzan Clara y Work Manager o si :8037 requiere ejecutarse vía Agente Local en tu equipo/VPN.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isProbingServer}
                      onClick={handleRunServerProbe}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl cursor-pointer shrink-0"
                    >
                      {isProbingServer ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5 text-[#1E60A8]" />
                      )}
                      <span>Probar Red Servidor</span>
                    </button>
                  </div>

                  {probeResults.length > 0 ? (
                    <div className="space-y-2.5">
                      {probeResults.map((r) => (
                        <div
                          key={r.target}
                          className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1 text-xs"
                        >
                          <div className="flex items-center justify-between font-bold">
                            <span className="uppercase text-slate-800">{r.target}</span>
                            <span className={r.reachable ? 'text-emerald-700' : 'text-amber-700'}>
                              {r.reachable ? `HTTP ${r.httpStatus} · ${r.latencyMs} ms` : `Inaccesible cloud (${r.latencyMs} ms)`}
                            </span>
                          </div>
                          <p className="text-slate-600 leading-relaxed">{r.diagnosis}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 text-xs text-slate-600">
                      {data.connectorConfig.lastServerProbeSummary
                        ? `Último diagnóstico: ${data.connectorConfig.lastServerProbeSummary}`
                        : 'Presiona "Probar Red Servidor" para diagnosticar accesibilidad real hacia clara.com y pan.iluma.bio:8037.'}
                    </div>
                  )}

                  {/* SAP Default & Tolerance Controls */}
                  <div className="pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Sociedad SAP Base
                      </label>
                      <input
                        type="text"
                        value={data.connectorConfig.sapSociedadDefault || '1000'}
                        onChange={(e) =>
                          onUpdateData(
                            (prev) => ({
                              ...prev,
                              connectorConfig: {
                                ...prev.connectorConfig,
                                sapSociedadDefault: e.target.value,
                              },
                            }),
                            true
                          )
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Clase Doc SAP
                      </label>
                      <input
                        type="text"
                        value={data.connectorConfig.sapClaseDocDefault || 'KR'}
                        onChange={(e) =>
                          onUpdateData(
                            (prev) => ({
                              ...prev,
                              connectorConfig: {
                                ...prev.connectorConfig,
                                sapClaseDocDefault: e.target.value,
                              },
                            }),
                            true
                          )
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Tolerancia Cruce
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={data.connectorConfig.toleranciaCruceMonto}
                        onChange={(e) =>
                          onUpdateData(
                            (prev) => ({
                              ...prev,
                              connectorConfig: {
                                ...prev.connectorConfig,
                                toleranciaCruceMonto: Math.max(0, Number(e.target.value) || 0),
                              },
                            }),
                            true
                          )
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Ventana Días WM
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={data.connectorConfig.diasVentanaCruce}
                        onChange={(e) =>
                          onUpdateData(
                            (prev) => ({
                              ...prev,
                              connectorConfig: {
                                ...prev.connectorConfig,
                                diasVentanaCruce: Math.max(1, Number(e.target.value) || 20),
                              },
                            }),
                            true
                          )
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                {/* Downloadable RPA Agent & SAP Bot Kit (Python & Node.js) */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 lg:p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Code2 className="w-4 h-4 text-[#1E60A8]" />
                        <span>Automatización en Python (Clara + Work Manager :8037) y Bots SAP</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Programa y ejecuta tu extractor directamente en <strong>Python</strong> (igual a tu acceso a WM): usa <code className="font-mono">clara_wm_agent.py</code> como puente en vivo en <code className="font-mono">:4780</code> o <code className="font-mono">clara_wm_standalone.py</code> para generar el JSON e importarlo.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPythonKitModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-lg cursor-pointer shrink-0"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      <span>Ver / Copiar Código Python</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Kit Python RPA (Playwright + Requests · Clara & Work Manager)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(
                        [
                          { key: 'python_agent_py', label: 'clara_wm_agent.py (Puente HTTP Python)' },
                          { key: 'python_standalone_py', label: 'clara_wm_standalone.py (Extractor CLI)' },
                          { key: 'python_requirements', label: 'requirements_clara_wm.txt' },
                          { key: 'python_env_example', label: '.env.python.example (Credenciales/URLs)' },
                          { key: 'python_readme', label: 'README_PYTHON_RPA.md (Guía Python)' },
                          { key: 'sap_python_bot', label: 'sap_posting_bot.py (SAP GUI FB60)' },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => downloadAgentTemplateFile(item.key)}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-slate-800 bg-sky-50/70 hover:bg-sky-100/80 border border-sky-200 rounded-xl cursor-pointer text-left"
                        >
                          <span className="truncate">{item.label}</span>
                          <Download className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Alternativa Node.js (Agente Puente & SAP OData)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(
                        [
                          { key: 'agent_mjs', label: 'agent.mjs (Servidor Node.js)' },
                          { key: 'agent_package_json', label: 'package.json (Node.js)' },
                          { key: 'sap_odata_bot', label: 'sap_odata_poster.mjs (SAP OData)' },
                          { key: 'agent_readme', label: 'README_AGENT_PREMEX.md' },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => downloadAgentTemplateFile(item.key)}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer text-left"
                        >
                          <span className="truncate">{item.label}</span>
                          <Download className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Execution Log (Bitácora) */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    Bitácora de Ejecuciones RPA, Cargas IA y Despachos SAP
                  </h3>
                  <span className="text-xs text-slate-500 tabular-nums">{data.batchLogs.length} eventos</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-2.5 px-3.5">Fecha / Hora</th>
                        <th className="py-2.5 px-3.5">Sistema / Tipo</th>
                        <th className="py-2.5 px-3.5">Archivo / Acción</th>
                        <th className="py-2.5 px-3.5 text-right">Reg.</th>
                        <th className="py-2.5 px-3.5">Usuario</th>
                        <th className="py-2.5 px-3.5">Detalle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {data.batchLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            Aún no hay ejecuciones registradas en la bitácora.
                          </td>
                        </tr>
                      ) : (
                        data.batchLogs.map((log) => (
                          <tr key={log.id}>
                            <td className="py-2.5 px-3.5 font-mono text-slate-500 whitespace-nowrap">
                              {log.createdAtIso.replace('T', ' ').slice(0, 16)}
                            </td>
                            <td className="py-2.5 px-3.5 font-semibold text-slate-800 whitespace-nowrap">
                              {log.erp} · {log.tipo}
                            </td>
                            <td className="py-2.5 px-3.5 font-mono text-slate-700">{log.archivoNombre}</td>
                            <td className="py-2.5 px-3.5 text-right font-mono tabular-nums">
                              {log.cantidadRegistros}
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-600">{log.createdBy}</td>
                            <td className="py-2.5 px-3.5 text-slate-600 max-w-[280px] truncate" title={log.detalle}>
                              {log.detalle || 'Completado'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Transaction Inspection & Invoice AI Edit Modal */}
      {editingTx && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setEditingTxId(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {editingTx.claraTxId || editingTx.id} · {editingTx.sociedad}
                </div>
                <h3 className="text-base font-bold text-slate-900">{editingTx.comercio}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingTxId(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <div className="font-bold text-slate-800">
                    Soporte adjunto: {editingTx.facturaArchivoNombre || 'Ninguno en esta sesión'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {editingTx.facturaCuadreNota || 'Sube imagen o PDF para extraer con Gemini IA.'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {invoicePreviewUrls[editingTx.id] && (
                    <a
                      href={invoicePreviewUrls[editingTx.id]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 font-semibold text-[#1E60A8] bg-white border border-slate-200 rounded-lg"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Ver Archivo</span>
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={!permissions.canOperate || isScanningInvoices}
                    onClick={() => singleInvoiceInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-lg cursor-pointer disabled:opacity-45"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Escanear Factura IA</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">N° Factura Oficial</label>
                  <input
                    type="text"
                    disabled={!permissions.canOperate}
                    value={editingTx.facturaNumero || ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      appendLogAndReconcile((prev) => ({
                        next: {
                          ...prev,
                          transactions: prev.transactions.map((t) =>
                            t.id === editingTx.id
                              ? { ...t, facturaNumero: v, workManagerNumeroFactura: v }
                              : t
                          ),
                        },
                      }));
                    }}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Fecha Factura</label>
                  <input
                    type="date"
                    disabled={!permissions.canOperate}
                    value={editingTx.facturaFecha || editingTx.fecha}
                    onChange={(e) => {
                      const v = e.target.value;
                      appendLogAndReconcile((prev) => ({
                        next: {
                          ...prev,
                          transactions: prev.transactions.map((t) =>
                            t.id === editingTx.id ? { ...t, facturaFecha: v } : t
                          ),
                        },
                      }));
                    }}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">NIT Emisor</label>
                  <input
                    type="text"
                    disabled={!permissions.canOperate}
                    value={editingTx.facturaNit || editingTx.nitComercio || ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      appendLogAndReconcile((prev) => ({
                        next: {
                          ...prev,
                          transactions: prev.transactions.map((t) =>
                            t.id === editingTx.id ? { ...t, facturaNit: v, nitComercio: v } : t
                          ),
                        },
                      }));
                    }}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Subtotal Factura</label>
                  <input
                    type="number"
                    disabled={!permissions.canOperate}
                    value={editingTx.facturaSubtotal ?? ''}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0;
                      appendLogAndReconcile((prev) => ({
                        next: {
                          ...prev,
                          transactions: prev.transactions.map((t) =>
                            t.id === editingTx.id ? { ...t, facturaSubtotal: v } : t
                          ),
                        },
                      }));
                    }}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Impuesto (IVA / IC)</label>
                  <input
                    type="number"
                    disabled={!permissions.canOperate}
                    value={editingTx.facturaImpuesto ?? ''}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0;
                      appendLogAndReconcile((prev) => ({
                        next: {
                          ...prev,
                          transactions: prev.transactions.map((t) =>
                            t.id === editingTx.id ? { ...t, facturaImpuesto: v } : t
                          ),
                        },
                      }));
                    }}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Total Factura</label>
                  <input
                    type="number"
                    disabled={!permissions.canOperate}
                    value={editingTx.facturaTotal ?? ''}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0;
                      appendLogAndReconcile((prev) => ({
                        next: {
                          ...prev,
                          transactions: prev.transactions.map((t) =>
                            t.id === editingTx.id ? { ...t, facturaTotal: v } : t
                          ),
                        },
                      }));
                    }}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Origen del Gasto</label>
                  <select
                    disabled={!permissions.canOperate}
                    value={editingTx.origenGasto}
                    onChange={(e) => {
                      const orig = e.target.value === 'exterior' ? 'exterior' : 'nacional';
                      appendLogAndReconcile((prev) => ({
                        next: {
                          ...prev,
                          transactions: prev.transactions.map((t) =>
                            t.id === editingTx.id ? { ...t, origenGasto: orig } : t
                          ),
                        },
                      }));
                    }}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="nacional">Nacional (Requiere Work Manager)</option>
                    <option value="exterior">Exterior (Exento de Work Manager)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">CUFE / CUDE</label>
                  <input
                    type="text"
                    disabled={!permissions.canOperate}
                    value={editingTx.facturaCufe || ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      onUpdateData(
                        (prev) => ({
                          ...prev,
                          transactions: prev.transactions.map((t) =>
                            t.id === editingTx.id ? { ...t, facturaCufe: v } : t
                          ),
                        }),
                        true
                      );
                    }}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              {permissions.canOperate ? (
                <button
                  type="button"
                  onClick={() => {
                    const idToDelete = editingTx.id;
                    setEditingTxId(null);
                    appendLogAndReconcile((prev) => ({
                      next: {
                        ...prev,
                        transactions: prev.transactions.filter((t) => t.id !== idToDelete),
                      },
                    }));
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar Movimiento</span>
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => setEditingTxId(null)}
                className="px-4 py-2 text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl cursor-pointer"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Manual Expense Modal */}
      {showAddTxModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowAddTxModal(false)}
        >
          <form
            onSubmit={handleCreateManualTx}
            className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Registrar Gasto Clara Manual</h3>
              <button
                type="button"
                onClick={() => setShowAddTxModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Fecha</label>
                <input
                  type="date"
                  required
                  value={newTxForm.fecha}
                  onChange={(e) => setNewTxForm((f) => ({ ...f, fecha: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Sociedad</label>
                <input
                  type="text"
                  required
                  value={newTxForm.sociedad}
                  onChange={(e) => setNewTxForm((f) => ({ ...f, sociedad: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-600 mb-1">Comercio / Proveedor</label>
                <input
                  type="text"
                  required
                  value={newTxForm.comercio}
                  onChange={(e) => setNewTxForm((f) => ({ ...f, comercio: e.target.value }))}
                  placeholder="Ej. AVIANCA.COM o HOTEL DANN CARLTON"
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">NIT Comercio</label>
                <input
                  type="text"
                  value={newTxForm.nitComercio}
                  onChange={(e) => setNewTxForm((f) => ({ ...f, nitComercio: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Tarjetahabiente</label>
                <input
                  type="text"
                  value={newTxForm.tarjetahabiente}
                  onChange={(e) => setNewTxForm((f) => ({ ...f, tarjetahabiente: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Moneda</label>
                <select
                  value={newTxForm.moneda}
                  onChange={(e) => setNewTxForm((f) => ({ ...f, moneda: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="COP">COP</option>
                  <option value="USD">USD</option>
                  <option value="GTQ">GTQ</option>
                  <option value="MXN">MXN</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Valor</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newTxForm.valor}
                  onChange={(e) => setNewTxForm((f) => ({ ...f, valor: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-600 mb-1">Centro de Costo Clara</label>
                <input
                  type="text"
                  value={newTxForm.centroCosto}
                  onChange={(e) => setNewTxForm((f) => ({ ...f, centroCosto: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-600 mb-1">Observación / Descripción</label>
                <input
                  type="text"
                  value={newTxForm.observacion}
                  onChange={(e) => setNewTxForm((f) => ({ ...f, observacion: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg"
                />
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddTxModal(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl cursor-pointer"
              >
                Guardar Gasto
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Python RPA Code Viewer & Downloader Modal */}
      {showPythonKitModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowPythonKitModal(false)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 max-w-4xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#1E60A8]">
                  Automatización Python · Clara + Work Manager (:8037)
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Scripts Python Listos para Usar y Personalizar
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPythonKitModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { key: 'python_agent_py', label: 'clara_wm_agent.py (Puente HTTP)' },
                    { key: 'python_standalone_py', label: 'clara_wm_standalone.py (CLI)' },
                    { key: 'python_requirements', label: 'requirements.txt' },
                    { key: 'python_env_example', label: '.env.python.example' },
                    { key: 'python_readme', label: 'README_PYTHON_RPA.md' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setSelectedPythonKey(tab.key);
                      setCopiedPythonCode(false);
                    }}
                    className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      selectedPythonKey === tab.key
                        ? 'bg-[#132B63] text-white'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const spec = getAgentTemplateSpec(selectedPythonKey);
                    await navigator.clipboard?.writeText(spec.content).catch(() => {});
                    setCopiedPythonCode(true);
                    setTimeout(() => setCopiedPythonCode(false), 2000);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer"
                >
                  {copiedPythonCode ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-[#1E60A8]" />
                  )}
                  <span>{copiedPythonCode ? 'Copiado' : 'Copiar código'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadAgentTemplateFile(selectedPythonKey)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar archivo</span>
                </button>
              </div>
            </div>

            <div className="p-4 overflow-auto bg-[#0B1736] text-slate-100 flex-1">
              <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap">
                {getAgentTemplateSpec(selectedPythonKey).content}
              </pre>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <span>
                Tip: Puedes usar <strong>clara_wm_agent.py</strong> en vivo en{' '}
                <code className="font-mono">http://127.0.0.1:4780</code> o importar el JSON generado con{' '}
                <strong>Importar JSON Python</strong>.
              </span>
              <button
                type="button"
                onClick={() => {
                  downloadAgentTemplateFile('python_agent_py');
                  downloadAgentTemplateFile('python_standalone_py');
                  downloadAgentTemplateFile('python_requirements');
                  downloadAgentTemplateFile('python_env_example');
                  downloadAgentTemplateFile('python_readme');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-[#132B63] bg-sky-100 hover:bg-sky-200 rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar los 5 archivos Python</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
