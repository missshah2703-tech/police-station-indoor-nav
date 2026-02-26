"use client";

import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  GroundOverlay,
  Polyline,
  Marker,
  OverlayView,
} from "@react-google-maps/api";
import { Floor } from "@/lib/types";
import { useSettings } from "@/context/SettingsContext";

/* ------------------------------------------------------------------ */
/*  GPS mapping config                                                 */
/* ------------------------------------------------------------------ */

/**
 * Center GPS of the building — from Immersal scan.
 * Adjust these if you scan a different building.
 */
const BUILDING_CENTER = { lat: 25.2642437, lng: 55.3851608 };

/**
 * Approximate meters-per-pixel for the floor plan.
 * office-205 floor plan: 817×737 px, scaleFactor ≈ 10 → 1 px = 0.1 m
 * demo floor plan: 1407×1135 px, scaleFactor 10 → 1 px = 0.1 m
 */
const METERS_PER_PIXEL = 0.1;

/** At Dubai's latitude, these are the meter-to-degree conversion factors */
const LAT_DEG_PER_METER = 1 / 110574;
const LNG_DEG_PER_METER = 1 / (110574 * Math.cos((BUILDING_CENTER.lat * Math.PI) / 180));

/* ------------------------------------------------------------------ */
/*  Coordinate helpers                                                 */
/* ------------------------------------------------------------------ */

/** Convert floor-plan pixel (x, y) to GPS {lat, lng} */
function pixelToGps(
  x: number,
  y: number,
  floorWidth: number,
  floorHeight: number
): { lat: number; lng: number } {
  const offsetXm = (x - floorWidth / 2) * METERS_PER_PIXEL;
  const offsetYm = -(y - floorHeight / 2) * METERS_PER_PIXEL; // invert Y
  return {
    lat: BUILDING_CENTER.lat + offsetYm * LAT_DEG_PER_METER,
    lng: BUILDING_CENTER.lng + offsetXm * LNG_DEG_PER_METER,
  };
}

/** Compute GroundOverlay bounds from floor dimensions */
function getFloorBounds(
  floorWidth: number,
  floorHeight: number
): google.maps.LatLngBoundsLiteral {
  const sw = pixelToGps(0, floorHeight, floorWidth, floorHeight); // bottom-left
  const ne = pixelToGps(floorWidth, 0, floorWidth, floorHeight); // top-right
  return { south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng };
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  floor: Floor;
  route: string[] | null;
  selectedPoi: string | null;
  onSelectPoi: (nodeId: string) => void;
  livePosition?: { x: number; y: number } | null;
  liveHeading?: number | null;
  confidence?: number;
  autoFollow?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Map styles — subtle, lets floor plan stand out                     */
/* ------------------------------------------------------------------ */

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

const containerStyle = { width: "100%", height: "100%" };

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function GoogleMapView({
  floor,
  route,
  selectedPoi,
  onSelectPoi,
  livePosition,
  liveHeading,
  confidence = 1,
  autoFollow = false,
}: Props) {
  const { language } = useSettings();
  const mapRef = useRef<google.maps.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  });

  const nodeMap = useMemo(
    () => new Map(floor.nodes.map((n) => [n.id, n])),
    [floor]
  );

  const floorBounds = useMemo(
    () => getFloorBounds(floor.width, floor.height),
    [floor.width, floor.height]
  );

  /* ── Route as GPS path ── */
  const routePath = useMemo(() => {
    if (!route) return [];
    return route
      .map((id) => {
        const node = nodeMap.get(id);
        return node ? pixelToGps(node.x, node.y, floor.width, floor.height) : null;
      })
      .filter(Boolean) as { lat: number; lng: number }[];
  }, [route, nodeMap, floor.width, floor.height]);

  /* ── Auto-follow live position ── */
  useEffect(() => {
    if (!autoFollow || !livePosition || !mapRef.current) return;
    const gps = pixelToGps(livePosition.x, livePosition.y, floor.width, floor.height);
    mapRef.current.panTo(gps);
  }, [autoFollow, livePosition, floor.width, floor.height]);

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    setMapLoaded(true);
  }, []);

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900">
        <div className="text-white animate-pulse">Loading Google Maps...</div>
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={BUILDING_CENTER}
      zoom={19}
      onLoad={onLoad}
      options={{
        mapTypeId: "satellite",
        styles: MAP_STYLES,
        disableDefaultUI: true,
        zoomControl: true,
        tilt: 0,
        maxZoom: 22,
        minZoom: 16,
        gestureHandling: "greedy",
      }}
    >
      {/* Floor plan image overlay */}
      <GroundOverlay
        url={floor.planImage}
        bounds={floorBounds}
        options={{ opacity: 0.85 }}
      />

      {/* Walking route — shadow */}
      {routePath.length > 1 && (
        <>
          <Polyline
            path={routePath}
            options={{
              strokeColor: "#000000",
              strokeWeight: 9,
              strokeOpacity: 0.15,
            }}
          />
          {/* Main blue path */}
          <Polyline
            path={routePath}
            options={{
              strokeColor: "#4285F4",
              strokeWeight: 6,
              strokeOpacity: 1,
            }}
          />
          {/* Walking dots overlay */}
          <Polyline
            path={routePath}
            options={{
              strokeColor: "#ffffff",
              strokeWeight: 3,
              strokeOpacity: 0.9,
              icons: [
                {
                  icon: { path: google.maps.SymbolPath.CIRCLE, scale: 2, fillOpacity: 1, fillColor: "#fff", strokeWeight: 0 },
                  offset: "0",
                  repeat: "12px",
                },
              ],
            }}
          />
        </>
      )}

      {/* Start marker (green) */}
      {routePath.length > 1 && (
        <OverlayView
          position={routePath[0]}
          mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
        >
          <div className="w-6 h-6 rounded-full bg-green-500 border-2 border-white shadow-lg flex items-center justify-center text-xs">
            🚶
          </div>
        </OverlayView>
      )}

      {/* End marker (red) */}
      {routePath.length > 1 && (
        <OverlayView
          position={routePath[routePath.length - 1]}
          mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
        >
          <div className="w-6 h-6 rounded-full bg-red-500 border-2 border-white shadow-lg flex items-center justify-center text-xs">
            📍
          </div>
        </OverlayView>
      )}

      {/* POI markers */}
      {floor.pois.map((poi) => {
        const node = nodeMap.get(poi.nodeId);
        if (!node) return null;
        const pos = pixelToGps(node.x, node.y, floor.width, floor.height);
        const isSelected = selectedPoi === poi.nodeId;
        return (
          <OverlayView
            key={poi.nodeId}
            position={pos}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <div
              onClick={() => onSelectPoi(poi.nodeId)}
              title={node.label[language] || node.label.en}
              className={`
                w-10 h-10 rounded-full flex items-center justify-center
                text-xl cursor-pointer shadow-lg border-[3px] transition-all
                ${isSelected
                  ? "bg-blue-600 border-blue-900 text-white scale-110"
                  : "bg-white border-gray-400 text-gray-800 hover:scale-105"
                }
              `}
              style={{ transform: "translate(-50%, -50%)" }}
            >
              {poi.icon}
            </div>
          </OverlayView>
        );
      })}

      {/* Live position blue dot */}
      {livePosition && (
        <OverlayView
          position={pixelToGps(livePosition.x, livePosition.y, floor.width, floor.height)}
          mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
        >
          <div style={{ transform: "translate(-50%, -50%)" }} className="relative">
            {/* Accuracy ring */}
            <div
              className="absolute rounded-full"
              style={{
                width: `${20 + Math.round((1 - confidence) * 40)}px`,
                height: `${20 + Math.round((1 - confidence) * 40)}px`,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background:
                  confidence > 0.6
                    ? "rgba(66, 133, 244, 0.15)"
                    : confidence > 0.3
                    ? "rgba(251, 188, 5, 0.15)"
                    : "rgba(234, 67, 53, 0.15)",
                border: `1px solid ${
                  confidence > 0.6 ? "rgba(66,133,244,0.3)" : confidence > 0.3 ? "rgba(251,188,5,0.3)" : "rgba(234,67,53,0.3)"
                }`,
              }}
            />
            {/* Heading arrow */}
            <div
              className="absolute"
              style={{
                top: "-14px",
                left: "50%",
                transform: `translateX(-50%) rotate(${liveHeading ?? 0}deg)`,
                transformOrigin: "bottom center",
              }}
            >
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderBottom: "10px solid #4285F4",
                }}
              />
            </div>
            {/* Blue dot */}
            <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-md" />
          </div>
        </OverlayView>
      )}
    </GoogleMap>
  );
}
