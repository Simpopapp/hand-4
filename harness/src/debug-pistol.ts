/**
 * Debug M2: semântica de rotação + centralização da pistola.
 * 1) Euler.set em Group novo preserva 'XYZ' (game) vs 'YXZ' (harness)?
 * 2) Por que o bbox do mesh da pistola não fica centrado no holder?
 */
import * as THREE from "three";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseGlb, buildNodeTree, sceneBoundingBox } from "./glb";
import { buildFullRig, REQUIRED_RENAMES, WEAPONS } from "./normalize";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// 1) semântica do Euler.set no jogo
const g = new THREE.Group();
g.rotation.set(Math.PI / 2, Math.PI / 2, 0);
console.log("Group.rotation.order após .set(x,y,z):", g.rotation.order);
const eYXZ = new THREE.Euler(Math.PI / 2, Math.PI / 2, 0, "YXZ");
const mXYZ = new THREE.Matrix4().makeRotationFromEuler(g.rotation);
const mYXZ = new THREE.Matrix4().makeRotationFromEuler(eYXZ);
for (const [name, m] of [["XYZ (jogo?)", mXYZ], ["YXZ (harness)", mYXZ]] as const) {
  for (const axis of ["x", "y", "z"]) {
    const v = new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0).applyMatrix4(m);
    console.log(`  ${name}: +${axis} → (${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)})`);
  }
}

// 2) centralização da pistola
const buf = fs.readFileSync(path.join(ROOT, "prd-proj1-assets/inputs/models/viewmodel_pistol.glb"));
const glb = parseGlb(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
const tree = buildNodeTree(glb);
const rawBox = sceneBoundingBox(glb, tree);
const rig = buildFullRig("pistol", tree, buildNodeTree(parseGlb(fs.readFileSync(path.join(ROOT, "prd-proj1-assets/inputs/models/viewmodel_arms.glb")).buffer.slice(0) as unknown as ArrayBuffer)), REQUIRED_RENAMES, rawBox);
rig.root.updateMatrixWorld(true);

console.log("\npistol: model.scale =", rig.scale.toFixed(6));
console.log("group.rotation =", rig.group.rotation.x.toFixed(4), rig.group.rotation.y.toFixed(4), rig.group.rotation.z.toFixed(4), "order:", rig.group.rotation.order);
console.log("group.position =", rig.group.position.toArray().map((x) => x.toFixed(5)).join(","));

// centro via mesma via do buildWeaponRig
model: {
  const worldBox = new THREE.Box3();
  const tmp = new THREE.Box3();
  tree.root.updateMatrixWorld(true);
  for (const [idx, localBox] of tree.meshBoxes) {
    tmp.copy(localBox).applyMatrix4(tree.nodes[idx].matrixWorld);
    worldBox.union(tmp);
  }
  const c = worldBox.getCenter(new THREE.Vector3());
  console.log("worldBox (world) center =", c.toArray().map((x) => x.toFixed(5)).join(","));
  const holderInv = rig.holder.matrixWorld.clone().invert();
  const cHolder = c.clone().applyMatrix4(holderInv);
  console.log("→ centro em espaço do holder =", cHolder.toArray().map((x) => x.toFixed(5)).join(","));
  const local = worldBox.clone().applyMatrix4(holderInv);
  console.log("worldBox em holder: min(", local.min.toArray().map((x) => x.toFixed(4)).join(","), ") max(", local.max.toArray().map((x) => x.toFixed(4)).join(","), ")");
}

// onde os CORNOS do mesh caem no holder
const meshIdx = (glb.json.nodes ?? []).findIndex((n: any) => n.mesh !== undefined);
const localBox = tree.meshBoxes.get(meshIdx)!;
const holderInv2 = rig.holder.matrixWorld.clone().invert();
for (const cx of [localBox.min.x, localBox.max.x])
  for (const cy of [localBox.min.y, localBox.max.y])
    for (const cz of [localBox.min.z, localBox.max.z]) {
      const v = new THREE.Vector3(cx, cy, cz).applyMatrix4(tree.nodes[meshIdx].matrixWorld).applyMatrix4(holderInv2);
      console.log(`corno local (${cx.toFixed(2)},${cy.toFixed(2)},${cz.toFixed(2)}) → holder (${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)})`);
    }

// gltf.scene real tem quantos nós? e a arma tem mesh(es) em qual(is) nó(s)?
console.log("\nnodes json:", JSON.stringify(glb.json.nodes?.map((n: any, i: number) => ({ i, name: n.name, mesh: n.mesh, scale: n.scale, rotation: n.rotation, translation: n.translation, children: n.children })), null, 1));
console.log("scene nodes:", glb.json.scenes?.[0]?.nodes);
void WEAPONS;
