"use client";

import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Floor } from "@/lib/types";
import { useSettings } from "@/context/SettingsContext";

// Building GPS center — Dubai, Building 205 area
// Each floor-plan pixel ≈ 0.000012° (roughly 1.3m per pixel at this latitude)
const BUILDING_CENTER: [number, number] = [25.2764, 55.3735];
const PIXEL_TO_DEG = 0.000012;

interface Props {
  floor: Floor;
  route: string[] | null;
  selectedPoi: string | null;
  onSelectPoi: (nodeId: string) => void;
}

/** Convert floor plan pixel coords to GPS lat/lng */
function pixelToGps(
  x: number,
  y: number,
  floorWidth: number,
  floorHeight: number
): [number, number] {
  const offsetX = x - floorWidth / 2;
  const offsetY = -(y - floorHeight / 2); // invert Y (map Y goes up, pixel Y goes down)
  return [
    BUILDING_CENTER[0] + offsetY * PIXEL_TO_DEG,
    BUILDING_CENTER[1] + offsetX * PIXEL_TO_DEG,
  ];
}

/** Custom POI icon */
function createPoiIcon(icon: string, isSelected: boolean) {
  return L.divIcon({
    className: "",
    html: `<div style="
      font-size: 18px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${isSelected ? "#4285F4" : "#ffffff"};
      color: ${isSelected ? "#fff" : "#333"};
      border: 3px solid ${isSelected ? "#1a73e8" : "#dadce0"};
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      cursor: pointer;
    ">${icon}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

/** Fit map to route bounds */
function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
    } else if (positions.length === 1) {
      map.setView(positions[0], 18);
    }
  }, [map, positions]);
  return null;
}

export default function RealMapView({
  floor,
  route,
  selectedPoi,
  onSelectPoi,
}: Props) {
  const { language } = useSettings();
  const [mapReady, setMapReady] = useState(false);

  const nodeMap = new Map(floor.nodes.map((n) => [n.id, n]));

  // Convert route to GPS positions
  const routePositions: [number, number][] = (route || [])
    .map((id) => {
      const node = nodeMap.get(id);
      return node
        ? pixelToGps(node.x, node.y, floor.width, floor.height)
        : null;
    })
    .filter(Boolean) as [number, number][];

  // All POI GPS positions for bounds
  const poiPositions: [number, number][] = floor.pois
    .map((poi) => {
      const node = nodeMap.get(poi.nodeId);
      return node
        ? pixelToGps(node.x, node.y, floor.width, floor.height)
        : null;
    })
    .filter(Boolean) as [number, number][];

  const boundsPositions =
    routePositions.length > 0 ? routePositions : poiPositions;

  return (
    <MapContainer
      center={BUILDING_CENTER}
      zoom={18}
      style={{ width: "100%", height: "100%" }}
      zoomControl={false}
      attributionControl={false}
      whenReady={() => setMapReady(true)}
    >
      {/* Google Maps-style tiles from OpenStreetMap */}
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={20}
      />

      {/* Fit to route bounds */}
      {boundsPositions.length > 0 && (
        <FitBounds positions={boundsPositions} />
      )}

      {/* POI markers */}
      {floor.pois.map((poi) => {
        const node = nodeMap.get(poi.nodeId);
        if (!node) return null;
        const pos = pixelToGps(node.x, node.y, floor.width, floor.height);
        return (
          <Marker
            key={poi.nodeId}
            position={pos}
            icon={createPoiIcon(poi.icon, selectedPoi === poi.nodeId)}
            eventHandlers={{ click: () => onSelectPoi(poi.nodeId) }}
          >
            <Popup>
              <strong>{node.label[language] || node.label.en}</strong>
              <br />
              <span style={{ fontSize: "12px", color: "#666" }}>
                {poi.description[language] || poi.description.en}
              </span>
            </Popup>
          </Marker>
        );
      })}

      {/* Walking route */}
      {routePositions.length > 1 && (
        <>
          {/* Shadow */}
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: "#000",
              weight: 9,
              opacity: 0.12,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
          {/* Blue path */}
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: "#4285F4",
              weight: 6,
              opacity: 1,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
          {/* Walking dots */}
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: "#ffffff",
              weight: 3,
              opacity: 0.9,
              dashArray: "2, 12",
              lineCap: "round",
            }}
          />

          {/* Start marker (green) */}
          <CircleMarker
            center={routePositions[0]}
            radius={10}
            pathOptions={{
              fillColor: "#34A853",
              fillOpacity: 1,
              color: "#fff",
              weight: 3,
            }}
          />
          <Marker
            position={routePositions[0]}
            icon={L.divIcon({
              className: "",
              html: '<div style="font-size:18px;text-align:center;">🚶</div>',
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            })}
            interactive={false}
          />

          {/* End marker (red) */}
          <CircleMarker
            center={routePositions[routePositions.length - 1]}
            radius={10}
            pathOptions={{
              fillColor: "#EA4335",
              fillOpacity: 1,
              color: "#fff",
              weight: 3,
            }}
          />
          <Marker
            position={routePositions[routePositions.length - 1]}
            icon={L.divIcon({
              className: "",
              html: '<div style="font-size:18px;text-align:center;">📍</div>',
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            })}
            interactive={false}
          />
        </>
      )}
    </MapContainer>
  );
}
