import {
  EffectivePermissions,
  OdooCostCenterEntry,
  OdooDistributionNature,
  OdooDocTypeEntry,
  OdooEmployeeEntry,
  OdooExpenseCodeEntry,
  OdooExpenseDistributionEntry,
  OdooExpenseType,
  OdooTaxIndicatorEntry,
  UserPermissionRecord,
  ViaticoCategory,
  ViaticoConsultor,
  ViaticoCurrency,
  ViaticoExpenseItem,
  ViaticoLiquidation,
  ViaticoOdooCatalogs,
  ViaticoOdooConfig,
} from '../types';
import { emailToPermissionDocId, normalizeEmail } from './permissions';
import { normalizeTextToken, parseNameTokensFromEmail } from './viaticos';

export const VIATICO_CURRENCY_TO_ISO: Record<ViaticoCurrency, string> = {
  Quetzales: 'GTQ',
  Dólares: 'USD',
  'Pesos Colombianos': 'COP',
  Lempiras: 'HNL',
  'Pesos Mexicanos': 'MXN',
  Euros: 'EUR',
  Colones: 'CRC',
};

export const ODOO_CATALOGS_STORAGE_KEY = 'premex_viaticos_odoo_catalogs_v1';

// ============================================================================
// Seed Data Exacto — Plantilla_Gastos_GT_S-44 (Páginas 2 a 6)
// ============================================================================

export const INITIAL_ODOO_DOC_TYPES: OdooDocTypeEntry[] = [
  { id: 'doct-fcam', codigo: 'FCAM', nombre: 'Factura Cambiaria', labelOdoo: 'FCAM - Factura Cambiaria', activo: true },
  { id: 'doct-fact', codigo: 'FACT', nombre: 'Factura Electrónica', labelOdoo: 'FACT - Factura Electrónica', activo: true },
  { id: 'doct-fesp', codigo: 'FESP', nombre: 'Factura Especial', labelOdoo: 'FESP - Factura Especial', activo: true },
  { id: 'doct-fpeq', codigo: 'FPEQ', nombre: 'Factura Electrónica para Pequeños Contribuyentes', labelOdoo: 'FPEQ - Factura Electrónica para Pequeños Contribuyentes', activo: true },
  { id: 'doct-fcap', codigo: 'FCAP', nombre: 'Factura Cambiaria de Pequeño Contribuyente', labelOdoo: 'FCAP - Factura Cambiaria de Pequeño Contribuyente', activo: true },
  { id: 'doct-rdon', codigo: 'RDON', nombre: 'Recibo por Donacion', labelOdoo: 'RDON - Recibo por Donacion', activo: true },
  { id: 'doct-reci', codigo: 'RECI', nombre: 'Recibo', labelOdoo: 'RECI - Recibo', activo: true },
  { id: 'doct-duca', codigo: 'DUCA', nombre: 'Declaracion Unica Centroamericana', labelOdoo: 'DUCA - Declaracion Unica Centroamericana', activo: true },
  { id: 'doct-fyduca', codigo: 'FYDUCA', nombre: 'Factura y Declaracion Unica Centroamericana', labelOdoo: 'FYDUCA - Factura y Declaracion Unica Centroamericana', activo: true },
  { id: 'doct-otros', codigo: 'OTROS', nombre: 'Otros comprobantes', labelOdoo: 'OTROS - Otros comprobantes', activo: true },
  { id: 'doct-fce', codigo: 'FCE', nombre: 'Factura del exterior', labelOdoo: 'FCE - Factura del exterior', activo: true },
];

export const INITIAL_ODOO_COST_CENTERS: OdooCostCenterEntry[] = [
  { id: 'cc-gt10000300', codigo: 'GT10000300', cuentaAnalitica: 'GT10000300 GERENCIA PAIS', odooAnalyticId: '529', analyticDistribution: '{"529": 100.0}', activo: true },
  { id: 'cc-gt10000301', codigo: 'GT10000301', cuentaAnalitica: 'GT10000301 DIR ADMINISTRATIVO', odooAnalyticId: '517', analyticDistribution: '{"517": 100.0}', activo: true },
  { id: 'cc-gt10000474', codigo: 'GT10000474', cuentaAnalitica: 'GT10000474 PLANEACION FINANCIERA', odooAnalyticId: '518', analyticDistribution: '{"518": 100.0}', activo: true },
  { id: 'cc-gt10000475', codigo: 'GT10000475', cuentaAnalitica: 'GT10000475 RIESGOS', odooAnalyticId: '519', analyticDistribution: '{"519": 100.0}', activo: true },
  { id: 'cc-gt10000601', codigo: 'GT10000601', cuentaAnalitica: 'GT10000601 CONTABILIDAD', odooAnalyticId: '520', analyticDistribution: '{"520": 100.0}', activo: true },
  { id: 'cc-gt10000700', codigo: 'GT10000700', cuentaAnalitica: 'GT10000700 GESTION HUMANA', odooAnalyticId: '521', analyticDistribution: '{"521": 100.0}', activo: true },
  { id: 'cc-gt10000706', codigo: 'GT10000706', cuentaAnalitica: 'GT10000706 SERV COMPARTIDOS', odooAnalyticId: '522', analyticDistribution: '{"522": 100.0}', activo: true },
  { id: 'cc-gt10000806', codigo: 'GT10000806', cuentaAnalitica: 'GT10000806 CTC AFA ADMON', odooAnalyticId: '523', analyticDistribution: '{"523": 100.0}', activo: true },
  { id: 'cc-gt10001400', codigo: 'GT10001400', cuentaAnalitica: 'GT10001400 GNL ADMINISTRATIVO', odooAnalyticId: '524', analyticDistribution: '{"524": 100.0}', activo: true },
  { id: 'cc-gt10001490', codigo: 'GT10001490', cuentaAnalitica: 'GT10001490 GERENCIA DE SERVICIO', odooAnalyticId: '525', analyticDistribution: '{"525": 100.0}', activo: true },
  { id: 'cc-gt10001500', codigo: 'GT10001500', cuentaAnalitica: 'GT10001500 OTROS FINANCIERA', odooAnalyticId: '534', analyticDistribution: '{"534": 100.0}', activo: true },
  { id: 'cc-gt10001501', codigo: 'GT10001501', cuentaAnalitica: 'GT10001501 PROV. IMPTO RENTA', odooAnalyticId: '535', analyticDistribution: '{"535": 100.0}', activo: true },
  { id: 'cc-gt10004371', codigo: 'GT10004371', cuentaAnalitica: 'GT10004371 PLANEACION', odooAnalyticId: '526', analyticDistribution: '{"526": 100.0}', activo: true },
  { id: 'cc-gt10006547', codigo: 'GT10006547', cuentaAnalitica: 'GT10006547 CTC OKUO GT ADMON', odooAnalyticId: '527', analyticDistribution: '{"527": 100.0}', activo: true },
  { id: 'cc-gt10006548', codigo: 'GT10006548', cuentaAnalitica: 'GT10006548 CTC BIOAPPS GT ADMON', odooAnalyticId: '528', analyticDistribution: '{"528": 100.0}', activo: true },
  { id: 'cc-gt10000805', codigo: 'GT10000805', cuentaAnalitica: 'GT10000805 VENTAS ALURA B', odooAnalyticId: '536', analyticDistribution: '{"536": 100.0}', activo: true },
  { id: 'cc-gt10000854', codigo: 'GT10000854', cuentaAnalitica: 'GT10000854 ASIMETRIX- VENTAS', odooAnalyticId: '537', analyticDistribution: '{"537": 100.0}', activo: true },
  { id: 'cc-gt10000856', codigo: 'GT10000856', cuentaAnalitica: 'GT10000856 ALEJANDRO MURPHY', odooAnalyticId: '538', analyticDistribution: '{"538": 100.0}', activo: true },
  { id: 'cc-gt10000857', codigo: 'GT10000857', cuentaAnalitica: 'GT10000857 CTC MATUTE MONTES JOSE DANIEL', odooAnalyticId: '1162', analyticDistribution: '{"1162": 100.0}', activo: true },
  { id: 'cc-gt10001401', codigo: 'GT10001401', cuentaAnalitica: 'GT10001401 GENERALES VENTAS', odooAnalyticId: '539', analyticDistribution: '{"539": 100.0}', activo: true },
  { id: 'cc-gt10006009', codigo: 'GT10006009', cuentaAnalitica: 'GT10006009 CTC OLIVA GUEVARA', odooAnalyticId: '1153', analyticDistribution: '{"1153": 100.0}', activo: true },
  { id: 'cc-gt10006044', codigo: 'GT10006044', cuentaAnalitica: 'GT10006044 CTC MARCO SANCHEZ', odooAnalyticId: '540', analyticDistribution: '{"540": 100.0}', activo: true },
  { id: 'cc-gt10006047', codigo: 'GT10006047', cuentaAnalitica: 'GT10006047 CTC EMILIO GONZALEZ', odooAnalyticId: '541', analyticDistribution: '{"541": 100.0}', activo: true },
  { id: 'cc-gt10006049', codigo: 'GT10006049', cuentaAnalitica: 'GT10006049 CTC LAMAR CAMACHO', odooAnalyticId: '542', analyticDistribution: '{"542": 100.0}', activo: true },
  { id: 'cc-gt10006056', codigo: 'GT10006056', cuentaAnalitica: 'GT10006056 CTC DANIEL MOLINA', odooAnalyticId: '1155', analyticDistribution: '{"1155": 100.0}', activo: true },
  { id: 'cc-gt10006057', codigo: 'GT10006057', cuentaAnalitica: 'GT10006057 CTC HUGO GIRON', odooAnalyticId: '543', analyticDistribution: '{"543": 100.0}', activo: true },
  { id: 'cc-gt10006066', codigo: 'GT10006066', cuentaAnalitica: 'GT10006066 CTC LUIS E. LOPEZ', odooAnalyticId: '544', analyticDistribution: '{"544": 100.0}', activo: true },
  { id: 'cc-gt10006425', codigo: 'GT10006425', cuentaAnalitica: 'GT10006425 CTC RONAL RIVERA', odooAnalyticId: '545', analyticDistribution: '{"545": 100.0}', activo: true },
  { id: 'cc-gt10006500', codigo: 'GT10006500', cuentaAnalitica: 'GT10006500 NESP', odooAnalyticId: '546', analyticDistribution: '{"546": 100.0}', activo: true },
  { id: 'cc-gt10006506', codigo: 'GT10006506', cuentaAnalitica: 'GT10006506 CC JOSE IGNACIO', odooAnalyticId: '547', analyticDistribution: '{"547": 100.0}', activo: true },
  { id: 'cc-gt10006538', codigo: 'GT10006538', cuentaAnalitica: 'GT10006538 DIR PAOLA SEMPE', odooAnalyticId: '548', analyticDistribution: '{"548": 100.0}', activo: true },
  { id: 'cc-gt10006542', codigo: 'GT10006542', cuentaAnalitica: 'GT10006542 CTC JOSE SANDOVAL', odooAnalyticId: '549', analyticDistribution: '{"549": 100.0}', activo: true },
  { id: 'cc-gt10006545', codigo: 'GT10006545', cuentaAnalitica: 'GT10006545 CTC OKUO GUATEMALA', odooAnalyticId: '550', analyticDistribution: '{"550": 100.0}', activo: true },
  { id: 'cc-gt10006546', codigo: 'GT10006546', cuentaAnalitica: 'GT10006546 CTC BIOAPPS GUATEMAL', odooAnalyticId: '551', analyticDistribution: '{"551": 100.0}', activo: true },
  { id: 'cc-gt10006549', codigo: 'GT10006549', cuentaAnalitica: 'GT10006549 CTC RICARDO ANTONIO', odooAnalyticId: '552', analyticDistribution: '{"552": 100.0}', activo: true },
  { id: 'cc-gt10006551', codigo: 'GT10006551', cuentaAnalitica: 'GT10006551 CTC RODRIGO BATRES', odooAnalyticId: '553', analyticDistribution: '{"553": 100.0}', activo: true },
  { id: 'cc-gt10006552', codigo: 'GT10006552', cuentaAnalitica: 'GT10006552 NUTRICION CA', odooAnalyticId: '554', analyticDistribution: '{"554": 100.0}', activo: true },
  { id: 'cc-gt10006554', codigo: 'GT10006554', cuentaAnalitica: 'GT10006554 JOSE RODRIGO TREJO R', odooAnalyticId: '555', analyticDistribution: '{"555": 100.0}', activo: true },
  { id: 'cc-gt10006555', codigo: 'GT10006555', cuentaAnalitica: 'GT10006555 CTC MARCOS ERNESTO JUAREZ', odooAnalyticId: '1085', analyticDistribution: '{"1085": 100.0}', activo: true },
  { id: 'cc-gt10114022', codigo: 'GT10114022', cuentaAnalitica: 'GT10114022 DESPACHOS', odooAnalyticId: '556', analyticDistribution: '{"556": 100.0}', activo: true },
  { id: 'cc-gt10110811', codigo: 'GT10110811', cuentaAnalitica: 'GT10110811 LABORATORIO', odooAnalyticId: '530', analyticDistribution: '{"530": 100.0}', activo: true },
  { id: 'cc-gt10111001', codigo: 'GT10111001', cuentaAnalitica: 'GT10111001 CONTROL DE CALIDAD', odooAnalyticId: '531', analyticDistribution: '{"531": 100.0}', activo: true },
  { id: 'cc-gt10114040', codigo: 'GT10114040', cuentaAnalitica: 'GT10114040 PRODUCCION MOD', odooAnalyticId: '1078', analyticDistribution: '{"1078": 100.0}', activo: true },
  { id: 'cc-gt10114042', codigo: 'GT10114042', cuentaAnalitica: 'GT10114042 ADM OPER PLANTA', odooAnalyticId: '532', analyticDistribution: '{"532": 100.0}', activo: true },
  { id: 'cc-gt10114044', codigo: 'GT10114044', cuentaAnalitica: 'GT10114044 PRODUCCION', odooAnalyticId: '533', analyticDistribution: '{"533": 100.0}', activo: true },
  { id: 'cc-400180', codigo: '400180', cuentaAnalitica: '400180 NUTREO', odooAnalyticId: '1160', analyticDistribution: '{"1160": 100.0}', activo: true },
  { id: 'cc-400184', codigo: '400184', cuentaAnalitica: '400184 GASTOS LOGISTICA', odooAnalyticId: '1079', analyticDistribution: '{"1079": 100.0}', activo: true },
  { id: 'cc-400192', codigo: '400192', cuentaAnalitica: '400192 PROYECTO CMI DOSIFICACION INHIMOLD', odooAnalyticId: '1159', analyticDistribution: '{"1159": 100.0}', activo: true },
  { id: 'cc-400271', codigo: '400271', cuentaAnalitica: '400271 CAMION MITSUBISHI', odooAnalyticId: '1156', analyticDistribution: '{"1156": 100.0}', activo: true },
  { id: 'cc-400272', codigo: '400272', cuentaAnalitica: '400272 CAMION KIA', odooAnalyticId: '1157', analyticDistribution: '{"1157": 100.0}', activo: true },
  { id: 'cc-400273', codigo: '400273', cuentaAnalitica: '400273 PICKUP LOGISTICA', odooAnalyticId: '1158', analyticDistribution: '{"1158": 100.0}', activo: true },
];

export const INITIAL_ODOO_EMPLOYEES: OdooEmployeeEntry[] = [
  { id: 'emp-daniel-molina', nombreCompleto: 'DANIEL ALEJANDRO MOLINA MORAN', centroCosto: 'GT10006056 CTC DANIEL MOLINA', analyticDistribution: '{"1155": 100.0}', empresa: 'Premex Corp', activo: true },
  { id: 'emp-daniel-garcia-salas', nombreCompleto: 'DANIEL ESTUARDO GARCIA-SALAS BONILLA', empresa: 'Premex Corp', activo: true },
  { id: 'emp-diego-rosales', nombreCompleto: 'DIEGO SEBASTIAN ROSALES ROLDAN', empresa: 'Premex Corp', activo: true },
  { id: 'emp-divas-reynosa', nombreCompleto: 'DIVAS REYNOSA BLANCANDREA', empresa: 'Premex Corp', activo: true },
  { id: 'emp-elder-juarez', nombreCompleto: 'ELDER YOVANI JUAREZ HERNANDEZ', email: 'elder.juarez@premexcorp.com', permissionDocId: emailToPermissionDocId('elder.juarez@premexcorp.com'), centroCosto: 'GT10000601 CONTABILIDAD', analyticDistribution: '{"520": 100.0}', empresa: 'Premex Corp', activo: true },
  { id: 'emp-emilio-gonzalez', nombreCompleto: 'EMILIO GONZALEZ GONZALEZ', centroCosto: 'GT10006047 CTC EMILIO GONZALEZ', analyticDistribution: '{"541": 100.0}', empresa: 'Premex Corp', activo: true },
  { id: 'emp-hugo-giron', nombreCompleto: 'HUGO ROBERTO GIRON FLORES', centroCosto: 'GT10006057 CTC HUGO GIRON', analyticDistribution: '{"543": 100.0}', empresa: 'Premex Corp', activo: true },
  { id: 'emp-ian-torres', nombreCompleto: 'IAN JOSUE TORRES QUINTANA', empresa: 'Premex Corp', activo: true },
  { id: 'emp-jose-murphy', nombreCompleto: 'JOSE ALEJANDRO MURPHY PALAREA', centroCosto: 'GT10000856 ALEJANDRO MURPHY', analyticDistribution: '{"538": 100.0}', empresa: 'Premex Corp', activo: true },
  { id: 'emp-jose-sandoval', nombreCompleto: 'JOSE ALFREDO SANDOVAL CASTILLO', centroCosto: 'GT10006542 CTC JOSE SANDOVAL', analyticDistribution: '{"549": 100.0}', empresa: 'Premex Corp', activo: true },
  { id: 'emp-jose-matute', nombreCompleto: 'JOSE DANIEL MATUTE MONTES', centroCosto: 'GT10000857 CTC MATUTE MONTES JOSE DANIEL', analyticDistribution: '{"1162": 100.0}', empresa: 'Premex Corp', activo: true },
  { id: 'emp-jose-alvarado', nombreCompleto: 'JOSE IGNACIO ALVARADO DE LEON-REGIL', centroCosto: 'GT10006506 CC JOSE IGNACIO', analyticDistribution: '{"547": 100.0}', empresa: 'Premex Corp', activo: true },
  { id: 'emp-jose-rodriguez', nombreCompleto: 'JOSE MANUEL RODRIGUEZ PAZ', empresa: 'Premex Corp', activo: true },
  { id: 'emp-jose-trejo', nombreCompleto: 'JOSE RODRIGO TREJO ROLDAN', centroCosto: 'GT10006554 JOSE RODRIGO TREJO R', analyticDistribution: '{"555": 100.0}', empresa: 'Premex Corp', activo: true },
  { id: 'emp-juan-gomez', nombreCompleto: 'JUAN ALBERTO GOMEZ PIRIQUE', empresa: 'Premex Corp', activo: true },
  { id: 'emp-julio-garcia', nombreCompleto: 'JULIO ALEXANDER GARCIA GARCIA', empresa: 'Premex Corp', activo: true },
  { id: 'emp-ludim-lopez', nombreCompleto: 'LUDIM MIGUEL LOPEZ GOMEZ', empresa: 'Premex Corp', activo: true },
  { id: 'emp-luis-gutierrez', nombreCompleto: 'LUIS ALBERTO GUTIERREZ CASTRO', centroCosto: 'GT10000300 GERENCIA PAIS', analyticDistribution: '{"529": 100.0}', empresa: 'Premex Corp', activo: true },
  { id: 'emp-luis-lopez', nombreCompleto: 'LUIS EDUARDO LOPEZ MARTINEZ', centroCosto: 'GT10006066 CTC LUIS E. LOPEZ', analyticDistribution: '{"544": 100.0}', empresa: 'Premex Corp', activo: true },
  { id: 'emp-marco-sanchez', nombreCompleto: 'MARCO SANCHEZ GARCIA', centroCosto: 'GT10006044 CTC MARCO SANCHEZ', analyticDistribution: '{"540": 100.0}', empresa: 'Premex Corp', activo: true },
  { id: 'emp-marcos-juarez', nombreCompleto: 'MARCOS ERNESTO JUAREZ ALFARO', centroCosto: 'GT10006555 CTC MARCOS ERNESTO JUAREZ', analyticDistribution: '{"1085": 100.0}', empresa: 'Premex Corp', activo: true },
  { id: 'emp-maria-villamarin', nombreCompleto: 'MARIA ANGELICA VILLAMARIN LOZANO', empresa: 'Premex Corp', activo: true },
  { id: 'emp-maria-mejia', nombreCompleto: 'MARIA CECILIA MEJIA CIFUENTES', empresa: 'Premex Corp', activo: true },
  { id: 'emp-melania-sirin', nombreCompleto: 'MELANIA ARACELY SIRIN RAMOS', empresa: 'Premex Corp', activo: true },
  { id: 'emp-monica-alvarez', nombreCompleto: 'MONICA ZULEMA DEL CARMEN ALVAREZ LOPEZ', empresa: 'Premex Corp', activo: true },
  { id: 'emp-oliva-guevara', nombreCompleto: 'OLIVA FABIOLA GUEVARA FLORENTINO', centroCosto: 'GT10006009 CTC OLIVA GUEVARA', analyticDistribution: '{"1153": 100.0}', empresa: 'Premex Corp', activo: true },
  { id: 'emp-oliver-silva', nombreCompleto: 'OLIVER ALEJANDRO SILVA HERNANDEZ', empresa: 'Premex Corp', activo: true },
  { id: 'emp-paola-sempe', nombreCompleto: 'PAOLA SEMPE BRAN', centroCosto: 'GT10006538 DIR PAOLA SEMPE', analyticDistribution: '{"548": 100.0}', empresa: 'Premex Corp', activo: true },
  { id: 'emp-rodrigo-batres', nombreCompleto: 'RODRIGO ANTONIO BATRES GRACIA', centroCosto: 'GT10006551 CTC RODRIGO BATRES', analyticDistribution: '{"553": 100.0}', empresa: 'Premex Corp', activo: true },
  { id: 'emp-ronald-rivera', nombreCompleto: 'RONALD EDUARDO RIVERA BOCALETTI', centroCosto: 'GT10006425 CTC RONAL RIVERA', analyticDistribution: '{"545": 100.0}', empresa: 'Premex Corp', activo: true },
];

export const INITIAL_ODOO_EXPENSE_CODES: OdooExpenseCodeEntry[] = [
  { id: 'exp-720000', codigo: '720000', nombre: 'MANTENIMIENTO CONSTRUCCIONES Y EDIFICIO', labelOdoo: '720000 MANTENIMIENTO CONSTRUCCIONES Y EDIFICIO', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720003', codigo: '720003', nombre: 'MANTENIMIENTO FLOTA Y EQUIPO TRANSPORTE', labelOdoo: '720003 MANTENIMIENTO FLOTA Y EQUIPO TRANSPORTE', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720004', codigo: '720004', nombre: 'MANTENIMIENTO MAQUINARIA Y EQUIPO', labelOdoo: '720004 MANTENIMIENTO MAQUINARIA Y EQUIPO', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720009', codigo: '720009', nombre: 'ARRENDAMIENTO PARQUEADERO', labelOdoo: '720009 ARRENDAMIENTO PARQUEADERO', categoriaVinculada: 'Peajes / Parqueo', activo: true },
  { id: 'exp-720011', codigo: '720011', nombre: 'ENERGIA ELECTRICA', labelOdoo: '720011 ENERGIA ELECTRICA', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720012', codigo: '720012', nombre: 'TIQUETE INTERNACIONAL', labelOdoo: '720012 TIQUETE INTERNACIONAL', categoriaVinculada: 'Boletos Aéreos', activo: true },
  { id: 'exp-720013', codigo: '720013', nombre: 'ALIMENTACION VIAJES', labelOdoo: '720013 ALIMENTACION VIAJES', categoriaVinculada: 'Alimentación', activo: true },
  { id: 'exp-720014', codigo: '720014', nombre: 'TIQUETE NACIONAL', labelOdoo: '720014 TIQUETE NACIONAL', categoriaVinculada: 'Boletos Aéreos', activo: true },
  { id: 'exp-720015', codigo: '720015', nombre: 'ALOJAMIENTO/HOTELES', labelOdoo: '720015 ALOJAMIENTO/HOTELES', categoriaVinculada: 'Hospedaje', activo: true },
  { id: 'exp-720017', codigo: '720017', nombre: 'SERVICIO CORREO', labelOdoo: '720017 SERVICIO CORREO', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720019', codigo: '720019', nombre: 'SERVICIO LAVANDERIA', labelOdoo: '720019 SERVICIO LAVANDERIA', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720021', codigo: '720021', nombre: 'SERVICIO VIGILANCIA', labelOdoo: '720021 SERVICIO VIGILANCIA', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720024', codigo: '720024', nombre: 'TAXIS Y BUSES', labelOdoo: '720024 TAXIS Y BUSES', categoriaVinculada: 'Taxis / Buses', activo: true },
  { id: 'exp-720027', codigo: '720027', nombre: 'PEAJES', labelOdoo: '720027 PEAJES', categoriaVinculada: 'Peajes / Parqueo', activo: true },
  { id: 'exp-720028', codigo: '720028', nombre: 'PAPELERÍA Y UTILES', labelOdoo: '720028 PAPELERÍA Y UTILES', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720030', codigo: '720030', nombre: 'SEGURIDAD INDUSTRIAL/ELEM PROTECCION', labelOdoo: '720030 SEGURIDAD INDUSTRIAL/ELEM PROTECCION', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720032', codigo: '720032', nombre: 'SERVICIO ASEO EMPRESAS PRIVADAS', labelOdoo: '720032 SERVICIO ASEO EMPRESAS PRIVADAS', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720033', codigo: '720033', nombre: 'ANALISIS DE LABORATORIO', labelOdoo: '720033 ANALISIS DE LABORATORIO', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720039', codigo: '720039', nombre: 'INSUMOS DE LABORATORIO', labelOdoo: '720039 INSUMOS DE LABORATORIO', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720041', codigo: '720041', nombre: 'ARRENDAMIENTO VEHICULOS', labelOdoo: '720041 ARRENDAMIENTO VEHICULOS', categoriaVinculada: 'Taxis / Buses', activo: true },
  { id: 'exp-720042', codigo: '720042', nombre: 'GASTOS MEDICOS, MEDICAMENTOS Y VACUNAS', labelOdoo: '720042 GASTOS MEDICOS, MEDICAMENTOS Y VACUNAS', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720044', codigo: '720044', nombre: 'ELEMENTOS ASEO Y CAFETERIA', labelOdoo: '720044 ELEMENTOS ASEO Y CAFETERIA', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720045', codigo: '720045', nombre: 'ADECUACION REPARACIONES LOCATIVAS', labelOdoo: '720045 ADECUACION REPARACIONES LOCATIVAS', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720050', codigo: '720050', nombre: 'CORREO / ENCOMIENDAS', labelOdoo: '720050 CORREO / ENCOMIENDAS', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720051', codigo: '720051', nombre: 'ALIMENTACION', labelOdoo: '720051 ALIMENTACION', categoriaVinculada: 'Alimentación', activo: true },
  { id: 'exp-720055', codigo: '720055', nombre: 'SUMINISTROS OFICINA/PAPELERIA', labelOdoo: '720055 SUMINISTROS OFICINA/PAPELERIA', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720057', codigo: '720057', nombre: 'DOTACION', labelOdoo: '720057 DOTACION', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720058', codigo: '720058', nombre: 'PUBLICIDAD Y PROPAGANDA', labelOdoo: '720058 PUBLICIDAD Y PROPAGANDA', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720060', codigo: '720060', nombre: 'COMBUSTIBLES', labelOdoo: '720060 COMBUSTIBLES', categoriaVinculada: 'Combustible / Lub', activo: true },
  { id: 'exp-720064', codigo: '720064', nombre: 'CARGUE Y DESCARGUE MERCANCIA', labelOdoo: '720064 CARGUE Y DESCARGUE MERCANCIA', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720085', codigo: '720085', nombre: 'FLETES NACIONALES', labelOdoo: '720085 FLETES NACIONALES', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720097', codigo: '720097', nombre: 'GASTOS DE REPRESENTACION', labelOdoo: '720097 GASTOS DE REPRESENTACION', categoriaVinculada: 'Atención a Clientes', activo: true },
  { id: 'exp-720098', codigo: '720098', nombre: 'COMISIONES', labelOdoo: '720098 COMISIONES', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720106', codigo: '720106', nombre: 'PENALIDAD TIQUETES', labelOdoo: '720106 PENALIDAD TIQUETES', categoriaVinculada: 'Boletos Aéreos', activo: true },
  { id: 'exp-720107', codigo: '720107', nombre: 'LICENCIAS-TRAMITES', labelOdoo: '720107 LICENCIAS-TRAMITES', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720125', codigo: '720125', nombre: 'DIVERSOS ENVASES Y EMPAQUES', labelOdoo: '720125 DIVERSOS ENVASES Y EMPAQUES', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720129', codigo: '720129', nombre: 'IMPUESTOS MUNICIPALES', labelOdoo: '720129 IMPUESTOS MUNICIPALES', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720132', codigo: '720132', nombre: 'TELEFONIA MOVIL', labelOdoo: '720132 TELEFONIA MOVIL', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720135', codigo: '720135', nombre: 'HONORARIOS PROFESIONALES', labelOdoo: '720135 HONORARIOS PROFESIONALES', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720137', codigo: '720137', nombre: 'SEGURO VIDA COLECTIVA', labelOdoo: '720137 SEGURO VIDA COLECTIVA', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720166', codigo: '720166', nombre: 'IDP IMPUESTO DISTRIBUCION PETROLEO', labelOdoo: '720166 IDP IMPUESTO DISTRIBUCION PETROLEO', categoriaVinculada: 'Combustible / Lub', activo: true },
  { id: 'exp-720179', codigo: '720179', nombre: 'HONORARIOS PROCESOS DE SELECCIÓN', labelOdoo: '720179 HONORARIOS PROCESOS DE SELECCIÓN', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720180', codigo: '720180', nombre: 'COMISIONES BANCARIAS', labelOdoo: '720180 COMISIONES BANCARIAS', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720181', codigo: '720181', nombre: 'DOCUMENTO NO AUTORIZADO', labelOdoo: '720181 DOCUMENTO NO AUTORIZADO', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720182', codigo: '720182', nombre: 'SEGURO SUSTRACCION Y HURTO', labelOdoo: '720182 SEGURO SUSTRACCION Y HURTO', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720183', codigo: '720183', nombre: 'MULTAS SANCIONES Y LITIGIOS', labelOdoo: '720183 MULTAS SANCIONES Y LITIGIOS', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720184', codigo: '720184', nombre: 'DONACIONES', labelOdoo: '720184 DONACIONES', categoriaVinculada: 'Otros Gastos', activo: true },
  { id: 'exp-720185', codigo: '720185', nombre: 'IMPUESTO TURISMO', labelOdoo: '720185 IMPUESTO TURISMO', categoriaVinculada: 'Hospedaje', activo: true },
];

export const INITIAL_ODOO_TAX_INDICATORS: OdooTaxIndicatorEntry[] = [
  {
    id: 'tax-xa',
    codigo: 'XA',
    nombreImpuesto: 'XA - Iva CR Fiscal Compras Gravadas Locales 12%',
    validezFiscal: 'Bienes',
    etiquetaFactura: 'IVA 12%',
    tipoImpuesto: 'Compras',
    porcentaje: 12,
    activo: true,
  },
  {
    id: 'tax-xb',
    codigo: 'XB',
    nombreImpuesto: 'XB - Iva CR Fiscal Otras Compras Exentas Locales 0%',
    validezFiscal: 'Exento',
    etiquetaFactura: 'IVA 0%',
    tipoImpuesto: 'Compras',
    porcentaje: 0,
    activo: true,
  },
  {
    id: 'tax-xc',
    codigo: 'XC',
    nombreImpuesto: 'XC - Iva CR Fiscal Servicios Locales 12%',
    validezFiscal: 'Servicios',
    etiquetaFactura: 'IVA 12%',
    tipoImpuesto: 'Compras',
    porcentaje: 12,
    activo: true,
  },
  {
    id: 'tax-xo',
    codigo: 'XO',
    nombreImpuesto: 'XO - Iva CR Fiscal Servicios Locales exentos 0%',
    validezFiscal: 'Exento',
    etiquetaFactura: 'IVA 0%',
    tipoImpuesto: 'Compras',
    porcentaje: 0,
    activo: true,
  },
  {
    id: 'tax-xe',
    codigo: 'XE',
    nombreImpuesto: 'XE - Iva CR Fiscal Servicios Exterior Exentos 0%',
    validezFiscal: 'Servicios',
    etiquetaFactura: 'IVA 0%',
    tipoImpuesto: 'Compras',
    porcentaje: 0,
    activo: true,
  },
  {
    id: 'tax-xf',
    codigo: 'XF',
    nombreImpuesto: 'XF - Iva Cr Fiscal Compra Pequeños contrib. 0%',
    validezFiscal: 'Pequeño Contribuyente',
    etiquetaFactura: 'IVA 0%',
    tipoImpuesto: 'Compras',
    porcentaje: 0,
    activo: true,
  },
];

export const INITIAL_ODOO_EXPENSE_DISTRIBUTIONS: OdooExpenseDistributionEntry[] = [
  {
    id: 'dist-idp',
    codigo: 'IDP',
    nombre: 'IDP',
    mode: 'extra_charge',
    naturaleza: 'bien',
    expenseCodeLabel: '720166 IDP IMPUESTO DISTRIBUCION PETROLEO',
    taxIndicatorName: 'XB - Iva CR Fiscal Otras Compras Exentas Locales 0%',
    activo: true,
  },
  {
    id: 'dist-intecap',
    codigo: 'INTECAP',
    nombre: 'Intecap',
    mode: 'extra_charge',
    naturaleza: 'servicio',
    expenseCodeLabel: '720129 IMPUESTOS MUNICIPALES',
    taxIndicatorName: 'XO - Iva CR Fiscal Servicios Locales exentos 0%',
    activo: true,
  },
  {
    id: 'dist-propina',
    codigo: 'PROPINA',
    nombre: 'Propina',
    mode: 'extra_charge',
    naturaleza: 'servicio',
    expenseCodeLabel: '720051 ALIMENTACION',
    taxIndicatorName: 'XO - Iva CR Fiscal Servicios Locales exentos 0%',
    activo: true,
  },
  {
    id: 'dist-varios-cecos',
    codigo: 'VARIOS_CECOS',
    nombre: 'Varios cecos',
    mode: 'multi_ceco',
    naturaleza: 'servicio',
    expenseCodeLabel: '',
    taxIndicatorName: '',
    activo: true,
  },
];

export const createDefaultOdooCatalogs = (): ViaticoOdooCatalogs => ({
  defaultJournalName: 'PROV. CAJAS CHICAS',
  defaultExpenseType: 'Gasto',
  docTypes: INITIAL_ODOO_DOC_TYPES.map((d) => ({ ...d })),
  employees: INITIAL_ODOO_EMPLOYEES.map((e) => ({ ...e })),
  expenseCodes: INITIAL_ODOO_EXPENSE_CODES.map((c) => ({ ...c })),
  costCenters: INITIAL_ODOO_COST_CENTERS.map((cc) => ({ ...cc })),
  taxIndicators: INITIAL_ODOO_TAX_INDICATORS.map((t) => ({ ...t })),
  expenseDistributions: INITIAL_ODOO_EXPENSE_DISTRIBUTIONS.map((ed) => ({ ...ed })),
});

export function formatAnalyticDistributionJson(analyticIdOrJson: string): string {
  const raw = String(analyticIdOrJson || '').trim();
  if (!raw) return '';
  if (raw.startsWith('{') && raw.endsWith('}')) return raw;
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits) return `{"${digits}": 100.0}`;
  return raw;
}

export function extractAnalyticIdFromJson(analyticIdOrJson: string): string {
  const raw = String(analyticIdOrJson || '').trim();
  const match = raw.match(/"([^"]+)"/);
  if (match) return match[1];
  return raw.replace(/[^0-9a-zA-Z_-]/g, '');
}

function mergeById<T extends { id: string }>(defaults: T[], incoming?: T[]): T[] {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return defaults.map((d) => ({ ...d }));
  }
  const map = new Map<string, T>();
  defaults.forEach((d) => map.set(d.id, { ...d }));
  incoming.forEach((item) => {
    if (item && item.id) {
      map.set(item.id, { ...item });
    }
  });
  return Array.from(map.values());
}

export function mergeOdooCatalogsWithDefaults(
  raw?: Partial<ViaticoOdooCatalogs> | null
): ViaticoOdooCatalogs {
  const defaults = createDefaultOdooCatalogs();
  if (!raw || typeof raw !== 'object') return defaults;

  return {
    defaultJournalName:
      String(raw.defaultJournalName || '').trim() || defaults.defaultJournalName,
    defaultExpenseType:
      raw.defaultExpenseType === 'Tarjeta' ? 'Tarjeta' : 'Gasto',
    docTypes: mergeById(defaults.docTypes, raw.docTypes),
    employees: mergeById(defaults.employees, raw.employees),
    expenseCodes: mergeById(defaults.expenseCodes, raw.expenseCodes),
    costCenters: mergeById(defaults.costCenters, raw.costCenters),
    taxIndicators: mergeById(defaults.taxIndicators, raw.taxIndicators),
    expenseDistributions: mergeById(
      defaults.expenseDistributions,
      raw.expenseDistributions
    ),
    updatedByEmail: raw.updatedByEmail ? normalizeEmail(raw.updatedByEmail) : undefined,
    updatedByName: raw.updatedByName ? String(raw.updatedByName).trim() : undefined,
    updatedAtIso: raw.updatedAtIso ? String(raw.updatedAtIso) : undefined,
  };
}

export function loadLocalOdooCatalogs(): ViaticoOdooCatalogs {
  try {
    const raw = localStorage.getItem(ODOO_CATALOGS_STORAGE_KEY);
    if (!raw) return createDefaultOdooCatalogs();
    return mergeOdooCatalogsWithDefaults(JSON.parse(raw) as Partial<ViaticoOdooCatalogs>);
  } catch {
    return createDefaultOdooCatalogs();
  }
}

export function saveLocalOdooCatalogs(catalogs: ViaticoOdooCatalogs): void {
  try {
    localStorage.setItem(ODOO_CATALOGS_STORAGE_KEY, JSON.stringify(catalogs));
  } catch {
    // ignore storage errors
  }
}

// ============================================================================
// Smart Resolution & Linkage Helpers (Permisos + Correo + Empleado + C.C. + Docs)
// ============================================================================

export function findMatchingCostCenterEntry(
  costCenterText: string | undefined,
  analyticDistribution: string | undefined,
  costCenters: OdooCostCenterEntry[]
): OdooCostCenterEntry | null {
  const cleanAnalytic = formatAnalyticDistributionJson(analyticDistribution || '');
  if (cleanAnalytic) {
    const byJson = costCenters.find(
      (cc) => formatAnalyticDistributionJson(cc.analyticDistribution) === cleanAnalytic
    );
    if (byJson) return byJson;
  }

  const rawText = String(costCenterText || '').trim();
  if (!rawText) return null;

  const upper = rawText.toUpperCase();
  const exact = costCenters.find(
    (cc) =>
      cc.cuentaAnalitica.toUpperCase() === upper ||
      cc.codigo.toUpperCase() === upper ||
      formatAnalyticDistributionJson(cc.analyticDistribution) === rawText
  );
  if (exact) return exact;

  const firstToken = upper.split(/\s+/)[0] || '';
  if (firstToken.length >= 4) {
    const byCodePrefix = costCenters.find(
      (cc) => cc.codigo.toUpperCase() === firstToken || upper.includes(cc.codigo.toUpperCase())
    );
    if (byCodePrefix) return byCodePrefix;
  }

  const normText = normalizeTextToken(rawText);
  if (!normText) return null;
  return (
    costCenters.find((cc) => normalizeTextToken(cc.cuentaAnalitica).includes(normText)) ||
    null
  );
}

export function findMatchingOdooEmployee(params: {
  email?: string | null;
  nombre?: string | null;
  employees: OdooEmployeeEntry[];
  permissionRecords?: UserPermissionRecord[];
}): OdooEmployeeEntry | null {
  const cleanEmail = normalizeEmail(params.email || '');
  const { employees, permissionRecords = [] } = params;

  // 1) Explicit permission record mapping -> employee
  if (cleanEmail && permissionRecords.length > 0) {
    const perm = permissionRecords.find((p) => normalizeEmail(p.email) === cleanEmail);
    if (perm?.odooEmployeeName) {
      const upperEmp = perm.odooEmployeeName.trim().toUpperCase();
      const matchedFromPerm = employees.find(
        (e) => e.nombreCompleto.trim().toUpperCase() === upperEmp
      );
      if (matchedFromPerm) {
        return {
          ...matchedFromPerm,
          email: matchedFromPerm.email || cleanEmail,
          centroCosto: perm.centroCosto || matchedFromPerm.centroCosto,
          analyticDistribution:
            perm.odooAnalyticDistribution || matchedFromPerm.analyticDistribution,
        };
      }
      return {
        id: `emp-perm-${emailToPermissionDocId(cleanEmail)}`,
        nombreCompleto: upperEmp,
        email: cleanEmail,
        permissionDocId: perm.id,
        centroCosto: perm.centroCosto,
        analyticDistribution: perm.odooAnalyticDistribution,
        activo: true,
      };
    }
  }

  // 2) Direct email match in Odoo Employees DB
  if (cleanEmail) {
    const byEmail = employees.find((e) => normalizeEmail(e.email || '') === cleanEmail);
    if (byEmail) return byEmail;

    // 3) Corporate email `primerNombre.primerApellido` matching against employee full name
    const { firstName, lastName } = parseNameTokensFromEmail(cleanEmail);
    if (firstName && lastName) {
      const byEmailTokens = employees.find((e) => {
        const words = normalizeTextToken(e.nombreCompleto).split(' ').filter(Boolean);
        return words.includes(firstName) && words.includes(lastName);
      });
      if (byEmailTokens) return byEmailTokens;
    }
  }

  // 4) Match by provided name
  const normName = normalizeTextToken(params.nombre || '');
  if (normName) {
    const exactName = employees.find(
      (e) => normalizeTextToken(e.nombreCompleto) === normName
    );
    if (exactName) return exactName;

    const nameWords = normName.split(' ').filter((w) => w.length >= 2);
    if (nameWords.length >= 2) {
      const first = nameWords[0];
      const second = nameWords[1];
      const partial = employees.find((e) => {
        const words = normalizeTextToken(e.nombreCompleto).split(' ');
        return words.includes(first) && words.includes(second);
      });
      if (partial) return partial;
    }
  }

  return null;
}

export function resolveEmployeeAndCostCenterForLiquidation(params: {
  liquidation: Pick<
    ViaticoLiquidation,
    | 'centroCosto'
    | 'consultorId'
    | 'consultorEmail'
    | 'consultorNombre'
    | 'odooEmployeeName'
    | 'odooAnalyticDistribution'
  >;
  consultores: ViaticoConsultor[];
  catalogs: ViaticoOdooCatalogs;
  permissionRecords?: UserPermissionRecord[];
}): {
  employeeName: string;
  costCenterLabel: string;
  analyticDistribution: string;
  matchedEmployee: OdooEmployeeEntry | null;
  matchedCostCenter: OdooCostCenterEntry | null;
} {
  const { liquidation, consultores, catalogs, permissionRecords = [] } = params;
  const cleanEmail = normalizeEmail(liquidation.consultorEmail || '');

  const linkedConsultor =
    consultores.find((c) => c.id === liquidation.consultorId) ||
    consultores.find(
      (c) =>
        normalizeTextToken(c.odooEmployeeName || c.nombreCompleto) ===
        normalizeTextToken(liquidation.odooEmployeeName || liquidation.consultorNombre)
    ) ||
    (cleanEmail
      ? consultores.find((c) => normalizeEmail(c.email) === cleanEmail)
      : undefined);

  const matchedPerm = cleanEmail
    ? permissionRecords.find((p) => normalizeEmail(p.email) === cleanEmail)
    : undefined;

  const preferredEmpName =
    String(liquidation.odooEmployeeName || '').trim() ||
    String(liquidation.consultorNombre || '').trim() ||
    String(linkedConsultor?.odooEmployeeName || '').trim();

  const matchedEmployee = findMatchingOdooEmployee({
    email: preferredEmpName ? linkedConsultor?.email : cleanEmail || linkedConsultor?.email,
    nombre: preferredEmpName || matchedPerm?.odooEmployeeName,
    employees: catalogs.employees,
    permissionRecords,
  });

  const employeeName = (
    liquidation.odooEmployeeName ||
    matchedEmployee?.nombreCompleto ||
    linkedConsultor?.odooEmployeeName ||
    liquidation.consultorNombre ||
    matchedPerm?.odooEmployeeName ||
    'EMPLEADO'
  )
    .trim()
    .toUpperCase();

  const rawCostCenter =
    String(liquidation.centroCosto || '').trim() ||
    String(matchedEmployee?.centroCosto || '').trim() ||
    String(linkedConsultor?.centroCosto || '').trim() ||
    String(matchedPerm?.centroCosto || '').trim();

  const rawAnalytic =
    String(liquidation.odooAnalyticDistribution || '').trim() ||
    String(matchedEmployee?.analyticDistribution || '').trim() ||
    String(linkedConsultor?.odooAnalyticDistribution || '').trim() ||
    String(matchedPerm?.odooAnalyticDistribution || '').trim();

  const matchedCostCenter = findMatchingCostCenterEntry(
    rawCostCenter,
    rawAnalytic,
    catalogs.costCenters
  );

  const costCenterLabel =
    matchedCostCenter?.cuentaAnalitica || rawCostCenter || '';
  const analyticDistribution =
    formatAnalyticDistributionJson(
      matchedCostCenter?.analyticDistribution || rawAnalytic
    ) || '';

  return {
    employeeName,
    costCenterLabel,
    analyticDistribution,
    matchedEmployee,
    matchedCostCenter,
  };
}

export function resolveOdooDocTypeByHint(
  hintCode: string | undefined,
  catalogs: ViaticoOdooCatalogs
): string | undefined {
  const clean = String(hintCode || '').trim().toUpperCase();
  if (!clean) return undefined;
  const activeDocs = catalogs.docTypes.filter((d) => d.activo !== false);
  const byExact =
    activeDocs.find((d) => d.codigo.toUpperCase() === clean) ||
    activeDocs.find((d) => d.labelOdoo.toUpperCase().startsWith(clean));
  return byExact?.labelOdoo;
}

export function resolveOdooExpenseCodeByHint(
  hintCodeOrLabel: string | undefined,
  catalogs: ViaticoOdooCatalogs
): string | undefined {
  const clean = String(hintCodeOrLabel || '').trim().toUpperCase();
  if (!clean) return undefined;
  const activeCodes = catalogs.expenseCodes.filter((c) => c.activo !== false);
  const digitsMatch = clean.match(/\b(\d{6})\b/);
  const codePart = digitsMatch ? digitsMatch[1] : clean.split(/\s+/)[0];

  const byCode =
    activeCodes.find((c) => c.codigo.toUpperCase() === codePart) ||
    activeCodes.find((c) => c.labelOdoo.toUpperCase() === clean);
  if (byCode) return byCode.labelOdoo;

  const norm = normalizeTextToken(clean);
  if (!norm) return undefined;
  return activeCodes.find((c) => normalizeTextToken(c.nombre).includes(norm))?.labelOdoo;
}

export function resolveOdooTaxIndicatorByHint(
  hintCodeOrName: string | undefined,
  catalogs: ViaticoOdooCatalogs
): string | undefined {
  const clean = String(hintCodeOrName || '').trim().toUpperCase();
  if (!clean) return undefined;
  const activeTaxes = catalogs.taxIndicators.filter((t) => t.activo !== false);
  const codeToken = clean.split(/[\s-]+/)[0];
  const byCode =
    activeTaxes.find((t) => t.codigo.toUpperCase() === codeToken) ||
    activeTaxes.find((t) => t.nombreImpuesto.toUpperCase() === clean);
  return byCode?.nombreImpuesto;
}

export function resolveDistributionTaxIndicator(
  naturaleza: OdooDistributionNature,
  catalogs: ViaticoOdooCatalogs,
  explicitTaxIndicatorName?: string
): string {
  if (explicitTaxIndicatorName && String(explicitTaxIndicatorName).trim()) {
    return String(explicitTaxIndicatorName).trim();
  }
  const targetCode = naturaleza === 'servicio' ? 'XO' : 'XB';
  const fallback =
    targetCode === 'XO'
      ? 'XO - Iva CR Fiscal Servicios Locales exentos 0%'
      : 'XB - Iva CR Fiscal Otras Compras Exentas Locales 0%';
  return (
    catalogs.taxIndicators.find((t) => t.codigo.toUpperCase() === targetCode)
      ?.nombreImpuesto || fallback
  );
}

export function suggestOdooDocTypeForItem(
  item: Pick<
    ViaticoExpenseItem,
    'odooDocType' | 'nit' | 'serieDoc' | 'noDoc' | 'aplicaImpuestos' | 'moneda' | 'proveedor' | 'extractionNotes'
  >,
  catalogs: ViaticoOdooCatalogs
): string {
  if (item.odooDocType && String(item.odooDocType).trim()) {
    return String(item.odooDocType).trim();
  }
  const findLabel = (codigo: string, fallback: string) =>
    catalogs.docTypes.find((d) => d.codigo.toUpperCase() === codigo)?.labelOdoo || fallback;

  const notes = normalizeTextToken(item.extractionNotes || '');
  const prov = normalizeTextToken(item.proveedor || '');

  if (notes.includes('fcap') || (notes.includes('cambiaria') && notes.includes('pequeno'))) {
    return findLabel('FCAP', 'FCAP - Factura Cambiaria de Pequeño Contribuyente');
  }
  if (notes.includes('fpeq') || notes.includes('pequeno contribuyente')) {
    return findLabel('FPEQ', 'FPEQ - Factura Electrónica para Pequeños Contribuyentes');
  }
  if (notes.includes('fcam') || notes.includes('cambiaria')) {
    return findLabel('FCAM', 'FCAM - Factura Cambiaria');
  }
  if (notes.includes('fesp') || notes.includes('especial')) {
    return findLabel('FESP', 'FESP - Factura Especial');
  }
  if (notes.includes('rdon') || notes.includes('donacion')) {
    return findLabel('RDON', 'RDON - Recibo por Donacion');
  }
  if (
    item.moneda !== 'Quetzales' ||
    prov.includes('airbnb') ||
    notes.includes('exterior') ||
    notes.includes('extranjera')
  ) {
    return findLabel('FCE', 'FCE - Factura del exterior');
  }
  if (!item.nit?.trim() && !item.serieDoc?.trim()) {
    return findLabel('RECI', 'RECI - Recibo');
  }
  return findLabel('FACT', 'FACT - Factura Electrónica');
}

const DEFAULT_EXPENSE_CODE_BY_CATEGORY: Record<ViaticoCategory, string> = {
  Alimentación: '720013',
  'Combustible / Lub': '720060',
  'Taxis / Buses': '720024',
  Hospedaje: '720015',
  'Peajes / Parqueo': '720027',
  'Boletos Aéreos': '720012',
  'Atención a Clientes': '720097',
  'Otros Gastos': '720107',
};

export function suggestOdooExpenseCodeForItem(
  item: Pick<ViaticoExpenseItem, 'odooProductId' | 'categoria' | 'descripcionGasto' | 'proveedor' | 'moneda'>,
  config: ViaticoOdooConfig | undefined,
  catalogs: ViaticoOdooCatalogs
): string {
  if (item.odooProductId && String(item.odooProductId).trim()) {
    return String(item.odooProductId).trim();
  }

  const desc = normalizeTextToken(`${item.descripcionGasto || ''} ${item.proveedor || ''}`);
  const findByCode = (code: string) =>
    catalogs.expenseCodes.find((c) => c.codigo === code)?.labelOdoo;

  if (desc.includes('idp') && (desc.includes('combustible') || desc.includes('gasolina'))) {
    const match = findByCode('720060');
    if (match) return match;
  }
  if (desc.includes('timbre') || desc.includes('licencia') || desc.includes('tramite')) {
    const match = findByCode('720107');
    if (match) return match;
  }
  if (desc.includes('parqueo') || desc.includes('estacionamiento')) {
    const match = findByCode('720009');
    if (match) return match;
  }
  if (desc.includes('peaje') || desc.includes('vas') || desc.includes('autopista')) {
    const match = findByCode('720027');
    if (match) return match;
  }
  if (desc.includes('papeleria') || desc.includes('suministro') || desc.includes('oficina')) {
    const match = findByCode('720028') || findByCode('720055');
    if (match) return match;
  }
  if (desc.includes('lavander')) {
    const match = findByCode('720019');
    if (match) return match;
  }
  if (desc.includes('correo') || desc.includes('encomienda') || desc.includes('mensajeria') || desc.includes('cargo expreso') || desc.includes('dhl')) {
    const match = findByCode('720050') || findByCode('720017');
    if (match) return match;
  }
  if (desc.includes('farmacia') || desc.includes('medicina') || desc.includes('medicamento') || desc.includes('vacuna')) {
    const match = findByCode('720042');
    if (match) return match;
  }
  if (desc.includes('mantenimiento') || desc.includes('reparacion') || desc.includes('taller') || desc.includes('llanta') || desc.includes('vehiculo')) {
    const match = findByCode('720003');
    if (match) return match;
  }
  if (desc.includes('honorario') || desc.includes('consultoria') || desc.includes('servicio profesional')) {
    const match = findByCode('720135');
    if (match) return match;
  }
  if (desc.includes('telefonia') || desc.includes('recarga') || desc.includes('claro') || desc.includes('tigo')) {
    const match = findByCode('720132');
    if (match) return match;
  }
  if (desc.includes('uber') || desc.includes('taxi') || desc.includes('bus') || desc.includes('didi') || desc.includes('indrive')) {
    const match = findByCode('720024');
    if (match) return match;
  }
  if (item.categoria === 'Boletos Aéreos' && item.moneda === 'Quetzales' && desc.includes('nacional')) {
    const match = findByCode('720014');
    if (match) return match;
  }

  const targetCode = DEFAULT_EXPENSE_CODE_BY_CATEGORY[item.categoria] || '720107';
  const fromCatalogByCode = catalogs.expenseCodes.find((c) => c.codigo === targetCode);
  if (fromCatalogByCode) return fromCatalogByCode.labelOdoo;

  const fromCatalogByCat = catalogs.expenseCodes.find(
    (c) => c.activo !== false && c.categoriaVinculada === item.categoria
  );
  if (fromCatalogByCat) return fromCatalogByCat.labelOdoo;

  const catAcc = config?.cuentasPorCategoria?.[item.categoria];
  if (catAcc?.accountCode) {
    return `${catAcc.accountCode} ${catAcc.accountName}`.trim();
  }
  return '720107 LICENCIAS-TRAMITES';
}

export function isLikelyServiceExpense(
  item: Pick<ViaticoExpenseItem, 'categoria' | 'descripcionGasto' | 'proveedor'>
): boolean {
  if (
    item.categoria === 'Taxis / Buses' ||
    item.categoria === 'Hospedaje' ||
    item.categoria === 'Boletos Aéreos'
  ) {
    return true;
  }
  const text = normalizeTextToken(`${item.descripcionGasto || ''} ${item.proveedor || ''}`);
  if (
    text.includes('servicio') ||
    text.includes('mantenimiento') ||
    text.includes('reparacion') ||
    text.includes('honorario') ||
    text.includes('envio') ||
    text.includes('encomienda') ||
    text.includes('parqueo') ||
    text.includes('peaje') ||
    text.includes('lavander') ||
    text.includes('telefonia') ||
    text.includes('alquiler') ||
    text.includes('arrendamiento')
  ) {
    return true;
  }
  return false;
}

export function suggestOdooTaxIndicatorForItem(
  item: Pick<
    ViaticoExpenseItem,
    'odooTaxIndicator' | 'aplicaImpuestos' | 'categoria' | 'moneda' | 'extractionNotes' | 'descripcionGasto' | 'proveedor'
  >,
  docTypeLabel: string,
  catalogs: ViaticoOdooCatalogs
): string {
  if (item.odooTaxIndicator && String(item.odooTaxIndicator).trim()) {
    return String(item.odooTaxIndicator).trim();
  }
  const byCode = (code: string, fallback: string) =>
    catalogs.taxIndicators.find((t) => t.codigo.toUpperCase() === code)?.nombreImpuesto || fallback;

  const upperDoc = String(docTypeLabel || '').toUpperCase();
  if (upperDoc.startsWith('FPEQ') || upperDoc.startsWith('FCAP')) {
    return byCode('XF', 'XF - Iva Cr Fiscal Compra Pequeños contrib. 0%');
  }
  if (upperDoc.startsWith('FCE') || item.moneda !== 'Quetzales') {
    return byCode('XE', 'XE - Iva CR Fiscal Servicios Exterior Exentos 0%');
  }

  const serviceLike = isLikelyServiceExpense({
    categoria: item.categoria,
    descripcionGasto: item.descripcionGasto || '',
    proveedor: item.proveedor || '',
  });

  if (!item.aplicaImpuestos) {
    return serviceLike
      ? byCode('XO', 'XO - Iva CR Fiscal Servicios Locales exentos 0%')
      : byCode('XB', 'XB - Iva CR Fiscal Otras Compras Exentas Locales 0%');
  }

  if (serviceLike) {
    return byCode('XC', 'XC - Iva CR Fiscal Servicios Locales 12%');
  }
  return byCode('XA', 'XA - Iva CR Fiscal Compras Gravadas Locales 12%');
}

export function resolveSplitCostCentersList(
  item: Pick<ViaticoExpenseItem, 'odooSplitCostCentersText' | 'odooSplitCostCenters'>,
  costCenters: OdooCostCenterEntry[]
): OdooCostCenterEntry[] {
  const tokens: string[] = [];
  if (Array.isArray(item.odooSplitCostCenters) && item.odooSplitCostCenters.length > 0) {
    item.odooSplitCostCenters.forEach((t) => {
      const s = String(t || '').trim();
      if (s) tokens.push(s);
    });
  } else if (item.odooSplitCostCentersText) {
    String(item.odooSplitCostCentersText)
      .split(/[,;\n]+/)
      .forEach((t) => {
        const s = t.trim();
        if (s) tokens.push(s);
      });
  }

  return tokens.map((token) => {
    const matched = findMatchingCostCenterEntry(token, token, costCenters);
    if (matched) return matched;
    const json = formatAnalyticDistributionJson(token);
    return {
      id: `cc-inline-${token}`,
      codigo: token.toUpperCase(),
      cuentaAnalitica: token.toUpperCase(),
      odooAnalyticId: extractAnalyticIdFromJson(json) || token,
      analyticDistribution: json,
      activo: true,
    };
  });
}

export function buildDefaultPaymentReference(liq: Pick<ViaticoLiquidation, 'semana' | 'lineaLiquidacion' | 'createdAtIso'>): string {
  const weekPart = liq.semana ? `S-${liq.semana}` : 'S/N';
  const desc = String(liq.lineaLiquidacion || '')
    .trim()
    .toUpperCase()
    .slice(0, 36);
  return `LIQ. GTS ${weekPart} ${desc}`.replace(/\s+/g, ' ').trim();
}

export function resolveOperatingUserPermissionsStamp(
  permissions?: EffectivePermissions | null,
  fallbackEmail?: string,
  fallbackName?: string
): { email: string; name: string; atIso: string } {
  return {
    email: normalizeEmail(permissions?.email || fallbackEmail || '') || 'sistema@premexcorp.com',
    name: String(permissions?.displayName || fallbackName || 'Usuario Premex').trim().slice(0, 120),
    atIso: new Date().toISOString(),
  };
}

export function resolveExpenseTypeForItem(
  item: Pick<ViaticoExpenseItem, 'odooExpenseType'>,
  catalogs: ViaticoOdooCatalogs
): OdooExpenseType {
  if (item.odooExpenseType === 'Tarjeta' || item.odooExpenseType === 'Gasto') {
    return item.odooExpenseType;
  }
  return catalogs.defaultExpenseType || 'Gasto';
}
