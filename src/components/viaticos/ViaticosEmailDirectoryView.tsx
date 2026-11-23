import React, { useMemo, useState } from 'react';
import {
  Mail,
  Plus,
  Users,
  Send,
  Copy,
  Pencil,
  Trash2,
  Check,
  X,
  Star,
  UserPlus,
  Power,
  AlertCircle,
  Lock,
} from 'lucide-react';
import {
  EffectivePermissions,
  ViaticoEmailGroup,
  ViaticoEmailGroupType,
  ViaticoEmailMember,
} from '../../types';
import { isValidEmailFormat, normalizeEmail } from '../../utils/permissions';

interface ViaticosEmailDirectoryViewProps {
  emailGroups: ViaticoEmailGroup[];
  onSaveEmailGroups: (groups: ViaticoEmailGroup[]) => void;
  permissions: EffectivePermissions;
}

type GroupFilterType = 'ALL' | ViaticoEmailGroupType;

export const ViaticosEmailDirectoryView: React.FC<ViaticosEmailDirectoryViewProps> = ({
  emailGroups,
  onSaveEmailGroups,
  permissions,
}) => {
  const [filterType, setFilterType] = useState<GroupFilterType>('ALL');
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [gNombre, setGNombre] = useState('');
  const [gTipo, setGTipo] = useState<ViaticoEmailGroupType>('dirigido');
  const [gDescripcion, setGDescripcion] = useState('');
  const [gPorDefecto, setGPorDefecto] = useState(false);
  const [gActivo, setGActivo] = useState(true);
  const [groupError, setGroupError] = useState<string | null>(null);

  // Per-group quick add member state
  const [memberDrafts, setMemberDrafts] = useState<
    Record<string, { nombre: string; email: string; error?: string }>
  >({});
  const [editingMember, setEditingMember] = useState<{
    groupId: string;
    memberId: string;
    nombre: string;
    email: string;
    error?: string;
  } | null>(null);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);

  const canEdit = permissions.canOperate;

  const stats = useMemo(() => {
    const dirigidoGroups = emailGroups.filter((g) => g.tipo === 'dirigido');
    const copiaGroups = emailGroups.filter((g) => g.tipo === 'copia');
    const totalMembers = emailGroups.reduce((acc, g) => acc + g.miembros.length, 0);
    const defaultCopyCount = copiaGroups
      .filter((g) => g.activo && g.porDefecto)
      .reduce((acc, g) => acc + g.miembros.length, 0);

    return {
      totalGroups: emailGroups.length,
      dirigidoCount: dirigidoGroups.length,
      copiaCount: copiaGroups.length,
      totalMembers,
      defaultCopyCount,
    };
  }, [emailGroups]);

  const filteredGroups = useMemo(() => {
    if (filterType === 'ALL') return emailGroups;
    return emailGroups.filter((g) => g.tipo === filterType);
  }, [emailGroups, filterType]);

  const openCreateGroupModal = (presetType: ViaticoEmailGroupType = 'dirigido') => {
    if (!canEdit) return;
    setEditingGroupId(null);
    setGNombre('');
    setGTipo(presetType);
    setGDescripcion('');
    setGPorDefecto(presetType === 'copia');
    setGActivo(true);
    setGroupError(null);
    setIsGroupModalOpen(true);
  };

  const openEditGroupModal = (group: ViaticoEmailGroup) => {
    if (!canEdit) return;
    setEditingGroupId(group.id);
    setGNombre(group.nombre);
    setGTipo(group.tipo);
    setGDescripcion(group.descripcion || '');
    setGPorDefecto(Boolean(group.porDefecto));
    setGActivo(group.activo !== false);
    setGroupError(null);
    setIsGroupModalOpen(true);
  };

  const handleSaveGroupModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setGroupError(null);
    const cleanName = gNombre.trim();
    if (!cleanName) {
      setGroupError('Ingresa el nombre del grupo (ej. "Equipo Contable" o "Jefe de Ventas").');
      return;
    }

    if (editingGroupId) {
      const next = emailGroups.map((g) =>
        g.id === editingGroupId
          ? {
              ...g,
              nombre: cleanName,
              tipo: gTipo,
              descripcion: gDescripcion.trim(),
              porDefecto: gPorDefecto,
              activo: gActivo,
            }
          : g
      );
      onSaveEmailGroups(next);
    } else {
      const newGroup: ViaticoEmailGroup = {
        id: `mailgrp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        nombre: cleanName,
        tipo: gTipo,
        descripcion: gDescripcion.trim(),
        porDefecto: gPorDefecto,
        activo: gActivo,
        miembros: [],
      };
      onSaveEmailGroups([...emailGroups, newGroup]);
    }
    setIsGroupModalOpen(false);
  };

  const handleToggleGroupDefault = (groupId: string) => {
    if (!canEdit) return;
    onSaveEmailGroups(
      emailGroups.map((g) =>
        g.id === groupId ? { ...g, porDefecto: !g.porDefecto } : g
      )
    );
  };

  const handleToggleGroupActive = (groupId: string) => {
    if (!canEdit) return;
    onSaveEmailGroups(
      emailGroups.map((g) =>
        g.id === groupId ? { ...g, activo: g.activo === false } : g
      )
    );
  };

  const handleDeleteGroup = (groupId: string) => {
    if (!canEdit) return;
    onSaveEmailGroups(emailGroups.filter((g) => g.id !== groupId));
    setConfirmDeleteGroupId(null);
  };

  const updateMemberDraft = (
    groupId: string,
    patch: Partial<{ nombre: string; email: string; error?: string }>
  ) => {
    setMemberDrafts((prev) => ({
      ...prev,
      [groupId]: {
        nombre: prev[groupId]?.nombre || '',
        email: prev[groupId]?.email || '',
        ...patch,
      },
    }));
  };

  const handleAddMembersToGroup = (group: ViaticoEmailGroup, e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    const draft = memberDrafts[group.id] || { nombre: '', email: '' };
    const rawEmailInput = (draft.email || '').trim();
    const rawNameInput = (draft.nombre || '').trim();

    if (!rawEmailInput) {
      updateMemberDraft(group.id, {
        error: 'Ingresa uno o varios correos electrónicos válidos.',
      });
      return;
    }

    // Support adding either one member with name+email or multiple comma/semicolon-separated emails at once
    const parsedEmails = Array.from(
      new Set(
        rawEmailInput
          .split(/[,;\n\r]+/)
          .map((item) => normalizeEmail(item))
          .filter(Boolean)
      )
    );

    if (parsedEmails.length === 0) {
      updateMemberDraft(group.id, {
        error: 'No se detectaron correos válidos.',
      });
      return;
    }

    const invalidEmails = parsedEmails.filter((em) => !isValidEmailFormat(em));
    if (invalidEmails.length > 0) {
      updateMemberDraft(group.id, {
        error: `Correo inválido: ${invalidEmails[0]}`,
      });
      return;
    }

    const existingEmails = new Set(group.miembros.map((m) => normalizeEmail(m.email)));
    const newMembers: ViaticoEmailMember[] = [];

    parsedEmails.forEach((cleanEmail, idx) => {
      if (existingEmails.has(cleanEmail)) return;
      existingEmails.add(cleanEmail);
      const inferredName =
        parsedEmails.length === 1 && rawNameInput
          ? rawNameInput
          : cleanEmail
              .split('@')[0]
              .replace(/[._-]+/g, ' ')
              .replace(/\b\w/g, (ch) => ch.toUpperCase());

      newMembers.push({
        id: `mem-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        nombre: inferredName,
        email: cleanEmail,
      });
    });

    if (newMembers.length === 0) {
      updateMemberDraft(group.id, {
        error: 'Ese correo ya pertenece a esta lista.',
      });
      return;
    }

    onSaveEmailGroups(
      emailGroups.map((g) =>
        g.id === group.id
          ? { ...g, miembros: [...g.miembros, ...newMembers] }
          : g
      )
    );

    setMemberDrafts((prev) => ({
      ...prev,
      [group.id]: { nombre: '', email: '', error: undefined },
    }));
  };

  const handleSaveEditedMember = () => {
    if (!canEdit || !editingMember) return;
    const cleanEmail = normalizeEmail(editingMember.email);
    const cleanName = editingMember.nombre.trim();

    if (!isValidEmailFormat(cleanEmail)) {
      setEditingMember({
        ...editingMember,
        error: 'Ingresa un correo electrónico válido.',
      });
      return;
    }

    const targetGroup = emailGroups.find((g) => g.id === editingMember.groupId);
    if (!targetGroup) return;

    const duplicate = targetGroup.miembros.some(
      (m) =>
        m.id !== editingMember.memberId &&
        normalizeEmail(m.email) === cleanEmail
    );
    if (duplicate) {
      setEditingMember({
        ...editingMember,
        error: 'Otro integrante en este grupo ya usa ese correo.',
      });
      return;
    }

    onSaveEmailGroups(
      emailGroups.map((g) =>
        g.id === editingMember.groupId
          ? {
              ...g,
              miembros: g.miembros.map((m) =>
                m.id === editingMember.memberId
                  ? {
                      ...m,
                      nombre: cleanName || m.nombre,
                      email: cleanEmail,
                    }
                  : m
              ),
            }
          : g
      )
    );
    setEditingMember(null);
  };

  const handleRemoveMember = (groupId: string, memberId: string) => {
    if (!canEdit) return;
    onSaveEmailGroups(
      emailGroups.map((g) =>
        g.id === groupId
          ? { ...g, miembros: g.miembros.filter((m) => m.id !== memberId) }
          : g
      )
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* KPI Strip */}
      <section className="bg-white rounded-2xl border border-slate-200/90 grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
        <div className="p-3.5 sm:p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Grupos Configurados
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#132B63] font-mono tabular-nums">
            {stats.totalGroups}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            Listas reutilizables en envío Gmail
          </div>
        </div>

        <div className="p-3.5 sm:p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Autorizadores (Para)
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#1E60A8] font-mono tabular-nums">
            {stats.dirigidoCount}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            Grupos seleccionables en desplegable
          </div>
        </div>

        <div className="p-3.5 sm:p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Equipos en Copia (CC)
          </div>
          <div className="mt-1.5 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
            {stats.copiaCount}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {stats.defaultCopyCount} correo(s) en copia automática
          </div>
        </div>

        <div className="p-3.5 sm:p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Contactos Registrados
          </div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {stats.totalMembers}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            Nombres y correos vinculados
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/70">
          {(
            [
              { id: 'ALL', label: `Todos (${emailGroups.length})` },
              {
                id: 'dirigido',
                label: `Autorizadores · Para (${stats.dirigidoCount})`,
              },
              {
                id: 'copia',
                label: `Equipos en Copia · CC (${stats.copiaCount})`,
              },
            ] as { id: GroupFilterType; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                filterType === tab.id
                  ? 'bg-white text-[#132B63] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!canEdit ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold">
              <Lock className="w-3.5 h-3.5" />
              <span>Modo Solo Consulta</span>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => openCreateGroupModal('dirigido')}
                className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3.5 py-2 text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Grupo Autorizador (Para)</span>
              </button>
              <button
                type="button"
                onClick={() => openCreateGroupModal('copia')}
                className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Equipo en Copia (CC)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Info Banner explaining usage */}
      <div className="rounded-2xl border border-sky-200/80 bg-sky-50/70 px-4 py-3 text-xs text-[#132B63] flex items-start gap-2.5">
        <Mail className="w-4 h-4 text-[#1E60A8] shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          Los grupos tipo <strong>Dirigido / Autorizador (Para)</strong> (ej.{' '}
          <em>Jefe de Ventas</em>) aparecen en el desplegable de destinatarios al enviar una
          liquidación. Los grupos tipo <strong>Copia (CC)</strong> marcados como{' '}
          <strong>Pre-cargado automáticamente</strong> (ej. <em>Equipo Contable</em>) se incluyen
          siempre en copia de forma predeterminada, manteniendo además la opción de editar o
          escribir correos manualmente.
        </div>
      </div>

      {/* Groups Grid */}
      {filteredGroups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
          <Users className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">
            No hay grupos en esta categoría todavía.
          </p>
          <p className="text-xs text-slate-500">
            Crea un grupo de Autorizadores (Para) o un Equipo en Copia (CC) para usarlos en el envío
            de liquidaciones.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
          {filteredGroups.map((group) => {
            const isDirigido = group.tipo === 'dirigido';
            const isActive = group.activo !== false;
            const draft = memberDrafts[group.id] || { nombre: '', email: '' };

            return (
              <section
                key={group.id}
                className={`bg-white rounded-2xl border overflow-hidden flex flex-col ${
                  isActive
                    ? 'border-slate-200/90 shadow-2xs'
                    : 'border-slate-200 bg-slate-50/60 opacity-85'
                }`}
              >
                {/* Card Header */}
                <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                          isDirigido
                            ? 'bg-sky-50 text-[#132B63] border border-sky-200'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {isDirigido ? (
                          <Send className="w-3 h-3" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>
                          {isDirigido ? 'Dirigido (Para)' : 'Copia (CC)'}
                        </span>
                      </span>

                      {group.porDefecto && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <Star className="w-3 h-3 fill-amber-500 text-amber-600" />
                          <span>
                            {isDirigido
                              ? 'Por defecto en Para'
                              : 'Siempre en Copia (CC)'}
                          </span>
                        </span>
                      )}

                      {!isActive && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200 text-slate-600">
                          Pausado
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-slate-900 truncate">
                      {group.nombre}
                    </h3>
                    {group.descripcion && (
                      <p className="text-xs text-slate-500 leading-snug">
                        {group.descripcion}
                      </p>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleGroupDefault(group.id)}
                        title={
                          group.porDefecto
                            ? 'Quitar carga automática por defecto'
                            : 'Pre-cargar automáticamente al abrir el correo'
                        }
                        className={`min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg border text-xs cursor-pointer transition-colors ${
                          group.porDefecto
                            ? 'bg-amber-50 border-amber-300 text-amber-700'
                            : 'bg-white border-slate-200 text-slate-400 hover:text-amber-600 hover:border-amber-200'
                        }`}
                      >
                        <Star
                          className={`w-4 h-4 ${
                            group.porDefecto ? 'fill-amber-500' : ''
                          }`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleGroupActive(group.id)}
                        title={isActive ? 'Pausar grupo' : 'Activar grupo'}
                        className={`min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg border text-xs cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-slate-100 border-slate-200 text-slate-500'
                        }`}
                      >
                        <Power className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditGroupModal(group)}
                        title="Editar nombre o tipo del grupo"
                        className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-[#1E60A8] hover:border-sky-200 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>

                      {confirmDeleteGroupId === group.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDeleteGroup(group.id)}
                            className="min-h-[36px] px-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
                          >
                            Eliminar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteGroupId(null)}
                            className="min-h-[36px] px-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg cursor-pointer"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteGroupId(group.id)}
                          title="Eliminar grupo"
                          className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-600 hover:border-rose-200 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Members List */}
                <div className="p-4 sm:p-5 flex-1 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wider">
                    <span>Integrantes ({group.miembros.length})</span>
                  </div>

                  {group.miembros.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3.5 py-4 text-xs text-slate-500 text-center">
                      Aún no hay correos agregados en <strong>{group.nombre}</strong>.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                      {group.miembros.map((member) => {
                        const isEditingThis =
                          editingMember?.groupId === group.id &&
                          editingMember?.memberId === member.id;

                        if (isEditingThis && editingMember) {
                          return (
                            <div
                              key={member.id}
                              className="p-2.5 bg-sky-50/60 space-y-2"
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  value={editingMember.nombre}
                                  onChange={(e) =>
                                    setEditingMember({
                                      ...editingMember,
                                      nombre: e.target.value,
                                      error: undefined,
                                    })
                                  }
                                  placeholder="Nombre completo"
                                  className="min-h-[38px] px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                                />
                                <input
                                  type="email"
                                  value={editingMember.email}
                                  onChange={(e) =>
                                    setEditingMember({
                                      ...editingMember,
                                      email: e.target.value,
                                      error: undefined,
                                    })
                                  }
                                  placeholder="correo@empresa.com"
                                  className="min-h-[38px] px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                                />
                              </div>
                              {editingMember.error && (
                                <p className="text-[11px] text-rose-700 font-medium">
                                  {editingMember.error}
                                </p>
                              )}
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setEditingMember(null)}
                                  className="px-2.5 py-1 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg cursor-pointer"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={handleSaveEditedMember}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-[#132B63] rounded-lg cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Guardar</span>
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={member.id}
                            className="px-3 py-2.5 flex items-center justify-between gap-2 bg-white hover:bg-slate-50/70"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-900 truncate">
                                {member.nombre || member.email}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 truncate">
                                {member.email}
                              </div>
                            </div>

                            {canEdit && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingMember({
                                      groupId: group.id,
                                      memberId: member.id,
                                      nombre: member.nombre,
                                      email: member.email,
                                    })
                                  }
                                  aria-label={`Editar ${member.email}`}
                                  className="min-w-[34px] min-h-[34px] inline-flex items-center justify-center text-slate-400 hover:text-[#1E60A8] hover:bg-sky-50 rounded-lg cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMember(group.id, member.id)}
                                  aria-label={`Quitar ${member.email}`}
                                  className="min-w-[34px] min-h-[34px] inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Quick Add Member Form */}
                  {canEdit && (
                    <form
                      onSubmit={(e) => handleAddMembersToGroup(group, e)}
                      className="pt-2 border-t border-slate-100 space-y-2"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                        <input
                          type="text"
                          value={draft.nombre}
                          onChange={(e) =>
                            updateMemberDraft(group.id, {
                              nombre: e.target.value,
                              error: undefined,
                            })
                          }
                          placeholder="Nombre (opcional)"
                          className="sm:col-span-2 min-h-[40px] px-3 py-1.5 text-sm sm:text-xs bg-slate-50 focus:bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/25"
                        />
                        <input
                          type="text"
                          inputMode="email"
                          value={draft.email}
                          onChange={(e) =>
                            updateMemberDraft(group.id, {
                              email: e.target.value,
                              error: undefined,
                            })
                          }
                          placeholder="correo@premexcorp.com (uno o varios con coma)"
                          className="sm:col-span-3 min-h-[40px] px-3 py-1.5 text-sm sm:text-xs font-mono bg-slate-50 focus:bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/25"
                        />
                      </div>

                      {draft.error && (
                        <div className="flex items-center gap-1.5 text-[11px] text-rose-700 font-medium">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{draft.error}</span>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 py-1.5 text-xs font-bold text-[#132B63] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5 text-[#1E60A8]" />
                          <span>Agregar a {group.nombre}</span>
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Create / Edit Group Modal */}
      {isGroupModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setIsGroupModalOpen(false)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-[#132B63] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-sky-200" />
                <h3 className="text-sm sm:text-base font-bold">
                  {editingGroupId
                    ? 'Editar Lista de Correos'
                    : 'Nueva Lista de Correos'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsGroupModalOpen(false)}
                className="p-1.5 text-blue-200 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGroupModal} className="p-5 space-y-4">
              {groupError && (
                <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{groupError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nombre de la Lista / Grupo *
                </label>
                <input
                  type="text"
                  value={gNombre}
                  onChange={(e) => setGNombre(e.target.value)}
                  placeholder="Ej. Jefe de Ventas o Equipo Contable"
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Uso al enviar el correo *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setGTipo('dirigido')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      gTipo === 'dirigido'
                        ? 'bg-sky-50 border-[#1E60A8] ring-1 ring-[#1E60A8]'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#132B63]">
                      <Send className="w-3.5 h-3.5 text-[#1E60A8]" />
                      <span>Dirigido (Para)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Autorizadores que aparecen en el desplegable de &quot;Para&quot;.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGTipo('copia')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      gTipo === 'copia'
                        ? 'bg-emerald-50 border-emerald-600 ring-1 ring-emerald-600'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                      <Copy className="w-3.5 h-3.5 text-emerald-700" />
                      <span>En Copia (CC)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Equipos contables o respaldo en &quot;CC&quot;.
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Descripción breve (opcional)
                </label>
                <input
                  type="text"
                  value={gDescripcion}
                  onChange={(e) => setGDescripcion(e.target.value)}
                  placeholder="Ej. Jefes regionales encargados de aprobar viáticos comerciales"
                  className="w-full min-h-[40px] px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gPorDefecto}
                    onChange={(e) => setGPorDefecto(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#1E60A8]"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-800">
                      {gTipo === 'copia'
                        ? 'Incluir siempre automáticamente en Copia (CC)'
                        : 'Pre-cargar automáticamente en Para'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Al abrir la ventana de envío de correo, los correos de este grupo se
                      cargarán solos.
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 px-2.5 py-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gActivo}
                    onChange={(e) => setGActivo(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-700"
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    Grupo activo y visible en el desplegable
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsGroupModalOpen(false)}
                  className="min-h-[42px] px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl cursor-pointer"
                >
                  {editingGroupId ? 'Guardar Cambios' : 'Crear Grupo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
