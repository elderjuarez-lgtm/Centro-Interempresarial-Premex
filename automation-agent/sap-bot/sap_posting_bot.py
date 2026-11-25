"""
Bot Independiente de Contabilización SAP (SAP GUI Scripting - FB60)
==================================================================
Consume el archivo `paquete_sap_bot.json` exportado desde el módulo
Automatización Clara · WM · SAP de la Suite Premex.

Requisitos (Windows con SAP Logon abierto):
  pip install pywin32

Uso:
  python sap_posting_bot.py --input paquete_sap_bot.json --dry-run
  python sap_posting_bot.py --input paquete_sap_bot.json
"""

import argparse
import json
from datetime import datetime
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Bot SAP FB60 para gastos Clara validados en Work Manager")
    parser.add_argument("--input", required=True, help="Ruta al archivo paquete_sap_bot.json")
    parser.add_argument("--output", default="sap_results.json", help="Archivo de resultados para re-importar a Premex")
    parser.add_argument("--dry-run", action="store_true", help="Valida campos sin contabilizar en SAP GUI")
    return parser.parse_args()


def connect_sap_session():
    import win32com.client  # type: ignore

    sap_gui = win32com.client.GetObject("SAPGUI")
    application = sap_gui.GetScriptingEngine
    connection = application.Children(0)
    return connection.Children(0)


def post_fb60_item(session, item: dict) -> str:
    """Ejecuta transacción FB60 para una factura/gasto validado."""
    sociedad = str(item.get("sociedadSap") or "1000")
    acreedor = str(item.get("codigoAcreedorSap") or "")
    fecha_doc = str(item.get("fechaFactura") or item.get("fechaClara") or "").replace("-", ".")
    referencia = str(item.get("numeroFactura") or item.get("claraTxId") or "")[:16]
    importe = str(item.get("total") or 0)
    moneda = str(item.get("moneda") or "COP")
    cuenta_mayor = str(item.get("cuentaMayor") or "")
    centro_costo = str(item.get("centroCostoSap") or "")
    indicador_imp = str(item.get("indicadorImpuesto") or "V19")
    texto = str(item.get("textoPosicion") or "")[:50]

    # Iniciar transacción FB60
    session.findById("wnd[0]/tbar[0]/okcd").text = "/nFB60"
    session.findById("wnd[0]").sendVKey(0)

    # Cambiar sociedad si aparece modal BKPF-BUKRS o menú
    session.findById("wnd[0]/usr/tabsTS/tabpMAIN/ssubPAGE:SAPLFDCB:0010/ctxtINVFO-ACCNT").text = acreedor
    session.findById("wnd[0]/usr/tabsTS/tabpMAIN/ssubPAGE:SAPLFDCB:0010/ctxtINVFO-BLDAT").text = fecha_doc
    session.findById("wnd[0]/usr/tabsTS/tabpMAIN/ssubPAGE:SAPLFDCB:0010/txtINVFO-XBLNR").text = referencia
    session.findById("wnd[0]/usr/tabsTS/tabpMAIN/ssubPAGE:SAPLFDCB:0010/txtINVFO-WRBTR").text = importe
    session.findById("wnd[0]/usr/tabsTS/tabpMAIN/ssubPAGE:SAPLFDCB:0010/ctxtINVFO-WAERS").text = moneda
    session.findById("wnd[0]/usr/tabsTS/tabpMAIN/ssubPAGE:SAPLFDCB:0010/ctxtINVFO-MWSKZ").text = indicador_imp
    session.findById("wnd[0]/usr/tabsTS/tabpMAIN/ssubPAGE:SAPLFDCB:0010/txtINVFO-SGTXT").text = f"{sociedad} {texto}"[:50]

    # Posición de gasto (fila 0)
    grid = session.findById("wnd[0]/usr/subITEMS:SAPLFSKB:0100/tblSAPLFSKBTABLE")
    grid.getCell(0, 1).text = cuenta_mayor
    grid.getCell(0, 4).text = importe
    grid.getCell(0, 8).text = texto
    grid.getCell(0, 14).text = centro_costo

    # Contabilizar (Ctrl+S / tbar[0]/btn[11])
    session.findById("wnd[0]/tbar[0]/btn[11]").press()
    status_bar = session.findById("wnd[0]/sbar").text
    return str(status_bar or "Contabilizado sin mensaje de barra")


def main():
    args = parse_args()
    package_path = Path(args.input)
    payload = json.loads(package_path.read_text(encoding="utf-8"))
    items = payload.get("items", [])

    session = None if args.dry_run else connect_sap_session()
    results = []

    for item in items:
        tx_id = item.get("txId")
        missing = [
            field
            for field in ("sociedadSap", "codigoAcreedorSap", "cuentaMayor", "centroCostoSap", "total")
            if not item.get(field)
        ]
        if missing:
            results.append({
                "txId": tx_id,
                "status": "error",
                "sapDocContable": "",
                "message": f"Faltan campos obligatorios SAP: {', '.join(missing)}",
            })
            continue

        if args.dry_run:
            results.append({
                "txId": tx_id,
                "status": "simulado_ok",
                "sapDocContable": f"SIM-{str(tx_id)[-6:]}",
                "message": f"Validación OK para FB60 ({item.get('numeroFactura') or tx_id})",
            })
            continue

        try:
            status_msg = post_fb60_item(session, item)
            results.append({
                "txId": tx_id,
                "status": "contabilizado",
                "sapDocContable": status_msg,
                "message": status_msg,
            })
        except Exception as exc:
            results.append({
                "txId": tx_id,
                "status": "error",
                "sapDocContable": "",
                "message": str(exc),
            })

    out_payload = {
        "processedAtIso": datetime.utcnow().isoformat() + "Z",
        "batchId": payload.get("batchId"),
        "dryRun": bool(args.dry_run),
        "results": results,
    }
    Path(args.output).write_text(json.dumps(out_payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Proceso finalizado: {len(results)} registros escritos en {args.output}")


if __name__ == "__main__":
    main()
