/**
 * Bot Independiente SAP OData / API_JOURNALENTRYPOSTING (Node.js)
 * -----------------------------------------------------------------
 * Alternativa headless sin SAP GUI para SAP S/4HANA o ECC vía Gateway/BAPI REST.
 * Consume el archivo `paquete_sap_bot.json` descargado desde Premex Suite.
 *
 * Variables de entorno requeridas:
 *   SAP_ODATA_URL=https://tu-sap.interno/sap/opu/odata/sap/FAC_FINANCIALS_POSTING_SRV/JournalEntrySet
 *   SAP_USER=USUARIO_BOT_SAP
 *   SAP_PASSWORD=***
 *   SAP_CLIENT=300
 *
 * Uso:
 *   node sap_odata_poster.mjs ./paquete_sap_bot.json ./sap_results.json --dry-run
 */

import fs from 'node:fs/promises';

const inputFile = process.argv[2] || './paquete_sap_bot.json';
const outputFile = process.argv[3] || './sap_results.json';
const dryRun = process.argv.includes('--dry-run');

const SAP_ODATA_URL = String(process.env.SAP_ODATA_URL || '').trim();
const SAP_USER = String(process.env.SAP_USER || '').trim();
const SAP_PASSWORD = String(process.env.SAP_PASSWORD || '').trim();
const SAP_CLIENT = String(process.env.SAP_CLIENT || '100').trim();

async function fetchCsrfToken(authHeader) {
  const res = await fetch(`${SAP_ODATA_URL}?sap-client=${encodeURIComponent(SAP_CLIENT)}`, {
    method: 'HEAD',
    headers: {
      Authorization: authHeader,
      'x-csrf-token': 'Fetch',
    },
  });
  return {
    csrfToken: res.headers.get('x-csrf-token') || '',
    cookies: res.headers.get('set-cookie') || '',
  };
}

async function main() {
  const raw = await fs.readFile(inputFile, 'utf8');
  const pkg = JSON.parse(raw);
  const items = Array.isArray(pkg.items) ? pkg.items : [];
  const results = [];

  let authHeader = '';
  let csrfToken = '';
  let cookies = '';

  if (!dryRun) {
    if (!SAP_ODATA_URL || !SAP_USER || !SAP_PASSWORD) {
      throw new Error('Configura SAP_ODATA_URL, SAP_USER y SAP_PASSWORD en el entorno local.');
    }
    authHeader = `Basic ${Buffer.from(`${SAP_USER}:${SAP_PASSWORD}`).toString('base64')}`;
    const tokenRes = await fetchCsrfToken(authHeader);
    csrfToken = tokenRes.csrfToken;
    cookies = tokenRes.cookies;
  }

  for (const item of items) {
    if (dryRun) {
      results.push({
        txId: item.txId,
        status: 'simulado_ok',
        sapDocContable: `ODATA-SIM-${String(item.txId).slice(-5)}`,
        message: `Payload OData válido para ${item.numeroFactura || item.txId}`,
      });
      continue;
    }

    try {
      const payload = {
        CompanyCode: item.sociedadSap,
        DocumentDate: item.fechaFactura || item.fechaClara,
        PostingDate: item.fechaFactura || item.fechaClara,
        DocumentType: item.claseDoc || 'KR',
        ReferenceDocument: String(item.numeroFactura || item.claraTxId || '').slice(0, 16),
        Currency: item.moneda,
        VendorCode: item.codigoAcreedorSap,
        TaxCode: item.indicadorImpuesto,
        GLAccount: item.cuentaMayor,
        CostCenter: item.centroCostoSap,
        Amount: String(item.total),
        ItemText: String(item.textoPosicion || '').slice(0, 50),
      };

      const res = await fetch(`${SAP_ODATA_URL}?sap-client=${encodeURIComponent(SAP_CLIENT)}`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-csrf-token': csrfToken,
          ...(cookies ? { Cookie: cookies } : {}),
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        results.push({
          txId: item.txId,
          status: 'error',
          sapDocContable: '',
          message: body?.error?.message?.value || `HTTP ${res.status}`,
        });
      } else {
        const docNumber = body?.d?.AccountingDocument || body?.d?.DocumentNumber || 'OK';
        results.push({
          txId: item.txId,
          status: 'contabilizado',
          sapDocContable: String(docNumber),
          message: `Contabilizado vía OData: ${docNumber}`,
        });
      }
    } catch (err) {
      results.push({
        txId: item.txId,
        status: 'error',
        sapDocContable: '',
        message: err?.message || 'Error de red OData',
      });
    }
  }

  await fs.writeFile(
    outputFile,
    JSON.stringify({ processedAtIso: new Date().toISOString(), batchId: pkg.batchId, results }, null, 2),
    'utf8'
  );
  console.log(`Resultados SAP escritos en ${outputFile} (${results.length} registros).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
