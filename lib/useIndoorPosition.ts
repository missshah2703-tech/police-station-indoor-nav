"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { IndoorPosition, PositionSource } from "./types";

interface Position {
  x: number;
  y: number;
}

interface UseIndoorPositionOptions {
  /** Route node positions in order [{x, y}, ...] */
  routePoints: Position[];
  /** Edge distances in meters for each segment (routePoints.length - 1) */
  segmentDistances: number[];
  /** Called when user reaches next segment */
  onSegmentAdvance?: (segmentIndex: number) => void;
  /** Average step length in meters (default 0.65) */
  stepLength?: number;
  /** Whether tracking is active */
  active: boolean;
  /** Called when user deviates from route beyond tolerance */
  onRouteDeviation?: (deviationMeters: number) => void;
}

interface IndoorPositionState {
  /** Current interpolated position on the floor plan */
  position: Position;
  /** Smoothed compass heading in degrees (0 = North) — null if unavailable */
  heading: number | null;
  /** Route-relative heading (direction of current route segment) */
  routeHeading: number | null;
  /** Current segment index */
  currentSegment: number;
  /** Total distance walked (meters) */
  distanceWalked: number;
  /** Whether motion sensors are available */
  sensorsAvailable: boolean;
  /** Step count */
  stepCount: number;
  /** Position confidence 0–1 (decays over time, resets on manual calibration) */
  confidence: number;
  /** How current position was determined */
  source: PositionSource;
  /** Whether user appears to have deviated from route */
  isOffRoute: boolean;
  /** Manually set position to a known location (recalibration) */
  recalibrateToNode: (nodeIndex: number) => void;
  /** Manually set position to arbitrary point (tap-to-set) */
  setManualPosition: (pos: Position, distAlongRoute: number) => void;
  /** Register a beacon-derived position update */
  applyBeaconFix: (pos: Position, accuracyMeters: number) => void;
  /** Current adaptive step length (may differ from initial) */
  currentStepLength: number;
}

// ── Compass low-pass filter ──
// Smooths heading over N samples to reduce jitter from metal/electrical interference
const COMPASS_BUFFER_SIZE = 8;

function smoothHeading(buffer: number[]): number {
  if (buffer.length === 0) return 0;
  // Average angles correctly using sin/cos to handle 0°/360° wraparound
  let sinSum = 0, cosSum = 0;
  for (const angle of buffer) {
    sinSum += Math.sin((angle * Math.PI) / 180);
    cosSum += Math.cos((angle * Math.PI) / 180);
  }
  let avg = (Math.atan2(sinSum / buffer.length, cosSum / buffer.length) * 180) / Math.PI;
  if (avg < 0) avg += 360;
  return avg;
}

// ── Route-relative heading ──
// Computes heading from current segment direction instead of compass
function segmentHeading(p1: Position, p2: Position): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  // Convert to compass: 0=North (up on screen = -y), clockwise
  let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return angle;
}

// ── Confidence decay ──
const CONFIDENCE_DECAY_PER_METER = 0.008; // loses ~8% per 10m walked without re-anchor
const CONFIDENCE_DECAY_PER_SECOND = 0.002; // loses ~0.2% per second
const MIN_CONFIDENCE = 0.15;
const ROUTE_DEVIATION_TOLERANCE_M = 3; // ±3m before flagging off-route

/**
 * Production-grade indoor position tracking hook.
 *
 * Features:
 * - Accelerometer step detection with adaptive step length
 * - Compass heading with low-pass filter to reduce indoor drift
 * - Route-relative heading (doesn't depend solely on compass)
 * - Confidence tracking that decays over distance/time
 * - Route deviation detection
 * - Manual recalibration ("I am here") support
 * - Beacon-ready architecture (applyBeaconFix callback)
 * - Simulation fallback for desktop testing
 */
export function useIndoorPosition({
  routePoints,
  segmentDistances,
  onSegmentAdvance,
  stepLength = 0.65,
  active,
  onRouteDeviation,
}: UseIndoorPositionOptions): IndoorPositionState {
  const [position, setPosition] = useState<Position>(
    routePoints[0] || { x: 0, y: 0 }
  );
  const [heading, setHeading] = useState<number | null>(null);
  const [routeHeading, setRouteHeading] = useState<number | null>(null);
  const [currentSegment, setCurrentSegment] = useState(0);
  const [distanceWalked, setDistanceWalked] = useState(0);
  const [sensorsAvailable, setSensorsAvailable] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const [confidence, setConfidence] = useState(1.0);
  const [source, setSource] = useState<PositionSource>("accelerometer");
  const [isOffRoute, setIsOffRoute] = useState(false);
  const [adaptiveStepLength, setAdaptiveStepLength] = useState(stepLength);

  // Refs for step detection algorithm
  const lastAccelRef = useRef<number>(0);
  const stepThresholdRef = useRef(0.8);
  const lastStepTimeRef = useRef(0);
  const distanceAlongRouteRef = useRef(0);
  const currentSegmentRef = useRef(0);
  const onSegmentAdvanceRef = useRef(onSegmentAdvance);
  const onRouteDeviationRef = useRef(onRouteDeviation);
  const accelBufferRef = useRef<number[]>([]); // accelerometer smoothing
  const compassBufferRef = useRef<number[]>([]); // compass low-pass filter
  const confidenceRef = useRef(1.0);
  const lastConfidenceTickRef = useRef(Date.now());
  const stepTimesRef = useRef<number[]>([]); // for adaptive step length

  // Keep callback refs updated
  useEffect(() => {
    onSegmentAdvanceRef.current = onSegmentAdvance;
  }, [onSegmentAdvance]);
  useEffect(() => {
    onRouteDeviationRef.current = onRouteDeviation;
  }, [onRouteDeviation]);

  // Compute cumulative distances for each route node
  const cumulativeDistances = useRef<number[]>([]);
  useEffect(() => {
    const cum: number[] = [0];
    for (let i = 0; i < segmentDistances.length; i++) {
      cum.push(cum[i] + segmentDistances[i]);
    }
    cumulativeDistances.current = cum;
  }, [segmentDistances]);

  // Interpolate position along route based on distance walked
  const updatePosition = useCallback(
    (totalDist: number, posSource: PositionSource = "accelerometer") => {
      const cum = cumulativeDistances.current;
      if (cum.length < 2 || routePoints.length < 2) return;

      const totalRouteDist = cum[cum.length - 1];
      const clampedDist = Math.min(totalDist, totalRouteDist);

      // Find which segment we're on
      let seg = 0;
      for (let i = 0; i < cum.length - 1; i++) {
        if (clampedDist >= cum[i] && clampedDist <= cum[i + 1]) {
          seg = i;
          break;
        }
        if (i === cum.length - 2) seg = i;
      }

      // Notify if segment changed
      if (seg !== currentSegmentRef.current) {
        currentSegmentRef.current = seg;
        setCurrentSegment(seg);
        onSegmentAdvanceRef.current?.(seg);
      }

      // Interpolate within segment
      const segStart = cum[seg];
      const segEnd = cum[seg + 1] || cum[seg];
      const segLen = segEnd - segStart;
      const t = segLen > 0 ? (clampedDist - segStart) / segLen : 0;

      const p1 = routePoints[seg];
      const p2 = routePoints[seg + 1] || routePoints[seg];

      const newPos: Position = {
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
      };

      setPosition(newPos);
      setSource(posSource);

      // Update route-relative heading
      if (routePoints[seg + 1]) {
        setRouteHeading(segmentHeading(routePoints[seg], routePoints[seg + 1]));
      }

      // ── Route deviation detection ──
      // Check if walked distance overshoots the route significantly
      const overshoot = totalDist - totalRouteDist;
      if (overshoot > ROUTE_DEVIATION_TOLERANCE_M) {
        setIsOffRoute(true);
        onRouteDeviationRef.current?.(overshoot);
      } else {
        setIsOffRoute(false);
      }
    },
    [routePoints]
  );

  // ── Confidence decay timer ──
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastConfidenceTickRef.current) / 1000;
      lastConfidenceTickRef.current = now;

      const decay = elapsed * CONFIDENCE_DECAY_PER_SECOND;
      confidenceRef.current = Math.max(MIN_CONFIDENCE, confidenceRef.current - decay);
      setConfidence(confidenceRef.current);
    }, 1000);
    return () => clearInterval(interval);
  }, [active]);

  // ── Manual recalibration: snap to a known node ──
  const recalibrateToNode = useCallback(
    (nodeIndex: number) => {
      if (nodeIndex < 0 || nodeIndex >= routePoints.length) return;
      const cum = cumulativeDistances.current;
      const dist = cum[nodeIndex] || 0;

      distanceAlongRouteRef.current = dist;
      currentSegmentRef.current = Math.min(nodeIndex, routePoints.length - 2);
      setCurrentSegment(currentSegmentRef.current);
      setDistanceWalked(dist);
      setPosition(routePoints[nodeIndex]);
      setSource("manual");
      // Reset confidence to high on manual calibration
      confidenceRef.current = 0.95;
      setConfidence(0.95);
      setIsOffRoute(false);
    },
    [routePoints]
  );

  // ── Tap-to-set: arbitrary position on map ──
  const setManualPosition = useCallback(
    (pos: Position, distAlongRoute: number) => {
      distanceAlongRouteRef.current = distAlongRoute;
      setDistanceWalked(distAlongRoute);
      setPosition(pos);
      setSource("manual");
      confidenceRef.current = 0.9;
      setConfidence(0.9);
      setIsOffRoute(false);
      // Find segment
      const cum = cumulativeDistances.current;
      for (let i = 0; i < cum.length - 1; i++) {
        if (distAlongRoute >= cum[i] && distAlongRoute <= cum[i + 1]) {
          currentSegmentRef.current = i;
          setCurrentSegment(i);
          break;
        }
      }
    },
    []
  );

  // ── Beacon fix: external position source (BLE/WiFi) ──
  const applyBeaconFix = useCallback(
    (pos: Position, accuracyMeters: number) => {
      // Snap the provided real-world position to nearest point on route
      let bestDist = Infinity;
      let bestRouteDistance = 0;

      const cum = cumulativeDistances.current;
      for (let i = 0; i < routePoints.length - 1; i++) {
        // Project pos onto segment [routePoints[i], routePoints[i+1]]
        const p1 = routePoints[i];
        const p2 = routePoints[i + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const segLenSq = dx * dx + dy * dy;
        if (segLenSq === 0) continue;

        let t = ((pos.x - p1.x) * dx + (pos.y - p1.y) * dy) / segLenSq;
        t = Math.max(0, Math.min(1, t));

        const projX = p1.x + t * dx;
        const projY = p1.y + t * dy;
        const dist = Math.sqrt((pos.x - projX) ** 2 + (pos.y - projY) ** 2);

        if (dist < bestDist) {
          bestDist = dist;
          const segLen = cum[i + 1] - cum[i];
          bestRouteDistance = cum[i] + t * segLen;
        }
      }

      distanceAlongRouteRef.current = bestRouteDistance;
      setDistanceWalked(bestRouteDistance);
      setSource("beacon");
      // Beacon confidence based on accuracy (2m = 0.95, 10m = 0.5)
      const beaconConfidence = Math.max(0.3, Math.min(0.98, 1 - accuracyMeters * 0.05));
      confidenceRef.current = beaconConfidence;
      setConfidence(beaconConfidence);
      setIsOffRoute(false);
      updatePosition(bestRouteDistance, "beacon");
    },
    [routePoints, updatePosition]
  );

  // Reset when route changes
  useEffect(() => {
    if (routePoints.length > 0) {
      setPosition(routePoints[0]);
      setCurrentSegment(0);
      currentSegmentRef.current = 0;
      distanceAlongRouteRef.current = 0;
      setDistanceWalked(0);
      setStepCount(0);
      confidenceRef.current = 1.0;
      setConfidence(1.0);
      setSource("accelerometer");
      setIsOffRoute(false);
      compassBufferRef.current = [];
      stepTimesRef.current = [];
      // Compute initial route heading
      if (routePoints[1]) {
        setRouteHeading(segmentHeading(routePoints[0], routePoints[1]));
      }
    }
  }, [routePoints]);

  // ── Step detection via DeviceMotionEvent ──
  useEffect(() => {
    if (!active) return;

    let mounted = true;

    const handleMotion = (event: DeviceMotionEvent) => {
      if (!mounted) return;
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      setSensorsAvailable(true);

      // Compute acceleration magnitude
      const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
      const delta = Math.abs(magnitude - 9.8);

      // Smooth with rolling average (last 4 readings)
      const buf = accelBufferRef.current;
      buf.push(delta);
      if (buf.length > 4) buf.shift();
      const smoothed = buf.reduce((a, b) => a + b, 0) / buf.length;

      const now = Date.now();
      const timeSinceLastStep = now - lastStepTimeRef.current;

      // Step detection: smoothed peak crosses threshold, debounced at 250ms
      if (
        smoothed > stepThresholdRef.current &&
        lastAccelRef.current <= stepThresholdRef.current &&
        timeSinceLastStep > 250
      ) {
        lastStepTimeRef.current = now;

        // ── Adaptive step length ──
        // Track step intervals; faster cadence = likely shorter steps
        const stepTimes = stepTimesRef.current;
        stepTimes.push(timeSinceLastStep);
        if (stepTimes.length > 10) stepTimes.shift();

        let effectiveStepLength = stepLength;
        if (stepTimes.length >= 3) {
          const avgInterval = stepTimes.reduce((a, b) => a + b, 0) / stepTimes.length;
          // Normal walk: ~500ms per step → stepLength
          // Fast walk: ~350ms → slightly shorter steps
          // Slow walk: ~800ms → slightly longer steps
          const speedFactor = Math.min(1.2, Math.max(0.7, avgInterval / 500));
          effectiveStepLength = stepLength * speedFactor;
          setAdaptiveStepLength(effectiveStepLength);
        }

        distanceAlongRouteRef.current += effectiveStepLength;

        // Decay confidence with each step
        confidenceRef.current = Math.max(
          MIN_CONFIDENCE,
          confidenceRef.current - CONFIDENCE_DECAY_PER_METER * effectiveStepLength
        );
        setConfidence(confidenceRef.current);

        setStepCount((s) => s + 1);
        setDistanceWalked(distanceAlongRouteRef.current);
        updatePosition(distanceAlongRouteRef.current, "accelerometer");
      }

      lastAccelRef.current = smoothed;
    };

    // Request permission on iOS 13+
    const startMotion = async () => {
      if (
        typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
          .requestPermission === "function"
      ) {
        try {
          const perm = await (
            DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }
          ).requestPermission();
          if (perm !== "granted") return;
        } catch {
          return;
        }
      }
      window.addEventListener("devicemotion", handleMotion);
    };

    startMotion();

    return () => {
      mounted = false;
      window.removeEventListener("devicemotion", handleMotion);
    };
  }, [active, stepLength, updatePosition]);

  // ── Compass heading with low-pass filter ──
  useEffect(() => {
    if (!active) return;

    let mounted = true;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (!mounted) return;
      const rawHeading =
        (event as unknown as { webkitCompassHeading?: number }).webkitCompassHeading ??
        (event.alpha !== null ? (360 - event.alpha) % 360 : null);

      if (rawHeading !== null) {
        // Low-pass filter: push into circular buffer
        const buf = compassBufferRef.current;
        buf.push(rawHeading);
        if (buf.length > COMPASS_BUFFER_SIZE) buf.shift();

        // Smoothed heading
        const smoothed = smoothHeading(buf);
        setHeading(smoothed);
      }
    };

    const startOrientation = async () => {
      if (
        typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
          .requestPermission === "function"
      ) {
        try {
          const perm = await (
            DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }
          ).requestPermission();
          if (perm !== "granted") return;
        } catch {
          return;
        }
      }
      window.addEventListener("deviceorientation", handleOrientation);
    };

    startOrientation();

    return () => {
      mounted = false;
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, [active]);

  // ── Simulate walking for desktop testing ──
  useEffect(() => {
    if (!active) return;

    const timeout = setTimeout(() => {
      if (!sensorsAvailable) {
        const simInterval = setInterval(() => {
          distanceAlongRouteRef.current += 0.3;
          confidenceRef.current = Math.max(
            MIN_CONFIDENCE,
            confidenceRef.current - CONFIDENCE_DECAY_PER_METER * 0.3
          );
          setConfidence(confidenceRef.current);
          setStepCount((s) => s + 1);
          setDistanceWalked(distanceAlongRouteRef.current);
          setSource("simulation");
          updatePosition(distanceAlongRouteRef.current, "simulation");
        }, 800);

        return () => clearInterval(simInterval);
      }
    }, 3000);

    return () => clearTimeout(timeout);
  }, [active, sensorsAvailable, updatePosition]);

  return {
    position,
    heading,
    routeHeading,
    currentSegment,
    distanceWalked,
    sensorsAvailable,
    stepCount,
    confidence,
    source,
    isOffRoute,
    recalibrateToNode,
    setManualPosition,
    applyBeaconFix,
    currentStepLength: adaptiveStepLength,
  };
}
