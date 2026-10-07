/* eslint-disable @typescript-eslint/no-explicit-any -- GLB JSON chunks têm forma dinâmica por natureza (parse de binário) */
/**
 * GLB parsing + node-tree reconstruction (M1, harness/).
 *
 * Lê o JSON/BIN chunk de um GLB e reconstrói a hierarquia de nós com TRS
 * exatamente como o GLTFLoader do jogo faz — sem texturas/meshes (a pose
 * vive nos bones; skinning autoritativo = three.js, verificado em M3).
 * Bounds de geometria vêm dos accessors POSITION (dados crus do BIN).
 */
import * as THREE from "three";

export interface GlbData {
  json: any;
  bin: Uint8Array;
  byteLength: number;
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export function parseGlb(buf: ArrayBuffer): GlbData {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== GLB_MAGIC) throw new Error("GLB: magic inválido");
  if (dv.getUint32(4, true) !== 2) throw new Error("GLB: versão != 2");
  let off = 12;
  let json: any = null;
  let bin = new Uint8Array(0);
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const data = new Uint8Array(buf, off + 8, len);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(data));
    else if (type === CHUNK_BIN) bin = data;
    off += 8 + len;
    // chunks são 4-byte aligned
    off = off + ((4 - (off % 4)) % 4);
  }
  if (!json) throw new Error("GLB: chunk JSON ausente");
  return { json, bin, byteLength: buf.byteLength };
}

/** Lê os dados crus de um accessor (float/ushort/ubyte/uint) como arrays planos. */
export function readAccessor(
  g: GlbData,
  index: number,
): { data: Float32Array | Uint32Array | Uint16Array | Uint8Array; numComp: number; count: number } {
  const acc = g.json.accessors[index];
  if (acc.bufferView === undefined) throw new Error(`accessor ${index} sem bufferView`);
  const bv = g.json.bufferViews[acc.bufferView];
  const numComp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type as string];
  const compSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[
    acc.componentType as number
  ];
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = bv.byteStride ?? numComp * compSize;
  const count = acc.count;
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset + base);
  const readOne = (o: number): number => {
    switch (acc.componentType) {
      case 5126:
        return dv.getFloat32(o, true);
      case 5123:
        return dv.getUint16(o, true);
      case 5125:
        return dv.getUint32(o, true);
      case 5121:
        return dv.getUint8(o);
      case 5122:
        return dv.getInt16(o, true);
      case 5120:
        return dv.getInt8(o);
      default:
        throw new Error(`componentType ${acc.componentType} não suportado`);
    }
  };
  const total = count * numComp;
  if (stride === numComp * compSize) {
    const out = new (
      acc.componentType === 5126
        ? Float32Array
        : acc.componentType === 5123
          ? Uint16Array
          : acc.componentType === 5125
            ? Uint32Array
            : Uint8Array
    )(total);
    for (let i = 0; i < total; i++) out[i] = readOne(i * compSize);
    return { data: out, numComp, count };
  }
  // stride custom: interleave manual
  const out = new Float32Array(total);
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < numComp; c++) out[i * numComp + c] = readOne(i * stride + c * compSize);
  }
  return { data: out, numComp, count };
}

/** min/max por-eixo de um accessor POSITION. */
export function accessorBounds(g: GlbData, index: number): { min: number[]; max: number[] } {
  const { data, numComp } = readAccessor(g, index);
  const min = new Array(numComp).fill(Infinity);
  const max = new Array(numComp).fill(-Infinity);
  for (let i = 0; i < data.length; i += numComp) {
    for (let c = 0; c < numComp; c++) {
      const v = data[i + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }
  return { min, max };
}

export interface BuiltTree {
  root: THREE.Group;
  nodes: THREE.Object3D[];
  byName: Map<string, THREE.Object3D>;
  /** rotação de descanso (do GLB) por nome de nó, para regras de continuidade */
  restQuat: Map<string, THREE.Quaternion>;
  skins: Array<{ skeleton: string | null; joints: string[] }>;
  /** bbox LOCAL (espaço do nó) de cada nó com mesh — para replicar Box3.setFromObject */
  meshBoxes: Map<number, THREE.Box3>;
}

/**
 * Reconstrói a hierarquia de nós como o GLTFLoader faria: Bone por nó,
 * TRS local do GLB. Nós sem mesh/skin também entram (fiel ao gltf.scene).
 */
export function buildNodeTree(g: GlbData): BuiltTree {
  const json = g.json;
  const defs: any[] = json.nodes ?? [];
  const objs: THREE.Object3D[] = defs.map((n, i) => {
    const o = new THREE.Bone();
    o.name = n.name ?? `node_${i}`;
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    if (n.matrix) {
      const m = new THREE.Matrix4()
        .fromArray(n.matrix)
        .decompose(o.position, o.quaternion, o.scale);
      void m;
    }
    return o;
  });
  const restQuat = new Map<string, THREE.Quaternion>();
  defs.forEach((n, i) => restQuat.set(objs[i].name, objs[i].quaternion.clone()));
  defs.forEach((n, i) => {
    for (const c of n.children ?? []) objs[i].add(objs[c]);
  });
  const roots = objs.filter((_, i) => !(defs[i].children ?? []).length || true);
  const parentOf = new Map<number, number>();
  defs.forEach((n, i) => (n.children ?? []).forEach((c: number) => parentOf.set(c, i)));
  const root = new THREE.Group();
  objs.forEach((o, i) => {
    if (!parentOf.has(i)) root.add(o);
  });
  const byName = new Map<string, THREE.Object3D>();
  objs.forEach((o) => {
    if (byName.has(o.name)) throw new Error(`nome de nó duplicado no GLB: ${o.name}`);
    byName.set(o.name, o);
  });
  const skins = (json.skins ?? []).map((s: any) => ({
    skeleton: s.skeleton !== undefined ? objs[s.skeleton].name : null,
    joints: (s.joints ?? []).map((j: number) => objs[j].name),
  }));
  // bbox LOCAL por nó com mesh (união dos accessors POSITION de cada primitive)
  const meshBoxes = new Map<number, THREE.Box3>();
  (json.nodes ?? []).forEach((n: any, i: number) => {
    if (n.mesh === undefined) return;
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    for (const prim of json.meshes[n.mesh].primitives ?? []) {
      if (prim.attributes?.POSITION === undefined) continue;
      const { min, max } = accessorBounds(g, prim.attributes.POSITION);
      tmp.min.set(min[0], min[1], min[2]);
      tmp.max.set(max[0], max[1], max[2]);
      box.union(tmp);
    }
    if (!box.isEmpty()) meshBoxes.set(i, box);
  });
  void roots;
  return { root, nodes: objs, byName, restQuat, skins, meshBoxes };
}

/**
 * Bounding box da cena no espaço do gltf.scene, replicando
 * THREE.Box3.setFromObject: boundingBox da geometria (8 cantos do
 * min/max do accessor POSITION) transformada por matrixWorld, em união.
 */
export function sceneBoundingBox(g: GlbData, tree: BuiltTree): THREE.Box3 {
  tree.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  const meshNodes = new Set<number>();
  (g.json.meshes ?? []).forEach((m: any) =>
    (m.primitives ?? []).forEach((p: any) => meshNodes.add(p)),
  );
  // nó → mesh via json.nodes[].mesh
  (g.json.nodes ?? []).forEach((n: any, i: number) => {
    if (n.mesh === undefined) return;
    const node = tree.nodes[i];
    const mesh = g.json.meshes[n.mesh];
    for (const prim of mesh.primitives ?? []) {
      if (prim.attributes?.POSITION === undefined) continue;
      const { min, max } = accessorBounds(g, prim.attributes.POSITION);
      tmp.min.set(min[0], min[1], min[2]);
      tmp.max.set(max[0], max[1], max[2]);
      tmp.applyMatrix4(node.matrixWorld);
      box.union(tmp);
    }
  });
  if (box.isEmpty()) throw new Error("bbox vazia: nenhum POSITION encontrado");
  return box;
}
