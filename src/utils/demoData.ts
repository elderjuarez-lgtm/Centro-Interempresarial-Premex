import { Movement, EntityMapping, ReconciliationScope } from '../types';

export const INTERCOMPANY_SCOPES: ReconciliationScope[] = [
  'internacionales',
  'nacionales',
  'anitox',
];

export const INTERCOMPANY_SCOPE_META: Record<
  ReconciliationScope,
  {
    label: string;
    shortLabel: string;
    defaultCountry: string;
    defaultCurrency: string;
    currencyBannerLabel: string;
    description: string;
  }
> = {
  internacionales: {
    label: 'Internacionales',
    shortLabel: 'Int.',
    defaultCountry: 'Global',
    defaultCurrency: 'USD',
    currencyBannerLabel: 'CIFRAS EN DOLARES',
    description: 'Sociedades internacionales y filiales globales del grupo Premex',
  },
  nacionales: {
    label: 'Nacionales',
    shortLabel: 'Nac.',
    defaultCountry: 'Colombia',
    defaultCurrency: 'COP',
    currencyBannerLabel: 'CIFRAS EN PESOS COLOMBIANOS',
    description: 'Sociedades nacionales locales (Colombia)',
  },
  anitox: {
    label: 'Anitox',
    shortLabel: 'Anitox',
    defaultCountry: 'Global',
    defaultCurrency: 'USD',
    currencyBannerLabel: 'CIFRAS EN DOLARES',
    description: 'Sociedades dedicadas del grupo Anitox',
  },
};

export const getIntercompanyScopeLabel = (scope?: ReconciliationScope): string => {
  if (scope === 'nacionales') return INTERCOMPANY_SCOPE_META.nacionales.label;
  if (scope === 'anitox') return INTERCOMPANY_SCOPE_META.anitox.label;
  return INTERCOMPANY_SCOPE_META.internacionales.label;
};

export const ORDERED_ENTITIES: string[] = [
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
];

export const INITIAL_ENTITIES: EntityMapping[] = ORDERED_ENTITIES.map((name, idx) => ({
  id: `ent-${idx + 1}`,
  alias: name,
  nombreOficial: name,
  codigoSociedad: `SOC-${(idx + 1) * 100}`,
  pais: name.includes('Guatemala') ? 'Guatemala'
    : name.includes('Perú') ? 'Perú'
    : name.includes('Chile') ? 'Chile'
    : name.includes('RD') ? 'República Dominicana'
    : name.includes('Ecuador') ? 'Ecuador'
    : name.includes('México') ? 'México'
    : name.includes('Inc') || name.includes('INC') ? 'Estados Unidos'
    : name.includes('Technologies SL') ? 'España'
    : 'Colombia',
  moneda: 'USD'
}));

const RAW_INITIAL_MOVEMENTS: Movement[] = [
  // --- CUENTAS POR COBRAR (CXC) de la imagen de referencia ---
  {
    id: 'cxc-1',
    sociedad: 'Premex',
    contraparte: 'Pralsa Guatemala',
    fecha_factura: '2026-09-05',
    factura: 'FAC-PMX-101',
    valor: 125922.00,
    tipo: 'CXC',
    notas: 'Venta de materias primas Centroamérica'
  },
  {
    id: 'cxc-2',
    sociedad: 'Premex',
    contraparte: 'Ecuadpremex',
    fecha_factura: '2026-09-08',
    factura: 'FAC-PMX-102',
    valor: 476802.00,
    tipo: 'CXC',
    notas: 'Suministro de premezclas nutricionales'
  },
  {
    id: 'cxc-3',
    sociedad: 'Premex',
    contraparte: 'Pralsa Chile',
    fecha_factura: '2026-09-12',
    factura: 'FAC-PMX-103',
    valor: 105670.00,
    tipo: 'CXC',
    notas: 'Servicios de asesoría técnica'
  },
  {
    id: 'cxc-4',
    sociedad: 'Adiquim',
    contraparte: 'Premex Inc.',
    fecha_factura: '2026-09-10',
    factura: 'FAC-ADQ-201',
    valor: 243837.00,
    tipo: 'CXC',
    notas: 'Exportación de aditivos químicos'
  },
  {
    id: 'cxc-5',
    sociedad: 'Adiquim',
    contraparte: 'Pralsa Guatemala',
    fecha_factura: '2026-09-14',
    factura: 'FAC-ADQ-202',
    valor: 509824.00,
    tipo: 'CXC',
    notas: 'Distribución de especialidades veterinarias'
  },
  {
    id: 'cxc-6',
    sociedad: 'Adiquim',
    contraparte: 'Ecuadpremex',
    fecha_factura: '2026-09-15',
    factura: 'FAC-ADQ-203',
    valor: 1903453.00,
    tipo: 'CXC',
    notas: 'Lote aditivos pecuarios Q3'
  },
  {
    id: 'cxc-7',
    sociedad: 'Adiquim',
    contraparte: 'Pralsa Perú',
    fecha_factura: '2026-09-16',
    factura: 'FAC-ADQ-204',
    valor: 326319.00,
    tipo: 'CXC',
    notas: 'Enzimas y fitasas'
  },
  {
    id: 'cxc-8',
    sociedad: 'Adiquim',
    contraparte: 'Alura INC',
    fecha_factura: '2026-09-18',
    factura: 'FAC-ADQ-205',
    valor: 267112.00,
    tipo: 'CXC',
    notas: 'Concentrados nutricionales'
  },
  {
    id: 'cxc-9',
    sociedad: 'Adiquim',
    contraparte: 'Premicol SA de CV',
    fecha_factura: '2026-09-20',
    factura: 'FAC-ADQ-206',
    valor: 30800.00,
    tipo: 'CXC',
    notas: 'Despacho México'
  },
  {
    id: 'cxc-10',
    sociedad: 'Nutreo',
    contraparte: 'Premex Inc.',
    fecha_factura: '2026-09-11',
    factura: 'FAC-NUT-301',
    valor: 103407.00,
    tipo: 'CXC',
    notas: 'Servicios de formulación y control'
  },
  {
    id: 'cxc-11',
    sociedad: 'Asimetrix',
    contraparte: 'Pralsa Guatemala',
    fecha_factura: '2026-09-15',
    factura: 'FAC-ASX-401',
    valor: 364.00,
    tipo: 'CXC',
    notas: 'Ajuste de soporte tecnológico'
  },
  {
    id: 'cxc-12',
    sociedad: 'Premex Inc.',
    contraparte: 'Premex',
    fecha_factura: '2026-09-02',
    factura: 'FAC-INC-501',
    valor: 449325.00,
    tipo: 'CXC',
    notas: 'Reembolso corporativo y licencias'
  },
  {
    id: 'cxc-13',
    sociedad: 'Premex Inc.',
    contraparte: 'Adiquim',
    fecha_factura: '2026-09-04',
    factura: 'FAC-INC-502',
    valor: 223133.00,
    tipo: 'CXC',
    notas: 'Cuota de soporte global'
  },
  {
    id: 'cxc-14',
    sociedad: 'Premex Inc.',
    contraparte: 'Nutreo',
    fecha_factura: '2026-09-06',
    factura: 'FAC-INC-503',
    valor: 2685.00,
    tipo: 'CXC',
    notas: 'Gastos de viaje'
  },
  {
    id: 'cxc-15',
    sociedad: 'Premex Inc.',
    contraparte: 'Ecuadpremex',
    fecha_factura: '2026-09-07',
    factura: 'FAC-INC-504',
    valor: 1080.00,
    tipo: 'CXC',
    notas: 'Comisión bancaria'
  },
  {
    id: 'cxc-16',
    sociedad: 'Premex Inc.',
    contraparte: 'Pralsa Perú',
    fecha_factura: '2026-09-09',
    factura: 'FAC-INC-505',
    valor: 111831.00,
    tipo: 'CXC',
    notas: 'Consultoría regulatoria'
  },
  {
    id: 'cxc-17',
    sociedad: 'Premex Inc.',
    contraparte: 'Pralsa RD',
    fecha_factura: '2026-09-10',
    factura: 'FAC-INC-506',
    valor: 21703.00,
    tipo: 'CXC',
    notas: 'Servicio técnico Caribe'
  },
  {
    id: 'cxc-18',
    sociedad: 'Premex Inc.',
    contraparte: 'Asimetrix INC',
    fecha_factura: '2026-09-12',
    factura: 'FAC-INC-507',
    valor: 200.00,
    tipo: 'CXC',
    notas: 'Suscripción software'
  },
  {
    id: 'cxc-19',
    sociedad: 'Premex Inc.',
    contraparte: 'Pralsia',
    fecha_factura: '2026-09-13',
    factura: 'FAC-INC-508',
    valor: 600.00,
    tipo: 'CXC',
    notas: 'Gasto legal'
  },
  {
    id: 'cxc-20',
    sociedad: 'Premex Inc.',
    contraparte: 'Alura INC',
    fecha_factura: '2026-09-15',
    factura: 'FAC-INC-509',
    valor: 1456339.00,
    tipo: 'CXC',
    notas: 'Gestión comercial Norteamérica'
  },
  {
    id: 'cxc-21',
    sociedad: 'Premex Inc.',
    contraparte: 'Insylo Technologies SL',
    fecha_factura: '2026-09-18',
    factura: 'FAC-INC-510',
    valor: 416.00,
    tipo: 'CXC',
    notas: 'Sensores IoT'
  },
  {
    id: 'cxc-22',
    sociedad: 'Ecuadpremex',
    contraparte: 'Premex',
    fecha_factura: '2026-09-19',
    factura: 'FAC-ECU-601',
    valor: 29.00,
    tipo: 'CXC',
    notas: 'Ajuste redondeo'
  },
  {
    id: 'cxc-23',
    sociedad: 'Ecuadpremex',
    contraparte: 'Adiquim',
    fecha_factura: '2026-09-20',
    factura: 'FAC-ECU-602',
    valor: 6871.00,
    tipo: 'CXC',
    notas: 'Flete terrestre'
  },
  {
    id: 'cxc-24',
    sociedad: 'Asimetrix INC',
    contraparte: 'Premex',
    fecha_factura: '2026-09-03',
    factura: 'FAC-ASI-701',
    valor: 120000.00,
    tipo: 'CXC',
    notas: 'Plataforma analítica'
  },
  {
    id: 'cxc-25',
    sociedad: 'Asimetrix INC',
    contraparte: 'Adiquim',
    fecha_factura: '2026-09-05',
    factura: 'FAC-ASI-702',
    valor: 72000.00,
    tipo: 'CXC',
    notas: 'Módulos BI'
  },
  {
    id: 'cxc-26',
    sociedad: 'Asimetrix INC',
    contraparte: 'Asimetrix',
    fecha_factura: '2026-09-08',
    factura: 'FAC-ASI-703',
    valor: 167503.00,
    tipo: 'CXC',
    notas: 'I+D desarrollo de producto'
  },
  {
    id: 'cxc-27',
    sociedad: 'Asimetrix INC',
    contraparte: 'Pralsa Guatemala',
    fecha_factura: '2026-09-10',
    factura: 'FAC-ASI-704',
    valor: 2414.00,
    tipo: 'CXC',
    notas: 'Capacitación'
  },
  {
    id: 'cxc-28',
    sociedad: 'Asimetrix INC',
    contraparte: 'Pralsa Perú',
    fecha_factura: '2026-09-12',
    factura: 'FAC-ASI-705',
    valor: 9832.00,
    tipo: 'CXC',
    notas: 'Licencias cloud'
  },
  {
    id: 'cxc-29',
    sociedad: 'Asimetrix INC',
    contraparte: 'Alura INC',
    fecha_factura: '2026-09-15',
    factura: 'FAC-ASI-706',
    valor: 468000.00,
    tipo: 'CXC',
    notas: 'Integración sistemas globales'
  },
  {
    id: 'cxc-30',
    sociedad: 'Alura SAS',
    contraparte: 'Premex Inc.',
    fecha_factura: '2026-09-10',
    factura: 'FAC-ALU-801',
    valor: 10913.00,
    tipo: 'CXC',
    notas: 'Soporte operacional'
  },
  {
    id: 'cxc-31',
    sociedad: 'Alura SAS',
    contraparte: 'Pralsa Guatemala',
    fecha_factura: '2026-09-12',
    factura: 'FAC-ALU-802',
    valor: 10800.00,
    tipo: 'CXC',
    notas: 'Consultoría pecuaria'
  },
  {
    id: 'cxc-32',
    sociedad: 'Alura SAS',
    contraparte: 'Ecuadpremex',
    fecha_factura: '2026-09-14',
    factura: 'FAC-ALU-803',
    valor: 45353.00,
    tipo: 'CXC',
    notas: 'Servicios de logística'
  },
  {
    id: 'cxc-33',
    sociedad: 'Alura SAS',
    contraparte: 'Pralsa Perú',
    fecha_factura: '2026-09-16',
    factura: 'FAC-ALU-804',
    valor: 44266.00,
    tipo: 'CXC',
    notas: 'Servicio técnico de campo'
  },
  {
    id: 'cxc-34',
    sociedad: 'Alura SAS',
    contraparte: 'Alura México',
    fecha_factura: '2026-09-18',
    factura: 'FAC-ALU-805',
    valor: 69500.00,
    tipo: 'CXC',
    notas: 'Desarrollo regional de mercado'
  },
  {
    id: 'cxc-35',
    sociedad: 'Alura INC',
    contraparte: 'Adiquim',
    fecha_factura: '2026-09-22',
    factura: 'FAC-ALI-901',
    valor: 831038.00,
    tipo: 'CXC',
    notas: 'Suministro mayorista'
  },
  {
    id: 'cxc-36',
    sociedad: 'Alura INC',
    contraparte: 'Premex Inc.',
    fecha_factura: '2026-09-24',
    factura: 'FAC-ALI-902',
    valor: 954.00,
    tipo: 'CXC',
    notas: 'Ajuste de inventarios'
  },
  {
    id: 'cxc-37',
    sociedad: 'Insylo Technologies SL',
    contraparte: 'Asimetrix',
    fecha_factura: '2026-09-25',
    factura: 'FAC-INS-1001',
    valor: 5819.00,
    tipo: 'CXC',
    notas: 'Dispositivos telemétricos'
  },

  // --- CUENTAS POR PAGAR (CXP) de la imagen de referencia ---
  {
    id: 'cxp-1',
    sociedad: 'Premex',
    contraparte: 'Premex Inc.',
    fecha_factura: '2026-09-02',
    factura: 'FAC-INC-501',
    valor: 449325.00,
    tipo: 'CXP',
    notas: 'Reembolso corporativo aceptado'
  },
  {
    id: 'cxp-2',
    sociedad: 'Premex',
    contraparte: 'Asimetrix INC',
    fecha_factura: '2026-09-03',
    factura: 'FAC-ASI-701',
    valor: 120000.00,
    tipo: 'CXP',
    notas: 'Aceptado por TI'
  },
  {
    id: 'cxp-3',
    sociedad: 'Adiquim',
    contraparte: 'Premex Inc.',
    fecha_factura: '2026-09-04',
    factura: 'FAC-INC-502',
    valor: 220691.00, // Discrepancia con CXC de 223,133 -> Diff = 2,442
    tipo: 'CXP',
    notas: 'Diferencia en retención de servicio'
  },
  {
    id: 'cxp-4',
    sociedad: 'Adiquim',
    contraparte: 'Ecuadpremex',
    fecha_factura: '2026-09-08',
    factura: 'FAC-ECU-099',
    valor: 564.00,
    tipo: 'CXP',
    notas: 'Gastos de transferencia'
  },
  {
    id: 'cxp-5',
    sociedad: 'Adiquim',
    contraparte: 'Asimetrix INC',
    fecha_factura: '2026-09-05',
    factura: 'FAC-ASI-702',
    valor: 72000.00,
    tipo: 'CXP',
    notas: 'Servicio BI aceptado'
  },
  {
    id: 'cxp-6',
    sociedad: 'Adiquim',
    contraparte: 'Alura INC',
    fecha_factura: '2026-09-22',
    factura: 'FAC-ALI-901',
    valor: 827010.00, // Discrepancia con CXC de 831,038 -> Diff = 4,028
    tipo: 'CXP',
    notas: 'Descuento por pronto pago pendiente'
  },
  {
    id: 'cxp-7',
    sociedad: 'Premex Inc.',
    contraparte: 'Adiquim',
    fecha_factura: '2026-09-10',
    factura: 'FAC-ADQ-201',
    valor: 243837.00,
    tipo: 'CXP',
    notas: 'Aceptado por contabilidad USA'
  },
  {
    id: 'cxp-8',
    sociedad: 'Premex Inc.',
    contraparte: 'Nutreo',
    fecha_factura: '2026-09-11',
    factura: 'FAC-NUT-301',
    valor: 79486.00, // Discrepancia con CXC de 103,407
    tipo: 'CXP',
    notas: 'Factura parcial procesada'
  },
  {
    id: 'cxp-9',
    sociedad: 'Premex Inc.',
    contraparte: 'Alura SAS',
    fecha_factura: '2026-09-10',
    factura: 'FAC-ALU-801',
    valor: 10913.00,
    tipo: 'CXP',
    notas: 'Aprobado'
  },
  {
    id: 'cxp-10',
    sociedad: 'Premex Inc.',
    contraparte: 'Alura INC',
    fecha_factura: '2026-09-15',
    factura: 'FAC-INC-509-P',
    valor: 424305.00,
    tipo: 'CXP',
    notas: 'Partida en revisión'
  },
  {
    id: 'cxp-11',
    sociedad: 'Premex Inc.',
    contraparte: 'Alura INC',
    fecha_factura: '2026-09-24',
    factura: 'FAC-ALI-902',
    valor: 954.00,
    tipo: 'CXP',
    notas: 'Cuadre perfecto'
  },
  {
    id: 'cxp-12',
    sociedad: 'Premex Inc.',
    contraparte: 'Insylo Technologies SL',
    fecha_factura: '2026-09-18',
    factura: 'FAC-INC-510',
    valor: 416.00,
    tipo: 'CXP',
    notas: 'Cuadre sensores'
  },
  {
    id: 'cxp-13',
    sociedad: 'Pralsa Guatemala',
    contraparte: 'Premex',
    fecha_factura: '2026-09-05',
    factura: 'FAC-PMX-101',
    valor: 125922.00,
    tipo: 'CXP',
    notas: 'Recibido en planta'
  },
  {
    id: 'cxp-14',
    sociedad: 'Pralsa Guatemala',
    contraparte: 'Adiquim',
    fecha_factura: '2026-09-14',
    factura: 'FAC-ADQ-202',
    valor: 509825.00, // 509,824 en CXC (1 usd diferencia de redondeo)
    tipo: 'CXP',
    notas: 'Ajuste cambiario de 1 USD'
  },
  {
    id: 'cxp-15',
    sociedad: 'Pralsa Guatemala',
    contraparte: 'Asimetrix',
    fecha_factura: '2026-09-15',
    factura: 'FAC-ASX-401',
    valor: 324.00,
    tipo: 'CXP',
    notas: 'Comisión local'
  },
  {
    id: 'cxp-16',
    sociedad: 'Pralsa Guatemala',
    contraparte: 'Asimetrix INC',
    fecha_factura: '2026-09-10',
    factura: 'FAC-ASI-704',
    valor: 2414.00,
    tipo: 'CXP',
    notas: 'Aprobado'
  },
  {
    id: 'cxp-17',
    sociedad: 'Pralsa Guatemala',
    contraparte: 'Alura SAS',
    fecha_factura: '2026-09-12',
    factura: 'FAC-ALU-802',
    valor: 10800.00,
    tipo: 'CXP',
    notas: 'Aprobado'
  },
  {
    id: 'cxp-18',
    sociedad: 'Ecuadpremex',
    contraparte: 'Premex',
    fecha_factura: '2026-09-08',
    factura: 'FAC-PMX-102',
    valor: 476802.00,
    tipo: 'CXP',
    notas: 'Cuadre verificado'
  },
  {
    id: 'cxp-19',
    sociedad: 'Ecuadpremex',
    contraparte: 'Adiquim',
    fecha_factura: '2026-09-15',
    factura: 'FAC-ADQ-203',
    valor: 1666596.00, // Discrepancia con CXC de 1,903,453
    tipo: 'CXP',
    notas: 'Factura en aduana Guayaquil pendiente de nacionalizar'
  },
  {
    id: 'cxp-20',
    sociedad: 'Ecuadpremex',
    contraparte: 'Premex Inc.',
    fecha_factura: '2026-09-07',
    factura: 'FAC-INC-504',
    valor: 1080.00,
    tipo: 'CXP',
    notas: 'Aprobado'
  },
  {
    id: 'cxp-21',
    sociedad: 'Ecuadpremex',
    contraparte: 'Alura SAS',
    fecha_factura: '2026-09-14',
    factura: 'FAC-ALU-803',
    valor: 40253.00, // Discrepancia con CXC de 45,353
    tipo: 'CXP',
    notas: 'Diferencia en tarifa de flete'
  },
  {
    id: 'cxp-22',
    sociedad: 'Pralsa Perú',
    contraparte: 'Adiquim',
    fecha_factura: '2026-09-16',
    factura: 'FAC-ADQ-204',
    valor: 326319.00,
    tipo: 'CXP',
    notas: 'Cuadre verificado'
  },
  {
    id: 'cxp-23',
    sociedad: 'Pralsa Perú',
    contraparte: 'Premex Inc.',
    fecha_factura: '2026-09-09',
    factura: 'FAC-INC-505',
    valor: 111831.00,
    tipo: 'CXP',
    notas: 'Cuadre verificado'
  },
  {
    id: 'cxp-24',
    sociedad: 'Pralsa Perú',
    contraparte: 'Alura SAS',
    fecha_factura: '2026-09-16',
    factura: 'FAC-ALU-804',
    valor: 44266.00,
    tipo: 'CXP',
    notas: 'Cuadre verificado'
  },
  {
    id: 'cxp-25',
    sociedad: 'Pralsa RD',
    contraparte: 'Asimetrix',
    fecha_factura: '2026-09-10',
    factura: 'FAC-INC-506',
    valor: 21703.00,
    tipo: 'CXP',
    notas: 'Cuadre verificado'
  },
  {
    id: 'cxp-26',
    sociedad: 'Asimetrix INC',
    contraparte: 'Premex Inc.',
    fecha_factura: '2026-09-12',
    factura: 'FAC-INC-507',
    valor: 200.00,
    tipo: 'CXP',
    notas: 'Cuadre verificado'
  },
  {
    id: 'cxp-27',
    sociedad: 'Alura INC',
    contraparte: 'Adiquim',
    fecha_factura: '2026-09-18',
    factura: 'FAC-ADQ-205',
    valor: 267112.00,
    tipo: 'CXP',
    notas: 'Cuadre verificado'
  },
  {
    id: 'cxp-28',
    sociedad: 'Alura INC',
    contraparte: 'Premex Inc.',
    fecha_factura: '2026-09-15',
    factura: 'FAC-INC-509',
    valor: 1456339.00,
    tipo: 'CXP',
    notas: 'Cuadre verificado'
  },
  {
    id: 'cxp-29',
    sociedad: 'Alura INC',
    contraparte: 'Asimetrix INC',
    fecha_factura: '2026-09-15',
    factura: 'FAC-ASI-706',
    valor: 468000.00,
    tipo: 'CXP',
    notas: 'Cuadre verificado'
  },
  {
    id: 'cxp-30',
    sociedad: 'Premicol SA de CV',
    contraparte: 'Adiquim',
    fecha_factura: '2026-09-20',
    factura: 'FAC-ADQ-206',
    valor: 30800.00,
    tipo: 'CXP',
    notas: 'Cuadre verificado'
  },
  {
    id: 'cxp-31',
    sociedad: 'Alura México',
    contraparte: 'Alura SAS',
    fecha_factura: '2026-09-18',
    factura: 'FAC-ALU-805',
    valor: 69500.00,
    tipo: 'CXP',
    notas: 'Cuadre verificado'
  }
];

export const INITIAL_MOVEMENTS: Movement[] = RAW_INITIAL_MOVEMENTS.map((m) => ({
  ...m,
  mes: m.mes || 'Septiembre 2026',
}));

export const INITIAL_COMMENTS: Record<string, string> = {
  'Adiquim___Ecuadpremex': 'Diferencia de $236,857 USD en Factura #FAC-ADQ-203 en proceso de aduanas en Guayaquil.',
  'Premex Inc.___Adiquim': 'Diferencia de $2,442 USD por retención impositiva no reconocida por Adiquim.',
  'Alura INC___Adiquim': 'Diferencia de $4,028 USD originada por pronto pago no reflejado en notas de crédito.',
  'Alura SAS___Ecuadpremex': 'Diferencia de $5,100 USD en recargo por flete marítimo pendiente de aprobación contable.'
};

export const INITIAL_NACIONALES_ENTITIES: EntityMapping[] = [
  {
    id: 'nac-ent-1',
    alias: 'Premex',
    nombreOficial: 'Premex S.A.S.',
    nit: '890900148-1',
    codigoSociedad: 'NAC-100',
    pais: 'Colombia',
    moneda: 'COP',
  },
  {
    id: 'nac-ent-2',
    alias: 'Adiquim',
    nombreOficial: 'Adiquim S.A.S.',
    nit: '800142510-2',
    codigoSociedad: 'NAC-200',
    pais: 'Colombia',
    moneda: 'COP',
  },
  {
    id: 'nac-ent-3',
    alias: 'Nutreo',
    nombreOficial: 'Nutreo S.A.S.',
    nit: '900315420-4',
    codigoSociedad: 'NAC-300',
    pais: 'Colombia',
    moneda: 'COP',
  },
  {
    id: 'nac-ent-4',
    alias: 'Asimetrix',
    nombreOficial: 'Asimetrix S.A.S.',
    nit: '901128490-7',
    codigoSociedad: 'NAC-400',
    pais: 'Colombia',
    moneda: 'COP',
  },
  {
    id: 'nac-ent-5',
    alias: 'Alura SAS',
    nombreOficial: 'Alura S.A.S.',
    nit: '900884312-9',
    codigoSociedad: 'NAC-500',
    pais: 'Colombia',
    moneda: 'COP',
  },
  {
    id: 'nac-ent-6',
    alias: 'Prizma SAS',
    nombreOficial: 'Prizma S.A.S.',
    nit: '900654120-5',
    codigoSociedad: 'NAC-600',
    pais: 'Colombia',
    moneda: 'COP',
  },
  {
    id: 'nac-ent-7',
    alias: 'Progal BT SAS',
    nombreOficial: 'Progal BT S.A.S.',
    nit: '900442198-3',
    codigoSociedad: 'NAC-700',
    pais: 'Colombia',
    moneda: 'COP',
  },
];

export const INITIAL_ANITOX_ENTITIES: EntityMapping[] = [
  {
    id: 'anx-ent-1',
    alias: 'Anitox Corp',
    nombreOficial: 'Anitox Corporation',
    nit: 'US-58-129044',
    codigoSociedad: 'ANX-100',
    pais: 'Estados Unidos',
    moneda: 'USD',
  },
  {
    id: 'anx-ent-2',
    alias: 'Anitox UK',
    nombreOficial: 'Anitox Ltd (UK)',
    nit: 'GB-41029384',
    codigoSociedad: 'ANX-200',
    pais: 'Reino Unido',
    moneda: 'USD',
  },
  {
    id: 'anx-ent-3',
    alias: 'Anitox Asia',
    nombreOficial: 'Anitox Asia Pacific',
    nit: 'MY-902184-X',
    codigoSociedad: 'ANX-300',
    pais: 'Malasia',
    moneda: 'USD',
  },
  {
    id: 'anx-ent-4',
    alias: 'Anitox México',
    nombreOficial: 'Anitox México S. de R.L.',
    nit: 'ANM-140219-8K1',
    codigoSociedad: 'ANX-400',
    pais: 'México',
    moneda: 'USD',
  },
  {
    id: 'anx-ent-5',
    alias: 'Anitox Brasil',
    nombreOficial: 'Anitox do Brasil Ltda.',
    nit: '18.420.910/0001-44',
    codigoSociedad: 'ANX-500',
    pais: 'Brasil',
    moneda: 'USD',
  },
  {
    id: 'anx-ent-6',
    alias: 'Premex Corp',
    nombreOficial: 'Premex Corp',
    nit: 'US-84-219043',
    codigoSociedad: 'ANX-600',
    pais: 'Estados Unidos',
    moneda: 'USD',
  },
];

export const getInitialEntitiesForScope = (
  scope: ReconciliationScope
): EntityMapping[] => {
  if (scope === 'nacionales') return INITIAL_NACIONALES_ENTITIES;
  if (scope === 'anitox') return INITIAL_ANITOX_ENTITIES;
  return INITIAL_ENTITIES;
};
