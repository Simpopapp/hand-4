/**
 * M2 — refinamento das medidas: mapa regional dos GLBs das armas.
 * - mapa (y×z) do pistol para localizar o punho com precisão;
 * - eixo/raio do grip do rifle (fatia z∈[0.115,0.195]);
 * - eixo do handguard do rifle (região frontal, para a mão esquerda);
 * - nomes dos nós ancestrais dos meshes.
 */
import * as THREE from "three";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GlbData, BuiltTree } from "./glb";
import { parseGlb, buildNodeTree, sceneBoundingBox, readAccessor } from "./glb";
import { WEAPONS, buildFullRig, REQUIRED_RENAMES, type WeaponName } from "./normalize";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadGlb(p: string): { glb: GlbData; tree: BuiltTree } {
  const buf = fs.readFileSync(p);
  const glb = parseGlb(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  );
  return { glb, tree: buildNodeTree(glb) };
}

function verticesHolder(
  g: GlbData,
  tree: BuiltTree,
  i: number,
  holderInv: THREE.Matrix4,
): THREE.Vector3[] {
  const n = g.json.nodes[i];
  const out: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4().multiplyMatrices(holderInv, tree.nodes[i].matrixWorld);
  for (const prim of g.json.meshes[n.mesh].primitives ?? []) {
    const acc = readAccessor(g, prim.attributes.POSITION);
    if (acc.numComp !== 3) continue;
    for (let k = 0; k < acc.count; k++) {
      v.set(acc.data[k * 3], acc.data[k * 3 + 1], acc.data[k * 3 + 2]).applyMatrix4(m);
      out.push(v.clone());
    }
  }
  return out;
}

/** nome do ancestral nomeado mais próximo (no JSON). */
function ancestorName(nodes: { children?: number[]; name?: string }[], idx: number): string {
  // reconstruir filhos
  const parentOf = new Map<number, number>();
  nodes.forEach((n, i) => (n.children ?? []).forEach((c: number) => parentOf.set(c, i)));
  let cur = idx;
  for (let d = 0; d < 10; d++) {
    if (nodes[cur]?.name) return nodes[cur].name;
    const p = parentOf.get(cur);
    if (p === undefined) return "?";
    cur = p;
  }
  return "?";
}

function pca(points: THREE.Vector3[]) {
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
  for (let s = 0; s < 60; s++)
    for (let p = 0; p < 2; p++)
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(A[p][q]) < 1e-14) continue;
        const t = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]);
        const cs = Math.cos(t),
          sn = Math.sin(t);
        for (let k = 0; k < 3; k++) {
          const kp = A[k][p],
            kq = A[k][q];
          A[k][p] = cs * kp - sn * kq;
          A[k][q] = sn * kp + cs * kq;
        }
      }
  const ev = [A[0][0], A[1][1], A[2][2]];
  const order = ev.map((v, i) => [v, i] as [number, number]).sort((a, b) => b[0] - a[0]);
  return {
    center: c,
    axes: order.map(([, i]) => new THREE.Vector3(A[0][i], A[1][i], A[2][i]).normalize()),
    lambdas: order.map(([v]) => v),
  };
}

function fmt(v: THREE.Vector3, d = 4): string {
  return `(${v.x.toFixed(d)},${v.y.toFixed(d)},${v.z.toFixed(d)})`;
}

function main(): void {
  const arms = loadGlb(path.join(ROOT, "prd-proj1-assets/inputs/models/viewmodel_arms.glb"));
  void arms;

  for (const weapon of ["rifle", "pistol"] as const) {
    const w = loadGlb(path.join(ROOT, `prd-proj1-assets/inputs/models/viewmodel_${weapon}.glb`));
    const rawBox = sceneBoundingBox(w.glb, w.tree);
    const rig = buildFullRig(
      weapon,
      w.tree,
      buildNodeTree(
        loadGlb(path.join(ROOT, "prd-proj1-assets/inputs/models/viewmodel_arms.glb")).glb,
      ),
      REQUIRED_RENAMES,
      rawBox,
    );
    rig.root.updateMatrixWorld(true);
    const holderInv = rig.holder.matrixWorld.clone().invert();
    console.log(`\n================ ${weapon} ================`);
    (w.glb.json.nodes ?? []).forEach((n: { mesh?: number }, i: number) => {
      if (n.mesh === undefined) return;
      const vs = verticesHolder(w.glb, w.tree, i, holderInv);
      const nm = ancestorName(w.glb.json.nodes, i);
      const box = new THREE.Box3().setFromPoints(vs);
      console.log(
        `mesh do nó ${i} [${nm}] ${vs.length}v bbox min${fmt(box.min)} max${fmt(box.max)}`,
      );
    });

    const all: THREE.Vector3[] = [];
    (w.glb.json.nodes ?? []).forEach((n: { mesh?: number }, i: number) => {
      if (n.mesh === undefined) return;
      all.push(...verticesHolder(w.glb, w.tree, i, holderInv));
    });

    if (weapon === "pistol") {
      // mapa y×z (em cm) para y<0.07 — localiza o punho
      const grid = new Map<string, number>();
      for (const v of all) {
        if (v.y > 0.07) continue;
        const gy = Math.round(v.y * 100);
        const gz = Math.round(v.z * 100);
        const k = `y=${gy},z=${gz}`;
        grid.set(k, (grid.get(k) ?? 0) + 1);
      }
      const ys = [...new Set([...grid.keys()].map((k) => Number(k.split(",")[0].slice(2))))].sort(
        (a, b) => a - b,
      );
      const zs = [...new Set([...grid.keys()].map((k) => Number(k.split(",")[1].slice(2))))].sort(
        (a, b) => a - b,
      );
      console.log("\nmapa pistol y(linhas) × z(colunas), contagem:");
      for (const y of ys) {
        let line = `y=${String(y).padStart(3)}: `;
        for (const z of zs) {
          const c = grid.get(`y=${y},z=${z}`) ?? 0;
          line += (c === 0 ? "  ." : c < 10 ? ` ${c}` : c < 100 ? `${c}` : "99").padStart(3) + " ";
        }
        console.log(line);
      }
      console.log("colunas z: " + zs.join(","));
    }

    if (weapon === "rifle") {
      // mapa x×y do grip (z 0.115..0.20) — secção do punho
      const grip = all.filter((v) => v.z > 0.115 && v.z < 0.205 && v.y < 0.01);
      console.log(`\ngrip rifle (z 0.115..0.205, y<0.01): ${grip.length} vértices`);
      const grid = new Map<string, number>();
      for (const v of grip) {
        const gx = Math.round(v.x * 200);
        const gy = Math.round(v.y * 200);
        const k = `x=${gx},y=${gy}`;
        grid.set(k, (grid.get(k) ?? 0) + 1);
      }
      const xs = [...new Set([...grid.keys()].map((k) => Number(k.split(",")[0].slice(2))))].sort(
        (a, b) => a - b,
      );
      const ys2 = [...new Set([...grid.keys()].map((k) => Number(k.split(",")[1].slice(2))))].sort(
        (a, b) => a - b,
      );
      for (const y of ys2) {
        let line = `y=${String(y).padStart(4)}: `;
        for (const x of xs) {
          const c = grid.get(`x=${x},y=${y}`) ?? 0;
          line += (c === 0 ? " ." : c < 10 ? `${c}` : c < 100 ? "X" : "#").padStart(2) + " ";
        }
        console.log(line);
      }
      console.log("colunas x (×0.005): " + xs.join(","));
      const { center, axes, lambdas } = pca(grip);
      console.log(
        `grip centro=${fmt(center)} eixo0=${fmt(axes[0], 3)} λ=${lambdas[0].toExponential(2)}`,
      );
      // extensões
      for (const [name, ax] of [
        ["eixo0", axes[0]],
        ["eixo1", axes[1]],
        ["eixo2", axes[2]],
      ] as const) {
        let tmin = Infinity,
          tmax = -Infinity;
        for (const v of grip) {
          const t = v.clone().sub(center).dot(ax);
          if (t < tmin) tmin = t;
          if (t > tmax) tmax = t;
        }
        console.log(`  ${name}: ext=[${tmin.toFixed(4)},${tmax.toFixed(4)}]`);
      }

      // handguard: região frontal (z<0.02), anel em volta do cano
      const front = all.filter((v) => v.z < 0.0 && v.z > -0.25 && v.y > -0.02 && v.y < 0.14);
      const { center: fc, axes: fa, lambdas: fl } = pca(front);
      console.log(`\nhandguard região (z −0.25..0, y −0.02..0.14): ${front.length} vértices`);
      console.log(
        `centro=${fmt(fc)} eixo0=${fmt(fa[0], 3)} λ=${fl[0].toExponential(2)} eixo1=${fmt(fa[1], 3)}`,
      );
      let tmin = Infinity,
        tmax = -Infinity;
      for (const v of front) {
        const t = v.clone().sub(fc).dot(fa[0]);
        if (t < tmin) tmin = t;
        if (t > tmax) tmax = t;
      }
      console.log(`extensão ao longo do eixo: [${tmin.toFixed(4)},${tmax.toFixed(4)}]`);
      // raio do handguard: distância perpendicular ao eixo
      const rr: number[] = [];
      for (const v of front) {
        const d = v.clone().sub(fc);
        d.addScaledVector(fa[0], -d.dot(fa[0]));
        rr.push(d.length());
      }
      rr.sort((a, b) => a - b);
      console.log(
        `raio perp: p10=${rr[Math.floor(rr.length * 0.1)].toFixed(4)} p50=${rr[Math.floor(rr.length * 0.5)].toFixed(4)} p90=${rr[Math.floor(rr.length * 0.9)].toFixed(4)}`,
      );
    }

    // âncora vs geometria: fatia de vértices mais próxima da âncora
    const anchor = new THREE.Vector3(...WEAPONS[weapon].armsHandR);
    const ds = all.map((v) => ({ v, d: v.distanceTo(anchor) })).sort((a, b) => a.d - b.d);
    console.log(`\n-- 12 vértices mais próximos da âncora ${fmt(anchor)} --`);
    for (const { v, d } of ds.slice(0, 12)) console.log(`d=${d.toFixed(4)} ${fmt(v)}`);
  }
}

main();
