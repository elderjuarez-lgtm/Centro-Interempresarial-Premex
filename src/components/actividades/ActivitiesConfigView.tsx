import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  Building2,
  Users,
  Bell,
  ClipboardList,
  UserPlus,
  Mail,
  Sparkles,
} from 'lucide-react';
import {
  ActivityNotificationRecipient,
  ActivityPeriodicity,
  ActivityResponsible,
  ActivitySociety,
  ActivityTemplate,
  ActivitiesWorkspaceData,
  UserPermissionRecord,
} from '../../types';
import {
  ACTIVITY_PERIODICITY_OPTIONS,
  normalizeResponsibleIds,
  resolveCompletionNotificationRecipients,
} from '../../utils/activities';
import { normalizeEmail } from '../../utils/permissions';

export type ActivitiesConfigSubTab =
  | 'actividades'
  | 'responsables'
  | 'sociedades'
  | 'destinatarios';

interface ActivitiesConfigViewProps {
  data: ActivitiesWorkspaceData;
  suitePermissionRecords: UserPermissionRecord[];
  canEdit: boolean;
  initialSubTab?: ActivitiesConfigSubTab;
  openNewActivityTrigger?: number;
  onUpdateWorkspace: (updater: (prev: ActivitiesWorkspaceData) => ActivitiesWorkspaceData) => void;
}

export const ActivitiesConfigView: React.FC<ActivitiesConfigViewProps> = ({
  data,
  suitePermissionRecords,
  canEdit,
  initialSubTab = 'actividades',
  openNewActivityTrigger = 0,
  onUpdateWorkspace,
}) => {
  const [subTab, setSubTab] = useState<ActivitiesConfigSubTab>(initialSubTab);

  // Activity template editor state
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [actNombre, setActNombre] = useState('');
  const [actPeriodicidad, setActPeriodicidad] = useState<ActivityPeriodicity>('MENSUAL');
  const [actDiaSugerido, setActDiaSugerido] = useState(10);
  const [actDescripcion, setActDescripcion] = useState('');
  const [actExtraEmails, setActExtraEmails] = useState('');
  const [actRespBySoc, setActRespBySoc] = useState<Record<string, string[]>>({});
  const [brushRespIds, setBrushRespIds] = useState<string[]>([]);
  const [confirmDeleteActId, setConfirmDeleteActId] = useState<string | null>(null);

  // Responsible editor state (with easy multi-society selection)
  const [editingRespId, setEditingRespId] = useState<string | null>(null);
  const [respNombre, setRespNombre] = useState('');
  const [respEmail, setRespEmail] = useState('');
  const [respCargo, setRespCargo] = useState('');
  const [respSocietyCodes, setRespSocietyCodes] = useState<string[]>([]);

  // Society editor state (with 1 or multiple responsibles selection)
  const [editingSocId, setEditingSocId] = useState<string | null>(null);
  const [socCodigo, setSocCodigo] = useState('');
  const [socNombre, setSocNombre] = useState('');
  const [socRespIds, setSocRespIds] = useState<string[]>([]);

  // Notification recipient editor state
  const [notifNombre, setNotifNombre] = useState('');
  const [notifEmail, setNotifEmail] = useState('');
  const [notifTipo, setNotifTipo] = useState<'administrador' | 'designado'>('designado');

  const activeResponsibles = useMemo(
    () => data.responsibles.filter((r) => r.activo),
    [data.responsibles]
  );

  const activeSocieties = useMemo(
    () => data.societies.filter((s) => s.activa),
    [data.societies]
  );

  const respById = useMemo(
    () => new Map(data.responsibles.map((r) => [r.id, r])),
    [data.responsibles]
  );

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    if (openNewActivityTrigger > 0) {
      setSubTab('actividades');
      setEditingActivityId(null);
      setActNombre('');
      setActPeriodicidad('MENSUAL');
      setActDiaSugerido(10);
      setActDescripcion('');
      setActExtraEmails('');
      setActRespBySoc({});
      setBrushRespIds(activeResponsibles[0] ? [activeResponsibles[0].id] : []);
      setShowActivityForm(true);
    }
  }, [openNewActivityTrigger, activeResponsibles]);

  const resolvedRecipients = useMemo(
    () =>
      resolveCompletionNotificationRecipients({
        notificationRecipients: data.notificationRecipients,
        notifyAdminsAutomatically: data.notifyAdminsAutomatically,
        suitePermissionRecords,
      }),
    [data.notificationRecipients, data.notifyAdminsAutomatically, suitePermissionRecords]
  );

  const importableSuiteUsers = useMemo(() => {
    const existingEmails = new Set(data.responsibles.map((r) => normalizeEmail(r.email)));
    return suitePermissionRecords.filter(
      (u) => u.active && u.email && !existingEmails.has(normalizeEmail(u.email))
    );
  }, [data.responsibles, suitePermissionRecords]);

  // ---------- Activity CRUD ----------
  const startNewActivity = () => {
    setEditingActivityId(null);
    setActNombre('');
    setActPeriodicidad('MENSUAL');
    setActDiaSugerido(10);
    setActDescripcion('');
    setActExtraEmails('');
    setActRespBySoc({});
    setBrushRespIds(activeResponsibles[0] ? [activeResponsibles[0].id] : []);
    setShowActivityForm(true);
  };

  const startEditActivity = (act: ActivityTemplate) => {
    setEditingActivityId(act.id);
    setActNombre(act.nombre);
    setActPeriodicidad(act.periodicidad);
    setActDiaSugerido(act.diaSugerido || 10);
    setActDescripcion(act.descripcion || '');
    setActExtraEmails((act.notificarAdicionales || []).join(', '));
    const normalizedMap: Record<string, string[]> = {};
    Object.entries(act.responsablesPorSociedad || {}).forEach(([socCode, val]) => {
      const ids = normalizeResponsibleIds(val);
      if (ids.length > 0) normalizedMap[socCode] = ids;
    });
    setActRespBySoc(normalizedMap);
    setBrushRespIds(activeResponsibles[0] ? [activeResponsibles[0].id] : []);
    setShowActivityForm(true);
  };

  const toggleBrushResponsible = (respId: string) => {
    setBrushRespIds((prev) =>
      prev.includes(respId) ? prev.filter((id) => id !== respId) : [...prev, respId]
    );
  };

  const handleToggleSocietyInActivity = (socCode: string, socDefaultResps?: string[]) => {
    setActRespBySoc((prev) => {
      const current = prev[socCode] || [];
      if (brushRespIds.length === 0) {
        // When no specific responsible is toggled in toolbar, toggle society's default responsibles
        const defaults = normalizeResponsibleIds(socDefaultResps);
        if (current.length > 0) {
          const next = { ...prev };
          delete next[socCode];
          return next;
        }
        if (defaults.length > 0) {
          return { ...prev, [socCode]: defaults };
        }
        return prev;
      }

      const allBrushPresent = brushRespIds.every((id) => current.includes(id));
      let nextIds: string[];
      if (allBrushPresent) {
        nextIds = current.filter((id) => !brushRespIds.includes(id));
      } else {
        nextIds = Array.from(new Set([...current, ...brushRespIds]));
      }

      const next = { ...prev };
      if (nextIds.length > 0) {
        next[socCode] = nextIds;
      } else {
        delete next[socCode];
      }
      return next;
    });
  };

  const handleAssignBrushToAllSocieties = () => {
    if (brushRespIds.length === 0) return;
    setActRespBySoc((prev) => {
      const next = { ...prev };
      activeSocieties.forEach((soc) => {
        next[soc.codigo] = Array.from(new Set([...(next[soc.codigo] || []), ...brushRespIds]));
      });
      return next;
    });
  };

  const handleApplySocietyDefaultsToActivity = () => {
    const next: Record<string, string[]> = {};
    activeSocieties.forEach((soc) => {
      const defaults = normalizeResponsibleIds(soc.responsablesIds);
      if (defaults.length > 0) {
        next[soc.codigo] = defaults;
      }
    });
    setActRespBySoc(next);
  };

  const handleRemoveRespFromActivitySociety = (socCode: string, respId: string) => {
    setActRespBySoc((prev) => {
      const remaining = (prev[socCode] || []).filter((id) => id !== respId);
      const next = { ...prev };
      if (remaining.length > 0) {
        next[socCode] = remaining;
      } else {
        delete next[socCode];
      }
      return next;
    });
  };

  const handleSaveActivity = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = actNombre.trim().toUpperCase();
    if (!cleanName) return;

    const cleanExtras = actExtraEmails
      .split(/[,;\s]+/)
      .map((em) => normalizeEmail(em))
      .filter((em) => em.includes('@'));

    const cleanMap: Record<string, string[]> = {};
    Object.entries(actRespBySoc).forEach(([socCode, respIds]) => {
      const ids = normalizeResponsibleIds(respIds);
      if (ids.length > 0) cleanMap[socCode] = ids;
    });

    onUpdateWorkspace((prev) => {
      if (editingActivityId) {
        return {
          ...prev,
          activities: prev.activities.map((a) =>
            a.id === editingActivityId
              ? {
                  ...a,
                  nombre: cleanName,
                  periodicidad: actPeriodicidad,
                  diaSugerido: Math.min(31, Math.max(1, Math.round(Number(actDiaSugerido) || 10))),
                  descripcion: actDescripcion.trim(),
                  responsablesPorSociedad: cleanMap,
                  notificarAdicionales: cleanExtras.length > 0 ? cleanExtras : undefined,
                }
              : a
          ),
        };
      }
      const newAct: ActivityTemplate = {
        id: `act-${Date.now()}`,
        nombre: cleanName,
        periodicidad: actPeriodicidad,
        diaSugerido: Math.min(31, Math.max(1, Math.round(Number(actDiaSugerido) || 10))),
        descripcion: actDescripcion.trim(),
        responsablesPorSociedad: cleanMap,
        notificarAdicionales: cleanExtras.length > 0 ? cleanExtras : undefined,
        activa: true,
      };
      return {
        ...prev,
        activities: [...prev.activities, newAct],
      };
    });

    setShowActivityForm(false);
    setEditingActivityId(null);
  };

  // ---------- Responsible CRUD (Society-First Multi-Select) ----------
  const startEditResponsible = (r: ActivityResponsible) => {
    setEditingRespId(r.id);
    setRespNombre(r.nombre);
    setRespEmail(r.email);
    setRespCargo(r.cargo || '');
    const assignedSocs = data.societies
      .filter((s) => normalizeResponsibleIds(s.responsablesIds).includes(r.id))
      .map((s) => s.codigo);
    setRespSocietyCodes(assignedSocs);
  };

  const resetResponsibleForm = () => {
    setEditingRespId(null);
    setRespNombre('');
    setRespEmail('');
    setRespCargo('');
    setRespSocietyCodes([]);
  };

  const toggleRespSocietyCode = (socCode: string) => {
    setRespSocietyCodes((prev) =>
      prev.includes(socCode) ? prev.filter((c) => c !== socCode) : [...prev, socCode]
    );
  };

  const handleSaveResponsible = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = respNombre.trim();
    const cleanEmail = normalizeEmail(respEmail);
    if (!cleanName) return;

    const targetRespId = editingRespId || `resp-${Date.now()}`;
    const selectedSocSet = new Set(respSocietyCodes);

    onUpdateWorkspace((prev) => {
      const nextResponsibles = editingRespId
        ? prev.responsibles.map((r) =>
            r.id === editingRespId
              ? { ...r, nombre: cleanName, email: cleanEmail, cargo: respCargo.trim() }
              : r
          )
        : [
            ...prev.responsibles,
            {
              id: targetRespId,
              nombre: cleanName,
              email: cleanEmail,
              cargo: respCargo.trim() || 'Analista',
              activo: true,
            },
          ];

      // Sync this responsible into/out of each society's responsablesIds
      const nextSocieties = prev.societies.map((soc) => {
        const curIds = normalizeResponsibleIds(soc.responsablesIds);
        const shouldHave = selectedSocSet.has(soc.codigo);
        if (shouldHave && !curIds.includes(targetRespId)) {
          return { ...soc, responsablesIds: [...curIds, targetRespId] };
        }
        if (!shouldHave && curIds.includes(targetRespId)) {
          return { ...soc, responsablesIds: curIds.filter((id) => id !== targetRespId) };
        }
        return soc;
      });

      return {
        ...prev,
        responsibles: nextResponsibles,
        societies: nextSocieties,
      };
    });

    resetResponsibleForm();
  };

  const handleImportSuiteUser = (u: UserPermissionRecord) => {
    onUpdateWorkspace((prev) => ({
      ...prev,
      responsibles: [
        ...prev.responsibles,
        {
          id: `resp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          nombre: u.displayName || u.email.split('@')[0],
          email: normalizeEmail(u.email),
          cargo: u.role === 'admin' ? 'Administrador' : 'Analista',
          activo: true,
        },
      ],
    }));
  };

  // ---------- Society CRUD (With 1 or Multiple Responsibles Assignment) ----------
  const startEditSociety = (soc: ActivitySociety) => {
    setEditingSocId(soc.id);
    setSocCodigo(soc.codigo);
    setSocNombre(soc.nombre);
    setSocRespIds(normalizeResponsibleIds(soc.responsablesIds));
  };

  const resetSocietyForm = () => {
    setEditingSocId(null);
    setSocCodigo('');
    setSocNombre('');
    setSocRespIds([]);
  };

  const toggleSocResponsible = (respId: string) => {
    setSocRespIds((prev) =>
      prev.includes(respId) ? prev.filter((id) => id !== respId) : [...prev, respId]
    );
  };

  const handleSaveSociety = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = socCodigo.trim().toUpperCase().replace(/\s+/g, '_');
    const cleanName = socNombre.trim() || cleanCode;
    if (!cleanCode) return;
    const cleanRespIds = normalizeResponsibleIds(socRespIds);

    onUpdateWorkspace((prev) => {
      if (editingSocId) {
        return {
          ...prev,
          societies: prev.societies.map((s) =>
            s.id === editingSocId
              ? { ...s, codigo: cleanCode, nombre: cleanName, responsablesIds: cleanRespIds }
              : s
          ),
        };
      }
      if (prev.societies.some((s) => s.codigo.toUpperCase() === cleanCode)) {
        return {
          ...prev,
          societies: prev.societies.map((s) =>
            s.codigo.toUpperCase() === cleanCode
              ? { ...s, nombre: cleanName, responsablesIds: cleanRespIds, activa: true }
              : s
          ),
        };
      }
      const nextSoc: ActivitySociety = {
        id: `soc-${cleanCode.toLowerCase()}-${Date.now().toString(36)}`,
        codigo: cleanCode,
        nombre: cleanName,
        responsablesIds: cleanRespIds,
        activa: true,
      };
      return {
        ...prev,
        societies: [...prev.societies, nextSoc],
      };
    });

    resetSocietyForm();
  };

  // ---------- Notification Recipients CRUD ----------
  const handleAddRecipient = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = normalizeEmail(notifEmail);
    if (!cleanEmail || !cleanEmail.includes('@')) return;
    const cleanName = notifNombre.trim() || cleanEmail.split('@')[0];

    onUpdateWorkspace((prev) => {
      if (prev.notificationRecipients.some((r) => normalizeEmail(r.email) === cleanEmail)) {
        return {
          ...prev,
          notificationRecipients: prev.notificationRecipients.map((r) =>
            normalizeEmail(r.email) === cleanEmail
              ? { ...r, nombre: cleanName, tipo: notifTipo, activo: true }
              : r
          ),
        };
      }
      const nextRec: ActivityNotificationRecipient = {
        id: `notif-${Date.now()}`,
        nombre: cleanName,
        email: cleanEmail,
        tipo: notifTipo,
        activo: true,
      };
      return {
        ...prev,
        notificationRecipients: [...prev.notificationRecipients, nextRec],
      };
    });

    setNotifNombre('');
    setNotifEmail('');
    setNotifTipo('designado');
  };

  const tabs: {
    id: ActivitiesConfigSubTab;
    label: string;
    count: number;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      id: 'actividades',
      label: 'Actividades',
      count: data.activities.length,
      icon: ClipboardList,
    },
    {
      id: 'sociedades',
      label: 'Sociedades',
      count: data.societies.length,
      icon: Building2,
    },
    {
      id: 'responsables',
      label: 'Responsables',
      count: data.responsibles.length,
      icon: Users,
    },
    {
      id: 'destinatarios',
      label: 'Destinatarios',
      count: resolvedRecipients.length,
      icon: Bell,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200/90 p-2 flex flex-wrap items-center gap-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#132B63] text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              <span
                className={`font-mono text-[11px] tabular-nums ${
                  active ? 'text-sky-200' : 'text-slate-400'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: ACTIVIDADES */}
      {subTab === 'actividades' && (
        <section className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-base font-extrabold text-slate-900">
              Catálogo de Actividades
            </h3>
            {canEdit && (
              <button
                type="button"
                onClick={startNewActivity}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nueva Actividad</span>
              </button>
            )}
          </div>

          {showActivityForm && canEdit && (
            <form
              onSubmit={handleSaveActivity}
              className="bg-white rounded-2xl border-2 border-[#1E60A8]/30 p-5 space-y-5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <h4 className="text-sm font-bold text-[#132B63]">
                  {editingActivityId ? 'Editar Actividad' : 'Nueva Actividad'}
                </h4>
                <button
                  type="button"
                  onClick={() => setShowActivityForm(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nombre de la actividad *
                  </label>
                  <input
                    type="text"
                    required
                    value={actNombre}
                    onChange={(e) => setActNombre(e.target.value)}
                    placeholder="Ej. CONCILIACIÓN CUENTA 2370"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Periodicidad
                  </label>
                  <select
                    value={actPeriodicidad}
                    onChange={(e) => setActPeriodicidad(e.target.value as ActivityPeriodicity)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 bg-white"
                  >
                    {ACTIVITY_PERIODICITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Día sugerido (1-31)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={actDiaSugerido}
                    onChange={(e) => setActDiaSugerido(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 tabular-nums"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nota breve (opcional)
                  </label>
                  <input
                    type="text"
                    value={actDescripcion}
                    onChange={(e) => setActDescripcion(e.target.value)}
                    placeholder="Detalle opcional"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Correos adicionales de cierre (opcional)
                  </label>
                  <input
                    type="text"
                    value={actExtraEmails}
                    onChange={(e) => setActExtraEmails(e.target.value)}
                    placeholder="correo1@premexcorp.com, correo2@premexcorp.com"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 font-mono"
                  />
                </div>
              </div>

              {/* Society-First Easy Multi-Selection Grid */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-800">
                    Empresas y responsables asignados
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleApplySocietyDefaultsToActivity}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#132B63] bg-white hover:bg-blue-50 border border-slate-200 rounded-lg cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3 text-[#1E60A8]" />
                      <span>Cargar responsables por sociedad</span>
                    </button>
                    {brushRespIds.length > 0 && (
                      <button
                        type="button"
                        onClick={handleAssignBrushToAllSocieties}
                        className="px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer"
                      >
                        Aplicar a todas las empresas
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActRespBySoc({})}
                      className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg cursor-pointer"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                {/* Step 1: Quick responsible toggle selector */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-500">
                    1. Elige uno o varios responsables:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeResponsibles.map((r) => {
                      const active = brushRespIds.includes(r.id);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => toggleBrushResponsible(r.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#132B63] text-white border-[#132B63]'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-[#1E60A8]/50'
                          }`}
                        >
                          {active && <Check className="w-3 h-3 text-sky-200" />}
                          <span>{r.nombre}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2: Clickable Empresas (Societies) Multi-Select Grid */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-500">
                    2. Haz clic en las empresas para agregar o quitar la asignación:
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                    {activeSocieties.map((soc) => {
                      const assignedIds = actRespBySoc[soc.codigo] || [];
                      const isAssigned = assignedIds.length > 0;
                      return (
                        <div
                          key={soc.id}
                          onClick={() =>
                            handleToggleSocietyInActivity(soc.codigo, soc.responsablesIds)
                          }
                          role="button"
                          tabIndex={0}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter' || ev.key === ' ') {
                              ev.preventDefault();
                              handleToggleSocietyInActivity(soc.codigo, soc.responsablesIds);
                            }
                          }}
                          className={`rounded-xl border p-3 transition-all cursor-pointer select-none flex flex-col justify-between gap-2 ${
                            isAssigned
                              ? 'bg-blue-50/70 border-[#1E60A8] shadow-2xs'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Building2
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isAssigned ? 'text-[#1E60A8]' : 'text-slate-400'
                                }`}
                              />
                              <span className="text-xs font-extrabold text-slate-900 truncate">
                                {soc.codigo}
                              </span>
                            </div>
                            <span
                              className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                                isAssigned
                                  ? 'bg-[#1E60A8] border-[#1E60A8] text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isAssigned && <Check className="w-3 h-3" />}
                            </span>
                          </div>

                          {assignedIds.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {assignedIds.map((rid) => {
                                const r = respById.get(rid);
                                return (
                                  <span
                                    key={rid}
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      handleRemoveRespFromActivitySociety(soc.codigo, rid);
                                    }}
                                    title="Quitar responsable"
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-white border border-blue-200 text-[#132B63] rounded-md hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700"
                                  >
                                    <span className="truncate max-w-[115px]">
                                      {r?.nombre || rid}
                                    </span>
                                    <X className="w-2.5 h-2.5 shrink-0" />
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400">Sin asignar</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowActivityForm(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingActivityId ? 'Guardar cambios' : 'Agregar actividad'}</span>
                </button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[740px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Actividad</th>
                    <th className="px-3 py-3">Periodicidad</th>
                    <th className="px-3 py-3">Día sugerido</th>
                    <th className="px-3 py-3">Empresas asignadas</th>
                    <th className="px-3 py-3">Estado</th>
                    {canEdit && <th className="px-4 py-3 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {data.activities.map((act) => {
                    const assignedSocs = Object.entries(act.responsablesPorSociedad || {})
                      .filter(([, val]) => normalizeResponsibleIds(val).length > 0)
                      .map(([code]) => code);
                    return (
                      <tr key={act.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{act.nombre}</div>
                          {act.descripcion && (
                            <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                              {act.descripcion}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 font-semibold text-[#1E60A8]">
                          {act.periodicidad}
                        </td>
                        <td className="px-3 py-3 font-mono tabular-nums text-slate-700">
                          Día {act.diaSugerido}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {assignedSocs.length > 0 ? (
                            <span className="font-medium">{assignedSocs.join(', ')}</span>
                          ) : (
                            <span className="text-slate-400">Sin asignar</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() =>
                              onUpdateWorkspace((prev) => ({
                                ...prev,
                                activities: prev.activities.map((a) =>
                                  a.id === act.id ? { ...a, activa: !a.activa } : a
                                ),
                              }))
                            }
                            className={`text-xs font-semibold cursor-pointer ${
                              act.activa ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                          >
                            {act.activa ? 'Activa' : 'Inactiva'}
                          </button>
                        </td>
                        {canEdit && (
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEditActivity(act)}
                                className="p-1.5 text-slate-500 hover:text-[#1E60A8] hover:bg-blue-50 rounded-lg cursor-pointer"
                                title="Editar actividad"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {confirmDeleteActId === act.id ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onUpdateWorkspace((prev) => ({
                                      ...prev,
                                      activities: prev.activities.filter((a) => a.id !== act.id),
                                    }));
                                    setConfirmDeleteActId(null);
                                  }}
                                  className="px-2 py-1 text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
                                >
                                  Confirmar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteActId(act.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                  title="Eliminar actividad"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: SOCIEDADES (WITH 1 OR MULTIPLE RESPONSIBLES ON CREATE/EDIT) */}
      {subTab === 'sociedades' && (
        <section className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-extrabold text-slate-900">
                {editingSocId ? `Editar Sociedad (${socCodigo})` : 'Sociedades y Responsables'}
              </h3>
              {editingSocId && (
                <button
                  type="button"
                  onClick={resetSocietyForm}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Cancelar edición
                </button>
              )}
            </div>

            {canEdit && (
              <form onSubmit={handleSaveSociety} className="space-y-4 pt-2 border-t border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    value={socCodigo}
                    onChange={(e) => setSocCodigo(e.target.value)}
                    placeholder="Código (ej. PREMEX) *"
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 uppercase"
                  />
                  <input
                    type="text"
                    value={socNombre}
                    onChange={(e) => setSocNombre(e.target.value)}
                    placeholder="Razón social"
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl cursor-pointer"
                  >
                    {editingSocId ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>{editingSocId ? 'Guardar Sociedad' : 'Agregar Sociedad'}</span>
                  </button>
                </div>

                {/* Multi-Responsible Picker when creating/editing society */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700">
                      Responsables de la sociedad ({socRespIds.length} seleccionado(s))
                    </span>
                    <div className="flex items-center gap-2 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setSocRespIds(activeResponsibles.map((r) => r.id))}
                        className="text-[#1E60A8] hover:underline cursor-pointer"
                      >
                        Todos
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => setSocRespIds([])}
                        className="text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>

                  {activeResponsibles.length === 0 ? (
                    <div className="text-xs text-slate-400">
                      Agrega responsables en la pestaña Responsables para asignarlos aquí.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {activeResponsibles.map((resp) => {
                        const checked = socRespIds.includes(resp.id);
                        return (
                          <button
                            key={resp.id}
                            type="button"
                            onClick={() => toggleSocResponsible(resp.id)}
                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
                              checked
                                ? 'bg-blue-50/80 border-[#1E60A8] text-[#132B63]'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">{resp.nombre}</div>
                              <div className="text-[10px] font-mono text-slate-500 truncate">
                                {resp.email || 'Sin correo'}
                              </div>
                            </div>
                            <span
                              className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                                checked
                                  ? 'bg-[#1E60A8] border-[#1E60A8] text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {checked && <Check className="w-3 h-3" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </form>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[680px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Código</th>
                    <th className="px-3 py-3">Nombre</th>
                    <th className="px-3 py-3">Responsables</th>
                    <th className="px-3 py-3">Estado</th>
                    {canEdit && <th className="px-4 py-3 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {data.societies.map((soc) => {
                    const assignedNames = normalizeResponsibleIds(soc.responsablesIds)
                      .map((id) => respById.get(id)?.nombre)
                      .filter(Boolean) as string[];
                    return (
                      <tr key={soc.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-bold text-slate-900">{soc.codigo}</td>
                        <td className="px-3 py-3 text-slate-700">{soc.nombre}</td>
                        <td className="px-3 py-3 text-slate-700">
                          {assignedNames.length > 0 ? (
                            <span className="font-medium">{assignedNames.join(', ')}</span>
                          ) : (
                            <span className="text-slate-400">Sin asignar</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() =>
                              onUpdateWorkspace((prev) => ({
                                ...prev,
                                societies: prev.societies.map((s) =>
                                  s.id === soc.id ? { ...s, activa: !s.activa } : s
                                ),
                              }))
                            }
                            className={`font-semibold cursor-pointer ${
                              soc.activa ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                          >
                            {soc.activa ? 'Visible' : 'Oculta'}
                          </button>
                        </td>
                        {canEdit && (
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => startEditSociety(soc)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#1E60A8] hover:bg-blue-50 rounded-lg cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Editar</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: RESPONSABLES (SOCIETY-FIRST MULTI-SELECT SHOWING EMPRESAS) */}
      {subTab === 'responsables' && (
        <section className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-extrabold text-slate-900">
                {editingRespId ? `Editar Responsable (${respNombre})` : 'Directorio de Responsables'}
              </h3>
              {editingRespId && (
                <button
                  type="button"
                  onClick={resetResponsibleForm}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Cancelar edición
                </button>
              )}
            </div>

            {canEdit && (
              <form
                onSubmit={handleSaveResponsible}
                className="space-y-4 pt-2 border-t border-slate-100"
              >
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input
                    type="text"
                    required
                    value={respNombre}
                    onChange={(e) => setRespNombre(e.target.value)}
                    placeholder="Nombre completo *"
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  />
                  <input
                    type="email"
                    required
                    value={respEmail}
                    onChange={(e) => setRespEmail(e.target.value)}
                    placeholder="correo@premexcorp.com *"
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 font-mono"
                  />
                  <input
                    type="text"
                    value={respCargo}
                    onChange={(e) => setRespCargo(e.target.value)}
                    placeholder="Cargo"
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl cursor-pointer"
                  >
                    {editingRespId ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>{editingRespId ? 'Guardar' : 'Agregar'}</span>
                  </button>
                </div>

                {/* Easy Multi-Select Grid of EMPRESAS (Societies) */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700">
                      Empresas asignadas ({respSocietyCodes.length} seleccionada(s))
                    </span>
                    <div className="flex items-center gap-2 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setRespSocietyCodes(activeSocieties.map((s) => s.codigo))}
                        className="text-[#1E60A8] hover:underline cursor-pointer"
                      >
                        Todas
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => setRespSocietyCodes([])}
                        className="text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {activeSocieties.map((soc) => {
                      const checked = respSocietyCodes.includes(soc.codigo);
                      return (
                        <button
                          key={soc.id}
                          type="button"
                          onClick={() => toggleRespSocietyCode(soc.codigo)}
                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
                            checked
                              ? 'bg-blue-50/80 border-[#1E60A8] text-[#132B63]'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Building2
                              className={`w-3.5 h-3.5 shrink-0 ${
                                checked ? 'text-[#1E60A8]' : 'text-slate-400'
                              }`}
                            />
                            <span className="text-xs font-bold truncate">{soc.codigo}</span>
                          </div>
                          <span
                            className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                              checked
                                ? 'bg-[#1E60A8] border-[#1E60A8] text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {checked && <Check className="w-3 h-3" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </form>
            )}

            {canEdit && importableSuiteUsers.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Importar usuarios de la Suite
                </div>
                <div className="flex flex-wrap gap-2">
                  {importableSuiteUsers.slice(0, 8).map((u) => (
                    <button
                      key={u.email}
                      type="button"
                      onClick={() => handleImportSuiteUser(u)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-[#132B63] border border-slate-200 rounded-xl cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-[#1E60A8]" />
                      <span>{u.displayName || u.email}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[720px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Responsable</th>
                    <th className="px-3 py-3">Correo</th>
                    <th className="px-3 py-3">Empresas</th>
                    <th className="px-3 py-3">Estado</th>
                    {canEdit && <th className="px-4 py-3 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {data.responsibles.map((r) => {
                    const socCodes = data.societies
                      .filter((s) => normalizeResponsibleIds(s.responsablesIds).includes(r.id))
                      .map((s) => s.codigo);
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{r.nombre}</div>
                          {r.cargo && <div className="text-[11px] text-slate-500">{r.cargo}</div>}
                        </td>
                        <td className="px-3 py-3 font-mono text-slate-700">{r.email || '—'}</td>
                        <td className="px-3 py-3 text-slate-700">
                          {socCodes.length > 0 ? (
                            <span className="font-medium">{socCodes.join(', ')}</span>
                          ) : (
                            <span className="text-slate-400">Sin asignar</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() =>
                              onUpdateWorkspace((prev) => ({
                                ...prev,
                                responsibles: prev.responsibles.map((item) =>
                                  item.id === r.id ? { ...item, activo: !item.activo } : item
                                ),
                              }))
                            }
                            className={`font-semibold cursor-pointer ${
                              r.activo ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                          >
                            {r.activo ? 'Activo' : 'Inactivo'}
                          </button>
                        </td>
                        {canEdit && (
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => startEditResponsible(r)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#1E60A8] hover:bg-blue-50 rounded-lg cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Editar / Empresas</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* TAB 4: DESTINATARIOS DE NOTIFICACIÓN DE CIERRE */}
      {subTab === 'destinatarios' && (
        <section className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">
              Reglas de Notificación
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={data.notifyAdminsAutomatically}
                  onChange={(e) =>
                    onUpdateWorkspace((prev) => ({
                      ...prev,
                      notifyAdminsAutomatically: e.target.checked,
                    }))
                  }
                  className="mt-0.5 rounded border-slate-300 text-[#1E60A8] focus:ring-[#1E60A8]"
                />
                <div className="text-xs">
                  <div className="font-bold text-slate-900">
                    Notificar automáticamente a administradores
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    Incluye los usuarios con rol Administrador activos.
                  </div>
                </div>
              </label>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3">
                <div className="text-xs">
                  <div className="font-bold text-slate-900">Ventana de alerta (días previos)</div>
                  <div className="text-slate-500 mt-0.5">
                    Días antes de la fecha sugerida para marcar como próxima.
                  </div>
                </div>
                <input
                  type="number"
                  min={0}
                  max={30}
                  disabled={!canEdit}
                  value={data.subtleReminderDaysBefore}
                  onChange={(e) =>
                    onUpdateWorkspace((prev) => ({
                      ...prev,
                      subtleReminderDaysBefore: Math.min(
                        30,
                        Math.max(0, Math.round(Number(e.target.value) || 0))
                      ),
                    }))
                  }
                  className="w-20 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-center tabular-nums text-slate-900"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-4">
            <h4 className="text-sm font-bold text-slate-900">
              Destinatarios de Confirmación de Cierre
            </h4>

            {canEdit && (
              <form onSubmit={handleAddRecipient} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  value={notifNombre}
                  onChange={(e) => setNotifNombre(e.target.value)}
                  placeholder="Nombre *"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
                />
                <input
                  type="email"
                  required
                  value={notifEmail}
                  onChange={(e) => setNotifEmail(e.target.value)}
                  placeholder="correo@premexcorp.com *"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 font-mono"
                />
                <select
                  value={notifTipo}
                  onChange={(e) =>
                    setNotifTipo(e.target.value as 'administrador' | 'designado')
                  }
                  className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 bg-white"
                >
                  <option value="designado">Usuario designado</option>
                  <option value="administrador">Administrador</option>
                </select>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar</span>
                </button>
              </form>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2.5">Nombre</th>
                    <th className="px-3 py-2.5">Correo</th>
                    <th className="px-3 py-2.5">Tipo</th>
                    <th className="px-3 py-2.5">Estado</th>
                    {canEdit && <th className="px-4 py-2.5 text-right">Quitar</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {data.notificationRecipients.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-bold text-slate-900">{rec.nombre}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-700">{rec.email}</td>
                      <td className="px-3 py-2.5 capitalize text-slate-600">{rec.tipo}</td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() =>
                            onUpdateWorkspace((prev) => ({
                              ...prev,
                              notificationRecipients: prev.notificationRecipients.map((item) =>
                                item.id === rec.id ? { ...item, activo: !item.activo } : item
                              ),
                            }))
                          }
                          className={`font-semibold cursor-pointer ${
                            rec.activo ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          {rec.activo ? 'Activo' : 'Pausado'}
                        </button>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateWorkspace((prev) => ({
                                ...prev,
                                notificationRecipients: prev.notificationRecipients.filter(
                                  (item) => item.id !== rec.id
                                ),
                              }))
                            }
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl bg-emerald-50/60 border border-emerald-200 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                <Mail className="w-4 h-4 text-emerald-700" />
                <span>Destinatarios activos ({resolvedRecipients.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                {resolvedRecipients.map((r) => (
                  <div
                    key={r.email}
                    className="bg-white rounded-lg border border-emerald-200/80 px-3 py-2"
                  >
                    <div className="font-bold text-slate-900 truncate">{r.nombre}</div>
                    <div className="font-mono text-[11px] text-slate-600 truncate">{r.email}</div>
                    <div className="text-[10px] font-semibold text-emerald-700 mt-0.5">
                      {r.origen}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
