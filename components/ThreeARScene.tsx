"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import type { VPSRotationMatrix } from "@/lib/vps";

/* ═══════════════════════════════════════════════════════════════
   ThreeARScene — Production-grade 3D AR Navigation Renderer
   
   Uses Three.js WebGL for real 3D rendering:
   - 3D road/path on the ground plane with animated chevrons
   - Proper perspective camera matched to device orientation
   - Transparent background → camera feed shows through
   - 3D destination marker, user indicator, turn signs
   ═══════════════════════════════════════════════════════════════ */

interface RoutePoint {
  x: number;
  y: number;
}

interface ThreeARSceneProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  routePoints: RoutePoint[];
  currentStep: number;
  metersPerPx: number;
  heading: number | null;          // compass heading in degrees
  routeHeading: number | null;     // route direction heading
  /** VPS rotation matrix — when available, overrides compass for camera orientation */
  vpsRotation: VPSRotationMatrix | null;
  destinationName: string;
  visible: boolean;
  distanceWalked: number;
  remainingDistance: number;
  stepCount: number;
  totalDistance: number;
  /** Current direction instruction */
  currentDirection: string;
  /** Distance to next turn */
  distanceToNextTurn: number;
}

// ── Constants ──
const EYE_HEIGHT = 1.6;        // camera height (meters)
const PATH_WIDTH = 0.8;        // path ribbon width (meters)
const PATH_COLOR = 0x4285F4;   // Google Blue
const PATH_GLOW_COLOR = 0x5a9cff;
const CHEVRON_COLOR = 0xffffff;
const DEST_COLOR = 0x34A853;   // Google Green
const MAX_RENDER_DIST = 25;    // meters ahead to render
const CHEVRON_SPACING = 2.0;   // meters between chevrons
const CHEVRON_SPEED = 3.0;     // meters per second animation

export default function ThreeARScene({
  containerRef,
  routePoints,
  currentStep,
  metersPerPx,
  heading,
  routeHeading,
  vpsRotation,
  destinationName,
  visible,
  distanceWalked,
  remainingDistance,
  stepCount,
  totalDistance,
  currentDirection,
  distanceToNextTurn,
}: ThreeARSceneProps) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animRef = useRef<number>(0);
  const clockRef = useRef(new THREE.Clock());

  // Track meshes for cleanup
  const pathMeshRef = useRef<THREE.Mesh | null>(null);
  const pathGlowRef = useRef<THREE.Mesh | null>(null);
  const chevronGroupRef = useRef<THREE.Group | null>(null);
  const destMarkerRef = useRef<THREE.Group | null>(null);
  const userMarkerRef = useRef<THREE.Group | null>(null);
  const turnSignRef = useRef<THREE.Group | null>(null);
  const hudGroupRef = useRef<THREE.Group | null>(null);

  // Store VPS rotation in a ref so the animation loop reads it without restarting
  const vpsRotationRef = useRef<VPSRotationMatrix | null>(null);
  useEffect(() => { vpsRotationRef.current = vpsRotation; }, [vpsRotation]);

  // ── Convert floor plan point to 3D world coordinates ──
  const toWorld = useCallback(
    (pt: RoutePoint): THREE.Vector3 => {
      // Floor plan: x right, y down
      // Three.js: x right, y up, z towards viewer (negative z = forward)
      return new THREE.Vector3(
        pt.x * metersPerPx,
        0, // ground level
        pt.y * metersPerPx // z = floor plan Y (we look along -z for "north")
      );
    },
    [metersPerPx]
  );

  // ── Build path ribbon geometry ──
  const buildPathGeometry = useCallback(
    (points: THREE.Vector3[]): THREE.BufferGeometry | null => {
      if (points.length < 2) return null;

      const halfW = PATH_WIDTH / 2;
      const vertices: number[] = [];
      const uvs: number[] = [];
      const colors: number[] = [];
      const indices: number[] = [];

      let cumDist = 0;
      const color = new THREE.Color(PATH_COLOR);
      const colorFar = new THREE.Color(PATH_GLOW_COLOR);

      for (let i = 0; i < points.length; i++) {
        // Direction perpendicular to path
        let dir: THREE.Vector3;
        if (i < points.length - 1) {
          dir = new THREE.Vector3().subVectors(points[i + 1], points[i]).normalize();
        } else {
          dir = new THREE.Vector3().subVectors(points[i], points[i - 1]).normalize();
        }

        // Perpendicular on XZ plane (rotate 90° around Y)
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);

        // Distance along path for UV
        if (i > 0) {
          cumDist += points[i].distanceTo(points[i - 1]);
        }
        const t = Math.min(cumDist / MAX_RENDER_DIST, 1);

        // Width decreases slightly with distance for depth cue
        const w = halfW * (1 - t * 0.3);

        // Left vertex
        const left = new THREE.Vector3().copy(points[i]).addScaledVector(perp, -w);
        left.y = 0.02; // slightly above ground to prevent z-fighting
        vertices.push(left.x, left.y, left.z);

        // Right vertex
        const right = new THREE.Vector3().copy(points[i]).addScaledVector(perp, w);
        right.y = 0.02;
        vertices.push(right.x, right.y, right.z);

        // UVs — u: 0→1 across width, v: distance along path
        uvs.push(0, cumDist / CHEVRON_SPACING);
        uvs.push(1, cumDist / CHEVRON_SPACING);

        // Vertex colors — fade from bright to subtle
        const c = new THREE.Color().lerpColors(color, colorFar, t * 0.6);
        const alpha = 1 - t * 0.6;
        colors.push(c.r * alpha, c.g * alpha, c.b * alpha);
        colors.push(c.r * alpha, c.g * alpha, c.b * alpha);

        // Triangle indices (two triangles per quad)
        if (i < points.length - 1) {
          const base = i * 2;
          indices.push(base, base + 1, base + 2);
          indices.push(base + 1, base + 3, base + 2);
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      return geometry;
    },
    []
  );

  // ── Create animated chevron arrow texture ──
  const createChevronTexture = useCallback((): THREE.CanvasTexture => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    // Transparent background
    ctx.clearRect(0, 0, size, size);

    // Draw chevron arrow pointing up (along V direction)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const cx = size / 2;
    const cy = size / 2;
    const armLen = size * 0.3;

    ctx.beginPath();
    ctx.moveTo(cx - armLen, cy + armLen * 0.5);
    ctx.lineTo(cx, cy - armLen * 0.5);
    ctx.lineTo(cx + armLen, cy + armLen * 0.5);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    return texture;
  }, []);

  // ── Create glow texture for path edges ──
  const createGlowTexture = useCallback((): THREE.CanvasTexture => {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = 1;
    const ctx = canvas.getContext("2d")!;

    // Gradient: transparent → blue → white → blue → transparent
    const grad = ctx.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0, "rgba(66, 133, 244, 0)");
    grad.addColorStop(0.15, "rgba(66, 133, 244, 0.4)");
    grad.addColorStop(0.3, "rgba(90, 156, 255, 0.8)");
    grad.addColorStop(0.5, "rgba(255, 255, 255, 0.95)");
    grad.addColorStop(0.7, "rgba(90, 156, 255, 0.8)");
    grad.addColorStop(0.85, "rgba(66, 133, 244, 0.4)");
    grad.addColorStop(1, "rgba(66, 133, 244, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, 1);

    return new THREE.CanvasTexture(canvas);
  }, []);

  // ── Initialize Three.js scene ──
  useEffect(() => {
    if (!containerRef.current) return;

    // --- Scene ---
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // --- Camera ---
    const aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(65, aspect, 0.1, 100);
    camera.position.set(0, EYE_HEIGHT, 0);
    camera.lookAt(0, 0, -10);
    cameraRef.current = camera;

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setClearColor(0x000000, 0); // fully transparent
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.pointerEvents = "none";
    renderer.domElement.style.zIndex = "15";
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- Ambient Light ---
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    // --- Subtle ground reference grid (very faint) ---
    const gridSize = 30;
    const gridDiv = 30;
    const gridHelper = new THREE.GridHelper(gridSize, gridDiv, 0x4285F4, 0x4285F4);
    gridHelper.material.opacity = 0.04;
    gridHelper.material.transparent = true;
    gridHelper.position.y = 0.001;
    scene.add(gridHelper);

    // --- Handle resize ---
    const handleResize = () => {
      if (!containerRef.current || !renderer || !camera) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    clockRef.current.start();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
      scene.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update 3D scene when route/step changes ──
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old path meshes
    if (pathMeshRef.current) { scene.remove(pathMeshRef.current); pathMeshRef.current.geometry.dispose(); }
    if (pathGlowRef.current) { scene.remove(pathGlowRef.current); pathGlowRef.current.geometry.dispose(); }
    if (chevronGroupRef.current) { scene.remove(chevronGroupRef.current); }
    if (destMarkerRef.current) { scene.remove(destMarkerRef.current); }
    if (userMarkerRef.current) { scene.remove(userMarkerRef.current); }
    if (turnSignRef.current) { scene.remove(turnSignRef.current); }

    // Build 3D path points from currentStep onward
    const worldPoints: THREE.Vector3[] = [];
    let totalDist = 0;

    for (let i = currentStep; i < routePoints.length && totalDist < MAX_RENDER_DIST; i++) {
      const wp = toWorld(routePoints[i]);
      if (i > currentStep) {
        totalDist += wp.distanceTo(worldPoints[worldPoints.length - 1]);
      }
      worldPoints.push(wp);
    }

    if (worldPoints.length < 2) return;

    // ── Dense sampling for smooth path ──
    const SAMPLE_DIST = 0.3; // 30cm intervals
    const sampledPoints: THREE.Vector3[] = [worldPoints[0].clone()];
    for (let i = 0; i < worldPoints.length - 1; i++) {
      const p1 = worldPoints[i];
      const p2 = worldPoints[i + 1];
      const segLen = p1.distanceTo(p2);
      const numSamples = Math.max(1, Math.ceil(segLen / SAMPLE_DIST));
      for (let s = 1; s <= numSamples; s++) {
        const t = s / numSamples;
        sampledPoints.push(new THREE.Vector3().lerpVectors(p1, p2, t));
      }
    }

    // ─────── USER POSITION ───────
    // Camera/user is at the first point of the current path
    const userWorldPos = worldPoints[0];

    // ─────── PATH GEOMETRY ───────
    // Make path relative to user position (user is at origin)
    const relativePoints = sampledPoints.map((p) =>
      new THREE.Vector3(p.x - userWorldPos.x, p.y, p.z - userWorldPos.z)
    );

    // Main path ribbon
    const pathGeo = buildPathGeometry(relativePoints);
    if (pathGeo) {
      const pathMat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const pathMesh = new THREE.Mesh(pathGeo, pathMat);
      scene.add(pathMesh);
      pathMeshRef.current = pathMesh;

      // Glow ribbon (wider, more transparent)
      const glowGeo = buildPathGeometry(relativePoints);
      if (glowGeo) {
        // Scale width for glow
        const pos = glowGeo.getAttribute("position");
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const z = pos.getZ(i);
          // Widen by 50%
          const center = i % 2 === 0 ? -1 : 1;
          pos.setX(i, x * 1.5);
          pos.setZ(i, z);
        }
        pos.needsUpdate = true;

        const glowMat = new THREE.MeshBasicMaterial({
          color: PATH_COLOR,
          transparent: true,
          opacity: 0.15,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const glowMesh = new THREE.Mesh(glowGeo, glowMat);
        glowMesh.position.y = 0.01;
        scene.add(glowMesh);
        pathGlowRef.current = glowMesh;
      }
    }

    // ─────── CHEVRON ARROWS ───────
    const chevGroup = new THREE.Group();
    const chevTexture = createChevronTexture();
    let chevDist = 0;

    for (let i = 0; i < relativePoints.length - 1; i++) {
      const p1 = relativePoints[i];
      const p2 = relativePoints[i + 1];
      const segDist = p1.distanceTo(p2);
      chevDist += segDist;

      if (chevDist >= CHEVRON_SPACING) {
        chevDist -= CHEVRON_SPACING;

        // Direction of path at this point
        const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
        const angle = Math.atan2(dir.x, dir.z);

        // Distance from user for fade
        const distFromUser = p2.distanceTo(relativePoints[0]);
        const fade = Math.max(0.2, 1 - distFromUser / MAX_RENDER_DIST);

        // Chevron plane
        const chevGeo = new THREE.PlaneGeometry(0.5, 0.5);
        const chevMat = new THREE.MeshBasicMaterial({
          map: chevTexture,
          transparent: true,
          opacity: fade * 0.85,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const chevMesh = new THREE.Mesh(chevGeo, chevMat);
        chevMesh.position.set(p2.x, 0.05, p2.z);
        chevMesh.rotation.x = -Math.PI / 2; // lay flat on ground
        chevMesh.rotation.z = -angle; // point along path direction
        chevMesh.userData.baseY = 0.05;
        chevMesh.userData.distFromUser = distFromUser;
        chevGroup.add(chevMesh);
      }
    }
    scene.add(chevGroup);
    chevronGroupRef.current = chevGroup;

    // ─────── DESTINATION MARKER ───────
    const destGroup = new THREE.Group();
    const lastPt = relativePoints[relativePoints.length - 1];

    // Pulsing green pillar
    const pillarGeo = new THREE.CylinderGeometry(0.15, 0.15, 2.5, 16);
    const pillarMat = new THREE.MeshBasicMaterial({
      color: DEST_COLOR,
      transparent: true,
      opacity: 0.4,
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(lastPt.x, 1.25, lastPt.z);
    destGroup.add(pillar);

    // Green sphere on top
    const sphereGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: DEST_COLOR });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.set(lastPt.x, 2.6, lastPt.z);
    destGroup.add(sphere);

    // Ground ring
    const ringGeo = new THREE.RingGeometry(0.3, 0.5, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: DEST_COLOR,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(lastPt.x, 0.03, lastPt.z);
    ring.rotation.x = -Math.PI / 2;
    destGroup.add(ring);

    // Floating label
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 512;
    labelCanvas.height = 128;
    const lctx = labelCanvas.getContext("2d")!;
    lctx.clearRect(0, 0, 512, 128);

    // Pill background
    lctx.fillStyle = "rgba(52, 168, 83, 0.9)";
    lctx.beginPath();
    lctx.roundRect(20, 20, 472, 88, 44);
    lctx.fill();

    // Text
    lctx.fillStyle = "#ffffff";
    lctx.font = "bold 36px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    lctx.textAlign = "center";
    lctx.textBaseline = "middle";
    const labelStr = destinationName.length > 20 ? destinationName.substring(0, 18) + "..." : destinationName;
    lctx.fillText(labelStr, 256, 64);

    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const labelGeo = new THREE.PlaneGeometry(2.5, 0.625);
    const labelMat = new THREE.SpriteMaterial({
      map: labelTex,
      transparent: true,
      depthWrite: false,
    });
    const labelSprite = new THREE.Sprite(labelMat);
    labelSprite.position.set(lastPt.x, 3.2, lastPt.z);
    labelSprite.scale.set(2.5, 0.625, 1);
    destGroup.add(labelSprite);

    scene.add(destGroup);
    destMarkerRef.current = destGroup;

    // ─────── USER POSITION MARKER ───────
    const userGroup = new THREE.Group();

    // Blue circle at feet
    const userRingGeo = new THREE.RingGeometry(0.2, 0.35, 32);
    const userRingMat = new THREE.MeshBasicMaterial({
      color: PATH_COLOR,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const userRing = new THREE.Mesh(userRingGeo, userRingMat);
    userRing.rotation.x = -Math.PI / 2;
    userRing.position.y = 0.03;
    userGroup.add(userRing);

    // Pulse ring (animated in render loop)
    const pulseRingGeo = new THREE.RingGeometry(0.35, 0.4, 32);
    const pulseRingMat = new THREE.MeshBasicMaterial({
      color: PATH_COLOR,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const pulseRing = new THREE.Mesh(pulseRingGeo, pulseRingMat);
    pulseRing.rotation.x = -Math.PI / 2;
    pulseRing.position.y = 0.03;
    pulseRing.userData.isPulse = true;
    userGroup.add(pulseRing);

    // Center dot
    const dotGeo = new THREE.CircleGeometry(0.15, 32);
    const dotMat = new THREE.MeshBasicMaterial({
      color: PATH_COLOR,
      side: THREE.DoubleSide,
    });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.rotation.x = -Math.PI / 2;
    dot.position.y = 0.04;
    userGroup.add(dot);

    // Direction cone
    const coneGeo = new THREE.ConeGeometry(0.12, 0.3, 8);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.rotation.x = Math.PI / 2; // point forward
    cone.position.set(0, 0.15, -0.3);
    userGroup.add(cone);

    scene.add(userGroup);
    userMarkerRef.current = userGroup;

    // ─────── TURN INDICATOR ───────
    if (currentDirection === "left" || currentDirection === "right") {
      const turnGroup = new THREE.Group();
      // Find the turn point (next node)
      if (relativePoints.length > 3) {
        // The turn point is approximately where direction changes
        const turnIdx = Math.min(
          Math.floor(relativePoints.length * 0.3),
          relativePoints.length - 2
        );
        const turnPt = relativePoints[turnIdx];

        // Floating arrow
        const arrowCanvas = document.createElement("canvas");
        arrowCanvas.width = 256;
        arrowCanvas.height = 256;
        const actx = arrowCanvas.getContext("2d")!;
        actx.clearRect(0, 0, 256, 256);

        // Circle background
        actx.fillStyle = "rgba(0, 0, 0, 0.75)";
        actx.beginPath();
        actx.arc(128, 128, 110, 0, Math.PI * 2);
        actx.fill();

        // Arrow
        actx.strokeStyle = "#ffffff";
        actx.lineWidth = 14;
        actx.lineCap = "round";
        actx.lineJoin = "round";
        actx.beginPath();
        if (currentDirection === "left") {
          actx.moveTo(170, 180);
          actx.lineTo(128, 80);
          actx.lineTo(86, 180);
          // Curve to indicate left
          actx.moveTo(128, 80);
          actx.quadraticCurveTo(60, 120, 70, 180);
        } else {
          actx.moveTo(86, 180);
          actx.lineTo(128, 80);
          actx.lineTo(170, 180);
          // Curve to indicate right
          actx.moveTo(128, 80);
          actx.quadraticCurveTo(196, 120, 186, 180);
        }
        actx.stroke();

        // Distance text
        actx.fillStyle = "#4285F4";
        actx.font = "bold 32px sans-serif";
        actx.textAlign = "center";
        actx.fillText(`${distanceToNextTurn}m`, 128, 230);

        const arrowTex = new THREE.CanvasTexture(arrowCanvas);
        const arrowSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: arrowTex,
            transparent: true,
            depthWrite: false,
          })
        );
        arrowSprite.position.set(turnPt.x, 2.5, turnPt.z);
        arrowSprite.scale.set(1.2, 1.2, 1);
        turnGroup.add(arrowSprite);
      }
      scene.add(turnGroup);
      turnSignRef.current = turnGroup;
    }

    // Cleanup function
    return () => {
      chevTexture.dispose();
    };
  }, [routePoints, currentStep, metersPerPx, toWorld, buildPathGeometry, createChevronTexture, destinationName, currentDirection, distanceToNextTurn]);

  // ── Animation loop — update camera orientation + animated elements ──
  useEffect(() => {
    if (!visible) return;

    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    function animate() {
      if (!renderer || !scene || !camera) return;
      animRef.current = requestAnimationFrame(animate);

      const elapsed = clockRef.current.getElapsedTime();

      // ── Camera orientation from VPS rotation matrix or compass ──
      // Camera is always at origin (path is relative to user)
      camera.position.set(0, EYE_HEIGHT, 0);

      // Read VPS rotation from ref (avoids restarting animation loop on every VPS update)
      const rot = vpsRotationRef.current;
      if (rot) {
        // Use Immersal VPS rotation matrix for precise camera orientation.
        // Immersal uses CV camera convention: X-right, Y-DOWN, Z-forward.
        // Three.js uses: X-right, Y-UP, Z-backward.
        // Convert by negating Y row (flip up/down) and Z row (flip forward/back).
        const m = new THREE.Matrix4();
        m.set(
          rot.r00,  rot.r01,  rot.r02, 0,
         -rot.r10, -rot.r11, -rot.r12, 0,
         -rot.r20, -rot.r21, -rot.r22, 0,
          0,        0,        0,       1
        );

        // Extract quaternion from the converted rotation matrix
        const q = new THREE.Quaternion();
        q.setFromRotationMatrix(m);
        camera.quaternion.copy(q);
      } else if (heading !== null && routeHeading !== null) {
        // Calculate the difference between compass heading and route heading
        // Route heading = direction the path goes
        // Compass heading = direction user is actually facing
        const routeRad = (routeHeading * Math.PI) / 180;
        const compassRad = (heading * Math.PI) / 180;

        // Camera should look along the direction the user is facing
        // relative to the route. If heading == routeHeading, look straight down path.
        const lookDist = 10;
        const lookX = Math.sin(compassRad) * lookDist;
        const lookZ = -Math.cos(compassRad) * lookDist;

        camera.lookAt(lookX, EYE_HEIGHT * 0.6, lookZ);
      } else if (routeHeading !== null) {
        // Only route heading available — look along path
        const routeRad = (routeHeading * Math.PI) / 180;
        camera.lookAt(
          Math.sin(routeRad) * 10,
          EYE_HEIGHT * 0.6,
          -Math.cos(routeRad) * 10
        );
      } else {
        // Default: look along negative Z
        camera.lookAt(0, EYE_HEIGHT * 0.6, -10);
      }

      // ── Animate chevrons (scroll forward) ──
      if (chevronGroupRef.current) {
        chevronGroupRef.current.children.forEach((child) => {
          const mesh = child as THREE.Mesh;
          // Pulsing opacity
          const dist = mesh.userData.distFromUser || 0;
          const baseFade = Math.max(0.2, 1 - dist / MAX_RENDER_DIST);
          const pulse = 0.5 + 0.5 * Math.sin(elapsed * 4 - dist * 0.8);
          (mesh.material as THREE.MeshBasicMaterial).opacity = baseFade * pulse * 0.9;

          // Slight bob
          mesh.position.y = (mesh.userData.baseY || 0.05) + Math.sin(elapsed * 3 - dist * 0.5) * 0.02;
        });
      }

      // ── Animate destination marker ──
      if (destMarkerRef.current) {
        destMarkerRef.current.children.forEach((child) => {
          if (child instanceof THREE.Mesh && child.geometry instanceof THREE.SphereGeometry) {
            // Bounce the sphere
            const baseY = 2.6;
            child.position.y = baseY + Math.sin(elapsed * 2) * 0.15;
          }
          if (child instanceof THREE.Mesh && child.geometry instanceof THREE.CylinderGeometry) {
            // Pulse pillar opacity
            (child.material as THREE.MeshBasicMaterial).opacity =
              0.3 + 0.15 * Math.sin(elapsed * 3);
          }
          if (child instanceof THREE.Mesh && child.geometry instanceof THREE.RingGeometry) {
            // Pulse ring
            const scale = 1 + 0.2 * Math.sin(elapsed * 2.5);
            child.scale.set(scale, scale, 1);
          }
        });
      }

      // ── Animate user marker ──
      if (userMarkerRef.current) {
        userMarkerRef.current.children.forEach((child) => {
          if ((child as THREE.Mesh).userData?.isPulse) {
            const scale = 1 + 0.4 * Math.sin(elapsed * 3);
            child.scale.set(scale, scale, 1);
            ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity =
              0.3 * (1 - Math.sin(elapsed * 3) * 0.5);
          }
        });
      }

      // ── Animate turn sign ──
      if (turnSignRef.current) {
        turnSignRef.current.children.forEach((child) => {
          if (child instanceof THREE.Sprite) {
            child.position.y = 2.5 + Math.sin(elapsed * 1.5) * 0.15;
          }
        });
      }

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [visible, heading, routeHeading]);

  // ── Update HUD (2D overlay elements rendered via Three.js Sprites) ──
  // The HUD (destination label, distance bar, warnings) stays in the
  // parent component as HTML — Three.js only handles the 3D world-space objects.

  return null; // This component renders into the container via Three.js
}
