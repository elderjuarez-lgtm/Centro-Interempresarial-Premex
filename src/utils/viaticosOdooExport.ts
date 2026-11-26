import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  OdooDistributionMode,
  OdooExpenseType,
  UserPermissionRecord,
  ViaticoCategory,
  ViaticoConsultor,
  ViaticoCurrency,
  ViaticoLiquidation,
  ViaticoLiquidationStatus,
  ViaticoOdooCatalogs,
  ViaticoOdooConfig,
} from '../types';
import {
  formatViaticoAmount,
  resolveLiquidationCostCenter,
  roundMoney,
} from './viaticos';
import {
  buildDefaultPaymentReference,
  findMatchingCostCenterEntry,
  formatAnalyticDistributionJson,
  mergeOdooCatalogsWithDefaults,
  resolveDistributionTaxIndicator,
  resolveEmployeeAndCostCenterForLiquidation,
  resolveExpenseTypeForItem,
  resolveSplitCostCentersList,
  suggestOdooDocTypeForItem,
  suggestOdooExpenseCodeForItem,
  suggestOdooTaxIndicatorForItem,
  VIATICO_CURRENCY_TO_ISO,
} from './viaticosOdooCatalogs';

export interface OdooExpenseUploadRow {
  rowKey: string;
  liquidationId: string;
  itemId: string;
  semana: string;
  empresa: string;
  consultorEmail: string;
  costCenterLabel: string;
  registeredByEmail?: string;
  registeredByName?: string;
  // Distribution metadata & generated sub-row markers
  isGeneratedSubRow?: boolean;
  parentRowKey?: string;
  generatedReason?: string;
  splitIndex?: number;
  splitTotal?: number;
  originalTotalAmountCurrency?: number;
  odooDistributionOptionId?: string;
  odooDistributionMode?: OdooDistributionMode;
  odooDistributionValue?: number;
  odooSplitCount?: number;
  odooSplitCostCentersText?: string;
  odooSplitCostCenters?: string[];
  // Exact 15 Plantilla_Gastos_GT_S-44 Sheet 1 Odoo columns:
  name: string;
  product_id: string;
  total_amount_currency: number;
  currency_id: string;
  tax_ids: string;
  employee_id: string;
  expense_type: OdooExpenseType;
  date: string; // YYYY-MM-DD
  Partner_id: string;
  Journal: string;
  vendor_ref: string;
  serial_number: string;
  payment_reference: string;
  l10n_gt_edi_doc_type: string;
  analytic_distribution: string;
}

export interface OdooConsolidatedExpenseRow {
  rowKey: string;
  liquidationId: string;
  semana: string;
  lineaLiquidacion: string;
  estado: ViaticoLiquidationStatus;
  empresa: string;
  consultorId: string;
  consultorNombre: string;
  consultorEmail: string;
  centroCosto: string;
  monedaBase: ViaticoCurrency;
  fechaContableIso: string;
  fechaDoc: string;
  fechaDocIso: string;
  serieDoc: string;
  noDoc: string;
  documentoCompleto: string;
  nit: string;
  proveedor: string;
  categoria: ViaticoCategory;
  cuentaGastoCodigo: string;
  cuentaGastoNombre: string;
  etiquetaImpuestoOdoo: string;
  aplicaImpuestos: boolean;
  porcentajeImpuesto: number;
  monedaFactura: ViaticoCurrency;
  valorFactura: number;
  tipoCambio: number;
  baseReintegrar: number;
  impuestoReintegrar: number;
  valorReintegrar: number;
  clienteContacto: string;
  objetivoComercial: string;
  descripcionGasto: string;
  kilometraje: string;
  attachmentId?: string;
  attachmentName?: string;
  attachmentMimeType?: string;
}

export interface OdooJournalLine {
  lineKey: string;
  moveExternalId: string;
  isFirstLineOfMove: boolean;
  asientoRef: string;
  fechaContable: string; // YYYY-MM-DD
  diario: string;
  empresa: string;
  consultor: string;
  semana: string;
  liquidationId: string;
  cuentaCodigo: string;
  cuentaNombre: string;
  partner: string;
  partnerNit: string;
  etiqueta: string;
  centroCosto: string;
  impuestoOdoo: string;
  moneda: ViaticoCurrency;
  debito: number;
  credito: number;
  tipoLinea: 'gasto' | 'iva' | 'contrapartida';
}

export interface OdooCostCenterSummaryRow {
  centroCosto: string;
  monedaBase: ViaticoCurrency;
  liquidacionesCount: number;
  facturasCount: number;
  consultores: string[];
  baseSinImpuesto: number;
  totalImpuesto: number;
  totalReintegrar: number;
}

export interface OdooAccountingDataset {
  hrExpenseRows: OdooExpenseUploadRow[];
  expenseRows: OdooConsolidatedExpenseRow[];
  journalLines: OdooJournalLine[];
  costCenterSummary: OdooCostCenterSummaryRow[];
  totalsByCurrency: {
    moneda: ViaticoCurrency;
    liquidacionesCount: number;
    facturasCount: number;
    baseSinImpuesto: number;
    totalImpuesto: number;
    totalReintegrar: number;
    totalDebito: number;
    totalCredito: number;
    isBalanced: boolean;
  }[];
  missingCostCenterConsultores: {
    consultorId: string;
    consultorNombre: string;
    consultorEmail: string;
    empresa: string;
    liquidacionesCount: number;
  }[];
}

function sanitizeSlug(text: string): string {
  return String(text || 'lote')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

export function formatOdooNitWithoutHyphen(rawNit: string | undefined): string {
  return String(rawNit || '')
    .replace(/[-‐‑‒–—]+/g, '')
    .trim();
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDdMmYyyyToIso(raw: string | undefined): string {
  const text = String(raw || '').trim();
  if (!text) return todayIso();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }
  const match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (match) {
    const dd = match[1].padStart(2, '0');
    const mm = match[2].padStart(2, '0');
    const yyyy = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return todayIso();
}

function resolveAccountingDateIso(
  liq: ViaticoLiquidation,
  itemFechaDoc: string | undefined,
  criterio: ViaticoOdooConfig['criterioFechaContable']
): string {
  if (criterio === 'fecha_hoy') return todayIso();
  if (criterio === 'fecha_factura' && itemFechaDoc) {
    return parseDdMmYyyyToIso(itemFechaDoc);
  }
  if (liq.closedAtIso) return liq.closedAtIso.slice(0, 10);
  if (liq.updatedAtIso) return liq.updatedAtIso.slice(0, 10);
  return todayIso();
}

/**
 * Consolidates multiple liquidations from all liquidadores into Odoo-ready rows,
 * mathematically balanced double-entry journal lines (account.move), and Cost Center summaries.
 */
export function buildOdooAccountingDataset(
  liquidaciones: ViaticoLiquidation[],
  consultores: ViaticoConsultor[],
  config: ViaticoOdooConfig,
  catalogs?: ViaticoOdooCatalogs,
  permissionRecords?: UserPermissionRecord[],
  options?: { expandEmployeeSplitsForDownload?: boolean }
): OdooAccountingDataset {
  const resolvedCatalogs = mergeOdooCatalogsWithDefaults(catalogs);
  const expandEmployeeSplitsForDownload = Boolean(
    options?.expandEmployeeSplitsForDownload
  );
  const hrExpenseRows: OdooExpenseUploadRow[] = [];
  const expenseRows: OdooConsolidatedExpenseRow[] = [];
  const journalLines: OdooJournalLine[] = [];

  const ccMap = new Map<
    string,
    {
      centroCosto: string;
      monedaBase: ViaticoCurrency;
      liqIds: Set<string>;
      consultoresSet: Set<string>;
      facturasCount: number;
      baseSinImpuesto: number;
      totalImpuesto: number;
      totalReintegrar: number;
    }
  >();

  const missingCCMap = new Map<
    string,
    {
      consultorId: string;
      consultorNombre: string;
      consultorEmail: string;
      empresa: string;
      liqIds: Set<string>;
    }
  >();

  const currencyTotalsMap = new Map<
    ViaticoCurrency,
    {
      moneda: ViaticoCurrency;
      liqIds: Set<string>;
      facturasCount: number;
      baseSinImpuesto: number;
      totalImpuesto: number;
      totalReintegrar: number;
      totalDebito: number;
      totalCredito: number;
    }
  >();

  const ensureCurrencyBucket = (moneda: ViaticoCurrency) => {
    let bucket = currencyTotalsMap.get(moneda);
    if (!bucket) {
      bucket = {
        moneda,
        liqIds: new Set<string>(),
        facturasCount: 0,
        baseSinImpuesto: 0,
        totalImpuesto: 0,
        totalReintegrar: 0,
        totalDebito: 0,
        totalCredito: 0,
      };
      currencyTotalsMap.set(moneda, bucket);
    }
    return bucket;
  };

  liquidaciones.forEach((liq, liqIndex) => {
    if (!liq.items || liq.items.length === 0) return;

    const resolvedMeta = resolveEmployeeAndCostCenterForLiquidation({
      liquidation: liq,
      consultores,
      catalogs: resolvedCatalogs,
      permissionRecords,
    });
    const fallbackCC = resolveLiquidationCostCenter(
      liq,
      consultores,
      resolvedCatalogs,
      permissionRecords
    );
    const resolvedCC = resolvedMeta.costCenterLabel || fallbackCC;
    const displayCC = resolvedCC || 'Sin Centro de Costo';

    if (!resolvedCC) {
      const missingKey = (liq.consultorEmail || liq.consultorId || liq.consultorNombre).toLowerCase();
      const existing = missingCCMap.get(missingKey);
      if (existing) {
        existing.liqIds.add(liq.id);
      } else {
        missingCCMap.set(missingKey, {
          consultorId: liq.consultorId,
          consultorNombre: liq.consultorNombre,
          consultorEmail: liq.consultorEmail,
          empresa: liq.empresa,
          liqIds: new Set([liq.id]),
        });
      }
    }

    const currencyBucket = ensureCurrencyBucket(liq.monedaBase);
    currencyBucket.liqIds.add(liq.id);

    const ccKey = `${displayCC}__${liq.monedaBase}`;
    let ccBucket = ccMap.get(ccKey);
    if (!ccBucket) {
      ccBucket = {
        centroCosto: displayCC,
        monedaBase: liq.monedaBase,
        liqIds: new Set<string>(),
        consultoresSet: new Set<string>(),
        facturasCount: 0,
        baseSinImpuesto: 0,
        totalImpuesto: 0,
        totalReintegrar: 0,
      };
      ccMap.set(ccKey, ccBucket);
    }
    ccBucket.liqIds.add(liq.id);
    ccBucket.consultoresSet.add(liq.consultorNombre);

    const moveDate = resolveAccountingDateIso(
      liq,
      liq.items[0]?.fechaDoc,
      config.criterioFechaContable
    );
    const prefix = (config.prefijoReferencia || 'VIAT').trim().toUpperCase();
    const shortConsultor = sanitizeSlug(liq.consultorNombre).toUpperCase().slice(0, 18);
    const asientoRef = `${prefix}-S${sanitizeSlug(liq.semana || '00')}-${shortConsultor}`;
    const moveExternalId = `__export__.viat_${sanitizeSlug(liq.semana || '00')}_${liqIndex + 1}_${sanitizeSlug(
      liq.id
    ).slice(-6)}`;

    let moveDebitSum = 0;
    let moveLineCounter = 0;

    liq.items.forEach((item, itemIdx) => {
      const fx = item.tipoCambio > 0 ? item.tipoCambio : 1;
      const valorReintegrar = roundMoney(item.valorReintegrar);
      const impuestoReintegrar = item.aplicaImpuestos
        ? roundMoney(Math.min(valorReintegrar, roundMoney(item.montoImpuesto * fx)))
        : 0;
      // Compute base as (total - tax) so base + tax ALWAYS equals exact valorReintegrar
      const baseReintegrar = roundMoney(Math.max(0, valorReintegrar - impuestoReintegrar));

      const catAccount =
        config.cuentasPorCategoria[item.categoria] ||
        config.cuentasPorCategoria['Otros Gastos'];

      const docFull = [item.serieDoc, item.noDoc].filter(Boolean).join('-') || 'S/N';
      const fechaDocIso = parseDdMmYyyyToIso(item.fechaDoc);
      const itemAccountingDate =
        config.criterioFechaContable === 'fecha_factura' ? fechaDocIso : moveDate;

      const itemProductId = suggestOdooExpenseCodeForItem(item, config, resolvedCatalogs);
      const itemDocType = suggestOdooDocTypeForItem(item, resolvedCatalogs);
      const itemTaxIndicator = suggestOdooTaxIndicatorForItem(
        item,
        itemDocType,
        resolvedCatalogs
      );
      const itemMatchedCC = item.odooCostCenterCode || item.odooAnalyticDistribution
        ? findMatchingCostCenterEntry(
            item.odooCostCenterCode || resolvedCC,
            item.odooAnalyticDistribution || resolvedMeta.analyticDistribution,
            resolvedCatalogs.costCenters
          )
        : resolvedMeta.matchedCostCenter;
      const itemCostCenterLabel =
        item.odooCostCenterCode || itemMatchedCC?.cuentaAnalitica || resolvedCC;
      const itemAnalyticJson =
        item.odooAnalyticDistribution ||
        itemMatchedCC?.analyticDistribution ||
        resolvedMeta.analyticDistribution ||
        '';
      const itemExpenseType = resolveExpenseTypeForItem(item, resolvedCatalogs);
      const itemJournal =
        item.odooJournal || resolvedCatalogs.defaultJournalName || 'PROV. CAJAS CHICAS';
      const itemPaymentRef =
        item.odooPaymentReference || buildDefaultPaymentReference(liq);
      const itemName =
        (item.descripcionGasto || '').trim().slice(0, 180) ||
        item.categoria;

      const baseRowKey = `${liq.id}__${item.id || itemIdx}`;
      const settlementAmount = roundMoney(item.valorReintegrar);
      const currencyIso = VIATICO_CURRENCY_TO_ISO[liq.monedaBase] || 'GTQ';
      const distOpt = item.odooDistributionOptionId
        ? resolvedCatalogs.expenseDistributions.find(
            (d) => d.id === item.odooDistributionOptionId
          )
        : undefined;

      const commonRowFields = {
        liquidationId: liq.id,
        itemId: item.id,
        semana: liq.semana || '-',
        empresa: liq.empresa,
        consultorEmail: liq.consultorEmail,
        registeredByEmail: item.registeredByEmail,
        registeredByName: item.registeredByName,
        currency_id: currencyIso,
        employee_id: resolvedMeta.employeeName,
        expense_type: itemExpenseType,
        date: fechaDocIso,
        Partner_id: formatOdooNitWithoutHyphen(item.nit),
        Journal: itemJournal,
        vendor_ref: item.noDoc || '',
        serial_number: item.serieDoc || '',
        payment_reference: itemPaymentRef,
        l10n_gt_edi_doc_type: itemDocType,
        originalTotalAmountCurrency: settlementAmount,
        odooDistributionOptionId: distOpt?.id || item.odooDistributionOptionId,
        odooDistributionMode: distOpt?.mode,
        odooDistributionValue: item.odooDistributionValue,
        odooSplitCount: item.odooSplitCount,
        odooSplitCostCentersText: item.odooSplitCostCentersText,
        odooSplitCostCenters: item.odooSplitCostCenters,
      };

      const itemHrRows: OdooExpenseUploadRow[] = [];

      if (distOpt && distOpt.mode === 'extra_charge') {
        const extraVal = roundMoney(
          Math.max(0, Math.min(settlementAmount, Number(item.odooDistributionValue) || 0))
        );
        const mainAmount =
          extraVal > 0 ? roundMoney(Math.max(0, settlementAmount - extraVal)) : settlementAmount;

        itemHrRows.push({
          ...commonRowFields,
          rowKey: baseRowKey,
          costCenterLabel: itemCostCenterLabel,
          name: itemName,
          product_id: itemProductId,
          total_amount_currency: mainAmount,
          tax_ids: itemTaxIndicator,
          analytic_distribution: itemAnalyticJson,
        });

        if (extraVal > 0) {
          const extraTax = resolveDistributionTaxIndicator(
            distOpt.naturaleza,
            resolvedCatalogs,
            distOpt.taxIndicatorName
          );
          const taxTag = distOpt.naturaleza === 'servicio' ? 'XO' : 'XB';
          itemHrRows.push({
            ...commonRowFields,
            rowKey: `${baseRowKey}__dist_${distOpt.codigo}`,
            isGeneratedSubRow: true,
            parentRowKey: baseRowKey,
            generatedReason: `Adicional ${distOpt.nombre} · ${taxTag}`,
            costCenterLabel: itemCostCenterLabel,
            name: `${itemName} - ${distOpt.nombre}`.slice(0, 180),
            product_id: distOpt.expenseCodeLabel || itemProductId,
            total_amount_currency: extraVal,
            tax_ids: extraTax,
            analytic_distribution: itemAnalyticJson,
          });
        }
      } else if (distOpt && distOpt.mode === 'multi_ceco') {
        const splitCount = Math.max(
          1,
          Math.min(30, Math.floor(Number(item.odooSplitCount) || 1))
        );
        if (splitCount >= 2) {
          const splitCCs = resolveSplitCostCentersList(
            item,
            resolvedCatalogs.costCenters
          );
          const totalCents = Math.round(settlementAmount * 100);
          const baseCent = Math.floor(totalCents / splitCount);
          const remainder = totalCents - baseCent * splitCount;

          for (let sIdx = 0; sIdx < splitCount; sIdx++) {
            const sliceCents = baseCent + (sIdx < remainder ? 1 : 0);
            const sliceAmount = roundMoney(sliceCents / 100);
            const targetCC = splitCCs[sIdx];
            const sliceAnalytic = targetCC?.analyticDistribution || itemAnalyticJson;
            const sliceCCLabel = targetCC?.cuentaAnalitica || itemCostCenterLabel;

            itemHrRows.push({
              ...commonRowFields,
              rowKey: sIdx === 0 ? baseRowKey : `${baseRowKey}__split_${sIdx + 1}`,
              isGeneratedSubRow: sIdx > 0,
              parentRowKey: sIdx > 0 ? baseRowKey : undefined,
              generatedReason:
                sIdx > 0
                  ? `División ${sIdx + 1}/${splitCount}${
                      targetCC ? ` · ${targetCC.codigo}` : ''
                    }`
                  : undefined,
              splitIndex: sIdx + 1,
              splitTotal: splitCount,
              costCenterLabel: sliceCCLabel,
              name: itemName,
              product_id: itemProductId,
              total_amount_currency: sliceAmount,
              tax_ids: itemTaxIndicator,
              analytic_distribution: sliceAnalytic,
            });
          }
        } else {
          itemHrRows.push({
            ...commonRowFields,
            rowKey: baseRowKey,
            costCenterLabel: itemCostCenterLabel,
            name: itemName,
            product_id: itemProductId,
            total_amount_currency: settlementAmount,
            tax_ids: itemTaxIndicator,
            analytic_distribution: itemAnalyticJson,
          });
        }
      } else {
        itemHrRows.push({
          ...commonRowFields,
          rowKey: baseRowKey,
          costCenterLabel: itemCostCenterLabel,
          name: itemName,
          product_id: itemProductId,
          total_amount_currency: settlementAmount,
          tax_ids: itemTaxIndicator,
          analytic_distribution: itemAnalyticJson,
        });
      }

      const splitEmpList = Array.isArray(item.splitEmployeeNames)
        ? item.splitEmployeeNames
            .map((n) => String(n || '').trim().toUpperCase())
            .filter(Boolean)
        : [];

      if (
        expandEmployeeSplitsForDownload &&
        (item.splitByEmployeesCount || 0) >= 2 &&
        splitEmpList.length >= 2
      ) {
        const empSplitCount = splitEmpList.length;
        itemHrRows.forEach((baseRow) => {
          const totalCents = Math.round(baseRow.total_amount_currency * 100);
          const baseCent = Math.floor(totalCents / empSplitCount);
          const remainder = totalCents - baseCent * empSplitCount;

          splitEmpList.forEach((empName, eIdx) => {
            const sliceCents = baseCent + (eIdx < remainder ? 1 : 0);
            const sliceAmount = roundMoney(sliceCents / 100);
            const matchedEmp = resolvedCatalogs.employees.find(
              (e) => e.nombreCompleto.trim().toUpperCase() === empName
            );
            const matchedEmpCC =
              matchedEmp?.centroCosto || matchedEmp?.analyticDistribution
                ? findMatchingCostCenterEntry(
                    matchedEmp.centroCosto || '',
                    matchedEmp.analyticDistribution || '',
                    resolvedCatalogs.costCenters
                  )
                : null;
            const empAnalytic =
              baseRow.splitTotal && baseRow.splitTotal >= 2
                ? baseRow.analytic_distribution
                : formatAnalyticDistributionJson(
                    matchedEmpCC?.analyticDistribution ||
                      matchedEmp?.analyticDistribution ||
                      ''
                  ) || baseRow.analytic_distribution;
            const empCCLabel =
              baseRow.splitTotal && baseRow.splitTotal >= 2
                ? baseRow.costCenterLabel
                : matchedEmpCC?.cuentaAnalitica ||
                  matchedEmp?.centroCosto ||
                  baseRow.costCenterLabel;

            hrExpenseRows.push({
              ...baseRow,
              rowKey: `${baseRow.rowKey}__emp_${eIdx + 1}`,
              isGeneratedSubRow: baseRow.isGeneratedSubRow || eIdx > 0,
              parentRowKey: eIdx > 0 ? baseRow.rowKey : baseRow.parentRowKey,
              generatedReason:
                baseRow.generatedReason ||
                `División gasto ${eIdx + 1}/${empSplitCount}${
                  empCCLabel ? ` · ${empCCLabel}` : ''
                }`,
              employee_id: baseRow.employee_id,
              costCenterLabel: empCCLabel,
              analytic_distribution: empAnalytic,
              total_amount_currency: sliceAmount,
            });
          });
        });
      } else {
        hrExpenseRows.push(...itemHrRows);
      }

      const row: OdooConsolidatedExpenseRow = {
        rowKey: `${liq.id}__${item.id || itemIdx}`,
        liquidationId: liq.id,
        semana: liq.semana || '-',
        lineaLiquidacion: liq.lineaLiquidacion,
        estado: liq.estado,
        empresa: liq.empresa,
        consultorId: liq.consultorId,
        consultorNombre: liq.consultorNombre,
        consultorEmail: liq.consultorEmail,
        centroCosto: itemCostCenterLabel,
        monedaBase: liq.monedaBase,
        fechaContableIso: itemAccountingDate,
        fechaDoc: item.fechaDoc || '',
        fechaDocIso,
        serieDoc: item.serieDoc || '',
        noDoc: item.noDoc || '',
        documentoCompleto: docFull,
        nit: item.nit || '',
        proveedor: item.proveedor || 'Sin proveedor',
        categoria: item.categoria,
        cuentaGastoCodigo: catAccount.accountCode,
        cuentaGastoNombre: catAccount.accountName,
        etiquetaImpuestoOdoo: itemTaxIndicator || (item.aplicaImpuestos ? config.etiquetaImpuesto : ''),
        aplicaImpuestos: item.aplicaImpuestos,
        porcentajeImpuesto: item.aplicaImpuestos ? item.porcentajeImpuesto : 0,
        monedaFactura: item.moneda,
        valorFactura: roundMoney(item.valorFactura),
        tipoCambio: fx,
        baseReintegrar,
        impuestoReintegrar,
        valorReintegrar,
        clienteContacto: item.clienteContacto || '',
        objetivoComercial: item.objetivoComercial || '',
        descripcionGasto: item.descripcionGasto || '',
        kilometraje: item.kilometraje || '',
        attachmentId: item.attachmentId,
        attachmentName: item.attachmentName,
        attachmentMimeType: item.attachmentMimeType,
      };

      expenseRows.push(row);

      ccBucket!.facturasCount += 1;
      ccBucket!.baseSinImpuesto = roundMoney(ccBucket!.baseSinImpuesto + baseReintegrar);
      ccBucket!.totalImpuesto = roundMoney(ccBucket!.totalImpuesto + impuestoReintegrar);
      ccBucket!.totalReintegrar = roundMoney(ccBucket!.totalReintegrar + valorReintegrar);

      currencyBucket.facturasCount += 1;
      currencyBucket.baseSinImpuesto = roundMoney(currencyBucket.baseSinImpuesto + baseReintegrar);
      currencyBucket.totalImpuesto = roundMoney(currencyBucket.totalImpuesto + impuestoReintegrar);
      currencyBucket.totalReintegrar = roundMoney(currencyBucket.totalReintegrar + valorReintegrar);

      const lineLabel = [
        item.categoria,
        item.proveedor,
        docFull !== 'S/N' ? `Doc ${docFull}` : '',
        item.descripcionGasto ? `— ${item.descripcionGasto}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 180);

      // 1) Debit Expense Line (Base if taxable, full amount if exempt)
      if (baseReintegrar > 0) {
        journalLines.push({
          lineKey: `${liq.id}__${item.id || itemIdx}__exp`,
          moveExternalId,
          isFirstLineOfMove: moveLineCounter === 0,
          asientoRef,
          fechaContable: moveDate,
          diario: config.diarioNombre || 'Liquidación de Viáticos',
          empresa: liq.empresa,
          consultor: liq.consultorNombre,
          semana: liq.semana || '-',
          liquidationId: liq.id,
          cuentaCodigo: catAccount.accountCode,
          cuentaNombre: catAccount.accountName,
          partner: item.proveedor || liq.consultorNombre,
          partnerNit: item.nit || '',
          etiqueta: lineLabel,
          centroCosto: resolvedCC,
          impuestoOdoo: item.aplicaImpuestos ? config.etiquetaImpuesto : '',
          moneda: liq.monedaBase,
          debito: baseReintegrar,
          credito: 0,
          tipoLinea: 'gasto',
        });
        moveDebitSum = roundMoney(moveDebitSum + baseReintegrar);
        currencyBucket.totalDebito = roundMoney(currencyBucket.totalDebito + baseReintegrar);
        moveLineCounter += 1;
      }

      // 2) Debit IVA Crédito Fiscal Line (when item has tax)
      if (impuestoReintegrar > 0) {
        journalLines.push({
          lineKey: `${liq.id}__${item.id || itemIdx}__iva`,
          moveExternalId,
          isFirstLineOfMove: moveLineCounter === 0,
          asientoRef,
          fechaContable: moveDate,
          diario: config.diarioNombre || 'Liquidación de Viáticos',
          empresa: liq.empresa,
          consultor: liq.consultorNombre,
          semana: liq.semana || '-',
          liquidationId: liq.id,
          cuentaCodigo: config.cuentaIvaCodigo || '1140101',
          cuentaNombre: config.cuentaIvaNombre || 'IVA Crédito Fiscal',
          partner: item.proveedor || liq.consultorNombre,
          partnerNit: item.nit || '',
          etiqueta: `IVA ${item.porcentajeImpuesto}% · ${item.proveedor} · Doc ${docFull}`,
          centroCosto: resolvedCC,
          impuestoOdoo: config.etiquetaImpuesto || '',
          moneda: liq.monedaBase,
          debito: impuestoReintegrar,
          credito: 0,
          tipoLinea: 'iva',
        });
        moveDebitSum = roundMoney(moveDebitSum + impuestoReintegrar);
        currencyBucket.totalDebito = roundMoney(currencyBucket.totalDebito + impuestoReintegrar);
        moveLineCounter += 1;
      }
    });

    // 3) Balanced Credit Line (Viáticos por Pagar / Reembolsar al Consultor)
    if (moveDebitSum > 0) {
      journalLines.push({
        lineKey: `${liq.id}__payable`,
        moveExternalId,
        isFirstLineOfMove: moveLineCounter === 0,
        asientoRef,
        fechaContable: moveDate,
        diario: config.diarioNombre || 'Liquidación de Viáticos',
        empresa: liq.empresa,
        consultor: liq.consultorNombre,
        semana: liq.semana || '-',
        liquidationId: liq.id,
        cuentaCodigo: config.cuentaContrapartidaCodigo || '2110201',
        cuentaNombre: config.cuentaContrapartidaNombre || 'Viáticos por Reembolsar Empleados',
        partner: liq.consultorNombre,
        partnerNit: '',
        etiqueta: `Reembolso Liquidación Sem #${liq.semana || '-'} · ${liq.lineaLiquidacion} · ${liq.consultorNombre}`,
        centroCosto: resolvedCC,
        impuestoOdoo: '',
        moneda: liq.monedaBase,
        debito: 0,
        credito: moveDebitSum,
        tipoLinea: 'contrapartida',
      });
      currencyBucket.totalCredito = roundMoney(currencyBucket.totalCredito + moveDebitSum);
    }
  });

  const costCenterSummary: OdooCostCenterSummaryRow[] = Array.from(ccMap.values())
    .map((b) => ({
      centroCosto: b.centroCosto,
      monedaBase: b.monedaBase,
      liquidacionesCount: b.liqIds.size,
      facturasCount: b.facturasCount,
      consultores: Array.from(b.consultoresSet).sort((a, bName) => a.localeCompare(bName)),
      baseSinImpuesto: b.baseSinImpuesto,
      totalImpuesto: b.totalImpuesto,
      totalReintegrar: b.totalReintegrar,
    }))
    .sort((a, b) => b.totalReintegrar - a.totalReintegrar);

  const totalsByCurrency = Array.from(currencyTotalsMap.values()).map((b) => ({
    moneda: b.moneda,
    liquidacionesCount: b.liqIds.size,
    facturasCount: b.facturasCount,
    baseSinImpuesto: b.baseSinImpuesto,
    totalImpuesto: b.totalImpuesto,
    totalReintegrar: b.totalReintegrar,
    totalDebito: b.totalDebito,
    totalCredito: b.totalCredito,
    isBalanced: Math.abs(b.totalDebito - b.totalCredito) < 0.01,
  }));

  const missingCostCenterConsultores = Array.from(missingCCMap.values()).map((m) => ({
    consultorId: m.consultorId,
    consultorNombre: m.consultorNombre,
    consultorEmail: m.consultorEmail,
    empresa: m.empresa,
    liquidacionesCount: m.liqIds.size,
  }));

  return {
    hrExpenseRows,
    expenseRows,
    journalLines,
    costCenterSummary,
    totalsByCurrency,
    missingCostCenterConsultores,
  };
}

/**
 * Exports a 4-worksheet Excel (.xlsx) accounting workbook ready for Odoo import:
 * 1) Carga_Odoo_Gastos (Exact 15 columns of Plantilla_Gastos_GT_S-44 Sheet 1 for Odoo hr.expense)
 * 2) Carga_Odoo_Asientos (official Odoo account.move multi-line import columns)
 * 3) Detalle_Consolidado_Facturas (flat multi-liquidador invoice table with Cost Center)
 * 4) Resumen_Centro_Costo (aggregated totals by Cost Center & currency)
 */
export async function exportViaticosOdooExcel(
  dataset: OdooAccountingDataset,
  config: ViaticoOdooConfig,
  batchLabel = 'Consolidado'
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Suite Corporativa Premex · Contabilidad';
  wb.created = new Date();

  const headerStyle = (row: ExcelJS.Row) => {
    row.height = 26;
    row.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF132B63' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF0F172A' } },
        bottom: { style: 'thin', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        right: { style: 'thin', color: { argb: 'FF334155' } },
      };
    });
  };

  // ============================================================================
  // SHEET 1: Carga_Odoo_Gastos (Exact Plantilla Gastos GT S-44 15-Column Format)
  // ============================================================================
  const wsExpense = wb.addWorksheet('Carga_Odoo_Gastos', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  wsExpense.columns = [
    { header: 'name', width: 34 },
    { header: 'product_id', width: 32 },
    { header: 'total_amount_currency', width: 20 },
    { header: 'currency_id', width: 12 },
    { header: 'tax_ids', width: 42 },
    { header: 'employee_id', width: 32 },
    { header: 'expense_type', width: 14 },
    { header: 'date', width: 13 },
    { header: 'Partner_id', width: 16 },
    { header: 'Journal', width: 22 },
    { header: 'vendor_ref', width: 18 },
    { header: 'serial_number', width: 16 },
    { header: 'payment_reference', width: 34 },
    { header: 'l10n_gt_edi_doc_type', width: 34 },
    { header: 'analytic_distribution', width: 22 },
  ];
  headerStyle(wsExpense.getRow(1));

  dataset.hrExpenseRows.forEach((row) => {
    const r = wsExpense.addRow([
      row.name,
      row.product_id,
      roundMoney(row.total_amount_currency),
      row.currency_id,
      row.tax_ids,
      row.employee_id,
      row.expense_type,
      row.date,
      formatOdooNitWithoutHyphen(row.Partner_id),
      row.Journal,
      row.vendor_ref,
      row.serial_number,
      row.payment_reference,
      row.l10n_gt_edi_doc_type,
      row.analytic_distribution,
    ]);
    r.height = 20;
    const amtCell = r.getCell(3);
    amtCell.numFmt = '#,##0.00';
    amtCell.alignment = { horizontal: 'right', vertical: 'middle' };
    r.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
    });
  });

  // ============================================================================
  // SHEET 2: Carga_Odoo_Asientos (account.move import structure)
  // ============================================================================
  const wsMove = wb.addWorksheet('Carga_Odoo_Asientos', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  wsMove.columns = [
    { header: 'id', width: 28 },
    { header: 'ref', width: 26 },
    { header: 'date', width: 13 },
    { header: 'journal_id', width: 24 },
    { header: 'line_ids/account_id', width: 18 },
    { header: 'Cuenta (Referencia)', width: 32 },
    { header: 'line_ids/partner_id', width: 28 },
    { header: 'NIT', width: 14 },
    { header: 'line_ids/name', width: 42 },
    { header: 'line_ids/analytic_distribution', width: 26 },
    { header: 'line_ids/tax_ids', width: 18 },
    { header: 'line_ids/debit', width: 15 },
    { header: 'line_ids/credit', width: 15 },
    { header: 'Moneda', width: 14 },
    { header: 'Empresa', width: 20 },
    { header: 'Consultor', width: 24 },
    { header: 'Semana', width: 10 },
  ];
  headerStyle(wsMove.getRow(1));

  dataset.journalLines.forEach((line) => {
    const r = wsMove.addRow([
      line.isFirstLineOfMove ? line.moveExternalId : '',
      line.isFirstLineOfMove ? line.asientoRef : '',
      line.isFirstLineOfMove ? line.fechaContable : '',
      line.isFirstLineOfMove ? line.diario : '',
      line.cuentaCodigo,
      line.cuentaNombre,
      line.partner,
      line.partnerNit,
      line.etiqueta,
      line.centroCosto || '',
      line.impuestoOdoo,
      roundMoney(line.debito),
      roundMoney(line.credito),
      line.moneda,
      line.empresa,
      line.consultor,
      line.semana,
    ]);
    r.height = 20;
    [12, 13].forEach((colIdx) => {
      const cell = r.getCell(colIdx);
      cell.numFmt = '#,##0.00';
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    });
    if (line.tipoLinea === 'contrapartida') {
      r.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF132B63' } };
      });
    } else {
      r.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
      });
    }
  });

  if (dataset.journalLines.length > 0) {
    const lastIdx = dataset.journalLines.length + 1;
    const totalRow = wsMove.addRow([
      '',
      'TOTALES CONTROL',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      {
        formula: `SUM(L2:L${lastIdx})`,
        result: roundMoney(dataset.journalLines.reduce((s, l) => s + l.debito, 0)),
      },
      {
        formula: `SUM(M2:M${lastIdx})`,
        result: roundMoney(dataset.journalLines.reduce((s, l) => s + l.credito, 0)),
      },
      '',
      '',
      '',
      '',
    ]);
    totalRow.height = 22;
    totalRow.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF132B63' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCEEF5' } };
      if (colNumber === 12 || colNumber === 13) {
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
    });
  }

  // ============================================================================
  // SHEET 2: Detalle_Consolidado_Facturas
  // ============================================================================
  const wsDetail = wb.addWorksheet('Detalle_Consolidado_Facturas', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  wsDetail.columns = [
    { header: 'Empresa', width: 20 },
    { header: 'Semana', width: 10 },
    { header: 'Estado', width: 13 },
    { header: 'Liquidación', width: 26 },
    { header: 'Consultor / Liquidador', width: 24 },
    { header: 'Correo', width: 28 },
    { header: 'Centro de Costo', width: 26 },
    { header: 'Fecha Contable', width: 14 },
    { header: 'Fecha Doc.', width: 13 },
    { header: 'Serie', width: 12 },
    { header: 'No. Doc.', width: 16 },
    { header: 'NIT', width: 14 },
    { header: 'Proveedor', width: 26 },
    { header: 'Categoría', width: 20 },
    { header: 'Cuenta Contable Odoo', width: 18 },
    { header: 'Nombre Cuenta', width: 30 },
    { header: 'Aplica Imp.', width: 11 },
    { header: '% Imp.', width: 9 },
    { header: 'Moneda Factura', width: 14 },
    { header: 'Valor Factura', width: 14 },
    { header: 'Tipo Cambio', width: 12 },
    { header: 'Moneda Base', width: 14 },
    { header: 'Base Sin Impuesto', width: 16 },
    { header: 'IVA / Impuesto', width: 15 },
    { header: 'Total Reintegrar', width: 16 },
    { header: 'Cliente / Contacto', width: 24 },
    { header: 'Objetivo Comercial', width: 24 },
    { header: 'Descripción del Gasto', width: 32 },
    { header: 'Kilometraje', width: 12 },
  ];
  headerStyle(wsDetail.getRow(1));

  dataset.expenseRows.forEach((row) => {
    const r = wsDetail.addRow([
      row.empresa,
      row.semana,
      row.estado === 'enviada' ? 'Enviada' : row.estado === 'cerrada' ? 'Cerrada' : 'Abierta',
      row.lineaLiquidacion,
      row.consultorNombre,
      row.consultorEmail,
      row.centroCosto || 'Sin asignar',
      row.fechaContableIso,
      row.fechaDoc,
      row.serieDoc,
      row.noDoc,
      row.nit,
      row.proveedor,
      row.categoria,
      row.cuentaGastoCodigo,
      row.cuentaGastoNombre,
      row.aplicaImpuestos ? 'Sí' : 'No',
      row.porcentajeImpuesto,
      row.monedaFactura,
      row.valorFactura,
      row.tipoCambio,
      row.monedaBase,
      row.baseReintegrar,
      row.impuestoReintegrar,
      row.valorReintegrar,
      row.clienteContacto,
      row.objetivoComercial,
      row.descripcionGasto,
      row.kilometraje,
    ]);
    r.height = 20;
    [20, 21, 23, 24, 25].forEach((cIdx) => {
      const cell = r.getCell(cIdx);
      cell.numFmt = '#,##0.00';
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    });
  });

  // ============================================================================
  // SHEET 3: Resumen_Centro_Costo
  // ============================================================================
  const wsCC = wb.addWorksheet('Resumen_Centro_Costo', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  wsCC.columns = [
    { header: 'Centro de Costo', width: 30 },
    { header: 'Moneda Base', width: 16 },
    { header: 'Liquidaciones', width: 14 },
    { header: 'Facturas', width: 12 },
    { header: 'Base Sin Impuesto', width: 18 },
    { header: 'IVA / Impuesto', width: 16 },
    { header: 'Total a Contabilizar', width: 20 },
    { header: 'Consultores Incluidos', width: 42 },
  ];
  headerStyle(wsCC.getRow(1));

  dataset.costCenterSummary.forEach((cc) => {
    const r = wsCC.addRow([
      cc.centroCosto,
      cc.monedaBase,
      cc.liquidacionesCount,
      cc.facturasCount,
      cc.baseSinImpuesto,
      cc.totalImpuesto,
      cc.totalReintegrar,
      cc.consultores.join(', '),
    ]);
    r.height = 22;
    [5, 6, 7].forEach((cIdx) => {
      const cell = r.getCell(cIdx);
      cell.numFmt = '#,##0.00';
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    });
    r.getCell(7).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF132B63' } };
  });

  // Add subtle Odoo config reference block at bottom of Sheet 3
  wsCC.addRow([]);
  const cfgNote = wsCC.addRow([
    `Diario Odoo: ${config.diarioNombre} (${config.diarioCodigo})`,
    `IVA: ${config.cuentaIvaCodigo}`,
    `Contrapartida: ${config.cuentaContrapartidaCodigo}`,
  ]);
  cfgNote.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const filename = `Contabilidad_Odoo_Viaticos_${sanitizeSlug(batchLabel)}_${todayIso()}.xlsx`;
  triggerBlobDownload(blob, filename);
  return filename;
}

function escapeCsvField(val: string | number | boolean | null | undefined): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Exports a UTF-8 BOM CSV file tailored for Odoo import:
 * - mode 'asientos': exact Odoo `account.move` + `line_ids/*` columns
 * - mode 'facturas': flat consolidated invoice table with Cost Center & Odoo account code
 */
export function exportViaticosOdooCsv(
  dataset: OdooAccountingDataset,
  mode: 'gastos' | 'asientos' | 'facturas',
  batchLabel = 'Consolidado'
): string {
  const rows: (string | number)[][] = [];

  if (mode === 'gastos') {
    rows.push([
      'name',
      'product_id',
      'total_amount_currency',
      'currency_id',
      'tax_ids',
      'employee_id',
      'expense_type',
      'date',
      'Partner_id',
      'Journal',
      'vendor_ref',
      'serial_number',
      'payment_reference',
      'l10n_gt_edi_doc_type',
      'analytic_distribution',
    ]);

    dataset.hrExpenseRows.forEach((row) => {
      rows.push([
        row.name,
        row.product_id,
        row.total_amount_currency.toFixed(2),
        row.currency_id,
        row.tax_ids,
        row.employee_id,
        row.expense_type,
        row.date,
        formatOdooNitWithoutHyphen(row.Partner_id),
        row.Journal,
        row.vendor_ref,
        row.serial_number,
        row.payment_reference,
        row.l10n_gt_edi_doc_type,
        row.analytic_distribution,
      ]);
    });
  } else if (mode === 'asientos') {
    rows.push([
      'id',
      'ref',
      'date',
      'journal_id',
      'line_ids/account_id',
      'line_ids/partner_id',
      'line_ids/name',
      'line_ids/analytic_distribution',
      'line_ids/tax_ids',
      'line_ids/debit',
      'line_ids/credit',
    ]);

    dataset.journalLines.forEach((line) => {
      rows.push([
        line.isFirstLineOfMove ? line.moveExternalId : '',
        line.isFirstLineOfMove ? line.asientoRef : '',
        line.isFirstLineOfMove ? line.fechaContable : '',
        line.isFirstLineOfMove ? line.diario : '',
        line.cuentaCodigo,
        line.partner,
        line.etiqueta,
        line.centroCosto || '',
        line.impuestoOdoo,
        line.debito.toFixed(2),
        line.credito.toFixed(2),
      ]);
    });
  } else {
    rows.push([
      'Empresa',
      'Semana',
      'Estado',
      'Consultor',
      'Correo',
      'Centro_de_Costo',
      'Fecha_Contable',
      'Fecha_Doc',
      'Serie',
      'No_Doc',
      'NIT',
      'Proveedor',
      'Categoria',
      'Cuenta_Odoo',
      'Nombre_Cuenta',
      'Aplica_Impuestos',
      'Porcentaje_Impuesto',
      'Moneda_Factura',
      'Valor_Factura',
      'Tipo_Cambio',
      'Moneda_Base',
      'Base_Sin_Impuesto',
      'IVA_Impuesto',
      'Valor_Reintegrar',
      'Cliente_Contacto',
      'Descripcion_Gasto',
    ]);

    dataset.expenseRows.forEach((r) => {
      rows.push([
        r.empresa,
        r.semana,
        r.estado,
        r.consultorNombre,
        r.consultorEmail,
        r.centroCosto || 'Sin asignar',
        r.fechaContableIso,
        r.fechaDoc,
        r.serieDoc,
        r.noDoc,
        formatOdooNitWithoutHyphen(r.nit),
        r.proveedor,
        r.categoria,
        r.cuentaGastoCodigo,
        r.cuentaGastoNombre,
        r.aplicaImpuestos ? 'SI' : 'NO',
        r.porcentajeImpuesto,
        r.monedaFactura,
        r.valorFactura.toFixed(2),
        String(Math.round((r.tipoCambio + Number.EPSILON) * 100000000) / 100000000),
        r.monedaBase,
        r.baseReintegrar.toFixed(2),
        r.impuestoReintegrar.toFixed(2),
        r.valorReintegrar.toFixed(2),
        r.clienteContacto,
        r.descripcionGasto,
      ]);
    });
  }

  const csvBody = rows
    .map((line) => line.map(escapeCsvField).join(','))
    .join('\r\n');
  // UTF-8 BOM guarantees accents (ñ, á, é, ó) render cleanly in Excel and Odoo
  const blob = new Blob(['\uFEFF', csvBody], { type: 'text/csv;charset=utf-8;' });
  const suffix =
    mode === 'gastos'
      ? 'Carga_Odoo_Gastos'
      : mode === 'asientos'
      ? 'Odoo_Asientos'
      : 'Odoo_Facturas';
  const filename = `${suffix}_${sanitizeSlug(batchLabel)}_${todayIso()}.csv`;
  triggerBlobDownload(blob, filename);
  return filename;
}

function toAsciiSafe(text: string): string {
  return String(text || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014|\u2013/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\xFF]/g, ' ');
}

function truncateText(text: string, maxLen: number): string {
  const safe = toAsciiSafe(text).trim();
  if (safe.length <= maxLen) return safe;
  return `${safe.slice(0, maxLen - 3)}...`;
}

/**
 * Generates a landscape corporate PDF accounting summary ready for print/archive:
 * - Totals by Currency & Balanced Debe/Haber confirmation
 * - Cost Center distribution table
 * - Consolidated Journal Lines table
 */
export async function exportViaticosContabilidadPdf(
  dataset: OdooAccountingDataset,
  config: ViaticoOdooConfig,
  batchLabel = 'Consolidado'
): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageW = 792;
  const pageH = 612;
  const marginX = 28;
  const premexNavy = rgb(0.075, 0.169, 0.388);
  const slateDark = rgb(0.06, 0.09, 0.16);
  const slateMuted = rgb(0.39, 0.45, 0.55);
  const headerTint = rgb(0.84, 0.93, 0.96);
  const borderLight = rgb(0.82, 0.86, 0.91);

  let page = pdfDoc.addPage([pageW, pageH]);

  // Top Navy Header
  page.drawRectangle({
    x: 0,
    y: pageH - 64,
    width: pageW,
    height: 64,
    color: premexNavy,
  });
  page.drawText('PREMEX · REPORTE DE CONTABILIDAD DE VIATICOS (CARGA ODOO)', {
    x: marginX,
    y: pageH - 28,
    size: 13,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText(
    truncateText(
      `Diario: ${config.diarioNombre} (${config.diarioCodigo})  |  Lote: ${batchLabel}  |  Generado: ${new Date().toLocaleDateString(
        'es-GT'
      )}  |  Facturas: ${dataset.expenseRows.length}  |  Lineas de Asiento: ${
        dataset.journalLines.length
      }`,
      125
    ),
    {
      x: marginX,
      y: pageH - 46,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.84, 0.91, 1),
    }
  );

  let y = pageH - 86;

  // Section 1: Resumen por Centro de Costo
  page.drawText('1. DISTRIBUCION POR CENTRO DE COSTO', {
    x: marginX,
    y,
    size: 9.5,
    font: fontBold,
    color: premexNavy,
  });
  y -= 16;

  page.drawRectangle({
    x: marginX,
    y: y - 4,
    width: pageW - marginX * 2,
    height: 18,
    color: headerTint,
    borderColor: borderLight,
    borderWidth: 0.6,
  });

  const ccCols = [
    { label: 'Centro de Costo', x: marginX + 6 },
    { label: 'Moneda', x: marginX + 200 },
    { label: 'Liq.', x: marginX + 275 },
    { label: 'Fact.', x: marginX + 312 },
    { label: 'Base Sin Imp.', x: marginX + 360 },
    { label: 'IVA / Imp.', x: marginX + 455 },
    { label: 'Total Contabilizar', x: marginX + 545 },
    { label: 'Consultores', x: marginX + 645 },
  ];
  ccCols.forEach((c) => {
    page.drawText(c.label, {
      x: c.x,
      y: y + 1,
      size: 7.5,
      font: fontBold,
      color: slateDark,
    });
  });
  y -= 18;

  dataset.costCenterSummary.forEach((cc) => {
    if (y < 60) {
      page = pdfDoc.addPage([pageW, pageH]);
      y = pageH - 44;
    }
    page.drawText(truncateText(cc.centroCosto, 34), {
      x: marginX + 6,
      y,
      size: 7.5,
      font: fontBold,
      color: slateDark,
    });
    page.drawText(truncateText(cc.monedaBase, 14), {
      x: marginX + 200,
      y,
      size: 7.5,
      font: fontRegular,
      color: slateDark,
    });
    page.drawText(String(cc.liquidacionesCount), {
      x: marginX + 278,
      y,
      size: 7.5,
      font: fontRegular,
      color: slateDark,
    });
    page.drawText(String(cc.facturasCount), {
      x: marginX + 315,
      y,
      size: 7.5,
      font: fontRegular,
      color: slateDark,
    });
    page.drawText(toAsciiSafe(formatViaticoAmount(cc.baseSinImpuesto)), {
      x: marginX + 360,
      y,
      size: 7.5,
      font: fontRegular,
      color: slateDark,
    });
    page.drawText(toAsciiSafe(formatViaticoAmount(cc.totalImpuesto)), {
      x: marginX + 455,
      y,
      size: 7.5,
      font: fontRegular,
      color: slateDark,
    });
    page.drawText(toAsciiSafe(formatViaticoAmount(cc.totalReintegrar, cc.monedaBase, true)), {
      x: marginX + 545,
      y,
      size: 7.5,
      font: fontBold,
      color: premexNavy,
    });
    page.drawText(truncateText(cc.consultores.join(', '), 20), {
      x: marginX + 645,
      y,
      size: 7,
      font: fontRegular,
      color: slateMuted,
    });
    page.drawLine({
      start: { x: marginX, y: y - 4 },
      end: { x: pageW - marginX, y: y - 4 },
      thickness: 0.4,
      color: borderLight,
    });
    y -= 16;
  });

  // Section 2: Balanced Journal Entry Preview
  y -= 14;
  if (y < 120) {
    page = pdfDoc.addPage([pageW, pageH]);
    y = pageH - 44;
  }

  page.drawText('2. DETALLE DE ASIENTOS CONTABLES PARA ODOO (DEBE / HABER)', {
    x: marginX,
    y,
    size: 9.5,
    font: fontBold,
    color: premexNavy,
  });
  y -= 16;

  const drawJournalHeader = (p: typeof page, rowY: number) => {
    p.drawRectangle({
      x: marginX,
      y: rowY - 4,
      width: pageW - marginX * 2,
      height: 18,
      color: headerTint,
      borderColor: borderLight,
      borderWidth: 0.6,
    });
    const cols = [
      { label: 'Ref. Asiento', x: marginX + 4 },
      { label: 'Fecha', x: marginX + 114 },
      { label: 'Cuenta', x: marginX + 168 },
      { label: 'Tercero / Proveedor', x: marginX + 225 },
      { label: 'Centro de Costo', x: marginX + 358 },
      { label: 'Etiqueta', x: marginX + 478 },
      { label: 'Debe', x: marginX + 635 },
      { label: 'Haber', x: marginX + 690 },
    ];
    cols.forEach((c) => {
      p.drawText(c.label, {
        x: c.x,
        y: rowY + 1,
        size: 7.2,
        font: fontBold,
        color: slateDark,
      });
    });
  };

  drawJournalHeader(page, y);
  y -= 17;

  dataset.journalLines.forEach((line) => {
    if (y < 46) {
      page = pdfDoc.addPage([pageW, pageH]);
      y = pageH - 42;
      drawJournalHeader(page, y);
      y -= 17;
    }

    const isCredit = line.tipoLinea === 'contrapartida';
    if (isCredit) {
      page.drawRectangle({
        x: marginX,
        y: y - 4,
        width: pageW - marginX * 2,
        height: 15,
        color: rgb(0.94, 0.965, 1),
      });
    }

    const fontToUse = isCredit ? fontBold : fontRegular;
    page.drawText(truncateText(line.asientoRef, 22), {
      x: marginX + 4,
      y,
      size: 6.8,
      font: fontToUse,
      color: slateDark,
    });
    page.drawText(line.fechaContable, {
      x: marginX + 114,
      y,
      size: 6.8,
      font: fontRegular,
      color: slateMuted,
    });
    page.drawText(truncateText(line.cuentaCodigo, 11), {
      x: marginX + 168,
      y,
      size: 6.8,
      font: fontBold,
      color: premexNavy,
    });
    page.drawText(truncateText(line.partner, 26), {
      x: marginX + 225,
      y,
      size: 6.8,
      font: fontToUse,
      color: slateDark,
    });
    page.drawText(truncateText(line.centroCosto || 'Sin asignar', 22), {
      x: marginX + 358,
      y,
      size: 6.8,
      font: fontRegular,
      color: line.centroCosto ? slateDark : rgb(0.76, 0.32, 0.05),
    });
    page.drawText(truncateText(line.etiqueta, 32), {
      x: marginX + 478,
      y,
      size: 6.6,
      font: fontRegular,
      color: slateMuted,
    });
    page.drawText(line.debito > 0 ? toAsciiSafe(formatViaticoAmount(line.debito)) : '-', {
      x: marginX + 635,
      y,
      size: 6.8,
      font: fontRegular,
      color: slateDark,
    });
    page.drawText(line.credito > 0 ? toAsciiSafe(formatViaticoAmount(line.credito)) : '-', {
      x: marginX + 690,
      y,
      size: 6.8,
      font: fontBold,
      color: premexNavy,
    });

    page.drawLine({
      start: { x: marginX, y: y - 4 },
      end: { x: pageW - marginX, y: y - 4 },
      thickness: 0.35,
      color: borderLight,
    });
    y -= 15;
  });

  // Page numbers
  const pages = pdfDoc.getPages();
  pages.forEach((p, idx) => {
    p.drawText('Suite Corporativa Premex · Contabilidad de Viaticos · Preparado para Odoo', {
      x: marginX,
      y: 18,
      size: 7,
      font: fontRegular,
      color: slateMuted,
    });
    const numTxt = `Pagina ${idx + 1} de ${pages.length}`;
    const nw = fontBold.widthOfTextAtSize(numTxt, 7);
    p.drawText(numTxt, {
      x: pageW - marginX - nw,
      y: 18,
      size: 7,
      font: fontBold,
      color: slateMuted,
    });
  });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
  const filename = `Reporte_Contabilidad_Viaticos_${sanitizeSlug(batchLabel)}_${todayIso()}.pdf`;
  triggerBlobDownload(blob, filename);
  return filename;
}
