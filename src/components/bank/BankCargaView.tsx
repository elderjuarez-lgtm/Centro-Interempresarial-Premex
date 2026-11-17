import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { BankAccount, BankStatementItem, BookLedgerItem } from '../../types';
import {
  downloadBankExcelTemplate,
  parseBankExcelFile,
  ParsedBankImportResult,
} from '../../utils/bankExcel';
import { formatBankMoney } from '../../utils/bankReconciliation';

interface BankCargaViewProps {
  selectedAccount: BankAccount | null;
  selectedMonth: string;
  onConfirmImport: (payload: {
    statementItems: BankStatementItem[];
    ledgerItems: BookLedgerItem[];
    mode: 'replace' | 'append';
  }) => void;
  isReadOnly?: boolean;
}

export const BankCargaView: React.FC<BankCargaViewProps> = ({
  selectedAccount,
  selectedMonth,
  onConfirmImport,
  isReadOnly = false,
}) => {
  const [importTarget, setImportTarget] = useState<'auto' | 'extracto' | 'libros'>('auto');
  const [importMonth, setImportMonth] = useState(
    selectedMonth === 'ALL' ? 'Septiembre 2026' : selectedMonth
  );
  const [preview, setPreview] = useState<ParsedBankImportResult | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currency = selectedAccount?.moneda || 'USD';

  if (isReadOnly) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-10 text-center max-w-2xl mx-auto">
        <Lock className="w-9 h-9 text-amber-600 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-900">
          Carga de archivos restringida (Solo Consulta)
        </h3>
        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
          Tu perfil tiene permisos únicamente de consulta y exportación. La importación de
          extractos bancarios y auxiliares contables está habilitada para los roles Operador y
          Administrador.
        </p>
      </div>
    );
  }

  const handleFileChange = async (file: File | undefined) => {
    if (!file || !selectedAccount) return;
    setParseError(null);
    setFileName(file.name);
    try {
      const result = await parseBankExcelFile(
        file,
        selectedAccount.id,
        importMonth.trim() || 'Septiembre 2026',
        importTarget
      );
      if (result.statementItems.length === 0 && result.ledgerItems.length === 0) {
        setParseError(
          'No se detectaron filas válidas con valores numéricos. Verifica las columnas (Fecha, Referencia/Comprobante, Descripción, Tipo o Débito/Crédito, Valor).'
        );
        setPreview(null);
        return;
      }
      setPreview(result);
    } catch (err: any) {
      setParseError(err?.message || 'Error leyendo el archivo Excel/CSV.');
      setPreview(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Template Download */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Carga de Extracto Bancario y Auxiliar Contable
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Cuenta destino:{' '}
            <strong className="text-slate-800">
              {selectedAccount
                ? `${selectedAccount.banco} · ${selectedAccount.numeroCuenta} (${selectedAccount.moneda})`
                : 'Sin cuenta'}
            </strong>
          </p>
        </div>

        <button
          type="button"
          onClick={() => downloadBankExcelTemplate(selectedAccount)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#19377B] bg-[#1E60A8]/10 hover:bg-[#1E60A8]/15 rounded-xl transition-colors cursor-pointer shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Descargar Plantilla Excel (2 Hojas)</span>
        </button>
      </div>

      {/* Upload Options & Drop Zone */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Tipo de Archivo a Importar
            </label>
            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200/70 w-full">
              {(
                [
                  { id: 'auto', label: 'Libro 2 Hojas (Auto)' },
                  { id: 'extracto', label: 'Solo Extracto' },
                  { id: 'libros', label: 'Solo Libros' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setImportTarget(opt.id)}
                  className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    importTarget === opt.id
                      ? 'bg-white text-[#19377B] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Mes / Periodo por Defecto
            </label>
            <input
              type="text"
              value={importMonth}
              onChange={(e) => setImportMonth(e.target.value)}
              placeholder="Ej. Septiembre 2026"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-[#1E60A8]"
            />
          </div>
        </div>

        {/* File Drop Zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            void handleFileChange(f);
          }}
          className="border-2 border-dashed border-slate-300 hover:border-[#1E60A8] rounded-2xl p-8 text-center bg-slate-50/70 hover:bg-[#1E60A8]/4 transition-colors cursor-pointer"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              void handleFileChange(f);
              e.target.value = '';
            }}
          />
          <UploadCloud className="w-10 h-10 text-[#1E60A8] mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-800">
            Haz clic o arrastra tu archivo Excel (.xlsx, .xls) o CSV aquí
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Acepta hojas llamadas &ldquo;Extracto Bancario&rdquo; y &ldquo;Auxiliar Contable&rdquo; o archivos individuales con columnas Débito / Crédito o Tipo / Valor.
          </p>
        </div>

        {parseError && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{parseError}</span>
          </div>
        )}

        {/* Preview & Confirmation */}
        {preview && (
          <div className="border-t border-slate-200 pt-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-sm font-bold text-slate-900">{fileName}</div>
                  <div className="text-xs text-slate-600 tabular-nums">
                    {preview.statementItems.length} movimientos de Extracto ·{' '}
                    {preview.ledgerItems.length} registros de Auxiliar Contable
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onConfirmImport({
                      statementItems: preview.statementItems,
                      ledgerItems: preview.ledgerItems,
                      mode: 'append',
                    });
                    setPreview(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#19377B] bg-[#1E60A8]/10 hover:bg-[#1E60A8]/15 rounded-xl cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Agregar a registros actuales</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onConfirmImport({
                      statementItems: preview.statementItems,
                      ledgerItems: preview.ledgerItems,
                      mode: 'replace',
                    });
                    setPreview(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl cursor-pointer"
                >
                  <span>Reemplazar cuenta y abrir Cruce</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {preview.warnings.length > 0 && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                {preview.warnings.join(' ')}
              </div>
            )}

            {/* Quick sample rows preview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {preview.statementItems.length > 0 && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-[#132B63]">
                    Vista previa Extracto ({preview.statementItems.length})
                  </div>
                  <div className="divide-y divide-slate-100 text-xs">
                    {preview.statementItems.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="px-3.5 py-2 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-semibold text-slate-800 mr-2">
                            {item.referencia}
                          </span>
                          <span className="text-slate-600 truncate">{item.descripcion}</span>
                        </div>
                        <span className="font-mono font-bold tabular-nums shrink-0">
                          {formatBankMoney(
                            item.tipo === 'CREDITO' ? item.valor : -item.valor,
                            currency,
                            true
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.ledgerItems.length > 0 && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-teal-900">
                    Vista previa Auxiliar Contable ({preview.ledgerItems.length})
                  </div>
                  <div className="divide-y divide-slate-100 text-xs">
                    {preview.ledgerItems.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="px-3.5 py-2 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-semibold text-slate-800 mr-2">
                            {item.comprobante}
                          </span>
                          <span className="text-slate-600 truncate">{item.tercero}</span>
                        </div>
                        <span className="font-mono font-bold tabular-nums shrink-0">
                          {formatBankMoney(
                            item.tipo === 'DEBITO' ? item.valor : -item.valor,
                            currency,
                            true
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
