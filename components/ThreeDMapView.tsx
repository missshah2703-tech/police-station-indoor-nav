"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import { Floor } from "@/lib/types";

/* ═══════════════════════════════════════════════════════════════
   ThreeDMapView — Interactive 3D Building Overview
   
   Renders the floor plan as a 3D isometric view with:
   - Floor plan texture mapped onto a ground plane
   - 3D corridor walls extruded from edge data
   - 3D POI markers (pins/labels)
   - Animated navigation route in 3D
   - Touch/mouse drag to rotate, pinch to zoom
   ═══════════════════════════════════════════════════════════════ */

interface ThreeDMapViewProps {
  floor: Floor;
  route?: string[];
  selectedPoi?: string;
  onClose: () => void;
}

const WALL_HEIGHT = 0.8;     // meters
const WALL_THICKNESS = 0.15; // meters
const POI_PIN_HEIGHT = 1.2;  // meters
const PATH_WIDTH = 0.4;      // meters

export default function ThreeDMapView({
  floor,
  route,
  selectedPoi,
  onClose,
}: ThreeDMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animRef = useRef<number>(0);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const cameraAngle = useRef({ theta: Math.PI / 4, phi: Math.PI / 4 }); // azimuth, elevation
  const cameraRadius = useRef(15);
  const cameraTarget = useRef(new THREE.Vector3(0, 0, 0));
  const [loading, setLoading] = useState(true);

  const metersPerPx = 1 / (floor.scaleFactor ?? 10);
  const floorW = floor.width * metersPerPx;
  const floorH = floor.height * metersPerPx;

  const nodeMap = useCallback(() => {
    const map = new Map<string, { x: number; y: number }>();
    floor.nodes.forEach((n) => map.set(n.id, { x: n.x, y: n.y }));
    return map;
  }, [floor.nodes]);

  const toWorld = useCallback(
    (px: number, py: number): THREE.Vector3 => {
      return new THREE.Vector3(
        (px * metersPerPx) - floorW / 2,
        0,
        (py * metersPerPx) - floorH / 2
      );
    },
    [metersPerPx, floorW, floorH]
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // ─── Scene ───
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1628);
    scene.fog = new THREE.Fog(0x0a1628, 25, 50);
    sceneRef.current = scene;

    // ─── Camera ───
    const aspect = container.clientWidth / container.clientHeight;
    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200);
    cameraRef.current = camera;

    // Initial camera radius based on floor size
    cameraRadius.current = Math.max(floorW, floorH) * 0.8;
    updateCameraPosition();

    // ─── Renderer ───
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ─── Lighting ───
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 15, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    const shadowSize = Math.max(floorW, floorH);
    dirLight.shadow.camera.left = -shadowSize;
    dirLight.shadow.camera.right = shadowSize;
    dirLight.shadow.camera.top = shadowSize;
    dirLight.shadow.camera.bottom = -shadowSize;
    scene.add(dirLight);

    const blueLight = new THREE.PointLight(0x4285F4, 0.5, 30);
    blueLight.position.set(0, 5, 0);
    scene.add(blueLight);

    // ─── Ground plane with floor plan texture ───
    const floorGeometry = new THREE.PlaneGeometry(floorW, floorH);
    const textureLoader = new THREE.TextureLoader();
    
    const floorPlanUrl = floor.planImage || "/office-floor-plan.png";
    textureLoader.load(
      floorPlanUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        const floorMat = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.8,
          metalness: 0.1,
          side: THREE.DoubleSide,
        });
        const floorMesh = new THREE.Mesh(floorGeometry, floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.receiveShadow = true;
        scene.add(floorMesh);
        setLoading(false);
      },
      undefined,
      () => {
        // Texture load failed - use plain color
        const floorMat = new THREE.MeshStandardMaterial({
          color: 0x1a2842,
          roughness: 0.8,
        });
        const floorMesh = new THREE.Mesh(floorGeometry, floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.receiveShadow = true;
        scene.add(floorMesh);
        setLoading(false);
      }
    );

    // ─── Base platform (slightly below floor) ───
    const baseGeo = new THREE.BoxGeometry(floorW + 0.5, 0.15, floorH + 0.5);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x142240,
      roughness: 0.9,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -0.08;
    base.receiveShadow = true;
    scene.add(base);

    // ─── Corridor walls from edges ───
    const nMap = nodeMap();
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x2a4a7f,
      transparent: true,
      opacity: 0.35,
      roughness: 0.6,
      metalness: 0.3,
    });

    floor.edges.forEach((edge) => {
      const p1 = nMap.get(edge.from);
      const p2 = nMap.get(edge.to);
      if (!p1 || !p2) return;

      const w1 = toWorld(p1.x, p1.y);
      const w2 = toWorld(p2.x, p2.y);

      const dx = w2.x - w1.x;
      const dz = w2.z - w1.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      if (length < 0.01) return;

      const angle = Math.atan2(dz, dx);

      // Left wall
      const wallGeo = new THREE.BoxGeometry(length, WALL_HEIGHT, WALL_THICKNESS);
      const leftWall = new THREE.Mesh(wallGeo, wallMat.clone());
      leftWall.position.set(
        (w1.x + w2.x) / 2 + Math.sin(angle) * 0.5,
        WALL_HEIGHT / 2,
        (w1.z + w2.z) / 2 - Math.cos(angle) * 0.5
      );
      leftWall.rotation.y = -angle;
      leftWall.castShadow = true;
      scene.add(leftWall);

      // Right wall
      const rightWall = new THREE.Mesh(wallGeo.clone(), wallMat.clone());
      rightWall.position.set(
        (w1.x + w2.x) / 2 - Math.sin(angle) * 0.5,
        WALL_HEIGHT / 2,
        (w1.z + w2.z) / 2 + Math.cos(angle) * 0.5
      );
      rightWall.rotation.y = -angle;
      rightWall.castShadow = true;
      scene.add(rightWall);
    });

    // ─── POI markers ───
    floor.pois.forEach((poi) => {
      const node = nMap.get(poi.nodeId);
      if (!node) return;
      const wp = toWorld(node.x, node.y);

      const isSelected = poi.nodeId === selectedPoi;
      const pinColor = isSelected ? 0x34A853 : 0xc5a44e;

      // Pin stem
      const stemGeo = new THREE.CylinderGeometry(0.04, 0.04, POI_PIN_HEIGHT, 8);
      const stemMat = new THREE.MeshStandardMaterial({ color: pinColor });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.set(wp.x, POI_PIN_HEIGHT / 2, wp.z);
      stem.castShadow = true;
      scene.add(stem);

      // Pin head
      const headGeo = new THREE.SphereGeometry(0.12, 12, 12);
      const headMat = new THREE.MeshStandardMaterial({
        color: pinColor,
        emissive: pinColor,
        emissiveIntensity: isSelected ? 0.5 : 0.2,
      });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(wp.x, POI_PIN_HEIGHT + 0.12, wp.z);
      head.castShadow = true;
      head.userData.isPOIHead = true;
      head.userData.isSelected = isSelected;
      scene.add(head);

      // Ground glow
      const glowGeo = new THREE.CircleGeometry(0.2, 16);
      const glowMat = new THREE.MeshBasicMaterial({
        color: pinColor,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(wp.x, 0.02, wp.z);
      glow.rotation.x = -Math.PI / 2;
      scene.add(glow);
    });

    // ─── Navigation route ───
    if (route && route.length >= 2) {
      const routeWorldPoints: THREE.Vector3[] = [];
      route.forEach((nodeId) => {
        const node = nMap.get(nodeId);
        if (node) {
          routeWorldPoints.push(toWorld(node.x, node.y));
        }
      });

      if (routeWorldPoints.length >= 2) {
        // Route ribbon
        const halfW = PATH_WIDTH / 2;
        const vertices: number[] = [];
        const colors: number[] = [];
        const indices: number[] = [];

        const routeColor = new THREE.Color(0x4285F4);
        const routeEndColor = new THREE.Color(0x34A853);

        for (let i = 0; i < routeWorldPoints.length; i++) {
          const pt = routeWorldPoints[i];
          const t = i / (routeWorldPoints.length - 1);

          let dir: THREE.Vector3;
          if (i < routeWorldPoints.length - 1) {
            dir = new THREE.Vector3().subVectors(routeWorldPoints[i + 1], pt).normalize();
          } else {
            dir = new THREE.Vector3().subVectors(pt, routeWorldPoints[i - 1]).normalize();
          }

          const perp = new THREE.Vector3(-dir.z, 0, dir.x);

          const left = new THREE.Vector3().copy(pt).addScaledVector(perp, -halfW);
          const right = new THREE.Vector3().copy(pt).addScaledVector(perp, halfW);

          vertices.push(left.x, 0.05, left.z);
          vertices.push(right.x, 0.05, right.z);

          const c = new THREE.Color().lerpColors(routeColor, routeEndColor, t);
          colors.push(c.r, c.g, c.b);
          colors.push(c.r, c.g, c.b);

          if (i < routeWorldPoints.length - 1) {
            const base = i * 2;
            indices.push(base, base + 1, base + 2);
            indices.push(base + 1, base + 3, base + 2);
          }
        }

        const routeGeo = new THREE.BufferGeometry();
        routeGeo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        routeGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        routeGeo.setIndex(indices);

        const routeMat = new THREE.MeshBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const routeMesh = new THREE.Mesh(routeGeo, routeMat);
        routeMesh.userData.isRoute = true;
        scene.add(routeMesh);

        // Route glow
        const glowMat = new THREE.MeshBasicMaterial({
          color: 0x4285F4,
          transparent: true,
          opacity: 0.2,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const glowVertices = [...vertices];
        // Widen glow
        for (let i = 0; i < glowVertices.length; i += 3) {
          if (i % 6 === 0) {
            // left vertex
          }
        }
        const glowGeo = routeGeo.clone();
        const glowMesh = new THREE.Mesh(glowGeo, glowMat);
        glowMesh.position.y = -0.01;
        glowMesh.scale.set(1.5, 1, 1.5);
        scene.add(glowMesh);

        // Start marker (blue circle)
        const startPt = routeWorldPoints[0];
        const startGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16);
        const startMat = new THREE.MeshStandardMaterial({
          color: 0x4285F4,
          emissive: 0x4285F4,
          emissiveIntensity: 0.3,
        });
        const startMarker = new THREE.Mesh(startGeo, startMat);
        startMarker.position.set(startPt.x, 0.08, startPt.z);
        scene.add(startMarker);

        // End marker (green pillar)
        const endPt = routeWorldPoints[routeWorldPoints.length - 1];
        const endPillarGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.5, 12);
        const endPillarMat = new THREE.MeshStandardMaterial({
          color: 0x34A853,
          emissive: 0x34A853,
          emissiveIntensity: 0.3,
        });
        const endPillar = new THREE.Mesh(endPillarGeo, endPillarMat);
        endPillar.position.set(endPt.x, 0.75, endPt.z);
        endPillar.castShadow = true;
        endPillar.userData.isEndMarker = true;
        scene.add(endPillar);

        const endSphereGeo = new THREE.SphereGeometry(0.15, 12, 12);
        const endSphereMat = new THREE.MeshStandardMaterial({
          color: 0x34A853,
          emissive: 0x34A853,
          emissiveIntensity: 0.5,
        });
        const endSphere = new THREE.Mesh(endSphereGeo, endSphereMat);
        endSphere.position.set(endPt.x, 1.6, endPt.z);
        endSphere.userData.isEndSphere = true;
        scene.add(endSphere);
      }
    }

    // ─── Grid helper (subtle) ───
    const gridHelper = new THREE.GridHelper(
      Math.max(floorW, floorH) * 1.5,
      Math.floor(Math.max(floorW, floorH) * 1.5),
      0x1a3055,
      0x0f1d35
    );
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // ─── Animation loop ───
    const clock = new THREE.Clock();
    function animate() {
      animRef.current = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Animate POI heads (bob)
      scene.traverse((obj) => {
        if (obj.userData.isPOIHead) {
          obj.position.y = POI_PIN_HEIGHT + 0.12 + Math.sin(elapsed * 2 + obj.position.x) * 0.05;
          if (obj.userData.isSelected) {
            ((obj as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity =
              0.3 + 0.3 * Math.sin(elapsed * 3);
          }
        }
        if (obj.userData.isEndSphere) {
          obj.position.y = 1.6 + Math.sin(elapsed * 2) * 0.1;
        }
        if (obj.userData.isRoute) {
          ((obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity =
            0.7 + 0.15 * Math.sin(elapsed * 2);
        }
      });

      // Auto-rotate slowly when not dragging
      if (!isDragging.current) {
        cameraAngle.current.theta += 0.002;
        updateCameraPosition();
      }

      renderer.render(scene, camera);
    }

    animate();

    // ─── Resize handler ───
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // ─── Mouse/Touch controls ───
    const onPointerDown = (e: PointerEvent) => {
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      cameraAngle.current.theta -= dx * 0.005;
      cameraAngle.current.phi = Math.max(0.1, Math.min(Math.PI / 2.2, cameraAngle.current.phi - dy * 0.005));
      lastMouse.current = { x: e.clientX, y: e.clientY };
      updateCameraPosition();
    };
    const onPointerUp = () => {
      isDragging.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraRadius.current = Math.max(5, Math.min(40, cameraRadius.current + e.deltaY * 0.02));
      updateCameraPosition();
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
      scene.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor, route, selectedPoi]);

  function updateCameraPosition() {
    const camera = cameraRef.current;
    if (!camera) return;

    const r = cameraRadius.current;
    const theta = cameraAngle.current.theta;
    const phi = cameraAngle.current.phi;

    camera.position.x = cameraTarget.current.x + r * Math.sin(phi) * Math.cos(theta);
    camera.position.y = cameraTarget.current.y + r * Math.cos(phi);
    camera.position.z = cameraTarget.current.z + r * Math.sin(phi) * Math.sin(theta);
    camera.lookAt(cameraTarget.current);
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0a1628]">
      {/* 3D container */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a1628]/90 z-10">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-[#4285F4] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white font-medium">Loading 3D Map...</p>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-black/50 backdrop-blur-md px-4 py-3 flex items-center gap-3 safe-area-top">
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white text-lg"
        >
          ←
        </button>
        <img src="/dubai-police-logo.png" alt="" className="w-8 h-8 rounded-md object-contain bg-white/90" />
        <div className="flex-1">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">3D Building View</p>
          <h2 className="text-white font-bold text-sm">
            {floor.name?.en || "Floor Plan"}
          </h2>
        </div>
        <div className="bg-[#4285F4]/20 border border-[#4285F4]/30 rounded-lg px-3 py-1.5">
          <span className="text-[#4285F4] text-[10px] font-bold tracking-wider">THREE.JS 3D</span>
        </div>
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-6 left-0 right-0 z-20 flex justify-center pointer-events-none">
        <div className="bg-black/60 backdrop-blur-md rounded-2xl px-5 py-2.5 border border-white/10">
          <p className="text-gray-400 text-xs text-center">
            Drag to rotate · Scroll/Pinch to zoom
          </p>
        </div>
      </div>
    </div>
  );
}
