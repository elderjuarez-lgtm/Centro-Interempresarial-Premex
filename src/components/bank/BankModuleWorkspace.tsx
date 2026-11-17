import React, { useState, useMemo, useEffect } from 'react';
import { User } from 'firebase/auth';
import { CheckCircle2, Cloud, AlertTriangle, X, Building2 } from 'lucide-react';
import {
  ActiveModuleId,
  BankAccount,
  BankMatchGroup,
  BankPendingCategory,
  BankStatementItem,
  BankTab,
  BookLedgerItem,
  EffectivePermissions,
  ModuleCompanyEntry,
} from '../../types';
import {
  computeBankReconciliationSummary,
  runAutoBankMatch,
} from '../../utils/bankReconciliation';
import { exportBankReconciliationExcel } from '../../utils/bankExcel';
import { BankSidebar } from './BankSidebar';
import { BankHeader } from './BankHeader';
import { BankResumenView } from './BankResumenView';
import { BankCruceView } from './BankCruceView';
import { BankPendientesView } from './BankPendientesView';
import { BankCuentasView } from './BankCuentasView';
import { BankCargaView } from './BankCargaView';

export interface BankWorkspaceData {
  docId: string;
  accounts: BankAccount[];
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

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    data.statementItems.forEach((i) => i.mes && set.add(i.mes));
    data.ledgerItems.forEach((i) => i.mes && set.add(i.mes));
    if (set.size === 0) set.add('Septiembre 2026');
    return Array.from(set).sort();
  }, [data.statementItems, data.ledgerItems]);

  const summary = useMemo(
    () =>
      computeBankReconciliationSummary(
        selectedAccount,
        data.statementItems,
        data.ledgerItems,
        data.matches,
        data.selectedMonth
      ),
    [
      selectedAccount,
      data.statementItems,
      data.ledgerItems,
      data.matches,
      data.selectedMonth,
    ]
  );

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
        'No se encontraron nuevos cruces automáticos exactos. Puedes realizar emparejamientos manuales (1 a N) en la Mesa de Cruce.'
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
      `Conciliación automática completada: ${newMatches.length} cruce(s) nuevo(s) (${byRefCount} por referencia exacta y ${byAmountCount} por valor y fecha).`
    );
  };

  const handleCreateManualMatch = (
    bankIds: string[],
    ledgerIds: string[],
    note?: string
  ) => {
    if (permissions.isReadOnly || !selectedAccount || bankIds.length === 0 || ledgerIds.length === 0) return;
    const newGroup: BankMatchGroup = {
      id: `bm-man-${Date.now()}`,
      cuentaId: selectedAccount.id,
      mes:
        data.selectedMonth === 'ALL'
          ? availableMonths[0] || 'Septiembre 2026'
          : data.selectedMonth,
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
      `Emparejamiento manual registrado (${bankIds.length} extracto × ${ledgerIds.length} libros).`
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
    showFeedback('info', 'Cruce deshecho. Las partidas regresaron a estado pendiente.');
  };

  const handleUpdateBankItemMeta = (
    itemId: string,
    patch: { categoriaPendiente?: BankPendingCategory; comentario?: string }
  ) => {
    if (permissions.isReadOnly) return;
    onUpdateData(
      (prev) => ({
        ...prev,
        statementItems: prev.statementItems.map((item) =>
          item.id === itemId ? { ...item, ...patch } : item
        ),
      }),
      true
    );
  };

  const handleUpdateLedgerItemMeta = (
    itemId: string,
    patch: { categoriaPendiente?: BankPendingCategory; comentario?: string }
  ) => {
    if (permissions.isReadOnly) return;
    onUpdateData(
      (prev) => ({
        ...prev,
        ledgerItems: prev.ledgerItems.map((item) =>
          item.id === itemId ? { ...item, ...patch } : item
        ),
      }),
      true
    );
  };

  const handleExportExcel = () => {
    if (!selectedAccount) return;
    exportBankReconciliationExcel(
      summary,
      data.selectedMonth,
      data.statementItems,
      data.ledgerItems,
      data.matches
    );
    showFeedback('success', `Excel exportado para ${selectedAccount.banco}.`);
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
      showFeedback('success', 'Conciliación bancaria guardada correctamente en la nube.');
    } catch (err: any) {
      showFeedback(
        'error',
        err?.message || 'No se pudo guardar en la nube. Tus cambios siguen respaldados localmente.'
      );
    } finally {
      setIsSavingCloud(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F8FC] flex flex-col font-sans text-slate-800 antialiased">
      <BankSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        selectedAccount={selectedAccount}
        accountsCount={data.accounts.length}
        unmatchedCount={
          summary.unmatchedBankItemsCount + summary.unmatchedLedgerItemsCount
        }
        reconciledPct={summary.reconciledPct}
        onSwitchModule={onSwitchModule}
        permissions={permissions}
      />

      <div className="lg:pl-72 flex flex-col min-h-screen">
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
          onExportExcel={handleExportExcel}
          onSaveCloud={handleSaveCloudClick}
          isSavingCloud={isSavingCloud}
          hasUnsavedChanges={data.hasUnsavedChanges}
          currentUser={currentUser}
          onSignInWithGoogle={onSignInWithGoogle}
          onSignOut={onSignOut}
          onSwitchModule={onSwitchModule}
          permissions={permissions}
        />

        {/* Feedback / Scope / Cloud Sync Banners */}
        {(feedbackBanner ||
          permissions.getModuleCompanyScope('bancos') === 'selected' ||
          (!permissions.isReadOnly && data.hasUnsavedChanges)) && (
          <div className="px-4 sm:px-6 lg:px-8 pt-4 max-w-7xl mx-auto w-full space-y-2">
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

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {activeTab === 'resumen' && (
            <BankResumenView
              accounts={data.accounts}
              selectedAccountId={selectedAccount?.id || ''}
              onSelectAccountId={(id) =>
                onUpdateData((prev) => ({ ...prev, selectedAccountId: id }), false)
              }
              summary={summary}
              statementItems={data.statementItems}
              ledgerItems={data.ledgerItems}
              matches={data.matches}
              selectedMonth={data.selectedMonth}
              onNavigateTab={setActiveTab}
              onRunAutoMatch={handleRunAutoMatch}
              onExportExcel={handleExportExcel}
              isReadOnly={permissions.isReadOnly}
              canManageAccounts={permissions.canManageMasterData}
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

          {activeTab === 'pendientes' && (
            <BankPendientesView
              summary={summary}
              onUpdateBankItemMeta={handleUpdateBankItemMeta}
              onUpdateLedgerItemMeta={handleUpdateLedgerItemMeta}
              onExportExcel={handleExportExcel}
              onNavigateTab={setActiveTab}
              isReadOnly={permissions.isReadOnly}
            />
          )}

          {activeTab === 'cuentas' && (
            <BankCuentasView
              accounts={data.accounts}
              selectedAccountId={selectedAccount?.id || ''}
              onSelectAccountId={(id) =>
                onUpdateData((prev) => ({ ...prev, selectedAccountId: id }), false)
              }
              isReadOnly={permissions.isReadOnly}
              canManageMasterData={permissions.canManageMasterData}
              moduleCompanies={moduleCompanies}
              onAddAccount={(newAcc) => {
                if (permissions.isReadOnly || !permissions.canManageMasterData) return;
                onUpdateData(
                  (prev) => ({
                    ...prev,
                    accounts: [...prev.accounts, newAcc],
                  }),
                  true
                );
                showFeedback('success', `Cuenta ${newAcc.banco} agregada.`);
              }}
              onUpdateAccount={(updated) => {
                if (permissions.isReadOnly) return;
                onUpdateData(
                  (prev) => ({
                    ...prev,
                    accounts: prev.accounts.map((a) =>
                      a.id === updated.id ? updated : a
                    ),
                  }),
                  true
                );
                showFeedback('success', `Saldos y datos de ${updated.banco} actualizados.`);
              }}
              onDeleteAccount={(accId) => {
                if (permissions.isReadOnly || !permissions.canManageMasterData) return;
                onUpdateData((prev) => {
                  const nextAccounts = prev.accounts.filter((a) => a.id !== accId);
                  return {
                    ...prev,
                    accounts: nextAccounts,
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
              selectedAccount={selectedAccount}
              selectedMonth={data.selectedMonth}
              isReadOnly={permissions.isReadOnly}
              onConfirmImport={({ statementItems: newBank, ledgerItems: newLedger, mode }) => {
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
                  `Importación completada: ${newBank.length} registros en Extracto y ${newLedger.length} en Libros.`
                );
                setActiveTab('cruce');
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
};
