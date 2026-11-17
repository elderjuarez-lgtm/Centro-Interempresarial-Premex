export type ReconciliationScope = 'internacionales' | 'nacionales';

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

export type ActiveModuleId = 'launcher' | 'intercompany' | 'bancos' | 'viaticos' | 'ajustes';

export type FunctionalModuleId =
  | 'intercompany'
  | 'bancos'
  | 'viaticos'
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

export type BankTab = 'resumen' | 'cruce' | 'pendientes' | 'cuentas' | 'carga';

export type BankCurrency = 'USD' | 'COP' | 'GTQ' | 'MXN' | 'EUR';

export type BankAccountType = 'Corriente' | 'Ahorros' | 'Recaudadora';

export interface BankAccount {
  id: string;
  banco: string;
  numeroCuenta: string;
  sociedad: string;
  pais: string;
  moneda: BankCurrency;
  tipoCuenta: BankAccountType;
  saldoInicialLibros: number;
  saldoFinalExtracto: number;
  saldoFinalLibros: number;
}

export type BankPendingCategory =
  | 'deposito_transito'
  | 'cheque_transito'
  | 'nota_debito'
  | 'nota_credito'
  | 'por_identificar';

export interface BankStatementItem {
  id: string;
  cuentaId: string;
  fecha: string;
  referencia: string;
  descripcion: string;
  /** En extracto bancario: CREDITO = abono/entrada de dinero (+), DEBITO = cargo/salida de dinero (-) */
  tipo: 'CREDITO' | 'DEBITO';
  valor: number;
  mes: string;
  categoriaPendiente?: BankPendingCategory;
  comentario?: string;
}

export interface BookLedgerItem {
  id: string;
  cuentaId: string;
  fecha: string;
  comprobante: string;
  tercero: string;
  descripcion: string;
  /** En auxiliar contable de bancos: DEBITO = entrada a bancos (+), CREDITO = salida de bancos (-) */
  tipo: 'DEBITO' | 'CREDITO';
  valor: number;
  mes: string;
  categoriaPendiente?: BankPendingCategory;
  comentario?: string;
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
  saldoExtracto: number;
  depositosEnTransito: number;
  chequesEnTransito: number;
  saldoConciliadoExtracto: number;
  saldoLibros: number;
  notasCreditoNoContabilizadas: number;
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
  matchedBankIds: Set<string>;
  matchedLedgerIds: Set<string>;
}

// ============================================================================
// Liquidación de Viáticos Types
// ============================================================================

export type ViaticosTab = 'liquidador' | 'historial';

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

export interface ViaticosWorkspaceData {
  docId: string;
  consultores: ViaticoConsultor[];
  liquidaciones: ViaticoLiquidation[];
  activeLiquidationId: string;
  lastSavedAtIso: string | null;
  hasUnsavedChanges: boolean;
}



