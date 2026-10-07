/** Debug CCD L: por que a cadeia esquerda não se move? */
import * as THREE from "three";
import { ArmEval, makeFrame, lPlan } from "./solve-lib";
import { GRIP } from "./grip";
import { WEAPONS } from "./normalize";

const weapon = "rifle" as const;
const anchor = new THREE.Vector3(...WEAPONS[weapon].armsHandR);
const f = makeFrame(GRIP[weapon], anchor);
const ev = new ArmEval(weapon);
const plan = lPlan(weapon, f);
console.log(
  "handLTarget:",
  plan.handLTarget
    .toArray()
    .map((v) => v.toFixed(4))
    .join(","),
);
const chain = ["forearm.L", "upper_arm.L", "deltoid.L", "clavicle.L"];
const deltas = new Map<string, THREE.Euler>();
for (const b of chain) deltas.set(b, new THREE.Euler(0, 0, 0));
// uma iteração manual com prints
ev.setDeltas(deltas);
const m0 = ev.metrics();
console.log(
  "handL início:",
  m0.handL
    .toArray()
    .map((v) => v.toFixed(4))
    .join(","),
);
for (const joint of chain) {
  ev.setDeltas(deltas);
  const m = ev.metrics();
  const endW = m.handL.clone().applyMatrix4(new THREE.Matrix4()); // holder-space ok
  const node = ev.byOrig.get(joint)!;
  const jW = node.getWorldPosition(new THREE.Vector3());
  console.log(
    `${joint}: jointW=(${jW
      .toArray()
      .map((v) => v.toFixed(3))
      .join(",")}) end=(${m.handL
      .toArray()
      .map((v) => v.toFixed(3))
      .join(",")}) tgt=(${plan.handLTarget
      .toArray()
      .map((v) => v.toFixed(3))
      .join(",")})`,
  );
  const v1 = m.handL.clone().sub(jW); // aproximação: holder≈world direções não idênticas, mas diagnóstico
  const v2 = plan.handLTarget.clone().sub(jW);
  const axis = new THREE.Vector3().crossVectors(v1, v2);
  const sin = axis.length() / Math.max(1e-9, v1.length() * v2.length());
  console.log(
    `  |v1|=${v1.length().toFixed(3)} |v2|=${v2.length().toFixed(3)} sin=${sin.toFixed(4)} lim=${(140).toFixed(0)}`,
  );
}
