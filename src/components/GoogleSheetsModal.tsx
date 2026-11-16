import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  X, 
  ExternalLink, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  HelpCircle,
  Copy,
  Check
} from 'lucide-react';
import { User } from 'firebase/auth';
import { Movement, DifferenceRow, MatrixResult, ReconciliationScope } from '../types';
import { exportDataToSheets } from '../services/googleSheets';
import { getAccessToken } from '../services/auth';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onSignInWithGoogle: () => Promise<void>;
  differences: DifferenceRow[];
  matrizCxc: MatrixResult;
  matrizCxp: MatrixResult;
  movements: Movement[];
  orderedEntities: string[];
  selectedMonth?: string;
  activeScope?: ReconciliationScope;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSignInWithGoogle,
  differences,
  matrizCxc,
  matrizCxp,
  movements,
  orderedEntities,
  selectedMonth = 'Septiembre 2026',
  activeScope = 'internacionales',
}) => {
  const today = new Date().toISOString().split('T')[0];
  const scopeLabel = 'Anitox';
  const periodSuffix = selectedMonth === 'ALL' ? 'Consolidado' : selectedMonth;
  const [sheetTitle, setSheetTitle] = useState(`Centro Interempresarial (${scopeLabel}) - ${periodSuffix} (${today})`);
  const [useExisting, setUseExisting] = useState(false);
  const [existingIdOrUrl, setExistingIdOrUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSheetTitle(`Centro Interempresarial (${scopeLabel}) - ${periodSuffix} (${today})`);
  }, [scopeLabel, periodSuffix, today]);

  if (!isOpen) return null;

  const activePeriodLabel =
    selectedMonth === 'ALL'
      ? `CONSOLIDADO HISTÓRICO (${scopeLabel.toUpperCase()})`
      : `${selectedMonth.toUpperCase()} (${scopeLabel.toUpperCase()})`;

  // Extract ID if user pasted full URL
  const extractSpreadsheetId = (input: string): string => {
    const trimmed = input.trim();
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : trimmed;
  };

  const handleExport = async () => {
    setError(null);
    setSuccessResult(null);

    const activeToken = await getAccessToken();
    if (!currentUser || !activeToken) {
      try {
        await onSignInWithGoogle();
        const tokenAfterAuth = await getAccessToken();
        if (!tokenAfterAuth) {
          return;
        }
      } catch (err: any) {
        setError('Debes iniciar sesión con Google para guardar en Google Sheets.');
        return;
      }
    }

    setLoading(true);

    try {
      const cleanId = useExisting ? extractSpreadsheetId(existingIdOrUrl) : undefined;
      const result = await exportDataToSheets({
        spreadsheetTitle: sheetTitle,
        existingSpreadsheetId: cleanId,
        differences,
        matrizCxc,
        matrizCxp,
        movements,
        orderedEntities,
        periodLabel: activePeriodLabel,
      });

      setSuccessResult(result);
    } catch (err: any) {
      console.error('Error al exportar a Google Sheets:', err);
      setError(err?.message || 'Ocurrió un error inesperado al guardar en Google Sheets.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (successResult?.url) {
      navigator.clipboard.writeText(successResult.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">
                Guardar en Google Sheets
              </h3>
              <p className="text-xs text-blue-200">
                Sincronización en la nube con Google Workspace
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-blue-200 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* User Confirmation & Scope Transparency */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-2">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5 text-sm">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>Confirmación de Exportación de Datos</span>
            </div>
            <p>
              Con tu confirmación, Centro Interempresarial creará o actualizará un libro en tu cuenta de Google Drive con las siguientes 5 pestañas:
            </p>
            <ul className="list-disc pl-5 space-y-1 font-medium text-slate-700">
              <li>
                <span className="font-semibold text-blue-900">Matrices Bilaterales:</span> Formato idéntico al reporte oficial con CTAS X COBRAR y CTAS X PAGAR apiladas y el listado de {orderedEntities.length} empresas a conciliar.
              </li>
              <li>
                <span className="font-semibold text-blue-900">Diferencias Conciliacion:</span> {differences.length} pares intercompany con fórmula (CxC - CxP) y comentarios editados.
              </li>
              <li>
                <span className="font-semibold text-blue-900">Matriz CxC:</span> Matriz de Cuentas por Cobrar con totales por fila y columna.
              </li>
              <li>
                <span className="font-semibold text-blue-900">Matriz CxP:</span> Matriz de Cuentas por Pagar con totales por fila y columna.
              </li>
              <li>
                <span className="font-semibold text-blue-900">Movimientos Detallados:</span> Listado completo de {movements.length} transacciones individuales.
              </li>
            </ul>
          </div>

          {/* User Authentication Status */}
          {!currentUser ? (
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-blue-900">
                  Requiere inicio de sesión con Google
                </p>
                <p className="text-[11px] text-blue-700">
                  Para guardar el archivo en tu Google Drive personal o corporativo.
                </p>
              </div>
              <button
                type="button"
                onClick={onSignInWithGoogle}
                className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg shadow-2xs flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Acceder con Google</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-100 px-3 py-2 rounded-lg">
              <span className="font-medium text-slate-700">Sesión actual:</span>
              <span className="font-semibold text-blue-900">{currentUser.email}</span>
            </div>
          )}

          {/* Target File Options */}
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                <input
                  type="radio"
                  name="exportMode"
                  checked={!useExisting}
                  onChange={() => setUseExisting(false)}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>Crear una hoja de cálculo nueva</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                <input
                  type="radio"
                  name="exportMode"
                  checked={useExisting}
                  onChange={() => setUseExisting(true)}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>Actualizar una hoja existente</span>
              </label>
            </div>

            {!useExisting ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Título del documento en Google Sheets
                </label>
                <input
                  type="text"
                  value={sheetTitle}
                  onChange={(e) => setSheetTitle(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej. Centro Interempresarial - Conciliación Q1"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ID o Enlace completo de Google Sheets existente
                </label>
                <input
                  type="text"
                  value={existingIdOrUrl}
                  onChange={(e) => setExistingIdOrUrl(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Pega el ID o la URL completa de una hoja que ya tengas abierta en Google Drive.
                </p>
              </div>
            )}
          </div>

          {/* Feedback & Result Message */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">No se pudo completar la operación:</div>
                <div className="text-rose-700 mt-0.5">{error}</div>
              </div>
            </div>
          )}

          {successResult && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-3">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <span>¡Datos guardados con éxito en Google Sheets!</span>
              </div>
              <p className="text-slate-600">
                Tu conciliación, matrices y diferencias se han volcado satisfactoriamente en Google Drive.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  href={successResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs shadow-xs transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir hoja en Google Sheets</span>
                </a>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-medium rounded-lg text-xs transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? '¡Copiado!' : 'Copiar enlace'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cerrar
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={handleExport}
            className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-sm flex items-center gap-2 transition-all cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Guardando en Google Sheets...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                <span>Confirmar y Guardar en Google Sheets</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
