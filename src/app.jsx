import { useState, useRef, memo, useEffect } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useControls, button, folder } from "leva";
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
const state = proxy({ current: null, mode: 0 });

function Frustum({ camera }) {
  const projInv = camera.projectionMatrixInverse;

  const frustum_indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1, 1, 4, 3, 1, 3, 2,
  ]);

  const frustum_vertices = [];
  const v0 = new THREE.Vector3(0, 0, 0);
  const v1 = new THREE.Vector3(-1, -1, 1).applyMatrix4(projInv);
  const v2 = new THREE.Vector3(-1, 1, 1).applyMatrix4(projInv);
  const v3 = new THREE.Vector3(1, 1, 1).applyMatrix4(projInv);
  const v4 = new THREE.Vector3(1, -1, 1).applyMatrix4(projInv);
  frustum_vertices.push(v0.x, v0.y, v0.z);
  frustum_vertices.push(v1.x, v1.y, v1.z);
  frustum_vertices.push(v2.x, v2.y, v2.z);
  frustum_vertices.push(v3.x, v3.y, v3.z);
  frustum_vertices.push(v4.x, v4.y, v4.z);

  const frustum_vertices_array = new Float32Array(frustum_vertices);

  return (
    <mesh>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={frustum_vertices_array}
          count={frustum_vertices_array.length / 3}
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
        color="white"
        transparent
        opacity={0.3}
        depthTest={false}
      />
    </mesh>
  );
}

function AuxCamera({ id, initPos }) {
  const snap = useSnapshot(state);
  const cameraRef = useRef(null);
  const focalRef = useRef(null);
  useHelper(cameraRef, THREE.CameraHelper);

  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  // Reference https://stackoverflow.com/questions/11508463/javascript-set-object-key-by-variable
  const [{ pos, near, far, fov, aspect }, set] = useControls(() => ({
    [`Camera ${id}`]: folder({
      pos: {
        x: initPos.x,
        y: initPos.y,
        z: initPos.z,
      },
      near: { value: 0.1, min: 0.01, max: 1, step: 0.05 },
      far: { value: 3, min: 1, max: 10, step: 0.1 },
      fov: { value: 55, min: 0, max: 180, step: 1 },
      aspect: { value: 1.6, min: 0.1, max: 10, step: 0.1 },
    }),
  }));

  useFrame(() => {
    const worldPos = new THREE.Vector3();
    focalRef.current.getWorldPosition(worldPos);
    cameraRef.current.lookAt(worldPos);

    cameraRef.current.getWorldPosition(worldPos);
    set({ pos: { x: worldPos.x, y: worldPos.y, z: worldPos.z } });
  });

  return (
    <object3D position={[pos.x, pos.y, pos.z]}>
      <PerspectiveCamera
        manual
        ref={cameraRef}
        fov={fov}
        aspect={aspect}
        near={near}
        far={far}
        PerspectiveCamera
      >
        <Frustum camera={new THREE.PerspectiveCamera(fov, aspect, near, far)} />
      </PerspectiveCamera>
      <mesh
        ref={focalRef}
        name={id}
        position={[0, 0, -1]}
        onClick={(e) => {
          e.stopPropagation();
          state.current = id;
        }}
        onPointerOver={(e) => (e.stopPropagation(), setHovered(true))}
        onPointerOut={() => setHovered(false)}
        onPointerMissed={(e) => e.type === "click" && (state.current = null)}
        onContextMenu={(e) =>
          snap.current === id &&
          (e.stopPropagation(), (state.mode = (snap.mode + 1) % modes.length))
        }
      >
        <sphereGeometry args={[0.1, 32, 16]} />
        <meshStandardMaterial
          color={snap.current === id ? "hotpink" : "orange"}
        />
      </mesh>
    </object3D>
  );
}

function Controls() {
  // Get notified on changes to state
  const snap = useSnapshot(state);
  const scene = useThree((state) => state.scene);
  return (
    <>
      {/* As of drei@7.13 transform-controls can refer to the target by children, or the object prop */}
      {snap.current && (
        <>
          <TransformControls object={scene.getObjectByName(snap.current)} />
          <TransformControls
            object={scene.getObjectByName(snap.current).parent}
            mode={modes[snap.mode]}
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

function App() {
  const { height, radius, color } = useControls({
    Add: button(() => {
      // console.log(useThree())
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
          {/* <pointLight position={[10, 10, 10]} /> */}
          <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[radius, radius, height, 32]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <AuxCamera id={"C0"} initPos={new THREE.Vector3(0, 1, 2.5)} />
          <AuxCamera id={"C1"} initPos={new THREE.Vector3(0.5, 1, 2.5)} />
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
