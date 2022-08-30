import head from "./dicts/GearInfoHead.json";
import clothes from "./dicts/GearInfoClothes.json";
import shoes from "./dicts/GearInfoShoes.json";

import fs from "node:fs";
import path from "node:path";
import invariant from "tiny-invariant";
import { loadLangDicts } from "./utils";

const CURRENT_SEASON = 0;
const OUTPUT_DIR_PATH = path.join(__dirname, "output");
const LANG_JSONS_TO_CREATE = ["EUen"];

async function main() {
  const allGear: Array<{
    id: number;
    internalName: string;
    type: string;
    translations: Array<{ language: string; name: string }>;
  }> = [];
  const langDicts = await loadLangDicts();

  for (const gear of [...head, ...clothes, ...shoes]) {
    if (gear.Season > CURRENT_SEASON || gear.HowToGet !== "Shop") {
      continue;
    }

    const [type, internalName] = gear.__RowId.split("_");
    invariant(type);
    invariant(internalName);

    allGear.push({
      id: gear.Id,
      type,
      internalName,
      translations: langDicts.map(([langCode, translations]) => {
        const name = translations[internalName];
        invariant(name, `Missing translation for ${internalName}`);

        return {
          language: langCode,
          name,
        };
      }),
    });
  }

  allGear.sort((a, b) => a.id - b.id);

  fs.writeFileSync(
    path.join(OUTPUT_DIR_PATH, "gear.json"),
    JSON.stringify(allGear, null, 2)
  );

  const headGear = allGear.filter((g) => g.type === "Hed");
  const clothesGear = allGear.filter((g) => g.type === "Clt");
  const shoesGear = allGear.filter((g) => g.type === "Shs");
  invariant(headGear.length);
  invariant(clothesGear.length);
  invariant(shoesGear.length);

  const headIds = headGear.map((w) => w.id);
  const clothesIds = clothesGear.map((w) => w.id);
  const shoesIds = shoesGear.map((w) => w.id);

  fs.writeFileSync(
    path.join(OUTPUT_DIR_PATH, "head-ids.json"),
    JSON.stringify(headIds, null, 2)
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR_PATH, "clothes-ids.json"),
    JSON.stringify(clothesIds, null, 2)
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR_PATH, "shoes-ids.json"),
    JSON.stringify(shoesIds, null, 2)
  );

  for (const langCode of LANG_JSONS_TO_CREATE) {
    const translationsMap = Object.fromEntries(
      allGear.map((gear) => {
        const translation = gear.translations.find(
          (t) => t.language === langCode
        )?.name;
        invariant(
          translation,
          `No translation for ${gear.internalName} in ${langCode}`
        );

        return [`${gear.type.charAt(0).toUpperCase()}_${gear.id}`, translation];
      })
    );

    fs.writeFileSync(
      path.join(OUTPUT_DIR_PATH, `gear-${langCode}.json`),
      JSON.stringify(translationsMap, null, 2)
    );
  }
}

void main();