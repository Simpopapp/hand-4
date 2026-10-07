/**
 * Teste de convenção (M2): qual sinal de rotação local X flexiona os dedos,
 * e para que lado aponta cross(palmIndex−wrist, palmPinky−wrist)?
 * Prova numérica no rig de descanso — nada presumido.
 */
import * as THREE from "three";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseGlb, buildNodeTree, sceneBoundingBox } from "./glb";
import {
  WEAPONS,
  buildWeaponRig,
  attachArms,
  applyRenames,
  REQUIRED_RENAMES,
  type WeaponName,
} from "./normalize";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ARMS_GLB = path.join(ROOT, "prd-proj1-assets/inputs/models/viewmodel_arms.glb");

function loadArms(): ReturnType<typeof buildNodeTree> {
  const buf = fs.readFileSync(ARMS_GLB);
  const glb = parseGlb(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  );
  return buildNodeTree(glb);
}

/** rig do jogo com a árvore de braços dada (rotações já aplicadas ou não). */
function buildRig(weapon: WeaponName, arms: ReturnType<typeof buildNodeTree>) {
  const wBuf = fs.readFileSync(
    path.join(ROOT, `prd-proj1-assets/inputs/models/viewmodel_${weapon}.glb`),
  );
  const wGlb = parseGlb(
    wBuf.buffer.slice(wBuf.byteOffset, wBuf.byteOffset + wBuf.byteLength) as ArrayBuffer,
  );
  const wTree = buildNodeTree(wGlb);
  const rawBox = sceneBoundingBox(wGlb, wTree);
  const rig = buildWeaponRig(weapon, wTree, rawBox);
  const root = new THREE.Group();
  root.add(rig.holder);
  applyRenames(arms, REQUIRED_RENAMES);
  const attach = attachArms(arms, rig.holder, weapon);
  if (!attach.ok) throw new Error("attach falhou");
  root.updateMatrixWorld(true);
  return { rig, root };
}

function metrics(weapon: WeaponName, deltas: Map<string, THREE.Euler>) {
  const arms = loadArms();
  for (const [name, e] of deltas) {
    const node = arms.byName.get(name);
    if (!node) throw new Error(`bone ausente: ${name}`);
    node.quaternion.multiply(new THREE.Quaternion().setFromEuler(e));
  }
  const { rig, root } = buildRig(weapon, arms);
  void root;
  const inv = rig.holder.matrixWorld.clone().invert();
  const H = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const w = H(arms.byName.get("handL")!);
  const pi = H(arms.byName.get("palm_index.L")!);
  const pp = H(arms.byName.get("palm_pinky.L")!);
  const n = new THREE.Vector3().crossVectors(pi.clone().sub(w), pp.clone().sub(w)).normalize();
  const tip = H(arms.byName.get("f_middle.03.L")!);
  const q = arms.byName.get("handL")!.getWorldQuaternion(new THREE.Quaternion());
  return { w, n, tip, q };
}

function main() {
  const weapon: WeaponName = "rifle";
  const base = metrics(weapon, new Map());
  console.log(
    `n_rest (holder) = (${base.n.x.toFixed(3)},${base.n.y.toFixed(3)},${base.n.z.toFixed(3)})`,
  );
  const Y = new THREE.Vector3(0, 1, 0).applyQuaternion(base.q);
  const Z = new THREE.Vector3(0, 0, 1).applyQuaternion(base.q);
  console.log(
    `handR frame: +Y=(${Y.toArray()
      .map((v) => v.toFixed(2))
      .join(",")}) +Z=(${Z.toArray()
      .map((v) => v.toFixed(2))
      .join(",")})`,
  );
  console.log(
    `dot(n,+Z_local)=${base.n.dot(Z).toFixed(3)}  dot(n,+Y_local)=${base.n.dot(Y).toFixed(3)}`,
  );

  for (const sign of [1, -1] as const) {
    const d = new Map<string, THREE.Euler>([["f_middle.01.L", new THREE.Euler(sign * 0.8, 0, 0)]]);
    const m = metrics(weapon, d);
    const dTip = m.tip.clone().sub(base.tip);
    console.log(
      `f_middle.01.L X ${sign > 0 ? "+" : "-"}0.8: desloc ponta=(${dTip.x.toFixed(4)},${dTip.y.toFixed(4)},${dTip.z.toFixed(4)}) comp.n=${dTip.dot(base.n).toFixed(4)}`,
    );
  }
  for (const sign of [1, -1] as const) {
    const d = new Map<string, THREE.Euler>([["f_middle.01.L", new THREE.Euler(0, 0, sign * 0.8)]]);
    const m = metrics(weapon, d);
    const dTip = m.tip.clone().sub(base.tip);
    console.log(
      `f_middle.01.L Z ${sign > 0 ? "+" : "-"}0.8: comp.n=${dTip.dot(base.n).toFixed(4)} |d|=${dTip.length().toFixed(4)}`,
    );
  }
}

main();
