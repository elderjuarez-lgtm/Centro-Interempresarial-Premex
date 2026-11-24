import React, { useState } from 'react';
import { SuiteModuleId } from '../types';

export const PREMEX_LOGO_SRC = '/assets/aistudio/image_7836b31e.png';

interface PremexBrandLogoProps {
  className?: string;
  compact?: boolean;
}

/**
 * Renders the official Premex corporate logo cleanly on a crisp white backing
 * so the blue organic emblem displays with zero halo artifacts.
 */
export const PremexBrandLogo: React.FC<PremexBrandLogoProps> = ({
  className = 'h-10',
  compact = false,
}) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-[#19377B] via-[#1E60A8] to-[#3485C9] text-white font-extrabold tracking-tight px-3 py-1.5 ${className}`}
      >
        {compact ? 'P' : 'premex'}
      </div>
    );
  }

  return (
    <img
      src={PREMEX_LOGO_SRC}
      alt="Premex"
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={`object-contain select-none ${className}`}
    />
  );
};

interface ModuleIconProps {
  className?: string;
}

/**
 * 1. Conciliación Intercompany
 * Bespoke multi-tone Premex Cobalt & Deep Navy interlocking bilateral nodes emblem.
 */
export const IntercompanyModuleLogo: React.FC<ModuleIconProps> = ({ className = 'w-14 h-14' }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="ic_bg" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#3485C9" />
        <stop offset="52%" stopColor="#1E60A8" />
        <stop offset="100%" stopColor="#132B63" />
      </linearGradient>
      <linearGradient id="ic_facet" x1="12" y1="8" x2="48" y2="54" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#60B3F0" stopOpacity="0.45" />
        <stop offset="100%" stopColor="#132B63" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#ic_bg)" />
    <path d="M2 18C2 9.163 9.163 2 18 2H42C36 24 22 38 2 44V18Z" fill="url(#ic_facet)" />
    {/* Left Corporate Building Node */}
    <rect x="13" y="17" width="14" height="30" rx="3.5" fill="#FFFFFF" fillOpacity="0.95" />
    <rect x="16.5" y="21.5" width="3" height="3" rx="0.8" fill="#1E60A8" />
    <rect x="21" y="21.5" width="3" height="3" rx="0.8" fill="#1E60A8" />
    <rect x="16.5" y="27" width="3" height="3" rx="0.8" fill="#1E60A8" />
    <rect x="21" y="27" width="3" height="3" rx="0.8" fill="#1E60A8" />
    <rect x="18" y="39" width="4" height="8" rx="1" fill="#19377B" />
    {/* Right Corporate Building Node */}
    <rect x="37" y="22" width="14" height="25" rx="3.5" fill="#CFE7FB" />
    <rect x="40.5" y="26.5" width="3" height="3" rx="0.8" fill="#19377B" />
    <rect x="45" y="26.5" width="3" height="3" rx="0.8" fill="#19377B" />
    <rect x="40.5" y="32" width="3" height="3" rx="0.8" fill="#19377B" />
    <rect x="45" y="32" width="3" height="3" rx="0.8" fill="#19377B" />
    <rect x="42" y="39" width="4" height="8" rx="1" fill="#1E60A8" />
    {/* Reciprocal Reconciliation Bridge Arrows */}
    <path d="M24 29.5H40.5M40.5 29.5L36.5 25.5M40.5 29.5L36.5 33.5" stroke="#132B63" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M24 29.5H40.5M40.5 29.5L36.5 25.5M40.5 29.5L36.5 33.5" stroke="#93D5FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M40 37.5H23.5M23.5 37.5L27.5 33.5M23.5 37.5L27.5 41.5" stroke="#132B63" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M40 37.5H23.5M23.5 37.5L27.5 33.5M23.5 37.5L27.5 41.5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * 2. Conciliación Bancaria
 * Bespoke Deep Ocean-Teal & Premex Navy architectural bank vault + verified check balance emblem.
 */
export const BancosModuleLogo: React.FC<ModuleIconProps> = ({ className = 'w-14 h-14' }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="bnk_bg" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#14B8A6" />
        <stop offset="48%" stopColor="#0E7490" />
        <stop offset="100%" stopColor="#163A6B" />
      </linearGradient>
      <linearGradient id="bnk_wave" x1="6" y1="36" x2="62" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#5EEAD4" stopOpacity="0.28" />
        <stop offset="100%" stopColor="#0F172A" stopOpacity="0.2" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#bnk_bg)" />
    <path d="M2 42C18 34 40 50 62 36V46C62 54.837 54.837 62 46 62H18C9.163 62 2 54.837 2 46V42Z" fill="url(#bnk_wave)" />
    {/* Bank Pediment / Roof */}
    <path d="M32 13L50 22.5H14L32 13Z" fill="#FFFFFF" fillOpacity="0.96" />
    <rect x="15" y="24" width="34" height="2.6" rx="1.3" fill="#CCFBF1" />
    {/* Bank Columns */}
    <rect x="18" y="28.5" width="4.5" height="14.5" rx="1.5" fill="#FFFFFF" fillOpacity="0.92" />
    <rect x="26.5" y="28.5" width="4.5" height="14.5" rx="1.5" fill="#FFFFFF" fillOpacity="0.92" />
    <rect x="35" y="28.5" width="4.5" height="14.5" rx="1.5" fill="#FFFFFF" fillOpacity="0.92" />
    {/* Base Plinth */}
    <rect x="14" y="45" width="28" height="3.5" rx="1.75" fill="#CCFBF1" />
    {/* Verified Balance Seal */}
    <circle cx="46" cy="43" r="10" fill="#0F294A" />
    <circle cx="46" cy="43" r="8" fill="#2DD4BF" />
    <path d="M42.3 43.2L44.8 45.7L50 40.3" stroke="#082F49" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * 3. Anticipos
 * Bespoke Amber-Copper forward escrow & disbursement settlement emblem.
 */
export const AnticiposModuleLogo: React.FC<ModuleIconProps> = ({ className = 'w-14 h-14' }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="ant_bg" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#F59E0B" />
        <stop offset="55%" stopColor="#D97706" />
        <stop offset="100%" stopColor="#92400E" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#ant_bg)" />
    <circle cx="52" cy="14" r="18" fill="#FDE68A" fillOpacity="0.2" />
    {/* Stacked Escrow Document / Wallet */}
    <rect x="13" y="17" width="26" height="30" rx="5" fill="#FFFFFF" fillOpacity="0.95" />
    <rect x="18" y="23" width="16" height="3" rx="1.5" fill="#D97706" />
    <rect x="18" y="29" width="11" height="2.8" rx="1.4" fill="#F59E0B" fillOpacity="0.7" />
    <rect x="18" y="35" width="14" height="2.8" rx="1.4" fill="#F59E0B" fillOpacity="0.7" />
    {/* Forward Advance Coin Badge */}
    <circle cx="43" cy="39" r="11" fill="#78350F" />
    <circle cx="43" cy="39" r="9" fill="#FEF3C7" />
    <path d="M38.5 39H47M47 39L43.5 35.5M47 39L43.5 42.5" stroke="#B45309" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * 4. Cuentas por Cobrar (CxC)
 * Bespoke Royal Indigo-Periwinkle inbound collection & invoice ledger emblem.
 */
export const CxcModuleLogo: React.FC<ModuleIconProps> = ({ className = 'w-14 h-14' }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="cxc_bg" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#6366F1" />
        <stop offset="55%" stopColor="#4338CA" />
        <stop offset="100%" stopColor="#1E1B4B" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#cxc_bg)" />
    <path d="M2 18C2 9.163 9.163 2 18 2H44L2 38V18Z" fill="#A5B4FC" fillOpacity="0.18" />
    {/* Receivable Invoice Card */}
    <rect x="14" y="14" width="29" height="36" rx="5" fill="#FFFFFF" fillOpacity="0.96" />
    <rect x="19" y="20" width="12" height="3" rx="1.5" fill="#4338CA" />
    <rect x="19" y="26.5" width="19" height="2.6" rx="1.3" fill="#C7D2FE" />
    <rect x="19" y="32" width="15" height="2.6" rx="1.3" fill="#C7D2FE" />
    <rect x="19" y="38.5" width="10" height="4" rx="2" fill="#E0E7FF" />
    {/* Inbound Arrow Pill */}
    <circle cx="45" cy="41" r="10.5" fill="#1E1B4B" />
    <circle cx="45" cy="41" r="8.5" fill="#A5B4FC" />
    <path d="M48.5 37.5L41.5 44.5M41.5 44.5H46.5M41.5 44.5V39.5" stroke="#1E1B4B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * 5. Cuentas por Pagar (CxP)
 * Bespoke Deep Rose-Burgundy vendor payables & disbursement schedule emblem.
 */
export const CxpModuleLogo: React.FC<ModuleIconProps> = ({ className = 'w-14 h-14' }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="cxp_bg" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#E11D48" />
        <stop offset="55%" stopColor="#9F1239" />
        <stop offset="100%" stopColor="#4C0519" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#cxp_bg)" />
    <circle cx="14" cy="54" r="18" fill="#FDA4AF" fillOpacity="0.16" />
    {/* Vendor Statement Card */}
    <rect x="14" y="15" width="30" height="34" rx="5" fill="#FFFFFF" fillOpacity="0.96" />
    <rect x="19" y="21" width="16" height="3" rx="1.5" fill="#9F1239" />
    <rect x="19" y="27.5" width="20" height="2.6" rx="1.3" fill="#FECDD3" />
    <rect x="19" y="33" width="14" height="2.6" rx="1.3" fill="#FECDD3" />
    <rect x="19" y="39" width="11" height="3.5" rx="1.5" fill="#FFE4E6" />
    {/* Outbound Disbursement Badge */}
    <circle cx="46" cy="41" r="10.5" fill="#4C0519" />
    <circle cx="46" cy="41" r="8.5" fill="#FDA4AF" />
    <path d="M42.5 44.5L49.5 37.5M49.5 37.5H44.5M49.5 37.5V42.5" stroke="#4C0519" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * 6. Ajustes y Configuraciones
 * Bespoke Slate-Navy & Premex Cobalt security shield + precision gear emblem.
 */
export const AjustesModuleLogo: React.FC<ModuleIconProps> = ({ className = 'w-14 h-14' }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="adj_bg" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#475569" />
        <stop offset="50%" stopColor="#1E3A5F" />
        <stop offset="100%" stopColor="#0F172A" />
      </linearGradient>
      <linearGradient id="adj_shield" x1="20" y1="14" x2="46" y2="48" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#DBEAFE" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#adj_bg)" />
    <circle cx="52" cy="14" r="18" fill="#60A5FA" fillOpacity="0.16" />
    {/* Governance Shield */}
    <path
      d="M32 12L48 18.5V31.5C48 41.8 41.2 49.4 32 52.5C22.8 49.4 16 41.8 16 31.5V18.5L32 12Z"
      fill="url(#adj_shield)"
    />
    {/* Precision Access Sliders / Gear Core */}
    <circle cx="32" cy="31" r="7.5" fill="#1E60A8" />
    <circle cx="32" cy="31" r="3.2" fill="#FFFFFF" />
    <rect x="30.6" y="20.5" width="2.8" height="4" rx="1.2" fill="#1E60A8" />
    <rect x="30.6" y="37.5" width="2.8" height="4" rx="1.2" fill="#1E60A8" />
    <rect x="21.5" y="29.6" width="4" height="2.8" rx="1.2" fill="#1E60A8" />
    <rect x="38.5" y="29.6" width="4" height="2.8" rx="1.2" fill="#1E60A8" />
    {/* Verified Admin Accent Dot */}
    <circle cx="46" cy="44" r="8.5" fill="#0F172A" />
    <circle cx="46" cy="44" r="6.5" fill="#38BDF8" />
    <path d="M43 44.2L45.1 46.3L49.2 41.9" stroke="#0F172A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * 7. Liquidación de Viáticos
 * Bespoke Emerald-Teal & Premex Cobalt receipt capture + route mileage emblem.
 */
export const ViaticosModuleLogo: React.FC<ModuleIconProps> = ({ className = 'w-14 h-14' }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="viat_bg" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#0EA5E9" />
        <stop offset="52%" stopColor="#0284C7" />
        <stop offset="100%" stopColor="#132B63" />
      </linearGradient>
      <linearGradient id="viat_glow" x1="10" y1="6" x2="54" y2="54" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#7DD3FC" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#132B63" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#viat_bg)" />
    <path d="M2 18C2 9.163 9.163 2 18 2H46C38 22 24 38 2 46V18Z" fill="url(#viat_glow)" />
    {/* Perforated Expense Receipt Card */}
    <path
      d="M15 14C15 12.343 16.343 11 18 11H39C40.657 11 42 12.343 42 14V49.5L38 46.5L34 49.5L30 46.5L26 49.5L22 46.5L18 49.5L15 47.2V14Z"
      fill="#FFFFFF"
      fillOpacity="0.96"
    />
    {/* Receipt Lines */}
    <rect x="19.5" y="17.5" width="12" height="3" rx="1.5" fill="#0284C7" />
    <rect x="19.5" y="24" width="17" height="2.4" rx="1.2" fill="#BAE6FD" />
    <rect x="19.5" y="29.5" width="14" height="2.4" rx="1.2" fill="#BAE6FD" />
    <rect x="19.5" y="35.5" width="10" height="3.2" rx="1.5" fill="#132B63" />
    {/* Smart Camera / Route Pin Seal */}
    <circle cx="45" cy="42" r="10.5" fill="#0C214D" />
    <circle cx="45" cy="42" r="8.5" fill="#34D399" />
    <path
      d="M41.2 42.3L43.8 44.9L49 39.4"
      stroke="#064E3B"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * 8. Panel de Actividades
 * Bespoke Emerald-Sapphire schedule checklist + subtle notification pulse emblem.
 */
export const ActividadesModuleLogo: React.FC<ModuleIconProps> = ({ className = 'w-14 h-14' }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="act_bg" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#10B981" />
        <stop offset="50%" stopColor="#0F766E" />
        <stop offset="100%" stopColor="#132B63" />
      </linearGradient>
      <linearGradient id="act_glint" x1="8" y1="4" x2="50" y2="52" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#A7F3D0" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#132B63" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#act_bg)" />
    <path d="M2 18C2 9.163 9.163 2 18 2H46C38 20 24 38 2 45V18Z" fill="url(#act_glint)" />
    {/* Calendar Header Pins */}
    <rect x="20" y="11" width="4" height="7" rx="2" fill="#D1FAE5" />
    <rect x="34" y="11" width="4" height="7" rx="2" fill="#D1FAE5" />
    {/* Schedule Checklist Board */}
    <rect x="13" y="15" width="32" height="35" rx="5.5" fill="#FFFFFF" fillOpacity="0.96" />
    <rect x="13" y="15" width="32" height="8" rx="5.5" fill="#CCFBF1" />
    <rect x="13" y="19" width="32" height="4" fill="#CCFBF1" />
    {/* Checklist Rows */}
    <path d="M18.5 29.5L20.3 31.3L23.5 27.8" stroke="#0F766E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="26.5" y="28.3" width="13.5" height="2.6" rx="1.3" fill="#0F766E" fillOpacity="0.85" />
    <path d="M18.5 36.5L20.3 38.3L23.5 34.8" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="26.5" y="35.3" width="11" height="2.6" rx="1.3" fill="#99F6E4" />
    <circle cx="20.5" cy="43.5" r="2" fill="#CBD5E1" />
    <rect x="26.5" y="42.2" width="9" height="2.6" rx="1.3" fill="#CBD5E1" />
    {/* Sync / Notification Seal */}
    <circle cx="46" cy="42" r="10.5" fill="#0C214D" />
    <circle cx="46" cy="42" r="8.5" fill="#34D399" />
    <path
      d="M42.3 42.3L44.8 44.8L50 39.4"
      stroke="#064E3B"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * 9. Gestión TC Clara (SAP & Odoo)
 * Bespoke Indigo-Violet & Premex Navy corporate card + dual ERP sync bridge emblem.
 */
export const ClaraModuleLogo: React.FC<ModuleIconProps> = ({ className = 'w-14 h-14' }) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="clr_bg" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#6366F1" />
        <stop offset="48%" stopColor="#3B82F6" />
        <stop offset="100%" stopColor="#132B63" />
      </linearGradient>
      <linearGradient id="clr_shine" x1="8" y1="6" x2="52" y2="48" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#C7D2FE" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#132B63" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#clr_bg)" />
    <path d="M2 18C2 9.163 9.163 2 18 2H46C38 20 24 38 2 46V18Z" fill="url(#clr_shine)" />
    {/* Corporate Card */}
    <rect x="12" y="16" width="36" height="24" rx="4.5" fill="#FFFFFF" fillOpacity="0.96" />
    <rect x="12" y="22" width="36" height="4.5" fill="#132B63" fillOpacity="0.88" />
    <rect x="16.5" y="29.5" width="7" height="5" rx="1.2" fill="#818CF8" />
    <rect x="26" y="31" width="14" height="2.4" rx="1.2" fill="#CBD5E1" />
    {/* Dual ERP Sync Seal */}
    <circle cx="46" cy="43" r="10.5" fill="#0C214D" />
    <circle cx="46" cy="43" r="8.5" fill="#A5B4FC" />
    <path
      d="M42.2 43.2L44.8 45.8L50 40.3"
      stroke="#1E1B4B"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ModuleEmblem: React.FC<{ moduleId: SuiteModuleId; className?: string }> = ({
  moduleId,
  className = 'w-14 h-14',
}) => {
  switch (moduleId) {
    case 'intercompany':
      return <IntercompanyModuleLogo className={className} />;
    case 'bancos':
      return <BancosModuleLogo className={className} />;
    case 'viaticos':
      return <ViaticosModuleLogo className={className} />;
    case 'actividades':
      return <ActividadesModuleLogo className={className} />;
    case 'clara':
      return <ClaraModuleLogo className={className} />;
    case 'anticipos':
      return <AnticiposModuleLogo className={className} />;
    case 'cxc':
      return <CxcModuleLogo className={className} />;
    case 'cxp':
      return <CxpModuleLogo className={className} />;
    case 'ajustes':
      return <AjustesModuleLogo className={className} />;
  }
};
