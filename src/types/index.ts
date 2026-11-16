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

