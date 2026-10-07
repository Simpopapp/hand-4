/** Estrutura de controles: pais reais dos hands e pivôs. */
import * as THREE from "three";
import * as path from "path";
import * as fs from "fs";
void fs;
import { parseGlb, buildNodeTree, sceneBoundingBox } from "./glb";

const ARMS_GLB = path.join(process.cwd(), "prd-proj1-assets/inputs/models/viewmodel_arms.glb");
function loadGlb(p: string) {
  const buf = fs.readFileSync(p);
  return parseGlb(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
}
const armsGlb = loadGlb(ARMS_GLB);
import { applyRenames, REQUIRED_RENAMES, buildFullRig, sceneBoundingBoxOfTree } from "./normalize";

const tree = buildNodeTree(armsGlb);
const byOrig = new Map(tree.byName);
applyRenames(tree, REQUIRED_RENAMES);
for (const nm of [
  "hand.R",
  "hand.L",
  "hand.L.control",
  "hand.R.control",
  "palm_index.L",
  "palm_index.R",
]) {
  const n = byOrig.get(nm);
  if (!n) {
    console.log(`${nm}: AUSENTE`);
    continue;
  }
  const chain: string[] = [];
  let cur: THREE.Object3D | null = n;
  while (cur && chain.length < 6) {
    chain.push(cur.name);
    cur = cur.parent;
  }
  console.log(`${nm}: ${chain.join(" < ")}`);
}
import * as fs0 from "fs";
const RIFLE_GLB = path.join(process.cwd(), "prd-proj1-assets/inputs/models/viewmodel_rifle.glb");
const rbuf = fs0.readFileSync(RIFLE_GLB);
const rifleGlb = parseGlb(
  rbuf.buffer.slice(rbuf.byteOffset, rbuf.byteOffset + rbuf.byteLength) as ArrayBuffer,
);
const rifleTree = buildNodeTree(rifleGlb);
const rawBox = sceneBoundingBox(rifleGlb, rifleTree);
const full = buildFullRig("rifle", rifleTree, tree, REQUIRED_RENAMES, rawBox);
console.log("keys buildFullRig:", Object.keys(full).join(","));
const rig = full;
const root: THREE.Object3D = full.root;
console.log("keys rig:", Object.keys(rig).join(","));
root.updateMatrixWorld(true);
const inv = rig.holder.matrixWorld.clone().invert();
const H = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
const handL = H(tree.byName.get("handL")!);
const ctrlL = H(tree.byName.get("hand.L.control")!);
console.log(
  "handL:",
  handL
    .toArray()
    .map((v) => v.toFixed(4))
    .join(","),
);
console.log(
  "pivo hand.L.control:",
  ctrlL
    .toArray()
    .map((v) => v.toFixed(4))
    .join(","),
  "| dist rest:",
  handL.distanceTo(ctrlL).toFixed(4),
);
// alvo do L (rifle): (-0.028, 0.048, -0.030) — distância ao pivô deve ≈ dist rest
const tgt = new THREE.Vector3(-0.028, 0.048, -0.03);
console.log(
  "dist alvo-pivo:",
  tgt.distanceTo(ctrlL).toFixed(4),
  "(precisa ≈ dist rest para rotação pura)",
);
// R: parent do handR
const handR = tree.byName.get("handR")!;
const chainR: string[] = [];
let cur: THREE.Object3D | null = handR;
while (cur && chainR.length < 6) {
  chainR.push(cur.name);
  cur = cur.parent;
}
console.log("handR: ", chainR.join(" < "));
console.log(
  "handR pos:",
  H(handR)
    .toArray()
    .map((v) => v.toFixed(4))
    .join(","),
);
const ctrlR = byOrig.get("hand.R.control");
if (ctrlR)
  console.log(
    "pivo hand.R.control:",
    H(ctrlR)
      .toArray()
      .map((v) => v.toFixed(4))
      .join(","),
  );
// lista de todos os nós .control
const ctrls = [...tree.byName.keys()].filter((n) => n.includes(".control"));
console.log("controles:", ctrls.join(", "));
