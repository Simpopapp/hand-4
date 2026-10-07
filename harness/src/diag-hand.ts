/**
 * Diagnóstico M2: por que as pontas dos dedos R não chegam ao grip?
 * 1. posições de descanso das pontas R vs âncora (espaço do holder, rifle);
 * 2. varredura de orientação do hand.R (sozinho) → melhor distância de ponta;
 * 3. com melhor hand.R, curl de dedos sozinho → distâncias alcançáveis;
 * 4. axis-curl: qual eixo local (X/Y/Z) dobra o dedo em direção à palma.
 */
import * as THREE from "three";
import { buildNodeTree, sceneBoundingBox, parseGlb } from "./glb";
import { WEAPONS, buildWeaponRig, attachArms, applyRenames, type WeaponName } from "./normalize";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const armsBuf = fs.readFileSync(path.join(ROOT, "prd-proj1-assets/inputs/models/viewmodel_arms.glb"));
const armsGlb = parseGlb(armsBuf.buffer.slice(armsBuf.byteOffset, armsBuf.byteOffset + armsBuf.byteLength) as ArrayBuffer);
const armsRest = buildNodeTree(armsGlb);

function rig(weapon: WeaponName) {
  const buf = fs.readFileSync(path.join(ROOT, `prd-proj1-assets/inputs/models/viewmodel_${weapon}.glb`));
  const glb = parseGlb(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  const tree = buildNodeTree(glb);
  const rawBox = sceneBoundingBox(glb, tree);
  const r = buildWeaponRig(weapon, tree, rawBox);
  const root = new THREE.Group();
  root.add(r.holder);
  return { rig: r, root };
}

const TIPS = ["f_index.03.R", "f_middle.03.R", "f_ring.03.R", "f_pinky.03.R", "thumb.03.R"];

function evaluate(weapon: WeaponName, deltas: Map<string, THREE.Euler>) {
  const tree = buildNodeTree(armsGlb);
  for (const [name, e] of deltas) {
    const node = tree.byName.get(name);
    const rest = armsRest.byName.get(name)!.quaternion;
    node!.quaternion.copy(rest).multiply(new THREE.Quaternion().setFromEuler(e));
  }
  const { rig: r, root } = rig(weapon);
  applyRenames(tree, { "hand.R": "handR", "hand.L": "handL" });
  const attach = attachArms(tree, r.holder, weapon);
  root.updateMatrixWorld(true);
  const inv = r.holder.matrixWorld.clone().invert();
  const H = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const tips: Record<string, THREE.Vector3> = {};
  for (const t of TIPS) tips[t] = H(tree.byName.get(t)!);
  const handR = H(tree.byName.get("handR")!);
  // frame do handR no espaço do holder
  const q = tree.byName.get("handR")!.getWorldQuaternion(new THREE.Quaternion());
  const frame = {
    X: new THREE.Vector3(1, 0, 0).applyQuaternion(q),
    Y: new THREE.Vector3(0, 1, 0).applyQuaternion(q),
    Z: new THREE.Vector3(0, 0, 1).applyQuaternion(q),
  };
  return { tips, handR, frame, ok: attach.ok };
}

function show(weapon: WeaponName, label: string, deltas: Map<string, THREE.Euler>) {
  const { tips, handR, frame, ok } = evaluate(weapon, deltas);
  const anchor = WEAPONS[weapon].armsHandR as [number, number, number];
  console.log(`\n== ${weapon} ${label} (ok=${ok}) ==`);
  console.log(`handR no holder: (${handR.x.toFixed(4)},${handR.y.toFixed(4)},${handR.z.toFixed(4)})`);
  console.log(`frame handR: X=(${frame.X.toArray().map((v) => v.toFixed(2)).join(",")}) Y=(${frame.Y.toArray().map((v) => v.toFixed(2)).join(",")}) Z=(${frame.Z.toArray().map((v) => v.toFixed(2)).join(",")})`);
  for (const t of TIPS) {
    const dA = tips[t].distanceTo(new THREE.Vector3(...anchor));
    const rel = tips[t].clone().sub(handR);
    console.log(`${t.padEnd(14)} d_âncora=${dA.toFixed(4)} rel_handR=(${rel.x.toFixed(3)},${rel.y.toFixed(3)},${rel.z.toFixed(3)})`);
  }
}

function main() {
  const weapon: WeaponName = "rifle";
  const rest = new Map<string, THREE.Euler>();
  show(weapon, "descanso (sem delta)", rest);

  // varredura: rotação do hand.R em torno dos eixos do frame local
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const anchor = new THREE.Vector3(...(WEAPONS[weapon].armsHandR as [number, number, number]));
  console.log("\n-- varredura hand.R (só ele) → dist máx/min das pontas à âncora --");
  for (const [axisName, axis] of [["X", X], ["Y", Y], ["Z", Z]] as const) {
    let best = Infinity, bestAng = 0;
    for (let deg = 0; deg <= 360; deg += 15) {
      const d = new Map<string, THREE.Euler>([["hand.R", new THREE.Euler()]]);
      // rotação sobre eixo global aproximada por euler ZYX? usa quaternion direto:
      // aplica delta em espaço local: hand.R gira em seu frame de descanso
      const dq = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(deg));
      const node = armsRest.byName.get("hand.R")!;
      const nodeQ = node.quaternion.clone().multiply(dq);
      const e = new THREE.Euler().setFromQuaternion(nodeQ, "XYZ");
      // evaluate aplica rest*euler; extrair euler tal que rest*E = nodeQ:
      const restQ = node.quaternion.clone();
      const E = new THREE.Quaternion().copy(restQ).invert().multiply(nodeQ);
      const eu = new THREE.Euler().setFromQuaternion(E, "XYZ");
      d.set("hand.R", eu);
      const { tips } = evaluate(weapon, d);
      const maxd = Math.max(...TIPS.map((t) => tips[t].distanceTo(anchor)));
      if (maxd < best) { best = maxd; bestAng = deg; }
    }
    console.log(`eixo ${axisName}: melhor d_max=${best.toFixed(4)} @ ${bestAng}°`);
  }

  // com a melhor orientação bruta, curl de dedos: só rotação X local dos dedos
  console.log("\n-- curl puro dos dedos (rotação X local), hand.R na melhor orientação --");
  const curlTest = new Map<string, THREE.Euler>([["hand.R", new THREE.Euler(1.4, -0.02, 0.8)]]);
  show(weapon, "hand.R=(1.4,-0.02,0.8)", curlTest);
  for (const deg of [30, 60, 90]) {
    const d = new Map<string, THREE.Euler>([["hand.R", new THREE.Euler(1.4, -0.02, 0.8)]]);
    for (const ch of FINGERS) d.set(ch, new THREE.Euler(THREE.MathUtils.degToRad(deg), 0, 0));
    show(weapon, `hand.R=(1.4,-0.02,0.8) + dedos X ${deg}°`, d);
  }
}

const FINGERS = [
  "f_index.01.R", "f_index.02.R",
  "f_middle.01.R", "f_middle.02.R",
  "f_ring.01.R", "f_ring.02.R",
  "f_pinky.01.R", "f_pinky.02.R",
];

main();
