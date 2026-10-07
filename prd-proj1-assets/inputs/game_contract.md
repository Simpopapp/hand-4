# game_contract.md — contrato do viewmodel (lido do código real)

Referências: `src/game/weapons/ViewmodelV2.ts` (VM), `src/game/core/Engine.ts` (EN), `src/game/assets/viewmodelAssets.ts` (VA).

## 0. GLBs carregados HOJE pelo jogo (VA:14-17)
- `/game-assets/models/viewmodel_rifle.glb`, `/game-assets/models/viewmodel_pistol.glb`
- Braços: o jogo carrega `viewmodel_arms_pose_rifle.glb` e `viewmodel_arms_pose_pistol.glb` (bakes antigos, pose ruim) — NÃO `viewmodel_arms.glb`. Este pacote inclui `viewmodel_arms.glb` (fonte original sem pose), conforme pedido.
- Falha de qualquer GLB → fallback para viewmodel procedural v1 (WeaponSystem.ts:111-116).

## 1. Transformação de cada arma após carregar (VM:154-240)
1. `model = gltf.scene.clone(true)` (VM:156).
2. Escala uniforme: `scale = cfg.length / max(bbox.x, bbox.z)` do modelo cru (VM:159-168). Eixo Y ignorado.
3. `group.rotation = cfg.rot`; `group.add(model)` (VM:166-169).
4. Centraliza: `group.position = -center(bbox(group)) + cfg.offset` (VM:172-180) → o centro do bbox fica na origem do `holder`.
5. `holder = new Group(); holder.add(group)` (VM:181-182). O `holder` é o objeto trocado/animado.

| arma | length | rot (Euler) | offset | VM |
|---|---|---|---|---|
| rifle | 0.82 | (0,0,0) | (0,0,0) | 49-62 |
| pistol | 0.19 | (π/2, π/2, 0, "YXZ") | (0,0,0) | 63-76 |

Muzzle: nó `/muzzle|flash_?hider|barrel_?tip/i`; senão Object3D criado no menor z do bbox (VM:196-204). Premissa: cano aponta −Z após rot.

## 2. Braços (VM:260-282)
- Filhos diretos do `holder` da arma corrente (`holder.add(arms)`, VM:264); reanexados na troca (VM:333). O mesmo `gltf.scene` (sem clone) é usado (VM:145-146).
- `arms.scale = cfg.arms.scale` (VM:274); `arms.quaternion = yaw 180° em Y` (VM:275); posição = `cfg.arms.handR − pos_local_do_bone("handR")` → o bone `handR` cai exatamente em `handR` no espaço do holder (VM:276-281). Se não houver nó `handR`, fica na origem.
- Nenhum IK/animação em runtime: a pose precisa vir congelada nos bones do GLB.

| arma | arms.scale | arms.handR (holder) | VM |
|---|---|---|---|
| rifle | 0.12 | (0.035, −0.035, 0.125) | 57-61 |
| pistol | 0.10 | (0.0, −0.065, 0.035) | 71-75 |

## 3. Câmera do viewmodel
- `PerspectiveCamera(54, 1, 0.01, 4)` — FOV `VIEWMODEL_FOV=54` (VM:19,125), near 0.01, far 4.
- Aspect: canvas clientWidth/clientHeight ao registrar (EN:268-273). Atualização em resize: não determinado neste trecho (ver EN resize).
- Filha da câmera principal (VM:127); layer `VIEWMODEL_LAYER=1` (VM:20,128); câmera principal desabilita layer 1 (VM:130); todas as luzes existentes habilitam layer 1 (VM:133-135).
- Hierarquia: mainCamera → vmCamera → root → holder → (group→model, arms).
- Render (EN:313-335): após o composer (layer 0, pós-processado), passada extra direta: `autoClear=false`, `shadowMap.autoUpdate=false`, `fog=null`, `background=null`, `clearDepth()`, `render(scene, vmCamera)`. Viewmodel NÃO passa por GTAO/bloom/LUT/SMAA/grade.

## 4. Quadril / ADS (espaço da vmCamera = posição do `root`)
| arma | hip | sightTarget | VM |
|---|---|---|---|
| rifle | (0.22, −0.24, −0.42) | (0, −0.006, −0.26) | 53-54 |
| pistol | (0.19, −0.23, −0.36) | (0, −0.012, −0.22) | 67-68 |
- adsPos: alinha nó `/sight|optic|aimpoint|red_?dot|ironsight/i` ao sightTarget; sem nó: `(hip.x·0.1, hip.y·0.45, hip.z−0.04)` (VM:218-228). Se os GLBs atuais têm esse nó: não determinado no código.
- Por frame: `root.position = lerp(hip, adsPos, ads)` + sway/bob/kick; `root.rotation = (rotX, rotY, 0)` (VM:365-419).

## 5. Modificações em runtime
- Todos os nós: `layers.set(1)`; meshes `castShadow=receiveShadow=false` (VM:185-192, 265-272); braços `frustumCulled=false` (VM:269).
- Materiais/texturas/cores: não alterados; nenhum nó removido.
- Carregador (`/mag|magazine/i`, maior bbox): position.x/y, rotation.z animados e `visible=false` entre 42–52% da recarga (VM:395-411); restaurado ao fim (VM:426-435).
- Ferrolho (rifle `/bolt|charg(ing)?_?handle|eject/i`, pistola `/slide/i`): position.z recua até 0.03 no tiro (VM:346-350).
- Troca: root desce 0.32 e inclina 0.65 rad (VM:79-80, 376-384). Recarga: root mergulha 0.13 / rotX −0.5 / rotY +0.2 (VM:391-394).
