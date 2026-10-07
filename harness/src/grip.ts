/**
 * Geometria MEDIDA do grip/handguard (M2 — "medir antes de posar").
 *
 * Fonte: harness/src/measure2.ts e measure3.ts (executados em 2026-10-07,
 * saídas registradas em NOTES.md). Tudo em espaço do holder, após a
 * normalização do jogo (buildWeaponRig + attachArms do harness, paridade
 * provada em M1).
 *
 * - rifle: grip core (y<−0.02, z∈[0.125,0.205]) → centro/eixo/raio p50
 *   (measure3: centro (−0.0010,−0.0578,0.1714), eixo (0.121,−0.867,0.484),
 *   raio p50 0.0302). Handguard: região z∈[−0.25,0] (measure2: centro
 *   (−0.0009,0.0658,−0.1279), eixo ≈ (0,0,1), raio p50 0.0227, ext ±0.116).
 * - pistol: grip (y<−0.03) → centro (−0.0400,−0.0569,−0.0024), eixo
 *   (−0.078,−0.997,−0.025), raio p50 0.0187, ext ao longo do eixo
 *   [−0.0271,+0.0244] (measure3).
 */
export interface GripGeom {
  center: [number, number, number];
  axis: [number, number, number];
  radius: number;
  halfExt: number;
  wrapRadius?: number; // raio da regra de wrap (só grips; handguard não usa)
}

export const GRIP: Record<"rifle" | "pistol", GripGeom> = {
  rifle: {
    center: [-0.001, -0.0578, 0.1714],
    axis: [0.121, -0.867, 0.484],
    radius: 0.0302,
    halfExt: 0.03,
    wrapRadius: 0.045,
  },
  pistol: {
    center: [-0.04, -0.0569, -0.0024],
    axis: [-0.078, -0.997, -0.025],
    radius: 0.0187,
    halfExt: 0.026,
    wrapRadius: 0.035,
  },
};

/** Handguard do rifle (só a mão esquerda usa). */
export const HANDGUARD_RIFLE: GripGeom = {
  center: [-0.0009, 0.0658, -0.1279],
  axis: [0, 0, 1],
  radius: 0.0227,
  halfExt: 0.116,
};
