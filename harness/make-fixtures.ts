/**
 * Gera fixtures INVÁLIDAS deliberadas (M1 — gate: o verificador deve
 * REPROVÁ-LAS; se aprovar, o verificador está errado).
 *   F1 rest_pose      — descanso T-pose como está (sem pose): sem handR, dedos longe do grip
 *   F2 no_renames     — rotações plausíveis mas renames obrigatórios ausentes
 *   F3 crossed        — antebraços cruzados no centro (o defeito do pacote antigo)
 *   F4 schema         — tipo errado em bones (tipagem de entrada)
 *   F5 extra_fields   — campos proibidos (pos/scale de bone — só rotação é permitida)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
fs.mkdirSync(out, { recursive: true });

const renames = { "hand.R": "handR", "hand.L": "handL" };

const fixtures: Record<string, unknown> = {
  "invalid_rest_pose.json": {
    weapon: "rifle",
    source: "fixture M1: descanso T-pose sem pose",
    bones: {},
    renames,
    notes: "DEVE FALHAR: sem handR, dedos longe do grip",
  },
  "invalid_no_renames.json": {
    weapon: "pistol",
    source: "fixture M1: renames obrigatórios ausentes",
    bones: {
      "upper_arm.R": { euler: [0, -0.5, 0] },
      "forearm.R": { euler: [0, 0, 0.6] },
    },
    renames: {},
    notes: "DEVE FALHAR: sem renames o jogo não acha handR",
  },
  "invalid_crossed_forearms.json": {
    weapon: "rifle",
    source: "fixture M1: antebraços cruzados (defeito do pacote antigo)",
    bones: {
      "upper_arm.L": { euler: [-1.4, 0, 0.9] },
      "upper_arm.R": { euler: [-1.4, 0, -0.9] },
      "forearm.L": { euler: [-0.4, 0, 0] },
      "forearm.R": { euler: [0.4, 0, 0] },
    },
    renames,
    notes:
      "DEVE FALHAR: antebraços cruzados (separação 0.0067m < 0.012m) e limite de junta estourado",
  },
  "invalid_schema.json": {
    weapon: "rifle",
    source: "fixture M1: schema inválido",
    bones: "oops",
    renames,
    notes: "DEVE FALHAR: tipagem de entrada",
  },
  "invalid_extra_fields.json": {
    weapon: "rifle",
    source: "fixture M1: campos proibidos no bone (translação/escala)",
    bones: {
      "upper_arm.R": { euler: [0, -0.5, 0], pos: [0, 0, 0] },
    },
    renames,
    notes: "DEVE FALHAR: apenas rotação é permitida",
  },
};

for (const [name, content] of Object.entries(fixtures)) {
  fs.writeFileSync(path.join(out, name), JSON.stringify(content, null, 2));
  console.log("escrito:", path.join("harness/fixtures", name));
}
