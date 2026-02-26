"use client";

import { Suspense, useState, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSettings } from "@/context/SettingsContext";
import { t } from "@/lib/i18n";
import { Building, Floor, MapNode, Edge, RouteStep } from "@/lib/types";
import { dijkstra } from "@/lib/dijkstra";
import { generateDirections } from "@/lib/directions";
import DepartmentList from "@/components/DepartmentList";
import demoBuilding from "@/data/buildings/demo.json";
import officeBuilding from "@/data/buildings/office-205.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Convert raw JSON building data into a proper typed Floor */
function buildFloor(raw: any): Floor {
  const f = raw.floors?.[0] ?? {};
  const nodes: MapNode[] = (raw.nodes ?? []).map((n: any) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    label:
      typeof n.label === "string"
        ? { en: n.label, ar: n.label, hi: n.label }
        : n.label,
  }));
  const edges: Edge[] = (raw.edges ?? []).map((e: any) => ({
    from: e.from,
    to: e.to,
    weight: e.weight,
    stairs: e.stairs ?? false,
  }));
  const pois = (raw.pois ?? []).map((p: any) => ({
    nodeId: p.nodeId,
    icon: p.icon || "📍",
    category: p.category || p.type || "general",
    description:
      typeof p.description === "string"
        ? { en: p.description, ar: p.description, hi: p.description }
        : p.description || { en: p.name ?? "", ar: p.name ?? "", hi: p.name ?? "" },
  }));
  return {
    id: f.id || "ground",
    name: typeof f.name === "string" ? { en: f.name, ar: f.name, hi: f.name } : (f.name || { en: "Ground Floor", ar: "الطابق الأرضي", hi: "भूतल" }),
    level: f.level ?? 0,
    planImage: f.floorPlanImage || raw.floorPlanImage || "/floor-plan.png",
    width: f.width || 800,
    height: f.height || 600,
    nodes,
    edges,
    pois,
    scaleFactor: raw.scaleFactor ?? 10,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const SplitNavigationView = dynamic(
  () => import("@/components/SplitNavigationView"),
  {
    ssr: false,
    loading: () => (
      <div className="h-screen flex items-center justify-center bg-[#0a1628]">
        <div className="text-white animate-pulse text-lg">
          Loading navigation...
        </div>
      </div>
    ),
  }
);

const ThreeDMapView = dynamic(
  () => import("@/components/ThreeDMapView"),
  {
    ssr: false,
    loading: () => (
      <div className="h-screen flex items-center justify-center bg-[#0a1628]">
        <div className="text-white animate-pulse text-lg">
          Loading 3D Map...
        </div>
      </div>
    ),
  }
);

type PageState = "departments" | "navigating" | "map3d";

function MapContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { language, accessibilityMode } = useSettings();

  const buildingId = params.buildingId as string;
  const startNodeId = searchParams.get("start") || "entrance";

  const rawBuilding = useMemo(() => {
    if (buildingId === "demo" || buildingId === "al-qusais")
      return demoBuilding;
    if (buildingId === "office-205" || buildingId === "office")
      return officeBuilding;
    return null;
  }, [buildingId]);

  const floor = useMemo<Floor | null>(() => {
    if (!rawBuilding) return null;
    return buildFloor(rawBuilding);
  }, [rawBuilding]);

  // Build a minimal Building object for DepartmentList
  const building = useMemo<Building | null>(() => {
    if (!rawBuilding || !floor) return null;
    const raw = rawBuilding as any;
    return {
      id: raw.id,
      name: typeof raw.name === "string" ? { en: raw.name, ar: raw.name, hi: raw.name } : raw.name,
      address: typeof raw.address === "string" ? { en: raw.address, ar: raw.address, hi: raw.address } : raw.address,
      floors: [floor],
      defaultStartNode: "entrance",
    };
  }, [rawBuilding, floor]);

  // Page state
  const [pageState, setPageState] = useState<PageState>("departments");
  const [route, setRoute] = useState<string[]>([]);
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [totalDistance, setTotalDistance] = useState(0);
  const [destinationName, setDestinationName] = useState("");

  if (!building || !floor) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-[#0a1628]">
        <div className="text-6xl mb-4">🏢</div>
        <h2 className="text-xl font-bold text-white mb-2">
          {t("dept.buildingNotFound", language)}
        </h2>
        <p className="text-gray-400 mb-6">
          ID: &ldquo;{buildingId}&rdquo;
        </p>
        <Link
          href="/scan"
          className="bg-[#c5a44e] text-[#0a1628] px-6 py-3 rounded-xl font-semibold"
        >
          {t("nav.scan", language)}
        </Link>
      </div>
    );
  }

  const handleSelectDepartment = (nodeId: string) => {
    const result = dijkstra(
      floor.nodes,
      floor.edges,
      startNodeId,
      nodeId,
      accessibilityMode
    );

    if (!result) return;

    const steps = generateDirections(result.path, floor.nodes, language, floor.scaleFactor ?? 10);
    const node = floor.nodes.find((n) => n.id === nodeId);
    const name = node?.label[language] || node?.label.en || nodeId;

    setRoute(result.path);
    setRouteSteps(steps);
    setTotalDistance(result.distance);
    setDestinationName(name);
    setPageState("navigating");
  };

  const handleCloseNavigation = () => {
    setPageState("departments");
    setRoute([]);
    setRouteSteps([]);
    setTotalDistance(0);
    setDestinationName("");
  };

  if (pageState === "navigating" && route.length > 0) {
    return (
      <SplitNavigationView
        floor={floor}
        route={route}
        routeSteps={routeSteps}
        totalDistance={totalDistance}
        destinationName={destinationName}
        onClose={handleCloseNavigation}
      />
    );
  }

  if (pageState === "map3d") {
    return (
      <ThreeDMapView
        floor={floor}
        route={route.length > 0 ? route : undefined}
        selectedPoi={route.length > 0 ? route[route.length - 1] : undefined}
        onClose={() => setPageState(route.length > 0 ? "navigating" : "departments")}
      />
    );
  }

  return (
    <>
      <DepartmentList
        building={building}
        floor={floor}
        onSelectDepartment={handleSelectDepartment}
      />
      {/* 3D Map floating button */}
      <button
        onClick={() => setPageState("map3d")}
        className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-[#4285F4] to-[#5a9cff] text-white w-14 h-14 rounded-full flex items-center justify-center shadow-2xl shadow-blue-500/40 border-2 border-white/20 hover:scale-110 transition-transform"
        title="3D Map View"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
          <path d="M8 2v16" />
          <path d="M16 6v16" />
        </svg>
      </button>
    </>
  );
}

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center bg-[#0a1628]">
          <div className="animate-pulse text-white">Loading...</div>
        </div>
      }
    >
      <MapContent />
    </Suspense>
  );
}
