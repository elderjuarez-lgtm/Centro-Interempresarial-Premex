import * as XLSX from 'xlsx';
import { Movement, MovementType, DifferenceRow, MatrixResult, EntityMapping } from '../types';

export interface ParseExcelResult {
  movements: Movement[];
  sheetsFound: string[];
  monthsFound: string[];
  warnings: string[];
  errors: string[];
  cxcCount: number;
  cxpCount: number;
  resolvedByNitCount: number;
  unmatchedNits: string[];
}

export interface ParsedBulkEntity {
  nombreOficial: string;
  nit: string;
  email: string;
  codigoSociedad: string;
  pais: string;
  moneda: string;
}

export interface ParseBulkEntitiesResult {
  entities: ParsedBulkEntity[];
  warnings: string[];
  errors: string[];
}

const SPANISH_MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const normalizeMonthLabel = (rawMonth?: string, fallbackDate?: string): string => {
  if (rawMonth && typeof rawMonth === 'string' && rawMonth.trim()) {
    const trimmed = rawMonth.trim();
    // Handle YYYY-MM or YYYY/MM
    const matchYM = trimmed.match(/^(\d{4})[-/](\d{1,2})$/);
    if (matchYM) {
      const year = matchYM[1];
      const monthIdx = parseInt(matchYM[2], 10) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${SPANISH_MONTHS[monthIdx]} ${year}`;
      }
    }
    // Handle MM-YYYY or MM/YYYY
    const matchMY = trimmed.match(/^(\d{1,2})[-/](\d{4})$/);
    if (matchMY) {
      const monthIdx = parseInt(matchMY[1], 10) - 1;
      const year = matchMY[2];
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${SPANISH_MONTHS[monthIdx]} ${year}`;
      }
    }
    // Capitalize first letter
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }

  // Fallback: extract from date string (YYYY-MM-DD or DD/MM/YYYY)
  if (fallbackDate && typeof fallbackDate === 'string') {
    const matchYMD = fallbackDate.match(/^(\d{4})[-/](\d{1,2})/);
    if (matchYMD) {
      const year = matchYMD[1];
      const monthIdx = parseInt(matchYMD[2], 10) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${SPANISH_MONTHS[monthIdx]} ${year}`;
      }
    }
    const matchDMY = fallbackDate.match(/\d{1,2}[-/](\d{1,2})[-/](\d{4})/);
    if (matchDMY) {
      const monthIdx = parseInt(matchDMY[1], 10) - 1;
      const year = matchDMY[2];
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${SPANISH_MONTHS[monthIdx]} ${year}`;
      }
    }
  }

  return 'Septiembre 2026';
};

// Clean and normalize strings
const normalizeKey = (key: string): string => {
  return String(key || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '');
};

export const normalizeNit = (raw: string): string => {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
};

const extractNitBase = (raw: string): string => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const beforeDash = trimmed.includes('-') ? trimmed.split('-')[0] : trimmed;
  return normalizeNit(beforeDash);
};

interface EntityLookup {
  resolve: (rawNit: string, rawFallback: string) => {
    name: string;
    matchedByNit: boolean;
    unmatchedNit?: string;
  };
}

const buildEntityLookup = (entities: EntityMapping[] = []): EntityLookup => {
  const nitExactMap = new Map<string, string>();
  const nitBaseCount = new Map<string, number>();
  const nitBaseMap = new Map<string, string>();
  const nameMap = new Map<string, string>();

  entities.forEach((ent) => {
    const official = (ent.nombreOficial || '').trim();
    if (!official) return;

    nameMap.set(official.toLowerCase(), official);
    if (ent.alias && ent.alias.trim()) {
      nameMap.set(ent.alias.trim().toLowerCase(), official);
    }

    if (ent.nit && ent.nit.trim()) {
      const exact = normalizeNit(ent.nit);
      if (exact) {
        nitExactMap.set(exact, official);
        const noLeadingZeros = exact.replace(/^0+/, '');
        if (noLeadingZeros && !nitExactMap.has(noLeadingZeros)) {
          nitExactMap.set(noLeadingZeros, official);
        }
      }

      const base = extractNitBase(ent.nit);
      if (base) {
        nitBaseCount.set(base, (nitBaseCount.get(base) || 0) + 1);
        nitBaseMap.set(base, official);
      }
    }
  });

  const matchNit = (candidate: string): string | null => {
    const exact = normalizeNit(candidate);
    if (!exact) return null;
    if (nitExactMap.has(exact)) return nitExactMap.get(exact)!;
    const noLeadingZeros = exact.replace(/^0+/, '');
    if (noLeadingZeros && nitExactMap.has(noLeadingZeros)) {
      return nitExactMap.get(noLeadingZeros)!;
    }
    const base = extractNitBase(candidate);
    if (base && nitBaseCount.get(base) === 1 && nitBaseMap.has(base)) {
      return nitBaseMap.get(base)!;
    }
    return null;
  };

  return {
    resolve: (rawNit: string, rawFallback: string) => {
      const cleanNit = String(rawNit || '').trim();
      const cleanFallback = String(rawFallback || '').trim();

      // 1. Primary: match explicit NIT column against registered company NITs
      if (cleanNit) {
        const hit = matchNit(cleanNit);
        if (hit) {
          return { name: hit, matchedByNit: true };
        }
        // If explicit NIT column didn't match, still check if fallback name matches a registered company
        const fallbackAsNit = cleanFallback ? matchNit(cleanFallback) : null;
        if (fallbackAsNit) {
          return { name: fallbackAsNit, matchedByNit: true };
        }
        const fallbackByName = cleanFallback
          ? nameMap.get(cleanFallback.toLowerCase())
          : undefined;
        if (fallbackByName) {
          return { name: fallbackByName, matchedByNit: false, unmatchedNit: cleanNit };
        }
        return {
          name: cleanNit || cleanFallback,
          matchedByNit: false,
          unmatchedNit: cleanNit,
        };
      }

      // 2. Fallback column (e.g. "sociedad" / "contraparte"): try NIT match FIRST, then Name match
      if (cleanFallback) {
        const hitAsNit = matchNit(cleanFallback);
        if (hitAsNit) {
          return { name: hitAsNit, matchedByNit: true };
        }
        const hitByName = nameMap.get(cleanFallback.toLowerCase());
        if (hitByName) {
          return { name: hitByName, matchedByNit: false };
        }
        return { name: cleanFallback, matchedByNit: false };
      }

      return { name: '', matchedByNit: false };
    },
  };
};

export const parseExcelFile = async (
  file: File,
  registeredEntities: EntityMapping[] = []
): Promise<ParseExcelResult> => {
  const entityLookup = buildEntityLookup(registeredEntities);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetNames = workbook.SheetNames;

        const movements: Movement[] = [];
        const warnings: string[] = [];
        const errors: string[] = [];
        const monthsSet = new Set<string>();
        const unmatchedNitsSet = new Set<string>();
        let cxcCount = 0;
        let cxpCount = 0;
        let resolvedByNitCount = 0;

        // Helper to parse individual sheet rows
        const processSheet = (sheetName: string, defaultType: MovementType | null) => {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) return;

          // Convert sheet to JSON array of objects
          const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
          if (!rawRows || rawRows.length === 0) {
            warnings.push(`La hoja "${sheetName}" está vacía.`);
            return;
          }

          rawRows.forEach((row, rowIdx) => {
            // Find matched keys
            const mappedRow: Record<string, any> = {};
            Object.keys(row).forEach((k) => {
              const norm = normalizeKey(k);
              mappedRow[norm] = row[k];
            });

            // Extract Sociedad NIT & fallback name
            const nitSociedadVal =
              mappedRow['nitsociedad'] ||
              mappedRow['nitemisor'] ||
              mappedRow['nitsoc'] ||
              mappedRow['nitempresa'] ||
              mappedRow['nit'] ||
              mappedRow['identificacionsociedad'] ||
              mappedRow['identificacion'] ||
              mappedRow['taxid'] ||
              mappedRow['rut'] ||
              mappedRow['ruc'] ||
              '';

            const sociedadVal =
              mappedRow['sociedad'] ||
              mappedRow['empresa'] ||
              mappedRow['compania'] ||
              mappedRow['emisor'] ||
              mappedRow['soc'] ||
              '';

            // Extract Contraparte NIT & fallback name
            const nitContraparteVal =
              mappedRow['nitcontraparte'] ||
              mappedRow['nitdeudor'] ||
              mappedRow['nitacreedor'] ||
              mappedRow['nitcp'] ||
              mappedRow['identificacioncontraparte'] ||
              mappedRow['rutcontraparte'] ||
              mappedRow['ruccontraparte'] ||
              mappedRow['taxidcontraparte'] ||
              '';

            const contraparteVal =
              mappedRow['contraparte'] ||
              mappedRow['deudor'] ||
              mappedRow['acreedor'] ||
              mappedRow['sociedadcontraparte'] ||
              mappedRow['cliente'] ||
              mappedRow['proveedor'] ||
              mappedRow['cp'] ||
              '';

            // Extract Fecha
            let fechaVal =
              mappedRow['fechafactura'] ||
              mappedRow['fecha'] ||
              mappedRow['fechadocumento'] ||
              mappedRow['date'] ||
              '';

            // Extract Factura
            const facturaVal =
              mappedRow['factura'] ||
              mappedRow['nofactura'] ||
              mappedRow['numerofactura'] ||
              mappedRow['folio'] ||
              mappedRow['invoice'] ||
              mappedRow['documento'] ||
              `FAC-${rowIdx + 1}`;

            // Extract Valor
            const rawValor =
              mappedRow['valor'] ||
              mappedRow['monto'] ||
              mappedRow['importe'] ||
              mappedRow['saldo'] ||
              mappedRow['total'] ||
              0;

            // Extract Tipo
            let tipoVal: MovementType | null = defaultType;
            const explicitTipo = normalizeKey(String(mappedRow['tipo'] || mappedRow['clase'] || ''));
            if (explicitTipo.includes('cxc') || explicitTipo.includes('cobrar')) {
              tipoVal = 'CXC';
            } else if (explicitTipo.includes('cxp') || explicitTipo.includes('pagar')) {
              tipoVal = 'CXP';
            }

            if (!tipoVal) {
              // Try to infer from sheet name
              const normSheet = normalizeKey(sheetName);
              if (normSheet.includes('cobrar') || normSheet.includes('cxc')) {
                tipoVal = 'CXC';
              } else if (normSheet.includes('pagar') || normSheet.includes('cxp')) {
                tipoVal = 'CXP';
              } else {
                tipoVal = 'CXC'; // fallback default
              }
            }

            // Clean numerical value
            let numericVal = 0;
            if (typeof rawValor === 'number') {
              numericVal = rawValor;
            } else if (typeof rawValor === 'string') {
              const cleanNum = rawValor
                .replace(/[$\s]/g, '')
                .replace(/,/g, '');
              numericVal = parseFloat(cleanNum) || 0;
            }

            const rawSocNitStr = String(nitSociedadVal).trim();
            const rawSocStr = String(sociedadVal).trim();
            const rawCpNitStr = String(nitContraparteVal).trim();
            const rawCpStr = String(contraparteVal).trim();

            if (!rawSocNitStr && !rawSocStr && !rawCpNitStr && !rawCpStr) {
              // Skip empty rows
              return;
            }

            const resolvedSoc = entityLookup.resolve(rawSocNitStr, rawSocStr);
            const resolvedCp = entityLookup.resolve(rawCpNitStr, rawCpStr);

            if (resolvedSoc.matchedByNit) resolvedByNitCount++;
            if (resolvedCp.matchedByNit) resolvedByNitCount++;
            if (resolvedSoc.unmatchedNit) unmatchedNitsSet.add(resolvedSoc.unmatchedNit);
            if (resolvedCp.unmatchedNit) unmatchedNitsSet.add(resolvedCp.unmatchedNit);

            const cleanSociedad = resolvedSoc.name;
            const cleanContraparte = resolvedCp.name;

            if (!cleanSociedad || !cleanContraparte) {
              warnings.push(
                `Fila ${rowIdx + 2} en hoja "${sheetName}" omitida: falta NIT/sociedad o NIT/contraparte.`
              );
              return;
            }

            // Normalize Date string if Date object or excel serial
            if (fechaVal instanceof Date) {
              fechaVal = fechaVal.toISOString().split('T')[0];
            } else if (typeof fechaVal === 'string' && fechaVal.trim()) {
              fechaVal = fechaVal.trim();
            } else {
              fechaVal = new Date().toISOString().split('T')[0];
            }

            // Extract Mes a conciliar
            const rawMes =
              mappedRow['mesaconciliar'] ||
              mappedRow['mesconciliar'] ||
              mappedRow['mes'] ||
              mappedRow['periodo'] ||
              mappedRow['fechacorte'] ||
              mappedRow['corte'] ||
              '';

            const cleanMes = normalizeMonthLabel(String(rawMes || ''), String(fechaVal || ''));
            monthsSet.add(cleanMes);

            const movement: Movement = {
              id: `${tipoVal}-${cleanSociedad}-${cleanContraparte}-${facturaVal}-${rowIdx}-${Math.random().toString(36).substring(2, 6)}`,
              sociedad: cleanSociedad,
              contraparte: cleanContraparte,
              fecha_factura: String(fechaVal),
              factura: String(facturaVal).trim(),
              valor: Math.round((numericVal + Number.EPSILON) * 100) / 100,
              tipo: tipoVal,
              mes: cleanMes,
            };

            movements.push(movement);
            if (tipoVal === 'CXC') cxcCount++;
            else cxpCount++;
          });
        };

        // Match requested sheet names: "Cuentas por cobrar" & "Cuentas por pagar"
        let foundCxcSheet = false;
        let foundCxpSheet = false;

        sheetNames.forEach((name) => {
          const norm = normalizeKey(name);
          if (norm.includes('cobrar') || norm === 'cxc') {
            processSheet(name, 'CXC');
            foundCxcSheet = true;
          } else if (norm.includes('pagar') || norm === 'cxp') {
            processSheet(name, 'CXP');
            foundCxpSheet = true;
          }
        });

        // If standard sheets were not identified by name, process all sheets
        if (!foundCxcSheet && !foundCxpSheet) {
          sheetNames.forEach((name) => {
            processSheet(name, null);
          });
        }

        if (movements.length === 0) {
          errors.push(
            'No se pudieron extraer movimientos válidos del archivo. Asegúrate de incluir columnas como "nit_sociedad" (o "sociedad"), "nit_contraparte" (o "contraparte"), "factura" y "valor".'
          );
        }

        resolve({
          movements,
          sheetsFound: sheetNames,
          monthsFound: Array.from(monthsSet),
          warnings,
          errors,
          cxcCount,
          cxpCount,
          resolvedByNitCount,
          unmatchedNits: Array.from(unmatchedNitsSet),
        });
      } catch (err: any) {
        reject(new Error(`Error al leer el archivo Excel: ${err?.message || err}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Error de lectura en el navegador.'));
    };

    reader.readAsArrayBuffer(file);
  });
};

export const parseBulkEntitiesFile = async (
  file: File,
  defaultCountry: string = 'Colombia',
  defaultCurrency: string = 'COP'
): Promise<ParseBulkEntitiesResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          resolve({
            entities: [],
            warnings: [],
            errors: ['El archivo Excel no contiene hojas válidas.'],
          });
          return;
        }

        const sheet = workbook.Sheets[firstSheetName];
        const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        const entities: ParsedBulkEntity[] = [];
        const warnings: string[] = [];
        const errors: string[] = [];
        const seenNames = new Set<string>();
        const seenNits = new Set<string>();

        rawRows.forEach((row, idx) => {
          const mapped: Record<string, any> = {};
          Object.keys(row).forEach((k) => {
            mapped[normalizeKey(k)] = row[k];
          });

          const rawNombre = String(
            mapped['nombreoficial'] ||
              mapped['nombre'] ||
              mapped['sociedad'] ||
              mapped['empresa'] ||
              mapped['razonsocial'] ||
              mapped['entidad'] ||
              mapped['compania'] ||
              mapped['name'] ||
              ''
          ).trim();

          const rawNit = String(
            mapped['nit'] ||
              mapped['identificacion'] ||
              mapped['taxid'] ||
              mapped['rut'] ||
              mapped['ruc'] ||
              mapped['documento'] ||
              ''
          ).trim();

          const rawEmail = String(
            mapped['correo'] ||
              mapped['correoelectronico'] ||
              mapped['email'] ||
              mapped['mail'] ||
              mapped['correoencargado'] ||
              mapped['encargado'] ||
              ''
          ).trim();

          const rawCodigo = String(
            mapped['codigosociedad'] || mapped['codigo'] || mapped['cod'] || mapped['code'] || ''
          ).trim();

          const rawPais = String(mapped['pais'] || mapped['country'] || '').trim();
          const rawMoneda = String(mapped['moneda'] || mapped['currency'] || mapped['divisa'] || '').trim();

          if (!rawNombre && !rawNit) return;

          if (!rawNombre) {
            warnings.push(`Fila ${idx + 2} omitida: falta el nombre de la sociedad.`);
            return;
          }

          const normName = rawNombre.toLowerCase();
          if (seenNames.has(normName)) {
            warnings.push(`Fila ${idx + 2} ("${rawNombre}") omitida por nombre duplicado en el archivo.`);
            return;
          }
          seenNames.add(normName);

          const normNit = normalizeNit(rawNit);
          if (normNit) {
            if (seenNits.has(normNit)) {
              warnings.push(`Fila ${idx + 2} ("${rawNombre}"): el NIT "${rawNit}" está repetido en el archivo.`);
            }
            seenNits.add(normNit);
          } else {
            warnings.push(`Fila ${idx + 2} ("${rawNombre}") no incluye NIT.`);
          }

          entities.push({
            nombreOficial: rawNombre,
            nit: rawNit,
            email: rawEmail,
            codigoSociedad: rawCodigo || `EMP-${(entities.length + 1) * 100}`,
            pais: rawPais || defaultCountry,
            moneda: (rawMoneda || defaultCurrency).toUpperCase(),
          });
        });

        if (entities.length === 0) {
          errors.push(
            'No se encontraron sociedades válidas. Usa columnas como "nombre" (o "sociedad") y "nit" (opcionales: "codigo", "pais", "moneda").'
          );
        }

        resolve({ entities, warnings, errors });
      } catch (err: any) {
        reject(new Error(`Error al leer archivo de sociedades: ${err?.message || err}`));
      }
    };

    reader.onerror = () => reject(new Error('Error de lectura en el navegador.'));
    reader.readAsArrayBuffer(file);
  });
};

export const parseBulkEntitiesText = (
  rawText: string,
  defaultCountry: string = 'Colombia',
  defaultCurrency: string = 'COP'
): ParseBulkEntitiesResult => {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      entities: [],
      warnings: [],
      errors: ['Pega o escribe al menos una fila con Nombre y NIT.'],
    };
  }

  const entities: ParsedBulkEntity[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const seenNames = new Set<string>();
  const seenNits = new Set<string>();

  lines.forEach((line, idx) => {
    const delimiter = line.includes('\t')
      ? '\t'
      : line.includes(';')
      ? ';'
      : line.includes('|')
      ? '|'
      : ',';
    const parts = line.split(delimiter).map((p) => p.trim());

    // Skip header line automatically if detected on first line
    if (idx === 0) {
      const col0 = normalizeKey(parts[0] || '');
      const col1 = normalizeKey(parts[1] || '');
      if (
        (col0.includes('nombre') || col0.includes('sociedad') || col0.includes('empresa') || col0 === 'nit') &&
        (col1.includes('nit') || col1.includes('nombre') || col1.includes('sociedad') || parts.length <= 5)
      ) {
        return;
      }
    }

    const nombre = parts[0] || '';
    const nit = parts[1] || '';
    const part2 = parts[2] || '';
    const part3 = parts[3] || '';
    const part4 = parts[4] || '';
    const part5 = parts[5] || '';
    const detectedEmail = parts.slice(2).find((p) => p.includes('@')) || part5 || '';
    const codigo = part2.includes('@') ? '' : part2;
    const pais = part3.includes('@') ? '' : part3;
    const moneda = part4.includes('@') ? '' : part4;

    if (!nombre) return;

    const normName = nombre.toLowerCase();
    if (seenNames.has(normName)) {
      warnings.push(`Línea ${idx + 1} ("${nombre}") omitida por duplicado.`);
      return;
    }
    seenNames.add(normName);

    const normNit = normalizeNit(nit);
    if (normNit) {
      if (seenNits.has(normNit)) {
        warnings.push(`Línea ${idx + 1} ("${nombre}"): el NIT "${nit}" está repetido.`);
      }
      seenNits.add(normNit);
    } else {
      warnings.push(`Línea ${idx + 1} ("${nombre}") no incluye NIT.`);
    }

    entities.push({
      nombreOficial: nombre,
      nit,
      email: detectedEmail,
      codigoSociedad: codigo || `EMP-${(entities.length + 1) * 100}`,
      pais: pais || defaultCountry,
      moneda: (moneda || defaultCurrency).toUpperCase(),
    });
  });

  if (entities.length === 0) {
    errors.push('No se reconocieron sociedades válidas en el texto pegado.');
  }

  return { entities, warnings, errors };
};

export const downloadEntitiesTemplate = (
  defaultCountry: string = 'Colombia',
  defaultCurrency: string = 'COP'
) => {
  const sampleRows = [
    {
      nombre: 'Empresa Ejemplo A S.A.S.',
      nit: '900123456-1',
      correo: 'contabilidad.a@empresa.com',
      codigo: 'SOC-100',
      pais: defaultCountry,
      moneda: defaultCurrency,
    },
    {
      nombre: 'Empresa Ejemplo B S.A.S.',
      nit: '800654321-2',
      correo: 'contabilidad.b@empresa.com',
      codigo: 'SOC-200',
      pais: defaultCountry,
      moneda: defaultCurrency,
    },
    {
      nombre: 'Empresa Ejemplo C S.A.S.',
      nit: '890112233-4',
      correo: 'contabilidad.c@empresa.com',
      codigo: 'SOC-300',
      pais: defaultCountry,
      moneda: defaultCurrency,
    },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleRows);
  ws['!cols'] = [
    { wch: 30 },
    { wch: 18 },
    { wch: 28 },
    { wch: 14 },
    { wch: 16 },
    { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Sociedades');
  XLSX.writeFile(wb, 'Plantilla_Sociedades_NIT.xlsx');
};

// Generates an Excel template with the two exact sheets including NIT columns
export const downloadExcelTemplate = (entities: EntityMapping[] = []) => {
  const firstEnt = entities[0];
  const secondEnt = entities[1];
  const thirdEnt = entities[2];

  const soc1Nit = firstEnt?.nit || '900100100-1';
  const soc2Nit = secondEnt?.nit || '900200200-2';
  const soc3Nit = thirdEnt?.nit || '900300300-3';

  const cxcData = [
    {
      mes_a_conciliar: 'Septiembre 2026',
      nit_sociedad: soc1Nit,
      nit_contraparte: soc2Nit,
      fecha_factura: '2026-09-15',
      factura: 'FAC-CXC-1001',
      valor: 450000.00,
      tipo: 'CXC'
    },
    {
      mes_a_conciliar: 'Septiembre 2026',
      nit_sociedad: soc1Nit,
      nit_contraparte: soc3Nit,
      fecha_factura: '2026-09-18',
      factura: 'FAC-CXC-1002',
      valor: 320000.00,
      tipo: 'CXC'
    },
    {
      mes_a_conciliar: 'Septiembre 2026',
      nit_sociedad: soc2Nit,
      nit_contraparte: soc3Nit,
      fecha_factura: '2026-09-20',
      factura: 'FAC-CXC-1003',
      valor: 180500.00,
      tipo: 'CXC'
    }
  ];

  const cxpData = [
    {
      mes_a_conciliar: 'Septiembre 2026',
      nit_sociedad: soc2Nit,
      nit_contraparte: soc1Nit,
      fecha_factura: '2026-09-15',
      factura: 'FAC-CXC-1001',
      valor: 450000.00,
      tipo: 'CXP'
    },
    {
      mes_a_conciliar: 'Septiembre 2026',
      nit_sociedad: soc3Nit,
      nit_contraparte: soc1Nit,
      fecha_factura: '2026-09-18',
      factura: 'FAC-CXC-1002',
      valor: 300000.00,
      tipo: 'CXP'
    },
    {
      mes_a_conciliar: 'Septiembre 2026',
      nit_sociedad: soc3Nit,
      nit_contraparte: soc2Nit,
      fecha_factura: '2026-09-20',
      factura: 'FAC-CXC-1003',
      valor: 180500.00,
      tipo: 'CXP'
    }
  ];

  const wb = XLSX.utils.book_new();
  const wsCxc = XLSX.utils.json_to_sheet(cxcData);
  const wsCxp = XLSX.utils.json_to_sheet(cxpData);

  XLSX.utils.book_append_sheet(wb, wsCxc, 'Cuentas por cobrar');
  XLSX.utils.book_append_sheet(wb, wsCxp, 'Cuentas por pagar');

  XLSX.writeFile(wb, 'Plantilla_Centro_Interempresarial.xlsx');
};

// Generate official reconciliation Excel workbook bytes (for both local download and Gmail attachment)
export const generateReconciliationExcelBytes = (
  differences: DifferenceRow[],
  matrizCxc: MatrixResult,
  matrizCxp: MatrixResult,
  movements: Movement[],
  orderedEntities: string[] = [
    'Premex',
    'Adiquim',
    'Nutreo',
    'Asimetrix',
    'Premex Inc.',
    'Pralsa Guatemala',
    'Ecuadpremex',
    'Pralsa Perú',
    'Pralsa Chile',
    'Pralsa RD',
    'Asimetrix INC',
    'Alura SAS',
    'Pralsia',
    'Alura INC',
    'Alura Ecuador',
    'Premicol SA de CV',
    'Alura México',
    'Prizma SAS',
    'Progal BT SAS',
    'Iluma Alliance',
    'Insylo Technologies SL'
  ],
  periodLabel: string = 'SEPTIEMBRE 2026 - ( CIFRAS EN DOLARES )'
): { bytes: Uint8Array; filename: string } => {
  const wb = XLSX.utils.book_new();

  // Strictly use the configured entities list in its exact order
  const entities: string[] = [];
  const lookupMap = new Map<string, string>();
  orderedEntities.forEach((raw) => {
    const clean = raw.trim();
    if (!clean) return;
    const norm = clean.toLowerCase();
    if (!lookupMap.has(norm)) {
      lookupMap.set(norm, clean);
      entities.push(clean);
    }
  });

  // Calculate CXC and CXP maps
  const cxcMap: Record<string, number> = {};
  const cxpMap: Record<string, number> = {};
  movements.forEach((m) => {
    const soc = lookupMap.get(m.sociedad.trim().toLowerCase());
    const cp = lookupMap.get(m.contraparte.trim().toLowerCase());
    if (!soc || !cp) return;
    const k = `${soc}___${cp}`;
    if (m.tipo === 'CXC') {
      cxcMap[k] = (cxcMap[k] || 0) + m.valor;
    } else {
      cxpMap[k] = (cxpMap[k] || 0) + m.valor;
    }
  });

  // 1. Matriz Bilateral (EXACTAMENTE COMO LA IMAGEN DE REFERENCIA)
  const bilateralRows: any[][] = [];

  // Fila 0: Banner superior
  bilateralRows.push([periodLabel]);

  // Fila 1: Encabezado CXC
  bilateralRows.push(['CTAS X COBRAR', ...entities]);

  // Filas 2 a N: Filas de CTAS X COBRAR
  entities.forEach((soc) => {
    const row: any[] = [soc];
    entities.forEach((cp) => {
      const isDiagonal = soc === cp;
      const val = cxcMap[`${soc}___${cp}`];
      if (isDiagonal) {
        row.push(''); // Diagonal vacía
      } else if (val && val > 0) {
        row.push(val);
      } else {
        row.push('');
      }
    });
    bilateralRows.push(row);
  });

  // Filas vacías de separación
  bilateralRows.push([]);
  bilateralRows.push([]);

  // Fila Encabezado CXP
  bilateralRows.push(['CTAS X PAGAR', ...entities]);

  // Filas de CTAS X PAGAR
  entities.forEach((soc) => {
    const row: any[] = [soc];
    entities.forEach((cp) => {
      const isDiagonal = soc === cp;
      const val = cxpMap[`${soc}___${cp}`];
      if (isDiagonal) {
        row.push('');
      } else if (val && val > 0) {
        row.push(val);
      } else {
        row.push('');
      }
    });
    bilateralRows.push(row);
  });

  const wsBilateral = XLSX.utils.aoa_to_sheet(bilateralRows);

  // Column widths
  wsBilateral['!cols'] = [
    { wch: 24 }, // Columna de Sociedad
    ...entities.map(() => ({ wch: 15 }))
  ];

  // Merge banner en fila 0
  wsBilateral['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: entities.length } }
  ];

  XLSX.utils.book_append_sheet(wb, wsBilateral, 'Matrices Bilaterales');

  // 2. Hoja Diferencias
  const diffData = differences.map((d) => ({
    'Sociedad': d.sociedad,
    'Contraparte': d.contraparte,
    'CxC': d.cxc,
    'CxP': d.cxp,
    'Diferencia': d.diferencia,
    'Estado': d.diferencia === 0 ? 'CONCILIADO' : 'DIFERENCIA',
    'Comentario': d.comentario || ''
  }));
  const wsDiff = XLSX.utils.json_to_sheet(diffData);
  XLSX.utils.book_append_sheet(wb, wsDiff, 'Diferencias');

  // 3. Hoja Detalle de Movimientos
  const wsDetail = XLSX.utils.json_to_sheet(movements);
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Movimientos');

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Matriz_Bilateral_Interempresarial_${dateStr}.xlsx`;
  const arrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return {
    bytes: new Uint8Array(arrayBuffer),
    filename,
  };
};

// Export reconciliation reports to a local Excel file with exact Bilateral Matrix layout as sheet 1
export const exportReconciliationToExcelFile = (
  differences: DifferenceRow[],
  matrizCxc: MatrixResult,
  matrizCxp: MatrixResult,
  movements: Movement[],
  orderedEntities?: string[],
  periodLabel?: string
) => {
  const { bytes, filename } = generateReconciliationExcelBytes(
    differences,
    matrizCxc,
    matrizCxp,
    movements,
    orderedEntities,
    periodLabel
  );
  const blob = new Blob([new Uint8Array(bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};
