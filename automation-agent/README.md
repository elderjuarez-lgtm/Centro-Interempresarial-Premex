# Automatización Premex: Clara → Work Manager (:8037) → SAP

Esta carpeta contiene los componentes locales opcionales que complementan la aplicación web Premex Suite cuando necesitas automatizar los portales protegidos por **2FA/Captcha (Clara)**, **red interna/VPN puerto `:8037` (Work Manager)** o **SAP GUI / RFC**.

## 1. Agente Puente Local (`clara-wm-agent`)

```bash
cd automation-agent/clara-wm-agent
npm install
npm run install-browsers
cp .env.example .env
# Edita .env con tu AGENT_TOKEN y ALLOWED_ORIGINS
npm start
```

Luego en la aplicación web ve a **Automatización Clara · WM · SAP → Conectores y RPA**, ingresa la URL `http://127.0.0.1:4780` y el `AGENT_TOKEN` (solo en memoria de sesión), haz clic en **Probar Agente** y abre sesiones en Chromium para iniciar sesión una vez con tu 2FA.

## 2. Bot Independiente SAP (`sap-bot`)

1. Desde la pestaña **Despacho SAP** en la app web descarga `paquete_sap_bot.json` (o envíalo al Agente Local).
2. Simula sin contabilizar:
   - Python SAP GUI: `python sap_posting_bot.py --input paquete_sap_bot.json --dry-run`
   - Node SAP OData: `node sap_odata_poster.mjs paquete_sap_bot.json sap_results.json --dry-run`
3. Ejecuta en firme y luego re-importa `sap_results.json` en la app web para marcar los `BELNR` contabilizados.
