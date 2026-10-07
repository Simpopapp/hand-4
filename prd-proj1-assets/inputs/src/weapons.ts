/**
 * Dados puros das armas (Fase 3) — sem THREE, sem React.
 * Valores calibrados para o feel COD-like: cadência, spread por estado,
 * recuo por tiro e munição.
 */

export type WeaponId = "rifle" | "pistol";

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  /** true = automática (segurar), false = semi (um tiro por clique) */
  auto: boolean;
  /** tiros por minuto */
  rpm: number;
  damage: number;
  headshotMultiplier: number;
  magSize: number;
  reserveAmmo: number;
  /** segundos */
  reloadTime: number;
  /** radianos de cone, quadril */
  spreadHip: number;
  /** radianos de cone, ADS */
  spreadAds: number;
  /** multiplicador extra por velocidade de movimento */
  moveSpread: number;
  /** multiplicador de spread no ar (aplicado sobre o hip) */
  airSpread: number;
  /** recuo vertical por tiro (rad, pico da mola) */
  recoilPitch: number;
  /** recuo horizontal máximo por tiro (rad) */
  recoilYaw: number;
  /** FOV em mira */
  adsFov: number;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  rifle: {
    id: "rifle",
    name: "VK-7 Fuzil",
    auto: true,
    rpm: 720,
    damage: 26,
    headshotMultiplier: 2,
    magSize: 30,
    reserveAmmo: 120,
    reloadTime: 2.1,
    spreadHip: 0.022,
    spreadAds: 0.0035,
    moveSpread: 2.2,
    airSpread: 3,
    recoilPitch: 0.0075,
    recoilYaw: 0.0022,
    adsFov: 50,
  },
  pistol: {
    id: "pistol",
    name: "P9 Sidearm",
    auto: false,
    rpm: 420,
    damage: 34,
    headshotMultiplier: 2,
    magSize: 12,
    reserveAmmo: 60,
    reloadTime: 1.5,
    spreadHip: 0.016,
    spreadAds: 0.004,
    moveSpread: 1.8,
    airSpread: 2.5,
    recoilPitch: 0.011,
    recoilYaw: 0.003,
    adsFov: 55,
  },
};

export const WEAPON_ORDER: readonly WeaponId[] = ["rifle", "pistol"];

/** Timeline de troca (total < 0.5 s — requisito do PRD). */
export const SWITCH_OUT_TIME = 0.2;
export const SWITCH_IN_TIME = 0.24;
