/**
 * M2 — medidas finais do grip (D6: pistol em order XYZ, comportamento real do jogo).
 * Rifle: eixo/rake do grip (fatia y×z) + secção. Pistol: grip (y<−0.03), PCA + secção x×z.
 * Também: rest dos braços para a pistola (pós-attach fresco).
 */
import * as THREE from "three";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GlbData, BuiltTree } from "./glb";
import { parseGlb, buildNodeTree, sceneBoundingBox, readAccessor } from "./glb";
import { buildFullRig, REQUIRED_RENAMES } from "./normalize";

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
  const armsPath = path.join(ROOT, "prd-proj1-assets/inputs/models/viewmodel_arms.glb");

  // ---------- RIFLE: grip y×z ----------
  {
    const w = loadGlb(path.join(ROOT, "prd-proj1-assets/inputs/models/viewmodel_rifle.glb"));
    const rawBox = sceneBoundingBox(w.glb, w.tree);
    const rig = buildFullRig("rifle", w.tree, loadGlb(armsPath).tree, REQUIRED_RENAMES, rawBox);
    rig.root.updateMatrixWorld(true);
    const inv = rig.holder.matrixWorld.clone().invert();
    const all: THREE.Vector3[] = [];
    (w.glb.json.nodes ?? []).forEach((n: { mesh?: number }, i: number) => {
      if (n.mesh === undefined) return;
      all.push(...verticesHolder(w.glb, w.tree, i, inv));
    });
    const grip = all.filter((v) => v.z > 0.125 && v.z < 0.205 && v.y < 0.005);
    console.log(`\nRIFLE grip (z 0.125..0.205, y<0.005): ${grip.length}v`);
    const grid = new Map<string, number>();
    for (const v of grip) {
      const gy = Math.round(v.y * 100);
      const gz = Math.round(v.z * 100);
      grid.set(`y=${gy},z=${gz}`, (grid.get(`y=${gy},z=${gz}`) ?? 0) + 1);
    }
    const ys = [...new Set([...grid.keys()].map((k) => Number(k.split(",")[0].slice(2))))].sort(
      (a, b) => a - b,
    );
    const zs = [...new Set([...grid.keys()].map((k) => Number(k.split(",")[1].slice(2))))].sort(
      (a, b) => a - b,
    );
    console.log("z cols: " + zs.join(","));
    for (const y of ys) {
      let line = `y=${String(y).padStart(3)}: `;
      for (const z of zs) {
        const c = grid.get(`y=${y},z=${z}`) ?? 0;
        line += (c === 0 ? " ." : c < 10 ? `${c}` : c < 100 ? "X" : "#").padStart(2) + " ";
      }
      console.log(line);
    }
    // PCA do núcleo do grip (y<−0.02) → eixo/rake
    const core = grip.filter((v) => v.y < -0.02);
    const { center, axes, lambdas } = pca(core);
    console.log(`grip core (y<−0.02): ${core.length}v centro=${fmt(center)}`);
    axes.forEach((a, i) =>
      console.log(`  eixo[${i}] λ=${lambdas[i].toExponential(2)} dir=${fmt(a, 3)}`),
    );
    // secção: raio perpendicular ao eixo0
    const rr: number[] = [];
    for (const v of core) {
      const d = v.clone().sub(center);
      d.addScaledVector(axes[0], -d.dot(axes[0]));
      rr.push(d.length());
    }
    rr.sort((a, b) => a - b);
    console.log(
      `raio perp ao eixo: p10=${rr[Math.floor(rr.length * 0.1)].toFixed(4)} p50=${rr[Math.floor(rr.length * 0.5)].toFixed(4)} p90=${rr[Math.floor(rr.length * 0.9)].toFixed(4)}`,
    );
    // mapa x×z do grip core
    const grid2 = new Map<string, number>();
    for (const v of core) {
      const gx = Math.round(v.x * 200);
      const gz = Math.round(v.z * 200);
      grid2.set(`x=${gx},z=${gz}`, (grid2.get(`x=${gx},z=${gz}`) ?? 0) + 1);
    }
    const xs = [...new Set([...grid2.keys()].map((k) => Number(k.split(",")[0].slice(2))))].sort(
      (a, b) => a - b,
    );
    const zs2 = [...new Set([...grid2.keys()].map((k) => Number(k.split(",")[1].slice(2))))].sort(
      (a, b) => a - b,
    );
    console.log("secção x×z (linhas x, colunas z×0.005): cols=" + zs2.join(","));
    for (const x of xs) {
      let line = `x=${String(x).padStart(4)}: `;
      for (const z of zs2) {
        const c = grid2.get(`x=${x},z=${z}`) ?? 0;
        line += (c === 0 ? " ." : c < 10 ? `${c}` : c < 100 ? "X" : "#").padStart(2) + " ";
      }
      console.log(line);
    }
  }

  // ---------- PISTOL (XYZ): grip ----------
  {
    const w = loadGlb(path.join(ROOT, "prd-proj1-assets/inputs/models/viewmodel_pistol.glb"));
    const rawBox = sceneBoundingBox(w.glb, w.tree);
    const rig = buildFullRig("pistol", w.tree, loadGlb(armsPath).tree, REQUIRED_RENAMES, rawBox);
    rig.root.updateMatrixWorld(true);
    const inv = rig.holder.matrixWorld.clone().invert();
    const all: THREE.Vector3[] = [];
    (w.glb.json.nodes ?? []).forEach((n: { mesh?: number }, i: number) => {
      if (n.mesh === undefined) return;
      all.push(...verticesHolder(w.glb, w.tree, i, inv));
    });
    const grip = all.filter((v) => v.y < -0.03);
    console.log(`\nPISTOL grip (y<−0.03): ${grip.length}v`);
    const { center, axes, lambdas } = pca(grip);
    console.log(`centro=${fmt(center)}`);
    axes.forEach((a, i) => {
      let tmin = Infinity,
        tmax = -Infinity;
      for (const v of grip) {
        const t = v.clone().sub(center).dot(a);
        if (t < tmin) tmin = t;
        if (t > tmax) tmax = t;
      }
      console.log(
        `  eixo[${i}] λ=${lambdas[i].toExponential(2)} dir=${fmt(a, 3)} ext=[${tmin.toFixed(4)},${tmax.toFixed(4)}]`,
      );
    });
    const rr: number[] = [];
    for (const v of grip) {
      const d = v.clone().sub(center);
      d.addScaledVector(axes[0], -d.dot(axes[0]));
      rr.push(d.length());
    }
    rr.sort((a, b) => a - b);
    console.log(
      `raio perp: p10=${rr[Math.floor(rr.length * 0.1)].toFixed(4)} p50=${rr[Math.floor(rr.length * 0.5)].toFixed(4)} p90=${rr[Math.floor(rr.length * 0.9)].toFixed(4)}`,
    );
    const box = new THREE.Box3().setFromPoints(grip);
    console.log(`bbox grip: min${fmt(box.min)} max${fmt(box.max)}`);
    // mapa x×y (secção)
    const grid3 = new Map<string, number>();
    for (const v of grip) {
      const gx = Math.round(v.x * 100);
      const gy = Math.round(v.y * 100);
      grid3.set(`x=${gx},y=${gy}`, (grid3.get(`x=${gx},y=${gy}`) ?? 0) + 1);
    }
    const xs3 = [...new Set([...grid3.keys()].map((k) => Number(k.split(",")[0].slice(2))))].sort(
      (a, b) => a - b,
    );
    const ys3 = [...new Set([...grid3.keys()].map((k) => Number(k.split(",")[1].slice(2))))].sort(
      (a, b) => a - b,
    );
    console.log("secção x×y (×0.01): cols x=" + xs3.join(","));
    for (const y of ys3) {
      let line = `y=${String(y).padStart(3)}: `;
      for (const x of xs3) {
        const c = grid3.get(`x=${x},y=${y}`) ?? 0;
        line += (c === 0 ? "  ." : c < 10 ? ` ${c}` : c < 100 ? `${c}` : "99").padStart(3) + " ";
      }
      console.log(line);
    }
    // âncora vs grip
    const anchor = new THREE.Vector3(0, -0.065, 0.035);
    const ds = all.map((v) => ({ v, d: v.distanceTo(anchor) })).sort((a, b) => a.d - b.d);
    console.log(`vértices mais próximos da âncora: d=${ds[0].d.toFixed(4)} ${fmt(ds[0].v)}`);
    // projeção da âncora no eixo do grip
    const t = anchor.clone().sub(center).dot(axes[0]);
    console.log(`âncora projetada no eixo do grip: t=${t.toFixed(4)} (ext do grip)`);
  }

  // ---------- PISTOL: braços em descanso (XYZ) ----------
  {
    const w = loadGlb(path.join(ROOT, "prd-proj1-assets/inputs/models/viewmodel_pistol.glb"));
    const rawBox = sceneBoundingBox(w.glb, w.tree);
    const arms = loadGlb(armsPath);
    const rig = buildFullRig("pistol", w.tree, arms.tree, REQUIRED_RENAMES, rawBox);
    rig.root.updateMatrixWorld(true);
    const inv = rig.holder.matrixWorld.clone().invert();
    console.log(`\nPISTOL braços (descanso, XYZ):`);
    for (const nm of [
      "clavicle.R",
      "deltoid.R",
      "upper_arm.R",
      "forearm.R",
      "handR",
      "palm_index.R",
      "palm_pinky.R",
      "f_index.01.R",
      "f_middle.01.R",
      "f_pinky.01.R",
      "thumb.01.R",
      "clavicle.L",
      "deltoid.L",
      "upper_arm.L",
      "forearm.L",
      "handL",
      "palm_index.L",
    ]) {
      const b = arms.tree.byName.get(nm);
      if (!b) {
        console.log(`${nm.padEnd(14)} AUSENTE`);
        continue;
      }
      const p = b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      console.log(`${nm.padEnd(14)} ${fmt(p)}`);
    }
    const fl = arms.tree.byName.get("forearm.L")!,
      fr = arms.tree.byName.get("forearm.R")!;
    const a0 = fl.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const a1 = fl.children[0].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const b0 = fr.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const b1 = fr.children[0].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    console.log(`forearm.L seg: ${fmt(a0, 3)} → ${fmt(a1, 3)}`);
    console.log(`forearm.R seg: ${fmt(b0, 3)} → ${fmt(b1, 3)}`);
  }
}

main();
