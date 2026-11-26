import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  CheckCircle2,
  AlertTriangle,
  X,
  Building2,
  FileText,
  Archive,
  Calculator,
  FolderClock,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Mail,
} from 'lucide-react';
import {
  ActiveModuleId,
  EffectivePermissions,
  ModuleCompanyEntry,
  UserPermissionRecord,
  ViaticoConsultor,
  ViaticoCurrency,
  ViaticoEmailGroup,
  ViaticoExpenseItem,
  ViaticoLiquidation,
  ViaticoOdooCatalogs,
  ViaticosTab,
  ViaticosWorkspaceData,
} from '../../types';
import {
  StoredReceiptMedia,
  deleteReceiptMedia,
  getReceiptMedia,
  getReceiptMediaBatch,
  syncLocalReceiptsToCloud,
  uploadReceiptMediaToCloud,
} from '../../services/viaticosMediaStore';
import {
  filterLiquidacionesByPermissions,
  filterLiquidacionesForAccounting,
  recalculateLiquidationTotals,
  resolveLiquidationCostCenter,
  resolveViaticosConsultantScope,
  roundExchangeRate,
  roundMoney,
} from '../../utils/viaticos';
import {
  findMatchingCostCenterEntry,
  mergeOdooCatalogsWithDefaults,
  resolveEmployeeAndCostCenterForLiquidation,
  resolveOperatingUserPermissionsStamp,
  saveLocalOdooCatalogs,
} from '../../utils/viaticosOdooCatalogs';
import {
  ALL_VIATICOS_PANELS,
  normalizeCompanyKey,
  normalizeEmail,
} from '../../utils/permissions';
import {
  exportViaticosExcel,
  exportViaticosReceiptsPdf,
} from '../../utils/viaticosExport';
import { ViaticosSidebar } from './ViaticosSidebar';
import { ViaticosHeader } from './ViaticosHeader';
import { ViaticosLiquidadorView } from './ViaticosLiquidadorView';
import { ViaticosSociedadesView } from './ViaticosSociedadesView';
import { ViaticosHistorialView } from './ViaticosHistorialView';
import { ViaticosContabilidadView } from './ViaticosContabilidadView';
import { ViaticosEmailDirectoryView } from './ViaticosEmailDirectoryView';
import { ViaticosCloseEmailModal } from './ViaticosCloseEmailModal';
import { ViaticosPlanillaPdfModal } from './ViaticosPlanillaPdfModal';
import {
  NewLiquidationPayload,
  ViaticosNewLiquidationModal,
} from './ViaticosNewLiquidationModal';
import { ViaticosCloseConfirmModal } from './ViaticosCloseConfirmModal';

interface ViaticosModuleWorkspaceProps {
  data: ViaticosWorkspaceData;
  onUpdateData: (
    updater: (prev: ViaticosWorkspaceData) => ViaticosWorkspaceData,
    markUnsaved?: boolean
  ) => void;
  onSaveToCloud: (overrideData?: ViaticosWorkspaceData) => Promise<void>;
  currentUser: User | null;
  accessToken?: string | null;
  onSignInWithGoogle: () => void;
  onReconnectWorkspace?: () => Promise<string | null>;
  onInvalidateWorkspaceToken?: () => void;
  onSignOut: () => void;
  onSwitchModule: (moduleId: ActiveModuleId) => void;
  permissions: EffectivePermissions;
  moduleCompanies?: ModuleCompanyEntry[];
  onSaveModuleCompanies?: (nextCompanies: ModuleCompanyEntry[]) => Promise<void>;
  permissionRecords?: UserPermissionRecord[];
  onUpsertPermissionRecord?: (record: UserPermissionRecord) => Promise<void>;
}

export const ViaticosModuleWorkspace: React.FC<ViaticosModuleWorkspaceProps> = ({
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
  onSaveModuleCompanies,
  permissionRecords = [],
  onUpsertPermissionRecord,
}) => {
  const allowedPanels = useMemo(
    () =>
      ALL_VIATICOS_PANELS.filter((panel) =>
        permissions.canAccessViaticosPanel(panel)
      ),
    [permissions]
  );
  const [activeTab, setActiveTab] = useState<ViaticosTab>(
    () =>
      ALL_VIATICOS_PANELS.find((panel) =>
        permissions.canAccessViaticosPanel(panel)
      ) || 'liquidador'
  );
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!permissions.canAccessViaticosPanel(activeTab)) {
      const fallback = allowedPanels[0] || 'cerradas';
      setActiveTab(fallback);
    }
  }, [activeTab, allowedPanels, permissions]);
  const [isSavingCloud, setIsSavingCloud] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [mediaMap, setMediaMap] = useState<Record<string, StoredReceiptMedia>>({});
  const [loadingMediaIds, setLoadingMediaIds] = useState<Set<string>>(() => new Set());
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [closeConfirmLiqId, setCloseConfirmLiqId] = useState<string | null>(null);
  const [closeModalLiqId, setCloseModalLiqId] = useState<string | null>(null);
  const [planillaPreviewLiqId, setPlanillaPreviewLiqId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  const ZOOM_STEPS = [85, 95, 100, 115, 125, 140, 155] as const;
  const ZOOM_STORAGE_KEY = 'premex_viaticos_zoom_pct';
  const [zoomPercent, setZoomPercent] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(ZOOM_STORAGE_KEY));
      return ZOOM_STEPS.includes(saved as (typeof ZOOM_STEPS)[number]) ? saved : 100;
    } catch {
      return 100;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(ZOOM_STORAGE_KEY, String(zoomPercent));
    } catch {
      // ignore storage errors
    }
    document.documentElement.style.fontSize =
      zoomPercent === 100 ? '' : `${(16 * zoomPercent) / 100}px`;
    return () => {
      document.documentElement.style.fontSize = '';
    };
  }, [zoomPercent]);

  const handleStepZoom = (direction: -1 | 1) => {
    setZoomPercent((curr) => {
      const idx = ZOOM_STEPS.indexOf(curr as (typeof ZOOM_STEPS)[number]);
      const safeIdx = idx >= 0 ? idx : ZOOM_STEPS.indexOf(100);
      const nextIdx = Math.min(ZOOM_STEPS.length - 1, Math.max(0, safeIdx + direction));
      return ZOOM_STEPS[nextIdx];
    });
  };

  // Keep synchronous ref + serialized queue so rapid factura uploads never race cloud saves
  const latestDataRef = useRef<ViaticosWorkspaceData>(data);
  latestDataRef.current = data;
  const cloudSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingCloudSavesRef = useRef<number>(0);
  const headerSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (headerSyncTimerRef.current) {
        clearTimeout(headerSyncTimerRef.current);
      }
    };
  }, []);

  const resolvedOdooCatalogs = useMemo(
    () => mergeOdooCatalogsWithDefaults(data.odooCatalogs),
    [data.odooCatalogs]
  );

  // Resolve consultant identity automatically from corporate email (primerNombre.primerApellido), Permissions DB & Odoo Catalog
  const scope = useMemo(
    () =>
      resolveViaticosConsultantScope(
        data.consultores,
        permissions,
        resolvedOdooCatalogs,
        permissionRecords
      ),
    [data.consultores, permissions, resolvedOdooCatalogs, permissionRecords]
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
        scope.matchedConsultor,
        scope.availableConsultores
      ),
    [data.liquidaciones, permissions, scope.matchedConsultor, scope.availableConsultores]
  );

  // Consolidated multi-liquidador list for the Contabilidad / Odoo section
  const accountingLiquidaciones = useMemo(
    () => filterLiquidacionesForAccounting(data.liquidaciones, permissions),
    [data.liquidaciones, permissions]
  );

  const openLiquidacionesCount = useMemo(
    () => visibleLiquidaciones.filter((l) => l.estado === 'borrador').length,
    [visibleLiquidaciones]
  );

  const closedLiquidacionesCount = useMemo(
    () => visibleLiquidaciones.filter((l) => l.estado !== 'borrador').length,
    [visibleLiquidaciones]
  );

  const activeLiquidation = useMemo(() => {
    if (visibleLiquidaciones.length === 0) return null;
    const found = visibleLiquidaciones.find((l) => l.id === data.activeLiquidationId);
    return found || visibleLiquidaciones[0];
  }, [visibleLiquidaciones, data.activeLiquidationId]);

  const closeConfirmLiquidation = useMemo(() => {
    if (!closeConfirmLiqId) return null;
    return (
      visibleLiquidaciones.find((l) => l.id === closeConfirmLiqId) || activeLiquidation
    );
  }, [closeConfirmLiqId, visibleLiquidaciones, activeLiquidation]);

  const modalLiquidation = useMemo(() => {
    if (!closeModalLiqId) return null;
    return (
      visibleLiquidaciones.find((l) => l.id === closeModalLiqId) || activeLiquidation
    );
  }, [closeModalLiqId, visibleLiquidaciones, activeLiquidation]);

  const planillaPreviewLiquidation = useMemo(() => {
    if (!planillaPreviewLiqId) return null;
    return (
      accountingLiquidaciones.find((l) => l.id === planillaPreviewLiqId) ||
      visibleLiquidaciones.find((l) => l.id === planillaPreviewLiqId) ||
      activeLiquidation
    );
  }, [planillaPreviewLiqId, accountingLiquidaciones, visibleLiquidaciones, activeLiquidation]);

  const mediaMapRef = useRef<Record<string, StoredReceiptMedia>>({});
  mediaMapRef.current = mediaMap;

  const ensureReceiptMediaIdsLoaded = useCallback(
    async (rawIds: string[]) => {
      const missingIds = Array.from(
        new Set(rawIds.filter((id) => Boolean(id) && !mediaMapRef.current[id]))
      );
      if (missingIds.length === 0) return;

      setLoadingMediaIds((prev) => {
        const next = new Set(prev);
        missingIds.forEach((id) => next.add(id));
        return next;
      });

      try {
        const loaded = await getReceiptMediaBatch(missingIds);
        if (Object.keys(loaded).length > 0) {
          setMediaMap((prev) => ({ ...prev, ...loaded }));
        }
        if (currentUser && permissions.canOperate) {
          void syncLocalReceiptsToCloud(missingIds);
        }
      } finally {
        setLoadingMediaIds((prev) => {
          const next = new Set(prev);
          missingIds.forEach((id) => next.delete(id));
          return next;
        });
      }
    },
    [currentUser, permissions.canOperate]
  );

  const loadSingleReceiptMedia = useCallback(
    async (attachmentId: string): Promise<StoredReceiptMedia | null> => {
      if (!attachmentId) return null;
      const existing = mediaMapRef.current[attachmentId];
      if (existing) return existing;

      setLoadingMediaIds((prev) => new Set(prev).add(attachmentId));
      try {
        const loaded = await getReceiptMedia(attachmentId);
        if (loaded) {
          setMediaMap((prev) => ({ ...prev, [attachmentId]: loaded }));
          if (currentUser && permissions.canOperate && !loaded.cloudSynced) {
            void uploadReceiptMediaToCloud(loaded).then((res) => {
              if (res.cloudSynced) {
                setMediaMap((prev) => ({ ...prev, [attachmentId]: res.media }));
              }
            });
          }
        }
        return loaded;
      } finally {
        setLoadingMediaIds((prev) => {
          const next = new Set(prev);
          next.delete(attachmentId);
          return next;
        });
      }
    },
    [currentUser, permissions.canOperate]
  );

  // Load IndexedDB + Firestore receipt media for active, close-confirm & email-modal liquidations
  useEffect(() => {
    const ids: string[] = [];
    activeLiquidation?.items.forEach((it) => {
      if (it.attachmentId) ids.push(it.attachmentId);
    });
    closeConfirmLiquidation?.items.forEach((it) => {
      if (it.attachmentId) ids.push(it.attachmentId);
    });
    modalLiquidation?.items.forEach((it) => {
      if (it.attachmentId) ids.push(it.attachmentId);
    });
    if (ids.length === 0) return;

    void ensureReceiptMediaIdsLoaded(ids);
  }, [
    activeLiquidation,
    closeConfirmLiquidation,
    modalLiquidation,
    currentUser?.uid,
    ensureReceiptMediaIdsLoaded,
  ]);

  const showToast = (type: 'success' | 'info' | 'error', message: string) => {
    setToast({ type, message });
  };

  const enqueueAutoCloudSync = (
    snapshot: ViaticosWorkspaceData,
    opts?: {
      successMessage?: string;
      offlineMessage?: string;
      errorPrefix?: string;
    }
  ) => {
    if (!permissions.canOperate) return;
    if (!currentUser) {
      if (opts?.offlineMessage) {
        showToast('info', opts.offlineMessage);
      }
      return;
    }

    pendingCloudSavesRef.current += 1;
    setIsSavingCloud(true);

    cloudSyncQueueRef.current = cloudSyncQueueRef.current
      .catch(() => {})
      .then(async () => {
        try {
          await onSaveToCloud(snapshot);
          if (opts?.successMessage) {
            showToast('success', opts.successMessage);
          }
        } catch (err: any) {
          const errDetail = err?.message || 'Sin conexión a Firestore.';
          showToast(
            'error',
            `${opts?.errorPrefix || 'Cambio guardado localmente, pero falló la sincronización en la nube'}: ${errDetail}`
          );
        } finally {
          pendingCloudSavesRef.current = Math.max(0, pendingCloudSavesRef.current - 1);
          if (pendingCloudSavesRef.current === 0) {
            setIsSavingCloud(false);
          }
        }
      });
  };

  const mutateAndAutoSync = (
    mutator: (prev: ViaticosWorkspaceData) => ViaticosWorkspaceData,
    opts?: {
      debounceMs?: number;
      successMessage?: string;
      offlineMessage?: string;
      errorPrefix?: string;
    }
  ) => {
    if (!permissions.canOperate) return;
    const nextWorkspace: ViaticosWorkspaceData = {
      ...mutator(latestDataRef.current),
      hasUnsavedChanges: true,
    };
    latestDataRef.current = nextWorkspace;
    onUpdateData(() => nextWorkspace, true);

    if (opts?.debounceMs && opts.debounceMs > 0) {
      if (headerSyncTimerRef.current) {
        clearTimeout(headerSyncTimerRef.current);
      }
      headerSyncTimerRef.current = setTimeout(() => {
        headerSyncTimerRef.current = null;
        enqueueAutoCloudSync(latestDataRef.current, opts);
      }, opts.debounceMs);
    } else {
      if (headerSyncTimerRef.current) {
        clearTimeout(headerSyncTimerRef.current);
        headerSyncTimerRef.current = null;
      }
      enqueueAutoCloudSync(nextWorkspace, opts);
    }
  };

  const handleOpenNewLiquidationModal = () => {
    if (!permissions.canOperate) return;
    setIsNewModalOpen(true);
  };

  const handleCreateNewLiquidation = (payload: NewLiquidationPayload) => {
    if (!permissions.canOperate) return;
    const chosenConsultor =
      scope.availableConsultores.find((c) => c.id === payload.consultorId) ||
      scope.matchedConsultor ||
      scope.availableConsultores[0] ||
      data.consultores[0];
    const nowIso = new Date().toISOString();
    const resolvedEmp = resolveEmployeeAndCostCenterForLiquidation({
      liquidation: {
        centroCosto: payload.centroCosto || chosenConsultor?.centroCosto || '',
        consultorId: chosenConsultor?.id || 'cons-default',
        consultorEmail: chosenConsultor?.email || permissions.email || '',
        consultorNombre: chosenConsultor?.nombreCompleto || 'Consultor Premex',
      },
      consultores: data.consultores,
      catalogs: resolvedOdooCatalogs,
      permissionRecords,
    });
    const permittedEmpresa = (() => {
      if (visibleModuleCompanies.length === 0) {
        return payload.empresa || chosenConsultor?.empresa || 'Premex Corp';
      }
      const candKey = normalizeCompanyKey(payload.empresa || chosenConsultor?.empresa || '');
      const matched = candKey
        ? visibleModuleCompanies.find((c) => normalizeCompanyKey(c.nombre) === candKey)
        : undefined;
      return matched ? matched.nombre : visibleModuleCompanies[0].nombre;
    })();
    const newLiq: ViaticoLiquidation = {
      id: `liq-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      lineaLiquidacion: payload.lineaLiquidacion,
      semana: payload.semana,
      consultorId: chosenConsultor?.id || 'cons-default',
      consultorNombre: chosenConsultor?.nombreCompleto || 'Consultor Premex',
      consultorEmail: chosenConsultor?.email || permissions.email || '',
      empresa: permittedEmpresa,
      centroCosto:
        (payload.centroCosto || '').trim() ||
        resolvedEmp.costCenterLabel ||
        chosenConsultor?.centroCosto ||
        '',
      odooEmployeeName:
        chosenConsultor?.odooEmployeeName || resolvedEmp.employeeName || '',
      odooAnalyticDistribution:
        chosenConsultor?.odooAnalyticDistribution ||
        resolvedEmp.analyticDistribution ||
        '',
      monedaBase: payload.monedaBase,
      tipoCambioLiquidacion:
        payload.monedaBase === 'Dólares' &&
        typeof payload.tipoCambioLiquidacion === 'number' &&
        payload.tipoCambioLiquidacion > 0
          ? roundExchangeRate(payload.tipoCambioLiquidacion)
          : undefined,
      estado: 'borrador',
      items: [],
      totalLiquidacion: 0,
      totalConImpuestos: 0,
      totalSinImpuestos: 0,
      totalImpuestos: 0,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    if (permissions.canAccessViaticosPanel('liquidador')) {
      setActiveTab('liquidador');
    }
    mutateAndAutoSync(
      (prev) => ({
        ...prev,
        liquidaciones: [newLiq, ...prev.liquidaciones],
        activeLiquidationId: newLiq.id,
      }),
      {
        successMessage: `Nueva liquidación creada y sincronizada en la nube: "${newLiq.lineaLiquidacion}" (Semana #${newLiq.semana} · ${newLiq.monedaBase}).`,
        offlineMessage: `Nueva liquidación abierta localmente: "${newLiq.lineaLiquidacion}". Inicia sesión con Google para respaldar en la nube.`,
      }
    );
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
    centroCosto?: string;
    odooEmployeeName?: string;
    odooAnalyticDistribution?: string;
    monedaBase?: ViaticoCurrency;
    tipoCambioLiquidacion?: number;
  }) => {
    if (!activeLiquidation || !permissions.canOperate) return;
    const targetLiqId = activeLiquidation.id;
    mutateAndAutoSync(
      (prev) => {
        const nextList = prev.liquidaciones.map((l) => {
          if (l.id !== targetLiqId) return l;
          const nextBaseCurrency = patch.monedaBase || l.monedaBase;
          let nextDocFx: number | undefined = l.tipoCambioLiquidacion;

          if (nextBaseCurrency !== 'Dólares') {
            nextDocFx = undefined;
          } else if (patch.tipoCambioLiquidacion !== undefined) {
            nextDocFx =
              Number.isFinite(patch.tipoCambioLiquidacion) && patch.tipoCambioLiquidacion > 0
                ? roundExchangeRate(patch.tipoCambioLiquidacion)
                : undefined;
          } else if (
            patch.monedaBase === 'Dólares' &&
            l.monedaBase !== 'Dólares' &&
            (!nextDocFx || nextDocFx <= 0)
          ) {
            nextDocFx = 1;
          }

          const shouldRecalcItems =
            patch.monedaBase !== undefined || patch.tipoCambioLiquidacion !== undefined;

          const updatedItems = shouldRecalcItems
            ? l.items.map((it) => {
                const fx =
                  nextBaseCurrency === 'Dólares' && nextDocFx && nextDocFx > 0
                    ? nextDocFx
                    : it.moneda === nextBaseCurrency
                    ? 1
                    : it.tipoCambio;
                return {
                  ...it,
                  tipoCambio: fx,
                  valorReintegrar: roundMoney(it.valorFactura * fx),
                };
              })
            : l.items;

          let nextEmpresa = patch.empresa !== undefined ? patch.empresa : l.empresa;
          if (patch.empresa !== undefined && visibleModuleCompanies.length > 0) {
            const matchedComp = visibleModuleCompanies.find(
              (c) => normalizeCompanyKey(c.nombre) === normalizeCompanyKey(patch.empresa!)
            );
            if (matchedComp) {
              nextEmpresa = matchedComp.nombre;
            } else if (patch.consultorId) {
              // When switching consultant, keep a permitted society
              const existingMatch = visibleModuleCompanies.find(
                (c) => normalizeCompanyKey(c.nombre) === normalizeCompanyKey(l.empresa)
              );
              nextEmpresa = existingMatch ? existingMatch.nombre : visibleModuleCompanies[0].nombre;
            }
          }

          const nextLiq: ViaticoLiquidation = {
            ...l,
            ...patch,
            empresa: nextEmpresa,
            monedaBase: nextBaseCurrency,
            tipoCambioLiquidacion: nextDocFx,
            items: updatedItems,
            updatedAtIso: new Date().toISOString(),
          };
          if (nextDocFx === undefined) {
            delete nextLiq.tipoCambioLiquidacion;
          }
          return recalculateLiquidationTotals(nextLiq);
        });
        return { ...prev, liquidaciones: nextList };
      },
      {
        debounceMs: 800,
        errorPrefix: 'Encabezado actualizado localmente, pero falló el respaldo automático',
      }
    );
  };

  const handleAddOrUpdateItem = (item: ViaticoExpenseItem, isEdit: boolean) => {
    if (!activeLiquidation || !permissions.canOperate) return;
    const targetLiqId = activeLiquidation.id;
    const stamp = resolveOperatingUserPermissionsStamp(
      permissions,
      currentUser?.email || undefined,
      currentUser?.displayName || undefined
    );
    const stampedItem: ViaticoExpenseItem = {
      ...item,
      registeredByEmail: item.registeredByEmail || stamp.email,
      registeredByName: item.registeredByName || stamp.name,
      updatedAtIso: stamp.atIso,
    };
    if (currentUser && stampedItem.attachmentId) {
      const localMedia = mediaMapRef.current[stampedItem.attachmentId];
      if (localMedia && !localMedia.cloudSynced) {
        void uploadReceiptMediaToCloud(localMedia).then((res) => {
          if (res.cloudSynced) {
            setMediaMap((prev) => ({ ...prev, [stampedItem.attachmentId!]: res.media }));
          }
        });
      }
    }
    if (currentUser) {
      showToast(
        'info',
        isEdit
          ? `Actualizando factura de ${stampedItem.proveedor} en la nube...`
          : `Guardando factura de ${stampedItem.proveedor} en la nube...`
      );
    }
    mutateAndAutoSync(
      (prev) => {
        const nextList = prev.liquidaciones.map((l) => {
          if (l.id !== targetLiqId) return l;
          const nextItems = isEdit
            ? l.items.map((existing) =>
                existing.id === stampedItem.id ? stampedItem : existing
              )
            : [...l.items, stampedItem];
          return recalculateLiquidationTotals({
            ...l,
            items: nextItems,
            updatedAtIso: stamp.atIso,
          });
        });
        return { ...prev, liquidaciones: nextList };
      },
      {
        successMessage: isEdit
          ? `Factura de ${stampedItem.proveedor} actualizada y sincronizada en la nube.`
          : `Factura de ${stampedItem.proveedor} agregada y sincronizada en la nube automáticamente.`,
        offlineMessage: isEdit
          ? `Factura de ${stampedItem.proveedor} actualizada localmente (inicia sesión para sincronizar en la nube).`
          : `Factura de ${stampedItem.proveedor} agregada localmente (inicia sesión para sincronizar en la nube).`,
        errorPrefix: `Factura de ${stampedItem.proveedor} guardada localmente, pero no se pudo subir a la nube`,
      }
    );
  };

  const handleAddMultipleItems = (items: ViaticoExpenseItem[]) => {
    if (!activeLiquidation || !permissions.canOperate || items.length === 0) return;
    const targetLiqId = activeLiquidation.id;
    const stamp = resolveOperatingUserPermissionsStamp(
      permissions,
      currentUser?.email || undefined,
      currentUser?.displayName || undefined
    );
    const stampedItems: ViaticoExpenseItem[] = items.map((item) => ({
      ...item,
      registeredByEmail: item.registeredByEmail || stamp.email,
      registeredByName: item.registeredByName || stamp.name,
      updatedAtIso: stamp.atIso,
    }));

    const attachmentIdsToSync = Array.from(
      new Set(
        stampedItems
          .map((it) => it.attachmentId)
          .filter((id): id is string => Boolean(id))
      )
    );
    if (currentUser && attachmentIdsToSync.length > 0) {
      attachmentIdsToSync.forEach((attId) => {
        const localMedia = mediaMapRef.current[attId];
        if (localMedia && !localMedia.cloudSynced) {
          void uploadReceiptMediaToCloud(localMedia).then((res) => {
            if (res.cloudSynced) {
              setMediaMap((prev) => ({ ...prev, [attId]: res.media }));
            }
          });
        }
      });
    }

    mutateAndAutoSync(
      (prev) => {
        const nextList = prev.liquidaciones.map((l) => {
          if (l.id !== targetLiqId) return l;
          return recalculateLiquidationTotals({
            ...l,
            items: [...l.items, ...stampedItems],
            updatedAtIso: stamp.atIso,
          });
        });
        return { ...prev, liquidaciones: nextList };
      },
      {
        successMessage: `${stampedItems.length} factura(s) agregada(s) desde PDF masivo y sincronizadas en la nube.`,
        offlineMessage: `${stampedItems.length} factura(s) agregada(s) localmente desde PDF masivo.`,
        errorPrefix: `Se agregaron ${stampedItems.length} factura(s) localmente, pero falló la sincronización en la nube`,
      }
    );
  };

  const handleBulkUpdateItems = (
    itemIds: string[],
    patch: Partial<
      Pick<
        ViaticoExpenseItem,
        'clienteContacto' | 'objetivoComercial' | 'descripcionGasto' | 'categoria' | 'kilometraje'
      >
    >
  ) => {
    if (!activeLiquidation || !permissions.canOperate || itemIds.length === 0) return;
    const targetLiqId = activeLiquidation.id;
    const idSet = new Set(itemIds);
    const stamp = resolveOperatingUserPermissionsStamp(
      permissions,
      currentUser?.email || undefined,
      currentUser?.displayName || undefined
    );

    let updatedCount = 0;
    mutateAndAutoSync(
      (prev) => {
        const nextList = prev.liquidaciones.map((l) => {
          if (l.id !== targetLiqId) return l;
          const nextItems = l.items.map((existing) => {
            if (!idSet.has(existing.id)) return existing;
            updatedCount += 1;
            return {
              ...existing,
              ...patch,
              updatedAtIso: stamp.atIso,
            };
          });
          return recalculateLiquidationTotals({
            ...l,
            items: nextItems,
            updatedAtIso: stamp.atIso,
          });
        });
        return { ...prev, liquidaciones: nextList };
      },
      {
        successMessage: `${Math.max(updatedCount, itemIds.length)} factura(s) actualizada(s) masivamente y sincronizada(s) en la nube.`,
        offlineMessage: `${Math.max(updatedCount, itemIds.length)} factura(s) actualizada(s) masivamente de forma local.`,
        errorPrefix: 'Cambios masivos guardados localmente, pero falló la sincronización en la nube',
      }
    );
  };

  const handleDeleteItem = (itemId: string) => {
    if (!activeLiquidation || !permissions.canOperate) return;
    const targetLiqId = activeLiquidation.id;
    const target = activeLiquidation.items.find((i) => i.id === itemId);
    if (target?.attachmentId) {
      const stillReferencedElsewhere = latestDataRef.current.liquidaciones.some((l) =>
        l.items.some(
          (it) =>
            it.attachmentId === target.attachmentId &&
            !(l.id === targetLiqId && it.id === itemId)
        )
      );
      if (!stillReferencedElsewhere) {
        void deleteReceiptMedia(target.attachmentId);
      }
    }
    mutateAndAutoSync(
      (prev) => {
        const nextList = prev.liquidaciones.map((l) => {
          if (l.id !== targetLiqId) return l;
          return recalculateLiquidationTotals({
            ...l,
            items: l.items.filter((i) => i.id !== itemId),
            updatedAtIso: new Date().toISOString(),
          });
        });
        return { ...prev, liquidaciones: nextList };
      },
      {
        successMessage: target
          ? `Factura de ${target.proveedor} eliminada y sincronizada en la nube.`
          : 'Factura eliminada y sincronizada en la nube.',
        offlineMessage: 'Factura eliminada localmente.',
      }
    );
  };

  const handleDeleteLiquidation = (liqId: string) => {
    if (!permissions.canOperate) return;
    const target = data.liquidaciones.find((l) => l.id === liqId);
    if (target && target.estado !== 'borrador' && !permissions.isAdmin) return;

    target?.items.forEach((it) => {
      if (!it.attachmentId) return;
      const stillReferencedElsewhere = latestDataRef.current.liquidaciones.some(
        (l) =>
          l.id !== liqId &&
          l.items.some((other) => other.attachmentId === it.attachmentId)
      );
      if (!stillReferencedElsewhere) {
        void deleteReceiptMedia(it.attachmentId);
      }
    });

    mutateAndAutoSync(
      (prev) => {
        const remaining = prev.liquidaciones.filter((l) => l.id !== liqId);
        return {
          ...prev,
          liquidaciones: remaining,
          activeLiquidationId:
            prev.activeLiquidationId === liqId
              ? remaining[0]?.id || ''
              : prev.activeLiquidationId,
        };
      },
      {
        successMessage: 'Liquidación eliminada y sincronizada en la nube.',
        offlineMessage: 'Liquidación eliminada localmente.',
      }
    );
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
      await onSaveToCloud(latestDataRef.current);
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
    const base = latestDataRef.current;
    const nextLiquidaciones = base.liquidaciones.map((l) =>
      l.id === targetLiqId ? updater(l) : l
    );
    const nextWorkspace: ViaticosWorkspaceData = {
      ...base,
      liquidaciones: nextLiquidaciones,
      hasUnsavedChanges: true,
    };
    latestDataRef.current = nextWorkspace;
    onUpdateData(() => nextWorkspace, true);

    if (currentUser) {
      try {
        await onSaveToCloud(nextWorkspace);
      } catch (err) {
        console.warn('Cloud sync after status update skipped:', err);
      }
    }
  };

  const handleConfirmCloseLiquidation = async (targetLiqId?: string) => {
    const resolvedId = targetLiqId || closeConfirmLiqId || modalLiquidation?.id;
    if (!resolvedId || !permissions.canOperate) return;
    const target = data.liquidaciones.find((l) => l.id === resolvedId);
    if (!target) return;
    const nowIso = new Date().toISOString();
    await updateLiquidationStatusAndSync(resolvedId, (liq) => ({
      ...liq,
      estado: 'cerrada',
      closedAtIso: nowIso,
      closedBy: currentUser?.email || permissions.email || liq.consultorNombre,
      updatedAtIso: nowIso,
    }));
    showToast(
      'success',
      `Liquidación "${target.lineaLiquidacion}" (Semana #${target.semana}) cerrada correctamente. Disponible en Liquidaciones Cerradas.`
    );
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

  const handleReopenLiquidation = async (targetLiqId?: string) => {
    const resolvedId = targetLiqId || modalLiquidation?.id;
    if (!resolvedId || !permissions.isAdmin) return;
    const nowIso = new Date().toISOString();
    await updateLiquidationStatusAndSync(resolvedId, (liq) => ({
      ...liq,
      estado: 'borrador',
      updatedAtIso: nowIso,
    }));
    showToast('info', 'Liquidación reabierta por Administrador.');
  };

  const handleUpsertConsultor = (consultor: ViaticoConsultor) => {
    if (!permissions.isAdmin) return;
    mutateAndAutoSync(
      (prev) => {
        const prevMatch = prev.consultores.find((c) => c.id === consultor.id);
        const nextConsultores = prevMatch
          ? prev.consultores.map((c) => (c.id === consultor.id ? consultor : c))
          : [...prev.consultores, consultor];

        const prevCC = (prevMatch?.centroCosto || '').trim();
        const nextCC = (consultor.centroCosto || '').trim();
        const cleanEmail = normalizeEmail(consultor.email);
        const nextLiquidaciones = prev.liquidaciones.map((l) => {
          const belongsToConsultor =
            l.consultorId === consultor.id ||
            (cleanEmail && normalizeEmail(l.consultorEmail) === cleanEmail);
          if (!belongsToConsultor) return l;
          const currentLiqCC = (l.centroCosto || '').trim();
          if (!currentLiqCC || currentLiqCC === prevCC) {
            return { ...l, centroCosto: nextCC };
          }
          return l;
        });

        return {
          ...prev,
          consultores: nextConsultores,
          liquidaciones: nextLiquidaciones,
        };
      },
      {
        successMessage: `Consultor ${consultor.nombreCompleto} guardado y sincronizado en la nube${
          consultor.centroCosto ? ` (C.C.: ${consultor.centroCosto})` : ''
        }.`,
        offlineMessage: `Consultor ${consultor.nombreCompleto} guardado localmente.`,
      }
    );
  };

  const handleAssignConsultorCostCenter = (params: {
    consultorId: string;
    consultorNombre: string;
    consultorEmail: string;
    empresa: string;
    centroCosto: string;
    odooAnalyticDistribution?: string;
    odooEmployeeName?: string;
  }) => {
    if (!permissions.canOperate) return;
    const cleanEmail = normalizeEmail(params.consultorEmail);
    const cleanCC = params.centroCosto.trim();
    const matchedCC = findMatchingCostCenterEntry(
      cleanCC,
      params.odooAnalyticDistribution,
      resolvedOdooCatalogs.costCenters
    );
    const finalCC = matchedCC?.cuentaAnalitica || cleanCC;
    const finalAnalytic =
      (params.odooAnalyticDistribution || '').trim() ||
      matchedCC?.analyticDistribution ||
      '';
    const stamp = resolveOperatingUserPermissionsStamp(
      permissions,
      currentUser?.email || undefined,
      currentUser?.displayName || undefined
    );

    mutateAndAutoSync(
      (prev) => {
        const existingIdx = prev.consultores.findIndex(
          (c) =>
            c.id === params.consultorId ||
            (cleanEmail && normalizeEmail(c.email) === cleanEmail)
        );

        let nextConsultores: ViaticoConsultor[];
        if (existingIdx >= 0) {
          nextConsultores = prev.consultores.map((c, idx) =>
            idx === existingIdx
              ? {
                  ...c,
                  centroCosto: finalCC,
                  odooAnalyticDistribution:
                    finalAnalytic || c.odooAnalyticDistribution,
                  odooEmployeeName:
                    params.odooEmployeeName?.trim().toUpperCase() ||
                    c.odooEmployeeName,
                }
              : c
          );
        } else {
          nextConsultores = [
            ...prev.consultores,
            {
              id: params.consultorId || `cons-${Date.now()}`,
              nombreCompleto: params.consultorNombre,
              email: cleanEmail,
              empresa: params.empresa || 'Premex Corp',
              cargo: 'Consultor / Liquidador',
              centroCosto: finalCC,
              odooAnalyticDistribution: finalAnalytic,
              odooEmployeeName: params.odooEmployeeName?.trim().toUpperCase(),
              monedaBase: 'Quetzales',
              activo: true,
            },
          ];
        }

        const nextLiquidaciones = prev.liquidaciones.map((l) => {
          const matches =
            l.consultorId === params.consultorId ||
            (cleanEmail && normalizeEmail(l.consultorEmail) === cleanEmail) ||
            l.consultorNombre === params.consultorNombre;
          return matches
            ? {
                ...l,
                centroCosto: finalCC,
                odooAnalyticDistribution:
                  finalAnalytic || l.odooAnalyticDistribution,
                odooEmployeeName:
                  params.odooEmployeeName?.trim().toUpperCase() ||
                  l.odooEmployeeName,
              }
            : l;
        });

        const baseCatalogs = mergeOdooCatalogsWithDefaults(prev.odooCatalogs);
        const updatedEmployees = baseCatalogs.employees.map((emp) => {
          const empEmail = normalizeEmail(emp.email || '');
          const sameEmail = cleanEmail && empEmail && empEmail === cleanEmail;
          const sameName =
            emp.nombreCompleto.toUpperCase() ===
              params.consultorNombre.trim().toUpperCase() ||
            (params.odooEmployeeName &&
              emp.nombreCompleto.toUpperCase() ===
                params.odooEmployeeName.trim().toUpperCase());
          if (!sameEmail && !sameName) return emp;
          return {
            ...emp,
            email: cleanEmail || emp.email,
            centroCosto: finalCC,
            analyticDistribution: finalAnalytic || emp.analyticDistribution,
            updatedByEmail: stamp.email,
            updatedByName: stamp.name,
            updatedAtIso: stamp.atIso,
          };
        });
        const nextCatalogs: ViaticoOdooCatalogs = {
          ...baseCatalogs,
          employees: updatedEmployees,
          updatedByEmail: stamp.email,
          updatedByName: stamp.name,
          updatedAtIso: stamp.atIso,
        };
        saveLocalOdooCatalogs(nextCatalogs);

        return {
          ...prev,
          consultores: nextConsultores,
          liquidaciones: nextLiquidaciones,
          odooCatalogs: nextCatalogs,
        };
      },
      {
        successMessage: `Centro de Costo "${finalCC}" asignado a ${params.consultorNombre} y sincronizado en la nube.`,
        offlineMessage: `Centro de Costo "${finalCC}" asignado localmente a ${params.consultorNombre}.`,
      }
    );
  };

  const handleSaveOdooCatalogs = (
    nextCatalogsInput: ViaticoOdooCatalogs,
    toastMessage?: string
  ) => {
    if (!permissions.canOperate) return;
    const stamp = resolveOperatingUserPermissionsStamp(
      permissions,
      currentUser?.email || undefined,
      currentUser?.displayName || undefined
    );
    const merged = mergeOdooCatalogsWithDefaults({
      ...nextCatalogsInput,
      updatedByEmail: stamp.email,
      updatedByName: stamp.name,
      updatedAtIso: stamp.atIso,
    });
    saveLocalOdooCatalogs(merged);

    mutateAndAutoSync(
      (prev) => {
        // Propagate linked email / cost center updates from Odoo Employees DB to consultores
        const nextConsultores = prev.consultores.map((c) => {
          const cleanEmail = normalizeEmail(c.email);
          const matched = merged.employees.find(
            (emp) =>
              (cleanEmail && emp.email && normalizeEmail(emp.email) === cleanEmail) ||
              (c.odooEmployeeName &&
                emp.nombreCompleto.toUpperCase() === c.odooEmployeeName.trim().toUpperCase())
          );
          if (!matched) return c;
          return {
            ...c,
            odooEmployeeName: matched.nombreCompleto,
            centroCosto: matched.centroCosto || c.centroCosto,
            odooAnalyticDistribution:
              matched.analyticDistribution || c.odooAnalyticDistribution,
          };
        });
        return {
          ...prev,
          consultores: nextConsultores,
          odooCatalogs: merged,
        };
      },
      {
        successMessage:
          toastMessage ||
          'Base de datos Odoo actualizada y sincronizada en la nube.',
        offlineMessage:
          toastMessage ||
          'Base de datos Odoo guardada localmente.',
      }
    );
  };

  const handleUpdateExpenseItemOdoo = (
    liquidationId: string,
    itemId: string,
    patch: Partial<ViaticoExpenseItem>
  ) => {
    if (!permissions.canOperate) return;
    const stamp = resolveOperatingUserPermissionsStamp(
      permissions,
      currentUser?.email || undefined,
      currentUser?.displayName || undefined
    );
    mutateAndAutoSync(
      (prev) => ({
        ...prev,
        liquidaciones: prev.liquidaciones.map((l) => {
          if (l.id !== liquidationId) return l;
          return recalculateLiquidationTotals({
            ...l,
            items: l.items.map((it) =>
              it.id === itemId
                ? {
                    ...it,
                    ...patch,
                    registeredByEmail: it.registeredByEmail || stamp.email,
                    registeredByName: it.registeredByName || stamp.name,
                    updatedAtIso: stamp.atIso,
                  }
                : it
            ),
            updatedAtIso: stamp.atIso,
          });
        }),
      }),
      {
        debounceMs: 500,
        errorPrefix: 'Clasificación Odoo guardada localmente, pero falló la sincronización',
      }
    );
  };

  const handleMarkLiquidationsContabilizadas = (
    liquidationIds: string[],
    contabilizada: boolean
  ) => {
    if (!permissions.canOperate || liquidationIds.length === 0) return;
    const idSet = new Set(liquidationIds);
    const stamp = resolveOperatingUserPermissionsStamp(
      permissions,
      currentUser?.email || undefined,
      currentUser?.displayName || undefined
    );

    mutateAndAutoSync(
      (prev) => ({
        ...prev,
        liquidaciones: prev.liquidaciones.map((l) => {
          if (!idSet.has(l.id)) return l;
          if (contabilizada) {
            return {
              ...l,
              contabilizada: true,
              contabilizadaAtIso: stamp.atIso,
              contabilizadaPorEmail: stamp.email,
              contabilizadaPorNombre: stamp.name,
              contabilizadaDescargasCount: (l.contabilizadaDescargasCount || 0) + 1,
              updatedAtIso: stamp.atIso,
            };
          }
          const next = { ...l, contabilizada: false, updatedAtIso: stamp.atIso };
          delete next.contabilizadaAtIso;
          delete next.contabilizadaPorEmail;
          delete next.contabilizadaPorNombre;
          return next;
        }),
      }),
      {
        errorPrefix:
          'Estado de contabilización guardado localmente, pero falló la sincronización en la nube',
      }
    );
  };

  const handleDeleteConsultor = (consultorId: string) => {
    if (!permissions.isAdmin) return;
    mutateAndAutoSync(
      (prev) => ({
        ...prev,
        consultores: prev.consultores.filter((c) => c.id !== consultorId),
      }),
      {
        successMessage: 'Consultor retirado del listado y sincronizado en la nube.',
        offlineMessage: 'Consultor retirado del listado localmente.',
      }
    );
  };

  const handleSaveEmailGroups = (nextGroups: ViaticoEmailGroup[]) => {
    if (!permissions.canOperate) return;
    mutateAndAutoSync(
      (prev) => ({
        ...prev,
        emailGroups: nextGroups,
      }),
      {
        successMessage:
          'Listas de correos y autorizadores guardadas y sincronizadas en la nube.',
        offlineMessage:
          'Listas de correos guardadas localmente (inicia sesión para sincronizar en la nube).',
      }
    );
  };

  const handleQuickDownloadExcel = async (target?: ViaticoLiquidation | null) => {
    const liq = target || activeLiquidation;
    if (!liq || liq.items.length === 0) return;
    setIsDownloadingExcel(true);
    try {
      const cc = resolveLiquidationCostCenter(
        liq,
        data.consultores,
        resolvedOdooCatalogs,
        permissionRecords
      );
      const filename = await exportViaticosExcel(liq, cc);
      showToast('success', `Excel descargado: ${filename}`);
    } catch (err: any) {
      showToast('error', err?.message || 'Error al generar el Excel.');
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  const handleQuickDownloadPdf = async (target?: ViaticoLiquidation | null) => {
    const liq = target || activeLiquidation;
    if (!liq || liq.items.length === 0) return;
    setIsDownloadingPdf(true);
    try {
      const ids = liq.items.map((it) => it.attachmentId || '').filter(Boolean);
      const loaded = await getReceiptMediaBatch(ids);
      const merged = { ...mediaMap, ...loaded };
      if (Object.keys(loaded).length > 0) {
        setMediaMap((prev) => ({ ...prev, ...loaded }));
      }
      const res = await exportViaticosReceiptsPdf(liq, merged);
      showToast(
        'success',
        `PDF descargado: ${res.filename} (${res.embeddedCount} soporte(s) visual(es) incluidos).`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Error al compilar el PDF de comprobantes.');
    } finally {
      setIsDownloadingPdf(false);
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
    <div className="min-h-screen bg-[#F5F8FC] flex flex-col font-sans text-slate-800 antialiased overflow-x-clip max-w-full">
      <ViaticosSidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onSwitchModule={onSwitchModule}
        permissions={permissions}
        openLiquidacionesCount={openLiquidacionesCount}
        closedLiquidacionesCount={closedLiquidacionesCount}
        accountingLiquidacionesCount={accountingLiquidaciones.length}
        liquidacionesCount={visibleLiquidaciones.length}
        sociedadesCount={visibleModuleCompanies.length}
        emailGroupsCount={(data.emailGroups || []).filter((g) => g.activo !== false).length}
        consultorScopeLabel={sidebarScopeLabel}
      />

      <div className="lg:pl-64 flex flex-col flex-1 min-h-screen min-w-0 max-w-full">
        <ViaticosHeader
          activeTab={activeTab}
          activeLiquidation={activeLiquidation}
          onToggleMobileMenu={() => setIsMobileMenuOpen(true)}
          onSwitchModule={onSwitchModule}
          onCreateNewLiquidation={handleOpenNewLiquidationModal}
          onSaveToCloud={handleSaveCloudClick}
          onOpenCloseConfirmModal={() => {
            if (activeLiquidation) setCloseConfirmLiqId(activeLiquidation.id);
          }}
          onOpenCloseEmailModal={() => {
            if (activeLiquidation) setCloseModalLiqId(activeLiquidation.id);
          }}
          onOpenPlanillaPdfPreview={() => {
            if (activeLiquidation) setPlanillaPreviewLiqId(activeLiquidation.id);
          }}
          onQuickDownloadExcel={() => {
            void handleQuickDownloadExcel(activeLiquidation);
          }}
          onQuickDownloadPdf={() => {
            void handleQuickDownloadPdf(activeLiquidation);
          }}
          isDownloadingExcel={isDownloadingExcel}
          isDownloadingPdf={isDownloadingPdf}
          isSavingCloud={isSavingCloud}
          hasUnsavedChanges={data.hasUnsavedChanges}
          currentUser={currentUser}
          onSignInWithGoogle={onSignInWithGoogle}
          onSignOut={onSignOut}
          permissions={permissions}
        />

        {/* Company Scope & Inline Feedback Banners */}
        {(toast || permissions.getModuleCompanyScope('viaticos') === 'selected') && (
          <div className="px-2 lg:px-5 pt-2.5 lg:pt-3.5 max-w-none mx-auto w-full min-w-0 space-y-2">
            {permissions.getModuleCompanyScope('viaticos') === 'selected' && (
              <div className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs flex items-center gap-2 min-w-0">
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
                className={`px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                  toast.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : toast.type === 'error'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-blue-50 border-blue-200 text-blue-900'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {toast.type === 'error' ? (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  )}
                  <span className="font-medium break-words">{toast.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center opacity-70 hover:opacity-100 cursor-pointer shrink-0"
                  aria-label="Cerrar notificación"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        <main className="flex-1 px-1.5 py-2.5 lg:px-5 lg:py-5 pb-[84px] lg:pb-6 max-w-none mx-auto w-full min-w-0 space-y-3">
          {/* Adaptive Screen Zoom Bar */}
          <div className="bg-white rounded-2xl border border-slate-200/90 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
              <ZoomIn className="w-[16px] h-[16px] text-[#1E60A8] shrink-0" />
              <span>Zoom de visualización</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleStepZoom(-1)}
                disabled={zoomPercent <= ZOOM_STEPS[0]}
                aria-label="Reducir zoom"
                className="min-w-[42px] min-h-[40px] inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <ZoomOut className="w-[16px] h-[16px]" />
              </button>

              <button
                type="button"
                onClick={() => setZoomPercent(100)}
                title="Restablecer al 100%"
                className="min-w-[58px] min-h-[40px] px-2.5 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-[13px] font-extrabold font-mono text-[#132B63] tabular-nums cursor-pointer"
              >
                {zoomPercent}%
              </button>

              <button
                type="button"
                onClick={() => handleStepZoom(1)}
                disabled={zoomPercent >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                aria-label="Aumentar zoom"
                className="min-w-[42px] min-h-[40px] inline-flex items-center justify-center rounded-xl border border-[#1E60A8]/30 bg-sky-50 hover:bg-sky-100 text-[#132B63] disabled:opacity-40 transition-colors cursor-pointer"
              >
                <ZoomIn className="w-[16px] h-[16px]" />
              </button>

              {zoomPercent !== 100 && (
                <button
                  type="button"
                  onClick={() => setZoomPercent(100)}
                  aria-label="Restablecer zoom a 100%"
                  className="min-h-[40px] px-2.5 inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[12px] font-semibold text-slate-600 cursor-pointer"
                >
                  <RotateCcw className="w-[13px] h-[13px]" />
                  <span>100%</span>
                </button>
              )}
            </div>
          </div>

          {activeTab === 'liquidador' ? (
            <ViaticosLiquidadorView
              liquidation={activeLiquidation}
              visibleLiquidaciones={visibleLiquidaciones}
              availableConsultores={scope.availableConsultores}
              moduleCompanies={visibleModuleCompanies}
              odooCatalogs={resolvedOdooCatalogs}
              isLockedToOwnConsultor={scope.isLockedToOwnConsultor}
              detectedFromEmailLabel={scope.detectedFromEmailLabel}
              mediaMap={mediaMap}
              loadingMediaIds={loadingMediaIds}
              onLoadReceiptMedia={loadSingleReceiptMedia}
              onMediaSaved={(media) =>
                setMediaMap((prev) => ({ ...prev, [media.id]: media }))
              }
              permissions={permissions}
              onSelectLiquidation={handleSelectLiquidation}
              onCreateNewLiquidation={handleOpenNewLiquidationModal}
              onUpdateHeader={handleUpdateHeader}
              resolvedCostCenter={
                activeLiquidation
                  ? resolveLiquidationCostCenter(
                      activeLiquidation,
                      data.consultores,
                      resolvedOdooCatalogs,
                      permissionRecords
                    )
                  : ''
              }
              onAddOrUpdateItem={handleAddOrUpdateItem}
              onAddMultipleItems={handleAddMultipleItems}
              onBulkUpdateItems={handleBulkUpdateItems}
              onDeleteItem={handleDeleteItem}
              onOpenCloseConfirmModal={() => {
                if (activeLiquidation) setCloseConfirmLiqId(activeLiquidation.id);
              }}
              onOpenCloseEmailModal={() => {
                if (activeLiquidation) setCloseModalLiqId(activeLiquidation.id);
              }}
              onOpenPlanillaPdfPreview={() => {
                if (activeLiquidation) setPlanillaPreviewLiqId(activeLiquidation.id);
              }}
              onQuickDownloadExcel={() => {
                void handleQuickDownloadExcel(activeLiquidation);
              }}
              onQuickDownloadPdf={() => {
                void handleQuickDownloadPdf(activeLiquidation);
              }}
              isDownloadingExcel={isDownloadingExcel}
              isDownloadingPdf={isDownloadingPdf}
              onOpenClosedArchive={() => {
                if (permissions.canAccessViaticosPanel('cerradas')) {
                  setActiveTab('cerradas');
                }
              }}
              zoomPercent={zoomPercent}
            />
          ) : activeTab === 'sociedades' ? (
            <ViaticosSociedadesView
              visibleCompanies={visibleModuleCompanies}
              allCatalogCompanies={moduleCompanies}
              permissions={permissions}
              onSaveModuleCompanies={onSaveModuleCompanies}
              onNotify={showToast}
            />
          ) : activeTab === 'contabilidad' ? (
            <ViaticosContabilidadView
              liquidaciones={accountingLiquidaciones}
              consultores={data.consultores}
              odooCatalogs={resolvedOdooCatalogs}
              permissionRecords={permissionRecords}
              currentUserEmail={currentUser?.email || permissions.email || ''}
              currentUserName={currentUser?.displayName || permissions.displayName || ''}
              permissions={permissions}
              mediaMap={mediaMap}
              loadingMediaIds={loadingMediaIds}
              onEnsureMediaLoaded={ensureReceiptMediaIdsLoaded}
              onLoadReceiptMedia={loadSingleReceiptMedia}
              onPreviewPlanillaPdf={(liq) => setPlanillaPreviewLiqId(liq.id)}
              onDownloadLiquidationExcel={(liq) => {
                void handleQuickDownloadExcel(liq);
              }}
              onDownloadLiquidationPdf={(liq) => {
                void handleQuickDownloadPdf(liq);
              }}
              onAssignConsultorCostCenter={handleAssignConsultorCostCenter}
              onSaveOdooCatalogs={handleSaveOdooCatalogs}
              onUpdateExpenseItemOdoo={handleUpdateExpenseItemOdoo}
              onMarkLiquidationsContabilizadas={handleMarkLiquidationsContabilizadas}
              onUpsertPermissionRecord={onUpsertPermissionRecord}
              onNotify={showToast}
            />
          ) : activeTab === 'correos' ? (
            <ViaticosEmailDirectoryView
              emailGroups={data.emailGroups || []}
              onSaveEmailGroups={handleSaveEmailGroups}
              permissions={permissions}
            />
          ) : (
            <ViaticosHistorialView
              viewMode={activeTab === 'cerradas' ? 'cerradas' : 'historial'}
              liquidaciones={visibleLiquidaciones}
              consultores={scope.availableConsultores}
              moduleCompanies={visibleModuleCompanies}
              odooCatalogs={resolvedOdooCatalogs}
              activeLiquidationId={activeLiquidation?.id || ''}
              permissions={permissions}
              isLockedToOwnConsultor={scope.isLockedToOwnConsultor}
              onOpenLiquidation={(id) => {
                handleSelectLiquidation(id);
                if (permissions.canAccessViaticosPanel('liquidador')) {
                  setActiveTab('liquidador');
                }
              }}
              onCreateNewLiquidation={handleOpenNewLiquidationModal}
              onDeleteLiquidation={handleDeleteLiquidation}
              onPreviewPlanillaPdf={(liq) => setPlanillaPreviewLiqId(liq.id)}
              onDownloadExcel={(liq) => {
                void handleQuickDownloadExcel(liq);
              }}
              onDownloadPdf={(liq) => {
                void handleQuickDownloadPdf(liq);
              }}
              onOpenCloseConfirmFor={(liq) => setCloseConfirmLiqId(liq.id)}
              onOpenCloseEmailFor={(liq) => setCloseModalLiqId(liq.id)}
              onReopenLiquidation={
                permissions.isAdmin
                  ? (liqId) => {
                      void handleReopenLiquidation(liqId);
                    }
                  : undefined
              }
              onUpsertConsultor={handleUpsertConsultor}
              onDeleteConsultor={handleDeleteConsultor}
            />
          )}
        </main>
      </div>

      {/* Start New Liquidation Modal (supports parallel open liquidations by Week & Currency) */}
      <ViaticosNewLiquidationModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        availableConsultores={scope.availableConsultores}
        defaultConsultor={scope.matchedConsultor || scope.availableConsultores[0] || null}
        moduleCompanies={visibleModuleCompanies}
        odooCatalogs={resolvedOdooCatalogs}
        isLockedToOwnConsultor={scope.isLockedToOwnConsultor}
        openLiquidacionesCount={openLiquidacionesCount}
        onCreate={handleCreateNewLiquidation}
      />

      {/* Printable Landscape PDF Preview Modal matching the official Premex Excel sheet */}
      <ViaticosPlanillaPdfModal
        isOpen={Boolean(planillaPreviewLiqId && planillaPreviewLiquidation)}
        onClose={() => setPlanillaPreviewLiqId(null)}
        liquidation={planillaPreviewLiquidation}
        costCenter={
          planillaPreviewLiquidation
            ? resolveLiquidationCostCenter(
                planillaPreviewLiquidation,
                data.consultores,
                resolvedOdooCatalogs,
                permissionRecords
              )
            : ''
        }
        onDownloadExcel={(liq) => handleQuickDownloadExcel(liq)}
      />

      {/* Standalone Close Liquidation Modal (no mandatory email dispatch + instant Excel/PDF + Closed Archive) */}
      <ViaticosCloseConfirmModal
        isOpen={Boolean(closeConfirmLiqId && closeConfirmLiquidation)}
        onClose={() => setCloseConfirmLiqId(null)}
        liquidation={closeConfirmLiquidation}
        mediaMap={mediaMap}
        onConfirmClose={(liqId) => handleConfirmCloseLiquidation(liqId)}
        onPreviewPlanillaPdf={(liq) => setPlanillaPreviewLiqId(liq.id)}
        onDownloadExcel={(liq) => handleQuickDownloadExcel(liq)}
        onDownloadPdf={(liq) => handleQuickDownloadPdf(liq)}
        onOpenEmailModal={(liqId) => setCloseModalLiqId(liqId)}
        onGoToClosedArchive={() => {
          if (permissions.canAccessViaticosPanel('cerradas')) {
            setActiveTab('cerradas');
          }
        }}
        onStartNewLiquidation={() => setIsNewModalOpen(true)}
      />

      {/* Optional Email Dispatch & Package Export Modal */}
      <ViaticosCloseEmailModal
        isOpen={Boolean(closeModalLiqId && modalLiquidation)}
        onClose={() => setCloseModalLiqId(null)}
        liquidation={modalLiquidation}
        costCenter={
          modalLiquidation
            ? resolveLiquidationCostCenter(
                modalLiquidation,
                data.consultores,
                resolvedOdooCatalogs,
                permissionRecords
              )
            : ''
        }
        mediaMap={mediaMap}
        permissions={permissions}
        emailGroups={data.emailGroups || []}
        canManageEmailGroups={
          permissions.canOperate && permissions.canAccessViaticosPanel('correos')
        }
        onOpenEmailDirectory={() => {
          setCloseModalLiqId(null);
          setActiveTab('correos');
        }}
        accessToken={accessToken}
        onReconnectWorkspace={onReconnectWorkspace}
        onInvalidateWorkspaceToken={onInvalidateWorkspaceToken}
        onConfirmCloseLiquidation={() =>
          handleConfirmCloseLiquidation(modalLiquidation?.id)
        }
        onMarkAsSent={handleMarkAsSent}
        onReopenLiquidation={
          permissions.isAdmin
            ? () => handleReopenLiquidation(modalLiquidation?.id)
            : undefined
        }
        onPreviewPlanillaPdf={
          modalLiquidation
            ? () => setPlanillaPreviewLiqId(modalLiquidation.id)
            : undefined
        }
      />

      {/* Mobile Bottom Navigation Bar */}
      {(() => {
        const mobileNavItems = (
          [
            { id: 'liquidador' as ViaticosTab, label: 'Activas', icon: FileText },
            { id: 'sociedades' as ViaticosTab, label: 'Sociedad', icon: Building2 },
            { id: 'cerradas' as ViaticosTab, label: 'Cerradas', icon: Archive },
            { id: 'contabilidad' as ViaticosTab, label: 'Contab.', icon: Calculator },
            { id: 'historial' as ViaticosTab, label: 'Historial', icon: FolderClock },
            { id: 'correos' as ViaticosTab, label: 'Correos', icon: Mail },
          ] as const
        ).filter((item) => permissions.canAccessViaticosPanel(item.id));

        if (mobileNavItems.length === 0) return null;
        const gridColsClass =
          (
            {
              1: 'grid-cols-1',
              2: 'grid-cols-2',
              3: 'grid-cols-3',
              4: 'grid-cols-4',
              5: 'grid-cols-5',
              6: 'grid-cols-6',
            } as Record<number, string>
          )[mobileNavItems.length] || 'grid-cols-4';

        return (
          <nav
            aria-label="Navegación móvil de viáticos"
            className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe print:hidden shadow-[0_-4px_16px_rgba(15,23,42,0.06)]"
          >
            <div className={`grid ${gridColsClass} h-[60px]`}>
              {mobileNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setActiveTab(item.id)}
                    className={`relative flex flex-col items-center justify-center gap-[3px] text-[11px] font-bold transition-colors cursor-pointer ${
                      isActive ? 'text-[#132B63]' : 'text-slate-500'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute top-0 left-3 right-3 h-[2px] rounded-b-full bg-[#1E60A8]" />
                    )}
                    <Icon
                      className={`w-[20px] h-[20px] ${
                        isActive ? 'text-[#1E60A8]' : 'text-slate-400'
                      }`}
                    />
                    <span className="truncate max-w-[74px]">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        );
      })()}
    </div>
  );
};
