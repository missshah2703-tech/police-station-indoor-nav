"use client";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function NewBuildingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/buildings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      router.push(`/admin/dashboard/buildings/${data.id}`);
    } catch {
      setError("Failed to create building");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-gray-900 text-xl font-semibold mb-6">
        Add New Building / Location
      </h2>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-gray-200 rounded-xl p-6 space-y-5 shadow-sm"
      >
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-gray-600 text-sm mb-2">
            Building / Location Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-[#c5a44e] transition-colors"
            placeholder="e.g., Dubai Police HQ Station"
            required
            maxLength={200}
          />
        </div>

        <div>
          <label className="block text-gray-600 text-sm mb-2">
            Address (optional)
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-[#c5a44e] transition-colors"
            placeholder="e.g., Al Twar, Dubai, UAE"
            maxLength={500}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-[#c5a44e] hover:bg-[#d4b55f] text-[#0a1628] font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Building"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>

      <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
        <h3 className="text-blue-500 font-medium mb-2">Next Steps</h3>
        <ol className="list-decimal list-inside text-gray-500 text-sm space-y-1">
          <li>Create the building entry</li>
          <li>Upload a floor plan image</li>
          <li>Open the Floor Plan Editor to place navigation nodes</li>
          <li>Add departments/POIs to the nodes</li>
          <li>Generate QR code and print it</li>
        </ol>
      </div>
    </div>
  );
}
