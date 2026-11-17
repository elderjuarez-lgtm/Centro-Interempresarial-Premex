import React, { useState, useMemo, useEffect } from 'react';
import { User } from 'firebase/auth';
import { CheckCircle2, AlertTriangle, X, Building2 } from 'lucide-react';
import {
  ActiveModuleId,
  EffectivePermissions,
  ModuleCompanyEntry,
  ViaticoConsultor,
  ViaticoCurrency,
  ViaticoExpenseItem,
  ViaticoLiquidation,
  ViaticosTab,
  ViaticosWorkspaceData,
} from '../../types';
import {
  StoredReceiptMedia,
  deleteReceiptMedia,
  getReceiptMediaBatch,
} from '../../services/viaticosMediaStore';
import {
  filterLiquidacionesByPermissions,
  getCurrentIsoWeekNumber,
  recalculateLiquidationTotals,
  resolveViaticosConsultantScope,
  roundMoney,
} from '../../utils/viaticos';
import {
  exportViaticosExcel,
  exportViaticosReceiptsPdf,
} from '../../utils/viaticosExport';
import { ViaticosSidebar } from './ViaticosSidebar';
import { ViaticosHeader } from './ViaticosHeader';
import { ViaticosLiquidadorView } from './ViaticosLiquidadorView';
import { ViaticosHistorialView } from './ViaticosHistorialView';
import { ViaticosCloseEmailModal } from './ViaticosCloseEmailModal';

interface ViaticosModuleWorkspaceProps {
  data: ViaticosWorkspaceData;
  onUpdateData: (
    updater: (prev: ViaticosWorkspaceData) => ViaticosWorkspaceData,
    markUnsaved?: boolean
  ) => void;
  onSaveToCloud: (overrideData?: ViaticosWorkspaceData) => Promise<void>;
  currentUser: User | null;
  onSignInWithGoogle: () => void;
  onSignOut: () => void;
  onSwitchModule: (moduleId: ActiveModuleId) => void;
  permissions: EffectivePermissions;
  moduleCompanies?: ModuleCompanyEntry[];
}

export const ViaticosModuleWorkspace: React.FC<ViaticosModuleWorkspaceProps> = ({
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
  const [activeTab, setActiveTab] = useState<ViaticosTab>('liquidador');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSavingCloud, setIsSavingCloud] = useState(false);
  const [mediaMap, setMediaMap] = useState<Record<string, StoredReceiptMedia>>({});
  const [closeModalLiqId, setCloseModalLiqId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  // Resolve consultant identity automatically from corporate email (primerNombre.primerApellido) & RBAC
  const scope = useMemo(
    () => resolveViaticosConsultantScope(data.consultores, permissions),
    [data.consultores, permissions]
  );

  const visibleModuleCompanies = useMemo(() => {
    const active = moduleCompanies.filter((c) => c.activo !== false);
    if (permissions.isAdmin || permissions.getModuleCompanyScope('viaticos') === 'all') {
      return active;
    }
    return active.filter((c) => permissions.isCompanyAllowed(c.nombre, 'viaticos'));
  }, [moduleCompanies, permissions]);

  const visibleLiquidaciones = useMemo(
    () =>
      filterLiquidacionesByPermissions(
        data.liquidaciones,
        permissions,
        scope.matchedConsultor
      ),
    [data.liquidaciones, permissions, scope.matchedConsultor]
  );

  const activeLiquidation = useMemo(() => {
    if (visibleLiquidaciones.length === 0) return null;
    const found = visibleLiquidaciones.find((l) => l.id === data.activeLiquidationId);
    return found || visibleLiquidaciones[0];
  }, [visibleLiquidaciones, data.activeLiquidationId]);

  const modalLiquidation = useMemo(() => {
    if (!closeModalLiqId) return null;
    return (
      visibleLiquidaciones.find((l) => l.id === closeModalLiqId) || activeLiquidation
    );
  }, [closeModalLiqId, visibleLiquidaciones, activeLiquidation]);

  // Load IndexedDB receipt media for active & modal liquidations
  useEffect(() => {
    const ids: string[] = [];
    activeLiquidation?.items.forEach((it) => {
      if (it.attachmentId) ids.push(it.attachmentId);
    });
    modalLiquidation?.items.forEach((it) => {
      if (it.attachmentId) ids.push(it.attachmentId);
    });
    if (ids.length === 0) return;

    let cancelled = false;
    getReceiptMediaBatch(ids).then((loaded) => {
      if (cancelled || Object.keys(loaded).length === 0) return;
      setMediaMap((prev) => ({ ...prev, ...loaded }));
    });
    return () => {
      cancelled = true;
    };
  }, [activeLiquidation, modalLiquidation]);

  const showToast = (type: 'success' | 'info' | 'error', message: string) => {
    setToast({ type, message });
  };

  const handleCreateNewLiquidation = () => {
    if (!permissions.canOperate) return;
    const defaultConsultor =
      scope.matchedConsultor || scope.availableConsultores[0] || data.consultores[0];
    const nowIso = new Date().toISOString();
    const newLiq: ViaticoLiquidation = {
      id: `liq-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      lineaLiquidacion: 'Nueva Liquidación de Viáticos',
      semana: getCurrentIsoWeekNumber(),
      consultorId: defaultConsultor?.id || 'cons-default',
      consultorNombre: defaultConsultor?.nombreCompleto || 'Consultor Premex',
      consultorEmail: defaultConsultor?.email || permissions.email || '',
      empresa: defaultConsultor?.empresa || 'Premex Corp',
      monedaBase: defaultConsultor?.monedaBase || 'Quetzales',
      estado: 'borrador',
      items: [],
      totalLiquidacion: 0,
      totalConImpuestos: 0,
      totalSinImpuestos: 0,
      totalImpuestos: 0,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    onUpdateData(
      (prev) => ({
        ...prev,
        liquidaciones: [newLiq, ...prev.liquidaciones],
        activeLiquidationId: newLiq.id,
      }),
      true
    );
    setActiveTab('liquidador');
    showToast('info', `Nueva liquidación creada para ${newLiq.consultorNombre} (Semana #${newLiq.semana}).`);
  };

  const handleSelectLiquidation = (id: string) => {
    onUpdateData(
      (prev) => ({
        ...prev,
        activeLiquidationId: id,
      }),
      false
    );
  };

  const handleUpdateHeader = (patch: {
    lineaLiquidacion?: string;
    semana?: string;
    consultorId?: string;
    consultorNombre?: string;
    consultorEmail?: string;
    empresa?: string;
    monedaBase?: ViaticoCurrency;
  }) => {
    if (!activeLiquidation || !permissions.canOperate) return;
    onUpdateData((prev) => {
      const nextList = prev.liquidaciones.map((l) => {
        if (l.id !== activeLiquidation.id) return l;
        const nextBaseCurrency = patch.monedaBase || l.monedaBase;
        // If base currency changed, normalize 1:1 items in that currency cleanly
        const updatedItems = patch.monedaBase
          ? l.items.map((it) => {
              const fx = it.moneda === nextBaseCurrency ? 1 : it.tipoCambio;
              return {
                ...it,
                tipoCambio: fx,
                valorReintegrar: roundMoney(it.valorFactura * fx),
              };
            })
          : l.items;
        return recalculateLiquidationTotals({
          ...l,
          ...patch,
          monedaBase: nextBaseCurrency,
          items: updatedItems,
          updatedAtIso: new Date().toISOString(),
        });
      });
      return { ...prev, liquidaciones: nextList };
    }, true);
  };

  const handleAddOrUpdateItem = (item: ViaticoExpenseItem, isEdit: boolean) => {
    if (!activeLiquidation || !permissions.canOperate) return;
    onUpdateData((prev) => {
      const nextList = prev.liquidaciones.map((l) => {
        if (l.id !== activeLiquidation.id) return l;
        const nextItems = isEdit
          ? l.items.map((existing) => (existing.id === item.id ? item : existing))
          : [...l.items, item];
        return recalculateLiquidationTotals({
          ...l,
          items: nextItems,
          updatedAtIso: new Date().toISOString(),
        });
      });
      return { ...prev, liquidaciones: nextList };
    }, true);
    showToast(
      'success',
      isEdit
        ? `Factura de ${item.proveedor} actualizada.`
        : `Factura de ${item.proveedor} agregada a la liquidación.`
    );
  };

  const handleDeleteItem = (itemId: string) => {
    if (!activeLiquidation || !permissions.canOperate) return;
    const target = activeLiquidation.items.find((i) => i.id === itemId);
    if (target?.attachmentId) {
      void deleteReceiptMedia(target.attachmentId);
    }
    onUpdateData((prev) => {
      const nextList = prev.liquidaciones.map((l) => {
        if (l.id !== activeLiquidation.id) return l;
        return recalculateLiquidationTotals({
          ...l,
          items: l.items.filter((i) => i.id !== itemId),
          updatedAtIso: new Date().toISOString(),
        });
      });
      return { ...prev, liquidaciones: nextList };
    }, true);
  };

  const handleDeleteLiquidation = (liqId: string) => {
    if (!permissions.canOperate) return;
    const target = data.liquidaciones.find((l) => l.id === liqId);
    if (target && target.estado !== 'borrador' && !permissions.isAdmin) return;

    target?.items.forEach((it) => {
      if (it.attachmentId) void deleteReceiptMedia(it.attachmentId);
    });

    onUpdateData((prev) => {
      const remaining = prev.liquidaciones.filter((l) => l.id !== liqId);
      return {
        ...prev,
        liquidaciones: remaining,
        activeLiquidationId:
          prev.activeLiquidationId === liqId
            ? remaining[0]?.id || ''
            : prev.activeLiquidationId,
      };
    }, true);
    showToast('info', 'Liquidación eliminada.');
  };

  const handleSaveCloudClick = async () => {
    if (!permissions.canOperate) return;
    if (!currentUser) {
      showToast('info', 'Inicia sesión con tu cuenta de Google para respaldar las liquidaciones en Firestore.');
      onSignInWithGoogle();
      return;
    }
    setIsSavingCloud(true);
    try {
      await onSaveToCloud();
      showToast('success', 'Liquidación de viáticos guardada y sincronizada en la nube.');
    } catch (err: any) {
      showToast('error', err?.message || 'No se pudo guardar en Firestore.');
    } finally {
      setIsSavingCloud(false);
    }
  };

  const updateLiquidationStatusAndSync = async (
    targetLiqId: string,
    updater: (liq: ViaticoLiquidation) => ViaticoLiquidation
  ) => {
    const nextLiquidaciones = data.liquidaciones.map((l) =>
      l.id === targetLiqId ? updater(l) : l
    );
    const nextWorkspace: ViaticosWorkspaceData = {
      ...data,
      liquidaciones: nextLiquidaciones,
      hasUnsavedChanges: true,
    };
    onUpdateData(() => nextWorkspace, true);

    if (currentUser) {
      try {
        await onSaveToCloud(nextWorkspace);
      } catch (err) {
        console.warn('Cloud sync after status update skipped:', err);
      }
    }
  };

  const handleConfirmCloseLiquidation = async () => {
    if (!modalLiquidation || !permissions.canOperate) return;
    const nowIso = new Date().toISOString();
    await updateLiquidationStatusAndSync(modalLiquidation.id, (liq) => ({
      ...liq,
      estado: 'cerrada',
      closedAtIso: nowIso,
      closedBy: currentUser?.email || permissions.email || liq.consultorNombre,
      updatedAtIso: nowIso,
    }));
  };

  const handleMarkAsSent = async (sentToEmail: string) => {
    if (!modalLiquidation || !permissions.canOperate) return;
    const nowIso = new Date().toISOString();
    await updateLiquidationStatusAndSync(modalLiquidation.id, (liq) => ({
      ...liq,
      estado: 'enviada',
      closedAtIso: liq.closedAtIso || nowIso,
      closedBy: liq.closedBy || currentUser?.email || permissions.email || liq.consultorNombre,
      sentAtIso: nowIso,
      sentToEmail,
      updatedAtIso: nowIso,
    }));
  };

  const handleReopenLiquidation = async () => {
    if (!modalLiquidation || !permissions.isAdmin) return;
    const nowIso = new Date().toISOString();
    await updateLiquidationStatusAndSync(modalLiquidation.id, (liq) => ({
      ...liq,
      estado: 'borrador',
      updatedAtIso: nowIso,
    }));
    showToast('info', 'Liquidación reabierta por Administrador.');
  };

  const handleUpsertConsultor = (consultor: ViaticoConsultor) => {
    if (!permissions.isAdmin) return;
    onUpdateData((prev) => {
      const exists = prev.consultores.some((c) => c.id === consultor.id);
      const nextConsultores = exists
        ? prev.consultores.map((c) => (c.id === consultor.id ? consultor : c))
        : [...prev.consultores, consultor];
      return { ...prev, consultores: nextConsultores };
    }, true);
    showToast('success', `Consultor ${consultor.nombreCompleto} guardado en el listado.`);
  };

  const handleDeleteConsultor = (consultorId: string) => {
    if (!permissions.isAdmin) return;
    onUpdateData(
      (prev) => ({
        ...prev,
        consultores: prev.consultores.filter((c) => c.id !== consultorId),
      }),
      true
    );
    showToast('info', 'Consultor retirado del listado.');
  };

  const handleQuickDownloadExcel = async (target?: ViaticoLiquidation | null) => {
    const liq = target || activeLiquidation;
    if (!liq) return;
    try {
      const filename = await exportViaticosExcel(liq);
      showToast('success', `Excel descargado: ${filename}`);
    } catch (err: any) {
      showToast('error', err?.message || 'Error al generar el Excel.');
    }
  };

  const handleQuickDownloadPdf = async (target: ViaticoLiquidation) => {
    try {
      const ids = target.items.map((it) => it.attachmentId || '').filter(Boolean);
      const loaded = await getReceiptMediaBatch(ids);
      const merged = { ...mediaMap, ...loaded };
      const res = await exportViaticosReceiptsPdf(target, merged);
      showToast(
        'success',
        `PDF descargado: ${res.filename} (${res.embeddedCount} soporte(s) visual(es) incluidos).`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Error al compilar el PDF de comprobantes.');
    }
  };

  const sidebarScopeLabel =
    scope.detectedFromEmailLabel ||
    (scope.matchedConsultor
      ? scope.matchedConsultor.nombreCompleto
      : permissions.isAdmin
      ? 'Todos los consultores'
      : 'Alcance por empresa');

  return (
    <div className="min-h-screen bg-[#F5F8FC] flex flex-col font-sans text-slate-800 antialiased">
      <ViaticosSidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onSwitchModule={onSwitchModule}
        permissions={permissions}
        activeItemsCount={activeLiquidation?.items.length || 0}
        liquidacionesCount={visibleLiquidaciones.length}
        consultorScopeLabel={sidebarScopeLabel}
      />

      <div className="lg:pl-72 flex flex-col flex-1 min-h-screen">
        <ViaticosHeader
          activeTab={activeTab}
          activeLiquidation={activeLiquidation}
          onToggleMobileMenu={() => setIsMobileMenuOpen(true)}
          onSwitchModule={onSwitchModule}
          onCreateNewLiquidation={handleCreateNewLiquidation}
          onSaveToCloud={handleSaveCloudClick}
          onOpenCloseEmailModal={() => {
            if (activeLiquidation) setCloseModalLiqId(activeLiquidation.id);
          }}
          onQuickDownloadExcel={() => {
            void handleQuickDownloadExcel(activeLiquidation);
          }}
          isSavingCloud={isSavingCloud}
          hasUnsavedChanges={data.hasUnsavedChanges}
          currentUser={currentUser}
          onSignInWithGoogle={onSignInWithGoogle}
          onSignOut={onSignOut}
          permissions={permissions}
        />

        {/* Company Scope & Inline Feedback Banners */}
        {(toast || permissions.getModuleCompanyScope('viaticos') === 'selected') && (
          <div className="px-4 sm:px-6 lg:px-8 pt-4 max-w-[1480px] mx-auto w-full space-y-2">
            {permissions.getModuleCompanyScope('viaticos') === 'selected' && (
              <div className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
                <span className="truncate">
                  <strong className="font-semibold text-slate-800">
                    Sociedades autorizadas (Viáticos):
                  </strong>{' '}
                  {permissions.getAllowedCompaniesForModule('viaticos').length > 0
                    ? permissions.getAllowedCompaniesForModule('viaticos').join(', ')
                    : 'Sin sociedades asignadas en este módulo'}
                </span>
              </div>
            )}

            {toast && (
              <div
                className={`px-4 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                  toast.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : toast.type === 'error'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-blue-50 border-blue-200 text-blue-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  {toast.type === 'error' ? (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  )}
                  <span className="font-medium">{toast.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
                  aria-label="Cerrar notificación"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1480px] mx-auto w-full">
          {activeTab === 'liquidador' ? (
            <ViaticosLiquidadorView
              liquidation={activeLiquidation}
              visibleLiquidaciones={visibleLiquidaciones}
              availableConsultores={scope.availableConsultores}
              moduleCompanies={visibleModuleCompanies}
              isLockedToOwnConsultor={scope.isLockedToOwnConsultor}
              detectedFromEmailLabel={scope.detectedFromEmailLabel}
              mediaMap={mediaMap}
              onMediaSaved={(media) =>
                setMediaMap((prev) => ({ ...prev, [media.id]: media }))
              }
              permissions={permissions}
              onSelectLiquidation={handleSelectLiquidation}
              onCreateNewLiquidation={handleCreateNewLiquidation}
              onUpdateHeader={handleUpdateHeader}
              onAddOrUpdateItem={handleAddOrUpdateItem}
              onDeleteItem={handleDeleteItem}
              onOpenCloseEmailModal={() => {
                if (activeLiquidation) setCloseModalLiqId(activeLiquidation.id);
              }}
              onQuickDownloadExcel={() => {
                void handleQuickDownloadExcel(activeLiquidation);
              }}
            />
          ) : (
            <ViaticosHistorialView
              liquidaciones={visibleLiquidaciones}
              consultores={scope.availableConsultores}
              moduleCompanies={visibleModuleCompanies}
              activeLiquidationId={activeLiquidation?.id || ''}
              permissions={permissions}
              isLockedToOwnConsultor={scope.isLockedToOwnConsultor}
              onOpenLiquidation={(id) => {
                handleSelectLiquidation(id);
                setActiveTab('liquidador');
              }}
              onCreateNewLiquidation={handleCreateNewLiquidation}
              onDeleteLiquidation={handleDeleteLiquidation}
              onDownloadExcel={(liq) => {
                void handleQuickDownloadExcel(liq);
              }}
              onDownloadPdf={(liq) => {
                void handleQuickDownloadPdf(liq);
              }}
              onOpenCloseEmailFor={(liq) => setCloseModalLiqId(liq.id)}
              onUpsertConsultor={handleUpsertConsultor}
              onDeleteConsultor={handleDeleteConsultor}
            />
          )}
        </main>
      </div>

      {/* Close Liquidation & Send Email (Excel + Compiled Receipts PDF) Modal */}
      <ViaticosCloseEmailModal
        isOpen={Boolean(closeModalLiqId && modalLiquidation)}
        onClose={() => setCloseModalLiqId(null)}
        liquidation={modalLiquidation}
        mediaMap={mediaMap}
        permissions={permissions}
        onConfirmCloseLiquidation={handleConfirmCloseLiquidation}
        onMarkAsSent={handleMarkAsSent}
        onReopenLiquidation={permissions.isAdmin ? handleReopenLiquidation : undefined}
      />
    </div>
  );
};
