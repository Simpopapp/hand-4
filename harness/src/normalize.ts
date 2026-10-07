/**
 * Normalização do jogo, replicada para o harness (M1 — paridade).
 *
 * Fonte: prd-proj1-assets/inputs/src/ViewmodelV2.ts (hashes no MANIFEST).
 * Cada função cita as linhas do código real que replica. O teste de
 * paridade (harness/parity.test.ts) compara contra uma segunda
 * implementação literal do contrato.
 */
import * as THREE from "three";
import type { BuiltTree } from "./glb";
import { sceneBoundingBox } from "./glb";

export type WeaponName = "rifle" | "pistol";

export interface WeaponCfg {
  length: number;
  /** Euler em radianos + ordem */
  rot: [number, number, number];
  rotOrder: THREE.EulerOrder;
  offset: [number, number, number];
  hip: [number, number, number];
  sightTarget: [number, number, number];
  armsScale: number;
  /** âncora do punho direito no espaço do holder (VM:60,74) */
  armsHandR: [number, number, number];
}

/** VM:49-76 (valores conferidos linha a linha em M0 → contract.json). */
export const WEAPONS: Record<WeaponName, WeaponCfg> = {
  rifle: {
    length: 0.82,
    rot: [0, 0, 0],
    rotOrder: "XYZ",
    offset: [0, 0, 0],
    hip: [0.22, -0.24, -0.42],
    sightTarget: [0, -0.006, -0.26],
    armsScale: 0.12,
    armsHandR: [0.035, -0.035, 0.125],
  },
  pistol: {
    length: 0.19,
    // D6 (M2): o jogo faz group.rotation.set(cfg.rot.x, cfg.rot.y, cfg.rot.z)
    // (VM:167) SEM passar a order — Euler.set usa this._order, e um Group novo
    // é 'XYZ'. A order 'YXZ' do cfg.rot é descartada em runtime. O harness
    // replica o comportamento REAL do jogo: order XYZ.
    rot: [Math.PI / 2, Math.PI / 2, 0],
    rotOrder: "XYZ",
    offset: [0, 0, 0],
    hip: [0.19, -0.23, -0.36],
    sightTarget: [0, -0.012, -0.22],
    armsScale: 0.1,
    armsHandR: [0.0, -0.065, 0.035],
  },
};

/** RENAMES exigidos no bake: o jogo procura "handR" EXATO (VM:278). */
export const REQUIRED_RENAMES: Record<string, string> = {
  "hand.R": "handR",
  "hand.L": "handL",
};

export interface WeaponRig {
  /** espaço R = espaço local do model (GLB cru da arma) */
  model: THREE.Object3D;
  group: THREE.Group;
  holder: THREE.Group;
  scale: number;
  /** bbox do modelo cru (R) */
  rawBox: THREE.Box3;
}

/**
 * VM:154-182 — arma: clone→escala (length/max(bbox.x,bbox.z))→rot→group,
 * centraliza bbox + offset, holder = grupo animável.
 * `modelSpace` false: `model` é a raiz construída (equivalente ao gltf.scene).
 */
export function buildWeaponRig(
  weapon: WeaponName,
  tree: BuiltTree,
  rawBox: THREE.Box3 | null = null,
): WeaponRig {
  const cfg = WEAPONS[weapon];
  const box = rawBox ?? sceneBoundingBoxOfTree(tree);
  const size = box.getSize(new THREE.Vector3());
  const scale = cfg.length / Math.max(size.x, size.z); // VM:159-168

  const model = tree.root; // fonte sem pose; pose congelada já está nos bones
  const group = new THREE.Group(); // VM:166-169
  group.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2], cfg.rotOrder);
  group.add(model);
  model.scale.setScalar(scale); // VM:159-168 (escala no model, como no jogo)

  // VM:172-180 — center = bbox(group) com o model JÁ escalado+rotacionado,
  // em espaço do group (group.position ainda 0). Réplica de Box3.setFromObject:
  // união da bbox LOCAL de cada mesh transformada pela matrixWorld do nó
  // (inclui rotações locais dos nós — a união NÃO comuta com rotação arbitrária).
  model.updateMatrixWorld(true);
  const worldBox = new THREE.Box3();
  const tmpBox = new THREE.Box3();
  for (const [idx, localBox] of tree.meshBoxes) {
    // node.matrixWorld já inclui a rotação do group (ancestral do model)
    tmpBox.copy(localBox).applyMatrix4(tree.nodes[idx].matrixWorld);
    worldBox.union(tmpBox);
  }
  if (worldBox.isEmpty()) throw new Error("bbox vazia: nenhum mesh no GLB da arma");
  const center = worldBox.getCenter(new THREE.Vector3());
  group.position.set(
    -center.x + cfg.offset[0],
    -center.y + cfg.offset[1],
    -center.z + cfg.offset[2],
  );

  const holder = new THREE.Group(); // VM:181-182
  holder.add(group);
  return { model, group, holder, scale, rawBox: box };
}

/** bbox de fallback quando o caller não passou a bbox medida do GLB cru. */
export function sceneBoundingBoxOfTree(_tree: BuiltTree): THREE.Box3 {
  throw new Error("bbox do GLB cru deve ser medida antes (medir antes de posar)");
}

/**
 * VM:260-282 — braços: filhos do holder, escala cfg.armsScale, yaw 180° em Y,
 * position = armsHandR − worldPos(handR) em espaço do holder.
 * Retorna false se o nó "handR" não existir (jogo: return em L279 — braços
 * ficam na origem; verificador reprova).
 */
export function attachArms(
  arms: BuiltTree,
  holder: THREE.Object3D,
  weapon: WeaponName,
): { ok: boolean; handRWorld: THREE.Vector3 | null } {
  const cfg = WEAPONS[weapon];
  holder.add(arms.root); // VM:264
  arms.root.scale.setScalar(cfg.armsScale); // VM:274
  arms.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI); // VM:275
  const handR = arms.byName.get("handR");
  if (!handR) return { ok: false, handRWorld: null }; // VM:278-279
  holder.updateMatrixWorld(true);
  const local = holder.worldToLocal(handR.getWorldPosition(new THREE.Vector3())); // VM:280
  arms.root.position.copy(new THREE.Vector3(...cfg.armsHandR)).sub(local); // VM:281
  holder.updateMatrixWorld(true);
  return { ok: true, handRWorld: handR.getWorldPosition(new THREE.Vector3()) };
}

/** Renomeia nós conforme o contrato de bake (hand.R→handR etc.). Retorna os renames aplicados. */
export function applyRenames(arms: BuiltTree, renames: Record<string, string>): string[] {
  const applied: string[] = [];
  for (const [from, to] of Object.entries(renames)) {
    const node = arms.byName.get(from);
    if (!node) continue;
    if (arms.byName.has(to)) throw new Error(`rename colide com nome existente: ${to}`);
    arms.byName.delete(from);
    node.name = to;
    arms.byName.set(to, node);
    applied.push(`${from}→${to}`);
  }
  return applied;
}

/** Monta o rig completo do jogo: root→holder→(group→model, arms). VM:127+260-282. */
export function buildFullRig(
  weapon: WeaponName,
  weaponTree: BuiltTree,
  armsTree: BuiltTree,
  renames: Record<string, string>,
  rawBox: THREE.Box3 | null = null,
) {
  const rig = buildWeaponRig(weapon, weaponTree, rawBox);
  const root = new THREE.Group();
  root.add(rig.holder);
  applyRenames(armsTree, renames);
  const attach = attachArms(armsTree, rig.holder, weapon);
  root.updateMatrixWorld(true);
  return { ...rig, root, attach };
}
