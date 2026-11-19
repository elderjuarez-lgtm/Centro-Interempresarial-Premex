import React, { useState, useMemo, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  AlertTriangle,
  Building2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Grid3X3,
  UploadCloud,
  Download,
  FileSpreadsheet,
  ClipboardPaste,
  X,
  Info,
  Cloud,
  RefreshCw,
  LogIn,
  ShieldCheck
} from 'lucide-react';
import {
  EntityMapping,
  Movement,
  ReconciliationScope,
  DirectorySyncState
} from '../../types';
import {
  normalizeNit,
  parseBulkEntitiesFile,
  parseBulkEntitiesText,
  downloadEntitiesTemplate,
  ParseBulkEntitiesResult
} from '../../utils/excel';
import { INTERCOMPANY_SCOPE_META, getIntercompanyScopeLabel } from '../../utils/demoData';

interface EmpresasViewProps {
  entities: EntityMapping[];
  setEntities: React.Dispatch<React.SetStateAction<EntityMapping[]>>;
  movements: Movement[];
  onGoToConciliacion?: () => void;
  activeScope?: ReconciliationScope;
  directorySync?: DirectorySyncState;
  currentUser?: User | null;
  onSaveDirectoryToCloud?: () => Promise<void> | void;
  onSignInWithGoogle?: () => void;
  readOnly?: boolean;
  canManageMasterData?: boolean;
}

export const EmpresasView: React.FC<EmpresasViewProps> = ({
  entities,
  setEntities,
  movements,
  onGoToConciliacion,
  activeScope = 'internacionales',
  directorySync,
  currentUser,
  onSaveDirectoryToCloud,
  onSignInWithGoogle,
  readOnly = false,
  canManageMasterData = true,
}) => {
  const isDirectoryLocked = Boolean(readOnly || !canManageMasterData);
  const scopeMeta = INTERCOMPANY_SCOPE_META[activeScope];
  const scopeLabel = getIntercompanyScopeLabel(activeScope);
  const defaultCountry = scopeMeta.defaultCountry;
  const defaultCurrency = scopeMeta.defaultCurrency;

  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Quick-add state
  const [newNombre, setNewNombre] = useState('');
  const [newNit, setNewNit] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCodigo, setNewCodigo] = useState('');
  const [newPais, setNewPais] = useState('');
  const [newMoneda, setNewMoneda] = useState(defaultCurrency);
  const [addError, setAddError] = useState<string | null>(null);

  // Inline edit state
  const [editNombre, setEditNombre] = useState('');
  const [editNit, setEditNit] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCodigo, setEditCodigo] = useState('');
  const [editPais, setEditPais] = useState('');
  const [editMoneda, setEditMoneda] = useState(defaultCurrency);

  // Bulk upload modal state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkTab, setBulkTab] = useState<'excel' | 'paste'>('excel');
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [bulkFileName, setBulkFileName] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<ParseBulkEntitiesResult | null>(null);
  const [bulkMode, setBulkMode] = useState<'replace' | 'append'>('replace');
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  // Detect companies present in movements that are NOT in the configured list (by name or NIT)
  const registeredSet = useMemo(
    () => new Set(entities.map((e) => e.nombreOficial.trim().toLowerCase())),
    [entities]
  );

  const registeredNitSet = useMemo(() => {
    const s = new Set<string>();
    entities.forEach((e) => {
      if (e.nit) {
        const n = normalizeNit(e.nit);
        if (n) s.add(n);
      }
    });
    return s;
  }, [entities]);

  const missingInMovements = useMemo(() => {
    const missingMap = new Map<string, string>();
    movements.forEach((m) => {
      [m.sociedad, m.contraparte].forEach((raw) => {
        const clean = raw.trim();
        if (!clean) return;
        const norm = clean.toLowerCase();
        const normNit = normalizeNit(clean);
        if (
          !registeredSet.has(norm) &&
          !(normNit && registeredNitSet.has(normNit)) &&
          !missingMap.has(norm)
        ) {
          missingMap.set(norm, clean);
        }
      });
    });
    return Array.from(missingMap.values());
  }, [movements, registeredSet, registeredNitSet]);

  const filteredEntities = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return entities;
    const normTermNit = normalizeNit(term);
    return entities.filter(
      (e) =>
        e.nombreOficial.toLowerCase().includes(term) ||
        (e.nit && e.nit.toLowerCase().includes(term)) ||
        (normTermNit && e.nit && normalizeNit(e.nit).includes(normTermNit)) ||
        (e.email && e.email.toLowerCase().includes(term)) ||
        e.codigoSociedad.toLowerCase().includes(term) ||
        (e.pais && e.pais.toLowerCase().includes(term))
    );
  }, [entities, searchTerm]);

  const handleAddCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDirectoryLocked) return;
    const cleanName = newNombre.trim();
    const cleanNit = newNit.trim();
    const cleanEmail = newEmail.trim();
    if (!cleanName) {
      setAddError('Ingresa el nombre oficial de la sociedad.');
      return;
    }

    if (registeredSet.has(cleanName.toLowerCase())) {
      setAddError(`"${cleanName}" ya existe en la lista de empresas a conciliar.`);
      return;
    }

    const normNit = normalizeNit(cleanNit);
    if (normNit && registeredNitSet.has(normNit)) {
      setAddError(`El NIT "${cleanNit}" ya está asignado a otra sociedad.`);
      return;
    }

    const newEntity: EntityMapping = {
      id: `ent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      alias: cleanName,
      nombreOficial: cleanName,
      nit: cleanNit,
      email: cleanEmail,
      codigoSociedad: newCodigo.trim() || `EMP-${(entities.length + 1) * 100}`,
      pais: newPais.trim() || defaultCountry,
      moneda: newMoneda.trim().toUpperCase() || defaultCurrency,
    };

    setEntities((prev) => [...prev, newEntity]);
    setNewNombre('');
    setNewNit('');
    setNewEmail('');
    setNewCodigo('');
    setNewPais('');
    setNewMoneda(defaultCurrency);
    setAddError(null);
  };

  const handleQuickAddMissing = (names: string[]) => {
    setEntities((prev) => {
      const existing = new Set(prev.map((e) => e.nombreOficial.trim().toLowerCase()));
      const additions: EntityMapping[] = [];
      names.forEach((raw, idx) => {
        const clean = raw.trim();
        if (!clean || existing.has(clean.toLowerCase())) return;
        existing.add(clean.toLowerCase());
        const looksLikeNit = /^[0-9.\-\s]+$/.test(clean);
        additions.push({
          id: `ent-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
          alias: clean,
          nombreOficial: clean,
          nit: looksLikeNit ? clean : '',
          codigoSociedad: `EMP-${(prev.length + additions.length + 1) * 100}`,
          pais: defaultCountry,
          moneda: defaultCurrency,
        });
      });
      return [...prev, ...additions];
    });
  };

  const handleStartEdit = (entity: EntityMapping) => {
    if (isDirectoryLocked) return;
    setEditingId(entity.id);
    setEditNombre(entity.nombreOficial);
    setEditNit(entity.nit || '');
    setEditEmail(entity.email || '');
    setEditCodigo(entity.codigoSociedad);
    setEditPais(entity.pais || '');
    setEditMoneda(entity.moneda || defaultCurrency);
  };

  const handleSaveEdit = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (isDirectoryLocked) return;
    const cleanName = editNombre.trim();
    if (!cleanName) return;

    setEntities((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              alias: cleanName,
              nombreOficial: cleanName,
              nit: editNit.trim(),
              email: editEmail.trim(),
              codigoSociedad: editCodigo.trim() || item.codigoSociedad,
              pais: editPais.trim(),
              moneda: editMoneda.trim().toUpperCase() || defaultCurrency,
            }
          : item
      )
    );
    setEditingId(null);
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    if (isDirectoryLocked) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= entities.length) return;
    setEntities((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, moved);
      return copy;
    });
  };

  const handleDelete = (id: string, nombre: string) => {
    if (isDirectoryLocked) return;
    if (window.confirm(`¿Deseas quitar a "${nombre}" del listado de empresas a conciliar?`)) {
      setEntities((prev) => prev.filter((item) => item.id !== id));
    }
  };

  // Bulk handlers
  const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFileName(file.name);
    try {
      const res = await parseBulkEntitiesFile(file, defaultCountry, defaultCurrency);
      setBulkResult(res);
    } catch (err: any) {
      setBulkResult({
        entities: [],
        warnings: [],
        errors: [err?.message || 'Error al procesar archivo'],
      });
    }
  };

  const handleParseBulkPaste = () => {
    const res = parseBulkEntitiesText(bulkPasteText, defaultCountry, defaultCurrency);
    setBulkResult(res);
  };

  const handleApplyBulk = () => {
    if (!bulkResult || bulkResult.entities.length === 0) return;

    const timestamp = Date.now();
    const incomingMapped: EntityMapping[] = bulkResult.entities.map((item, idx) => ({
      id: `ent-bulk-${timestamp}-${idx}`,
      alias: item.nombreOficial,
      nombreOficial: item.nombreOficial,
      nit: item.nit,
      email: item.email,
      codigoSociedad: item.codigoSociedad || `EMP-${(idx + 1) * 100}`,
      pais: item.pais || defaultCountry,
      moneda: item.moneda || defaultCurrency,
    }));

    if (bulkMode === 'replace') {
      // Preserve exact uploaded/pasted order #1, #2, #3...
      setEntities(incomingMapped);
      setBulkSuccessMsg(
        `Se cargaron ${incomingMapped.length} sociedades respetando exactamente el orden del archivo.`
      );
    } else {
      setEntities((prev) => {
        const updated = [...prev];
        const byNameIdx = new Map<string, number>();
        const byNitIdx = new Map<string, number>();
        updated.forEach((e, idx) => {
          byNameIdx.set(e.nombreOficial.trim().toLowerCase(), idx);
          const n = e.nit ? normalizeNit(e.nit) : '';
          if (n) byNitIdx.set(n, idx);
        });

        incomingMapped.forEach((inc) => {
          const nNit = inc.nit ? normalizeNit(inc.nit) : '';
          const matchByNit = nNit ? byNitIdx.get(nNit) : undefined;
          const matchByName = byNameIdx.get(inc.nombreOficial.trim().toLowerCase());
          const existingIdx = matchByNit !== undefined ? matchByNit : matchByName;

          if (existingIdx !== undefined) {
            updated[existingIdx] = {
              ...updated[existingIdx],
              nombreOficial: inc.nombreOficial,
              alias: inc.nombreOficial,
              nit: inc.nit || updated[existingIdx].nit,
              email: inc.email || updated[existingIdx].email,
              codigoSociedad: inc.codigoSociedad || updated[existingIdx].codigoSociedad,
              pais: inc.pais || updated[existingIdx].pais,
              moneda: inc.moneda || updated[existingIdx].moneda,
            };
          } else {
            updated.push(inc);
          }
        });
        return updated;
      });
      setBulkSuccessMsg(
        `Se agregaron/actualizaron ${incomingMapped.length} sociedades manteniendo el orden.`
      );
    }

    setShowBulkModal(false);
    setBulkResult(null);
    setBulkFileName(null);
    setBulkPasteText('');
  };

  const missingNitCount = useMemo(
    () => entities.filter((e) => !e.nit || !e.nit.trim()).length,
    [entities]
  );

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-lg font-bold text-slate-900">
              Empresas a Conciliar — {scopeLabel}
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-200">
              {entities.length} en la matriz
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!isDirectoryLocked && (
            <>
              <button
                type="button"
                onClick={() => downloadEntitiesTemplate(defaultCountry, defaultCurrency)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Plantilla Sociedades</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setBulkResult(null);
                  setBulkFileName(null);
                  setBulkSuccessMsg(null);
                  setShowBulkModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Carga Masiva</span>
              </button>
            </>
          )}

          {onGoToConciliacion && (
            <button
              type="button"
              onClick={onGoToConciliacion}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Grid3X3 className="w-4 h-4 text-blue-300" />
              <span>Ver Matriz ({entities.length} x {entities.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Independent Company Directory Cloud Sync Strip */}
      {isDirectoryLocked ? (
        <div className="px-4 py-3 rounded-2xl border border-slate-200 bg-white text-slate-600 text-xs flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#1E60A8] shrink-0" />
          <span>
            <strong className="font-semibold text-slate-800">Directorio maestro en modo consulta:</strong>{' '}
            {readOnly
              ? 'Tu perfil Solo Consulta permite revisar las sociedades autorizadas sin modificar el catálogo.'
              : 'La edición del catálogo maestro de sociedades está reservada al perfil Administrador.'}
          </span>
        </div>
      ) : (
        <div
          className={`px-4 py-3 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            directorySync?.status === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : directorySync?.status === 'pending'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
          }`}
        >
          <div className="flex items-start gap-2.5 min-w-0">
            {directorySync?.status === 'saving' ? (
              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0 mt-0.5" />
            ) : directorySync?.status === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            ) : directorySync?.status === 'pending' ? (
              <Cloud className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <div className="font-bold">
                {directorySync?.status === 'saving'
                  ? 'Guardando cambios en la nube...'
                  : directorySync?.status === 'error'
                  ? 'Error al guardar el directorio en la nube'
                  : directorySync?.status === 'pending'
                  ? 'Cambios locales pendientes por sincronizar'
                  : directorySync?.status === 'saved'
                  ? 'Directorio sincronizado en la nube'
                  : 'Directorio de empresas'}
              </div>
              {directorySync?.status === 'error' && directorySync.errorMsg ? (
                <p className="text-[11px] opacity-85 mt-0.5">{directorySync.errorMsg}</p>
              ) : directorySync?.status === 'saved' && directorySync.lastSyncedAtIso ? (
                <p className="text-[11px] opacity-85 mt-0.5">
                  Último guardado:{' '}
                  {new Date(directorySync.lastSyncedAtIso).toLocaleString('es-CO', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  {directorySync.updatedByName ? ` por ${directorySync.updatedByName}` : ''}.
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!currentUser ? (
              onSignInWithGoogle && (
                <button
                  type="button"
                  onClick={onSignInWithGoogle}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Conectar Google para Guardar</span>
                </button>
              )
            ) : (
              onSaveDirectoryToCloud && (
                <button
                  type="button"
                  disabled={directorySync?.status === 'saving'}
                  onClick={() => void onSaveDirectoryToCloud()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {directorySync?.status === 'saving' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Cloud className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {directorySync?.status === 'saving'
                      ? 'Guardando...'
                      : 'Guardar Empresas en la Nube'}
                  </span>
                </button>
              )
            )}
          </div>
        </div>
      )}

      {bulkSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{bulkSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setBulkSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {entities.length > 0 && missingNitCount > 0 && (
        <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-900 text-xs flex items-start gap-2.5">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <span>
            Hay <strong>{missingNitCount}</strong> sociedad(es) sin <strong>NIT</strong> registrado. Puedes editarlo aquí o usar <strong>Carga Masiva</strong> para que al importar movimientos el sistema identifique cada sociedad automáticamente por su NIT.
          </span>
        </div>
      )}

      {/* Missing companies detected in current movements */}
      {!isDirectoryLocked && missingInMovements.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-3 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm text-amber-900">
                  Se detectaron {missingInMovements.length} empresa(s) o NIT en tus movimientos que no están en la matriz
                </div>
                <p className="text-amber-800 mt-0.5">
                  Agrégalas a "Empresas a Conciliar" para que sus saldos aparezcan reflejados en las matrices bilaterales.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleQuickAddMissing(missingInMovements)}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shrink-0 transition-colors shadow-xs cursor-pointer"
            >
              + Agregar todas ({missingInMovements.length})
            </button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {missingInMovements.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => handleQuickAddMissing([name])}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-amber-300 hover:border-amber-500 hover:bg-amber-100/70 text-amber-950 font-semibold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-amber-600" />
                <span>{name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual Add Company Form */}
      {!isDirectoryLocked && (
      <form
        onSubmit={handleAddCompany}
        className="bg-white p-5 rounded-2xl border border-blue-200/90 shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <span>Agregar Sociedad Manualmente</span>
          </h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-3">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Nombre de la Sociedad *
            </label>
            <input
              type="text"
              required
              value={newNombre}
              onChange={(e) => {
                setNewNombre(e.target.value);
                if (addError) setAddError(null);
              }}
              placeholder="Ej. Premex Colombia SAS"
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              NIT / ID Fiscal
            </label>
            <input
              type="text"
              value={newNit}
              onChange={(e) => {
                setNewNit(e.target.value);
                if (addError) setAddError(null);
              }}
              placeholder="900123456-1"
              className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="lg:col-span-3">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Correo Encargado
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="contabilidad@empresa.com"
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="lg:col-span-1">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Código
            </label>
            <input
              type="text"
              value={newCodigo}
              onChange={(e) => setNewCodigo(e.target.value)}
              placeholder={`EMP-${(entities.length + 1) * 100}`}
              className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="lg:col-span-1">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              País
            </label>
            <input
              type="text"
              value={newPais}
              onChange={(e) => setNewPais(e.target.value)}
              placeholder={defaultCountry}
              className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="lg:col-span-1">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Moneda
            </label>
            <input
              type="text"
              value={newMoneda}
              onChange={(e) => setNewMoneda(e.target.value)}
              placeholder={defaultCurrency}
              className="w-full px-2 py-2 text-xs bg-white border border-slate-300 rounded-xl uppercase focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="lg:col-span-1">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="lg:hidden xl:inline">Agregar</span>
            </button>
          </div>
        </div>

        {addError && (
          <div className="text-xs text-rose-600 font-medium flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{addError}</span>
          </div>
        )}
      </form>
      )}

      {/* Search & Ordered Matrix Companies Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, NIT, correo, código o país..."
              className="w-full pl-9 pr-4 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>
              Mostrando <strong>{filteredEntities.length}</strong> de {entities.length} empresas
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3 w-24">Orden Matriz</th>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">NIT</th>
                <th className="px-4 py-3">Correo Encargado</th>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">País</th>
                <th className="px-4 py-3">Moneda</th>
                {!isDirectoryLocked && <th className="px-4 py-3 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEntities.length === 0 ? (
                <tr>
                  <td colSpan={isDirectoryLocked ? 7 : 8} className="py-10 text-center text-slate-400">
                    {entities.length === 0
                      ? isDirectoryLocked
                        ? 'No hay sociedades asignadas visibles para tu usuario.'
                        : 'No hay sociedades registradas. Usa "Carga Masiva" o agrega una empresa arriba para alimentar la matriz.'
                      : 'No se encontraron empresas con ese criterio de búsqueda.'}
                  </td>
                </tr>
              ) : (
                filteredEntities.map((ent) => {
                  const realIndex = entities.findIndex((item) => item.id === ent.id);
                  const isItemEditing = !isDirectoryLocked && editingId === ent.id;
                  const canReorder = !isDirectoryLocked && !searchTerm.trim();

                  if (isItemEditing) {
                    return (
                      <tr key={ent.id} className="bg-blue-50/40">
                        <td className="px-4 py-3 font-mono font-bold text-slate-500">
                          #{realIndex + 1}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editNombre}
                            onChange={(e) => setEditNombre(e.target.value)}
                            className="w-full px-2.5 py-1 text-xs border border-blue-300 rounded-md bg-white"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editNit}
                            onChange={(e) => setEditNit(e.target.value)}
                            placeholder="900123456-1"
                            className="w-32 px-2 py-1 text-xs font-mono border border-blue-300 rounded-md bg-white"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            placeholder="encargado@empresa.com"
                            className="w-44 px-2 py-1 text-xs border border-blue-300 rounded-md bg-white"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editCodigo}
                            onChange={(e) => setEditCodigo(e.target.value)}
                            className="w-24 px-2 py-1 text-xs border border-blue-300 rounded-md bg-white"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editPais}
                            onChange={(e) => setEditPais(e.target.value)}
                            className="w-24 px-2 py-1 text-xs border border-blue-300 rounded-md bg-white"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editMoneda}
                            onChange={(e) => setEditMoneda(e.target.value)}
                            className="w-16 px-2 py-1 text-xs border border-blue-300 rounded-md bg-white uppercase"
                          />
                        </td>
                        <td className="px-4 py-3 text-right space-x-1">
                          <button
                            type="button"
                            onClick={(e) => handleSaveEdit(e, ent.id)}
                            className="px-2.5 py-1 bg-emerald-600 text-white rounded-md text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-2 py-1 bg-slate-200 text-slate-700 rounded-md text-xs hover:bg-slate-300 cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={ent.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="w-6 text-center font-mono font-bold text-blue-900 bg-blue-50 border border-blue-200/70 rounded px-1 py-0.5 text-[11px]">
                            {realIndex + 1}
                          </span>
                          {canReorder && (
                            <div className="flex items-center">
                              <button
                                type="button"
                                disabled={realIndex === 0}
                                onClick={() => handleMove(realIndex, -1)}
                                title="Subir posición en la matriz"
                                className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30 rounded hover:bg-blue-50 cursor-pointer"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={realIndex === entities.length - 1}
                                onClick={() => handleMove(realIndex, 1)}
                                title="Bajar posición en la matriz"
                                className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30 rounded hover:bg-blue-50 cursor-pointer"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">
                        {ent.nombreOficial}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {ent.nit && ent.nit.trim() ? (
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200/80 font-semibold text-[11px]">
                            {ent.nit}
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-700 italic">Sin NIT</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {ent.email && ent.email.trim() ? (
                          <span className="text-slate-700 font-medium text-[11px]">{ent.email}</span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Sin correo</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-600">
                        {ent.codigoSociedad}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {ent.pais || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 font-mono text-[11px] font-semibold text-slate-700">
                          {ent.moneda}
                        </span>
                      </td>
                      {!isDirectoryLocked && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(ent)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="Editar empresa y NIT"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(ent.id, ent.nombreOficial)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Quitar de la matriz"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* BULK ENTITIES UPLOAD MODAL */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-gradient-to-r from-[#0a2540] via-[#0f3460] to-[#1a365d] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
                  <UploadCloud className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <h4 className="font-bold text-base">
                    Carga Masiva de Sociedades ({scopeLabel})
                  </h4>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="p-1.5 text-blue-200 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* Mode selector + Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div className="p-1 bg-slate-100 rounded-xl inline-flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setBulkTab('excel');
                      setBulkResult(null);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                      bulkTab === 'excel'
                        ? 'bg-white text-blue-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Subir Excel (.xlsx / .xls)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkTab('paste');
                      setBulkResult(null);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                      bulkTab === 'paste'
                        ? 'bg-white text-blue-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    <span>Pegar desde Excel</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => downloadEntitiesTemplate(defaultCountry, defaultCurrency)}
                  className="inline-flex items-center gap-1.5 text-blue-700 hover:underline font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar Plantilla Sociedades</span>
                </button>
              </div>

              {bulkTab === 'excel' ? (
                <div className="space-y-3">
                  <div
                    onClick={() => bulkFileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-6 text-center cursor-pointer bg-slate-50/70 hover:bg-emerald-50/40 transition-colors"
                  >
                    <input
                      ref={bulkFileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleBulkFileChange}
                      className="hidden"
                    />
                    <FileSpreadsheet className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                    <div className="font-bold text-slate-800 text-sm">
                      {bulkFileName
                        ? `Archivo cargado: ${bulkFileName}`
                        : 'Haz clic para seleccionar tu archivo Excel de Sociedades'}
                    </div>
                    <p className="text-slate-500 mt-1">
                      Columnas admitidas: <code className="bg-slate-200/80 px-1 rounded">nombre</code>,{' '}
                      <code className="bg-slate-200/80 px-1 rounded">nit</code> (y opcionales{' '}
                      <code className="bg-slate-200/80 px-1 rounded">correo</code>,{' '}
                      <code className="bg-slate-200/80 px-1 rounded">codigo</code>,{' '}
                      <code className="bg-slate-200/80 px-1 rounded">pais</code>,{' '}
                      <code className="bg-slate-200/80 px-1 rounded">moneda</code>). Se respetará el orden exacto de las filas.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-slate-600">
                    Copia las columnas directamente desde Excel (en el orden que deseas para la matriz) y pégalas abajo. Formato por fila:{' '}
                    <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                      Nombre [TAB] NIT [TAB] Código (opc.) [TAB] País (opc.) [TAB] Moneda (opc.) [TAB] Correo (opc.)
                    </code>
                  </p>
                  <textarea
                    rows={6}
                    value={bulkPasteText}
                    onChange={(e) => setBulkPasteText(e.target.value)}
                    placeholder={`Premex Colombia SAS\t900123456-1\tSOC-100\tColombia\tCOP\tcontabilidad@premex.com\nAdiquim S.A.\t800987654-2\tSOC-200\tColombia\tCOP\tcartera@adiquim.com`}
                    className="w-full p-3 font-mono text-xs border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleParseBulkPaste}
                      className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg cursor-pointer"
                    >
                      Validar y Previsualizar
                    </button>
                  </div>
                </div>
              )}

              {/* Import Mode Selection */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-4">
                <span className="font-bold text-slate-700">Modo de aplicación:</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="bulkMode"
                    checked={bulkMode === 'replace'}
                    onChange={() => setBulkMode('replace')}
                  />
                  <span>
                    <strong>Reemplazar listado</strong> (conserva el orden del archivo)
                  </span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="bulkMode"
                    checked={bulkMode === 'append'}
                    onChange={() => setBulkMode('append')}
                  />
                  <span>Agregar al final / actualizar NIT existentes</span>
                </label>
              </div>

              {/* Errors & Warnings */}
              {bulkResult && bulkResult.errors.length > 0 && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 space-y-1">
                  {bulkResult.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              )}

              {bulkResult && bulkResult.warnings.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-0.5 max-h-24 overflow-y-auto">
                  <div className="font-bold">Advertencias ({bulkResult.warnings.length}):</div>
                  {bulkResult.warnings.map((w, i) => (
                    <div key={i}>• {w}</div>
                  ))}
                </div>
              )}

              {/* Numbered Preview Table */}
              {bulkResult && bulkResult.entities.length > 0 && (
                <div className="space-y-2">
                  <div className="font-bold text-slate-800 flex items-center justify-between">
                    <span>
                      Vista previa en orden exacto ({bulkResult.entities.length} sociedades):
                    </span>
                    <span className="text-emerald-700 font-semibold">
                      Listas para cargar
                    </span>
                  </div>
                  <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 w-16">Orden</th>
                          <th className="px-3 py-2">Sociedad</th>
                          <th className="px-3 py-2">NIT</th>
                          <th className="px-3 py-2">Correo</th>
                          <th className="px-3 py-2">Código</th>
                          <th className="px-3 py-2">País</th>
                          <th className="px-3 py-2">Moneda</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bulkResult.entities.map((ent, idx) => (
                          <tr key={`${ent.nombreOficial}-${idx}`} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono font-bold text-blue-800">
                              #{idx + 1}
                            </td>
                            <td className="px-3 py-2 font-semibold text-slate-900">
                              {ent.nombreOficial}
                            </td>
                            <td className="px-3 py-2 font-mono text-blue-900">
                              {ent.nit || <span className="text-amber-600 italic">Sin NIT</span>}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {ent.email || <span className="text-slate-400 italic">—</span>}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-600">
                              {ent.codigoSociedad}
                            </td>
                            <td className="px-3 py-2 text-slate-600">{ent.pais}</td>
                            <td className="px-3 py-2 font-mono text-slate-700">{ent.moneda}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!bulkResult || bulkResult.entities.length === 0}
                onClick={handleApplyBulk}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-xs cursor-pointer"
              >
                Aplicar {bulkResult?.entities.length || 0} Sociedades
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
