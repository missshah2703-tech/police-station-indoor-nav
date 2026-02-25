"use client";

import { useState, useMemo } from "react";
import { Floor, Building } from "@/lib/types";
import { useSettings } from "@/context/SettingsContext";
import { t } from "@/lib/i18n";

interface Props {
  building: Building;
  floor: Floor;
  onSelectDepartment: (nodeId: string) => void;
}

export default function DepartmentList({
  building,
  floor,
  onSelectDepartment,
}: Props) {
  const { language, accessibilityMode } = useSettings();
  const [search, setSearch] = useState("");

  // Build sorted department list from POIs
  const departments = useMemo(() => {
    return floor.pois
      .map((poi) => {
        const node = floor.nodes.find((n) => n.id === poi.nodeId);
        if (!node) return null;
        return {
          nodeId: poi.nodeId,
          icon: poi.icon,
          category: poi.category,
          name: node.label[language] || node.label.en,
          nameEn: node.label.en,
          nameAr: node.label.ar || "",
          nameHi: node.label.hi || "",
          description: poi.description[language] || poi.description.en,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a!.name.localeCompare(b!.name, language)) as {
      nodeId: string;
      icon: string;
      category: string;
      name: string;
      nameEn: string;
      nameAr: string;
      nameHi: string;
      description: string;
    }[];
  }, [floor, language]);

  // Filter by search query (matches across all languages)
  const filtered = useMemo(() => {
    if (!search.trim()) return departments;
    const q = search.toLowerCase().trim();
    return departments.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.nameEn.toLowerCase().includes(q) ||
        d.nameAr.includes(q) ||
        d.nameHi.includes(q) ||
        d.category.toLowerCase().includes(q)
    );
  }, [departments, search]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-[#0a1628] text-white px-5 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 bg-[#c5a44e] rounded-lg flex items-center justify-center">
            <span className="text-xl">🏛️</span>
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">
              {building.name[language] || building.name.en}
            </h1>
            <p className="text-xs text-gray-400">
              {building.address[language] || building.address.en}
            </p>
          </div>
        </div>

        {accessibilityMode && (
          <div className="mt-2 bg-green-900/40 text-green-300 text-xs px-3 py-1.5 rounded-lg font-medium inline-block">
            ♿ {t("map.accessibility", language)}
          </div>
        )}
      </div>

      {/* Search bar */}
      <div className="px-4 -mt-5 relative z-10">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("dept.search", language)}
            className="w-full pl-12 pr-4 py-3.5 bg-white rounded-2xl shadow-lg border border-gray-100 text-base focus:ring-2 focus:ring-[#c5a44e] focus:border-[#c5a44e] outline-none"
            autoComplete="off"
          />
        </div>
      </div>

      {/* Department count */}
      <div className="px-5 pt-4 pb-2">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
          {t("dept.allDepartments", language)} ({filtered.length})
        </p>
      </div>

      {/* Department list */}
      <div className="flex-1 overflow-y-auto px-4 pb-20">
        <div className="space-y-2">
          {filtered.map((dept) => (
            <button
              key={dept.nodeId}
              onClick={() => onSelectDepartment(dept.nodeId)}
              className="w-full flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:border-[#c5a44e] hover:shadow-md active:bg-gray-50 transition-all text-start"
            >
              <div className="w-12 h-12 bg-[#0a1628]/5 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                {dept.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 text-[15px] truncate">
                  {dept.name}
                </div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">
                  {dept.description}
                </div>
              </div>
              <div className="text-gray-300 text-lg flex-shrink-0">›</div>
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-sm">{t("dept.noResults", language)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
