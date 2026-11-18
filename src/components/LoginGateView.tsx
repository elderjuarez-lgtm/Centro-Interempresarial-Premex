import React from 'react';
import { User } from 'firebase/auth';
import {
  AlertCircle,
  Building2,
  Loader2,
  Lock,
  LogOut,
  MailWarning,
  ShieldCheck,
} from 'lucide-react';
import { PremexBrandLogo } from './ModuleIcons';
import { SUPER_ADMIN_EMAIL } from '../utils/permissions';

export type LoginGateMode =
  | 'checking_session'
  | 'sign_in'
  | 'loading_permissions'
  | 'unverified_email';

interface LoginGateViewProps {
  mode: LoginGateMode;
  currentUser: User | null;
  isSigningIn: boolean;
  authError: string | null;
  onSignInWithGoogle: () => void;
  onSignOut: () => void;
}

const GoogleColorMark: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    className="w-4 h-4 shrink-0"
    aria-hidden="true"
  >
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
    />
  </svg>
);

export const LoginGateView: React.FC<LoginGateViewProps> = ({
  mode,
  currentUser,
  isSigningIn,
  authError,
  onSignInWithGoogle,
  onSignOut,
}) => {
  const userEmail = currentUser?.email || '';
  const userInitial = (
    currentUser?.displayName?.[0] ||
    currentUser?.email?.[0] ||
    'U'
  ).toUpperCase();

  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-[#F5F8FC] text-slate-900 font-sans antialiased selection:bg-[#1E60A8] selection:text-white">
      {/* Left Brand & Corporate Governance Column */}
      <aside className="relative hidden lg:flex lg:col-span-5 xl:col-span-5 flex-col justify-between bg-gradient-to-br from-[#0A193B] via-[#132B63] to-[#1A4D8F] text-white px-10 xl:px-14 py-12 overflow-hidden">
        {/* Subtle architectural hairline geometry */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="premex-auth-grid"
              width="48"
              height="48"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 48 0 L 0 0 0 48"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#premex-auth-grid)" />
        </svg>

        {/* Brand Header */}
        <div className="relative z-10 flex items-center gap-4">
          <div className="bg-white rounded-xl px-4 py-2.5 shadow-sm shrink-0">
            <PremexBrandLogo className="h-9 w-auto" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-200/80">
              Premex Corporativo
            </div>
            <div className="text-sm font-semibold text-white mt-0.5 truncate">
              Suite Financiera Modular
            </div>
          </div>
        </div>

        {/* Central Value & Security Governance Statement */}
        <div className="relative z-10 my-auto py-12 max-w-md space-y-8">
          <div className="space-y-3.5">
            <h1 className="text-3xl xl:text-[34px] font-bold tracking-tight leading-[1.15] text-white">
              Acceso protegido a la Suite de Conciliaciones
            </h1>
            <p className="text-sm text-blue-100/80 leading-relaxed">
              Toda la información financiera, módulos operativos y directorios de
              sociedades permanecen resguardados hasta validar tu cuenta
              corporativa de Google.
            </p>
          </div>

          <div className="border-t border-white/15 divide-y divide-white/10">
            <div className="py-4 flex items-start gap-3.5">
              <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0 mt-0.5">
                <Lock className="w-4 h-4 text-sky-200" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-white leading-snug">
                  Autenticación corporativa obligatoria
                </h2>
                <p className="text-xs text-blue-100/75 mt-1 leading-relaxed">
                  Al abrir cualquier enlace compartido debes iniciar sesión con
                  Google antes de visualizar módulos o cifras.
                </p>
              </div>
            </div>

            <div className="py-4 flex items-start gap-3.5">
              <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck className="w-4 h-4 text-sky-200" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-white leading-snug">
                  Módulos filtrados por correo electrónico
                </h2>
                <p className="text-xs text-blue-100/75 mt-1 leading-relaxed">
                  El sistema consulta tus permisos en tiempo real y habilita
                  únicamente los aplicativos asignados a tu rol.
                </p>
              </div>
            </div>

            <div className="py-4 flex items-start gap-3.5">
              <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0 mt-0.5">
                <Building2 className="w-4 h-4 text-sky-200" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-white leading-snug">
                  Alcance independiente por sociedades
                </h2>
                <p className="text-xs text-blue-100/75 mt-1 leading-relaxed">
                  Cada módulo aplica automáticamente el filtro de empresas
                  autorizadas para tu usuario.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Quiet Brand Footer */}
        <div className="relative z-10 text-xs text-blue-200/70">
          Administración de accesos ·{' '}
          <span className="font-mono text-blue-100/90">{SUPER_ADMIN_EMAIL}</span>
        </div>
      </aside>

      {/* Right Authentication Workspace Column */}
      <main className="lg:col-span-7 xl:col-span-7 flex flex-col justify-between px-5 sm:px-10 lg:px-16 py-8 sm:py-12">
        {/* Mobile Brand Header */}
        <div className="flex lg:hidden items-center justify-between pb-6 border-b border-slate-200/80">
          <div className="flex items-center gap-3">
            <PremexBrandLogo className="h-9 w-auto" />
            <div>
              <div className="text-sm font-bold text-[#132B63] leading-tight">
                Suite de Conciliaciones
              </div>
              <div className="text-[11px] text-slate-500">
                Plataforma Financiera Premex
              </div>
            </div>
          </div>
        </div>

        {/* Centered Single-Elevation Auth Surface */}
        <div className="flex-1 flex items-center justify-center py-8">
          <div className="w-full max-w-[440px] bg-white rounded-2xl border border-slate-200/90 shadow-xs p-7 sm:p-9">
            {mode === 'checking_session' && (
              <div className="py-6 text-center space-y-5">
                <div className="flex justify-center">
                  <PremexBrandLogo className="h-11 w-auto" />
                </div>
                <div className="w-11 h-11 rounded-xl bg-[#EEF4FB] border border-[#D4E4F7] text-[#1E60A8] flex items-center justify-center mx-auto">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                    Verificando sesión corporativa
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Comprobando si existe una sesión de Google activa antes de
                    habilitar el acceso a la plataforma.
                  </p>
                </div>
              </div>
            )}

            {mode === 'loading_permissions' && (
              <div className="py-4 text-center space-y-5">
                <div className="flex justify-center">
                  <PremexBrandLogo className="h-10 w-auto" />
                </div>

                {currentUser && (
                  <div className="flex items-center justify-center gap-3 py-2.5 px-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-left">
                    {currentUser.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt={currentUser.displayName || 'Usuario'}
                        referrerPolicy="no-referrer"
                        className="w-9 h-9 rounded-full border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-[#132B63] text-white text-xs font-bold flex items-center justify-center shrink-0">
                        {userInitial}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {currentUser.displayName || 'Usuario autenticado'}
                      </div>
                      <div className="text-[11px] font-mono text-slate-600 truncate">
                        {userEmail}
                      </div>
                    </div>
                  </div>
                )}

                <div className="w-11 h-11 rounded-xl bg-[#EEF4FB] border border-[#D4E4F7] text-[#1E60A8] flex items-center justify-center mx-auto">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                    Identificando permisos autorizados
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Validando módulos habilitados, rol operativo y sociedades
                    asignadas a tu correo en Firebase.
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#132B63] transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Cancelar y cambiar de cuenta</span>
                  </button>
                </div>
              </div>
            )}

            {mode === 'unverified_email' && (
              <div className="py-3 text-center space-y-5">
                <div className="flex justify-center">
                  <PremexBrandLogo className="h-10 w-auto" />
                </div>
                <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
                  <MailWarning className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                    Correo electrónico sin verificar
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    La cuenta{' '}
                    <strong className="font-mono text-slate-900">{userEmail}</strong>{' '}
                    no tiene verificación de correo confirmada por Google.
                    Inicia sesión con una cuenta corporativa verificada para
                    continuar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="w-full h-11 inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-[#132B63] hover:bg-[#1E60A8] text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Cerrar sesión y elegir otra cuenta</span>
                </button>
              </div>
            )}

            {mode === 'sign_in' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1E60A8]">
                    Acceso restringido · Suite Premex
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                    Iniciar sesión
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Ingresa con tu cuenta de Google autorizada. Al autenticarte,
                    verás únicamente los módulos y sociedades asignados a tu
                    correo electrónico.
                  </p>
                </div>

                {authError && (
                  <div
                    role="alert"
                    className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 flex items-start gap-2.5 text-xs text-rose-800 leading-relaxed"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{authError}</span>
                  </div>
                )}

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={onSignInWithGoogle}
                    disabled={isSigningIn}
                    className="w-full h-12 px-5 rounded-xl bg-[#132B63] hover:bg-[#1E60A8] active:bg-[#0F224D] disabled:opacity-65 disabled:cursor-not-allowed text-white text-sm font-semibold inline-flex items-center justify-center gap-3 transition-colors shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60A8] focus-visible:ring-offset-2 whitespace-nowrap cursor-pointer"
                  >
                    {isSigningIn ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>Conectando con Google...</span>
                      </>
                    ) : (
                      <>
                        <span className="w-6 h-6 rounded-md bg-white flex items-center justify-center shrink-0">
                          <GoogleColorMark />
                        </span>
                        <span>Continuar con Google</span>
                      </>
                    )}
                  </button>

                  <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                    Se abrirá la ventana oficial de selección de cuenta de Google.
                  </p>
                </div>

                <div className="pt-5 border-t border-slate-100 space-y-2 text-xs text-slate-500 leading-relaxed">
                  <p>
                    Por política de seguridad financiera, los módulos y sus
                    registros no son visibles antes de iniciar sesión.
                  </p>
                  <p>
                    ¿Necesitas habilitación de módulos o sociedades? Contacta al
                    administrador en{' '}
                    <span className="font-mono font-medium text-[#132B63]">
                      {SUPER_ADMIN_EMAIL}
                    </span>
                    .
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quiet Bottom Metadata */}
        <footer className="text-center lg:text-left text-[11px] text-slate-500 pt-4">
          Autenticación Google OAuth 2.0 · Verificación automática de permisos por correo
        </footer>
      </main>
    </div>
  );
};
