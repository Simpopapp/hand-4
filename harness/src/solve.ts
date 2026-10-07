/**
 * M2 — solver de poses em espaço R (GLB cru da arma), attach à model. v2.
 *
 * Causas-raiz da v1 (provadas por diagnóstico, ver STATE.json D8-D11):
 *  1. wRest=0.4 tornava o curl necessário (~7 rad somados) MAIS CARO que o
 *     ganho das pontas → o otimizador recusava dobrar os dedos (pontas a
 *     0.17-0.21m da âncora). Regularizador agora 0.02 + barreira explícita
 *     de limites de junta (soft), não freio.
 *  2. Sem inicialização analítica: a orientação da mão partia de rotações
 *     cegas. Agora o frame da mão é construído da geometria MEDIDA (grip.ts):
 *     dedos tangentes ao eixo do grip, palma (cross pi−w, pp−w) voltada ao
 *     eixo — convenção provada por convention-test.ts (R: cross=+Z_local,
 *     flexão +X; L: cross=−Z_local, flexão −X).
 *  3. Alvos eram clamps em esfera ao redor da âncora (insatisfazível p/
 *     pistola: vértice mais próximo do grip a 0.048m da âncora). Agora os
 *     alvos são pontos na SUPERFÍCIE do cilindro do grip (medida).
 *  4. Avaliador reconstruía a árvore por avaliação (~100× mais lento).
 *     Agora: árvore persistente, reset apenas dos bones mutados.
 *
 * Convenções provadas (convention-test.ts, rig de descanso):
 *  - cross(palmIndex−wrist, palmPinky−wrist) aponta para o LADO DA PALMA
 *    (os dedos flexionam em direção ao lado do cross);
 *  - mão R: cross ≡ +Z_local, flexão = +X local; mão L: cross ≡ −Z_local,
 *    flexão = −X local (rig espelhado).
 *  - logo, ao segurar: a palma encosta no grip ⇒ cross aponta PARA o eixo.
 *
 * Execução: bun harness/src/solve.ts
 */
import * as THREE from "three";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BuiltTree } from "./glb";
import { parseGlb, buildNodeTree, sceneBoundingBox } from "./glb";
import { WEAPONS, buildWeaponRig, attachArms, applyRenames, REQUIRED_RENAMES, type WeaponName } from "./normalize";
import { GRIP, HANDGUARD_RIFLE, type GripGeom } from "./grip";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ARMS_GLB = path.join(ROOT, "prd-proj1-assets/inputs/models/viewmodel_arms.glb");
const DEG = Math.PI / 180;

function loadGlb(p: string) {
  const buf = fs.readFileSync(p);
  return parseGlb(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
}
const armsGlb = loadGlb(ARMS_GLB);

// ================= rigs estáticos por arma =================
const rigCache: Partial<Record<WeaponName, { rig: ReturnType<typeof buildWeaponRig>; root: THREE.Group }>> = {};
function getRig(weapon: WeaponName) {
  if (!rigCache[weapon]) {
    const wGlb = loadGlb(path.join(ROOT, `prd-proj1-assets/inputs/models/viewmodel_${weapon}.glb`));
    const wTree = buildNodeTree(wGlb);
    const rawBox = sceneBoundingBox(wGlb, wTree);
    const rig = buildWeaponRig(weapon, wTree, rawBox);
    const root = new THREE.Group();
    root.add(rig.holder);
    rigCache[weapon] = { rig, root };
  }
  return rigCache[weapon]!;
}

// ================= avaliador rápido =================
class ArmEval {
  weapon: WeaponName;
  tree: BuiltTree;
  byOrig: Map<string, THREE.Object3D>; // refs por nome ORIGINAL (pré-rename)
  rest: Map<string, THREE.Quaternion>;
  restPos: Map<string, THREE.Vector3>;
  posDelta: Map<string, THREE.Vector3> = new Map();
  ok: boolean;
  constructor(weapon: WeaponName) {
    this.weapon = weapon;
    this.tree = buildNodeTree(armsGlb);
    this.byOrig = new Map(this.tree.byName);
    this.rest = new Map();
    for (const [name, node] of this.byOrig) this.rest.set(name, node.quaternion.clone());
    this.restPos = new Map();
    for (const [name, node] of this.byOrig) this.restPos.set(name, node.position.clone());
    applyRenames(this.tree, REQUIRED_RENAMES);
    const { rig, root } = getRig(weapon);
    const attach = attachArms(this.tree, rig.holder, weapon);
    this.ok = attach.ok;
    root.updateMatrixWorld(true);
  }
  /** regrava TODOS os bones mutados (rest × dq) — mapa completo a cada chamada.
   *  v3: projeção DURA nos limites com margem de 0,5° — a barreira soft da v2
   *  deixava juntas no limiar exato (45.0°/100.0°) e o ruído numérico as
   *  empurrava 0,1–0,2° além do limite do verificador. */
  setDeltas(deltas: Map<string, THREE.Euler>) {
    for (const [name, e] of deltas) {
      const node = this.byOrig.get(name)!;
      const rest = this.rest.get(name)!;
      node.quaternion.copy(rest).multiply(new THREE.Quaternion().setFromEuler(e));
      const lim = limitFor(name) - 0.5 * DEG;
      const angle = rest.angleTo(node.quaternion);
      if (angle > lim) {
        const dq = rest.clone().invert().multiply(node.quaternion);
        const scaled = new THREE.Quaternion().slerp(dq, lim / angle); // ident → dq
        node.quaternion.copy(rest).multiply(scaled);
      }
    }
  }
  setPositions(pos: Map<string, THREE.Vector3>) {
    for (const [name, v] of pos) {
      const node = this.byOrig.get(name)!;
      const rest = this.restPos.get(name)!;
      node.position.set(rest.x + v.x, rest.y + v.y, rest.z + v.z);
    }
  }
  metrics() {
    const { rig, root } = getRig(this.weapon);
    for (const [name, v] of this.posDelta) {
      const node = this.byOrig.get(name)!;
      const rest = this.restPos.get(name)!;
      node.position.set(rest.x + v.x, rest.y + v.y, rest.z + v.z);
    }
    root.updateMatrixWorld(true);
    const inv = rig.holder.matrixWorld.clone().invert();
    const H = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const tipsR: Record<string, THREE.Vector3> = {};
    for (const t of ["f_index.03.R", "f_middle.03.R", "f_ring.03.R", "f_pinky.03.R", "thumb.03.R"])
      tipsR[t] = H(this.tree.byName.get(t)!);
    const tipsL: Record<string, THREE.Vector3> = {};
    for (const t of ["f_index.03.L", "f_middle.03.L", "f_ring.03.L", "f_pinky.03.L", "thumb.03.L"])
      tipsL[t] = H(this.tree.byName.get(t)!);
    const handR = H(this.tree.byName.get("handR")!);
    const piR = H(this.tree.byName.get("palm_index.R")!);
    const ppR = H(this.tree.byName.get("palm_pinky.R")!);
    const palmNormalR = new THREE.Vector3().crossVectors(piR.clone().sub(handR), ppR.clone().sub(handR)).normalize();
    const handL = H(this.tree.byName.get("handL")!);
    const seg = (o: THREE.Object3D): [THREE.Vector3, THREE.Vector3] => {
      const p0 = H(o);
      return [p0, o.children[0] ? H(o.children[0]) : p0.clone()];
    };
    const forearmL = seg(this.tree.byName.get("forearm.L")!);
    const forearmR = seg(this.tree.byName.get("forearm.R")!);
    return {
      tipsR, tipsL, palmNormalR, handR, handL, forearmL, forearmR,
      foreGap: segSegDist(forearmL[0], forearmL[1], forearmR[0], forearmR[1]),
    };
  }
}

function segSegDist(p0: THREE.Vector3, p1: THREE.Vector3, q0: THREE.Vector3, q1: THREE.Vector3): number {
  const d1 = p1.clone().sub(p0);
  const d2 = q1.clone().sub(q0);
  const r = p0.clone().sub(q0);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s = 0, t = 0;
  if (a <= 1e-12 && e <= 1e-12) return r.length();
  if (a <= 1e-12) t = Math.min(Math.max(f / e, 0), 1);
  else {
    const c = d1.dot(r);
    if (e <= 1e-12) s = Math.min(Math.max(-c / a, 0), 1);
    else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? Math.min(Math.max((b * f - c * e) / denom, 0), 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(Math.max(-c / a, 0), 1); }
      else if (t > 1) { t = 1; s = Math.min(Math.max((b - c) / a, 0), 1); }
    }
  }
  return p0.clone().addScaledVector(d1, s).distanceTo(q0.clone().addScaledVector(d2, t));
}

// ================= frame do grip (medido) =================
interface Frame extends GripGeom {
  anchor: THREE.Vector3;
  axisPoint: THREE.Vector3; // ponto do eixo mais próximo da âncora (clampado)
  u: THREE.Vector3;         // radial: do eixo para a âncora (lado da palma)
  v: THREE.Vector3;         // axis × u
}
function makeFrame(geom: GripGeom, anchor: THREE.Vector3): Frame {
  const axis = new THREE.Vector3(...geom.axis).normalize();
  const center = new THREE.Vector3(...geom.center);
  const d = anchor.clone().sub(center);
  const tA = Math.min(Math.max(d.dot(axis), -geom.halfExt), geom.halfExt);
  const axisPoint = center.clone().addScaledVector(axis, tA);
  const u = anchor.clone().sub(axisPoint).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();
  return { ...geom, center: center.clone(), axis, anchor, axisPoint, u, v };
}
/** radial(θ): da palma (θ=0) varrendo o cilindro; wrapDir escolhe o sentido. */
function radial(f: Frame, theta: number, wrapDir: 1 | -1): THREE.Vector3 {
  const t = wrapDir * theta;
  return f.u.clone().multiplyScalar(Math.cos(t)).addScaledVector(f.v, -Math.sin(t));
}

// ================= convenções provadas =================
const FLEX_SIGN = { R: 1, L: -1 } as const;
/** cross local da mão: R ≡ +Z_local, L ≡ −Z_local (convention-test.ts). */
const CROSS_LOCAL = { R: new THREE.Vector3(0, 0, 1), L: new THREE.Vector3(0, 0, -1) } as const;

/**
 * Rotação MUNDIAL da mão a partir do frame do cilindro:
 * colY (dedos, +Y local) → tangente `fingerDir`; colZ (imagem local do CROSS)
 * → `crossTarget` (palma encostando no cilindro). colX = colY×colZ.
 */
function handWorldQuat(fingerDir: THREE.Vector3, crossTarget: THREE.Vector3, crossLocalSign: number): THREE.Quaternion {
  const y = fingerDir.clone().normalize();
  const z = crossTarget.clone().multiplyScalar(crossLocalSign).normalize();
  y.addScaledVector(z, -y.dot(z)).normalize(); // ortonormaliza
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  const M = new THREE.Matrix4().makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(M);
}

/** euler local tal que rest × euler ≈ orienta a mão conforme o alvo mundial. */
function eulerForWorldQuat(ev: ArmEval, bone: string, qWorldTarget: THREE.Quaternion): THREE.Euler {
  const node = ev.byOrig.get(bone)!;
  const P = node.parent.getWorldQuaternion(new THREE.Quaternion());
  const qLocal = P.clone().invert().multiply(qWorldTarget);
  const dq = ev.rest.get(bone)!.clone().invert().multiply(qLocal);
  return new THREE.Euler().setFromQuaternion(dq, "XYZ");
}

// ================= limites / regularização =================
const LIMITS: Array<[RegExp, number]> = [
  [/^f_/, 100 * DEG], [/^thumb/, 90 * DEG], [/^forearm/, 140 * DEG],
  [/^upper_arm/, 120 * DEG], [/^deltoid/, 60 * DEG], [/^clavicle/, 30 * DEG],
  [/^palm_/, 45 * DEG], [/^hand\./, 90 * DEG],
];
function limitFor(bone: string): number {
  for (const [re, lim] of LIMITS) if (re.test(bone)) return lim;
  return 45 * DEG;
}
function limitPenalty(ev: ArmEval, deltas: Map<string, THREE.Euler>): number {
  let pen = 0;
  for (const [name, e] of deltas) {
    const world = ev.rest.get(name)!.clone().multiply(new THREE.Quaternion().setFromEuler(e));
    const excess = ev.rest.get(name)!.angleTo(world) - limitFor(name);
    if (excess > 0) pen += (excess / 0.15) ** 2 * 8;
  }
  return pen;
}
function restPenalty(deltas: Map<string, THREE.Euler>): number {
  let s = 0;
  for (const [, e] of deltas) s += e.x * e.x + e.y * e.y + e.z * e.z;
  return s;
}

/** descida de coordenadas sobre um subconjunto de bones (euler XYZ). */
function descendReal(
  ev: ArmEval,
  deltas: Map<string, THREE.Euler>,
  bones: string[],
  cost: () => number,
  steps: number[],
  sweeps: number,
): number {
  ev.setDeltas(deltas);
  let best = cost();
  if (!Number.isFinite(best)) console.log(`  [desc] custo inicial NaN! bones=${bones.slice(0,3).join(",")}...`);
  let accepted = 0;
  for (const step of steps) {
    for (let sweep = 0; sweep < sweeps; sweep++) {
      let improved = false;
      void improved;
      for (const bone of bones) {
        const e = deltas.get(bone)!;
        for (let axis = 0; axis < 3; axis++) {
          const key = axis === 0 ? "x" : axis === 1 ? "y" : "z";
          for (const dir of [1, -1]) {
            const old = e[key];
            e[key] = old + dir * step;
            ev.setDeltas(deltas);
            const c = cost();
            if (c < best - 1e-9) { best = c; improved = true; }
            else { e[key] = old; ev.setDeltas(deltas); }
          }
        }
      }
      if (!improved) break;
    }
  }
  if (accepted > 0) console.log(`  [desc] ${bones.slice(0,2).join(",")}...: ${accepted} movimentos, best=${best.toFixed(4)}`);
  return best;
}


// ================= custos =================
function cylinderCost(f: Frame, tips: Record<string, THREE.Vector3>, targets: Record<string, THREE.Vector3>, wSurf = 6): number {
  let c = 0;
  for (const [n, tgt] of Object.entries(targets)) {
    const p = tips[n];
    if (!p) continue;
    const d = p.clone().sub(f.center);
    const tA = d.dot(f.axis);
    const perp = d.clone().addScaledVector(f.axis, -tA).length();
    // v3: peso da regra dura 400→4000 — na v2 o custo de furar o wrap
    // (≤0.05 por ponta) perdia para a barreira de limites e o regularizador
    // de descanso; o otimizador estacionava as pontas 1–11 mm fora do grip.
    c += Math.max(0, perp - f.wrapRadius) ** 2 * 4000;          // regra: dentro do raio
    c += Math.max(0, Math.abs(tA) - (f.halfExt + 0.02)) ** 2 * 4000; // regra: dentro do grip
    c += (perp - f.radius) ** 2 * wSurf;                        // visual: na superfície
  }
  return c;
}

// ================= alvos =================
function rTargets(f: Frame, wrapDir: 1 | -1): Record<string, THREE.Vector3> {
  const cfg =
    f.wrapRadius > 0.04 // rifle
      ? { theta: [140, 120, 95, 68], t: [-0.02, -0.008, 0.002, 0.012], th: 20, tt: 0.018 }
      : { theta: [165, 140, 110, 60], t: [0.006, -0.002, -0.01, -0.02], th: -20, tt: 0.012 };
  const out: Record<string, THREE.Vector3> = {};
  (["f_index.03.R", "f_middle.03.R", "f_ring.03.R", "f_pinky.03.R"] as const).forEach((n, i) => {
    out[n] = f.center.clone().addScaledVector(f.axis, cfg.t[i]).addScaledVector(radial(f, cfg.theta[i] * DEG, wrapDir), f.radius);
  });
  out["thumb.03.R"] = f.center
    .clone()
    .addScaledVector(f.axis, cfg.tt)
    .addScaledVector(radial(f, cfg.th * DEG, wrapDir), f.radius * 0.95);
  return out;
}

// ================= mão direita =================
function solveR(ev: ArmEval, f: Frame, wrapDir: 1 | -1) {
  const targets = rTargets(f, wrapDir);
  const palmBones = ["palm_index.R", "palm_middle.R", "palm_ring.R", "palm_pinky.R"];
  const fingers = [
    ["f_index.01.R", "f_index.02.R", "f_index.03.R"],
    ["f_middle.01.R", "f_middle.02.R", "f_middle.03.R"],
    ["f_ring.01.R", "f_ring.02.R", "f_ring.03.R"],
    ["f_pinky.01.R", "f_pinky.02.R", "f_pinky.03.R"],
    ["thumb.01.R", "thumb.02.R", "thumb.03.R"],
  ];
  const deltas = new Map<string, THREE.Euler>();
  // inicialização analítica: orientação da mão a partir do frame medido
  deltas.set("hand.R", eulerForWorldQuat(ev, "hand.R", handWorldQuat(f.axis, f.u.clone().negate(), 1)));
  for (const b of palmBones) deltas.set(b, new THREE.Euler(0, 0, 0));
  // curl inicial por dedo (flexão = +X local provada)
  const curlInit = [1.6, 1.5, 1.4, 1.1];
  fingers.forEach((chain, i) => {
    if (chain[0].startsWith("thumb")) {
      deltas.set(chain[0], new THREE.Euler(0.2 * FLEX_SIGN.R, 0.6 * FLEX_SIGN.R, 0.5 * FLEX_SIGN.R));
      deltas.set(chain[1], new THREE.Euler(0.1 * FLEX_SIGN.R, 0.3 * FLEX_SIGN.R, 0.2 * FLEX_SIGN.R));
      deltas.set(chain[2], new THREE.Euler(0, 0, 0));
    } else {
      deltas.set(chain[0], new THREE.Euler(curlInit[i] * FLEX_SIGN.R, 0, 0));
      deltas.set(chain[1], new THREE.Euler(0.6 * FLEX_SIGN.R, 0, 0));
      deltas.set(chain[2], new THREE.Euler(0.2 * FLEX_SIGN.R, 0, 0));
    }
  });

  const cost = (): number => {
    const m = ev.metrics();
    let c = cylinderCost(f, m.tipsR, targets);
    const nu = m.palmNormalR.dot(f.u); // cross deve apontar AO eixo: nu ≤ −0.6
    if (nu > -0.63) c += (nu + 0.63) ** 2 * 30; // v3: margem sobre a regra (−0.6)
    const nz = Math.abs(m.palmNormalR.z);
    if (nz > 0.74) c += (nz - 0.74) ** 2 * 120; // v3: margem sobre a regra (0.75)
    c += limitPenalty(ev, deltas) + 0.02 * restPenalty(deltas);
    return c;
  };

  const allR = ["hand.R", ...palmBones, ...fingers.flat()];
  descendReal(ev, deltas, ["hand.R", ...palmBones], cost, [0.25, 0.1, 0.04], 6);
  descendReal(ev, deltas, fingers.flat(), cost, [0.3, 0.15, 0.07, 0.03], 8);
  const best = descendReal(ev, deltas, allR, cost, [0.04, 0.015, 0.006], 6);
  // v3: polimento — desida final só com as REGRAS do verificador (wrap, palma,
  // limites), sem regularizador de descanso nem termo de superfície; empurra
  // as pontas que ficaram 0,1–0,5 mm fora do raio de wrap.
  const polishCost = (): number => {
    const m = ev.metrics();
    let c = cylinderCost(f, m.tipsR, targets, 0);
    const nu = m.palmNormalR.dot(f.u);
    if (nu > -0.63) c += (nu + 0.63) ** 2 * 200;
    const nz = Math.abs(m.palmNormalR.z);
    if (nz > 0.74) c += (nz - 0.74) ** 2 * 600;
    c += limitPenalty(ev, deltas);
    return c;
  };
  const polished = descendReal(ev, deltas, allR, polishCost, [0.02, 0.008, 0.003], 8);
  return { deltas, cost: polished < best ? polished : best };
}

// ================= mão esquerda =================
interface LPlan {
  geom: GripGeom;
  handLTarget: THREE.Vector3;
  fingerDir: THREE.Vector3;     // tangente (+Y local) alvo
  radialWrist: THREE.Vector3;   // radial do eixo para o punho alvo
  tipsTheta: number[];          // graus, a partir do radial do punho
  tipsT: number[];              // ao longo do eixo (desde o centro)
  tipsRadius: number;           // raio do cilindro-alvo das pontas L
  thumbTheta: number;
  thumbT: number;
}
function lPlan(weapon: WeaponName, f: Frame): LPlan {
  if (weapon === "rifle") {
    const hg = HANDGUARD_RIFLE;
    const handLTarget = new THREE.Vector3(-0.028, 0.048, -0.03);
    const d = handLTarget.clone().sub(new THREE.Vector3(...hg.center));
    const radialWrist = d.clone().addScaledVector(new THREE.Vector3(...hg.axis).normalize(), -d.dot(new THREE.Vector3(...hg.axis).normalize())).normalize();
    return {
      geom: hg,
      handLTarget,
      fingerDir: new THREE.Vector3(0, 0, -1),
      radialWrist,
      tipsTheta: [-40, -70, -100, -125],
      tipsT: [0.06, 0.03, 0, -0.03],
      tipsRadius: hg.radius + 0.002,
      thumbTheta: 40,
      thumbT: 0.075,
    };
  }
  const uL = new THREE.Vector3(-0.55, -0.35, -0.76).normalize();
  const handLTarget = f.center
    .clone()
    .addScaledVector(f.axis, -0.02)
    .addScaledVector(uL, 0.05);
  return {
    geom: { ...f, wrapRadius: f.wrapRadius },
    handLTarget,
    fingerDir: new THREE.Vector3(0.82, -0.05, -0.571),
    radialWrist: uL,
    tipsTheta: [60, 95, 125, 150],
    tipsT: [0.01, -0.004, -0.014, -0.022],
    tipsRadius: f.radius + 0.014,
    thumbTheta: -20,
    thumbT: 0.02,
  };
}

/** CCD clássico com limites: traz handL à posição alvo. */
function solveL(ev: ArmEval, f: Frame, rDeltas: Map<string, THREE.Euler>, wrapDir: 1 | -1) {
  const plan = lPlan(ev.weapon, f);
  const geomAxis = new THREE.Vector3(...plan.geom.axis).normalize();
  const geomCenter = new THREE.Vector3(...plan.geom.center);
  const uW = plan.radialWrist.clone().normalize();
  const vW = new THREE.Vector3().crossVectors(geomAxis, uW).normalize();
  const radialL = (theta: number) => {
    const t = wrapDir * theta;
    return uW.clone().multiplyScalar(Math.cos(t)).addScaledVector(vW, -Math.sin(t));
  };
  const targets: Record<string, THREE.Vector3> = {};
  (["f_index.03.L", "f_middle.03.L", "f_ring.03.L", "f_pinky.03.L"] as const).forEach((n, i) => {
    targets[n] = geomCenter
      .clone()
      .addScaledVector(geomAxis, plan.tipsT[i])
      .addScaledVector(radialL(plan.tipsTheta[i] * DEG), plan.tipsRadius);
  });
  targets["thumb.03.L"] = geomCenter
    .clone()
    .addScaledVector(geomAxis, plan.thumbT)
    .addScaledVector(radialL(plan.thumbTheta * DEG), plan.tipsRadius * 0.9);

  const palmBones = ["palm_index.L", "palm_middle.L", "palm_ring.L", "palm_pinky.L"];
  const fingers = [
    ["f_index.01.L", "f_index.02.L", "f_index.03.L"],
    ["f_middle.01.L", "f_middle.02.L", "f_middle.03.L"],
    ["f_ring.01.L", "f_ring.02.L", "f_ring.03.L"],
    ["f_pinky.01.L", "f_pinky.02.L", "f_pinky.03.L"],
    ["thumb.01.L", "thumb.02.L", "thumb.03.L"],
  ];
  const fsL = FLEX_SIGN.L;
  const deltas = new Map<string, THREE.Euler>(rDeltas);
  // hand.L.control: POSIÇÃO direta (pivô do controle coincide com a mão;
  // rotação não translada — o contrato exige pos no pacote)
  const { rig: rigL } = getRig(ev.weapon);
  const tgtWorld = plan.handLTarget.clone().applyMatrix4(rigL.holder.matrixWorld);
  const ctrl = ev.byOrig.get("hand.L.control")!;
  const pLocal = tgtWorld.clone().applyMatrix4(ctrl.parent!.matrixWorld.clone().invert());
  ev.posDelta.set("hand.L.control", pLocal.clone().sub(ev.restPos.get("hand.L.control")!));
  ev.setPositions(ev.posDelta);
  // hand.L: orientação analítica (palma ao cilindro, dedos na tangente)
  deltas.set("hand.L", eulerForWorldQuat(ev, "hand.L", handWorldQuat(plan.fingerDir, uW.clone().negate(), -1)));
  for (const b of palmBones) deltas.set(b, new THREE.Euler(0, 0, 0));
  const curlInitL = [1.5, 1.4, 1.3, 1.0];
  fingers.forEach((ch, i) => {
    if (ch[0].startsWith("thumb")) {
      deltas.set(ch[0], new THREE.Euler(0.2 * fsL, 0.5 * fsL, 0.4 * fsL));
      deltas.set(ch[1], new THREE.Euler(0.1 * fsL, 0.2 * fsL, 0.2 * fsL));
      deltas.set(ch[2], new THREE.Euler(0, 0, 0));
    } else {
      deltas.set(ch[0], new THREE.Euler(curlInitL[i] * fsL, 0, 0));
      deltas.set(ch[1], new THREE.Euler(0.6 * fsL, 0, 0));
      deltas.set(ch[2], new THREE.Euler(0.2 * fsL, 0, 0));
    }
  });

  const cost = (): number => {
    const m = ev.metrics();
    let c = m.handL.distanceTo(plan.handLTarget) ** 2 * 30;
    const qHand = ev.byOrig.get("hand.L")!.getWorldQuaternion(new THREE.Quaternion());
    const yW = new THREE.Vector3(0, 1, 0).applyQuaternion(qHand);
    c += (1 - yW.dot(plan.fingerDir.clone().normalize())) ** 2 * 6;
    // cross_L aponta ao eixo do cilindro (palma encosta)
    const nL = (() => {
      const w = ev.byOrig.get("hand.L")!;
      const wp = w.getWorldPosition(new THREE.Vector3());
      const pi = ev.byOrig.get("palm_index.L")!.getWorldPosition(new THREE.Vector3());
      const pp = ev.byOrig.get("palm_pinky.L")!.getWorldPosition(new THREE.Vector3());
      return new THREE.Vector3().crossVectors(pi.clone().sub(wp), pp.clone().sub(wp)).normalize();
    })();
    const closest = geomCenter.clone().addScaledVector(geomAxis, m.handL.clone().sub(geomCenter).dot(geomAxis));
    const radialNow = m.handL.clone().sub(closest).normalize();
    const nl = nL.dot(radialNow);
    if (nl > -0.6) c += (nl + 0.6) ** 2 * 20;
    // pontas L no cilindro
    const tipsWorld: Record<string, THREE.Vector3> = {};
    for (const [n, p] of Object.entries(m.tipsL)) tipsWorld[n] = p;
    const lFrame: Frame = {
      ...plan.geom,
      center: geomCenter,
      axis: geomAxis,
      radius: plan.tipsRadius,
      wrapRadius: plan.tipsRadius + 0.02,
      u: uW,
      v: vW,
      anchor: plan.handLTarget,
      axisPoint: geomCenter,
    };
    c += cylinderCost(lFrame, tipsWorld, targets, 3);
    if (m.foreGap < 0.014) c += (0.014 - m.foreGap) ** 2 * 600;
    c += limitPenalty(ev, deltas) + 0.02 * restPenalty(deltas);
    return c;
  };

  const allL = ["hand.L", ...palmBones, ...fingers.flat()];
  descendReal(ev, deltas, ["hand.L", ...palmBones], cost, [0.25, 0.1, 0.04], 6);
  descendReal(ev, deltas, fingers.flat(), cost, [0.3, 0.15, 0.07, 0.03], 8);
  const best = descendReal(ev, deltas, allL, cost, [0.04, 0.015, 0.006], 6);
  return { deltas, cost: best };
}

// ================= main =================
function main(): void {
  for (const weapon of ["rifle", "pistol"] as const) {
    const anchor = new THREE.Vector3(...WEAPONS[weapon].armsHandR);
    const f = makeFrame(GRIP[weapon], anchor);
    const ev = new ArmEval(weapon);
    if (!ev.ok) throw new Error(`attach falhou (${weapon})`);
    console.log(`\n=========== ${weapon} ===========`);

    let bestR: ReturnType<typeof solveR> | null = null;
    let bestDir: 1 | -1 = 1;
    for (const wrapDir of [1, -1] as const) {
      const r = solveR(ev, f, wrapDir);
      const m = ev.metrics();
      const perps = Object.entries(rTargets(f, wrapDir)).map(([n]) => {
        const d = m.tipsR[n].clone().sub(f.center);
        return d.clone().addScaledVector(f.axis, -d.dot(f.axis)).length();
      });
      console.log(`wrapDir=${wrapDir}: custo=${r.cost.toFixed(3)} perp máx=${Math.max(...perps).toFixed(4)}`);
      if (!bestR || r.cost < bestR.cost) { bestR = r; bestDir = wrapDir; }
    }
    console.log(`→ wrapDir escolhido: ${bestDir} (custo ${bestR!.cost.toFixed(3)})`);

    const L = solveL(ev, f, bestR!.deltas, bestDir);
    console.log(`custo L: ${L.cost.toFixed(3)}`);

    const allDeltas = new Map<string, THREE.Euler>([...bestR!.deltas, ...L.deltas]);
    ev.setDeltas(allDeltas);
    const m = ev.metrics();
    console.log(`-- métricas finais (espaço do holder) --`);
    for (const [n, p] of Object.entries(m.tipsR)) {
      const d = p.clone().sub(f.center);
      const perp = d.clone().addScaledVector(f.axis, -d.dot(f.axis)).length();
      console.log(`  ${n.padEnd(14)} d_âncora=${p.distanceTo(f.anchor).toFixed(4)} perp_eixo=${perp.toFixed(4)}`);
    }
    const nu = m.palmNormalR.dot(f.u);
    console.log(`  palma: dot(n,radial)=${nu.toFixed(2)} |n.z|=${Math.abs(m.palmNormalR.z).toFixed(2)} foreGap=${m.foreGap.toFixed(4)}`);
    console.log(`  handL: (${m.handL.x.toFixed(4)},${m.handL.y.toFixed(4)},${m.handL.z.toFixed(4)})`);
    for (const [n, p] of Object.entries(m.tipsL)) console.log(`  ${n.padEnd(14)} (${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)})`);

    // ---- emitir package ----
    const bones: Record<string, { rot?: [number, number, number, number]; pos?: [number, number, number] }> = {};
    for (const [name] of allDeltas) {
      const node = ev.byOrig.get(name)!;
      node.quaternion.normalize();
      bones[name] = { rot: [node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w] };
    }
    ev.setPositions(ev.posDelta);
    for (const [name, v] of ev.posDelta) {
      const rest = ev.restPos.get(name)!;
      bones[name] = { pos: [rest.x + v.x, rest.y + v.y, rest.z + v.z] };
    }
    const pkg = {
      weapon,
      source: "prd-proj1-assets/inputs/models/viewmodel_arms.glb (rest) — solver M2 v2, espaço R, geometria medida (grip.ts)",
      bones,
      renames: { "hand.R": "handR", "hand.L": "handL" },
      notes: `M2 v2: init analítica do frame medido (dedos tangentes ao eixo, palma ao eixo; convenção provada R+X/L−X); alvos na superfície do cilindro; wrapDir=${bestDir}; regularizador de descanso 0.02 + barreira de limites.`,
    };
    const out = path.join(ROOT, "poses", `pose_${weapon}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(pkg, null, 2));
    console.log(`package: ${out} (${Object.keys(bones).length} bones)`);
  }
}

main();
