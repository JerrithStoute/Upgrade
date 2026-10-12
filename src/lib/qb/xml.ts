/**
 * Just enough XML for QuickBooks: the Web Connector's SOAP calls and qbXML replies are plain,
 * well-formed XML — elements, attributes and text. No outside library to keep up to date.
 */

export type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function unescapeXml(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function escapeXml(s: string | number) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Element names without their namespace prefix (soap:Body → Body). */
const local = (n: string) => n.slice(n.indexOf(":") + 1);

/** The document's root element. Throws on anything that isn't well-formed. */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[6] !== undefined) top.text += unescapeXml(m[6]);
    else if (m[3]) {
      const name = local(m[3]);
      if (m[2]) {
        if (top.name !== name || stack.length < 2) throw new Error(`Unexpected </${m[3]}>`);
        stack.pop();
        continue;
      }
      const attrs: Record<string, string> = {};
      for (const a of m[4].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[local(a[1])] = unescapeXml(a[2] ?? a[3] ?? "");
      const node: XmlNode = { name, attrs, children: [], text: "" };
      top.children.push(node);
      if (!m[5]) stack.push(node);
    }
  }
  if (stack.length !== 1) throw new Error(`<${stack[stack.length - 1].name}> isn't closed`);
  const el = root.children[0];
  if (!el) throw new Error("No XML");
  return el;
}

/** The first child named `name` (path "A/B/C" goes down). */
export function child(node: XmlNode | undefined, path: string): XmlNode | undefined {
  let n = node;
  for (const p of path.split("/")) n = n?.children.find((c) => c.name === p);
  return n;
}

/** Every child named `name`. */
export const children = (node: XmlNode | undefined, name: string) => node?.children.filter((c) => c.name === name) ?? [];

/** The trimmed text at `path`, or undefined when it isn't there. */
export const text = (node: XmlNode | undefined, path: string) => child(node, path)?.text.trim();
