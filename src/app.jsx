import { useState, useRef, memo, useEffect } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useControls, folder } from "leva";
import {
  OrbitControls,
  TransformControls,
  GizmoHelper,
  GizmoViewport,
  Grid,
  Environment,
  PerspectiveCamera,
  useHelper,
  useCursor,
  AccumulativeShadows,
  RandomizedLight,
} from "@react-three/drei";
import { proxy, useSnapshot } from "valtio";
import "./app.css";

// Reactive state model, using Valtio ...
const modes = ["translate", "rotate"];
const state = proxy({
  focal: null,
  focalPos: [],
  leftHandlePos: [],
  rightHandlePos: [],
  mode: 0,
});

function ComputeFrustumVertices(fov, aspect, near, far) {
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  const projInv = camera.projectionMatrixInverse;
  const frustumVertices = [];
  const v0 = new THREE.Vector3(0, 0, 0);
  const v1 = new THREE.Vector3(-1, -1, 1).applyMatrix4(projInv);
  const v2 = new THREE.Vector3(-1, 1, 1).applyMatrix4(projInv);
  const v3 = new THREE.Vector3(1, 1, 1).applyMatrix4(projInv);
  const v4 = new THREE.Vector3(1, -1, 1).applyMatrix4(projInv);
  frustumVertices.push(v0.x, v0.y, v0.z);
  frustumVertices.push(v1.x, v1.y, v1.z);
  frustumVertices.push(v2.x, v2.y, v2.z);
  frustumVertices.push(v3.x, v3.y, v3.z);
  frustumVertices.push(v4.x, v4.y, v4.z);

  return new Float32Array(frustumVertices);
}

function ComputeSplineVertices(curve, samples) {
  const curvePoints = curve.getPoints(samples);
  const verts = [];
  for (let i = 0; i < samples; i++) {
    verts.push(curvePoints[i].x, curvePoints[i].y, curvePoints[i].z);
  }
  return new Float32Array(verts);
}

function Frustum({ fov, aspect, near, far }) {
  const frustumRef = useRef(null);

  const frustum_indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1, 1, 4, 3, 1, 3, 2,
  ]);

  const { opacity, color } = useControls("Frustum", {
    opacity: { value: 0.07, min: 0.0, max: 1, step: 0.01 },
    color: "#ffffff",
  });

  useEffect(() => {
    frustumRef.current.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        ComputeFrustumVertices(fov, aspect, near, far),
        3,
      ),
    );
  }, [fov, aspect, near, far]);

  const frustumVertices_array = ComputeFrustumVertices(fov, aspect, near, far);

  return (
    <mesh ref={frustumRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={frustumVertices_array}
          count={frustumVertices_array.length / 3}
          itemSize={3}
        />
        <bufferAttribute
          attach="index"
          array={frustum_indices}
          count={frustum_indices.length}
          itemSize={1}
        />
      </bufferGeometry>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthTest={false}
      />
    </mesh>
  );
}

function AuxCamera({ id, initPos, initRot, initFocal }) {
  const snap = useSnapshot(state);
  const cameraRef = useRef(null);
  const focalRef = useRef(null);
  const leftHandleRef = useRef(null);
  const rightHandleRef = useRef(null);
  const lineRef = useRef(null);

  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const [
    {
      pos,
      rot,
      foc,
      near,
      far,
      fov,
      aspect,
      frustum,
      helper,
      leftHandle,
      rightHandle,
    },
    set,
  ] = useControls(() => ({
    // Reference https://stackoverflow.com/questions/11508463/javascript-set-object-key-by-variable
    [`Camera ${id}`]: folder({
      pos: {
        x: initPos.x,
        y: initPos.y,
        z: initPos.z,
      },
      rot: {
        x: initRot.x,
        y: initRot.y,
        z: initRot.z,
      },
      foc: {
        x: initFocal.x,
        y: initFocal.y,
        z: initFocal.z,
      },
      near: { value: 0.1, min: 0.01, max: 1, step: 0.05 },
      far: { value: 3, min: 1, max: 10, step: 0.1 },
      fov: { value: 55, min: 0, max: 180, step: 1 },
      aspect: { value: 1.6, min: 0.1, max: 10, step: 0.1 },
      frustum: true,
      helper: true,
      leftHandle: { value: 0.5, min: 0.1, max: 2, step: 0.1 },
      rightHandle: { value: 0.5, min: 0.1, max: 2, step: 0.1 },
    }),
  }));

  if (helper) {
    useHelper(cameraRef, THREE.CameraHelper);
  }

  // I wish I could put these in TransformControls callback (hack global useControls), but
  // 1. leva doesn't support duplicated entry in single useControls
  // 2. I am not allowed to use hooks in a for loop
  useFrame(() => {
    const worldPos = new THREE.Vector3();
    const worldQua = new THREE.Quaternion();

    const lineVertices = [];
    lineVertices.push(
      leftHandleRef.current.position.x,
      leftHandleRef.current.position.y,
      leftHandleRef.current.position.z,
    );
    lineVertices.push(
      rightHandleRef.current.position.x,
      rightHandleRef.current.position.y,
      rightHandleRef.current.position.z,
    );
    lineRef.current.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(lineVertices, 3),
    );

    cameraRef.current.getWorldPosition(worldPos);
    cameraRef.current.getWorldQuaternion(worldQua);

    const worldRot = new THREE.Euler().setFromQuaternion(worldQua);
    set({ pos: { x: worldPos.x, y: worldPos.y, z: worldPos.z } });
    set({ rot: { x: worldRot.x, y: worldRot.y, z: worldRot.z } });

    focalRef.current.getWorldPosition(worldPos);
    set({ foc: { x: worldPos.x, y: worldPos.y, z: worldPos.z } });
    state.focalPos[id] = new THREE.Vector3().copy(worldPos);

    leftHandleRef.current.getWorldPosition(worldPos);
    state.leftHandlePos[id] = new THREE.Vector3().copy(worldPos);
    rightHandleRef.current.getWorldPosition(worldPos);
    state.rightHandlePos[id] = new THREE.Vector3().copy(worldPos);
  });

  const z_depth = -new THREE.Vector3(pos.x, pos.y, pos.z)
    .sub(new THREE.Vector3(foc.x, foc.y, foc.z))
    .length();

  return (
    <>
      <PerspectiveCamera
        manual
        name={`${id}_cam`}
        ref={cameraRef}
        fov={fov}
        aspect={aspect}
        near={near}
        far={far}
        position={[pos.x, pos.y, pos.z]}
        rotation={[rot.x, rot.y, rot.z]}
        PerspectiveCamera
      >
        <mesh
          name={`${id}_left`}
          ref={leftHandleRef}
          position={[-leftHandle, 0, z_depth]}
        >
          <sphereGeometry args={[0.05, 32, 16]} />
          <meshStandardMaterial
            color={snap.focal === id ? "hotpink" : "orange"}
          />
        </mesh>
        <mesh
          name={`${id}_right`}
          ref={rightHandleRef}
          position={[rightHandle, 0, z_depth]}
        >
          <sphereGeometry args={[0.05, 32, 16]} />
          <meshStandardMaterial
            color={snap.focal === id ? "hotpink" : "orange"}
          />
        </mesh>
        <line ref={lineRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              array={new Float32Array([-1, 0, z_depth, 1, 0, z_depth])}
              count={2}
              itemSize={3}
            />
          </bufferGeometry>
          <lineDashedMaterial />
        </line>
        {frustum && <Frustum fov={fov} aspect={aspect} near={near} far={far} />}
      </PerspectiveCamera>
      <mesh
        ref={focalRef}
        name={id}
        position={[foc.x, foc.y, foc.z]}
        onClick={(e) => {
          e.stopPropagation();
          state.focal = id;
        }}
        onPointerOver={(e) => (e.stopPropagation(), setHovered(true))}
        onPointerOut={() => setHovered(false)}
        onPointerMissed={(e) => {
          if (e.type === "click") {
            state.focal = null;
          }
        }}
        onContextMenu={(e) =>
          snap.focal === id &&
          (e.stopPropagation(), (state.mode = (snap.mode + 1) % modes.length))
        }
      >
        <sphereGeometry args={[0.1, 32, 16]} />
        <meshStandardMaterial
          color={snap.focal === id ? "hotpink" : "orange"}
        />
      </mesh>
    </>
  );
}

function Controls() {
  // Get notified on changes to state
  const snap = useSnapshot(state);
  const scene = useThree((state) => state.scene);

  const focal = snap.focal ? scene.getObjectByName(snap.focal) : undefined;
  const cam = snap.focal
    ? scene.getObjectByName(`${snap.focal}_cam`)
    : undefined;
  const leftHandle = snap.focal
    ? scene.getObjectByName(`${snap.focal}_left`)
    : undefined;
  const rightHandle = snap.focal
    ? scene.getObjectByName(`${snap.focal}_right`)
    : undefined;

  const worldPos = new THREE.Vector3();
  const updateFocal = () => {
    focal.getWorldPosition(worldPos);
    const focalPos = new THREE.Vector3().copy(worldPos);
    cam.lookAt(worldPos);
    cam.getWorldPosition(worldPos);
    const camPos = new THREE.Vector3().copy(worldPos);

    const z_depth = -camPos.sub(focalPos).length();
    leftHandle.position.z = z_depth;
    rightHandle.position.z = z_depth;
  };

  return (
    <>
      {snap.focal && (
        <>
          <TransformControls
            object={focal}
            onObjectChange={() => {
              updateFocal();
            }}
          />
          <TransformControls
            object={cam}
            mode={modes[snap.mode]}
            onObjectChange={() => {
              updateFocal();
            }}
          />
        </>
      )}
      {/* makeDefault makes the controls known to r3f, now transform-controls can auto-disable them when active */}
      <OrbitControls
        makeDefault
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 1.75}
      />
    </>
  );
}

function CameraBundle({ count, initHeight }) {
  useEffect(() => {
    state.focal = null;
  }, [count]);

  const interval = 2.0;

  const offset = (-interval * (count - 1)) / 2;
  const focal = new THREE.Vector3(0, initHeight, 0);
  const up = new THREE.Vector3(0, 1, 0);

  return [...Array(count).keys()].map((id) => {
    const initPos = new THREE.Vector3(offset + interval * id, initHeight, 2.5);
    const initRot = new THREE.Euler().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(initPos, focal, up),
    );
    const diff = new THREE.Vector3().copy(focal).sub(initPos).normalize();
    const initFocal = new THREE.Vector3().copy(initPos).add(diff);

    // Too lazy to calculate
    if (!(`${id}` in state.leftHandlePos)) {
      state.focalPos[id] = initFocal;
      state.leftHandlePos[id] = initPos;
      state.rightHandlePos[id] = initPos;
    }

    return (
      <AuxCamera
        key={id}
        id={`${id}`}
        initPos={initPos}
        initRot={initRot}
        initFocal={initFocal}
      />
    );
  });
}

const Shadows = memo(() => (
  <AccumulativeShadows
    temporal
    frames={100}
    color="#9d4b4b"
    colorBlend={0.5}
    alphaTest={0.9}
    scale={20}
  >
    <RandomizedLight amount={8} radius={4} position={[5, 5, -10]} />
  </AccumulativeShadows>
));

function Spline({ count }) {
  const splineRef = useRef(null);

  const { width, samples, color } = useControls("Spline", {
    width: { value: 5, min: 0.01, max: 20, step: 0.5 },
    samples: { value: 200, min: 20, max: 1000, step: 10 },
    color: "#ffffff",
  });

  const computeCurve = () => {
    const focalPos = state.focalPos.slice(0, count);
    const leftPos = state.leftHandlePos.slice(0, count);
    const rightPos = state.rightHandlePos.slice(0, count);

    const verts = [];
    for (let i = 0; i < focalPos.length - 1; i++) {
      const curve = new THREE.CubicBezierCurve3(
        focalPos[i],
        rightPos[i],
        leftPos[i + 1],
        focalPos[i + 1],
      );
      const points = curve.getPoints(samples);
      for (let i = 0; i < samples; i++) {
        verts.push(points[i].x, points[i].y, points[i].z);
      }
    }
    return new Float32Array(verts);
  };

  useFrame(() => {
    if (count > 1) {
      splineRef.current.geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(computeCurve(), 3),
      );
    }
  });

  return (
    <>
      {count > 1 && (
        <line ref={splineRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              array={computeCurve()}
              count={samples}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial linewidth={width} color={color} />
        </line>
      )}
    </>
  );
}

function App() {
  const { count, height, radius, color } = useControls({
    Camera: folder({
      count: { value: 4, min: 0, max: 10, step: 1 },
    }),
    Cylinder: folder({
      height: { value: 1.75, min: 0.1, max: 3, step: 0.1 },
      radius: { value: 0.3, min: 0.01, max: 1, step: 0.05 },
      color: "#9d4b4b",
    }),
  });

  return (
    <>
      <div style={{ aspectRatio: 1 / 0.6, margin: "0 auto" }}>
        <Canvas shadows camera={{ position: [0, 5, 5], fov: 55 }}>
          <color attach="background" args={["#4F4F4F"]} />
          <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[radius, radius, height, 32]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <CameraBundle count={count} initHeight={height / 2} />
          <Spline count={count} />
          <Grid
            position={[0, -0.01, 0]}
            args={[10, 10]}
            fadeStrength={1}
            fadeDistance={40}
            infiniteGrid={true}
            cellSize={0.6}
            cellThickness={1.0}
            cellColor="#6f6f6f"
            sectionSize={3.0}
            sectionThickness={1.5}
            sectionColor="#319BFF"
          />
          <Environment preset="city" />
          <Shadows />
          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport
              axisColors={["#9d4b4b", "#2f7f4f", "#3b5b9d"]}
              labelColor="white"
            />
          </GizmoHelper>
          <Controls />
        </Canvas>
      </div>
    </>
  );
}

export default App;
