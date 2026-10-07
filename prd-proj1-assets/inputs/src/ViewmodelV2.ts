import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { WeaponId } from "@/game/data/weapons";
import { SWITCH_IN_TIME, SWITCH_OUT_TIME } from "@/game/data/weapons";

/**
 * Viewmodel v2 (Fase V5, RM-06): armas em glTF realista + mãos/braços,
 * renderizadas numa passada própria (câmera com FOV fixo na layer 1) para
 * nunca atravessar paredes nem herdar o FOV do ADS.
 *
 * Animações:
 * - idle sway / bob / kick / troca: procedural (mesma matemática da v1).
 * - recarga: por nós — o carregador desce, sai de cena e volta com overshoot.
 * - disparo: ferrolho/corredera recua e volta por nó (se o modelo tiver).
 *
 * Contrato com WeaponSystem: mesma API pública de Viewmodel (v1).
 */

export const VIEWMODEL_FOV = 54;
export const VIEWMODEL_LAYER = 1;

/** Host opcional (Engine): registra a câmera de viewmodel no composer. */
export interface ViewmodelHost {
  setViewmodelCamera(camera: THREE.PerspectiveCamera | null): void;
}

interface VmWeaponConfig {
  /** comprimento-alvo em metros (normalização de escala) */
  length: number;
  /** rotação base para alinhar o cano com -Z (rad) */
  rot: THREE.Euler;
  /** offset fino pós-normalização */
  offset: THREE.Vector3;
  /** posição do punho na câmera (quadril) */
  hip: THREE.Vector3;
  /** alvo do ponto de mira em ADS, em espaço da câmera */
  sightTarget: THREE.Vector3;
  magNode?: RegExp;
  boltNode?: RegExp;
  /** braços pré-posados: escala do root e âncora da mão direita no holder */
  arms?: {
    scale: number;
    /** ponto-alvo da mão direita no holder centrado */
    handR: THREE.Vector3;
  };
}

const CONFIGS: Record<WeaponId, VmWeaponConfig> = {
  rifle: {
    length: 0.82,
    rot: new THREE.Euler(0, 0, 0),
    offset: new THREE.Vector3(0, 0, 0),
    hip: new THREE.Vector3(0.22, -0.24, -0.42),
    sightTarget: new THREE.Vector3(0, -0.006, -0.26),
    magNode: /mag|magazine/i,
    boltNode: /bolt|charg(ing)?_?handle|eject/i,
    arms: {
      scale: 0.12,
      // âncora da mão direita no grip — calibração vm5 (bake)
      handR: new THREE.Vector3(0.035, -0.035, 0.125),
    },
  },
  pistol: {
    length: 0.19,
    rot: new THREE.Euler(Math.PI / 2, Math.PI / 2, 0, "YXZ"),
    offset: new THREE.Vector3(0, 0, 0),
    hip: new THREE.Vector3(0.19, -0.23, -0.36),
    sightTarget: new THREE.Vector3(0, -0.012, -0.22),
    magNode: /mag|magazine/i,
    boltNode: /slide/i,
    arms: {
      scale: 0.1,
      // âncora da mão direita no punho — calibração vm5 (bake)
      handR: new THREE.Vector3(0.0, -0.065, 0.035),
    },
  },
};

const SWITCH_DOWN = 0.32;
const SWITCH_TILT = 0.65;

interface BuiltWeapon {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  /** posição do punho (quadril) e alvo de ADS, pré-calculados */
  hip: THREE.Vector3;
  adsPos: THREE.Vector3;
  mag: THREE.Object3D | null;
  magRest: { pos: THREE.Vector3; rot: THREE.Euler } | null;
  bolt: THREE.Object3D | null;
  boltRestZ: number;
}

interface Switching {
  phase: "out" | "in";
  t: number;
  next: WeaponId;
}

export class ViewmodelV2 {
  readonly vmCamera: THREE.PerspectiveCamera;
  private root = new THREE.Group();
  private configs = new Map<WeaponId, BuiltWeapon>();
  private currentId: WeaponId = "rifle";
  /** braços pré-posados (um por arma): root identidade, pose congelada nos bones */
  private bakedArms = new Map<WeaponId, THREE.Object3D>();

  private time = 0;
  private switching: Switching | null = null;
  private reloading: { t: number; duration: number } | null = null;

  private kickZ = 0;
  private kickRot = 0;
  private boltKick = 0;
  private lag = new THREE.Vector2();

  private disposables: Array<{ dispose(): void }> = [];

  constructor(
    private mainCamera: THREE.PerspectiveCamera,
    private scene: THREE.Scene,
    gltfs: { rifle: GLTF; pistol: GLTF; armsRifle: GLTF; armsPistol: GLTF },
    private host: ViewmodelHost | null,
  ) {
    this.vmCamera = new THREE.PerspectiveCamera(VIEWMODEL_FOV, 1, 0.01, 4);
    // segue a pose do jogador automaticamente (filho da câmera de jogo)
    this.mainCamera.add(this.vmCamera);
    this.vmCamera.layers.set(VIEWMODEL_LAYER);
    // o mundo principal não renderiza a arma (só a passada da viewmodel)
    this.mainCamera.layers.disable(VIEWMODEL_LAYER);

    // todas as luzes existentes passam a iluminar a layer da viewmodel
    this.scene.traverse((o) => {
      if ((o as THREE.Light).isLight) o.layers.enable(VIEWMODEL_LAYER);
    });

    this.root.layers.set(VIEWMODEL_LAYER);
    this.vmCamera.add(this.root);

    this.buildWeapon("rifle", gltfs.rifle);
    this.buildWeapon("pistol", gltfs.pistol);
    this.root.add(this.configs.get("rifle")!.group);

    // braços pré-posados (bake offline): pose congelada no arquivo
    this.bakedArms.set("rifle", gltfs.armsRifle.scene);
    this.bakedArms.set("pistol", gltfs.armsPistol.scene);
    this.attachArms(this.getConfig().group);

    this.host?.setViewmodelCamera(this.vmCamera);
  }

  // ---------- construção ----------

  private buildWeapon(id: WeaponId, gltf: GLTF): void {
    const cfg = CONFIGS[id];
    const model = gltf.scene.clone(true);

    // normalização: escala por maior dimensão horizontal até cfg.length
    model.updateMatrixWorld(true);
    const rawBox = new THREE.Box3().setFromObject(model);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);
    const longSide = Math.max(rawSize.x, rawSize.z, 0.001);
    const scale = cfg.length / longSide;

    const group = new THREE.Group();
    group.rotation.set(cfg.rot.x, cfg.rot.y, cfg.rot.z);
    model.scale.setScalar(scale);
    group.add(model);

    // centraliza e aplica offset fino
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    box.getCenter(center);
    group.position.set(
      -center.x + cfg.offset.x,
      -center.y + cfg.offset.y,
      -center.z + cfg.offset.z,
    );
    const holder = new THREE.Group();
    holder.add(group);

    // materiais/malhas: layer da viewmodel, sem sombras próprias
    holder.traverse((o) => {
      o.layers.set(VIEWMODEL_LAYER);
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    this.trackDisposable(holder);

    // muzzle: nó nomeado ou ponta frontal aproximada
    let muzzleNode = findNode(holder, /muzzle|flash_?hider|barrel_?tip/i);
    if (!muzzleNode) {
      muzzleNode = new THREE.Object3D();
      model.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(group);
      // ponta: menor z do bbox (cano aponta -Z após normalização)
      muzzleNode.position.set(0, (b.min.y + b.max.y) / 2, b.min.z + 0.01);
      group.add(muzzleNode);
    }

    // nós de animação (carregador / ferrolho) — opcionais
    let mag: THREE.Object3D | null = null;
    let bolt: THREE.Object3D | null = null;
    if (cfg.magNode) mag = findLargestNode(holder, cfg.magNode);
    if (cfg.boltNode) bolt = findLargestNode(holder, cfg.boltNode);
    const magRest = mag ? { pos: mag.position.clone(), rot: mag.rotation.clone() } : null;
    const boltRestZ = bolt ? bolt.position.z : 0;

    this.trackNodeDisposables(holder);

    // ADS: posiciona o root para o ponto de mira ficar no alvo da câmera.
    // holder ainda não tem pai (local == world), então o cálculo é direto.
    holder.updateMatrixWorld(true);
    const sight = findNode(holder, /sight|optic|aimpoint|red_?dot|ironsight/i) ?? null;
    let adsPos: THREE.Vector3;
    if (sight) {
      const sightWorld = sight.getWorldPosition(new THREE.Vector3());
      const local = holder.worldToLocal(sightWorld.clone());
      adsPos = cfg.sightTarget.clone().sub(local);
    } else {
      // sem nó de mira: ADS = hip levantada e centralizada
      adsPos = new THREE.Vector3(cfg.hip.x * 0.1, cfg.hip.y * 0.45, cfg.hip.z - 0.04);
    }

    this.configs.set(id, {
      group: holder,
      muzzle: muzzleNode,
      hip: cfg.hip,
      adsPos,
      mag,
      magRest,
      bolt,
      boltRestZ,
    });
  }

  private trackDisposable(root: THREE.Object3D): void {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) if (m) this.disposables.push(m as THREE.Material);
    });
  }

  private trackNodeDisposables(_root: THREE.Object3D): void {
    // geometrias compartilhadas com o GLTF original — disposal via cache do loader
  }

  /**
   * Anexa os braços pré-posados ao holder da arma corrente e posiciona o root
   * (escala + yaw 180° + mão direita na âncora do punho). A pose já vem
   * congelada nos bones locais do GLB — nenhum IK em runtime.
   */
  private attachArms(holder: THREE.Object3D): void {
    const arms = this.bakedArms.get(this.currentId);
    const armsCfg = CONFIGS[this.currentId].arms;
    if (!arms || !armsCfg) return;
    holder.add(arms);
    arms.traverse((o) => {
      o.layers.set(VIEWMODEL_LAYER);
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh || (o as THREE.SkinnedMesh).isSkinnedMesh) {
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    arms.scale.setScalar(armsCfg.scale);
    arms.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    arms.position.set(0, 0, 0);
    holder.updateMatrixWorld(true);
    const handR = arms.getObjectByName("handR");
    if (!handR) return;
    const local = holder.worldToLocal(handR.getWorldPosition(new THREE.Vector3()));
    arms.position.copy(armsCfg.handR).sub(local);
  }

  // ---------- API (mesma de Viewmodel v1) ----------

  get busySwitching(): boolean {
    return this.switching !== null;
  }

  switchTo(id: WeaponId): void {
    if (id === this.currentId && this.switching === null) return;
    this.switching = { phase: "out", t: 0, next: id };
  }

  startReload(duration: number): void {
    this.reloading = { t: 0, duration };
  }

  cancelReload(): void {
    if (this.reloading) this.restoreMag();
    this.reloading = null;
  }

  fire(): void {
    this.kickZ += 0.035;
    this.kickRot += 0.055;
    this.boltKick = 1;
  }

  getMuzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    const cfg = this.configs.get(this.currentId)!;
    return cfg.muzzle.getWorldPosition(out);
  }

  update(
    dt: number,
    moveAmount: number,
    grounded: boolean,
    lookDx: number,
    lookDy: number,
    ads: number,
  ): void {
    this.time += dt;
    const cfg = this.getConfig();

    // timeline de troca
    if (this.switching) {
      this.switching.t += dt;
      if (this.switching.phase === "out" && this.switching.t >= SWITCH_OUT_TIME) {
        this.root.clear();
        this.currentId = this.switching.next;
        this.root.add(this.getConfig().group);
        this.attachArms(this.getConfig().group);
        this.switching.phase = "in";
        this.switching.t = 0;
      } else if (this.switching.phase === "in" && this.switching.t >= SWITCH_IN_TIME) {
        this.switching = null;
      }
    }

    // kicks com decaimento exponencial
    this.kickZ *= Math.exp(-dt * 14);
    this.kickRot *= Math.exp(-dt * 12);
    this.boltKick *= Math.exp(-dt * 16);

    // ferrolho/corredera recua no disparo e volta por mola
    if (cfg.bolt) {
      const back = -Math.min(0.03, 0.03 * this.boltKick);
      cfg.bolt.position.z = cfg.boltRestZ + back;
    }

    // sway de mira (lag do mouse)
    const targetLagX = THREE.MathUtils.clamp(-lookDx * 0.0006, -0.03, 0.03);
    const targetLagY = THREE.MathUtils.clamp(lookDy * 0.0005, -0.03, 0.03);
    this.lag.x += (targetLagX - this.lag.x) * Math.min(1, dt * 9);
    this.lag.y += (targetLagY - this.lag.y) * Math.min(1, dt * 9);

    // idle breathing + bob de caminhada
    const idleX = Math.sin(this.time * 1.3) * 0.0035;
    const idleY = Math.cos(this.time * 2.1) * 0.003;
    const bobAmp = grounded ? moveAmount * 0.013 : 0;
    const bobX = Math.cos(this.time * 7.8) * bobAmp * 0.6;
    const bobY = Math.abs(Math.sin(this.time * 7.8)) * bobAmp;

    const pos = cfg.hip.clone().lerp(cfg.adsPos, ads);

    // offsets reduzidos em ADS (mirar estabiliza)
    const swayScale = 1 - ads * 0.85;
    pos.x += (idleX + bobX) * swayScale + this.lag.x * swayScale;
    pos.y += (idleY + bobY) * swayScale + this.lag.y * swayScale;
    pos.z += this.kickZ;

    let rotX = this.kickRot + this.lag.y * 1.2 * swayScale;
    let rotY = this.lag.x * 1.6 * swayScale;

    // rebaixamento/levantamento na troca
    if (this.switching) {
      const dur = this.switching.phase === "out" ? SWITCH_OUT_TIME : SWITCH_IN_TIME;
      const raw = Math.min(1, this.switching.t / dur);
      const k = this.switching.phase === "out" ? raw : 1 - raw;
      const e = k * k * (3 - 2 * k);
      pos.y -= e * SWITCH_DOWN;
      rotX -= e * SWITCH_TILT;
    }

    // animação de recarga: root mergulha + carregador desce/sai/volta
    let magAnim = 0; // 0 = assentado, 1 = removido
    if (this.reloading) {
      this.reloading.t += dt;
      const p = Math.min(1, this.reloading.t / this.reloading.duration);
      const dip = Math.sin(p * Math.PI);
      pos.y -= dip * 0.13;
      rotX -= dip * 0.5;
      rotY += dip * 0.2;
      if (cfg.mag && cfg.magRest) {
        if (p < 0.28) {
          magAnim = easeOut(p / 0.28);
          cfg.mag.visible = true;
        } else if (p < 0.52) {
          magAnim = 1;
          cfg.mag.visible = p < 0.42; // desaparece brevemente de cena
        } else {
          magAnim = 1 - easeInOut((p - 0.52) / 0.48);
          cfg.mag.visible = true;
        }
        // desce, inclina para fora e volta com overshoot no assentamento
        const overshoot = p > 0.85 ? Math.sin(((p - 0.85) / 0.15) * Math.PI) * 0.012 : 0;
        cfg.mag.position.y = cfg.magRest.pos.y - magAnim * 0.16 + overshoot * (1 - magAnim);
        cfg.mag.rotation.z = cfg.magRest.rot.z + magAnim * 0.35;
        cfg.mag.position.x = cfg.magRest.pos.x + magAnim * 0.03;
      }
      if (p >= 1) {
        this.reloading = null;
        this.restoreMag();
      }
    }

    this.root.position.copy(pos);
    this.root.rotation.set(rotX, rotY, 0);
  }

  private getConfig(): BuiltWeapon {
    return this.configs.get(this.currentId)!;
  }

  private restoreMag(): void {
    for (const cfg of this.configs.values()) {
      if (cfg.mag && cfg.magRest) {
        cfg.mag.position.copy(cfg.magRest.pos);
        cfg.mag.rotation.copy(cfg.magRest.rot);
        cfg.mag.visible = true;
      }
      if (cfg.bolt) cfg.bolt.position.z = cfg.boltRestZ;
    }
  }

  dispose(): void {
    this.host?.setViewmodelCamera(null);
    this.root.parent?.remove(this.root);
    this.vmCamera.parent?.remove(this.vmCamera);
    // devolve a layer principal (fallback/remontagem segura)
    this.mainCamera.layers.enable(VIEWMODEL_LAYER);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.configs.clear();
  }
}

// ---------- helpers ----------

function findNode(root: THREE.Object3D, re: RegExp): THREE.Object3D | null {
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (hit || !re.test(o.name)) return;
    hit = o;
  });
  return hit;
}

/** Nó cujo nome casa com o regex e que tem o maior volume de bbox (parte real, não pai). */
function findLargestNode(root: THREE.Object3D, re: RegExp): THREE.Object3D | null {
  let best: THREE.Object3D | null = null;
  let bestVol = -1;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!re.test(o.name)) return;
    const box = new THREE.Box3().setFromObject(o);
    const size = new THREE.Vector3();
    box.getSize(size);
    const vol = size.x * size.y * size.z;
    if (vol > bestVol) {
      bestVol = vol;
      best = o;
    }
  });
  return best;
}

function easeOut(t: number): number {
  const c = 1 - t;
  return 1 - c * c * c;
}

function easeInOut(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}
