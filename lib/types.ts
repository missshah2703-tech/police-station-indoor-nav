/** Shared TypeScript types for the Police Station Indoor Map */

export interface Coordinates {
  x: number;
  y: number;
}

/** A node in the navigation graph (corridor junction, room entrance, etc.) */
export interface MapNode {
  id: string;
  x: number;
  y: number;
  /** Localized label: { en: "Reception", ar: "الاستقبال", hi: "रिसेप्शन" } */
  label: Record<string, string>;
}

/** An edge connecting two nodes */
export interface Edge {
  from: string;
  to: string;
  /** Distance in meters */
  weight: number;
  /** True if this edge requires stairs (excluded in accessibility mode) */
  stairs: boolean;
}

/** A Point of Interest (linked to a MapNode) */
export interface POI {
  nodeId: string;
  icon: string;
  category: string;
  description: Record<string, string>;
}

/** A single floor of a building */
export interface Floor {
  id: string;
  name: Record<string, string>;
  level: number;
  /** URL or path to the floor plan image */
  planImage: string;
  /** Floor plan width in coordinate units */
  width: number;
  /** Floor plan height in coordinate units */
  height: number;
  nodes: MapNode[];
  edges: Edge[];
  pois: POI[];
  /** Coordinate units per real-world meter. Default 10 (1 unit = 0.1m). */
  scaleFactor?: number;
}

/** A building containing one or more floors */
export interface Building {
  id: string;
  name: Record<string, string>;
  address: Record<string, string>;
  floors: Floor[];
  /** Default node ID where navigation starts (usually reception) */
  defaultStartNode: string;
}

/** A single step in turn-by-turn navigation */
export interface RouteStep {
  /** Localized instruction text */
  text: Record<string, string>;
  /** Distance for this segment in meters */
  distance: number;
  direction: "straight" | "left" | "right" | "start" | "arrive";
}

/** Position source for confidence tracking */
export type PositionSource = "accelerometer" | "beacon" | "manual" | "simulation";

/** Production-grade indoor position with confidence metadata */
export interface IndoorPosition {
  x: number;
  y: number;
  /** Confidence level 0–1 (1 = highly confident, decays over time/distance) */
  confidence: number;
  /** How this position was determined */
  source: PositionSource;
  /** Timestamp of last position update */
  timestamp: number;
}
