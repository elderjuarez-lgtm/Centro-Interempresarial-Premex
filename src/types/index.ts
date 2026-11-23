export type ReconciliationScope = 'internacionales' | 'nacionales' | 'anitox';

export type MovementType = 'CXC' | 'CXP';

export interface Movement {
  id: string;
  sociedad: string;
  contraparte: string;
  fecha_factura: string;
  factura: string;
  valor: number;
  tipo: MovementType;
  mes?: string; // Mes a conciliar (ej. 'Septiembre 2026' o '2026-09')
  notas?: string;
}

export interface DifferenceRow {
  id: string;
  sociedad: string;
  contraparte: string;
  cxc: number; // What Sociedad reports as receivable from Contraparte
  cxp: number; // What Contraparte reports as payable to Sociedad
  diferencia: number; // cxc - cxp
  comentario: string;
  estado: 'conciliado' | 'diferencia' | 'sin_reciprocidad';
  ultimaModificacion?: string;
}

export interface EntityMapping {
  id: string;
  alias: string;
  nombreOficial: string;
  nit?: string;
  email?: string;
  codigoSociedad: string;
  pais?: string;
  moneda: string;
}

export interface MatrixCell {
  sociedad: string;
  contraparte: string;
  valor: number;
  count: number;
  movimientos: Movement[];
}

export interface SymmetricMatrixCell {
  sociedad: string;
  contraparte: string;
  valor: number;
  reciprocalValor: number;
  difference: number;
  status: 'empty' | 'diagonal' | 'reconciled' | 'discrepancy' | 'unilateral';
  count: number;
  movimientos: Movement[];
}

export interface SymmetricMatrixResult {
  entities: string[];
  cxcGrid: Record<string, Record<string, SymmetricMatrixCell>>;
  cxpGrid: Record<string, Record<string, SymmetricMatrixCell>>;
  cxcGrandTotal: number;
  cxpGrandTotal: number;
}

export interface MatrixResult {
  societies: string[];
  counterparties: string[];
  grid: Record<string, Record<string, MatrixCell>>;
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  grandTotal: number;
}

export type ActiveTab = 
  | 'inicio'
  | 'empresas'
  | 'carga'
  | 'movimientos'
  | 'conciliacion'
  | 'diferencias';

export interface SheetsExportResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
}

export interface ClosedMonthRecord {
  month: string;
  closedAt: string;
  closedBy: string;
  archiveId?: string;
  movementsCount: number;
  differencesCount: number;
  commentsSnapshot?: Record<string, string>;
  entitiesSnapshot?: string[];
}

export type DocumentReconciliationStatus =
  | 'conciliado'
  | 'diferencia_valor'
  | 'sin_contraparte';

export type DocumentMatchMethod = 'documento' | 'valor';

export interface DocumentComparisonRow {
  id: string;
  docKey: string;
  facturaDisplay: string;
  counterpartyFacturaDisplay?: string;
  mes: string;
  sociedad: string;
  contraparte: string;
  cxcValor: number;
  cxpValor: number;
  diferencia: number;
  status: DocumentReconciliationStatus;
  matchMethod?: DocumentMatchMethod;
  cxcMovements: Movement[];
  cxpMovements: Movement[];
  cxcFecha: string;
  cxpFecha: string;
}

export interface MovementDocStatus {
  status: DocumentReconciliationStatus;
  matchMethod?: DocumentMatchMethod;
  matchedCounterpartyFactura?: string;
  counterpartyValue: number;
  difference: number;
  expectedReciprocalType: MovementType;
  counterpartyMovements: Movement[];
}

export interface MovimientosNavigationPreset {
  viewMode: 'lista' | 'documentos';
  sociedad?: string;
  contraparte?: string;
  docStatusFilter?: 'ALL' | 'CONCILIADOS' | 'NO_CONCILIADOS';
  directionScope?: 'PAIR_BOTH' | 'CXC_TO_CXP';
}

export interface DirectorySyncState {
  status: 'idle' | 'saving' | 'saved' | 'pending' | 'error';
  lastSyncedAtIso?: string;
  updatedByName?: string;
  errorMsg?: string;
}

// ============================================================================
// Modular Platform & Bank Reconciliation Types
// ============================================================================

export type ActiveModuleId =
  | 'launcher'
  | 'intercompany'
  | 'bancos'
  | 'viaticos'
  | 'actividades'
  | 'ajustes';

export type FunctionalModuleId =
  | 'intercompany'
  | 'bancos'
  | 'viaticos'
  | 'actividades'
  | 'anticipos'
  | 'cxc'
  | 'cxp';

export type StandaloneCompanyDbModuleId = Exclude<FunctionalModuleId, 'intercompany'>;

export type SuiteModuleId = FunctionalModuleId | 'ajustes';

export type UserRole = 'admin' | 'operador' | 'consulta';

export type CompanyAccessScope = 'all' | 'selected';

export interface ModuleCompanyEntry {
  id: string;
  nombre: string;
  codigo?: string;
  nit?: string;
  pais?: string;
  moneda?: string;
  activo: boolean;
}

export type ModuleCompaniesMap = Record<FunctionalModuleId, ModuleCompanyEntry[]>;

export interface ModuleCompanyPermission {
  scope: CompanyAccessScope;
  companies: string[];
}

export type ModuleCompanyScopeMap = Partial<Record<FunctionalModuleId, ModuleCompanyPermission>>;

export interface UserPermissionRecord {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  allowedModules: SuiteModuleId[];
  /** Legacy/fallback global company scope (derived automatically from moduleCompanyAccess) */
  companyScope: CompanyAccessScope;
  /** Legacy/fallback flattened company names */
  allowedCompanies: string[];
  /** Independent per-module company access rules (each module pulls from its own company DB) */
  moduleCompanyAccess?: ModuleCompanyScopeMap;
  active: boolean;
  notes?: string;
  updatedBy?: string;
  updatedAtIso?: string;
}

export interface AccessControlPolicy {
  strictMode: boolean;
  updatedBy?: string;
  updatedAtIso?: string;
}

export interface EffectivePermissions {
  email: string | null;
  displayName: string;
  role: UserRole;
  isAuthorized: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  canOperate: boolean;
  isReadOnly: boolean;
  canCloseMonth: boolean;
  canManageMasterData: boolean;
  allowedModules: SuiteModuleId[];
  companyScope: CompanyAccessScope;
  allowedCompanies: string[];
  moduleCompanyAccess: ModuleCompanyScopeMap;
  canAccessModule: (moduleId: SuiteModuleId) => boolean;
  isCompanyAllowed: (companyName: string, moduleId?: FunctionalModuleId) => boolean;
  getModuleCompanyScope: (moduleId: FunctionalModuleId) => CompanyAccessScope;
  getAllowedCompaniesForModule: (moduleId: FunctionalModuleId) => string[];
  isPreviewing: boolean;
  previewEmail: string | null;
}

export type BankTab = 'resumen' | 'pendientes' | 'cuentas' | 'carga' | 'historial';

export type BankCurrency = 'USD' | 'COP' | 'GTQ' | 'MXN' | 'EUR';

export type BankAccountType =
  | 'Corriente'
  | 'Ahorros'
  | 'Recaudadora'
  | 'Fondo de Inversión'
  | 'Fiduciaria';

export type SapDocumentClass = 'CB' | 'DZ' | 'AB' | 'KZ' | 'KR' | 'DC' | string;

export type SapSubaccountType = '00' | '01' | '02';

export interface BankSociety {
  id: string;
  codigoSociedad: string;
  nombre: string;
  pais: string;
  moneda: BankCurrency;
  nit?: string;
  activa?: boolean;
}

export interface BankMonthlyBalance {
  saldoLibros: number;
  saldoExtracto: number;
  /** Saldos de las 3 subcuentas contables SAP (00 principal / 01 ingresos pend. / 02 egresos pend.) */
  saldoCuenta00?: number;
  saldoCuenta01?: number;
  saldoCuenta02?: number;
  /** true cuando el usuario ajustó manualmente el Saldo Extracto respecto a Cta 00 */
  saldoExtractoManual?: boolean;
  fechaCorte?: string; // YYYY-MM-DD
  fuenteLibros?: string;
  fuenteExtracto?: string;
  updatedAtIso?: string;
}

export interface BankAccount {
  id: string;
  banco: string;
  numeroCuenta: string;
  sociedad: string;
  /** Código de sociedad SAP (ej. 1000, 2000, 3000) */
  codigoSociedad?: string;
  pais: string;
  moneda: BankCurrency;
  tipoCuenta: BankAccountType;
  /** Ej. "Fondo de Valores RENTA LIQUIDEZ-1" o nombre del producto bancario */
  productoCuenta?: string;
  /** NIT o Código de Cuenta Contable mostrado en la cabecera oficial (ej. 8001502800) */
  codigoContable?: string;
  /** Raíz contable SAP (cuenta mayor sin los últimos 2 dígitos 00/01/02) */
  raizContable?: string;
  /** Subcuenta SAP terminación 00 (saldo banco principal) */
  cuentaMayor00?: string;
  /** Subcuenta SAP terminación 01 (ingresos pendientes por conciliar) */
  cuentaMayor01?: string;
  /** Subcuenta SAP terminación 02 (egresos pendientes por liquidar) */
  cuentaMayor02?: string;
  /** Saldos SAP activos de las 3 subcuentas */
  saldoCuenta00?: number;
  saldoCuenta01?: number;
  saldoCuenta02?: number;
  saldoExtractoManual?: boolean;
  /** Última fecha de corte YYYY-MM-DD */
  fechaCorte?: string;
  saldoInicialLibros: number;
  saldoFinalExtracto: number;
  saldoFinalLibros: number;
  /** Saldos mensuales cargados independientemente desde Balance Contable y Saldos de Banco */
  saldosPorMes?: Record<string, BankMonthlyBalance>;
}

export interface SapBalanceRow {
  id: string;
  sociedadCodigo: string;
  sociedadNombre: string;
  cuentaMayor: string;
  raizContable: string;
  subcuentaTipo: SapSubaccountType;
  denominacion: string;
  nuevoSaldo: number;
  moneda: BankCurrency;
  mes: string;
  fechaCorte?: string;
}

export type BankPendingCategory =
  | 'deposito_transito'
  | 'cheque_transito'
  | 'nota_debito'
  | 'nota_credito'
  | 'por_identificar';

/** Las 4 secciones exactas del formato corporativo Premex de Conciliación de Bancos */
export type BankReconcilingSection =
  | 'mas_notas_debito_libros'
  | 'menos_notas_credito_libros'
  | 'menos_cheques_pendientes'
  | 'mas_consignaciones_pendientes';

export interface SapOpenItem {
  id: string;
  cuentaId: string;
  sociedadCodigo: string;
  sociedadNombre: string;
  cuentaMayor: string;
  raizContable: string;
  subcuentaTipo: SapSubaccountType;
  claveRef1: string;
  /** Clave referencia 3 (tercero / quien pagó) */
  claveRef3: string;
  referencia: string;
  numeroDocumento: string;
  claseDocumento: SapDocumentClass;
  fechaDocumento: string;
  fechaContabilizacion: string;
  /** Importe con signo en moneda local (negativo o positivo según FBL3N) */
  importeMonedaLocal: number;
  monedaLocal: BankCurrency;
  texto: string;
  mes: string;
  /** Sección determinada automáticamente por clase de documento + signo */
  seccionAuto: BankReconcilingSection;
  /** Reclasificación manual opcional */
  seccionManual?: BankReconcilingSection;
  comentario?: string;
  origen?: 'sap_fbl3n' | 'manual';
}

export interface OfficialReconcilingLineItem {
  id: string;
  source: 'sap' | 'bank' | 'ledger';
  section: BankReconcilingSection;
  dto: string;
  fecha: string;
  concepto: string;
  valor: number;
  signedImporte?: number;
  tercero?: string;
  claseDocumento?: SapDocumentClass;
  subcuentaTipo?: SapSubaccountType;
  comentario?: string;
}

export interface BankStatementItem {
  id: string;
  cuentaId: string;
  fecha: string;
  referencia: string;
  descripcion: string;
  /** En extracto bancario: CREDITO = abono/entrada (+) [MAS Nota Débito no Contabilizada en Libros], DEBITO = cargo/salida (-) [MENOS Nota Crédito no Contabilizada en Libros] */
  tipo: 'CREDITO' | 'DEBITO';
  valor: number;
  mes: string;
  categoriaPendiente?: BankPendingCategory;
  comentario?: string;
  origenCarga?: 'conciliacion_directa' | 'extracto_completo';
}

export interface BookLedgerItem {
  id: string;
  cuentaId: string;
  fecha: string;
  comprobante: string;
  tercero: string;
  descripcion: string;
  /** En auxiliar contable de bancos: DEBITO = entrada a bancos (+) [MAS Consignaciones Pendientes en Extracto], CREDITO = salida de bancos (-) [MENOS Cheques Pendientes en Extracto] */
  tipo: 'DEBITO' | 'CREDITO';
  valor: number;
  mes: string;
  categoriaPendiente?: BankPendingCategory;
  comentario?: string;
  origenCarga?: 'conciliacion_directa' | 'extracto_completo';
}

export type BankMatchMethod = 'automatico_ref' | 'automatico_valor' | 'manual';

export interface BankMatchGroup {
  id: string;
  cuentaId: string;
  mes: string;
  bankItemIds: string[];
  ledgerItemIds: string[];
  method: BankMatchMethod;
  matchedAt: string;
  note?: string;
}

export interface BankReconciliationSummary {
  account: BankAccount | null;
  fechaCorte: string;
  saldoExtracto: number;
  /** Subcuentas SAP 00 / 01 / 02 resueltas para el periodo */
  saldoCuenta00: number;
  saldoCuenta01: number;
  saldoCuenta02: number;
  hasSapSubaccounts: boolean;
  saldoExtractoMatchesCta00: boolean;
  /** Auditoría Subcuentas SAP (00/01/02) vs Extracto y Partidas Abiertas FBL3N */
  sumSapItems01: number;
  sumSapItems02: number;
  diffSubcuenta00: number;
  diffSubcuenta01: number;
  diffSubcuenta02: number;
  sapItemsCount: number;
  depositosEnTransito: number;
  chequesEnTransito: number;
  saldoConciliadoExtracto: number;
  saldoLibros: number;
  /** Adiciones a Libros (+): en el formato oficial "MAS · NOTAS DEBITO NO CONTABILIZADAS" (ej. rendimientos) */
  notasCreditoNoContabilizadas: number;
  /** Deducciones a Libros (-): en el formato oficial "MENOS · NOTAS CREDITO NO CONTABILIZADAS" (ej. comisiones, GMF) */
  notasDebitoNoContabilizadas: number;
  saldoConciliadoLibros: number;
  diferenciaNeta: number;
  totalBankItems: number;
  matchedBankItemsCount: number;
  unmatchedBankItemsCount: number;
  totalLedgerItems: number;
  matchedLedgerItemsCount: number;
  unmatchedLedgerItemsCount: number;
  reconciledPct: number;
  unmatchedBankItems: BankStatementItem[];
  unmatchedLedgerItems: BookLedgerItem[];
  /** Partidas SAP abiertas filtradas para la cuenta/periodo */
  scopedSapItems: SapOpenItem[];
  /** Partidas detalladas unificadas (SAP FBL3N + Cruce Bilateral) para las 4 secciones del formato oficial */
  officialLines: {
    masNotasDebito: OfficialReconcilingLineItem[];
    menosNotasCredito: OfficialReconcilingLineItem[];
    menosCheques: OfficialReconcilingLineItem[];
    masConsignaciones: OfficialReconcilingLineItem[];
  };
  /** Partidas detalladas legacy (Cruce Bilateral) */
  notasDebitoLibrosItems: BankStatementItem[];
  notasCreditoLibrosItems: BankStatementItem[];
  chequesPendientesItems: BookLedgerItem[];
  consignacionesPendientesItems: BookLedgerItem[];
  matchedBankIds: Set<string>;
  matchedLedgerIds: Set<string>;
}

export interface BankClosedReconciliation {
  id: string;
  period: string;
  closedAtIso: string;
  closedByName: string;
  closedByEmail?: string;
  notes?: string;
  societiesCount: number;
  accountsCount: number;
  squaredAccountsCount: number;
  diffAccountsCount: number;
  openItemsCount: number;
  /** Instantánea congelada del periodo para consulta inmutable y descarga Excel/PDF */
  societies: BankSociety[];
  accounts: BankAccount[];
  sapOpenItems: SapOpenItem[];
  sapBalanceRows: SapBalanceRow[];
}

// ============================================================================
// Liquidación de Viáticos Types
// ============================================================================

export type ViaticosTab = 'liquidador' | 'cerradas' | 'contabilidad' | 'historial';

export type ViaticoCurrency =
  | 'Quetzales'
  | 'Dólares'
  | 'Pesos Colombianos'
  | 'Lempiras'
  | 'Pesos Mexicanos'
  | 'Euros'
  | 'Colones';

export type ViaticoCategory =
  | 'Alimentación'
  | 'Combustible / Lub'
  | 'Taxis / Buses'
  | 'Hospedaje'
  | 'Peajes / Parqueo'
  | 'Boletos Aéreos'
  | 'Atención a Clientes'
  | 'Otros Gastos';

export type ViaticoLiquidationStatus = 'borrador' | 'cerrada' | 'enviada';

export interface ViaticoConsultor {
  id: string;
  nombreCompleto: string;
  email: string;
  empresa: string;
  cargo?: string;
  centroCosto?: string;
  monedaBase: ViaticoCurrency;
  activo: boolean;
}

export interface ViaticoExpenseItem {
  id: string;
  fechaDoc: string; // DD/MM/YYYY
  serieDoc: string;
  noDoc: string;
  nit: string;
  proveedor: string;
  moneda: ViaticoCurrency;
  valorFactura: number;
  tipoCambio: number;
  valorReintegrar: number;
  categoria: ViaticoCategory;
  clienteContacto: string;
  objetivoComercial: string;
  descripcionGasto: string;
  kilometraje: string;
  // Fiscal/tax flags for auditing & future accounting export
  aplicaImpuestos: boolean;
  porcentajeImpuesto: number;
  montoImpuesto: number;
  valorSinImpuesto: number;
  // Lightweight receipt reference (bytes stored in IndexedDB, never in Firestore)
  attachmentId?: string;
  attachmentName?: string;
  attachmentMimeType?: string;
  attachmentSize?: number;
  extractedByAi?: boolean;
  extractionConfidence?: 'alta' | 'media' | 'baja';
  extractionNotes?: string;
}

export interface ViaticoLiquidation {
  id: string;
  lineaLiquidacion: string;
  semana: string;
  consultorId: string;
  consultorNombre: string;
  consultorEmail: string;
  empresa: string;
  centroCosto?: string;
  monedaBase: ViaticoCurrency;
  estado: ViaticoLiquidationStatus;
  items: ViaticoExpenseItem[];
  totalLiquidacion: number;
  totalConImpuestos: number;
  totalSinImpuestos: number;
  totalImpuestos: number;
  createdAtIso: string;
  updatedAtIso: string;
  closedAtIso?: string;
  closedBy?: string;
  sentAtIso?: string;
  sentToEmail?: string;
  notas?: string;
}

export interface ViaticoOdooCategoryAccount {
  accountCode: string;
  accountName: string;
}

export interface ViaticoOdooConfig {
  diarioNombre: string;
  diarioCodigo: string;
  prefijoReferencia: string;
  cuentaIvaCodigo: string;
  cuentaIvaNombre: string;
  etiquetaImpuesto: string;
  cuentaContrapartidaCodigo: string;
  cuentaContrapartidaNombre: string;
  criterioFechaContable: 'fecha_cierre' | 'fecha_factura' | 'fecha_hoy';
  cuentasPorCategoria: Record<ViaticoCategory, ViaticoOdooCategoryAccount>;
}

export interface ViaticosWorkspaceData {
  docId: string;
  consultores: ViaticoConsultor[];
  liquidaciones: ViaticoLiquidation[];
  activeLiquidationId: string;
  lastSavedAtIso: string | null;
  hasUnsavedChanges: boolean;
}

// ============================================================================
// Panel de Actividades (Cierre Contable, Gmail & Google Tasks Sync)
// ============================================================================

export type ActivitiesTab = 'matriz' | 'pendientes' | 'sincronizacion' | 'configuracion';

export type ActivityPeriodicity = 'MENSUAL' | 'TRIMESTRAL' | 'SEMANAL' | 'ANUAL';

export type ActivityStatus = 'pendiente' | 'realizada';

export interface ActivitySociety {
  id: string;
  codigo: string;
  nombre: string;
  /** País de la empresa para calcular días hábiles según sus feriados oficiales (ej. 'Colombia', 'Guatemala', 'Estados Unidos') */
  pais?: string;
  /** Uno o varios responsables asignados directamente a esta sociedad */
  responsablesIds?: string[];
  activa: boolean;
}

export interface ActivityResponsible {
  id: string;
  nombre: string;
  email: string;
  cargo?: string;
  /** Correos de responsables/destinatarios a quienes notificar cuando este usuario cumpla actividades o cierre el periodo */
  notificarA?: string[];
  activo: boolean;
}

export interface ActivityTemplate {
  id: string;
  nombre: string;
  periodicidad: ActivityPeriodicity;
  /** Día hábil sugerido del mes siguiente al cierre para cumplimiento (1..31; excluye sábados, domingos y feriados oficiales del país de cada empresa) */
  diaSugerido: number;
  descripcion?: string;
  /** Mapa codigoSociedad -> lista de responsibleIds (vacío si no aplica a esa sociedad) */
  responsablesPorSociedad: Record<string, string[]>;
  /** Si es true, activa automáticamente para los responsables de cada sociedad sin asignación manual previa */
  aplicarATodosResponsables?: boolean;
  /** Correos adicionales específicos de esta actividad para notificar cumplimiento */
  notificarAdicionales?: string[];
  activa: boolean;
}

export interface ActivityGoogleTaskLink {
  taskId: string;
  taskListId: string;
  syncedAtIso: string;
}

export interface ActivityExecutionRecord {
  id: string; // `${periodKey}__${activityId}__${societyCode}`
  periodKey: string; // YYYY-MM (ej. '2026-11')
  activityId: string;
  societyCode: string;
  responsibleId: string;
  responsibleName: string;
  responsibleEmail: string;
  responsibleIds?: string[];
  responsibleNames?: string[];
  responsibleEmails?: string[];
  fechaSugerida: string; // YYYY-MM-DD
  estado: ActivityStatus;
  completadaAtIso?: string;
  completadaPorNombre?: string;
  completadaPorEmail?: string;
  origenConfirmacion?: 'panel' | 'google_tasks';
  comentarioCierre?: string;
  ultimoRecordatorioIso?: string;
  recordatoriosEnviadosCount?: number;
  notificacionCierreEnviadaIso?: string;
  notificacionCierreDestinatarios?: string[];
  googleTaskId?: string;
  googleTaskListId?: string;
  googleTaskOwnerEmail?: string;
  googleTaskSyncedAtIso?: string;
  /** Mapa claveSeguraDeCorreo -> enlace de Google Task por cuenta Gmail */
  googleTasksByEmail?: Record<string, ActivityGoogleTaskLink>;
}

export interface ActivityNotificationRecipient {
  id: string;
  nombre: string;
  email: string;
  tipo: 'administrador' | 'designado';
  activo: boolean;
}

export interface ActivitiesWorkspaceData {
  docId: string;
  selectedPeriod: string; // YYYY-MM
  societies: ActivitySociety[];
  responsibles: ActivityResponsible[];
  activities: ActivityTemplate[];
  executions: Record<string, ActivityExecutionRecord>;
  notificationRecipients: ActivityNotificationRecipient[];
  notifyAdminsAutomatically: boolean;
  subtleReminderDaysBefore: number;
  lastGoogleTasksSyncIso: string | null;
  lastSavedAtIso: string | null;
  hasUnsavedChanges: boolean;
}
