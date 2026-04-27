import type { PreprocessedCodeblock } from "./types";

export function topologicalSortCodeblocks(
  codeblocks: PreprocessedCodeblock[],
): PreprocessedCodeblock[] {
  const n = codeblocks.length;
  if (n <= 1) return [...codeblocks];

  const headerToIndex = new Map<string, number>();
  codeblocks.forEach((cb, i) => headerToIndex.set(cb.header, i));

  // Number of includes that reference other codeblocks in the list
  const depCount = codeblocks.map((cb) => {
    let count = 0;
    for (const inc of cb.includes) {
      if (headerToIndex.has(inc)) count++;
    }
    return count;
  });

  // Reverse deps: which codeblocks depend on a given header
  const reverseDeps = new Map<string, number[]>();
  codeblocks.forEach((cb, i) => {
    for (const inc of cb.includes) {
      if (headerToIndex.has(inc)) {
        const arr = reverseDeps.get(inc);
        if (arr) arr.push(i);
        else reverseDeps.set(inc, [i]);
      }
    }
  });

  // Queue: indices with 0 remaining dependencies, kept in original order
  const ready: number[] = [];
  for (let i = 0; i < n; i++) {
    if (depCount[i] === 0) ready.push(i);
  }

  const result: PreprocessedCodeblock[] = [];
  const processed = new Array<boolean>(n).fill(false);

  while (ready.length > 0) {
    // Pick the ready node with smallest original index for stability
    ready.sort((a, b) => a - b);
    const idx = ready.shift()!;
    processed[idx] = true;
    result.push(codeblocks[idx]);

    const dependents = reverseDeps.get(codeblocks[idx].header);
    if (dependents) {
      for (const depIdx of dependents) {
        depCount[depIdx]--;
        if (depCount[depIdx] === 0) {
          ready.push(depIdx);
        }
      }
    }
  }

  // Append unprocessed nodes (cycles) in original order
  for (let i = 0; i < n; i++) {
    if (!processed[i]) {
      result.push(codeblocks[i]);
    }
  }

  return result;
}
