"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Building {
  id: string;
  name: string;
  address?: string;
  nodes: { id: string }[];
  edges: { from: string; to: string }[];
  pois: { id: string }[];
  floorPlanImage?: string;
  createdAt: string;
}

export default function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/buildings")
      .then((r) => r.json())
      .then(setBuildings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/buildings/${id}`, { method: "DELETE" });
    if (res.ok) {
      setBuildings((prev) => prev.filter((b) => b.id !== id));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-[#c5a44e] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-gray-900 text-xl font-semibold">All Buildings</h2>
        <Link
          href="/admin/dashboard/buildings/new"
          className="px-4 py-2 bg-[#c5a44e] hover:bg-[#d4b55f] text-[#0a1628] font-semibold rounded-lg transition-colors text-sm"
        >
          + Add Building
        </Link>
      </div>

      {buildings.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm">
          <p className="text-gray-500 text-lg mb-4">No buildings configured</p>
          <Link
            href="/admin/dashboard/buildings/new"
            className="inline-block px-6 py-3 bg-[#c5a44e] text-[#0a1628] font-semibold rounded-lg"
          >
            Add Your First Building
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {buildings.map((b) => (
            <div
              key={b.id}
              className="bg-white border border-gray-200 rounded-xl p-5 flex items-start justify-between shadow-sm"
            >
              <div className="flex-1">
                <h3 className="text-gray-900 font-semibold text-lg">{b.name}</h3>
                {b.address && (
                  <p className="text-gray-500 text-sm mt-1">{b.address}</p>
                )}
                <div className="flex gap-4 mt-3">
                  <span className="text-gray-500 text-xs bg-gray-100 px-3 py-1 rounded-full flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 10-16 0c0 3 2.7 6.9 8 11.7z"/></svg> {b.nodes?.length || 0} nodes
                  </span>
                  <span className="text-gray-500 text-xs bg-gray-100 px-3 py-1 rounded-full flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> {b.edges?.length || 0} edges
                  </span>
                  <span className="text-gray-500 text-xs bg-gray-100 px-3 py-1 rounded-full flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 20h20M4 20V8l8-5 8 5v12"/><path d="M9 20v-6h6v6"/></svg> {b.pois?.length || 0} departments
                  </span>
                </div>
              </div>

              <div className="flex gap-2 ml-4">
                <Link
                  href={`/admin/dashboard/buildings/${b.id}/editor`}
                  className="px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-400 text-sm transition-colors"
                >
                  Floor Plan Editor
                </Link>
                <Link
                  href={`/admin/dashboard/buildings/${b.id}`}
                  className="px-3 py-2 bg-[#c5a44e]/10 hover:bg-[#c5a44e]/20 border border-[#c5a44e]/30 rounded-lg text-[#c5a44e] text-sm transition-colors"
                >
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(b.id, b.name)}
                  className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
