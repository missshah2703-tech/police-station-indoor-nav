"use client";

import { useMemo } from "react";
import {
  MapContainer,
  ImageOverlay,
  Marker,
  Polyline,
  CircleMarker,
  Popup,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Floor } from "@/lib/types";
import { useSettings } from "@/context/SettingsContext";

interface Props {
  floor: Floor;
  /** Ordered node IDs forming the active route (null = no route) */
  route: string[] | null;
  /** Currently selected POI node ID */
  selectedPoi: string | null;
  onSelectPoi: (nodeId: string) => void;
  /** Live user position (x, y in floor coords) */
  livePosition?: { x: number; y: number } | null;
  /** Compass heading in degrees (0 = North) */
  liveHeading?: number | null;
  /** Position confidence 0–1 (affects accuracy ring size) */
  confidence?: number;
}

/** Custom div-icon for POI markers */
function createPoiIcon(icon: string, isSelected: boolean) {
  return L.divIcon({
    className: "",
    html: `<div style="
      font-size: 22px;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${isSelected ? "#1976d2" : "#ffffff"};
      color: ${isSelected ? "#fff" : "#333"};
      border: 3px solid ${isSelected ? "#0d47a1" : "#90a4ae"};
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      cursor: pointer;
      transition: all 0.2s;
    ">${icon}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

/**
 * Convert data coordinates (y-down / screen convention) to
 * Leaflet CRS.Simple (y-up). LatLng = [floorHeight - y, x]
 */
function toLatLng(
  node: { x: number; y: number },
  floorHeight: number
): L.LatLngExpression {
  return [floorHeight - node.y, node.x];
}

export default function MapView({
  floor,
  route,
  selectedPoi,
  onSelectPoi,
  livePosition,
  liveHeading,
  confidence = 1,
}: Props) {
  const { language } = useSettings();

  const nodeMap = useMemo(
    () => new Map(floor.nodes.map((n) => [n.id, n])),
    [floor]
  );

  const bounds: L.LatLngBoundsExpression = [
    [0, 0],
    [floor.height, floor.width],
  ];

  // Convert route node IDs → Leaflet positions
  const routeLatLngs = useMemo(() => {
    if (!route) return [];
    return route
      .map((id) => {
        const node = nodeMap.get(id);
        return node ? toLatLng(node, floor.height) : null;
      })
      .filter(Boolean) as L.LatLngExpression[];
  }, [route, nodeMap, floor.height]);

  return (
    <MapContainer
      crs={L.CRS.Simple}
      bounds={bounds}
      maxBounds={[
        [-50, -50],
        [floor.height + 50, floor.width + 50],
      ]}
      style={{ width: "100%", height: "100%" }}
      zoomSnap={0.25}
      minZoom={-1}
      maxZoom={3}
    >
      {/* Floor plan background */}
      <ImageOverlay url={floor.planImage} bounds={bounds} />

      {/* POI markers */}
      {floor.pois.map((poi) => {
        const node = nodeMap.get(poi.nodeId);
        if (!node) return null;
        return (
          <Marker
            key={poi.nodeId}
            position={toLatLng(node, floor.height)}
            icon={createPoiIcon(poi.icon, selectedPoi === poi.nodeId)}
            eventHandlers={{ click: () => onSelectPoi(poi.nodeId) }}
          >
            <Popup>
              <strong>{node.label[language] || node.label.en}</strong>
              <br />
              <span className="text-sm text-gray-600">
                {poi.description[language] || poi.description.en}
              </span>
            </Popup>
          </Marker>
        );
      })}

      {/* Route — Google Maps walking style */}
      {routeLatLngs.length > 1 && (
        <>
          {/* Shadow under route */}
          <Polyline
            positions={routeLatLngs}
            pathOptions={{
              color: "#000",
              weight: 9,
              opacity: 0.12,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
          {/* Solid blue path */}
          <Polyline
            positions={routeLatLngs}
            pathOptions={{
              color: "#4285F4",
              weight: 6,
              opacity: 1,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
          {/* Dotted white overlay (Google Maps walking dots) */}
          <Polyline
            positions={routeLatLngs}
            pathOptions={{
              color: "#ffffff",
              weight: 3,
              opacity: 0.9,
              dashArray: "2, 12",
              lineCap: "round",
            }}
          />

          {/* Start dot (green) */}
          <CircleMarker
            center={routeLatLngs[0]}
            radius={10}
            pathOptions={{
              fillColor: "#34A853",
              fillOpacity: 1,
              color: "#fff",
              weight: 3,
            }}
          />
          {/* Walking person icon at start */}
          <Marker
            position={routeLatLngs[0]}
            icon={L.divIcon({
              className: "",
              html: '<div style="font-size:20px;text-align:center;margin-top:-4px;">🚶</div>',
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            })}
            interactive={false}
          />

          {/* End dot (red) */}
          <CircleMarker
            center={routeLatLngs[routeLatLngs.length - 1]}
            radius={10}
            pathOptions={{
              fillColor: "#EA4335",
              fillOpacity: 1,
              color: "#fff",
              weight: 3,
            }}
          />
          {/* Destination flag at end */}
          <Marker
            position={routeLatLngs[routeLatLngs.length - 1]}
            icon={L.divIcon({
              className: "",
              html: '<div style="font-size:18px;text-align:center;margin-top:-4px;">📍</div>',
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            })}
            interactive={false}
          />
        </>
      )}

      {/* Live position blue dot (Google Maps style) */}
      {livePosition && (
        <>
          {/* Confidence/accuracy ring — larger when less confident */}
          <CircleMarker
            center={toLatLng(livePosition, floor.height)}
            radius={10 + Math.round((1 - confidence) * 25)}
            pathOptions={{
              fillColor: confidence > 0.6 ? "#4285F4" : confidence > 0.3 ? "#FBBC05" : "#EA4335",
              fillOpacity: 0.1,
              color: confidence > 0.6 ? "#4285F4" : confidence > 0.3 ? "#FBBC05" : "#EA4335",
              weight: 1,
              opacity: 0.25,
            }}
          />
          {/* Inner solid dot */}
          <CircleMarker
            center={toLatLng(livePosition, floor.height)}
            radius={8}
            pathOptions={{
              fillColor: "#4285F4",
              fillOpacity: 1,
              color: "#fff",
              weight: 3,
            }}
          />
          {/* Heading arrow */}
          <Marker
            position={toLatLng(livePosition, floor.height)}
            icon={L.divIcon({
              className: "",
              html: `<div style="
                width: 24px; height: 24px;
                display: flex; align-items: center; justify-content: center;
                transform: rotate(${liveHeading ?? 0}deg);
                filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
              ">
                <div style="
                  width: 0; height: 0;
                  border-left: 6px solid transparent;
                  border-right: 6px solid transparent;
                  border-bottom: 12px solid #4285F4;
                  margin-top: -18px;
                "></div>
              </div>`,
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
