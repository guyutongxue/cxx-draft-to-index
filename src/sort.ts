import { DepGraph } from "dependency-graph";
import { PreprocessedHeader } from "./share/types";

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
  for (const [from, to] of depGraphEdges) {
    if (!depGraph.hasNode(to)) {
      console.warn(`Header ${to} not found in graph nodes.`);
      continue;
    }
    depGraph.addDependency(from, to);
  }
  return depGraph.overallOrder().map((header) => depGraph.getNodeData(header));
}
