import React, { useState } from 'react';
import {
  Download,
  Smartphone,
  Share,
  PlusSquare,
  MoreVertical,
  X,
  CheckCircle2,
  WifiOff,
  ArrowDownToLine,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface PWAInstallButtonProps {
  variant?: 'header' | 'banner' | 'sidebar';
  onDismissBanner?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  onDismissBanner,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [activeOsTab, setActiveOsTab] = useState<'android' | 'ios'>(() =>
    isIOS ? 'ios' : 'android'
  );
  const [isInstallingNative, setIsInstallingNative] = useState(false);

  if (isInstalled) return null;

  const handlePrimaryAction = async () => {
    if (isInstallable && !isIOS) {
      setIsInstallingNative(true);
      const accepted = await install();
      setIsInstallingNative(false);
      if (!accepted) {
        setActiveOsTab(isIOS ? 'ios' : 'android');
        setShowGuideModal(true);
      }
      return;
    }
    setActiveOsTab(isIOS ? 'ios' : 'android');
    setShowGuideModal(true);
  };

  const triggerElement = (() => {
    if (variant === 'banner') {
      return (
        <div className="mb-5 rounded-2xl bg-white border border-[#1E60A8]/25 shadow-xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/apple-touch-icon.png"
              alt="Premex App"
              className="w-11 h-11 rounded-xl border border-slate-200 shrink-0 shadow-2xs"
            />
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#132B63] leading-snug">
                Instala Premex en tu teléfono
              </div>
              <p className="text-xs text-slate-600 mt-0.5 leading-snug">
                {isIOS
                  ? 'Agrégala en tu iPhone o iPad desde Safari para abrirla en pantalla completa.'
                  : 'Instálala en Android o iPhone para un acceso más rápido, táctil y en pantalla completa.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={isInstallingNative}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl transition-colors cursor-pointer disabled:opacity-60"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>
                {isInstallable && !isIOS
                  ? 'Instalar App'
                  : isIOS
                  ? 'Cómo instalar en iPhone'
                  : 'Instalar en Teléfono'}
              </span>
            </button>
            {onDismissBanner && (
              <button
                type="button"
                onClick={onDismissBanner}
                aria-label="Ocultar aviso de instalación"
                className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      );
    }

    if (variant === 'sidebar') {
      return (
        <button
          type="button"
          onClick={handlePrimaryAction}
          disabled={isInstallingNative}
          className="w-full flex items-center justify-center gap-2 min-h-[44px] px-3 py-2.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-300/30 text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-60"
        >
          <Smartphone className="w-4 h-4 text-sky-200 shrink-0" />
          <span>{isIOS ? 'Instalar en iPhone' : 'Instalar App Móvil'}</span>
        </button>
      );
    }

    // Header variant
    return (
      <button
        type="button"
        onClick={handlePrimaryAction}
        disabled={isInstallingNative}
        title="Instalar Premex en Android o iPhone"
        className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-semibold text-[#132B63] bg-sky-50 hover:bg-sky-100 border border-[#1E60A8]/25 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
      >
        <Smartphone className="w-4 h-4 text-[#1E60A8] shrink-0" />
        <span className="hidden sm:inline">Instalar App</span>
        <span className="sm:hidden">Instalar</span>
      </button>
    );
  })();

  return (
    <>
      {triggerElement}

      {showGuideModal && (
        <div
          className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 bg-[#132B63] text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src="/apple-touch-icon.png"
                  alt="Premex"
                  className="w-10 h-10 rounded-xl bg-white p-0.5 shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">
                    Instalar Premex en tu Teléfono
                  </h3>
                  <p className="text-[11px] text-sky-200 truncate">
                    Acceso directo · Pantalla completa · Android y iPhone
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Cerrar guía de instalación"
                className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-sky-200 hover:text-white hover:bg-white/10 rounded-xl cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* OS Tabs */}
            <div className="px-5 pt-4">
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveOsTab('android')}
                  className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    activeOsTab === 'android'
                      ? 'bg-white text-[#132B63] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Android (Chrome)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveOsTab('ios')}
                  className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    activeOsTab === 'ios'
                      ? 'bg-white text-[#132B63] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  iPhone / iPad (Safari)
                </button>
              </div>
            </div>

            {/* Guide Steps */}
            <div className="p-5 overflow-y-auto space-y-4">
              {activeOsTab === 'android' ? (
                <>
                  {isInstallable && (
                    <button
                      type="button"
                      onClick={async () => {
                        setIsInstallingNative(true);
                        const ok = await install();
                        setIsInstallingNative(false);
                        if (ok) setShowGuideModal(false);
                      }}
                      disabled={isInstallingNative}
                      className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#1E60A8] hover:bg-[#132B63] text-white text-sm font-bold transition-colors cursor-pointer"
                    >
                      <ArrowDownToLine className="w-4 h-4" />
                      <span>Instalar Aplicación Ahora</span>
                    </button>
                  )}

                  <ol className="space-y-3 text-xs text-slate-700">
                    <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="w-6 h-6 rounded-full bg-[#132B63] text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                        1
                      </span>
                      <div className="leading-relaxed">
                        Abre esta dirección en <strong>Google Chrome</strong> en tu teléfono Android.
                      </div>
                    </li>
                    <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="w-6 h-6 rounded-full bg-[#132B63] text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                        2
                      </span>
                      <div className="leading-relaxed">
                        Toca el botón de menú{' '}
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-white border border-slate-300 font-bold text-slate-800 align-middle">
                          <MoreVertical className="w-3.5 h-3.5" />
                        </span>{' '}
                        en la esquina superior derecha del navegador.
                      </div>
                    </li>
                    <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="w-6 h-6 rounded-full bg-[#132B63] text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                        3
                      </span>
                      <div className="leading-relaxed">
                        Selecciona <strong>&ldquo;Instalar aplicación&rdquo;</strong> o{' '}
                        <strong>&ldquo;Agregar a la pantalla principal&rdquo;</strong> y confirma en{' '}
                        <strong>Instalar</strong>.
                      </div>
                    </li>
                  </ol>
                  {isAndroid && !isInstallable && (
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Si abriste el enlace dentro de WhatsApp o Gmail, toca <strong>&ldquo;Abrir en Chrome&rdquo;</strong> primero para habilitar la instalación directa.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <ol className="space-y-3 text-xs text-slate-700">
                    <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="w-6 h-6 rounded-full bg-[#132B63] text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                        1
                      </span>
                      <div className="leading-relaxed">
                        Abre esta aplicación en el navegador <strong>Safari</strong> de tu iPhone o iPad.
                      </div>
                    </li>
                    <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="w-6 h-6 rounded-full bg-[#132B63] text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                        2
                      </span>
                      <div className="leading-relaxed">
                        Toca el botón <strong>Compartir</strong>{' '}
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-white border border-slate-300 text-[#1E60A8] align-middle">
                          <Share className="w-3.5 h-3.5" />
                        </span>{' '}
                        en la barra inferior de Safari.
                      </div>
                    </li>
                    <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="w-6 h-6 rounded-full bg-[#132B63] text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                        3
                      </span>
                      <div className="leading-relaxed">
                        Desliza hacia abajo y toca{' '}
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-slate-300 font-semibold text-slate-800 align-middle">
                          <PlusSquare className="w-3.5 h-3.5 text-[#132B63]" />
                          <span>Agregar a inicio</span>
                        </span>
                        .
                      </div>
                    </li>
                    <li className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </span>
                      <div className="leading-relaxed">
                        Toca <strong>&ldquo;Agregar&rdquo;</strong> arriba a la derecha. Verás el ícono de <strong>Premex</strong> en tu pantalla de inicio.
                      </div>
                    </li>
                  </ol>
                </>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="min-h-[44px] px-5 py-2 text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl transition-colors cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[65] px-4 py-2 rounded-xl bg-amber-900 text-amber-50 border border-amber-700/60 shadow-lg flex items-center gap-2 text-xs font-semibold max-w-[92vw]"
    >
      <WifiOff className="w-4 h-4 text-amber-300 shrink-0" />
      <span className="truncate">
        Sin conexión a internet · Algunos envíos y sincronizaciones esperarán reconexión
      </span>
    </div>
  );
};
