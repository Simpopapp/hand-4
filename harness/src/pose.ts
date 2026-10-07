/**
 * Pacote de pose: tipagem de entrada (project1.md — "tipagem de entrada"),
 * aplicação aos bones e preservação de skin/mesh.
 */
import * as THREE from "three";
import type { BuiltTree } from "./glb";

/** Pacote de pose — autorado em espaço R (GLB cru da arma), attach à model. */
export interface PosePackage {
  weapon: "rifle" | "pistol";
  source: string;
  /** rotações LOCAIS que substituem o descanso, por nome de bone (quaternion xyzw) */
  bones: Record<
    string,
    {
      rot?: [number, number, number, number];
      euler?: [number, number, number];
      pos?: [number, number, number];
    }
  >;
  /** renames de nós exigidos pelo contrato (hand.R→handR) */
  renames?: Record<string, string>;
  notes?: string;
}

export type ValidationError = { field: string; problem: string };

/** Validação estrita de tipos (tipagem de entrada). Retorna lista de erros. */
export function validatePoseSchema(raw: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof raw !== "object" || raw === null)
    return [{ field: "$", problem: "pacote não é objeto" }];
  const p = raw as Record<string, unknown>;
  if (!["rifle", "pistol"].includes(p["weapon"] as string))
    errors.push({
      field: "weapon",
      problem: `esperado rifle|pistol, obtido ${JSON.stringify(p["weapon"])}`,
    });
  if (typeof p["source"] !== "string")
    errors.push({ field: "source", problem: "string obrigatória" });
  if (typeof p["bones"] !== "object" || p["bones"] === null || Array.isArray(p["bones"])) {
    errors.push({ field: "bones", problem: "objeto obrigatório (nome→rot/euler)" });
  } else {
    for (const [bone, spec] of Object.entries(p["bones"] as Record<string, unknown>)) {
      if (typeof spec !== "object" || spec === null) {
        errors.push({ field: `bones.${bone}`, problem: "objeto obrigatório" });
        continue;
      }
      const s = spec as Record<string, unknown>;
      if (s["rot"] !== undefined) {
        const ok =
          Array.isArray(s["rot"]) &&
          (s["rot"] as unknown[]).length === 4 &&
          (s["rot"] as unknown[]).every((v) => typeof v === "number" && Number.isFinite(v));
        if (!ok)
          errors.push({
            field: `bones.${bone}.rot`,
            problem: "quaternion [x,y,z,w] numérico obrigatório",
          });
        else {
          const [x, y, z, w] = s["rot"] as number[];
          const len = Math.hypot(x, y, z, w);
          if (Math.abs(len - 1) > 1e-4)
            errors.push({
              field: `bones.${bone}.rot`,
              problem: `quaternion não normalizado (|q|=${len.toFixed(4)})`,
            });
        }
      }
      if (s["euler"] !== undefined) {
        const ok =
          Array.isArray(s["euler"]) &&
          (s["euler"] as unknown[]).length === 3 &&
          (s["euler"] as unknown[]).every((v) => typeof v === "number" && Number.isFinite(v));
        if (!ok)
          errors.push({
            field: `bones.${bone}.euler`,
            problem: "euler [x,y,z] numérico obrigatório",
          });
      }
      if (s["pos"] !== undefined) {
        const ok =
          Array.isArray(s["pos"]) &&
          (s["pos"] as unknown[]).length === 3 &&
          (s["pos"] as unknown[]).every((v) => typeof v === "number" && Number.isFinite(v));
        if (!ok)
          errors.push({ field: `bones.${bone}.pos`, problem: "pos [x,y,z] numérico obrigatório" });
      }
      if (s["rot"] === undefined && s["euler"] === undefined && s["pos"] === undefined)
        errors.push({ field: `bones.${bone}`, problem: "nem rot nem euler nem pos" });
      // Emenda M2: `pos` (posição local absoluta) é permitido APENAS em nós
      // .control (o pivô do controle coincide com a origem da mão — rotação
      // não translada; o posicionamento exige pos). Bones deform continuam
      // restritos a rotação.
      const extra = Object.keys(s).filter(
        (k) => k !== "rot" && k !== "euler" && !(k === "pos" && bone.endsWith(".control")),
      );
      if (extra.length)
        errors.push({
          field: `bones.${bone}`,
          problem: `campos proibidos: ${extra.join(",")} (apenas rotação é permitida)`,
        });
    }
  }
  if (p["renames"] !== undefined) {
    if (typeof p["renames"] !== "object" || p["renames"] === null || Array.isArray(p["renames"]))
      errors.push({ field: "renames", problem: "objeto obrigatório" });
    else {
      for (const [from, to] of Object.entries(p["renames"] as Record<string, unknown>)) {
        if (typeof to !== "string")
          errors.push({ field: `renames.${from}`, problem: "string obrigatória" });
      }
    }
  }
  return errors;
}

/** Aplica as rotações do pacote aos bones (substitui o descanso). */
export function applyPose(arms: BuiltTree, pose: PosePackage): string[] {
  const applied: string[] = [];
  const missing: string[] = [];
  for (const [bone, spec] of Object.entries(pose.bones)) {
    const node = arms.byName.get(bone);
    if (!node) {
      missing.push(bone);
      continue;
    }
    if (spec.pos) node.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    if (spec.rot) node.quaternion.set(spec.rot[0], spec.rot[1], spec.rot[2], spec.rot[3]);
    else if (spec.euler)
      node.quaternion.setFromEuler(new THREE.Euler(spec.euler[0], spec.euler[1], spec.euler[2]));
    applied.push(bone);
  }
  return missing;
}
