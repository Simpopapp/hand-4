import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

/**
 * Carregamento de assets reais (PRD v2 §4.4) — TS puro, browser-only.
 * Texturas PBR fotográficas e HDRI servidos de /game-assets (CC0, ver
 * public/game-assets/CREDITS.md); glTF com Draco servido de /draco local.
 */

// ---------- texturas PBR ----------

const texLoader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

export function loadTexture(url: string, srgb: boolean, repeat: number): THREE.Texture {
  const key = `${url}|${repeat}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = texLoader.load(url);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/** Material PBR completo (albedo, normal, roughness, AO) de uma pasta /game-assets/textures/<id>. */
export function pbrMaterial(id: string, repeat: number): THREE.MeshStandardMaterial {
  const base = `/game-assets/textures/${id}`;
  return new THREE.MeshStandardMaterial({
    map: loadTexture(`${base}/Diffuse.jpg`, true, repeat),
    normalMap: loadTexture(`${base}/nor_gl.jpg`, false, repeat),
    roughnessMap: loadTexture(`${base}/Rough.jpg`, false, repeat),
    aoMap: loadTexture(`${base}/AO.jpg`, false, repeat),
    normalScale: new THREE.Vector2(1.2, 1.2),
    metalness: 0,
  });
}

// ---------- HDRI / ambiente ----------

/** HDRI como iluminação de ambiente (reflexos físicos nos metais/molhados). */
export function applyEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  url = "/game-assets/hdri/night_1k.hdr",
  intensity = 0.35,
): () => void {
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTex: THREE.Texture | null = null;
  let disposed = false;
  new RGBELoader().load(url, (hdr) => {
    if (disposed) {
      hdr.dispose();
      return;
    }
    envTex = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    scene.environment = envTex;
    scene.environmentIntensity = intensity;
  });
  return () => {
    disposed = true;
    envTex?.dispose();
    pmrem.dispose();
    if (scene.environment === envTex) scene.environment = null;
  };
}

// ---------- glTF + Draco (Fase V1: pipeline pronto para V3–V5) ----------

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/draco/");
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);
const glbCache = new Map<string, Promise<GLTF>>();

/** Carrega um .glb (com Draco se comprimido), com cache e progresso por bytes. */
export function loadGLB(url: string, onFileProgress?: (fraction: number) => void): Promise<GLTF> {
  const hit = glbCache.get(url);
  if (hit) return hit;
  const task = new Promise<GLTF>((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf) => resolve(gltf),
      (event) => {
        if (!onFileProgress) return;
        const total = event.total || 1;
        onFileProgress(Math.min(1, event.loaded / total));
      },
      (err) => {
        glbCache.delete(url); // falha não fica em cache: retry é possível
        reject(err instanceof Error ? err : new Error(`Falha ao carregar ${url}`));
      },
    );
  });
  glbCache.set(url, task);
  return task;
}

// ---------- fila com progresso agregado (loading screen por bytes) ----------

export type AssetPriority = "P0" | "P1";

export interface QueuedAsset {
  url: string;
  /** P0 bloqueia o início do jogo; P1 pode falhar e é omitido (PRD §4.4). */
  priority?: AssetPriority;
  /** Peso no progresso agregado (padrão 1). */
  weight?: number;
  /** Carregador custom (padrão: loadGLB). */
  load?: (onFileProgress: (fraction: number) => void) => Promise<unknown>;
}

/**
 * Executa a fila em paralelo agregando progresso ponderado (0→1).
 * Falha em P1 → warning + objeto omitido; falha em P0 → rejeita (tela de erro).
 */
export async function runAssetQueue(
  assets: QueuedAsset[],
  onProgress: (fraction: number) => void,
): Promise<void> {
  const totalWeight = assets.reduce((sum, a) => sum + (a.weight ?? 1), 0) || 1;
  const fileProgress = new Map<QueuedAsset, number>();
  let done = 0;
  const report = () => onProgress(Math.min(1, done / totalWeight));

  await Promise.all(
    assets.map((asset) => {
      const weight = asset.weight ?? 1;
      const onFile = (fraction: number) => {
        const prev = fileProgress.get(asset) ?? 0;
        fileProgress.set(asset, fraction);
        done += (fraction - prev) * weight;
        report();
      };
      const run = asset.load ? asset.load(onFile) : loadGLB(asset.url, onFile);
      return run
        .then(() => onFile(1))
        .catch((err: unknown) => {
          if ((asset.priority ?? "P0") === "P1") {
            console.warn(`[assets] P1 omitido por falha: ${asset.url}`, err);
            done += weight - (fileProgress.get(asset) ?? 0);
            report();
            return;
          }
          throw err;
        });
    }),
  );
}

// ---------- cleanup ----------

export function disposeTextureCache(): void {
  cache.forEach((t) => t.dispose());
  cache.clear();
}

export function disposeGlbCache(): void {
  glbCache.clear();
  dracoLoader.dispose();
}
