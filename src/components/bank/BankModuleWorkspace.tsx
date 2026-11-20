import React, { useState, useMemo, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  CheckCircle2,
  Cloud,
  AlertTriangle,
  X,
  Building2,
  Lock,
  LockOpen,
  FolderPlus,
  History,
  LayoutDashboard,
  AlertCircle,
  Landmark,
} from 'lucide-react';
import {
  ActiveModuleId,
  BankAccount,
  BankClosedReconciliation,
  BankMatchGroup,
  BankReconcilingSection,
  BankSociety,
  BankStatementItem,
  BankTab,
  BookLedgerItem,
  EffectivePermissions,
  ModuleCompanyEntry,
  SapBalanceRow,
  SapOpenItem,
} from '../../types';
import {
  classifySapOpenItem,
  computeBankReconciliationSummary,
  deriveSapSubaccounts,
  inferCutoffDateFromMonth,
  normalizePeriodKey,
  resolveAccountBalancesForMonth,
} from '../../utils/bankReconciliation';
import {
  ParsedSapBalanceResult,
  ParsedSapCatalogResult,
  ParsedSapFbl3nResult,
  matchExistingAccount,
} from '../../utils/bankExcel';
import {
  BankBatchSheetEntry,
  BankExportMode,
  exportBankBatchPdf,
  exportSapDeliverableWorkbook,
  generateBankBatchPdfBytes,
  generateSapDeliverableWorkbookBytes,
} from '../../utils/bankOfficialExport';
import { BankSidebar } from './BankSidebar';
import { BankHeader } from './BankHeader';
import { BankResumenView } from './BankResumenView';
import { BankHistorialView } from './BankHistorialView';
import { BankPendientesView } from './BankPendientesView';
import { BankCuentasView } from './BankCuentasView';
import { BankCargaView } from './BankCargaView';
import { AddReconcilingItemPayload } from './BankOfficialSheet';
import { BankPrintPreviewModal } from './BankPrintPreviewModal';
import {
  BankExportAccountItem,
  BankExportFormat,
  BankExportModal,
} from './BankExportModal';
import { BankEmailModal } from './BankEmailModal';
import {
  BlockedOpenNoticeModal,
  CloseReconciliationModal,
  OpenReconciliationModal,
} from './BankCycleModals';

export interface BankWorkspaceData {
  docId: string;
  societies: BankSociety[];
  accounts: BankAccount[];
  sapOpenItems: SapOpenItem[];
  sapBalanceRows: SapBalanceRow[];
  statementItems: BankStatementItem[];
  ledgerItems: BookLedgerItem[];
  matches: BankMatchGroup[];
  selectedAccountId: string;
  selectedMonth: string;
  /** Periodo actualmente abierto. null indica que la última conciliación ya fue cerrada y se requiere abrir una nueva. */
  openPeriod: string | null;
  /** Archivo inmutable de conciliaciones cerradas (más reciente primero). */
  closedReconciliations: BankClosedReconciliation[];
  lastSavedAtIso: string | null;
  hasUnsavedChanges: boolean;
}

interface BankModuleWorkspaceProps {
  data: BankWorkspaceData;
  onUpdateData: (
    updater: (prev: BankWorkspaceData) => BankWorkspaceData,
    markUnsaved?: boolean
  ) => void;
  onSaveToCloud: (overrideData?: BankWorkspaceData) => Promise<void>;
  currentUser: User | null;
  accessToken?: string | null;
  onSignInWithGoogle: () => void;
  onReconnectWorkspace?: () => Promise<string | null>;
  onInvalidateWorkspaceToken?: () => void;
  onSignOut: () => void;
  onSwitchModule: (moduleId: ActiveModuleId) => void;
  permissions: EffectivePermissions;
  moduleCompanies?: ModuleCompanyEntry[];
}

/**
 * Determines the signed SAP FBL3N amount consistent with the chosen deliverable section
 * and SAP document class so the item naturally squares in the official bridge.
 */
const signedImporteForSection = (
  section: BankReconcilingSection,
  absValor: number
): number => {
  const abs = Math.abs(Math.round(absValor * 100) / 100);
  if (section === 'menos_cheques_pendientes' || section === 'mas_notas_debito_libros') {
    return -abs;
  }
  return abs;
};

export const BankModuleWorkspace: React.FC<BankModuleWorkspaceProps> = ({
  data,
  onUpdateData,
  onSaveToCloud,
  currentUser,
  accessToken,
  onSignInWithGoogle,
  onReconnectWorkspace,
  onInvalidateWorkspaceToken,
  onSignOut,
  onSwitchModule,
  permissions,
  moduleCompanies = [],
}) => {
  const [activeTab, setActiveTab] = useState<BankTab>('resumen');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSavingCloud, setIsSavingCloud] = useState(false);
  const [exportModalConfig, setExportModalConfig] = useState<{
    format: BankExportFormat;
    mode: BankExportMode;
    societyKey?: string;
    accountId?: string;
  } | null>(null);
  const [emailModalConfig, setEmailModalConfig] = useState<{
    societyKey?: string;
    accountId?: string;
  } | null>(null);
  const [printPreviewState, setPrintPreviewState] = useState<{
    entries: BankBatchSheetEntry[];
    selectedItems: BankExportAccountItem[];
    mode: BankExportMode;
    scopeLabel: string;
  } | null>(null);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);
  const [isBlockedOpenModalOpen, setIsBlockedOpenModalOpen] = useState(false);
  const [pendingAccountFilterId, setPendingAccountFilterId] = useState<string | undefined>(
    undefined
  );
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (permissions.isReadOnly && activeTab === 'carga') {
      setActiveTab('resumen');
    }
  }, [permissions.isReadOnly, activeTab]);

  const showFeedback = (type: 'success' | 'info' | 'error', message: string) => {
    setFeedbackBanner({ type, message });
  };

  const selectedAccount = useMemo(
    () =>
      data.accounts.find((a) => a.id === data.selectedAccountId) ||
      data.accounts[0] ||
      null,
    [data.accounts, data.selectedAccountId]
  );

  const closedPeriodKeys = useMemo(
    () => new Set(data.closedReconciliations.map((c) => normalizePeriodKey(c.period))),
    [data.closedReconciliations]
  );

  // Collect all periods across open period, closed history, per-month balances, and SAP rows
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    if (data.openPeriod) set.add(data.openPeriod);
    data.closedReconciliations.forEach((c) => c.period && set.add(c.period));
    data.accounts.forEach((acc) => {
      if (acc.saldosPorMes) {
        Object.keys(acc.saldosPorMes).forEach((m) => m && set.add(m));
      }
    });
    data.sapBalanceRows.forEach((r) => r.mes && set.add(r.mes));
    data.sapOpenItems.forEach((i) => i.mes && set.add(i.mes));
    if (set.size === 0) set.add('Octubre 2026');
    return Array.from(set);
  }, [
    data.openPeriod,
    data.closedReconciliations,
    data.accounts,
    data.sapBalanceRows,
    data.sapOpenItems,
  ]);

  const effectiveMonth =
    data.selectedMonth === 'ALL' || !data.selectedMonth
      ? data.openPeriod || availableMonths[0] || 'Octubre 2026'
      : data.selectedMonth;

  const isSelectedPeriodClosed = useMemo(() => {
    if (closedPeriodKeys.has(normalizePeriodKey(effectiveMonth))) return true;
    if (!data.openPeriod) return true;
    return normalizePeriodKey(effectiveMonth) !== normalizePeriodKey(data.openPeriod);
  }, [closedPeriodKeys, effectiveMonth, data.openPeriod]);

  const isOperationalReadOnly = permissions.isReadOnly || isSelectedPeriodClosed;

  const summary = useMemo(
    () =>
      computeBankReconciliationSummary(
        selectedAccount,
        data.statementItems,
        data.ledgerItems,
        data.matches,
        effectiveMonth,
        data.sapOpenItems
      ),
    [
      selectedAccount,
      data.statementItems,
      data.ledgerItems,
      data.matches,
      effectiveMonth,
      data.sapOpenItems,
    ]
  );

  const openPeriodAccountSummaries = useMemo(() => {
    const targetPeriod = data.openPeriod || effectiveMonth;
    return data.accounts.map((acc) => ({
      account: acc,
      summary: computeBankReconciliationSummary(
        acc,
        data.statementItems,
        data.ledgerItems,
        data.matches,
        targetPeriod,
        data.sapOpenItems
      ),
    }));
  }, [
    data.accounts,
    data.statementItems,
    data.ledgerItems,
    data.matches,
    data.openPeriod,
    effectiveMonth,
    data.sapOpenItems,
  ]);

  const activePeriodExportItems = useMemo<BankExportAccountItem[]>(() => {
    return data.accounts.map((acc) => ({
      account: acc,
      period: effectiveMonth,
      summary: computeBankReconciliationSummary(
        acc,
        data.statementItems,
        data.ledgerItems,
        data.matches,
        effectiveMonth,
        data.sapOpenItems
      ),
    }));
  }, [
    data.accounts,
    data.statementItems,
    data.ledgerItems,
    data.matches,
    effectiveMonth,
    data.sapOpenItems,
  ]);

  const sidebarMetrics = useMemo(() => {
    let squaredCount = 0;
    let totalOpenItems = 0;
    openPeriodAccountSummaries.forEach(({ summary: s }) => {
      if (Math.abs(s.diferenciaNeta) <= 1) squaredCount += 1;
      totalOpenItems += s.sapItemsCount;
    });
    return { squaredCount, totalOpenItems };
  }, [openPeriodAccountSummaries]);

  // ============================================================================
  // Live Saldo Extracto Edit & Sync to Subcuenta 00
  // ============================================================================

  const handleUpdateSaldoExtracto = (accountId: string, newExtracto: number) => {
    if (isOperationalReadOnly) return;
    const nowIso = new Date().toISOString();
    const rounded = Math.round(newExtracto * 100) / 100;

    onUpdateData(
      (prev) => ({
        ...prev,
        accounts: prev.accounts.map((acc) => {
          if (acc.id !== accountId) return acc;
          const resolved = resolveAccountBalancesForMonth(acc, effectiveMonth);
          const isManual = resolved.hasSapSubaccounts
            ? Math.abs(rounded - resolved.saldoCuenta00) > 0.01
            : true;
          return {
            ...acc,
            saldoFinalExtracto: rounded,
            saldoExtractoManual: isManual,
            saldosPorMes: {
              ...(acc.saldosPorMes || {}),
              [effectiveMonth]: {
                ...(acc.saldosPorMes?.[effectiveMonth] || {}),
                saldoLibros: resolved.saldoLibros,
                saldoExtracto: rounded,
                saldoCuenta00: resolved.hasSapSubaccounts ? resolved.saldoCuenta00 : undefined,
                saldoCuenta01: resolved.hasSapSubaccounts ? resolved.saldoCuenta01 : undefined,
                saldoCuenta02: resolved.hasSapSubaccounts ? resolved.saldoCuenta02 : undefined,
                saldoExtractoManual: isManual,
                fechaCorte: resolved.fechaCorte,
                fuenteExtracto: 'Edición directa en formato',
                updatedAtIso: nowIso,
              },
            },
          };
        }),
      }),
      true
    );
  };

  const handleSyncExtractoToCta00 = (accountId: string) => {
    if (isOperationalReadOnly) return;
    const targetAcc = data.accounts.find((a) => a.id === accountId);
    if (!targetAcc) return;
    const resolved = resolveAccountBalancesForMonth(targetAcc, effectiveMonth);
    handleUpdateSaldoExtracto(accountId, resolved.saldoCuenta00);
    showFeedback(
      'success',
      `Saldo en Extracto de ${targetAcc.banco} igualado a Subcuenta 00.`
    );
  };

  const handleUpdateMonthlyBalances = (
    accountId: string,
    patch: {
      saldoLibros: number;
      saldoExtracto: number;
      saldoCuenta00?: number;
      saldoCuenta01?: number;
      saldoCuenta02?: number;
      fechaCorte: string;
    }
  ) => {
    if (isOperationalReadOnly) return;
    const nowIso = new Date().toISOString();
    const hasSap =
      patch.saldoCuenta00 !== undefined ||
      patch.saldoCuenta01 !== undefined ||
      patch.saldoCuenta02 !== undefined;
    const isManual = hasSap
      ? Math.abs(patch.saldoExtracto - (patch.saldoCuenta00 ?? 0)) > 0.01
      : false;

    onUpdateData(
      (prev) => ({
        ...prev,
        accounts: prev.accounts.map((acc) => {
          if (acc.id !== accountId) return acc;
          return {
            ...acc,
            fechaCorte: patch.fechaCorte,
            saldoCuenta00: hasSap ? patch.saldoCuenta00 ?? 0 : acc.saldoCuenta00,
            saldoCuenta01: hasSap ? patch.saldoCuenta01 ?? 0 : acc.saldoCuenta01,
            saldoCuenta02: hasSap ? patch.saldoCuenta02 ?? 0 : acc.saldoCuenta02,
            saldoFinalLibros: patch.saldoLibros,
            saldoFinalExtracto: patch.saldoExtracto,
            saldoExtractoManual: isManual,
            saldosPorMes: {
              ...(acc.saldosPorMes || {}),
              [effectiveMonth]: {
                ...(acc.saldosPorMes?.[effectiveMonth] || {}),
                saldoLibros: patch.saldoLibros,
                saldoExtracto: patch.saldoExtracto,
                saldoCuenta00: hasSap ? patch.saldoCuenta00 ?? 0 : undefined,
                saldoCuenta01: hasSap ? patch.saldoCuenta01 ?? 0 : undefined,
                saldoCuenta02: hasSap ? patch.saldoCuenta02 ?? 0 : undefined,
                saldoExtractoManual: isManual,
                fechaCorte: patch.fechaCorte,
                fuenteLibros: 'Edición subcuentas 00/01/02',
                fuenteExtracto: isManual ? 'Edición directa en formato' : 'Precarga Cta 00 SAP',
                updatedAtIso: nowIso,
              },
            },
          };
        }),
      }),
      true
    );
    showFeedback(
      'success',
      `Subcuentas 00 / 01 / 02 y saldo extracto actualizados para ${effectiveMonth}.`
    );
  };

  // ============================================================================
  // SAP Open Items CRUD & Reclassification
  // ============================================================================

  const handleAddReconcilingItem = (
    accountId: string,
    payload: AddReconcilingItemPayload
  ) => {
    if (isOperationalReadOnly) return;
    const acc = data.accounts.find((a) => a.id === accountId);
    if (!acc) return;

    const signedImporte = signedImporteForSection(payload.section, payload.valor);
    const seccionAuto = classifySapOpenItem(payload.claseDocumento, signedImporte);
    const gl =
      payload.subcuentaTipo === '01'
        ? acc.cuentaMayor01 || `${acc.raizContable || ''}01`
        : payload.subcuentaTipo === '02'
        ? acc.cuentaMayor02 || `${acc.raizContable || ''}02`
        : acc.cuentaMayor00 || acc.codigoContable || '';

    const newItem: SapOpenItem = {
      id: `sap-man-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      cuentaId: acc.id,
      sociedadCodigo: acc.codigoSociedad || '1000',
      sociedadNombre: acc.sociedad,
      cuentaMayor: gl,
      raizContable: acc.raizContable || '',
      subcuentaTipo: payload.subcuentaTipo,
      claveRef1: '',
      claveRef3: payload.tercero || '',
      referencia: payload.documento,
      numeroDocumento: payload.documento,
      claseDocumento: payload.claseDocumento,
      fechaDocumento: payload.fecha,
      fechaContabilizacion: payload.fecha,
      importeMonedaLocal: signedImporte,
      monedaLocal: acc.moneda,
      texto: payload.concepto,
      mes: effectiveMonth,
      seccionAuto,
      seccionManual: seccionAuto !== payload.section ? payload.section : undefined,
      comentario: payload.comentario,
      origen: 'manual',
    };

    onUpdateData(
      (prev) => ({
        ...prev,
        sapOpenItems: [...prev.sapOpenItems, newItem],
      }),
      true
    );
    showFeedback('success', `Partida "${payload.concepto}" agregada a la conciliación.`);
  };

  const handleAddSapOpenItem = (itemData: Omit<SapOpenItem, 'id' | 'seccionAuto'>) => {
    if (isOperationalReadOnly) return;
    const seccionAuto = classifySapOpenItem(
      itemData.claseDocumento,
      itemData.importeMonedaLocal
    );
    const newItem: SapOpenItem = {
      ...itemData,
      id: `sap-open-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      seccionAuto,
    };
    onUpdateData(
      (prev) => ({
        ...prev,
        sapOpenItems: [...prev.sapOpenItems, newItem],
      }),
      true
    );
    showFeedback('success', `Partida abierta ${newItem.numeroDocumento} registrada.`);
  };

  const handleUpdateSapOpenItem = (itemId: string, patch: Partial<SapOpenItem>) => {
    if (isOperationalReadOnly) return;
    onUpdateData(
      (prev) => ({
        ...prev,
        sapOpenItems: prev.sapOpenItems.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
      }),
      true
    );
    showFeedback('success', 'Partida abierta actualizada.');
  };

  const handleReclassifySapOpenItem = (
    itemId: string,
    manualSection?: BankReconcilingSection
  ) => {
    if (isOperationalReadOnly) return;
    onUpdateData(
      (prev) => ({
        ...prev,
        sapOpenItems: prev.sapOpenItems.map((i) =>
          i.id === itemId ? { ...i, seccionManual: manualSection } : i
        ),
      }),
      true
    );
    showFeedback(
      'info',
      manualSection
        ? 'Partida reclasificada manualmente en el entregable oficial.'
        : 'Partida restablecida a clasificación automática SAP.'
    );
  };

  const handleDeleteSapOpenItem = (itemId: string) => {
    if (isOperationalReadOnly) return;
    onUpdateData(
      (prev) => ({
        ...prev,
        sapOpenItems: prev.sapOpenItems.filter((i) => i.id !== itemId),
      }),
      true
    );
    showFeedback('info', 'Partida abierta eliminada.');
  };

  const handleDeleteLineItem = (source: 'sap' | 'bank' | 'ledger', itemId: string) => {
    if (isOperationalReadOnly) return;
    if (source === 'sap') {
      handleDeleteSapOpenItem(itemId);
      return;
    }
    onUpdateData(
      (prev) => ({
        ...prev,
        statementItems:
          source === 'bank'
            ? prev.statementItems.filter((i) => i.id !== itemId)
            : prev.statementItems,
        ledgerItems:
          source === 'ledger'
            ? prev.ledgerItems.filter((i) => i.id !== itemId)
            : prev.ledgerItems,
        matches: prev.matches.filter((m) =>
          source === 'bank'
            ? !m.bankItemIds.includes(itemId)
            : !m.ledgerItemIds.includes(itemId)
        ),
      }),
      true
    );
    showFeedback('info', 'Partida conciliatoria eliminada.');
  };

  // ============================================================================
  // Societies Master CRUD
  // ============================================================================

  const handleAddSociety = (society: BankSociety) => {
    if (permissions.isReadOnly || !permissions.canManageMasterData) return;
    onUpdateData(
      (prev) => ({
        ...prev,
        societies: [...prev.societies, society],
      }),
      true
    );
    showFeedback('success', `Sociedad ${society.codigoSociedad} · ${society.nombre} creada.`);
  };

  const handleUpdateSociety = (society: BankSociety) => {
    if (permissions.isReadOnly || !permissions.canManageMasterData) return;
    onUpdateData(
      (prev) => ({
        ...prev,
        societies: prev.societies.map((s) => (s.id === society.id ? society : s)),
        accounts: prev.accounts.map((a) =>
          a.codigoSociedad?.toUpperCase() === society.codigoSociedad.toUpperCase()
            ? { ...a, sociedad: society.nombre, pais: society.pais }
            : a
        ),
      }),
      true
    );
    showFeedback('success', `Sociedad ${society.codigoSociedad} · ${society.nombre} actualizada.`);
  };

  const handleDeleteSociety = (societyId: string) => {
    if (permissions.isReadOnly || !permissions.canManageMasterData) return;
    onUpdateData(
      (prev) => ({
        ...prev,
        societies: prev.societies.filter((s) => s.id !== societyId),
      }),
      true
    );
    showFeedback('info', 'Sociedad eliminada del maestro.');
  };

  // ============================================================================
  // SAP Bulk Imports (Catalog, Balance 00/01/02, FBL3N Open Items)
  // ============================================================================

  const handleApplySapCatalogImport = (result: ParsedSapCatalogResult) => {
    if (permissions.isReadOnly) return;
    onUpdateData((prev) => {
      const nextSocieties = [...prev.societies];
      const nextAccounts = [...prev.accounts];

      result.societies.forEach((s, idx) => {
        const existingIdx = nextSocieties.findIndex(
          (ex) => ex.codigoSociedad.trim().toUpperCase() === s.codigoSociedad.trim().toUpperCase()
        );
        if (existingIdx >= 0) {
          nextSocieties[existingIdx] = {
            ...nextSocieties[existingIdx],
            nombre: s.nombre,
            pais: s.pais,
            moneda: s.moneda,
            nit: s.nit || nextSocieties[existingIdx].nit,
          };
        } else {
          nextSocieties.push({
            id: `soc-imp-${Date.now()}-${idx}`,
            codigoSociedad: s.codigoSociedad,
            nombre: s.nombre,
            pais: s.pais,
            moneda: s.moneda,
            nit: s.nit,
            activa: true,
          });
        }
      });

      result.accounts.forEach((a, idx) => {
        let targetIdx = a.matchedAccountId
          ? nextAccounts.findIndex((ex) => ex.id === a.matchedAccountId)
          : -1;
        if (targetIdx < 0) {
          const found = matchExistingAccount(
            nextAccounts,
            a.sociedadNombre,
            a.banco,
            a.numeroCuenta,
            a.cuentaMayor00,
            a.codigoSociedad
          );
          if (found) targetIdx = nextAccounts.findIndex((ex) => ex.id === found.id);
        }

        if (targetIdx >= 0) {
          nextAccounts[targetIdx] = {
            ...nextAccounts[targetIdx],
            codigoSociedad: a.codigoSociedad,
            sociedad: a.sociedadNombre,
            banco: a.banco,
            numeroCuenta: a.numeroCuenta,
            productoCuenta: a.productoCuenta || nextAccounts[targetIdx].productoCuenta,
            tipoCuenta: a.tipoCuenta,
            moneda: a.moneda,
            pais: a.pais,
            raizContable: a.raizContable || nextAccounts[targetIdx].raizContable,
            codigoContable: a.cuentaMayor00 || nextAccounts[targetIdx].codigoContable,
            cuentaMayor00: a.cuentaMayor00 || nextAccounts[targetIdx].cuentaMayor00,
            cuentaMayor01: a.cuentaMayor01 || nextAccounts[targetIdx].cuentaMayor01,
            cuentaMayor02: a.cuentaMayor02 || nextAccounts[targetIdx].cuentaMayor02,
          };
        } else {
          nextAccounts.push({
            id: `acc-cat-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
            codigoSociedad: a.codigoSociedad,
            sociedad: a.sociedadNombre,
            banco: a.banco,
            numeroCuenta: a.numeroCuenta,
            productoCuenta: a.productoCuenta || undefined,
            tipoCuenta: a.tipoCuenta,
            moneda: a.moneda,
            pais: a.pais,
            codigoContable: a.cuentaMayor00 || undefined,
            raizContable: a.raizContable || undefined,
            cuentaMayor00: a.cuentaMayor00 || undefined,
            cuentaMayor01: a.cuentaMayor01 || undefined,
            cuentaMayor02: a.cuentaMayor02 || undefined,
            saldoCuenta00: 0,
            saldoCuenta01: 0,
            saldoCuenta02: 0,
            saldoExtractoManual: false,
            fechaCorte: inferCutoffDateFromMonth(effectiveMonth),
            saldoInicialLibros: 0,
            saldoFinalLibros: 0,
            saldoFinalExtracto: 0,
          });
        }
      });

      return {
        ...prev,
        societies: nextSocieties,
        accounts: nextAccounts,
        selectedAccountId: prev.selectedAccountId || nextAccounts[0]?.id || '',
      };
    }, true);

    showFeedback(
      'success',
      `Catálogo aplicado: ${result.societies.length} sociedad(es) y ${result.accounts.length} cuenta(s) bancaria(s) sincronizadas.`
    );
    setActiveTab('cuentas');
  };

  const handleApplySapBalanceImport = (result: ParsedSapBalanceResult) => {
    if (isOperationalReadOnly || result.groups.length === 0) return;
    const closedTarget = result.groups.find((g) =>
      closedPeriodKeys.has(normalizePeriodKey(g.mes))
    );
    if (closedTarget) {
      showFeedback(
        'error',
        `No se puede cargar Balance en el periodo "${closedTarget.mes}" porque ya se encuentra cerrado.`
      );
      return;
    }
    let createdCount = 0;
    let updatedCount = 0;

    onUpdateData((prev) => {
      const nextSocieties = [...prev.societies];
      const nextAccounts = prev.accounts.map((a) => ({
        ...a,
        saldosPorMes: { ...(a.saldosPorMes || {}) },
      }));
      const nowIso = new Date().toISOString();
      let focusAccountId: string | null = null;
      let focusMonth: string | null = null;
      const touchedMonths = new Set<string>();

      result.groups.forEach((g, idx) => {
        touchedMonths.add(g.mes);
        if (!focusMonth && g.mes) focusMonth = g.mes;

        // Auto-create Society if missing
        const socExists = nextSocieties.some(
          (s) => s.codigoSociedad.trim().toUpperCase() === g.sociedadCodigo.trim().toUpperCase()
        );
        if (!socExists) {
          nextSocieties.push({
            id: `soc-bal-${Date.now()}-${idx}`,
            codigoSociedad: g.sociedadCodigo,
            nombre: g.sociedadNombre,
            pais: g.moneda === 'COP' ? 'Colombia' : g.moneda === 'GTQ' ? 'Guatemala' : 'Estados Unidos',
            moneda: g.moneda,
            activa: true,
          });
        }

        let targetIdx = g.matchedAccountId
          ? nextAccounts.findIndex((a) => a.id === g.matchedAccountId)
          : -1;
        if (targetIdx < 0) {
          const found = matchExistingAccount(
            nextAccounts,
            g.sociedadNombre,
            g.bancoInferido,
            '',
            g.cuentaMayor00,
            g.sociedadCodigo
          );
          if (found) targetIdx = nextAccounts.findIndex((a) => a.id === found.id);
        }

        const monthEntry = {
          saldoLibros: g.saldoLibrosTotal,
          saldoExtracto: g.saldoExtractoPreload,
          saldoCuenta00: g.saldoCuenta00,
          saldoCuenta01: g.saldoCuenta01,
          saldoCuenta02: g.saldoCuenta02,
          saldoExtractoManual: false,
          fechaCorte: g.fechaCorte,
          fuenteLibros: 'Balance SAP 00/01/02',
          fuenteExtracto: 'Precarga Cta 00 SAP',
          updatedAtIso: nowIso,
        };

        if (targetIdx >= 0) {
          const existing = nextAccounts[targetIdx];
          nextAccounts[targetIdx] = {
            ...existing,
            codigoSociedad: existing.codigoSociedad || g.sociedadCodigo,
            raizContable: existing.raizContable || g.raizContable,
            codigoContable: existing.codigoContable || g.cuentaMayor00,
            cuentaMayor00: existing.cuentaMayor00 || g.cuentaMayor00,
            cuentaMayor01: existing.cuentaMayor01 || g.cuentaMayor01,
            cuentaMayor02: existing.cuentaMayor02 || g.cuentaMayor02,
            saldoCuenta00: g.saldoCuenta00,
            saldoCuenta01: g.saldoCuenta01,
            saldoCuenta02: g.saldoCuenta02,
            saldoFinalLibros: g.saldoLibrosTotal,
            saldoFinalExtracto: g.saldoExtractoPreload,
            saldoExtractoManual: false,
            fechaCorte: g.fechaCorte,
            saldosPorMes: {
              ...(existing.saldosPorMes || {}),
              [g.mes]: monthEntry,
            },
          };
          updatedCount += 1;
          if (!focusAccountId) focusAccountId = existing.id;
        } else {
          const newAccId = `acc-bal-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`;
          nextAccounts.push({
            id: newAccId,
            codigoSociedad: g.sociedadCodigo,
            sociedad: g.sociedadNombre,
            banco: g.bancoInferido,
            numeroCuenta: g.raizContable,
            productoCuenta: g.denominacionPrincipal,
            codigoContable: g.cuentaMayor00,
            raizContable: g.raizContable,
            cuentaMayor00: g.cuentaMayor00,
            cuentaMayor01: g.cuentaMayor01,
            cuentaMayor02: g.cuentaMayor02,
            pais:
              g.moneda === 'COP'
                ? 'Colombia'
                : g.moneda === 'GTQ'
                ? 'Guatemala'
                : 'Estados Unidos',
            moneda: g.moneda,
            tipoCuenta: 'Corriente',
            saldoCuenta00: g.saldoCuenta00,
            saldoCuenta01: g.saldoCuenta01,
            saldoCuenta02: g.saldoCuenta02,
            saldoExtractoManual: false,
            fechaCorte: g.fechaCorte,
            saldoInicialLibros: g.saldoLibrosTotal,
            saldoFinalLibros: g.saldoLibrosTotal,
            saldoFinalExtracto: g.saldoExtractoPreload,
            saldosPorMes: { [g.mes]: monthEntry },
          });
          createdCount += 1;
          if (!focusAccountId) focusAccountId = newAccId;
        }
      });

      const retainedBalanceRows = prev.sapBalanceRows.filter((r) => !touchedMonths.has(r.mes));

      return {
        ...prev,
        societies: nextSocieties,
        accounts: nextAccounts,
        sapBalanceRows: [...retainedBalanceRows, ...result.rawRows],
        selectedAccountId: focusAccountId || prev.selectedAccountId,
        selectedMonth: focusMonth || prev.selectedMonth,
      };
    }, true);

    showFeedback(
      'success',
      `Balance SAP 00/01/02 aplicado: ${updatedCount} cuenta(s) actualizada(s)${
        createdCount > 0 ? ` y ${createdCount} creada(s) automáticamente` : ''
      }. Saldo Extracto precargado con Cta 00.`
    );
    setActiveTab('resumen');
  };

  const handleApplySapFbl3nImport = (
    result: ParsedSapFbl3nResult,
    mode: 'replace' | 'append'
  ) => {
    if (isOperationalReadOnly || result.items.length === 0) return;
    const closedTarget = result.items.find((row) =>
      closedPeriodKeys.has(normalizePeriodKey(row.mes))
    );
    if (closedTarget) {
      showFeedback(
        'error',
        `No se pueden cargar partidas FBL3N en el periodo "${closedTarget.mes}" porque ya se encuentra cerrado.`
      );
      return;
    }

    onUpdateData((prev) => {
      const nextSocieties = [...prev.societies];
      const nextAccounts = [...prev.accounts];
      const addedOpenItems: SapOpenItem[] = [];
      const touchedScopes = new Set<string>();
      let focusAccountId: string | null = null;
      let focusMonth: string | null = null;

      result.items.forEach((row, idx) => {
        if (!focusMonth && row.mes) focusMonth = row.mes;

        const socExists = nextSocieties.some(
          (s) => s.codigoSociedad.trim().toUpperCase() === row.sociedadCodigo.trim().toUpperCase()
        );
        if (!socExists) {
          nextSocieties.push({
            id: `soc-fbl-${Date.now()}-${idx}`,
            codigoSociedad: row.sociedadCodigo,
            nombre: row.sociedadNombre,
            pais: row.monedaLocal === 'COP' ? 'Colombia' : 'Estados Unidos',
            moneda: row.monedaLocal,
            activa: true,
          });
        }

        let targetAcc =
          (row.matchedAccountId
            ? nextAccounts.find((a) => a.id === row.matchedAccountId)
            : null) ||
          matchExistingAccount(
            nextAccounts,
            row.sociedadNombre,
            '',
            '',
            row.cuentaMayor,
            row.sociedadCodigo
          );

        if (!targetAcc) {
          const derived = deriveSapSubaccounts(row.cuentaMayor);
          const newAccId = `acc-fbl-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`;
          targetAcc = {
            id: newAccId,
            codigoSociedad: row.sociedadCodigo,
            sociedad: row.sociedadNombre,
            banco: `BANCO CTA ${derived.raizContable || row.cuentaMayor}`,
            numeroCuenta: derived.raizContable || row.cuentaMayor,
            codigoContable: derived.cuentaMayor00,
            raizContable: derived.raizContable,
            cuentaMayor00: derived.cuentaMayor00,
            cuentaMayor01: derived.cuentaMayor01,
            cuentaMayor02: derived.cuentaMayor02,
            pais: row.monedaLocal === 'COP' ? 'Colombia' : 'Estados Unidos',
            moneda: row.monedaLocal,
            tipoCuenta: 'Corriente',
            saldoCuenta00: 0,
            saldoCuenta01: 0,
            saldoCuenta02: 0,
            saldoExtractoManual: false,
            fechaCorte: inferCutoffDateFromMonth(row.mes),
            saldoInicialLibros: 0,
            saldoFinalLibros: 0,
            saldoFinalExtracto: 0,
          };
          nextAccounts.push(targetAcc);
        }

        if (!focusAccountId) focusAccountId = targetAcc.id;
        touchedScopes.add(`${targetAcc.id}::${row.mes}`);

        addedOpenItems.push({
          id: `sap-fbl-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
          cuentaId: targetAcc.id,
          sociedadCodigo: row.sociedadCodigo,
          sociedadNombre: targetAcc.sociedad,
          cuentaMayor: row.cuentaMayor,
          raizContable: row.raizContable,
          subcuentaTipo: row.subcuentaTipo,
          claveRef1: row.claveRef1,
          claveRef3: row.claveRef3,
          referencia: row.referencia,
          numeroDocumento: row.numeroDocumento,
          claseDocumento: row.claseDocumento,
          fechaDocumento: row.fechaDocumento,
          fechaContabilizacion: row.fechaContabilizacion,
          importeMonedaLocal: row.importeMonedaLocal,
          monedaLocal: row.monedaLocal,
          texto: row.texto,
          mes: row.mes,
          seccionAuto: row.seccionAuto,
          origen: 'sap_fbl3n',
        });
      });

      const nextOpenItems =
        mode === 'replace'
          ? [
              ...prev.sapOpenItems.filter(
                (i) => !touchedScopes.has(`${i.cuentaId}::${i.mes}`)
              ),
              ...addedOpenItems,
            ]
          : [...prev.sapOpenItems, ...addedOpenItems];

      return {
        ...prev,
        societies: nextSocieties,
        accounts: nextAccounts,
        sapOpenItems: nextOpenItems,
        selectedAccountId: focusAccountId || prev.selectedAccountId,
        selectedMonth: focusMonth || prev.selectedMonth,
      };
    }, true);

    showFeedback(
      'success',
      `Se aplicaron ${result.items.length} partida(s) abierta(s) SAP (FBL3N) con clasificación automática.`
    );
    setActiveTab('resumen');
  };

  // ============================================================================
  // Reconciliation Lifecycle: Close Current & Open Next (with Strict Lock)
  // ============================================================================

  const handleRequestOpenReconciliation = () => {
    if (permissions.isReadOnly) return;
    // Strict sequential lock: never allow opening while a previous reconciliation is still open
    if (data.openPeriod) {
      setIsBlockedOpenModalOpen(true);
      return;
    }
    setIsOpenModalOpen(true);
  };

  const handleConfirmCloseReconciliation = async (notes: string) => {
    if (permissions.isReadOnly || !data.openPeriod) return;
    const closingPeriod = data.openPeriod;
    const nowIso = new Date().toISOString();
    const targetPeriodKey = normalizePeriodKey(closingPeriod);

    // Freeze accounts strictly with resolved balances for the closed period
    const frozenAccounts: BankAccount[] = data.accounts.map((acc) => {
      const resolved = resolveAccountBalancesForMonth(acc, closingPeriod);
      const frozenMonthEntry = {
        saldoLibros: resolved.saldoLibros,
        saldoExtracto: resolved.saldoExtracto,
        saldoCuenta00: resolved.saldoCuenta00,
        saldoCuenta01: resolved.saldoCuenta01,
        saldoCuenta02: resolved.saldoCuenta02,
        saldoExtractoManual: resolved.saldoExtractoManual,
        fechaCorte: resolved.fechaCorte,
        fuenteLibros: resolved.monthEntry?.fuenteLibros || 'Balance SAP 00/01/02',
        fuenteExtracto:
          resolved.monthEntry?.fuenteExtracto ||
          (resolved.saldoExtractoManual ? 'Edición directa en formato' : 'Precarga Cta 00 SAP'),
        updatedAtIso: nowIso,
      };
      return {
        ...acc,
        fechaCorte: resolved.fechaCorte,
        saldoCuenta00: resolved.saldoCuenta00,
        saldoCuenta01: resolved.saldoCuenta01,
        saldoCuenta02: resolved.saldoCuenta02,
        saldoFinalLibros: resolved.saldoLibros,
        saldoFinalExtracto: resolved.saldoExtracto,
        saldoExtractoManual: resolved.saldoExtractoManual,
        saldosPorMes: { [closingPeriod]: frozenMonthEntry },
      };
    });

    const frozenOpenItems = data.sapOpenItems.filter(
      (i) => !i.mes || normalizePeriodKey(i.mes) === targetPeriodKey
    );
    const frozenBalanceRows = data.sapBalanceRows.filter(
      (r) => !r.mes || normalizePeriodKey(r.mes) === targetPeriodKey
    );

    let squaredCount = 0;
    let diffCount = 0;
    frozenAccounts.forEach((acc) => {
      const s = computeBankReconciliationSummary(
        acc,
        [],
        [],
        [],
        closingPeriod,
        frozenOpenItems
      );
      if (Math.abs(s.diferenciaNeta) <= 1) squaredCount += 1;
      else diffCount += 1;
    });

    const snapshot: BankClosedReconciliation = {
      id: `bank-close-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      period: closingPeriod,
      closedAtIso: nowIso,
      closedByName:
        currentUser?.displayName || permissions.displayName || currentUser?.email || 'Usuario',
      closedByEmail: currentUser?.email || permissions.email || undefined,
      notes: notes || undefined,
      societiesCount: data.societies.length,
      accountsCount: frozenAccounts.length,
      squaredAccountsCount: squaredCount,
      diffAccountsCount: diffCount,
      openItemsCount: frozenOpenItems.length,
      societies: data.societies.map((s) => ({ ...s })),
      accounts: frozenAccounts,
      sapOpenItems: frozenOpenItems.map((i) => ({ ...i, mes: closingPeriod })),
      sapBalanceRows: frozenBalanceRows.map((r) => ({ ...r, mes: closingPeriod })),
    };

    const nextClosedList = [
      snapshot,
      ...data.closedReconciliations.filter(
        (c) => normalizePeriodKey(c.period) !== targetPeriodKey
      ),
    ];

    const nextDataSnapshot: BankWorkspaceData = {
      ...data,
      openPeriod: null,
      selectedMonth: closingPeriod,
      closedReconciliations: nextClosedList,
      hasUnsavedChanges: true,
    };

    onUpdateData(
      (prev) => ({
        ...prev,
        openPeriod: null,
        selectedMonth: closingPeriod,
        closedReconciliations: [
          snapshot,
          ...prev.closedReconciliations.filter(
            (c) => normalizePeriodKey(c.period) !== targetPeriodKey
          ),
        ],
      }),
      true
    );

    setIsCloseModalOpen(false);
    showFeedback(
      'success',
      `Conciliación de ${closingPeriod} cerrada y archivada en el Historial. Ya puedes abrir una nueva conciliación.`
    );

    // Best-effort automatic cloud backup when signed in
    if (currentUser) {
      setIsSavingCloud(true);
      try {
        await onSaveToCloud(nextDataSnapshot);
      } catch {
        // Unsaved flag remains true so user can retry manual sync
      } finally {
        setIsSavingCloud(false);
      }
    }
  };

  const handleConfirmOpenReconciliation = async (payload: {
    period: string;
    carryOverOpenItems: boolean;
  }) => {
    if (permissions.isReadOnly) return;
    // Double-check strict sequential lock and duplicate period guard
    if (data.openPeriod) {
      setIsOpenModalOpen(false);
      setIsBlockedOpenModalOpen(true);
      return;
    }
    const targetKey = normalizePeriodKey(payload.period);
    if (data.closedReconciliations.some((c) => normalizePeriodKey(c.period) === targetKey)) {
      showFeedback(
        'error',
        `El periodo "${payload.period}" ya se encuentra cerrado en el Historial. Selecciona un periodo nuevo.`
      );
      return;
    }

    const nowIso = new Date().toISOString();
    const nextCutoff = inferCutoffDateFromMonth(payload.period);
    const latestClosed = data.closedReconciliations[0] || null;

    const preparedAccounts: BankAccount[] = data.accounts.map((acc) => ({
      ...acc,
      fechaCorte: nextCutoff,
      saldoCuenta00: 0,
      saldoCuenta01: 0,
      saldoCuenta02: 0,
      saldoFinalLibros: 0,
      saldoFinalExtracto: 0,
      saldoExtractoManual: false,
      saldosPorMes: {
        ...(acc.saldosPorMes || {}),
        [payload.period]: {
          saldoLibros: 0,
          saldoExtracto: 0,
          saldoCuenta00: 0,
          saldoCuenta01: 0,
          saldoCuenta02: 0,
          saldoExtractoManual: false,
          fechaCorte: nextCutoff,
          fuenteLibros: 'Apertura de periodo',
          fuenteExtracto: 'Pendiente carga SAP',
          updatedAtIso: nowIso,
        },
      },
    }));

    const carriedOpenItems: SapOpenItem[] =
      payload.carryOverOpenItems && latestClosed
        ? latestClosed.sapOpenItems.map((item, idx) => ({
            ...item,
            id: `sap-carry-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
            mes: payload.period,
          }))
        : [];

    const retainedOpenItems = data.sapOpenItems.filter(
      (i) => normalizePeriodKey(i.mes) !== targetKey
    );
    const nextOpenItems = [...retainedOpenItems, ...carriedOpenItems];
    const nextBalanceRows = data.sapBalanceRows.filter(
      (r) => normalizePeriodKey(r.mes) !== targetKey
    );

    const nextDataSnapshot: BankWorkspaceData = {
      ...data,
      accounts: preparedAccounts,
      sapOpenItems: nextOpenItems,
      sapBalanceRows: nextBalanceRows,
      openPeriod: payload.period,
      selectedMonth: payload.period,
      hasUnsavedChanges: true,
    };

    onUpdateData(
      (prev) => ({
        ...prev,
        accounts: preparedAccounts,
        sapOpenItems: nextOpenItems,
        sapBalanceRows: nextBalanceRows,
        openPeriod: payload.period,
        selectedMonth: payload.period,
      }),
      true
    );

    setIsOpenModalOpen(false);
    setActiveTab('resumen');
    showFeedback(
      'success',
      `Nueva conciliación «${payload.period}» abierta correctamente${
        carriedOpenItems.length > 0
          ? ` con ${carriedOpenItems.length} partida(s) abierta(s) arrastrada(s).`
          : '. Lista para cargar Balance SAP 00/01/02 y FBL3N.'
      }`
    );

    if (currentUser) {
      setIsSavingCloud(true);
      try {
        await onSaveToCloud(nextDataSnapshot);
      } catch {
        // Keep unsaved flag so user can retry manual sync
      } finally {
        setIsSavingCloud(false);
      }
    }
  };

  // ============================================================================
  // Individual & Masivo Excel / PDF Exports
  // ============================================================================

  const handleOpenExportModal = (opts: {
    format: BankExportFormat;
    mode: BankExportMode;
    societyKey?: string;
    accountId?: string;
  }) => {
    if (data.accounts.length === 0) {
      showFeedback('info', 'No hay cuentas bancarias disponibles para descargar.');
      return;
    }
    setExportModalConfig(opts);
  };

  const handleOpenEmailModal = (opts?: { societyKey?: string; accountId?: string }) => {
    if (data.accounts.length === 0) {
      showFeedback('info', 'No hay cuentas bancarias disponibles para enviar por correo.');
      return;
    }
    setEmailModalConfig(opts || {});
  };

  const buildActivePeriodExcelBytes = async (
    selectedItems: BankExportAccountItem[],
    mode: BankExportMode,
    scopeLabel: string
  ) => {
    if (selectedItems.length === 0) return null;
    const targetMonthKey = normalizePeriodKey(effectiveMonth);
    const selectedAccountIds = new Set(selectedItems.map((i) => i.account.id));
    const scopedSapItems = data.sapOpenItems.filter(
      (i) =>
        selectedAccountIds.has(i.cuentaId) &&
        (!i.mes || normalizePeriodKey(i.mes) === targetMonthKey)
    );
    const scopedBalanceRows = data.sapBalanceRows.filter(
      (r) => !r.mes || normalizePeriodKey(r.mes) === targetMonthKey
    );
    const scopedMatches = data.matches.filter(
      (m) =>
        selectedAccountIds.has(m.cuentaId) &&
        normalizePeriodKey(m.mes) === targetMonthKey
    );

    return generateSapDeliverableWorkbookBytes({
      activeSummary: selectedItems[0].summary,
      centerSummaries: selectedItems.map((i) => i.summary),
      batchEntries: selectedItems.map((i) => ({ summary: i.summary, period: i.period })),
      mode,
      sapOpenItems: scopedSapItems,
      sapBalanceRows: scopedBalanceRows,
      statementItems: data.statementItems,
      ledgerItems: data.ledgerItems,
      matches: scopedMatches,
      selectedMonth: effectiveMonth,
      scopeLabel,
    });
  };

  const buildActivePeriodPdfBytes = async (
    selectedItems: BankExportAccountItem[],
    scopeLabel: string
  ) => {
    if (selectedItems.length === 0) return null;
    return generateBankBatchPdfBytes(
      selectedItems.map((i) => ({ summary: i.summary, period: i.period })),
      scopeLabel
    );
  };

  const handleExecuteExportExcel = async (
    selectedItems: BankExportAccountItem[],
    mode: BankExportMode,
    scopeLabel: string
  ) => {
    if (selectedItems.length === 0) return;
    try {
      const targetMonthKey = normalizePeriodKey(effectiveMonth);
      const selectedAccountIds = new Set(selectedItems.map((i) => i.account.id));
      const scopedSapItems = data.sapOpenItems.filter(
        (i) =>
          selectedAccountIds.has(i.cuentaId) &&
          (!i.mes || normalizePeriodKey(i.mes) === targetMonthKey)
      );
      const scopedBalanceRows = data.sapBalanceRows.filter(
        (r) => !r.mes || normalizePeriodKey(r.mes) === targetMonthKey
      );
      const scopedMatches = data.matches.filter(
        (m) =>
          selectedAccountIds.has(m.cuentaId) &&
          normalizePeriodKey(m.mes) === targetMonthKey
      );

      await exportSapDeliverableWorkbook({
        activeSummary: selectedItems[0].summary,
        centerSummaries: selectedItems.map((i) => i.summary),
        batchEntries: selectedItems.map((i) => ({ summary: i.summary, period: i.period })),
        mode,
        sapOpenItems: scopedSapItems,
        sapBalanceRows: scopedBalanceRows,
        statementItems: data.statementItems,
        ledgerItems: data.ledgerItems,
        matches: scopedMatches,
        selectedMonth: effectiveMonth,
        scopeLabel,
      });

      showFeedback(
        'success',
        mode === 'individual'
          ? `Excel individual de ${selectedItems[0].account.banco} descargado con fórmulas vivas.`
          : `Excel masivo descargado: Resumen Consolidado + ${selectedItems.length} hoja(s) oficial(es) con fórmulas vivas.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo generar el libro Excel.';
      showFeedback('error', msg);
    }
  };

  const handleExecuteExportPdf = async (
    selectedItems: BankExportAccountItem[],
    mode: BankExportMode,
    scopeLabel: string
  ) => {
    if (selectedItems.length === 0) return;
    try {
      await exportBankBatchPdf(
        selectedItems.map((i) => ({ summary: i.summary, period: i.period })),
        scopeLabel
      );
      showFeedback(
        'success',
        mode === 'individual'
          ? `PDF individual de ${selectedItems[0].account.banco} descargado correctamente.`
          : `PDF masivo descargado con ${selectedItems.length} hoja(s) oficial(es) horizontales.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo generar el documento PDF.';
      showFeedback('error', msg);
    }
  };

  const handleOpenBatchPrintPreview = (
    selectedItems: BankExportAccountItem[],
    mode: BankExportMode,
    scopeLabel: string
  ) => {
    if (selectedItems.length === 0) return;
    setPrintPreviewState({
      entries: selectedItems.map((i) => ({ summary: i.summary, period: i.period })),
      selectedItems,
      mode,
      scopeLabel,
    });
  };

  const handleSaveCloudClick = async () => {
    if (permissions.isReadOnly) return;
    if (!currentUser) {
      showFeedback(
        'info',
        'Inicia sesión con tu cuenta de Google para sincronizar la conciliación bancaria en la nube.'
      );
      onSignInWithGoogle();
      return;
    }
    setIsSavingCloud(true);
    try {
      await onSaveToCloud();
      showFeedback('success', 'Centro de Conciliaciones guardado correctamente en la nube.');
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo guardar en la nube. Tus cambios siguen respaldados localmente.';
      showFeedback('error', msg);
    } finally {
      setIsSavingCloud(false);
    }
  };

  const handleOpenAccountPartidas = (accountId: string) => {
    setPendingAccountFilterId(accountId);
    setActiveTab('pendientes');
  };

  return (
    <div className="min-h-screen bg-[#F5F8FC] flex flex-col font-sans text-slate-800 antialiased print:bg-white">
      <BankSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        selectedAccount={selectedAccount}
        societiesCount={data.societies.length}
        accountsCount={data.accounts.length}
        openItemsCount={sidebarMetrics.totalOpenItems}
        squaredAccountsCount={sidebarMetrics.squaredCount}
        closedCount={data.closedReconciliations.length}
        openPeriod={data.openPeriod}
        onSwitchModule={onSwitchModule}
        permissions={permissions}
      />

      <div className="lg:pl-72 print:pl-0 flex flex-col min-h-screen">
        <BankHeader
          activeTab={activeTab}
          onToggleMobileMenu={() => setIsMobileMenuOpen(true)}
          accounts={data.accounts}
          selectedAccountId={selectedAccount?.id || ''}
          onSelectAccountId={(id) =>
            onUpdateData((prev) => ({ ...prev, selectedAccountId: id }), false)
          }
          selectedMonth={effectiveMonth}
          setSelectedMonth={(month) =>
            onUpdateData((prev) => ({ ...prev, selectedMonth: month }), false)
          }
          availableMonths={availableMonths}
          closedPeriodKeys={closedPeriodKeys}
          onOpenPrintPreview={() =>
            handleOpenExportModal({
              format: 'pdf',
              mode: 'individual',
              accountId: selectedAccount?.id,
            })
          }
          onExportExcel={() =>
            handleOpenExportModal({
              format: 'excel',
              mode: 'individual',
              accountId: selectedAccount?.id,
            })
          }
          onOpenEmailModal={() =>
            handleOpenEmailModal({
              accountId: selectedAccount?.id,
            })
          }
          onSaveCloud={handleSaveCloudClick}
          isSavingCloud={isSavingCloud}
          hasUnsavedChanges={data.hasUnsavedChanges}
          currentUser={currentUser}
          onSignInWithGoogle={onSignInWithGoogle}
          onSignOut={onSignOut}
          onSwitchModule={onSwitchModule}
          permissions={permissions}
        />

        {/* Reconciliation Lifecycle Control Bar (Close / Open Sequential Control) */}
        <div className="bg-white border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-2.5 print:hidden">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            {/* Left: Current Period Status */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs min-w-0">
              {data.openPeriod ? (
                <>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 whitespace-nowrap">
                    <LockOpen className="w-3.5 h-3.5 shrink-0" />
                    <span>Conciliación abierta</span>
                  </span>
                  <span className="text-slate-300" aria-hidden="true">·</span>
                  <span className="font-bold text-slate-900 whitespace-nowrap">
                    {data.openPeriod}
                  </span>
                  <span className="text-slate-300 hidden sm:inline" aria-hidden="true">·</span>
                  <span className="text-slate-500 font-mono tabular-nums hidden sm:inline whitespace-nowrap">
                    {sidebarMetrics.squaredCount}/{data.accounts.length} cuadradas
                  </span>
                  {isSelectedPeriodClosed && (
                    <>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateData(
                            (prev) => ({
                              ...prev,
                              selectedMonth: prev.openPeriod || effectiveMonth,
                            }),
                            false
                          )
                        }
                        className="font-semibold text-[#1E60A8] hover:underline whitespace-nowrap cursor-pointer"
                      >
                        Volver a {data.openPeriod}
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 whitespace-nowrap">
                    <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>Conciliación cerrada</span>
                  </span>
                  <span className="text-slate-300" aria-hidden="true">·</span>
                  <span className="text-slate-600 whitespace-nowrap">
                    {data.closedReconciliations[0]
                      ? `Último cierre: ${data.closedReconciliations[0].period}`
                      : 'Sin periodo abierto actualmente'}
                  </span>
                </>
              )}
            </div>

            {/* Right: Close Reconciliation, Open Reconciliation, Historial */}
            <div className="flex items-center gap-2 shrink-0">
              {!permissions.isReadOnly && (
                <>
                  <button
                    type="button"
                    disabled={!data.openPeriod}
                    onClick={() => setIsCloseModalOpen(true)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 ${
                      data.openPeriod
                        ? 'bg-[#132B63] hover:bg-[#0E224D] text-white cursor-pointer'
                        : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                    }`}
                    title={
                      data.openPeriod
                        ? `Cerrar y archivar la conciliación de ${data.openPeriod}`
                        : 'No hay una conciliación abierta por cerrar'
                    }
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{data.openPeriod ? 'Cerrar Conciliación' : 'Conciliación Cerrada'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRequestOpenReconciliation}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      data.openPeriod
                        ? 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 border border-slate-200'
                        : 'bg-[#1E60A8] hover:bg-[#132B63] text-white'
                    }`}
                    title={
                      data.openPeriod
                        ? `Bloqueado: cierra ${data.openPeriod} antes de abrir una nueva conciliación`
                        : 'Abrir un nuevo periodo de conciliación bancaria'
                    }
                  >
                    {data.openPeriod ? (
                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                    ) : (
                      <FolderPlus className="w-3.5 h-3.5" />
                    )}
                    <span>Abrir Conciliación</span>
                  </button>
                </>
              )}

              {activeTab !== 'historial' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('historial')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <History className="w-3.5 h-3.5 text-[#1E60A8]" />
                  <span>Historial ({data.closedReconciliations.length})</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Feedback / Scope / Closed Period / Cloud Sync Banners (hidden on print) */}
        {(feedbackBanner ||
          (isSelectedPeriodClosed && activeTab !== 'historial' && activeTab !== 'cuentas') ||
          permissions.getModuleCompanyScope('bancos') === 'selected' ||
          (!permissions.isReadOnly && data.hasUnsavedChanges)) && (
          <div className="px-4 sm:px-6 lg:px-8 pt-4 max-w-7xl mx-auto w-full space-y-2 print:hidden">
            {isSelectedPeriodClosed && activeTab !== 'historial' && activeTab !== 'cuentas' && (
              <div className="px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-100/90 text-slate-800 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Lock className="w-4 h-4 text-[#132B63] shrink-0" />
                  <span>
                    El periodo <strong>{effectiveMonth}</strong> está cerrado (modo solo lectura).
                    {!data.openPeriod &&
                      ' Abre una nueva conciliación para iniciar el siguiente periodo.'}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab('historial')}
                    className="px-3 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Ver en Historial
                  </button>
                  {!permissions.isReadOnly && !data.openPeriod && (
                    <button
                      type="button"
                      onClick={handleRequestOpenReconciliation}
                      className="px-3 py-1 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Abrir Nueva Conciliación
                    </button>
                  )}
                </div>
              </div>
            )}

            {permissions.getModuleCompanyScope('bancos') === 'selected' && (
              <div className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
                <span className="truncate">
                  <strong className="font-semibold text-slate-800">
                    Sociedades autorizadas (Bancos):
                  </strong>{' '}
                  {permissions.getAllowedCompaniesForModule('bancos').length > 0
                    ? permissions.getAllowedCompaniesForModule('bancos').join(', ')
                    : 'Sin sociedades asignadas en este módulo'}
                </span>
              </div>
            )}

            {feedbackBanner && (
              <div
                className={`px-4 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                  feedbackBanner.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : feedbackBanner.type === 'error'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-blue-50 border-blue-200 text-blue-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  {feedbackBanner.type === 'error' ? (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  )}
                  <span className="font-medium">{feedbackBanner.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFeedbackBanner(null)}
                  className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
                  aria-label="Cerrar notificación"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {!permissions.isReadOnly && data.hasUnsavedChanges && (
              <div className="px-4 py-2 rounded-xl border bg-amber-50 border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Cloud className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="truncate">
                    Cambios locales pendientes de respaldo en la nube.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSaveCloudClick}
                  disabled={isSavingCloud}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors shrink-0 cursor-pointer"
                >
                  Guardar ahora
                </button>
              </div>
            )}
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-7xl mx-auto w-full print:p-0 print:max-w-none">
          {activeTab === 'resumen' && (
            <BankResumenView
              societies={data.societies}
              accounts={data.accounts}
              selectedAccountId={selectedAccount?.id || ''}
              onSelectAccountId={(id) =>
                onUpdateData((prev) => ({ ...prev, selectedAccountId: id }), false)
              }
              summary={summary}
              sapOpenItems={data.sapOpenItems}
              statementItems={data.statementItems}
              ledgerItems={data.ledgerItems}
              matches={data.matches}
              selectedMonth={effectiveMonth}
              onNavigateTab={setActiveTab}
              onOpenAccountPartidas={handleOpenAccountPartidas}
              onUpdateSaldoExtracto={handleUpdateSaldoExtracto}
              onSyncExtractoToCta00={handleSyncExtractoToCta00}
              onUpdateMonthlyBalances={handleUpdateMonthlyBalances}
              onAddReconcilingItem={handleAddReconcilingItem}
              onDeleteLineItem={handleDeleteLineItem}
              onOpenExportModal={handleOpenExportModal}
              onOpenEmailModal={handleOpenEmailModal}
              isReadOnly={isOperationalReadOnly}
            />
          )}

          {activeTab === 'pendientes' && (
            <BankPendientesView
              societies={data.societies}
              accounts={data.accounts}
              sapOpenItems={data.sapOpenItems}
              selectedMonth={effectiveMonth}
              initialAccountFilterId={pendingAccountFilterId}
              onClearInitialAccountFilter={() => setPendingAccountFilterId(undefined)}
              onAddSapOpenItem={handleAddSapOpenItem}
              onUpdateSapOpenItem={handleUpdateSapOpenItem}
              onReclassifySapOpenItem={handleReclassifySapOpenItem}
              onDeleteSapOpenItem={handleDeleteSapOpenItem}
              onExportExcel={() =>
                handleOpenExportModal({
                  format: 'excel',
                  mode: 'masivo',
                  accountId: selectedAccount?.id,
                })
              }
              onNavigateTab={setActiveTab}
              isReadOnly={isOperationalReadOnly}
            />
          )}

          {activeTab === 'cuentas' && (
            <BankCuentasView
              societies={data.societies}
              accounts={data.accounts}
              selectedAccountId={selectedAccount?.id || ''}
              selectedMonth={effectiveMonth}
              onSelectAccountAndOpen={(id) => {
                onUpdateData((prev) => ({ ...prev, selectedAccountId: id }), false);
                setActiveTab('resumen');
              }}
              isReadOnly={permissions.isReadOnly}
              canManageMasterData={permissions.canManageMasterData}
              moduleCompanies={moduleCompanies}
              onAddSociety={handleAddSociety}
              onUpdateSociety={handleUpdateSociety}
              onDeleteSociety={handleDeleteSociety}
              onAddAccount={(newAcc) => {
                if (permissions.isReadOnly || !permissions.canManageMasterData) return;
                onUpdateData(
                  (prev) => ({
                    ...prev,
                    accounts: [...prev.accounts, newAcc],
                  }),
                  true
                );
                showFeedback('success', `Cuenta ${newAcc.banco} agregada al catálogo.`);
              }}
              onUpdateAccount={(updated) => {
                if (permissions.isReadOnly) return;
                onUpdateData(
                  (prev) => ({
                    ...prev,
                    accounts: prev.accounts.map((a) => (a.id === updated.id ? updated : a)),
                  }),
                  true
                );
                showFeedback('success', `Cuenta ${updated.banco} actualizada.`);
              }}
              onDeleteAccount={(accId) => {
                if (permissions.isReadOnly || !permissions.canManageMasterData) return;
                onUpdateData((prev) => {
                  const nextAccounts = prev.accounts.filter((a) => a.id !== accId);
                  return {
                    ...prev,
                    accounts: nextAccounts,
                    sapOpenItems: prev.sapOpenItems.filter((i) => i.cuentaId !== accId),
                    statementItems: prev.statementItems.filter((i) => i.cuentaId !== accId),
                    ledgerItems: prev.ledgerItems.filter((i) => i.cuentaId !== accId),
                    matches: prev.matches.filter((m) => m.cuentaId !== accId),
                    selectedAccountId:
                      prev.selectedAccountId === accId
                        ? nextAccounts[0]?.id || ''
                        : prev.selectedAccountId,
                  };
                }, true);
                showFeedback('info', 'Cuenta bancaria eliminada del catálogo.');
              }}
            />
          )}

          {activeTab === 'carga' && (
            <BankCargaView
              societies={data.societies}
              accounts={data.accounts}
              selectedAccount={selectedAccount}
              selectedMonth={effectiveMonth}
              permissions={permissions}
              isReadOnly={permissions.isReadOnly}
              isPeriodClosed={isSelectedPeriodClosed}
              openPeriod={data.openPeriod}
              onRequestOpenReconciliation={handleRequestOpenReconciliation}
              onApplySapCatalogImport={handleApplySapCatalogImport}
              onApplySapBalanceImport={handleApplySapBalanceImport}
              onApplySapFbl3nImport={handleApplySapFbl3nImport}
            />
          )}

          {activeTab === 'historial' && (
            <BankHistorialView
              closedReconciliations={data.closedReconciliations}
              openPeriod={data.openPeriod}
              isReadOnly={permissions.isReadOnly}
              accessToken={accessToken}
              onReconnectWorkspace={onReconnectWorkspace}
              onInvalidateWorkspaceToken={onInvalidateWorkspaceToken}
              onRequestOpenReconciliation={handleRequestOpenReconciliation}
              onRequestCloseCurrent={() => setIsCloseModalOpen(true)}
              onGoToCentroCuadre={() => setActiveTab('resumen')}
              onNotify={showFeedback}
            />
          )}
        </main>
      </div>

      {/* Individual / Masivo Download Selector Modal (Excel & PDF) */}
      {exportModalConfig && (
        <BankExportModal
          isOpen={true}
          onClose={() => setExportModalConfig(null)}
          title="Descargar Conciliaciones · Centro de Cuadre"
          subtitle={`${effectiveMonth} · ${activePeriodExportItems.length} cuenta(s) bancaria(s) disponibles`}
          items={activePeriodExportItems}
          initialFormat={exportModalConfig.format}
          initialMode={exportModalConfig.mode}
          initialAccountId={exportModalConfig.accountId || selectedAccount?.id}
          initialSocietyKey={exportModalConfig.societyKey || 'ALL'}
          onExecuteExcel={handleExecuteExportExcel}
          onExecutePdf={handleExecuteExportPdf}
          onOpenPdfPreview={handleOpenBatchPrintPreview}
        />
      )}

      {/* Direct Gmail Sending Modal (PDF / Excel / Both · Individual / Company / All / Selection) */}
      {emailModalConfig && (
        <BankEmailModal
          isOpen={true}
          onClose={() => setEmailModalConfig(null)}
          title="Enviar Conciliaciones por Correo (Gmail)"
          subtitle={`${effectiveMonth} · ${activePeriodExportItems.length} cuenta(s) bancaria(s) disponibles`}
          items={activePeriodExportItems}
          initialAccountId={emailModalConfig.accountId || selectedAccount?.id}
          initialSocietyKey={emailModalConfig.societyKey || 'ALL'}
          buildExcelBytes={buildActivePeriodExcelBytes}
          buildPdfBytes={buildActivePeriodPdfBytes}
          accessToken={accessToken}
          onReconnectWorkspace={onReconnectWorkspace}
          onInvalidateWorkspaceToken={onInvalidateWorkspaceToken}
          onSentSuccess={(msg) => showFeedback('success', msg)}
        />
      )}

      {/* Print Preview & Landscape PDF Modal (supports 1-page Individual or multi-page Masivo) */}
      {printPreviewState && (
        <BankPrintPreviewModal
          isOpen={true}
          onClose={() => setPrintPreviewState(null)}
          entries={printPreviewState.entries}
          selectedMonth={effectiveMonth}
          scopeLabel={printPreviewState.scopeLabel}
          onExportFullExcel={() =>
            handleExecuteExportExcel(
              printPreviewState.selectedItems,
              printPreviewState.mode,
              printPreviewState.scopeLabel
            )
          }
        />
      )}

      {/* Close Reconciliation Confirmation Modal */}
      {data.openPeriod && (
        <CloseReconciliationModal
          isOpen={isCloseModalOpen}
          onClose={() => setIsCloseModalOpen(false)}
          period={data.openPeriod}
          societiesCount={data.societies.length}
          accountSummaries={openPeriodAccountSummaries}
          openItemsCount={sidebarMetrics.totalOpenItems}
          onConfirmClose={(notes) => void handleConfirmCloseReconciliation(notes)}
        />
      )}

      {/* Open New Reconciliation Modal (enabled only when previous reconciliation is closed) */}
      <OpenReconciliationModal
        isOpen={isOpenModalOpen}
        onClose={() => setIsOpenModalOpen(false)}
        latestClosedPeriod={data.closedReconciliations[0]?.period || effectiveMonth}
        closedReconciliations={data.closedReconciliations}
        onConfirmOpen={(payload) => void handleConfirmOpenReconciliation(payload)}
      />

      {/* Sequential Lock Notice Modal */}
      {data.openPeriod && (
        <BlockedOpenNoticeModal
          isOpen={isBlockedOpenModalOpen}
          onClose={() => setIsBlockedOpenModalOpen(false)}
          openPeriod={data.openPeriod}
          onProceedToCloseCurrent={() => setIsCloseModalOpen(true)}
        />
      )}

      {/* Mobile Bottom Navigation Bar (Bancos SAP) */}
      <nav
        aria-label="Navegación móvil bancaria"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe print:hidden"
      >
        <div className="grid grid-cols-4 h-14">
          {(
            [
              { id: 'resumen' as BankTab, label: 'Cuadre', icon: LayoutDashboard },
              { id: 'pendientes' as BankTab, label: 'Partidas', icon: AlertCircle },
              { id: 'cuentas' as BankTab, label: 'Cuentas', icon: Landmark },
              { id: 'historial' as BankTab, label: 'Historial', icon: History },
            ] as const
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
                <Icon className={`w-5 h-5 ${isActive ? 'text-[#1E60A8]' : 'text-slate-400'}`} />
                <span className="truncate max-w-[74px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
