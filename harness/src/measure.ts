/**
 * M2 — medir antes de posar. Sem correção a olho: tudo sai da geometria.
 * v2: arms tree FRESCO por rig (attach do jogo muta o root — reuso polui).
 *
 * Saídas (espaço do holder, após a normalização do jogo):
 * 1. nomes + bbox por mesh da arma;
 * 2. análise do grip: vértices por região, eixo por PCA;
 * 3. rig dos braços em descanso pós-attach: posições/eixos dos bones-chave.
 *
 * Execução: bun harness/src/measure.ts
 */
import * as THREE from "three";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GlbData, BuiltTree } from "./glb";
import { parseGlb, buildNodeTree, sceneBoundingBox, readAccessor } from "./glb";
import { WEAPONS, buildFullRig, REQUIRED_RENAMES, type WeaponName } from "./normalize";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ARMS_GLB = path.join(ROOT, "prd-proj1-assets/inputs/models/viewmodel_arms.glb");
const WEAPON_GLBS: Record<WeaponName, string> = {
  rifle: path.join(ROOT, "prd-proj1-assets/inputs/models/viewmodel_rifle.glb"),
  pistol: path.join(ROOT, "prd-proj1-assets/inputs/models/viewmodel_pistol.glb"),
};

function loadGlb(p: string): { glb: GlbData; tree: BuiltTree } {
  const buf = fs.readFileSync(p);
  const glb = parseGlb(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  return { glb, tree: buildNodeTree(glb) };
}

/** Vértices POSITION de um nó-mesh em espaço do holder. */
function nodeVerticesHolder(
  g: GlbData,
  tree: BuiltTree,
  nodeIndex: number,
  holderInv: THREE.Matrix4,
): THREE.Vector3[] {
  const n = g.json.nodes[nodeIndex];
  const out: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4().multiplyMatrices(holderInv, tree.nodes[nodeIndex].matrixWorld);
  for (const prim of g.json.meshes[n.mesh].primitives ?? []) {
    const acc = readAccessor(g, prim.attributes.POSITION);
    if (acc.numComp !== 3) continue;
    for (let i = 0; i < acc.count; i++) {
      v.set(acc.data[i * 3], acc.data[i * 3 + 1], acc.data[i * 3 + 2]).applyMatrix4(m);
      out.push(v.clone());
    }
  }
  return out;
}

function pcaAxis(points: THREE.Vector3[]): {
  center: THREE.Vector3;
  axes: THREE.Vector3[];
  lambdas: number[];
} {
  const c = new THREE.Vector3();
  points.forEach((v) => c.add(v));
  c.multiplyScalar(1 / points.length);
  const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  points.forEach((v) => {
    const d = [v.x - c.x, v.y - c.y, v.z - c.z];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) cov[a * 3 + b] += d[a] * d[b];
  });
  const A = [
    [cov[0], cov[1], cov[2]],
    [cov[3], cov[4], cov[5]],
    [cov[6], cov[7], cov[8]],
  ];
  for (let sweep = 0; sweep < 60; sweep++) {
    for (let p = 0; p < 2; p++)
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(A[p][q]) < 1e-14) continue;
        const theta = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]);
        const cs = Math.cos(theta), sn = Math.sin(theta);
        for (let k = 0; k < 3; k++) {
          const kp = A[k][p], kq = A[k][q];
          A[k][p] = cs * kp - sn * kq;
          A[k][q] = sn * kp + cs * kq;
        }
      }
  }
  const ev = [A[0][0], A[1][1], A[2][2]];
  const order = ev.map((v, i) => [v, i] as [number, number]).sort((a, b) => b[0] - a[0]);
  const axes = order.map(([, idx]) =>
    new THREE.Vector3(A[0][idx], A[1][idx], A[2][idx]).normalize(),
  );
  return { center: c, axes, lambdas: order.map(([v]) => v) };
}

function extentAlong(points: THREE.Vector3[], axis: THREE.Vector3, c: THREE.Vector3): [number, number] {
  let tmin = Infinity, tmax = -Infinity;
  points.forEach((v) => {
    const t = v.clone().sub(c).dot(axis);
    if (t < tmin) tmin = t;
    if (t > tmax) tmax = t;
  });
  return [tmin, tmax];
}

function fmt(v: THREE.Vector3, d = 4): string {
  return `(${v.x.toFixed(d)},${v.y.toFixed(d)},${v.z.toFixed(d)})`;
}

function buildRigFresh(weapon: WeaponName) {
  const arms = loadGlb(ARMS_GLB);
  const w = loadGlb(WEAPON_GLBS[weapon]);
  const rawBox = sceneBoundingBox(w.glb, w.tree);
  const rig = buildFullRig(weapon, w.tree, arms.tree, REQUIRED_RENAMES, rawBox);
  rig.root.updateMatrixWorld(true);
  return { rig, arms: arms.tree, armsGlb: arms.glb, wGlb: w.glb, wTree: w.tree };
}

function main(): void {
  for (const weapon of ["rifle", "pistol"] as const) {
    const { rig, wGlb, wTree } = buildRigFresh(weapon);
    const holderInv = rig.holder.matrixWorld.clone().invert();
    console.log(`\n================ ${weapon} ================`);

    // nomes: nós-mesh podem ser anônimos — usa o nome do pai / mesh
    console.log(`-- meshes em espaço do holder (nome | min | max | center) --`);
    (wGlb.json.nodes ?? []).forEach((n: any, i: number) => {
      if (n.mesh === undefined) return;
      const localBox = wTree.meshBoxes.get(i)!.clone().applyMatrix4(wTree.nodes[i].matrixWorld).applyMatrix4(holderInv);
      const meshName = wGlb.json.meshes[n.mesh].name ?? `mesh_${n.mesh}`;
      const parent = n.parentIndex !== undefined ? `parent=${wGlb.json.nodes[n.parentIndex]?.name ?? "?"}` : "";
      const c = localBox.getCenter(new THREE.Vector3());
      console.log(
        `${`node_${i}[${meshName}]${parent ? " " + parent : ""}`.padEnd(34)} min(${localBox.min.x.toFixed(4)},${localBox.min.y.toFixed(4)},${localBox.min.z.toFixed(4)}) max(${localBox.max.x.toFixed(4)},${localBox.max.y.toFixed(4)},${localBox.max.z.toFixed(4)}) c(${c.x.toFixed(4)},${c.y.toFixed(4)},${c.z.toFixed(4)})`,
      );
    });

    // análise do grip por região
    const anchor = new THREE.Vector3(...WEAPONS[weapon].armsHandR);
    const all: THREE.Vector3[] = [];
    const perNode = new Map<number, THREE.Vector3[]>();
    (wGlb.json.nodes ?? []).forEach((n: any, i: number) => {
      if (n.mesh === undefined) return;
      const vs = nodeVerticesHolder(wGlb, wTree, i, holderInv);
      perNode.set(i, vs);
      all.push(...vs);
    });
    console.log(`\nâncora punho: ${fmt(anchor)}  total vértices: ${all.length}`);

    // região de grip (definição geométrica por arma, medida por bbox/fatias acima)
    let grip: THREE.Vector3[];
    if (weapon === "rifle") {
      // pistola-grip do M4A1: abaixo do centro, atrás do gatilho, à direita da culatra
      grip = all.filter((v) => v.y < -0.005 && v.z > 0.075 && v.z < 0.19 && Math.abs(v.x) < 0.02);
      console.log(`grip rifle: fatia y<−0.005, z∈[0.075,0.19], |x|<0.02 → ${grip.length} vértices`);
    } else {
      // glock: parte traseira-inferior (punho), z atrás do centro
      grip = all.filter((v) => v.z > 0.015 && v.y < 0.005);
      console.log(`grip pistol: fatia z>0.015, y<0.005 → ${grip.length} vértices`);
    }
    if (grip.length > 8) {
      const { center, axes, lambdas } = pcaAxis(grip);
      console.log(`grip centro: ${fmt(center)}`);
      axes.forEach((a, i) => {
        const [tmin, tmax] = extentAlong(grip, a, center);
        console.log(`eixo[${i}] λ=${lambdas[i].toExponential(2)} dir=${fmt(a, 3)} ext=[${tmin.toFixed(4)},${tmax.toFixed(4)}]`);
      });
      const box = new THREE.Box3().setFromPoints(grip);
      console.log(`grip bbox: min${fmt(box.min)} max${fmt(box.max)}`);
      // face frontal (em direção ao -Z) e lateral: distribuição de x por faixa de y
      for (const axisName of ["x", "y", "z"] as const) {
        const comp = axisName === "x" ? 0 : axisName === "y" ? 1 : 2;
        const bins = new Map<number, number>();
        for (const v of grip) {
          const k = Math.round(v.getComponent(comp) * 200) / 200;
          bins.set(k, (bins.get(k) ?? 0) + 1);
        }
        const s = [...bins.entries()].sort((a, b) => a[0] - b[0]);
        const stride = Math.max(1, Math.floor(s.length / 30));
        let line = "";
        for (let i = 0; i < s.length; i += stride) line += `${s[i][0].toFixed(3)}:${s[i][1]} `;
        console.log(`dist ${axisName}: ${line}`);
      }
      // âncora vs grip
      console.log(`dist(âncora, centro grip) = ${anchor.distanceTo(center).toFixed(4)}m`);
    }

    // onde estão os vértices mais próximos da âncora (para calibrar alvo dos dedos)
    let best = Infinity, bestV: THREE.Vector3 | null = null;
    for (const v of all) {
      const d = v.distanceTo(anchor);
      if (d < best) { best = d; bestV = v; }
    }
    console.log(`vértice mais próximo da âncora: d=${best.toFixed(4)}m em ${fmt(bestV!)}`);
  }

  // ============ braços: descanso pós-attach (FRESCO por arma) ============
  console.log(`\n================ braços (descanso, pós-attach fresco) ================`);
  for (const weapon of ["rifle", "pistol"] as const) {
    const { rig, arms, armsGlb } = buildRigFresh(weapon);
    const holderInv = rig.holder.matrixWorld.clone().invert();
    console.log(`\n-- ${weapon} --`);
    const names = [
      "clavicle.R", "deltoid.R", "upper_arm.R", "forearm.R", "handR",
      "palm_index.R", "palm_ring.R", "palm_pinky.R",
      "f_index.01.R", "f_index.02.R", "f_index.03.R", "f_middle.03.R", "f_ring.03.R", "f_pinky.03.R", "thumb.03.R",
      "clavicle.L", "deltoid.L", "upper_arm.L", "forearm.L", "handL", "palm_index.L",
    ];
    for (const nm of names) {
      const b = arms.byName.get(nm);
      if (!b) { console.log(`${nm.padEnd(14)} AUSENTE`); continue; }
      const p = b.getWorldPosition(new THREE.Vector3()).applyMatrix4(holderInv);
      console.log(`${nm.padEnd(14)} ${fmt(p)}`);
    }
    // eixo +Y (direção do bone) e frame local em espaço do holder
    for (const nm of ["handR", "forearm.R", "upper_arm.R", "forearm.L", "handL"]) {
      const b = arms.byName.get(nm)!;
      const q = b.getWorldQuaternion(new THREE.Quaternion());
      const y = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const x = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const z = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      console.log(`${nm} frame holder: +Y(bone)=${fmt(y, 3)} +X=${fmt(x, 3)} +Z=${fmt(z, 3)}`);
      console.log(`${nm} restQuat local = [${[b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w].map((x) => x.toFixed(6)).join(", ")}]`);
    }
    // TRS locais de descanso de TODOS os bones R (para o solver)
    console.log(`-- TRS locais de descanso (R) --`);
    for (const node of arms.nodes) {
      if (!/\.R$/.test(node.name)) continue;
      console.log(
        `${node.name.padEnd(16)} pos=[${[node.position.x, node.position.y, node.position.z].map((x) => x.toFixed(6)).join(",")}] quat=[${[node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w].map((x) => x.toFixed(6)).join(",")}]`,
      );
    }
  }
}

main();
