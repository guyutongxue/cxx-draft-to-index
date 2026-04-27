import { DepGraph } from "dependency-graph";
import type { PreprocessedCodeblock } from "./types";

export function topologicalSort(
  codeblocks: PreprocessedCodeblock[],
): PreprocessedCodeblock[] {
  const depGraph = new DepGraph<PreprocessedCodeblock>();
  const depGraphEdges: [string, string][] = [];
  const classDefs: PreprocessedCodeblock[] = [];
  for (const block of codeblocks) {
    if (block.isSynopsis) {
      depGraph.addNode(block.header, block);
      for (const include of block.includes) {
        depGraphEdges.push([block.header, include]);
      }
    } else {
      classDefs.push(block);
    }
  }
  return [
    ...depGraph.overallOrder().map((header) => depGraph.getNodeData(header)),
    ...classDefs,
  ];
}
