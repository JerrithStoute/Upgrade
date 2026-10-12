import { readSoapCall, soapResponse } from "@/lib/qb/qbxml";
import { qbAuthenticate, qbClose, qbConnectionError, qbLastError, qbNextRequest, qbTakeResponse } from "@/lib/qb/sync";

/**
 * QuickBooks Web Connector (src/lib/qb/sync.ts). The Web Connector on the QuickBooks computer
 * calls here — no browser, no session: it signs in with the username and password from
 * Settings → QuickBooks (authenticate), and every later call carries the ticket it got.
 */

const SERVER_VERSION = "1.0";

const xml = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 20_000_000) return xml("", 413);
  let call;
  try {
    call = readSoapCall(body);
  } catch {
    call = null;
  }
  if (!call) return xml("", 400);
  const a = call.args;
  switch (call.method) {
    case "serverVersion":
      return xml(soapResponse("serverVersion", SERVER_VERSION));
    case "clientVersion":
      return xml(soapResponse("clientVersion", "")); // any Web Connector version is fine
    case "authenticate":
      return xml(soapResponse("authenticate", await qbAuthenticate(a.strUserName ?? "", a.strPassword ?? "")));
    case "sendRequestXML":
      return xml(soapResponse("sendRequestXML", await qbNextRequest(a.ticket ?? "", a.strCompanyFileName ?? "")));
    case "receiveResponseXML":
      return xml(soapResponse("receiveResponseXML", await qbTakeResponse(a.ticket ?? "", a.response ?? "", a.hresult ?? "", a.message ?? "")));
    case "connectionError":
      return xml(soapResponse("connectionError", await qbConnectionError(a.ticket ?? "", a.hresult ?? "", a.message ?? "")));
    case "getLastError":
      return xml(soapResponse("getLastError", await qbLastError(a.ticket ?? "")));
    case "closeConnection":
      return xml(soapResponse("closeConnection", await qbClose(a.ticket ?? "")));
    default:
      return xml("", 400);
  }
}

/** The .qwc file's support address: a plain page saying what this is. */
export function GET() {
  return new Response("The Builder Station — QuickBooks Web Connector. Set it up in The Builder Station: Settings → QuickBooks.", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
