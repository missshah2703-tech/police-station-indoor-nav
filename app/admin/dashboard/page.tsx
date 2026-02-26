"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface BuildingSummary {
  id: string;
  name: string;
  nodes: { id: string }[];
  edges: { from: string; to: string }[];
  pois: { id: string }[];
}

export default function DashboardPage() {
  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/buildings")
      .then((r) => r.json())
      .then((data) => setBuildings(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalNodes = buildings.reduce((s, b) => s + (b.nodes?.length || 0), 0);
  const totalPOIs = buildings.reduce((s, b) => s + (b.pois?.length || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-[#c5a44e] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Buildings", value: buildings.length, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 21h18M5 21V7l8-4v18M13 21V3l6 4v14"/><path d="M9 9h1M9 13h1M15 9h1M15 13h1"/></svg>, color: "from-blue-500/20 to-blue-600/10" },
          { label: "Navigation Nodes", value: totalNodes, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 10-16 0c0 3 2.7 6.9 8 11.7z"/></svg>, color: "from-green-500/20 to-green-600/10" },
          { label: "Departments / POI", value: totalPOIs, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 20h20M4 20V8l8-5 8 5v12"/><path d="M9 20v-6h6v6M9 12h6"/></svg>, color: "from-purple-500/20 to-purple-600/10" },
          { label: "QR Codes Ready", value: buildings.length, icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><path d="M21 14h-3v3h3M21 19v2h-2"/></svg>, color: "from-[#c5a44e]/20 to-[#c5a44e]/10" },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`bg-gradient-to-br ${stat.color} border border-gray-200 rounded-xl p-5 shadow-sm`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{stat.icon}</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-gray-500 text-sm mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-gray-900 font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/admin/dashboard/buildings/new"
            className="flex items-center gap-3 px-4 py-3 bg-[#c5a44e]/10 hover:bg-[#c5a44e]/20 border border-[#c5a44e]/30 rounded-lg text-[#c5a44e] transition-colors"
          >
            <span className="text-xl">+</span>
            <span className="font-medium">Add New Building</span>
          </Link>
          <Link
            href="/admin/dashboard/qr-codes"
            className="flex items-center gap-3 px-4 py-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-400 transition-colors"
          >
            <span className="text-xl"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><path d="M21 14h-3v3h3M21 19v2h-2"/></svg></span>
            <span className="font-medium">Generate QR Codes</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-3 px-4 py-3 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 transition-colors"
          >
            <span className="text-xl"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></span>
            <span className="font-medium">View User App</span>
          </Link>
        </div>
      </div>

      {/* Recent Buildings */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-gray-900 font-semibold">Buildings</h2>
          <Link
            href="/admin/dashboard/buildings"
            className="text-[#c5a44e] text-sm hover:underline"
          >
            View All →
          </Link>
        </div>
        {buildings.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No buildings yet. Add your first building to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {buildings.slice(0, 5).map((b) => (
              <Link
                key={b.id}
                href={`/admin/dashboard/buildings/${b.id}`}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div>
                  <p className="text-gray-900 font-medium">{b.name}</p>
                  <p className="text-gray-500 text-sm">
                    {b.nodes?.length || 0} nodes · {b.pois?.length || 0} departments
                  </p>
                </div>
                <span className="text-gray-500">→</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
