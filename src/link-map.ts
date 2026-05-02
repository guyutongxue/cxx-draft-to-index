// THIS FILE IS TOTALLY AI SLOPS AND I CANNOT HELP WITH THAT

import type { SymbolEntry, NamespaceInfo } from "./share/types";
import { computeSymbolId } from "./share/symbol_id";
import { join } from "node:path";
import type { Index as CppRefIndex } from "@gytx/cppreference-index";

interface SubpageEntry {
  link: string;
  title: string;
}

interface SubpageResult {
  parent: string;
  subpages: SubpageEntry[];
}

interface ParsedSubpage {
  link: string;
  localNames: string[];
}

const CPPREF_GENERATED_URL =
  "https://cdn.jsdelivr.net/npm/@gytx/cppreference-index@latest/dist/generated.json";
const CPPREF_SUBPAGES_URL =
  "https://cdn.jsdelivr.net/npm/@gytx/cppreference-index@latest/dist/subpages.json";

const STD_INDEX_PATH = join(import.meta.dir, "../dist/std-index.json");
const OUTPUT_PATH = join(import.meta.dir, "../dist/link-map.json");

function namespaceToFQN(ns: NamespaceInfo[]): string {
  return ns.map((n) => n.name ?? "(anon)").join("::");
}

function stripTemplateArgs(name: string): string {
  let result = "";
  let depth = 0;
  for (const ch of name) {
    if (ch === "<") depth++;
    else if (ch === ">") depth--;
    else if (depth === 0) result += ch;
  }
  return result;
}

function parseSubpageTitle(title: string): string[] {
  if (/^deduction guides/i.test(title)) return [];

  if (/^operator/.test(title)) {
    const matches = title.match(/operator[^,() ]+/g);
    return matches ?? [];
  }

  if (title.includes("::")) {
    const parts = title.split(/, /g);
    const names: string[] = [];
    for (const part of parts) {
      const lastColon = part.lastIndexOf("::");
      if (lastColon === -1) continue;
      const local = part.substring(lastColon + 2);
      const stripped = stripTemplateArgs(local);
      if (stripped) names.push(stripped);
    }
    return names;
  }

  return [];
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  console.log(`Fetching ${label}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${label}: ${response.status} ${response.statusText}`,
    );
  }
  const json = await response.json();
  console.log(`  -> OK (${label})`);
  return json as T;
}

function getMembers(symbol: SymbolEntry): SymbolEntry[] {
  if ("members" in symbol && symbol.members) {
    return symbol.members;
  }
  return [];
}

async function main() {
  const [generated, subpages] = await Promise.all([
    fetchJson<CppRefIndex[]>(CPPREF_GENERATED_URL, "generated.json"),
    fetchJson<SubpageResult[]>(CPPREF_SUBPAGES_URL, "subpages.json"),
  ]);

  const topLevelMap = new Map<string, string>();
  for (const entry of generated) {
    if (entry.type === "symbol") {
      topLevelMap.set(entry.name, entry.link);
    }
  }
  console.log(`  topLevelMap: ${topLevelMap.size} entries`);

  const parsedSubpages: ParsedSubpage[] = [];
  for (const sp of subpages) {
    const parsed: ParsedSubpage[] = sp.subpages.map((s) => ({
      link: s.link,
      localNames: parseSubpageTitle(s.title),
    }));
    parsedSubpages.push(...parsed);
  }
  console.log(`  subpages: ${parsedSubpages.length} entries`);

  const { default: stdIndex } = await import("#std-index");
  const mappings = new Map<string, string>();
  let totalSymbols = 0;
  let mapped = 0;

  function processMember(
    member: SymbolEntry,
    parentFQN: string,
  ): void {
    const memberFQN = `${parentFQN}::${member.name}`;
    const memberId = computeSymbolId(member);
    totalSymbols++;

    let memberLink: string | null = null;

    for (const sp of parsedSubpages) {
      if (sp.localNames.includes(member.name)) {
        memberLink = sp.link;
        break;
      }
    }

    if (memberLink) {
      mappings.set(memberId, memberLink);
      mapped++;
    }

    const subMembers = getMembers(member);
    for (const nested of subMembers) {
      processMember(nested, memberFQN);
    }
  }

  function enrich(symbol: SymbolEntry, parentFQN: string | null): void {
    totalSymbols++;

    const fqn = parentFQN
      ? `${parentFQN}::${symbol.name}`
      : `${namespaceToFQN(symbol.namespace)}::${symbol.name}`;

    const id = computeSymbolId(symbol);

    let link: string | null = topLevelMap.get(fqn) ?? null;

    if (link) {
      mappings.set(id, link);
      mapped++;
    }

    const members = getMembers(symbol);

    for (const member of members) {
      processMember(member, fqn);
    }
  }

  for (const header of stdIndex.headers) {
    for (const symbol of header.symbols) {
      enrich(symbol, null);
    }
  }

  const output = {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    cppreference_source: CPPREF_GENERATED_URL,
    subpages_source: CPPREF_SUBPAGES_URL,
    stats: {
      total_symbols: totalSymbols,
      mapped,
      unmapped: totalSymbols - mapped,
    },
    mappings: Object.fromEntries(mappings),
  };

  await Bun.write(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(
    `\nDone! ${mapped}/${totalSymbols} symbols mapped (${((mapped / totalSymbols) * 100).toFixed(1)}%)`,
  );
  console.log(`Output written to ${OUTPUT_PATH}`);
}

if (import.meta.main) {
  await main();
}
