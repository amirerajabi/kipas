// A small XML parser for KeePass's database XML: elements, attributes, text, the five named entities, numeric
// character references, CDATA, comments and the declaration. No DTDs (KeePass never writes one, and refusing them
// keeps entity tricks out). It runs the same in Electron, a browser and Node tests, which DOMParser would not.

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const NAMED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[e] ?? m;
  });
}

export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  let i = 0;
  const n = xml.length;
  while (i < n) {
    const lt = xml.indexOf('<', i);
    const textEnd = lt < 0 ? n : lt;
    if (textEnd > i) stack[stack.length - 1].text += decodeEntities(xml.slice(i, textEnd));
    if (lt < 0) break;
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      if (end < 0) throw new Error('XML: unterminated comment');
      i = end + 3;
    } else if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      if (end < 0) throw new Error('XML: unterminated CDATA');
      stack[stack.length - 1].text += xml.slice(lt + 9, end);
      i = end + 3;
    } else if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      if (end < 0) throw new Error('XML: unterminated declaration');
      i = end + 2;
    } else if (xml.startsWith('<!', lt)) {
      throw new Error('XML: document type declarations are not supported');
    } else if (xml[lt + 1] === '/') {
      const end = xml.indexOf('>', lt);
      if (end < 0) throw new Error('XML: unterminated end tag');
      const name = xml.slice(lt + 2, end).trim();
      const open = stack.pop();
      if (!open || open.name !== name || stack.length === 0) throw new Error(`XML: unexpected </${name}>`);
      i = end + 1;
    } else {
      // Start tag: find its end, skipping '>' inside quoted attribute values.
      let j = lt + 1;
      let quote = '';
      for (; j < n; j++) {
        const c = xml[j];
        if (quote) {
          if (c === quote) quote = '';
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
      }
      if (j >= n) throw new Error('XML: unterminated start tag');
      let body = xml.slice(lt + 1, j);
      const selfClosing = body.endsWith('/');
      if (selfClosing) body = body.slice(0, -1);
      const m = /^([^\s/>]+)/.exec(body);
      if (!m) throw new Error('XML: bad start tag');
      const node: XmlNode = { name: m[1], attrs: {}, children: [], text: '' };
      const attrRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let a: RegExpExecArray | null;
      while ((a = attrRe.exec(body.slice(m[1].length)))) node.attrs[a[1]] = decodeEntities(a[3] ?? a[4] ?? '');
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
      i = j + 1;
    }
  }
  if (stack.length !== 1) throw new Error(`XML: <${stack[stack.length - 1].name}> is not closed`);
  return root;
}

export function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((c) => c.name === name);
}

export function children(node: XmlNode | undefined, name: string): XmlNode[] {
  return node ? node.children.filter((c) => c.name === name) : [];
}

export function textOf(node: XmlNode | undefined, name: string): string {
  return child(node, name)?.text ?? '';
}
