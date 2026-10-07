/**
 * Teste de paridade (M1): o harness replica a normalização do jogo?
 *
 * Estratégia de independência: cada paridade tem DUAS implementações —
 * (a) o módulo harness/src/normalize.ts reutilizável e (b) uma tradução
 * literal do contrato (game_contract.md / VM:154-282) escrita inline no
 * teste. Elas devem concordar numericamente nos GLBs reais.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { parseGlb, buildNodeTree, sceneBoundingBox } from "./src/glb";
import { WEAPONS, buildWeaponRig, buildFullRig, attachArms, applyRenames } from "./src/normalize";
import { verifyPoseFile } from "./src/verify";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODELS = path.join(ROOT, "prd-proj1-assets/inputs/models");

function loadGlb(rel: string) {
  const buf = fs.readFileSync(path.join(MODELS, rel));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return parseGlb(ab);
}

/** (b) tradução LITERAL de VM:154-182, escrita a partir do game_contract.md. */
function referenceWeaponRig(
  weapon: "rifle" | "pistol",
  tree: ReturnType<typeof buildNodeTree>,
  box: THREE.Box3,
  glb: ReturnType<typeof parseGlb>,
) {
  const cfg = WEAPONS[weapon];
  const size = box.getSize(new THREE.Vector3());
  const scale = cfg.length / Math.max(size.x, size.z);
  const group = new THREE.Group();
  // D6 (M2): o jogo faz group.rotation.set(x, y, z) sem order (VM:167) —
  // Euler.set preserva this._order do Group novo = 'XYZ'. Tradução literal.
  group.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
  group.add(tree.root);
  tree.root.scale.setScalar(scale);
  tree.root.updateMatrixWorld(true);
  // bbox(group): no jogo é Box3.setFromObject sobre meshes; aqui, união dos
  // accessors POSITION × matrixWorld (equivalente exato — árvores sem geometria)
  const worldBox = sceneBoundingBox(glb, tree);
  const center = worldBox.getCenter(new THREE.Vector3());
  group.position.set(
    -center.x + cfg.offset[0],
    -center.y + cfg.offset[1],
    -center.z + cfg.offset[2],
  );
  const holder = new THREE.Group();
  holder.add(group);
  return { group, holder, scale };
}

describe("paridade arma (VM:154-182)", () => {
  for (const weapon of ["rifle", "pistol"] as const) {
    it(`escala e centralização idênticas à tradução literal — ${weapon}`, () => {
      const glb = loadGlb(`viewmodel_${weapon}.glb`);
      const treeA = buildNodeTree(glb);
      const box = sceneBoundingBox(glb, treeA);
      const treeB = buildNodeTree(glb);
      const ref = referenceWeaponRig(weapon, treeB, box, glb);
      const mine = buildWeaponRig(weapon, treeA, box);
      expect(mine.scale).toBeCloseTo(ref.scale, 10);
      expect(mine.group.position.distanceTo(ref.group.position)).toBeLessThan(1e-6);
      // fórmula da spec: scale == length / max(bbox.x, bbox.z)
      const size = box.getSize(new THREE.Vector3());
      expect(mine.scale).toBeCloseTo(WEAPONS[weapon].length / Math.max(size.x, size.z), 10);
    });
  }
});

describe("paridade braços (VM:260-282)", () => {
  it("handR cai exatamente na âncora cfg.arms.handR (rifle)", () => {
    const glbW = loadGlb("viewmodel_rifle.glb");
    const glbA = loadGlb("viewmodel_arms.glb");
    const wTree = buildNodeTree(glbW);
    const rawBox = sceneBoundingBox(glbW, wTree);
    const rig = buildFullRig(
      "rifle",
      wTree,
      buildNodeTree(glbA),
      { "hand.R": "handR", "hand.L": "handL" },
      rawBox,
    );
    rig.root.updateMatrixWorld(true);
    const armsRoot = rig.holder.children.find((c) => c !== rig.group)!;
    const node = armsRoot.getObjectByName("handR")!;
    expect(node).toBeDefined();
    const p = node.getWorldPosition(new THREE.Vector3());
    const target = new THREE.Vector3(...WEAPONS.rifle.armsHandR);
    expect(p.distanceTo(target)).toBeLessThan(1e-6);
  });

  it("sem rename handR → attach falha como no jogo (VM:278-279)", () => {
    const glbW = loadGlb("viewmodel_pistol.glb");
    const glbA = loadGlb("viewmodel_arms.glb");
    const wTree = buildNodeTree(glbW);
    const box = sceneBoundingBox(glbW, wTree);
    const rig = buildWeaponRig("pistol", wTree, box);
    const aTree = buildNodeTree(glbA);
    const res = attachArms(aTree, rig.holder, "pistol");
    expect(res.ok).toBe(false);
    expect(res.handRWorld).toBeNull();
  });

  it("rename aplicado renomeia o nó sem alterar TRS", () => {
    const glbA = loadGlb("viewmodel_arms.glb");
    const tree = buildNodeTree(glbA);
    const before = tree.byName.get("hand.R")!;
    const pos = before.position.clone();
    const quat = before.quaternion.clone();
    const applied = applyRenames(tree, { "hand.R": "handR" });
    expect(applied).toContain("hand.R→handR");
    const after = tree.byName.get("handR")!;
    expect(after.position).toEqual(pos);
    expect(after.quaternion.toArray()).toEqual(quat.toArray());
    expect(tree.byName.has("hand.R")).toBe(false);
  });
});

function glbB(x: unknown): boolean {
  return !!x;
}
void glbB;

describe("gate M1: fixtures inválidas são REPROVADAS pelo verificador", () => {
  const fixtures = fs
    .readdirSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures"))
    .filter((f) => f.endsWith(".json"));
  it("existem ≥5 fixtures inválidas", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
  });
  for (const f of fixtures) {
    it(`${f} → FAIL`, () => {
      const report = verifyPoseFile(
        path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", f),
        path.join("/tmp", `verify_${f}.json`),
      );
      expect(report.verdict).toBe("FAIL");
      expect(report.failCount).toBeGreaterThan(0); // falha real, não apenas UNVERIFIED
    });
  }
});
