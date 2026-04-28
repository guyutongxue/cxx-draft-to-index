import { DepGraph } from "dependency-graph";
import { PreprocessedHeader } from "./types";

export function topologicalSort(
  headers: PreprocessedHeader[],
): PreprocessedHeader[] {
  const depGraph = new DepGraph<PreprocessedHeader>();
  const depGraphEdges: [string, string][] = [];
  for (const header of headers) {
    depGraph.addNode(header.headerName, header);
    for (const include of header.includes) {
      depGraphEdges.push([header.headerName, include]);
    }
  }
  return depGraph.overallOrder().map((header) => depGraph.getNodeData(header));
}
