"use client";

import { Suspense, useState, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSettings } from "@/context/SettingsContext";
import { t } from "@/lib/i18n";
import { Building, RouteStep } from "@/lib/types";
import { dijkstra } from "@/lib/dijkstra";
import { generateDirections } from "@/lib/directions";
import DepartmentList from "@/components/DepartmentList";
import demoBuilding from "@/data/buildings/demo.json";
import officeBuilding from "@/data/buildings/office-205.json";

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

type PageState = "departments" | "navigating";

function MapContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { language, accessibilityMode } = useSettings();

  const buildingId = params.buildingId as string;
  const startNodeId = searchParams.get("start") || "entrance";

  const building = useMemo<Building | null>(() => {
    if (buildingId === "demo" || buildingId === "al-qusais")
      return demoBuilding as unknown as Building;
    if (buildingId === "office-205" || buildingId === "office")
      return officeBuilding as unknown as Building;
    return null;
  }, [buildingId]);

  const floor = building?.floors[0] ?? null;

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

  return (
    <DepartmentList
      building={building}
      floor={floor}
      onSelectDepartment={handleSelectDepartment}
    />
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
