import { Fragment, type JSX, type ReactNode } from "react";
import { markdownLink } from "./link-policy";

type Block =
  | { type: "paragraph"; lines: string[] }
  | { type: "heading"; level: number; text: string }
  | { type: "code"; language: string; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "table"; rows: string[][] };

function inline(text: string): ReactNode[] {
  const pattern = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index || 0;
    if (index > cursor) nodes.push(text.slice(cursor, index));
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(<code key={`${index}-code`}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={`${index}-strong`}>{token.slice(2, -2)}</strong>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const policy = markdownLink(link?.[2] || "");
      const href = policy.href;
      nodes.push(href ? <a key={`${index}-link`} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{link?.[1]}</a>
        : policy.local ? <code key={`${index}-path`} title={link?.[1]}>{link?.[2].replace(/^<|>$/g, "")}</code> : token);
    }
    cursor = index + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function cells(line: string) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function blocks(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const fence = line.match(/^```([^\s]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      output.push({ type: "code", language: fence[1] || "text", text: code.join("\n") });
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      output.push({ type: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
      const rows = [cells(line)];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(cells(lines[index++]));
      output.push({ type: "table", rows });
      continue;
    }
    const list = line.match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/);
    if (list) {
      const ordered = Boolean(list[2]);
      const items: string[] = [];
      while (index < lines.length) {
        const next = lines[index].match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/);
        if (!next || Boolean(next[2]) !== ordered) break;
        items.push(next[3]);
        index += 1;
      }
      output.push({ type: "list", ordered, items });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      output.push({ type: "quote", lines: quote });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      if (paragraph.length > 0 && (/^```/.test(lines[index]) || /^(#{1,4})\s+/.test(lines[index]) || /^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[index]))) break;
      paragraph.push(lines[index++]);
    }
    output.push({ type: "paragraph", lines: paragraph });
  }
  return output;
}

export function CodexMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="codex-markdown">
      {blocks(markdown).map((block, index) => {
        if (block.type === "heading") {
          const Tag = `h${Math.min(block.level + 1, 5)}` as keyof JSX.IntrinsicElements;
          return <Tag key={index}>{inline(block.text)}</Tag>;
        }
        if (block.type === "code") return <pre key={index} data-language={block.language}><code>{block.text}</code></pre>;
        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return <Tag key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</Tag>;
        }
        if (block.type === "quote") return <blockquote key={index}>{block.lines.map((line, lineIndex) => <Fragment key={lineIndex}>{inline(line)}{lineIndex < block.lines.length - 1 ? <br /> : null}</Fragment>)}</blockquote>;
        if (block.type === "table") {
          return (
            <div className="codex-table-scroll" key={index}>
              <table>
                <thead><tr>{block.rows[0].map((cell, cellIndex) => <th key={cellIndex}>{inline(cell)}</th>)}</tr></thead>
                <tbody>{block.rows.slice(1).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{inline(cell)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
        return <p key={index}>{block.lines.map((line, lineIndex) => <Fragment key={lineIndex}>{inline(line)}{lineIndex < block.lines.length - 1 ? <br /> : null}</Fragment>)}</p>;
      })}
    </div>
  );
}
