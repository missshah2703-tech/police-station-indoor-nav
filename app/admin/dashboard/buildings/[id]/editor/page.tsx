"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";

interface Node {
  id: string;
  x: number;
  y: number;
  label?: string;
}

interface Edge {
  from: string;
  to: string;
  weight: number;
}

interface Building {
  id: string;
  name: string;
  floorPlanImage?: string;
  nodes: Node[];
  edges: Edge[];
  pois: { id: string; nodeId: string; name: string; type: string }[];
  scaleFactor: number;
  floors: { floorPlanImage: string; width: number; height: number }[];
}

type EditorMode = "select" | "add-node" | "add-edge" | "delete";

export default function FloorPlanEditorPage() {
  const router = useRouter();
  const params = useParams();
  const buildingId = params.id as string;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [building, setBuilding] = useState<Building | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [mode, setMode] = useState<EditorMode>("select");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [edgeStart, setEdgeStart] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [nodeCounter, setNodeCounter] = useState(1);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelText, setLabelText] = useState("");
  const [imageLoaded, setImageLoaded] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  // Canvas viewport
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const loadBuilding = useCallback(async () => {
    try {
      const res = await fetch(`/api/buildings/${buildingId}`);
      if (!res.ok) {
        router.push("/admin/dashboard/buildings");
        return;
      }
      const data: Building = await res.json();
      setBuilding(data);
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
      setNodeCounter(
        data.nodes?.length
          ? Math.max(...data.nodes.map((n) => {
              const num = parseInt(n.id.replace(/\D/g, ""));
              return isNaN(num) ? 0 : num;
            })) + 1
          : 1
      );

      // Load floor plan image
      const floorPlanUrl =
        data.floorPlanImage || data.floors?.[0]?.floorPlanImage;
      if (floorPlanUrl) {
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          imageRef.current = img;
          setImageLoaded(true);
        };
        img.src = floorPlanUrl;
      }
    } catch {
      router.push("/admin/dashboard/buildings");
    }
  }, [buildingId, router]);

  useEffect(() => {
    loadBuilding();
  }, [loadBuilding]);

  // ─── Canvas Rendering ───
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const container = containerRef.current;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // Draw floor plan image
    if (imageRef.current && imageLoaded) {
      ctx.drawImage(imageRef.current, 0, 0);
    } else {
      // Grid background
      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(0, 0, 1000, 800);
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 0.5;
      for (let x = 0; x < 1000; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 800);
        ctx.stroke();
      }
      for (let y = 0; y < 800; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(1000, y);
        ctx.stroke();
      }
    }

    // Draw edges
    edges.forEach((edge) => {
      const fromNode = nodes.find((n) => n.id === edge.from);
      const toNode = nodes.find((n) => n.id === edge.to);
      if (!fromNode || !toNode) return;

      const isSelected =
        selectedNode === edge.from || selectedNode === edge.to;

      ctx.beginPath();
      ctx.moveTo(fromNode.x, fromNode.y);
      ctx.lineTo(toNode.x, toNode.y);
      ctx.strokeStyle = isSelected ? "#c5a44e" : "#4a90d9";
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      // Weight label
      const mx = (fromNode.x + toNode.x) / 2;
      const my = (fromNode.y + toNode.y) / 2;
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.fillRect(mx - 12, my - 8, 24, 16);
      ctx.fillStyle = "#666";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(edge.weight.toFixed(0), mx, my);
    });

    // If in edge mode and start is set, draw preview line
    if (mode === "add-edge" && edgeStart) {
      const startNode = nodes.find((n) => n.id === edgeStart);
      if (startNode) {
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.moveTo(startNode.x, startNode.y);
        ctx.strokeStyle = "#c5a44e88";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw nodes
    nodes.forEach((node) => {
      const isSelected = selectedNode === node.id;
      const isEdgeStart = edgeStart === node.id;
      const hasPOI = building?.pois?.some((p) => p.nodeId === node.id);

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, isSelected ? 10 : 8, 0, Math.PI * 2);
      ctx.fillStyle = isEdgeStart
        ? "#c5a44e"
        : isSelected
        ? "#4a90d9"
        : hasPOI
        ? "#22c55e"
        : "#e2e8f0";
      ctx.fill();
      ctx.strokeStyle = isSelected || isEdgeStart ? "#374151" : "#6b7280";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      const label = node.label || node.id;
      ctx.fillStyle = "#374151";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(label, node.x, node.y - 12);
    });

    ctx.restore();

    // Mode indicator
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillRect(10, 10, 200, 30);
    ctx.fillStyle = mode === "add-node" ? "#22c55e" : mode === "add-edge" ? "#c5a44e" : mode === "delete" ? "#ef4444" : "#4a90d9";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `Mode: ${mode.toUpperCase()}${edgeStart ? ` (from ${edgeStart})` : ""}`,
      20,
      25
    );
  }, [nodes, edges, selectedNode, edgeStart, mode, scale, offset, imageLoaded, building?.pois]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  // ─── Mouse Handlers ───
  function canvasToWorld(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - offset.x) / scale,
      y: (clientY - rect.top - offset.y) / scale,
    };
  }

  function findNodeAt(wx: number, wy: number): Node | null {
    const threshold = 15 / scale;
    return (
      nodes.find(
        (n) => Math.abs(n.x - wx) < threshold && Math.abs(n.y - wy) < threshold
      ) || null
    );
  }

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x: wx, y: wy } = canvasToWorld(e.clientX, e.clientY);
    const node = findNodeAt(wx, wy);

    if (mode === "select") {
      if (node) {
        setSelectedNode(node.id);
        setDragging(node.id);
      } else {
        setSelectedNode(null);
      }
    } else if (mode === "add-node") {
      const id = `N${nodeCounter}`;
      setNodeCounter((c) => c + 1);
      const newNode: Node = { id, x: Math.round(wx), y: Math.round(wy) };
      setNodes((prev) => [...prev, newNode]);
      setSelectedNode(id);
    } else if (mode === "add-edge") {
      if (node) {
        if (!edgeStart) {
          setEdgeStart(node.id);
        } else if (edgeStart !== node.id) {
          // Check duplicate
          const exists = edges.some(
            (e) =>
              (e.from === edgeStart && e.to === node.id) ||
              (e.from === node.id && e.to === edgeStart)
          );
          if (!exists) {
            const fromNode = nodes.find((n) => n.id === edgeStart)!;
            const weight = Math.sqrt(
              Math.pow(fromNode.x - node.x, 2) +
                Math.pow(fromNode.y - node.y, 2)
            );
            setEdges((prev) => [
              ...prev,
              { from: edgeStart, to: node.id, weight: Math.round(weight) },
            ]);
          }
          setEdgeStart(null);
        }
      }
    } else if (mode === "delete") {
      if (node) {
        setNodes((prev) => prev.filter((n) => n.id !== node.id));
        setEdges((prev) =>
          prev.filter((e) => e.from !== node.id && e.to !== node.id)
        );
        setSelectedNode(null);
      } else {
        // Check if clicked on an edge
        for (const edge of edges) {
          const fromNode = nodes.find((n) => n.id === edge.from);
          const toNode = nodes.find((n) => n.id === edge.to);
          if (!fromNode || !toNode) continue;
          const dist = pointToLineDistance(wx, wy, fromNode.x, fromNode.y, toNode.x, toNode.y);
          if (dist < 10 / scale) {
            setEdges((prev) =>
              prev.filter((e) => !(e.from === edge.from && e.to === edge.to))
            );
            break;
          }
        }
      }
    }
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (dragging) {
      const { x: wx, y: wy } = canvasToWorld(e.clientX, e.clientY);
      setNodes((prev) =>
        prev.map((n) =>
          n.id === dragging ? { ...n, x: Math.round(wx), y: Math.round(wy) } : n
        )
      );
      // Update edge weights
      setEdges((prev) =>
        prev.map((edge) => {
          if (edge.from !== dragging && edge.to !== dragging) return edge;
          const from = nodes.find((n) => n.id === edge.from);
          const to = nodes.find((n) => n.id === edge.to);
          if (!from || !to) return edge;
          const fx = edge.from === dragging ? Math.round(wx) : from.x;
          const fy = edge.from === dragging ? Math.round(wy) : from.y;
          const tx = edge.to === dragging ? Math.round(wx) : to.x;
          const ty = edge.to === dragging ? Math.round(wy) : to.y;
          return {
            ...edge,
            weight: Math.round(Math.sqrt(Math.pow(fx - tx, 2) + Math.pow(fy - ty, 2))),
          };
        })
      );
    }
  }

  function handleCanvasMouseUp() {
    setDragging(null);
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.max(0.2, Math.min(5, s * delta)));
  }

  // ─── Auto-generate edges ───
  function autoGenerateEdges() {
    if (nodes.length < 2) return;
    const maxDist = 150; // Max pixel distance for auto-linking
    const newEdges: Edge[] = [];

    for (let i = 0; i < nodes.length; i++) {
      // Find nearest nodes
      const distances = nodes
        .map((n, j) => ({
          id: n.id,
          dist: Math.sqrt(
            Math.pow(nodes[i].x - n.x, 2) + Math.pow(nodes[i].y - n.y, 2)
          ),
          idx: j,
        }))
        .filter((d) => d.idx !== i && d.dist < maxDist)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 3); // Max 3 nearest neighbors

      for (const d of distances) {
        const exists = newEdges.some(
          (e) =>
            (e.from === nodes[i].id && e.to === d.id) ||
            (e.from === d.id && e.to === nodes[i].id)
        );
        if (!exists) {
          newEdges.push({
            from: nodes[i].id,
            to: d.id,
            weight: Math.round(d.dist),
          });
        }
      }
    }

    setEdges(newEdges);
    setMessage(`Auto-generated ${newEdges.length} edges`);
  }

  // ─── Save ───
  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/buildings/${buildingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      });
      if (res.ok) {
        setMessage("Saved successfully!");
      } else {
        setMessage("Failed to save");
      }
    } catch {
      setMessage("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // ─── Label editing ───
  function handleEditLabel() {
    if (!selectedNode) return;
    const node = nodes.find((n) => n.id === selectedNode);
    if (node) {
      setLabelText(node.label || node.id);
      setEditingLabel(selectedNode);
    }
  }

  function handleSaveLabel() {
    if (!editingLabel) return;
    setNodes((prev) =>
      prev.map((n) =>
        n.id === editingLabel ? { ...n, label: labelText || n.id } : n
      )
    );
    setEditingLabel(null);
    setLabelText("");
  }

  if (!building) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-[#c5a44e] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-gray-500 text-sm mr-2">Mode:</span>
        {(
          [
            { key: "select", label: "Select / Move", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>, color: "blue" },
            { key: "add-node", label: "Add Node", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>, color: "green" },
            { key: "add-edge", label: "Add Edge", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>, color: "yellow" },
            { key: "delete", label: "Delete", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>, color: "red" },
          ] as const
        ).map((m) => (
          <button
            key={m.key}
            onClick={() => {
              setMode(m.key);
              setEdgeStart(null);
              setSelectedNode(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === m.key
                ? m.color === "blue"
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                  : m.color === "green"
                  ? "bg-green-500/20 text-green-400 border border-green-500/40"
                  : m.color === "yellow"
                  ? "bg-[#c5a44e]/20 text-[#c5a44e] border border-[#c5a44e]/40"
                  : "bg-red-500/20 text-red-400 border border-red-500/40"
                : "bg-gray-100 text-gray-500 hover:text-gray-900 border border-transparent"
            }`}
          >
          {m.icon} {m.label}
          </button>
        ))}

        <div className="flex-1" />

        <button
          onClick={autoGenerateEdges}
          className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-lg text-purple-500 text-sm"
          title="Auto-connect nearby nodes"
        >Auto-Connect</button>

        {selectedNode && (
          <button
            onClick={handleEditLabel}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 text-sm"
          >Rename Node</button>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 bg-[#c5a44e] hover:bg-[#d4b55f] text-[#0a1628] font-semibold rounded-lg text-sm disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>

        <button
          onClick={() => router.push(`/admin/dashboard/buildings/${buildingId}`)}
          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 text-sm"
        >
          ← Back
        </button>
      </div>

      {message && (
        <div className={`mb-2 px-3 py-2 rounded text-sm ${
          message.includes("success") || message.includes("Auto")
            ? "bg-green-50 text-green-600"
            : "bg-red-50 text-red-600"
        }`}>
          {message}
        </div>
      )}

      {/* Label edit modal */}
      {editingLabel && (
        <div className="mb-2 flex items-center gap-2 bg-white border border-gray-200 p-2 rounded-lg shadow-sm">
          <span className="text-gray-500 text-sm">Label:</span>
          <input
            value={labelText}
            onChange={(e) => setLabelText(e.target.value)}
            className="px-2 py-1 bg-gray-50 border border-gray-200 rounded text-gray-900 text-sm flex-1"
            maxLength={50}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSaveLabel()}
          />
          <button
            onClick={handleSaveLabel}
            className="px-3 py-1 bg-[#c5a44e] text-[#0a1628] rounded text-sm font-bold"
          >
            Save
          </button>
          <button
            onClick={() => setEditingLabel(null)}
            className="px-3 py-1 bg-gray-100 text-gray-500 rounded text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Info bar */}
      <div className="flex items-center gap-4 mb-2 text-gray-500 text-xs">
        <span className="flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 10-16 0c0 3 2.7 6.9 8 11.7z"/></svg> {nodes.length} nodes</span>
        <span className="flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> {edges.length} edges</span>
        <span className="flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg> Zoom: {(scale * 100).toFixed(0)}%</span>
        {selectedNode && (
          <span className="text-blue-400">
            Selected: {nodes.find((n) => n.id === selectedNode)?.label || selectedNode}
          </span>
        )}
        <span className="ml-auto text-gray-600">
          Scroll to zoom · Click to {mode === "select" ? "select/drag" : mode === "add-node" ? "place node" : mode === "add-edge" ? "connect nodes" : "delete"}
        </span>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 bg-gray-100 border border-gray-200 rounded-xl overflow-hidden cursor-crosshair relative shadow-sm"
      >
        {!building.floorPlanImage && !building.floors?.[0]?.floorPlanImage && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="text-center">
              <p className="text-gray-500 text-lg mb-2">No floor plan uploaded</p>
              <p className="text-gray-600 text-sm">
                Upload a floor plan image first, or place nodes on the grid
              </p>
            </div>
          </div>
        )}
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onWheel={handleWheel}
          className="w-full h-full"
        />
      </div>
    </div>
  );
}

// ─── Utils ───
function pointToLineDistance(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number
): number {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = lenSq !== 0 ? dot / lenSq : -1;
  if (param < 0) param = 0;
  if (param > 1) param = 1;
  const xx = x1 + param * C;
  const yy = y1 + param * D;
  return Math.sqrt(Math.pow(px - xx, 2) + Math.pow(py - yy, 2));
}
