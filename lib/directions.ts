import { MapNode, RouteStep } from "./types";
import { Language, t } from "./i18n";

/** Angle (degrees) between two consecutive segments prev→curr and curr→next */
function angleBetween(
  prev: { x: number; y: number },
  curr: { x: number; y: number },
  next: { x: number; y: number }
): number {
  const angle1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
  const angle2 = Math.atan2(next.y - curr.y, next.x - curr.x);
  let diff = ((angle2 - angle1) * 180) / Math.PI;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

/** Euclidean distance between two points, using configurable scale factor */
function distanceMeters(
  a: { x: number; y: number },
  b: { x: number; y: number },
  scaleFactor: number = 10
): number {
  const px = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  return Math.round(px / scaleFactor);
}

/**
 * Generate human-readable turn-by-turn directions from a path of node IDs.
 * Uses angle changes to infer turns (>30° = turn).
 * @param scaleFactor — coordinate units per meter (default 10, configurable per floor)
 */
export function generateDirections(
  pathNodeIds: string[],
  nodes: MapNode[],
  lang: Language,
  scaleFactor: number = 10
): RouteStep[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const pathNodes = pathNodeIds.map((id) => nodeMap.get(id)!).filter(Boolean);

  if (pathNodes.length < 2) return [];

  const steps: RouteStep[] = [];

  // Start step
  const startNode = pathNodes[0];
  const startLabel = startNode.label[lang] || startNode.label.en || startNode.id;
  steps.push({
    text: { [lang]: t("dir.start", lang, { location: startLabel }) },
    distance: 0,
    direction: "start",
  });

  // Walk segments — merge consecutive "straight" segments
  for (let i = 1; i < pathNodes.length; i++) {
    const prev = pathNodes[i - 1];
    const curr = pathNodes[i];
    const dist = distanceMeters(prev, curr, scaleFactor);

    if (i < pathNodes.length - 1) {
      const next = pathNodes[i + 1];
      const angle = angleBetween(prev, curr, next);

      let direction: RouteStep["direction"] = "straight";
      let dirKey = "dir.straight";

      if (angle < -30) {
        direction = "right";
        dirKey = "dir.right";
      } else if (angle > 30) {
        direction = "left";
        dirKey = "dir.left";
      }

      // Only emit a step at turning points or labeled nodes
      if (direction !== "straight") {
        steps.push({
          text: {
            [lang]: t(dirKey, lang, {
              distance: String(distanceMeters(curr, next, scaleFactor)),
            }),
          },
          distance: distanceMeters(curr, next, scaleFactor),
          direction,
        });
      } else {
        // Merge straight segments — just continue; step emitted at next turn
      }
    }
  }

  // Add a straight segment if the last step before arrival was just walking
  if (steps.length === 1) {
    // Direct path with no turns
    const totalDist = distanceMeters(pathNodes[0], pathNodes[pathNodes.length - 1], scaleFactor);
    steps.push({
      text: { [lang]: t("dir.straight", lang, { distance: String(totalDist) }) },
      distance: totalDist,
      direction: "straight",
    });
  }

  // Arrival step
  const endNode = pathNodes[pathNodes.length - 1];
  const endLabel = endNode.label[lang] || endNode.label.en || endNode.id;
  steps.push({
    text: { [lang]: t("dir.arrive", lang, { destination: endLabel }) },
    distance: 0,
    direction: "arrive",
  });

  return steps;
}
