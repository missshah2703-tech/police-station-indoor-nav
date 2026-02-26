"use client";
import { useEffect, useState, FormEvent, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

interface POI {
  id: string;
  nodeId: string;
  name: string;
  nameAr?: string;
  nameHi?: string;
  type: string;
  icon?: string;
  description?: string;
}

interface Building {
  id: string;
  name: string;
  nameAr?: string;
  nameHi?: string;
  address?: string;
  floorPlanImage?: string;
  nodes: { id: string; x: number; y: number; label?: string }[];
  edges: { from: string; to: string; weight: number }[];
  pois: POI[];
  scaleFactor: number;
  floors: { id: string; name: string; floorPlanImage: string; width: number; height: number }[];
}

export default function EditBuildingPage() {
  const router = useRouter();
  const params = useParams();
  const buildingId = params.id as string;

  const [building, setBuilding] = useState<Building | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  // Form fields
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameHi, setNameHi] = useState("");
  const [address, setAddress] = useState("");
  const [scaleFactor, setScaleFactor] = useState(10);

  // Department management
  const [showAddDept, setShowAddDept] = useState(false);
  const [deptName, setDeptName] = useState("");
  const [deptNameAr, setDeptNameAr] = useState("");
  const [deptType, setDeptType] = useState("department");
  const [deptNodeId, setDeptNodeId] = useState("");
  const [editingPOI, setEditingPOI] = useState<string | null>(null);

  const loadBuilding = useCallback(async () => {
    try {
      const res = await fetch(`/api/buildings/${buildingId}`);
      if (!res.ok) {
        router.push("/admin/dashboard/buildings");
        return;
      }
      const data = await res.json();
      setBuilding(data);
      setName(data.name || "");
      setNameAr(data.nameAr || "");
      setNameHi(data.nameHi || "");
      setAddress(data.address || "");
      setScaleFactor(data.scaleFactor || 10);
    } catch {
      router.push("/admin/dashboard/buildings");
    } finally {
      setLoading(false);
    }
  }, [buildingId, router]);

  useEffect(() => {
    loadBuilding();
  }, [loadBuilding]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/buildings/${buildingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, nameAr, nameHi, address, scaleFactor }),
      });
      if (res.ok) {
        setMessage("Saved successfully!");
        loadBuilding();
      }
    } catch {
      setMessage("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("floorPlan", file);
      const res = await fetch(`/api/buildings/${buildingId}/upload`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (res.ok) {
        setMessage("Floor plan uploaded!");
        loadBuilding();
      } else {
        setMessage(data.error || "Upload failed");
      }
    } catch {
      setMessage("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleAddDepartment(e: FormEvent) {
    e.preventDefault();
    if (!building || !deptName || !deptNodeId) return;

    const newPOI: POI = {
      id: `poi-${Date.now()}`,
      nodeId: deptNodeId,
      name: deptName,
      nameAr: deptNameAr,
      type: deptType,
      icon: deptType === "department" ? "dept" : deptType === "service" ? "svc" : "poi",
    };

    const updatedPois = [...building.pois, newPOI];
    const res = await fetch(`/api/buildings/${buildingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pois: updatedPois }),
    });
    if (res.ok) {
      setDeptName("");
      setDeptNameAr("");
      setDeptNodeId("");
      setShowAddDept(false);
      loadBuilding();
    }
  }

  async function handleDeleteDepartment(poiId: string) {
    if (!building) return;
    if (!confirm("Delete this department?")) return;

    const updatedPois = building.pois.filter((p) => p.id !== poiId);
    const res = await fetch(`/api/buildings/${buildingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pois: updatedPois }),
    });
    if (res.ok) loadBuilding();
  }

  async function handleUpdateDepartment(poi: POI) {
    if (!building) return;
    const updatedPois = building.pois.map((p) => (p.id === poi.id ? poi : p));
    const res = await fetch(`/api/buildings/${buildingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pois: updatedPois }),
    });
    if (res.ok) {
      setEditingPOI(null);
      loadBuilding();
    }
  }

  if (loading || !building) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-[#c5a44e] border-t-transparent rounded-full" />
      </div>
    );
  }

  const deptTypes = [
    { value: "department", label: "Department" },
    { value: "service", label: "Service Counter" },
    { value: "office", label: "Office" },
    { value: "entrance", label: "Entrance" },
    { value: "elevator", label: "Elevator / Stairs" },
    { value: "restroom", label: "Restroom" },
    { value: "other", label: "Other" },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-gray-900 text-xl font-semibold">{building.name}</h2>
          <p className="text-gray-500 text-sm mt-1">Building ID: {building.id}</p>
        </div>
        <Link
          href={`/admin/dashboard/buildings/${buildingId}/editor`}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors text-sm"
        >
          Open Floor Plan Editor
        </Link>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.includes("success") || message.includes("uploaded")
            ? "bg-green-50 border border-green-200 text-green-600"
            : "bg-red-50 border border-red-200 text-red-600"
        }`}>
          {message}
        </div>
      )}

      {/* Basic Info */}
      <form
        onSubmit={handleSave}
        className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 shadow-sm"
      >
        <h3 className="text-gray-900 font-semibold mb-2">Building Information</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-600 text-sm mb-1">Name (English) *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-[#c5a44e]"
              required
              maxLength={200}
            />
          </div>
          <div>
            <label className="block text-gray-600 text-sm mb-1">Name (Arabic)</label>
            <input
              type="text"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-[#c5a44e]"
              dir="rtl"
              maxLength={200}
            />
          </div>
          <div>
            <label className="block text-gray-600 text-sm mb-1">Name (Hindi)</label>
            <input
              type="text"
              value={nameHi}
              onChange={(e) => setNameHi(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-[#c5a44e]"
              maxLength={200}
            />
          </div>
          <div>
            <label className="block text-gray-600 text-sm mb-1">Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-[#c5a44e]"
              maxLength={500}
            />
          </div>
          <div>
            <label className="block text-gray-600 text-sm mb-1">Scale Factor (px per meter)</label>
            <input
              type="number"
              value={scaleFactor}
              onChange={(e) => setScaleFactor(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-[#c5a44e]"
              min={1}
              max={100}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 bg-[#c5a44e] hover:bg-[#d4b55f] text-[#0a1628] font-semibold rounded-lg transition-colors disabled:opacity-50 text-sm"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>

      {/* Floor Plan Upload */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-gray-900 font-semibold mb-4">Floor Plan</h3>

        {building.floorPlanImage && (
          <div className="mb-4 bg-gray-50 rounded-lg p-3 inline-block">
            <Image
              src={building.floorPlanImage}
              alt="Floor Plan"
              width={400}
              height={300}
              className="rounded"
              style={{ maxWidth: "100%", height: "auto" }}
            />
          </div>
        )}

        <div className="flex items-center gap-4">
          <label className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg cursor-pointer transition-colors text-sm">
            {uploading ? "Uploading..." : building.floorPlanImage ? "Replace Floor Plan" : "Upload Floor Plan"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
          <span className="text-gray-500 text-xs">PNG, JPG, WebP, SVG (max 10MB)</span>
        </div>

        <div className="mt-3 flex gap-4 text-gray-500 text-xs">
          <span className="flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 10-16 0c0 3 2.7 6.9 8 11.7z"/></svg> {building.nodes.length} nodes</span>
          <span className="flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> {building.edges.length} edges</span>
        </div>
      </div>

      {/* Departments / POIs */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-gray-900 font-semibold">
            Departments & Points of Interest ({building.pois.length})
          </h3>
          <button
            onClick={() => setShowAddDept(!showAddDept)}
            className="px-3 py-1.5 bg-[#c5a44e]/10 hover:bg-[#c5a44e]/20 border border-[#c5a44e]/30 rounded-lg text-[#c5a44e] text-sm transition-colors"
          >
            {showAddDept ? "Cancel" : "+ Add Department"}
          </button>
        </div>

        {/* Add Department Form */}
        {showAddDept && (
          <form
            onSubmit={handleAddDepartment}
            className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-500 text-xs mb-1">Name (English) *</label>
                <input
                  type="text"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-gray-900 text-sm focus:outline-none focus:border-[#c5a44e]"
                  required
                  maxLength={100}
                />
              </div>
              <div>
                <label className="block text-gray-500 text-xs mb-1">Name (Arabic)</label>
                <input
                  type="text"
                  value={deptNameAr}
                  onChange={(e) => setDeptNameAr(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-gray-900 text-sm focus:outline-none focus:border-[#c5a44e]"
                  dir="rtl"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="block text-gray-500 text-xs mb-1">Type *</label>
                <select
                  value={deptType}
                  onChange={(e) => setDeptType(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-gray-900 text-sm focus:outline-none focus:border-[#c5a44e]"
                >
                  {deptTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-500 text-xs mb-1">Linked Node *</label>
                <select
                  value={deptNodeId}
                  onChange={(e) => setDeptNodeId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-gray-900 text-sm focus:outline-none focus:border-[#c5a44e]"
                  required
                >
                  <option value="">Select a node...</option>
                  {building.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label || n.id} ({Math.round(n.x)}, {Math.round(n.y)})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-[#c5a44e] text-[#0a1628] font-semibold rounded text-sm"
            >
              Add Department
            </button>
          </form>
        )}

        {/* Department List */}
        {building.pois.length === 0 ? (
          <p className="text-gray-500 text-center py-6">
            No departments added yet. Add nodes in the Floor Plan Editor first, then add departments here.
          </p>
        ) : (
          <div className="space-y-2">
            {building.pois.map((poi) => (
              <div
                key={poi.id}
                className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
              >
                {editingPOI === poi.id ? (
                  <EditPOIRow
                    poi={poi}
                    nodes={building.nodes}
                    deptTypes={deptTypes}
                    onSave={handleUpdateDepartment}
                    onCancel={() => setEditingPOI(null)}
                  />
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        {poi.icon === "dept" || poi.type === "department" ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c5a44e" strokeWidth="2"><path d="M2 20h20M4 20V8l8-5 8 5v12"/><path d="M9 20v-6h6v6"/></svg>
                        ) : poi.icon === "svc" || poi.type === "service" ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 10-16 0c0 3 2.7 6.9 8 11.7z"/></svg>
                        )}
                      </span>
                      <div>
                        <p className="text-gray-900 text-sm font-medium">{poi.name}</p>
                        <p className="text-gray-500 text-xs">
                          {poi.type} · Node: {poi.nodeId}
                          {poi.nameAr && ` · ${poi.nameAr}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingPOI(poi.id)}
                        className="px-2 py-1 text-[#c5a44e] hover:bg-[#c5a44e]/10 rounded text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteDepartment(poi.id)}
                        className="px-2 py-1 text-red-400 hover:bg-red-500/10 rounded text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Inline edit row for departments
function EditPOIRow({
  poi,
  nodes,
  deptTypes,
  onSave,
  onCancel,
}: {
  poi: POI;
  nodes: { id: string; x: number; y: number; label?: string }[];
  deptTypes: { value: string; label: string }[];
  onSave: (poi: POI) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(poi.name);
  const [nameAr, setNameAr] = useState(poi.nameAr || "");
  const [type, setType] = useState(poi.type);
  const [nodeId, setNodeId] = useState(poi.nodeId);

  return (
    <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="px-2 py-1 bg-white border border-gray-200 rounded text-gray-900 text-sm"
        maxLength={100}
      />
      <input
        value={nameAr}
        onChange={(e) => setNameAr(e.target.value)}
        className="px-2 py-1 bg-white border border-gray-200 rounded text-gray-900 text-sm"
        dir="rtl"
        placeholder="Arabic"
        maxLength={100}
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="px-2 py-1 bg-white border border-gray-200 rounded text-gray-900 text-sm"
      >
        {deptTypes.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <div className="flex gap-1">
        <select
          value={nodeId}
          onChange={(e) => setNodeId(e.target.value)}
          className="flex-1 px-2 py-1 bg-white border border-gray-200 rounded text-gray-900 text-xs"
        >
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>{n.label || n.id}</option>
          ))}
        </select>
        <button
          onClick={() => onSave({ ...poi, name, nameAr, type, nodeId })}
          className="px-2 py-1 bg-[#c5a44e] text-[#0a1628] rounded text-xs font-bold"
        >
          ✓
        </button>
        <button
          onClick={onCancel}
          className="px-2 py-1 bg-gray-100 text-gray-500 rounded text-xs"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
