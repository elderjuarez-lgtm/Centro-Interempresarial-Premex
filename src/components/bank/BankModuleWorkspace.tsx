import React, { useState, useMemo, useEffect } from 'react';
import { User } from 'firebase/auth';
import { CheckCircle2, Cloud, AlertTriangle, X, Building2 } from 'lucide-react';
import {
  ActiveModuleId,
  BankAccount,
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
  resolveAccountBalancesForMonth,
  runAutoBankMatch,
} from '../../utils/bankReconciliation';
import {
  ParsedSapBalanceResult,
  ParsedSapCatalogResult,
  ParsedSapFbl3nResult,
  matchExistingAccount,
} from '../../utils/bankExcel';
import { exportSapDeliverableWorkbook } from '../../utils/bankOfficialExport';
import { BankSidebar } from './BankSidebar';
import { BankHeader } from './BankHeader';
import { BankResumenView } from './BankResumenView';
import { BankCruceView } from './BankCruceView';
import { BankPendientesView } from './BankPendientesView';
import { BankCuentasView } from './BankCuentasView';
import { BankCargaView } from './BankCargaView';
import { AddReconcilingItemPayload } from './BankOfficialSheet';
import { BankPrintPreviewModal } from './BankPrintPreviewModal';

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
  lastSavedAtIso: string | null;
  hasUnsavedChanges: boolean;
}

interface BankModuleWorkspaceProps {
  data: BankWorkspaceData;
  onUpdateData: (
    updater: (prev: BankWorkspaceData) => BankWorkspaceData,
    markUnsaved?: boolean
  ) => void;
  onSaveToCloud: () => Promise<void>;
  currentUser: User | null;
  onSignInWithGoogle: () => void;
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
  onSignInWithGoogle,
  onSignOut,
  onSwitchModule,
  permissions,
  moduleCompanies = [],
}) => {
  const [activeTab, setActiveTab] = useState<BankTab>('resumen');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSavingCloud, setIsSavingCloud] = useState(false);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
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

  // Collect all periods across per-month balances, SAP balance rows, SAP open items, and bilateral items
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    data.accounts.forEach((acc) => {
      if (acc.saldosPorMes) {
        Object.keys(acc.saldosPorMes).forEach((m) => m && set.add(m));
      }
    });
    data.sapBalanceRows.forEach((r) => r.mes && set.add(r.mes));
    data.sapOpenItems.forEach((i) => i.mes && set.add(i.mes));
    data.statementItems.forEach((i) => i.mes && set.add(i.mes));
    data.ledgerItems.forEach((i) => i.mes && set.add(i.mes));
    if (set.size === 0) set.add('Octubre 2026');
    return Array.from(set).sort();
  }, [
    data.accounts,
    data.sapBalanceRows,
    data.sapOpenItems,
    data.statementItems,
    data.ledgerItems,
  ]);

  const effectiveMonth =
    data.selectedMonth === 'ALL'
      ? availableMonths[0] || 'Octubre 2026'
      : data.selectedMonth;

  const summary = useMemo(
    () =>
      computeBankReconciliationSummary(
        selectedAccount,
        data.statementItems,
        data.ledgerItems,
        data.matches,
        data.selectedMonth,
        data.sapOpenItems
      ),
    [
      selectedAccount,
      data.statementItems,
      data.ledgerItems,
      data.matches,
      data.selectedMonth,
      data.sapOpenItems,
    ]
  );

  const sidebarMetrics = useMemo(() => {
    let squaredCount = 0;
    let totalOpenItems = 0;
    data.accounts.forEach((acc) => {
      const s = computeBankReconciliationSummary(
        acc,
        data.statementItems,
        data.ledgerItems,
        data.matches,
        data.selectedMonth,
        data.sapOpenItems
      );
      if (Math.abs(s.diferenciaNeta) <= 1) squaredCount += 1;
      totalOpenItems += s.sapItemsCount;
    });
    return { squaredCount, totalOpenItems };
  }, [
    data.accounts,
    data.statementItems,
    data.ledgerItems,
    data.matches,
    data.selectedMonth,
    data.sapOpenItems,
  ]);

  // ============================================================================
  // Live Saldo Extracto Edit & Sync to Subcuenta 00
  // ============================================================================

  const handleUpdateSaldoExtracto = (accountId: string, newExtracto: number) => {
    if (permissions.isReadOnly) return;
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
    if (permissions.isReadOnly) return;
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
    if (permissions.isReadOnly) return;
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
    if (permissions.isReadOnly) return;
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
    if (permissions.isReadOnly) return;
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
    if (permissions.isReadOnly) return;
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
    if (permissions.isReadOnly) return;
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
    if (permissions.isReadOnly) return;
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
    if (permissions.isReadOnly) return;
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
    if (permissions.isReadOnly || result.groups.length === 0) return;
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
    if (permissions.isReadOnly || result.items.length === 0) return;

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
  // Cruce Bilateral Handlers (preserved intact)
  // ============================================================================

  const handleRunAutoMatch = () => {
    if (permissions.isReadOnly || !selectedAccount) return;
    const { newMatches, byRefCount, byAmountCount } = runAutoBankMatch(
      selectedAccount.id,
      data.selectedMonth,
      data.statementItems,
      data.ledgerItems,
      data.matches
    );

    if (newMatches.length === 0) {
      showFeedback(
        'info',
        'No se encontraron nuevos cruces automáticos exactos. Puedes realizar emparejamientos manuales (1 a N) en Cruce Bilateral.'
      );
      return;
    }

    onUpdateData(
      (prev) => ({
        ...prev,
        matches: [...prev.matches, ...newMatches],
      }),
      true
    );

    showFeedback(
      'success',
      `Cruce bilateral completado: ${newMatches.length} emparejamiento(s) nuevo(s) (${byRefCount} por referencia y ${byAmountCount} por valor/fecha).`
    );
  };

  const handleCreateManualMatch = (
    bankIds: string[],
    ledgerIds: string[],
    note?: string
  ) => {
    if (
      permissions.isReadOnly ||
      !selectedAccount ||
      bankIds.length === 0 ||
      ledgerIds.length === 0
    ) {
      return;
    }
    const newGroup: BankMatchGroup = {
      id: `bm-man-${Date.now()}`,
      cuentaId: selectedAccount.id,
      mes: effectiveMonth,
      bankItemIds: bankIds,
      ledgerItemIds: ledgerIds,
      method: 'manual',
      matchedAt: new Date().toISOString(),
      note,
    };

    onUpdateData(
      (prev) => ({
        ...prev,
        matches: [...prev.matches, newGroup],
      }),
      true
    );

    showFeedback(
      'success',
      `Emparejamiento manual registrado (${bankIds.length} extracto × ${ledgerIds.length} auxiliar).`
    );
  };

  const handleDeleteMatch = (matchId: string) => {
    if (permissions.isReadOnly) return;
    onUpdateData(
      (prev) => ({
        ...prev,
        matches: prev.matches.filter((m) => m.id !== matchId),
      }),
      true
    );
    showFeedback('info', 'Cruce bilateral deshecho.');
  };

  // ============================================================================
  // 5-Sheet Live-Formula Corporate Excel Deliverable Export
  // ============================================================================

  const handleExportDeliverableExcel = async (societyFilterKey = 'ALL') => {
    if (!selectedAccount) return;
    try {
      const scopedAccounts =
        societyFilterKey === 'ALL'
          ? data.accounts
          : data.accounts.filter(
              (a) =>
                (a.codigoSociedad || a.sociedad || '').trim().toUpperCase() ===
                societyFilterKey.trim().toUpperCase()
            );

      const centerSummaries = (scopedAccounts.length > 0 ? scopedAccounts : data.accounts).map(
        (acc) =>
          computeBankReconciliationSummary(
            acc,
            data.statementItems,
            data.ledgerItems,
            data.matches,
            data.selectedMonth,
            data.sapOpenItems
          )
      );

      const scopedAccountIds = new Set(centerSummaries.map((s) => s.account?.id).filter(Boolean));
      const scopedSapItems = data.sapOpenItems.filter(
        (i) =>
          scopedAccountIds.has(i.cuentaId) &&
          (data.selectedMonth === 'ALL' || !i.mes || i.mes === data.selectedMonth)
      );
      const scopedBalanceRows = data.sapBalanceRows.filter(
        (r) => data.selectedMonth === 'ALL' || !r.mes || r.mes === data.selectedMonth
      );
      const scopedMatches = data.matches.filter(
        (m) =>
          scopedAccountIds.has(m.cuentaId) &&
          (data.selectedMonth === 'ALL' || m.mes === data.selectedMonth)
      );

      const scopeLabel =
        societyFilterKey === 'ALL'
          ? `${selectedAccount.sociedad}_${selectedAccount.banco}`
          : `Soc_${societyFilterKey}`;

      await exportSapDeliverableWorkbook({
        activeSummary: summary,
        centerSummaries,
        sapOpenItems: scopedSapItems,
        sapBalanceRows: scopedBalanceRows,
        statementItems: data.statementItems,
        ledgerItems: data.ledgerItems,
        matches: scopedMatches,
        selectedMonth: data.selectedMonth,
        scopeLabel,
      });

      showFeedback(
        'success',
        `Libro Excel entregable descargado con fórmulas vivas (${
          scopedMatches.length > 0 ? '5 hojas SAP' : '4 hojas SAP'
        }).`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo generar el libro Excel.';
      showFeedback('error', msg);
    }
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
          selectedMonth={data.selectedMonth}
          setSelectedMonth={(month) =>
            onUpdateData((prev) => ({ ...prev, selectedMonth: month }), false)
          }
          availableMonths={availableMonths}
          onOpenPrintPreview={() => setIsPrintPreviewOpen(true)}
          onExportExcel={() => void handleExportDeliverableExcel('ALL')}
          onSaveCloud={handleSaveCloudClick}
          isSavingCloud={isSavingCloud}
          hasUnsavedChanges={data.hasUnsavedChanges}
          currentUser={currentUser}
          onSignInWithGoogle={onSignInWithGoogle}
          onSignOut={onSignOut}
          onSwitchModule={onSwitchModule}
          permissions={permissions}
        />

        {/* Feedback / Scope / Cloud Sync Banners (hidden on print) */}
        {(feedbackBanner ||
          permissions.getModuleCompanyScope('bancos') === 'selected' ||
          (!permissions.isReadOnly && data.hasUnsavedChanges)) && (
          <div className="px-4 sm:px-6 lg:px-8 pt-4 max-w-7xl mx-auto w-full space-y-2 print:hidden">
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

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full print:p-0 print:max-w-none">
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
              selectedMonth={data.selectedMonth}
              onNavigateTab={setActiveTab}
              onOpenAccountPartidas={handleOpenAccountPartidas}
              onUpdateSaldoExtracto={handleUpdateSaldoExtracto}
              onSyncExtractoToCta00={handleSyncExtractoToCta00}
              onUpdateMonthlyBalances={handleUpdateMonthlyBalances}
              onAddReconcilingItem={handleAddReconcilingItem}
              onDeleteLineItem={handleDeleteLineItem}
              onOpenPrintPreview={() => setIsPrintPreviewOpen(true)}
              onExportDeliverableExcel={(socKey) => void handleExportDeliverableExcel(socKey)}
              isReadOnly={permissions.isReadOnly}
            />
          )}

          {activeTab === 'pendientes' && (
            <BankPendientesView
              societies={data.societies}
              accounts={data.accounts}
              sapOpenItems={data.sapOpenItems}
              selectedMonth={data.selectedMonth}
              initialAccountFilterId={pendingAccountFilterId}
              onClearInitialAccountFilter={() => setPendingAccountFilterId(undefined)}
              onAddSapOpenItem={handleAddSapOpenItem}
              onUpdateSapOpenItem={handleUpdateSapOpenItem}
              onReclassifySapOpenItem={handleReclassifySapOpenItem}
              onDeleteSapOpenItem={handleDeleteSapOpenItem}
              onExportExcel={() => void handleExportDeliverableExcel('ALL')}
              onNavigateTab={setActiveTab}
              isReadOnly={permissions.isReadOnly}
            />
          )}

          {activeTab === 'cuentas' && (
            <BankCuentasView
              societies={data.societies}
              accounts={data.accounts}
              selectedAccountId={selectedAccount?.id || ''}
              selectedMonth={data.selectedMonth}
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
              selectedMonth={data.selectedMonth}
              permissions={permissions}
              isReadOnly={permissions.isReadOnly}
              onApplySapCatalogImport={handleApplySapCatalogImport}
              onApplySapBalanceImport={handleApplySapBalanceImport}
              onApplySapFbl3nImport={handleApplySapFbl3nImport}
              onConfirmBilateralImport={({
                statementItems: newBank,
                ledgerItems: newLedger,
                mode,
              }) => {
                if (permissions.isReadOnly || !selectedAccount) return;
                const targetId = selectedAccount.id;
                onUpdateData((prev) => {
                  const nextStatements =
                    mode === 'replace' && newBank.length > 0
                      ? [
                          ...prev.statementItems.filter((i) => i.cuentaId !== targetId),
                          ...newBank,
                        ]
                      : [...prev.statementItems, ...newBank];

                  const nextLedgers =
                    mode === 'replace' && newLedger.length > 0
                      ? [
                          ...prev.ledgerItems.filter((i) => i.cuentaId !== targetId),
                          ...newLedger,
                        ]
                      : [...prev.ledgerItems, ...newLedger];

                  const nextMatches =
                    mode === 'replace'
                      ? prev.matches.filter((m) => m.cuentaId !== targetId)
                      : prev.matches;

                  const firstImportedMonth =
                    newBank[0]?.mes || newLedger[0]?.mes || prev.selectedMonth;

                  return {
                    ...prev,
                    statementItems: nextStatements,
                    ledgerItems: nextLedgers,
                    matches: nextMatches,
                    selectedMonth: firstImportedMonth,
                  };
                }, true);

                showFeedback(
                  'success',
                  `Importación bilateral completada: ${newBank.length} registros Extracto y ${newLedger.length} Auxiliar.`
                );
                setActiveTab('cruce');
              }}
            />
          )}

          {activeTab === 'cruce' && (
            <BankCruceView
              account={selectedAccount}
              selectedMonth={data.selectedMonth}
              statementItems={data.statementItems}
              ledgerItems={data.ledgerItems}
              matches={data.matches}
              summary={summary}
              onRunAutoMatch={handleRunAutoMatch}
              onCreateManualMatch={handleCreateManualMatch}
              onDeleteMatch={handleDeleteMatch}
              isReadOnly={permissions.isReadOnly}
            />
          )}
        </main>
      </div>

      {/* Print Preview & Landscape PDF Modal */}
      <BankPrintPreviewModal
        isOpen={isPrintPreviewOpen}
        onClose={() => setIsPrintPreviewOpen(false)}
        summary={summary}
        selectedMonth={data.selectedMonth}
        onExportFullExcel={() => handleExportDeliverableExcel('ALL')}
      />
    </div>
  );
};
