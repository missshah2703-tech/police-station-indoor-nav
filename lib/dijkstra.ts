import { MapNode, Edge } from "./types";

export interface DijkstraResult {
  /** Ordered list of node IDs from start to end */
  path: string[];
  /** Total distance in meters */
  distance: number;
}

/**
 * Dijkstra's shortest-path algorithm.
 * When accessibilityMode is true, edges tagged as "stairs" are excluded.
 */
export function dijkstra(
  nodes: MapNode[],
  edges: Edge[],
  startId: string,
  endId: string,
  accessibilityMode: boolean = false
): DijkstraResult | null {
  // Filter out stairs edges in accessibility mode
  const activeEdges = accessibilityMode
    ? edges.filter((e) => !e.stairs)
    : edges;

  // Build adjacency list (undirected graph)
  const adj: Record<string, { to: string; weight: number }[]> = {};
  for (const node of nodes) {
    adj[node.id] = [];
  }
  for (const edge of activeEdges) {
    adj[edge.from]?.push({ to: edge.to, weight: edge.weight });
    adj[edge.to]?.push({ to: edge.from, weight: edge.weight });
  }

  // Initialize distances
  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const visited = new Set<string>();

  for (const node of nodes) {
    dist[node.id] = Infinity;
    prev[node.id] = null;
  }
  dist[startId] = 0;

  // Main loop — simple O(V²) implementation (fine for small indoor graphs)
  while (true) {
    let minDist = Infinity;
    let current: string | null = null;

    for (const node of nodes) {
      if (!visited.has(node.id) && dist[node.id] < minDist) {
        minDist = dist[node.id];
        current = node.id;
      }
    }

    if (current === null || current === endId) break;
    visited.add(current);

    for (const neighbor of adj[current] || []) {
      if (visited.has(neighbor.to)) continue;
      const newDist = dist[current] + neighbor.weight;
      if (newDist < dist[neighbor.to]) {
        dist[neighbor.to] = newDist;
        prev[neighbor.to] = current;
      }
    }
  }

  // No path found
  if (dist[endId] === Infinity) return null;

  // Reconstruct path
  const path: string[] = [];
  let current: string | null = endId;
  while (current !== null) {
    path.unshift(current);
    current = prev[current];
  }

  return { path, distance: dist[endId] };
}
