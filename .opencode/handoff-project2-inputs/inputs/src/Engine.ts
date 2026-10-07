import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { LUTPass } from "three/examples/jsm/postprocessing/LUTPass.js";
import { loadLut3D } from "@/game/render/lut";
import {
  DEFAULT_QUALITY,
  normalizeQuality,
  QUALITY_PRESETS,
  QUALITY_STORAGE_KEY,
  type QualityPreset,
  type QualitySettings,
} from "@/game/render/quality";

/**
 * Motor de render do jogo — isolado de React.
 * Responsável por: renderer WebGL, pós-processamento cinematográfico
 * (GTAO, bloom, LUT, SMAA, grade final), presets de qualidade,
 * loop de frames, resize e cleanup total.
 */

export type EngineProgress = (fraction: number) => void;

export interface SceneController {
  update(time: number, delta: number): void;
  dispose(): void;
}

const FinalGradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uGrain: { value: 0.035 },
    uVignette: { value: 0.55 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uGrain;
    uniform float uVignette;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // vinheta
      vec2 p = vUv - 0.5;
      float vig = smoothstep(0.85, 0.32, length(p));
      color.rgb *= mix(1.0 - uVignette, 1.0, vig);

      // grão de filme animado
      float g = hash(vUv * uResolution + mod(uTime, 7.0) * 137.0) - 0.5;
      color.rgb += g * uGrain;

      gl_FragColor = color;
    }
  `,
};

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private composer: EffectComposer | null = null;
  private gradePass: ShaderPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private gtaoPass: GTAOPass | null = null;
  private smaaPass: SMAAPass | null = null;
  private lutPass: LUTPass | null = null;
  private lutTexture: THREE.Data3DTexture | null = null;
  private viewmodelCamera: THREE.PerspectiveCamera | null = null;
  private quality: QualityPreset = DEFAULT_QUALITY;
  private qualitySettings: QualitySettings;
  /** Escala temporal do jogo (slow-motion cinematográfico: 0.25 = ¼ de velocidade). */
  timeScale = 1;
  private sceneController: SceneController | null = null;
  private cameraMotion: ((time: number, delta: number) => void) | null = null;
  private clock = new THREE.Clock();
  private rafId = 0;
  private running = false;
  private disposed = false;
  private time = 0;
  private onResizeBound = () => this.resize();
  private fpsFrames = 0;
  private fpsWindow = 0;
  private currentFps = 60;
  private basePixelRatio = 1;
  private resScale = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.basePixelRatio = Math.min(window.devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      Math.max(canvas.clientWidth / Math.max(canvas.clientHeight, 1), 0.1),
      0.1,
      QUALITY_PRESETS[DEFAULT_QUALITY].drawDistance,
    );
    this.camera.position.set(0, 9, 27);
    this.camera.lookAt(0, 2.5, 0);
    // câmera no grafo da cena: necessário para renderizar a subárvore da
    // viewmodel (vmCamera é filho da câmera principal) fora do composer
    this.scene.add(this.camera);

    this.quality = this.readStoredQuality();
    this.qualitySettings = this.settingsFor(this.quality);
    this.resScale = Math.min(this.resScale, this.qualitySettings.maxResolutionScale);
    this.camera.far = this.qualitySettings.drawDistance;
    this.camera.updateProjectionMatrix();

    this.buildComposer();
    this.applyQuality(this.quality);
    window.addEventListener("resize", this.onResizeBound);
  }

  private readStoredQuality(): QualityPreset {
    try {
      return normalizeQuality(window.localStorage.getItem(QUALITY_STORAGE_KEY));
    } catch {
      return DEFAULT_QUALITY;
    }
  }

  private settingsFor(preset: QualityPreset): QualitySettings {
    return QUALITY_PRESETS[preset];
  }

  private buildComposer(): void {
    const size = new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight);
    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(size.x, size.y);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
    this.composer.addPass(gtao);
    this.gtaoPass = gtao;

    const bloom = new UnrealBloomPass(size, 0.42, 0.7, 0.82);
    this.composer.addPass(bloom);
    this.bloomPass = bloom;

    this.composer.addPass(new OutputPass());

    const lut = new LUTPass({ intensity: 0.85 });
    this.composer.addPass(lut);
    this.lutPass = lut;
    // LUT carrega em paralelo — grading entra assim que decodificada
    loadLut3D()
      .then((tex) => {
        if (this.disposed) {
          tex.dispose();
          return;
        }
        this.lutTexture = tex;
        this.lutPass!.lut = tex;
      })
      .catch((err: unknown) => {
        // grading é cosmético: falha não bloqueia o jogo
        console.warn("[engine] LUT indisponível — grading neutral", err);
      });

    const smaa = new SMAAPass();
    this.composer.addPass(smaa);
    this.smaaPass = smaa;

    const grade = new ShaderPass(FinalGradeShader);
    grade.uniforms["uResolution"]!.value = size.clone();
    this.composer.addPass(grade);
    this.gradePass = grade;
  }

  /** Aplica um preset de qualidade (RM-01): sombras, SSAO, bloom, resolução, draw distance. */
  setQuality(preset: QualityPreset): void {
    this.quality = preset;
    try {
      window.localStorage.setItem(QUALITY_STORAGE_KEY, preset);
    } catch {
      // storage indisponível — preset vale só para a sessão
    }
    this.applyQuality(preset);
  }

  getQuality(): QualityPreset {
    return this.quality;
  }

  private applyQuality(preset: QualityPreset): void {
    if (this.disposed) return;
    const settings = this.settingsFor(preset);
    this.qualitySettings = settings;
    if (this.gtaoPass) this.gtaoPass.enabled = settings.ssao;
    if (this.bloomPass) this.bloomPass.enabled = settings.bloom;
    this.camera.far = settings.drawDistance;
    this.camera.updateProjectionMatrix();
    if (this.resScale > settings.maxResolutionScale) {
      this.resScale = settings.maxResolutionScale;
    }
    this.applyQualityToScene();
    this.applyResolution();
  }

  /** Replica sombras aos objetos já montados no cena (luzes do nível). */
  private applyQualityToScene(): void {
    if (this.disposed) return;
    const size = this.qualitySettings.shadowMapSize;
    this.scene.traverse((obj) => {
      const light = obj as THREE.Light & { shadow?: THREE.LightShadow };
      if (!light.isLight || !light.castShadow || !light.shadow) return;
      if (light.shadow.mapSize.width !== size || light.shadow.mapSize.height !== size) {
        light.shadow.map?.dispose();
        light.shadow.map = null;
        light.shadow.mapSize.set(size, size);
      }
    });
  }

  setSceneController(controller: SceneController): void {
    this.sceneController = controller;
    // luzes do nível já existem: aplica o preset atual a elas
    this.applyQualityToScene();
  }

  setCameraMotion(motion: ((time: number, delta: number) => void) | null): void {
    this.cameraMotion = motion;
  }

  /**
   * Viewmodel (Fase V5, RM-06): câmera própria (FOV fixo) cuja subárvore é
   * renderizada POR CIMA da imagem final do composer, fora da cadeia de
   * passes — a arma nunca atravessa paredes nem herda o FOV do ADS, e a
   * passada extra não corrompe os buffers do pós-processamento (regressão
   * de tela preta da calibração vm5). Os objetos da viewmodel ficam na
   * layer 1 (o composer renderiza só a layer 0); a câmera da viewmodel
   * enxerga apenas a layer 1.
   */
  setViewmodelCamera(camera: THREE.PerspectiveCamera | null): void {
    this.viewmodelCamera = camera;
    if (!camera) return;
    const size = new THREE.Vector2(this.canvas.clientWidth, this.canvas.clientHeight);
    camera.aspect = Math.max(size.x / Math.max(size.y, 1), 0.1);
    camera.updateProjectionMatrix();
  }

  get fps(): number {
    return this.currentFps;
  }

  /** Escala dinâmica de resolução (1 = nativo; mínimo 0.6 — PRD NFR-01). */
  get resolutionScale(): number {
    return this.resScale;
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(loop);
      const delta = Math.min(this.clock.getDelta(), 0.1);
      this.time += delta;
      this.frame(delta);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private frame(delta: number): void {
    this.sceneController?.update(this.time, delta * this.timeScale);
    this.cameraMotion?.(this.time, delta);
    const uTime = this.gradePass?.uniforms["uTime"];
    if (uTime) uTime.value = this.time;
    if (this.composer) this.composer.render();
    this.renderViewmodel();
    this.trackFps(delta);
  }

  /**
   * Passada da viewmodel sobre a imagem final: depth limpo (a arma nunca é
   * ocluída), sem limpar cor, sem re-render de sombras (o composer acabou de
   * calculá-las) e sem fog do mundo (só a arma na layer 1).
   */
  private renderViewmodel(): void {
    const vm = this.viewmodelCamera;
    if (!vm || this.disposed) return;
    const renderer = this.renderer;
    const prevAutoClear = renderer.autoClear;
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    const prevFog = this.scene.fog;
    const prevBackground = this.scene.background;
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    this.scene.fog = null;
    this.scene.background = null;
    renderer.clearDepth();
    renderer.render(this.scene, vm);
    renderer.autoClear = prevAutoClear;
    renderer.shadowMap.autoUpdate = prevShadowAuto;
    this.scene.fog = prevFog;
    this.scene.background = prevBackground;
  }

  private trackFps(delta: number): void {
    this.fpsFrames++;
    this.fpsWindow += delta;
    if (this.fpsWindow >= 0.5) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsWindow);
      this.fpsFrames = 0;
      this.fpsWindow = 0;
      this.adaptResolution();
    }
  }

  /**
   * Escala dinâmica de resolução: fps < 50 → reduz 10% (mínimo 0.6);
   * fps ≥ 58 → recupera em passos de 5% até o teto do preset (PRD NFR-01).
   */
  private adaptResolution(): void {
    if (this.disposed) return;
    const ceiling = this.qualitySettings.maxResolutionScale;
    if (this.currentFps < 50 && this.resScale > 0.6) {
      this.resScale = Math.max(0.6, this.resScale - 0.1);
      this.applyResolution();
    } else if (this.currentFps >= 58 && this.resScale < ceiling) {
      this.resScale = Math.min(ceiling, this.resScale + 0.05);
      this.applyResolution();
    }
  }

  private applyResolution(): void {
    if (this.disposed) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const ratio = this.basePixelRatio * this.resScale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(ratio);
      this.composer.setSize(w, h);
    }
  }

  private resize(): void {
    if (this.disposed) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.viewmodelCamera) {
      this.viewmodelCamera.aspect = w / h;
      this.viewmodelCamera.updateProjectionMatrix();
    }
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    const res = this.gradePass?.uniforms["uResolution"]!.value;
    if (res instanceof THREE.Vector2) res.set(w, h);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.onResizeBound);
    this.sceneController?.dispose();
    this.sceneController = null;
    this.lutTexture?.dispose();
    this.gtaoPass?.dispose();
    this.smaaPass?.dispose();
    this.composer?.dispose();
    this.composer = null;
    this.renderer.dispose();
  }
}
