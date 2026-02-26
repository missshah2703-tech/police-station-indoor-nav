"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Floor, MapNode, Edge, RouteStep } from "@/lib/types";
import { dijkstra } from "@/lib/dijkstra";
import { generateDirections } from "@/lib/directions";

const SplitNavigationView = dynamic(
  () => import("@/components/SplitNavigationView"),
  { ssr: false }
);

interface POI {
  id: string;
  nodeId: string;
  name: string;
  nameAr?: string;
  nameHi?: string;
  type: string;
  icon?: string;
}

interface Building {
  id: string;
  name: string;
  nameAr?: string;
  nameHi?: string;
  floorPlanImage?: string;
  nodes: { id: string; x: number; y: number; label?: string }[];
  edges: { from: string; to: string; weight: number }[];
  pois: POI[];
  scaleFactor: number;
  floors: { floorPlanImage: string; width: number; height: number }[];
}

type Language = "en" | "ar" | "hi";

const translations = {
  en: {
    selectLang: "Select Language",
    selectDept: "Where do you want to go?",
    loading: "Loading...",
    notFound: "Location not found",
    back: "Back",
    yourLocation: "Your current location:",
  },
  ar: {
    selectLang: "اختر اللغة",
    selectDept: "إلى أين تريد الذهاب؟",
    loading: "جار التحميل...",
    notFound: "الموقع غير موجود",
    back: "رجوع",
    yourLocation: "موقعك الحالي:",
  },
  hi: {
    selectLang: "भाषा चुनें",
    selectDept: "आप कहाँ जाना चाहते हैं?",
    loading: "लोड हो रहा है...",
    notFound: "स्थान नहीं मिला",
    back: "वापस",
    yourLocation: "आपकी वर्तमान स्थिति:",
  },
};

type Step = "language" | "department" | "navigate";

export default function NavigatePage() {
  const params = useParams();
  const router = useRouter();
  const buildingId = params.id as string;

  const [building, setBuilding] = useState<Building | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("language");
  const [lang, setLang] = useState<Language>("en");
  const [selectedDept, setSelectedDept] = useState<POI | null>(null);
  const [startNodeId, setStartNodeId] = useState<string>("");

  const t = translations[lang];

  const loadBuilding = useCallback(async () => {
    try {
      const res = await fetch(`/api/buildings/${buildingId}`);
      if (!res.ok) {
        setBuilding(null);
        return;
      }
      const data = await res.json();
      setBuilding(data);
      if (data.nodes?.length > 0) {
        const entrance = data.pois?.find(
          (p: POI) => p.type === "entrance"
        );
        setStartNodeId(entrance?.nodeId || data.nodes[0].id);
      }
    } catch {
      setBuilding(null);
    } finally {
      setLoading(false);
    }
  }, [buildingId]);

  useEffect(() => {
    loadBuilding();
  }, [loadBuilding]);

  // Convert API data to lib/types format
  const floor = useMemo<Floor | null>(() => {
    if (!building) return null;
    const floorPlanImage =
      building.floorPlanImage || building.floors?.[0]?.floorPlanImage || "";
    const width = building.floors?.[0]?.width || 800;
    const height = building.floors?.[0]?.height || 600;

    const nodes: MapNode[] = building.nodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      label: { en: n.label || n.id, ar: n.label || n.id, hi: n.label || n.id },
    }));

    const edges: Edge[] = building.edges.map((e) => ({
      from: e.from,
      to: e.to,
      weight: e.weight,
      stairs: false,
    }));

    const pois = building.pois.map((p) => ({
      nodeId: p.nodeId,
      icon: p.icon || "📍",
      category: p.type,
      description: {
        en: p.name,
        ar: p.nameAr || p.name,
        hi: p.nameHi || p.name,
      },
    }));

    return {
      id: "ground",
      name: { en: "Ground Floor", ar: "الطابق الأرضي", hi: "भूतल" },
      level: 0,
      planImage: floorPlanImage,
      width,
      height,
      nodes,
      edges,
      pois,
      scaleFactor: building.scaleFactor || 10,
    };
  }, [building]);

  // Compute route
  const routeData = useMemo(() => {
    if (!floor || !selectedDept || !startNodeId) return null;
    const result = dijkstra(floor.nodes, floor.edges, startNodeId, selectedDept.nodeId, false);
    if (!result) return null;
    const steps = generateDirections(result.path, floor.nodes, lang, floor.scaleFactor ?? 10);
    return { route: result.path, routeSteps: steps, totalDistance: result.distance };
  }, [floor, selectedDept, startNodeId, lang]);

  function handleSelectLanguage(l: Language) {
    setLang(l);
    setStep("department");
  }

  function handleSelectDepartment(poi: POI) {
    setSelectedDept(poi);
    setStep("navigate");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-[#c5a44e] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!building) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-4">Location not found</p>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-[#c5a44e] text-[#0a1628] rounded-lg font-semibold"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  // ─── STEP 3: Navigation ───
  if (step === "navigate" && selectedDept && floor) {
    if (!routeData) {
      return (
        <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-red-400 text-lg mb-2">⚠️ No route found</p>
            <p className="text-gray-400 mb-6 text-sm">Could not find a path to {selectedDept.name}</p>
            <button
              onClick={() => { setSelectedDept(null); setStep("department"); }}
              className="px-6 py-3 bg-[#c5a44e] text-[#0a1628] rounded-lg font-semibold"
            >
              ← {t.back}
            </button>
          </div>
        </div>
      );
    }

    const destName =
      lang === "ar" && selectedDept.nameAr
        ? selectedDept.nameAr
        : lang === "hi" && selectedDept.nameHi
        ? selectedDept.nameHi
        : selectedDept.name;

    return (
      <SplitNavigationView
        floor={floor}
        route={routeData.route}
        routeSteps={routeData.routeSteps}
        totalDistance={routeData.totalDistance}
        destinationName={destName}
        onClose={() => setStep("department")}
      />
    );
  }

  // ─── STEP 1: Language Selection ───
  if (step === "language") {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <Image
            src="/dubai-police-logo.png"
            alt="Dubai Police"
            width={80}
            height={80}
            className="rounded-full mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-[#c5a44e] mb-1">
            {building.name}
          </h1>
          <p className="text-gray-400 mb-8">Indoor Navigation</p>

          <h2 className="text-white text-lg mb-6">Select Language</h2>
          <div className="space-y-3">
            {[
              { key: "en" as Language, label: "English", flag: "🇬🇧" },
              { key: "ar" as Language, label: "العربية", flag: "🇦🇪" },
              { key: "hi" as Language, label: "हिन्दी", flag: "🇮🇳" },
            ].map((l) => (
              <button
                key={l.key}
                onClick={() => handleSelectLanguage(l.key)}
                className="w-full flex items-center gap-4 px-6 py-4 bg-[#111d33] hover:bg-[#1e2d4a] border border-[#1e2d4a] rounded-xl text-white transition-colors"
              >
                <span className="text-2xl">{l.flag}</span>
                <span className="text-lg font-medium">{l.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── STEP 2: Department Selection ───
  return (
    <div className="min-h-screen bg-[#0a1628] p-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setStep("language")}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ← {t.back}
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-[#c5a44e] font-bold">{building.name}</h1>
          </div>
          <div className="w-10" />
        </div>

        <h2 className="text-white text-xl font-semibold text-center mb-6">
          {t.selectDept}
        </h2>

        <div className="mb-4 bg-[#111d33] border border-[#1e2d4a] rounded-xl p-4">
          <label className="block text-gray-400 text-sm mb-2">
            {t.yourLocation}
          </label>
          <select
            value={startNodeId}
            onChange={(e) => setStartNodeId(e.target.value)}
            className="w-full px-3 py-2 bg-[#0a1628] border border-[#1e2d4a] rounded-lg text-white text-sm focus:outline-none focus:border-[#c5a44e]"
          >
            {building.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label || n.id}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          {building.pois
            .filter((p) => p.type !== "entrance")
            .map((poi) => {
              const displayName =
                lang === "ar" && poi.nameAr
                  ? poi.nameAr
                  : lang === "hi" && poi.nameHi
                  ? poi.nameHi
                  : poi.name;

              return (
                <button
                  key={poi.id}
                  onClick={() => handleSelectDepartment(poi)}
                  className="w-full flex items-center gap-4 px-5 py-4 bg-[#111d33] hover:bg-[#1e2d4a] border border-[#1e2d4a] rounded-xl text-left transition-colors"
                  dir={lang === "ar" ? "rtl" : "ltr"}
                >
                  <span className="text-2xl">{poi.icon || "📍"}</span>
                  <div className="flex-1">
                    <p className="text-white font-medium">{displayName}</p>
                    <p className="text-gray-500 text-xs capitalize">{poi.type}</p>
                  </div>
                  <span className="text-[#c5a44e]">→</span>
                </button>
              );
            })}
        </div>

        {building.pois.filter((p) => p.type !== "entrance").length === 0 && (
          <p className="text-gray-500 text-center py-8">
            No departments configured for this location.
          </p>
        )}
      </div>
    </div>
  );
}
