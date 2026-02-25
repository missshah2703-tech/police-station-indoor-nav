import { dijkstra } from "@/lib/dijkstra";
import { MapNode, Edge } from "@/lib/types";

/**
 * Test graph:
 *
 *   A ---5--- B ---3--- C
 *   |         |         |
 *   2      (stairs 1)   4
 *   |         |         |
 *   D ---6--- E ---2--- F
 *
 * Nodes: A(0,0), B(5,0), C(8,0), D(0,3), E(5,3), F(8,3)
 * The B↔E edge has stairs=true, weight=1
 */

const nodes: MapNode[] = [
  { id: "A", x: 0, y: 0, label: { en: "A" } },
  { id: "B", x: 5, y: 0, label: { en: "B" } },
  { id: "C", x: 8, y: 0, label: { en: "C" } },
  { id: "D", x: 0, y: 3, label: { en: "D" } },
  { id: "E", x: 5, y: 3, label: { en: "E" } },
  { id: "F", x: 8, y: 3, label: { en: "F" } },
];

const edges: Edge[] = [
  { from: "A", to: "B", weight: 5, stairs: false },
  { from: "B", to: "C", weight: 3, stairs: false },
  { from: "A", to: "D", weight: 2, stairs: false },
  { from: "B", to: "E", weight: 1, stairs: true }, // STAIRS
  { from: "C", to: "F", weight: 4, stairs: false },
  { from: "D", to: "E", weight: 6, stairs: false },
  { from: "E", to: "F", weight: 2, stairs: false },
];

describe("Dijkstra shortest path", () => {
  test("finds shortest path A→F (normal mode, uses stairs)", () => {
    const result = dijkstra(nodes, edges, "A", "F", false);
    expect(result).not.toBeNull();
    // A→B(5) + B→E(1, stairs) + E→F(2) = 8
    expect(result!.path).toEqual(["A", "B", "E", "F"]);
    expect(result!.distance).toBe(8);
  });

  test("finds shortest path A→F (accessibility mode, avoids stairs)", () => {
    const result = dijkstra(nodes, edges, "A", "F", true);
    expect(result).not.toBeNull();
    // Without B→E stairs edge:
    // Option 1: A→B(5) + B→C(3) + C→F(4) = 12
    // Option 2: A→D(2) + D→E(6) + E→F(2) = 10 ← shorter
    expect(result!.path).toEqual(["A", "D", "E", "F"]);
    expect(result!.distance).toBe(10);
  });

  test("returns null when no path exists", () => {
    // Remove all edges to F except via stairs
    const limitedEdges: Edge[] = [
      { from: "A", to: "B", weight: 5, stairs: false },
      { from: "B", to: "F", weight: 1, stairs: true },
    ];
    const isolatedNodes: MapNode[] = [
      { id: "A", x: 0, y: 0, label: { en: "A" } },
      { id: "B", x: 5, y: 0, label: { en: "B" } },
      { id: "F", x: 8, y: 3, label: { en: "F" } },
    ];

    // In accessibility mode, B→F is excluded → no path
    const result = dijkstra(isolatedNodes, limitedEdges, "A", "F", true);
    expect(result).toBeNull();
  });

  test("same start and end returns trivial path", () => {
    const result = dijkstra(nodes, edges, "A", "A", false);
    expect(result).not.toBeNull();
    expect(result!.path).toEqual(["A"]);
    expect(result!.distance).toBe(0);
  });

  test("finds direct neighbor path", () => {
    const result = dijkstra(nodes, edges, "A", "B", false);
    expect(result).not.toBeNull();
    expect(result!.path).toEqual(["A", "B"]);
    expect(result!.distance).toBe(5);
  });

  test("accessibility mode still finds path when stairs not needed", () => {
    const result = dijkstra(nodes, edges, "A", "D", true);
    expect(result).not.toBeNull();
    expect(result!.path).toEqual(["A", "D"]);
    expect(result!.distance).toBe(2);
  });

  test("normal mode prefers shorter path even through stairs", () => {
    // A→C: direct = A→B(5)+B→C(3)=8
    const result = dijkstra(nodes, edges, "A", "C", false);
    expect(result).not.toBeNull();
    expect(result!.path).toEqual(["A", "B", "C"]);
    expect(result!.distance).toBe(8);
  });
});
