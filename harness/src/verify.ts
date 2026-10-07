/* eslint-disable @typescript-eslint/no-explicit-any -- GLB JSON chunks têm forma dinâmica por natureza (parse de binário) */
/**
 * Regras do verificador (M1). Lê requirements.yaml e avalia um pacote de
 * pose contra os rigs reconstruídos. Independente do solver por construção:
 * nenhuma importação de código de geração.
 *
 * Saída: lista de resultados PASS | FAIL | UNVERIFIED + veredito global.
 * "UNVERIFIED não é PASS" — qualquer UNVERIFIED bloqueia all_gates_passed.
 */
import * as THREE from "three";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import type { GlbData, BuiltTree } from "./glb";
import { parseGlb, buildNodeTree, sceneBoundingBox } from "./glb";
import { WEAPONS, buildFullRig, REQUIRED_RENAMES } from "./normalize";
import { validatePoseSchema, applyPose, type PosePackage } from "./pose";

export type Status = "PASS" | "FAIL" | "UNVERIFIED";
export interface RuleResult {
  id: string;
  category: string;
  status: Status;
  detail: string;
}
export interface VerifyReport {
  poseFile: string;
  weapon: string;
  verdict: "PASS" | "FAIL";
  results: RuleResult[];
  unverifiedCount: number;
  failCount: number;
  passCount: number;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."); // /dev-server (roda em bun e node)
const REQ_PATH = path.join(ROOT, "requirements.yaml");
export const ARMS_GLB = path.join(ROOT, "prd-proj1-assets/inputs/models/viewmodel_arms.glb");
export const WEAPON_GLBS: Record<string, string> = {
  rifle: path.join(ROOT, "prd-proj1-assets/inputs/models/viewmodel_rifle.glb"),
  pistol: path.join(ROOT, "prd-proj1-assets/inputs/models/viewmodel_pistol.glb"),
};

interface Reqs {
  tolerances: Record<string, number>;
  jointLimits: Record<string, number>;
  visual: Record<string, any>;
  checks: Array<{ id: string; category: string; desc: string }>;
}

export function loadRequirements(): Reqs {
  return YAML.parse(fs.readFileSync(REQ_PATH, "utf8")) as Reqs;
}

function limitFor(bone: string, limits: Record<string, number>): number {
  const cls = bone.startsWith("f_")
    ? "finger"
    : bone.startsWith("thumb")
      ? "thumb"
      : bone.startsWith("forearm")
        ? "forearm"
        : bone.startsWith("upper_arm")
          ? "upper_arm"
          : bone.startsWith("deltoid")
            ? "deltoid"
            : bone.startsWith("clavicle")
              ? "clavicle"
              : bone.startsWith("hand")
                ? "hand"
                : "default";
  return limits[cls] ?? limits["default"];
}

/** Cria um resultado UNVERIFIED por regra definida (usado quando o pipeline não roda). */
function allRulesUnverified(reqs: Reqs, detail: string): RuleResult[] {
  return reqs.checks.map(
    (c) => ({ id: c.id, category: c.category, status: "UNVERIFIED", detail }) as RuleResult,
  );
}

interface Ctx {
  reqs: Reqs;
  pose: PosePackage;
  rawErrors: ReturnType<typeof validatePoseSchema>;
  armsGlb: GlbData;
  armsRest: BuiltTree;
  armsPoed: BuiltTree;
  weaponTree: BuiltTree | null;
  rawBox: THREE.Box3 | null;
  rig: ReturnType<typeof buildFullRig> | null;
  appliedRenames: string[];
  missingBones: string[];
  rootSnapshot: Array<{
    name: string;
    pos: THREE.Vector3;
    scale: THREE.Vector3;
    quat: THREE.Quaternion;
  }>;
}

function rule(ctx: Ctx, id: string): RuleResult {
  const meta = ctx.reqs.checks.find((c) => c.id === id)!;
  const make = (status: Status, detail: string): RuleResult => ({
    id,
    category: meta.category,
    status,
    detail,
  });
  const tol = ctx.reqs.tolerances;

  try {
    switch (id) {
      case "glb_integrity": {
        const nAcc = ctx.armsGlb.json.accessors?.length ?? 0;
        const nBv = ctx.armsGlb.json.bufferViews?.length ?? 0;
        if (!nAcc || !nBv) return make("FAIL", "accessors/bufferViews ausentes");
        return make(
          "PASS",
          `GLB íntegro: ${nAcc} accessors, ${nBv} bufferViews, ${ctx.armsGlb.byteLength}B`,
        );
      }
      case "unique_node_names": {
        const names = ctx.armsPoed.nodes.map((n) => n.name);
        const dup = names.filter((n, i) => names.indexOf(n) !== i);
        return dup.length
          ? make("FAIL", `nomes duplicados: ${[...new Set(dup)].join(",")}`)
          : make("PASS", `${names.length} nós, sem duplicidade`);
      }
      case "handR_node_present": {
        const ok = ctx.armsPoed.byName.has("handR");
        return ok
          ? make("PASS", "nó 'handR' presente")
          : make("FAIL", "nó 'handR' ausente — braços ancorariam na origem (VM:278-279)");
      }
      case "skin_preserved": {
        const src = ctx.armsRest.skins;
        const dst = ctx.armsPoed.skins;
        const same =
          src.length === dst.length &&
          src.every(
            (s, i) =>
              s.joints.length === dst[i].joints.length &&
              s.joints.every((j, k) => j === dst[i].joints[k]),
          );
        if (!same) return make("FAIL", "lista de joints divergiu do fonte");
        const nMeshSrc = ctx.armsGlb.json.meshes?.length ?? 0;
        if (nMeshSrc !== 1) return make("UNVERIFIED", `fonte inesperado: ${nMeshSrc} meshes`);
        return make("PASS", `skin intacta: ${src[0]?.joints.length ?? 0} joints`);
      }
      case "no_extra_primitives": {
        const prims = (ctx.armsGlb.json.meshes ?? []).reduce(
          (a: number, m: any) => a + (m.primitives?.length ?? 0),
          0,
        );
        return prims === 1
          ? make("PASS", "1 primitiva (a malha original)")
          : make("FAIL", `${prims} primitivas — malha alterada`);
      }
      case "pose_schema_valid": {
        return ctx.rawErrors.length === 0
          ? make("PASS", "schema ok")
          : make("FAIL", ctx.rawErrors.map((e) => `${e.field}: ${e.problem}`).join("; "));
      }
      case "requirements_covered": {
        const probs: string[] = [];
        if (!["rifle", "pistol"].includes(ctx.pose.weapon)) probs.push("weapon desconhecido");
        for (const [from, to] of Object.entries(REQUIRED_RENAMES)) {
          if ((ctx.pose.renames ?? {})[from] !== to)
            probs.push(`rename obrigatório ausente: ${from}→${to}`);
        }
        return probs.length
          ? make("FAIL", probs.join("; "))
          : make("PASS", "renames obrigatórios presentes");
      }
      case "root_identity": {
        // O root do BAKE (nó topo do GLB) deve manter o TRS do descanso —
        // a transformação de jogo (escala/yaw/posição) é aplicada em runtime
        // pelo próprio jogo e não faz parte do bake.
        const snap = ctx.rootSnapshot;
        const rest = ctx.armsRest.root.children.map((c) => c);
        let bad = "";
        ctx.armsPoed.root.children.forEach((top, i) => {
          const r = rest[i];
          if (r.position.distanceTo(top.position) > tol.matrixEps)
            bad = `pos alterada em ${top.name}`;
          if (r.scale.distanceTo(top.scale) > tol.matrixEps) bad = `scale alterada em ${top.name}`;
          if (r.quaternion.angleTo(top.quaternion) > 1e-3) bad = `rot alterada em ${top.name}`;
        });
        void snap;
        return bad
          ? make("FAIL", `root do bake alterado: ${bad}`)
          : make("PASS", `${ctx.armsPoed.root.children.length} nó(s) topo em TRS de descanso`);
      }
      case "rotation_only_changes": {
        if (ctx.missingBones.length)
          return make("FAIL", `bones citados inexistentes no GLB: ${ctx.missingBones.join(",")}`);
        const moved: string[] = [];
        ctx.armsPoed.nodes.forEach((node, i) => {
          // EMENDA M2 (D8): nós .control podem carregar pos — o pivô do
          // controle coincide com a origem da mão; rotação não translada.
          if (node.name.endsWith(".control")) return;
          const rest = ctx.armsRest.nodes[i];
          if (
            node.position.distanceTo(rest.position) > tol.matrixEps ||
            node.scale.distanceTo(rest.scale) > tol.matrixEps
          )
            moved.push(node.name);
        });
        return moved.length
          ? make("FAIL", `translação/escala de bone alterada: ${moved.slice(0, 5).join(",")}`)
          : make("PASS", "só rotações mudam (TRS preservado nó a nó)");
      }
      case "rest_identity_preserved": {
        const touched = new Set(Object.keys(ctx.pose.bones));
        // renames: um bone citado pelo nome original também conta pelo nome
        // renomeado no bake (hand.R→handR) — a árvore pós-rename usa o novo.
        for (const [from, to] of Object.entries(ctx.pose.renames ?? {})) {
          if (touched.has(from)) touched.add(to);
          if (touched.has(to)) touched.add(from);
        }
        const changed: string[] = [];
        ctx.armsPoed.nodes.forEach((node, i) => {
          if (touched.has(node.name)) return;
          const rest = ctx.armsRest.nodes[i];
          // comparação componente a componente: quaternions do rig não são
          // perfeitamente normalizados e angleTo(x,x) pode dar ~5e-4 rad.
          const dq = Math.max(
            Math.abs(rest.quaternion.x - node.quaternion.x),
            Math.abs(rest.quaternion.y - node.quaternion.y),
            Math.abs(rest.quaternion.z - node.quaternion.z),
            Math.abs(rest.quaternion.w - node.quaternion.w),
          );
          if (dq > 1e-9) changed.push(node.name);
        });
        return changed.length
          ? make("FAIL", `bones fora do pacote foram alterados: ${changed.slice(0, 5).join(",")}`)
          : make("PASS", "rest preservado fora do pacote");
      }
      case "joint_limits": {
        const over: string[] = [];
        for (const [boneRaw] of Object.entries(ctx.pose.bones)) {
          // resolve o nome pelos renames declarados (hand.R→handR no bake)
          const bone = (ctx.pose.renames ?? {})[boneRaw] ?? boneRaw;
          const nodeP = ctx.armsPoed.byName.get(bone);
          const i = ctx.armsPoed.nodes.indexOf(nodeP!);
          if (!nodeP || i < 0) continue;
          const rest = ctx.armsRest.nodes[i];
          const deg = THREE.MathUtils.radToDeg(rest.quaternion.angleTo(nodeP.quaternion));
          const lim = limitFor(bone, ctx.reqs.jointLimits);
          if (deg > lim + 0.01) over.push(`${bone}: ${deg.toFixed(1)}° > ${lim}°`);
        }
        return over.length
          ? make("FAIL", over.join("; "))
          : make("PASS", `${Object.keys(ctx.pose.bones).length} bones dentro dos limites`);
      }
      case "chain_continuity": {
        // comprimento LOCAL de cada osso (|translação do filho|) preservado —
        // imune às transformações de runtime do jogo.
        const broken: string[] = [];
        ctx.armsPoed.nodes.forEach((node, i) => {
          const rest = ctx.armsRest.nodes[i];
          node.children.forEach((child, j) => {
            const restChild = rest.children[j];
            if (!restChild || child.name.endsWith(".control")) return;
            const now = child.position.length();
            const was = restChild.position.length();
            if (was > 1e-9 && Math.abs(now - was) > was * 0.02)
              broken.push(`${node.name}→${child.name} (${now.toFixed(4)} vs ${was.toFixed(4)})`);
          });
        });
        return broken.length
          ? make("FAIL", broken.slice(0, 4).join("; "))
          : make("PASS", "comprimentos de osso preservados");
      }
      case "handR_anchor": {
        if (!ctx.rig) return make("UNVERIFIED", "rig não montado");
        if (!ctx.rig.attach.ok || !ctx.rig.attach.handRWorld)
          return make("FAIL", "attach falhou: handR ausente no pipeline (VM:279)");
        const target = new THREE.Vector3(...WEAPONS[ctx.pose.weapon].armsHandR);
        const got = ctx.rig.attach.handRWorld;
        const d = got.distanceTo(target);
        return d <= tol.position
          ? make(
              "PASS",
              `handR em (${got.x.toFixed(4)},${got.y.toFixed(4)},${got.z.toFixed(4)}), d=${d.toFixed(5)}m`,
            )
          : make("FAIL", `handR fora da âncora: d=${d.toFixed(4)}m > ${tol.position}`);
      }
      case "fingers_wrap_grip": {
        if (!ctx.rig || !ctx.rig.attach.ok) return make("UNVERIFIED", "rig/attach indisponível");
        const tips = [...ctx.armsPoed.byName.keys()].filter(
          (n) => /^f_\w+\.03\.R$/.test(n) || n === "thumb.03.R",
        );
        if (!tips.length) return make("UNVERIFIED", "bones de ponta de dedo não encontrados");
        // EMENDA M2 (D7): distância perpendicular ao EIXO do grip (medida),
        // não à âncora — a âncora da pistola fica a 0.048m do vértice mais
        // próximo do grip (nenhum wrap físico passa pelo proxy da âncora).
        const geo = ctx.reqs.visual.gripGeometry[ctx.pose.weapon];
        const center = new THREE.Vector3(...geo.center);
        const axis = new THREE.Vector3(...geo.axis).normalize();
        const wrapR = ctx.reqs.visual.wrapRadius[ctx.pose.weapon];
        const margin = ctx.reqs.visual.wrapAxisMargin;
        const bad = tips
          .map((t) => {
            const d = ctx.armsPoed.byName
              .get(t)!
              .getWorldPosition(new THREE.Vector3())
              .sub(center);
            const tA = d.dot(axis);
            const perp = d.clone().addScaledVector(axis, -tA).length();
            return { t, perp, tA };
          })
          .filter((x) => x.perp > wrapR || Math.abs(x.tA) > geo.halfExt + margin);
        if (bad.length) {
          const worst = bad.reduce((a, b) => (a.perp > b.perp ? a : b));
          return make(
            "FAIL",
            `${bad.length}/${tips.length} pontas fora do grip: perp=${worst.perp.toFixed(3)}m (raio ${wrapR}), eixo t=${worst.tA.toFixed(3)}m (ext ±${(geo.halfExt + margin).toFixed(3)})`,
          );
        }
        return make("PASS", `${tips.length} pontas de dedo no grip (perp ≤ ${wrapR}m, extensão ok)`);
      }
      case "forearm_separation": {
        if (!ctx.rig || !ctx.rig.attach.ok) return make("UNVERIFIED", "rig/attach indisponível");
        const fl = ctx.armsPoed.byName.get("forearm.L");
        const fr = ctx.armsPoed.byName.get("forearm.R");
        if (!fl || !fr) return make("UNVERIFIED", "forearm.L/R ausentes");
        const seg = (a: THREE.Object3D) => {
          const p0 = a.getWorldPosition(new THREE.Vector3());
          const end = a.children[0]
            ? a.children[0].getWorldPosition(new THREE.Vector3())
            : p0.clone();
          return [p0, end] as const;
        };
        const [a0, a1] = seg(fl);
        const [b0, b1] = seg(fr);
        const dist = segSegDist(a0, a1, b0, b1);
        const minGap = ctx.reqs.visual.minForearmGap;
        return dist < minGap
          ? make(
              "FAIL",
              `antebraços cruzados/colados: distância mínima ${dist.toFixed(4)}m < ${minGap}m`,
            )
          : make("PASS", `antebraços separados: ${dist.toFixed(3)}m`);
      }
      case "palm_not_facing_camera": {
        if (!ctx.rig || !ctx.rig.attach.ok) return make("UNVERIFIED", "rig/attach indisponível");
        const wrist = ctx.armsPoed.byName.get("handR") ?? ctx.armsPoed.byName.get("hand.R");
        const idx = ctx.armsPoed.byName.get("palm_index.R");
        const pinky = ctx.armsPoed.byName.get("palm_pinky.R");
        if (!wrist || !idx || !pinky) return make("UNVERIFIED", "bones de palma ausentes");
        const w = wrist.getWorldPosition(new THREE.Vector3());
        const i = idx.getWorldPosition(new THREE.Vector3()).sub(w);
        const k = pinky.getWorldPosition(new THREE.Vector3()).sub(w);
        const normal = new THREE.Vector3().crossVectors(i, k).normalize();
        const facing = Math.abs(normal.z);
        const max = ctx.reqs.visual.maxPalmFacing;
        if (facing > max)
          return make("FAIL", `palma voltada para a câmera: |n.z|=${facing.toFixed(2)} > ${max}`);
        // EMENDA M2 (D7): a palma (lado do cross, provado por convention-test)
        // deve encostar no grip: a normal aponta da âncora para o eixo do grip.
        const geo = ctx.reqs.visual.gripGeometry[ctx.pose.weapon];
        const center = new THREE.Vector3(...geo.center);
        const axis = new THREE.Vector3(...geo.axis).normalize();
        const anchor = new THREE.Vector3(...WEAPONS[ctx.pose.weapon].armsHandR);
        const d = anchor.clone().sub(center);
        const perp = d.clone().addScaledVector(axis, -d.dot(axis)).normalize();
        const radial = normal.dot(perp);
        const minR = ctx.reqs.visual.minPalmRadial;
        return radial > -minR
          ? make("FAIL", `palma afastada do grip: dot(n,radial_âncora)=${radial.toFixed(2)} (esperado ≤ ${-minR})`)
          : make("PASS", `palma contra o grip (dot=${radial.toFixed(2)}) e não encara a câmera (|n.z|=${facing.toFixed(2)})`);
      }
      case "weapon_scale_formula": {
        if (!ctx.rig || !ctx.rawBox) return make("UNVERIFIED", "bbox da arma não medida");
        const cfg = WEAPONS[ctx.pose.weapon];
        const size = ctx.rawBox.getSize(new THREE.Vector3());
        const expected = cfg.length / Math.max(size.x, size.z);
        const got = ctx.rig.scale;
        return Math.abs(got - expected) < tol.matrixEps
          ? make("PASS", `escala ${got.toFixed(5)} == length/max(x,z)`)
          : make("FAIL", `escala ${got.toFixed(5)} != esperado ${expected.toFixed(5)}`);
      }
      case "matrix_recheck": {
        if (!ctx.rig || !ctx.rig.attach.ok) return make("UNVERIFIED", "rig/attach indisponível");
        const handR = ctx.armsPoed.byName.get("handR")!;
        const viaThree = handR.getWorldPosition(new THREE.Vector3());
        const manual = manualWorldPosition(ctx.armsPoed, handR);
        if (!manual) return make("UNVERIFIED", "cadeia manual interrompida");
        const d = viaThree.distanceTo(manual);
        return d < 1e-6
          ? make("PASS", `three.js == mat4 manual (Δ=${d.toExponential(2)})`)
          : make("FAIL", `divergência three.js vs manual: ${d.toExponential(2)}`);
      }
      default:
        return make("UNVERIFIED", `regra sem implementação: ${id}`);
    }
  } catch (err) {
    return make("UNVERIFIED", `erro na execução da regra: ${(err as Error).message}`);
  }
}

/** distância mínima entre dois segmentos 3D. */
function segSegDist(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  q0: THREE.Vector3,
  q1: THREE.Vector3,
): number {
  const d1 = p1.clone().sub(p0);
  const d2 = q1.clone().sub(q0);
  const r = p0.clone().sub(q0);
  const a = d1.dot(d1),
    e = d2.dot(d2),
    f = d2.dot(r);
  let s = 0,
    t = 0;
  if (a <= 1e-12 && e <= 1e-12) return r.length();
  if (a <= 1e-12) {
    t = Math.min(Math.max(f / e, 0), 1);
  } else {
    const c = d1.dot(r);
    if (e <= 1e-12) {
      s = Math.min(Math.max(-c / a, 0), 1);
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? Math.min(Math.max((b * f - c * e) / denom, 0), 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(Math.max(-c / a, 0), 1);
      } else if (t > 1) {
        t = 1;
        s = Math.min(Math.max((b - c) / a, 0), 1);
      }
    }
  }
  return p0.clone().addScaledVector(d1, s).distanceTo(q0.clone().addScaledVector(d2, t));
}

/** world position por multiplicação manual de mat4 (caminho independente do three). */
function manualWorldPosition(tree: BuiltTree, node: THREE.Object3D): THREE.Vector3 | null {
  const chain: THREE.Object3D[] = [];
  let cur: THREE.Object3D | null = node;
  while (cur) {
    chain.unshift(cur);
    cur = cur.parent;
  }
  const m = new THREE.Matrix4();
  for (const o of chain) m.multiply(o.matrix);
  return new THREE.Vector3().setFromMatrixPosition(m);
}

/** Executa o verificador completo sobre um pacote de pose. */
export function verifyPoseFile(poseFile: string, outPath?: string): VerifyReport {
  const reqs = loadRequirements();
  const raw = JSON.parse(fs.readFileSync(poseFile, "utf8"));
  const rawErrors = validatePoseSchema(raw);
  const pose = raw as PosePackage;

  const results: RuleResult[] = [];
  // schema inválido → todas as regras de pipeline ficam UNVERIFIED (não PASS)
  if (rawErrors.length > 0) {
    results.push({
      id: "pose_schema_valid",
      category: "input_typing",
      status: "FAIL",
      detail: rawErrors.map((e) => `${e.field}: ${e.problem}`).join("; "),
    });
    for (const c of reqs.checks) {
      if (c.id === "pose_schema_valid") continue;
      if (
        c.id === "requirements_covered" &&
        typeof raw === "object" &&
        raw !== null &&
        ["rifle", "pistol"].includes((raw as any)["weapon"])
      )
        continue; // avaliável mesmo com erro de tipo em bones
      results.push({
        id: c.id,
        category: c.category,
        status: "UNVERIFIED",
        detail: "não avaliado: schema inválido",
      });
    }
    return finish(poseFile, pose, results, outPath);
  }

  const armsBuf = fs.readFileSync(ARMS_GLB);
  const armsGlb = parseGlb(
    armsBuf.buffer.slice(
      armsBuf.byteOffset,
      armsBuf.byteOffset + armsBuf.byteLength,
    ) as ArrayBuffer,
  );
  const armsRest = buildNodeTree(armsGlb);
  const armsPoed = buildNodeTree(armsGlb);
  applyPose(armsPoed, pose);
  const missingBones = applyPose(armsPoed, pose);

  let weaponTree: BuiltTree | null = null;
  let rawBox: THREE.Box3 | null = null;
  let rig: ReturnType<typeof buildFullRig> | null = null;
  // snapshot do bake ANTES das transformações de runtime do jogo (attach)
  const rootSnapshot = armsPoed.root.children.map((c) => ({
    name: c.name,
    pos: c.position.clone(),
    scale: c.scale.clone(),
    quat: c.quaternion.clone(),
  }));
  if (WEAPON_GLBS[pose.weapon]) {
    const wBuf = fs.readFileSync(WEAPON_GLBS[pose.weapon]);
    const wGlb = parseGlb(
      wBuf.buffer.slice(wBuf.byteOffset, wBuf.byteOffset + wBuf.byteLength) as ArrayBuffer,
    );
    const wRest = buildNodeTree(wGlb);
    rawBox = sceneBoundingBox(wGlb, wRest);
    weaponTree = buildNodeTree(wGlb);
    rig = buildFullRig(pose.weapon, weaponTree, armsPoed, pose.renames ?? {}, rawBox);
    rig.root.updateMatrixWorld(true);
  }

  const ctx: Ctx = {
    reqs,
    pose,
    rawErrors,
    armsGlb,
    armsRest,
    armsPoed,
    weaponTree,
    rawBox,
    rig,
    appliedRenames: Object.keys(pose.renames ?? {}),
    missingBones,
    rootSnapshot,
  };
  for (const c of reqs.checks) results.push(rule(ctx, c.id));
  return finish(poseFile, pose, results, outPath);
}

function finish(
  poseFile: string,
  pose: PosePackage,
  results: RuleResult[],
  outPath?: string,
): VerifyReport {
  const failCount = results.filter((r) => r.status === "FAIL").length;
  const unverifiedCount = results.filter((r) => r.status === "UNVERIFIED").length;
  const report: VerifyReport = {
    poseFile: path.relative(process.cwd(), poseFile),
    weapon: pose.weapon,
    verdict: failCount === 0 && unverifiedCount === 0 ? "PASS" : "FAIL",
    results,
    unverifiedCount,
    failCount,
    passCount: results.filter((r) => r.status === "PASS").length,
  };
  const out = outPath ?? "verify_report.json";
  fs.writeFileSync(
    path.isAbsolute(out) ? out : path.join(process.cwd(), out),
    JSON.stringify(report, null, 2),
  );
  return report;
}

/** CLI: bun harness/src/verify.ts --pose <arquivo> [--weapon auto] [--out verify_report.json] */
if (import.meta.main) {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const poseFile = get("--pose");
  if (!poseFile) {
    console.error("uso: bun harness/src/verify.ts --pose <pose.json> [--out <report.json>]");
    process.exit(2);
  }
  const report = verifyPoseFile(path.resolve(poseFile), get("--out"));
  for (const r of report.results)
    console.log(`${r.status.padEnd(10)} [${r.category}] ${r.id} — ${r.detail}`);
  console.log(
    `\nveredito: ${report.verdict} (pass=${report.passCount} fail=${report.failCount} unverified=${report.unverifiedCount})`,
  );
  process.exit(report.verdict === "PASS" ? 0 : 1);
}

void allRulesUnverified;
