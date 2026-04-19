export interface HeaderSynopsis {
  header: string;
  code: string;
  sourceFile: string;
}

const REPO_OWNER = "cplusplus";
const REPO_NAME = "draft";
const BRANCH = "main";
const SOURCE_PATH = "source";
const BASE_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${SOURCE_PATH}/`;

async function fetchFileList(): Promise<string[]> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${SOURCE_PATH}?ref=${BRANCH}`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "cxx-draft-to-index" },
  });
  if (!resp.ok) throw new Error(`Failed to fetch file list: ${resp.status} ${resp.statusText}`);
  const data = (await resp.json()) as Array<{ name: string; type: string }>;
  return data.filter((f) => f.type === "file" && f.name.endsWith(".tex")).map((f) => f.name);
}

async function fetchTexFile(fileName: string): Promise<string> {
  const url = `${BASE_URL}${fileName}`;
  const resp = await fetch(url, { headers: { "User-Agent": "cxx-draft-to-index" } });
  if (!resp.ok) throw new Error(`Failed to fetch ${fileName}: ${resp.status}`);
  return await resp.text();
}

export async function fetchAllTexFiles(onProgress?: (msg: string) => void): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  onProgress?.(`Fetching file list from ${REPO_OWNER}/${REPO_NAME}...`);
  const fileNames = await fetchFileList();
  onProgress?.(`Found ${fileNames.length} .tex files. Downloading...`);

  const batchSize = 8;
  for (let i = 0; i < fileNames.length; i += batchSize) {
    const batch = fileNames.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(async (name) => [name, await fetchTexFile(name)] as const));
    for (const [name, content] of results) {
      files.set(name, content);
    }
    onProgress?.(`Downloaded ${Math.min(i + batchSize, fileNames.length)}/${fileNames.length} files`);
  }

  return files;
}

export function extractHeaderSynopses(texFiles: Map<string, string>): HeaderSynopsis[] {
  const results: HeaderSynopsis[] = [];
  const seen = new Set<string>();

  for (const [fileName, content] of texFiles) {
    const synopses = extractFromSingleFile(fileName, content);
    for (const syn of synopses) {
      if (!seen.has(syn.header)) {
        seen.add(syn.header);
        results.push(syn);
      }
    }
  }

  return results;
}

function extractFromSingleFile(fileName: string, content: string): HeaderSynopsis[] {
  const results: HeaderSynopsis[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const headerName = findHeaderMarker(lines, i);
    if (!headerName) continue;

    const codeStart = findNextCodeblock(lines, i + 1, 50);
    if (codeStart === null) continue;

    const codeEnd = findCodeblockEnd(lines, codeStart);
    if (codeEnd === null) continue;

    const codeLines = lines.slice(codeStart + 1, codeEnd);
    results.push({
      header: headerName,
      code: codeLines.join("\n"),
      sourceFile: fileName,
    });
  }

  return results;
}

function findHeaderMarker(lines: string[], lineIdx: number): string | null {
  const line = lines[lineIdx];

  const indexHeaderMatch = line.match(/\\indexheader\{([^}]+)\}/);
  if (indexHeaderMatch) return indexHeaderMatch[1];

  const sectionMatch = line.match(/\\rSec\d\[(\w+(?:\.\w+)*)\]\{.*\\tcode\{<(\w+(?:\.\w+)*)>\}\s*synopsis\}/);
  if (sectionMatch) return sectionMatch[2];

  return null;
}

function findNextCodeblock(lines: string[], startFrom: number, maxLookAhead: number): number | null {
  for (let i = startFrom; i < Math.min(lines.length, startFrom + maxLookAhead); i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("\\begin{codeblock}") || trimmed.startsWith("\\begin{codeblocktu}")) {
      return i;
    }
    if (trimmed.startsWith("\\rSec") || trimmed.startsWith("\\indexheader")) {
      return null;
    }
  }
  return null;
}

function findCodeblockEnd(lines: string[], codeStart: number): number | null {
  for (let i = codeStart + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "\\end{codeblock}" || trimmed === "\\end{codeblocktu}") {
      return i;
    }
  }
  return null;
}