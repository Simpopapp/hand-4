import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { loadGLB, runAssetQueue, type QueuedAsset } from "./AssetLoader";

/**
 * Pré-carga das armas + braços da viewmodel (Fase V5, RM-06) — fila P1 com
 * fallback: se qualquer GLB falhar, o WeaponSystem usa a viewmodel procedural
 * v1 (Viewmodel.ts) e o jogo continua — mesma política do soldado (Fase V4).
 *
 * Os braços são GLBs PRÉ-POSADOS (bake offline: pose de grip congelada nos
 * bones locais, root em identidade) — um por arma. O jogo só posiciona o root
 * (escala + yaw 180° + mão direita na âncora do punho).
 */

export const RIFLE_URL = "/game-assets/models/viewmodel_rifle.glb";
export const PISTOL_URL = "/game-assets/models/viewmodel_pistol.glb";
export const ARMS_RIFLE_URL = "/game-assets/models/viewmodel_arms_pose_rifle.glb";
export const ARMS_PISTOL_URL = "/game-assets/models/viewmodel_arms_pose_pistol.glb";

let rifle: GLTF | null = null;
let pistol: GLTF | null = null;
let armsRifle: GLTF | null = null;
let armsPistol: GLTF | null = null;

export function preloadViewmodelAssets(onProgress: (fraction: number) => void): Promise<void> {
  const assets: QueuedAsset[] = [
    {
      url: RIFLE_URL,
      priority: "P1",
      weight: 2,
      load: async (onFile) => {
        rifle = await loadGLB(RIFLE_URL, onFile);
      },
    },
    {
      url: PISTOL_URL,
      priority: "P1",
      weight: 1.5,
      load: async (onFile) => {
        pistol = await loadGLB(PISTOL_URL, onFile);
      },
    },
    {
      url: ARMS_RIFLE_URL,
      priority: "P1",
      weight: 1.5,
      load: async (onFile) => {
        armsRifle = await loadGLB(ARMS_RIFLE_URL, onFile);
      },
    },
    {
      url: ARMS_PISTOL_URL,
      priority: "P1",
      weight: 1.5,
      load: async (onFile) => {
        armsPistol = await loadGLB(ARMS_PISTOL_URL, onFile);
      },
    },
  ];
  return runAssetQueue(assets, onProgress);
}

export interface ViewmodelGltfs {
  rifle: GLTF;
  pistol: GLTF;
  armsRifle: GLTF;
  armsPistol: GLTF;
}

/** GLBs resolvidos (após preload) ou null se algum falhou/ainda não carregou. */
export function getViewmodelGltfs(): ViewmodelGltfs | null {
  return rifle && pistol && armsRifle && armsPistol
    ? { rifle, pistol, armsRifle, armsPistol }
    : null;
}
