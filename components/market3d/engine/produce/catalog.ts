/*
 * Fresh Market 3D — product → 3D model mapping.
 *
 * Any Selldone shop works: a product is matched to a procedural model by keywords in its
 * title / English title / category (English + Persian). Merchants can force a model by adding
 * a tag or spec value like `3d:apple-green` (kind[-variant]). Unknown products get a kraft bag
 * labelled with the product image.
 */
import type { BuildCtx, Detail, ProduceModel } from "./parts";
import { BoxGeometry, Material, MeshStandardMaterial, SRGBColorSpace, TextureLoader, Vector3 } from "three";
import { kraftSet } from "../util/textures";
import { Rng, hashString } from "../util/noise";
import * as F from "./fruits";
import * as V from "./veggies";
import { scanFor, scanGeometry } from "./scans";

type Builder = (ctx: BuildCtx) => ProduceModel;

export const BUILDERS: Record<string, Builder> = {
  apple: F.apple,
  pear: F.pear,
  citrus: F.citrus,
  banana: F.banana,
  grapes: F.grapes,
  strawberry: F.strawberry,
  cherry: F.cherry,
  stone: F.stoneFruit,
  watermelon: F.watermelon,
  melon: F.melon,
  pomegranate: F.pomegranate,
  kiwi: F.kiwi,
  pineapple: F.pineapple,
  mango: F.mango,
  avocado: F.avocado,
  fig: F.fig,
  tomato: V.tomato,
  cucumber: V.cucumber,
  eggplant: V.eggplant,
  pepper: V.pepper,
  chili: V.chili,
  carrot: V.carrot,
  potato: V.potato,
  onion: V.onion,
  cabbage: V.cabbage,
  broccoli: V.broccoli,
  corn: V.corn,
  pumpkin: V.pumpkin,
  mushroom: V.mushroom,
  radish: V.radish,
  herbs: V.herbs,
  leek: V.leek,
  bag: V.bag,
};

export interface KindRef {
  kind: string;
  variant: string;
}

/** [keywords, kind, variant] — matched longest keyword first. */
const RULES: Array<[string[], string, string]> = [
  // ── compound / ambiguous first
  [["sweet potato", "yam", "سیب زمینی شیرین"], "potato", "sweet"],
  [["red potato", "سیب زمینی قرمز"], "potato", "red"],
  [["potato", "potatoes", "سیب زمینی", "سیب‌زمینی", "سیبزمینی"], "potato", "potato"],
  [["green apple", "granny smith", "سیب سبز", "سیب ترش"], "apple", "green"],
  [["yellow apple", "golden delicious", "سیب زرد", "سیب گلاب"], "apple", "yellow"],
  [["apple", "apples", "سیب", "سیب قرمز"], "apple", "red"],
  [["cherry tomato", "گوجه گیلاسی", "گوجه چری"], "tomato", "cherry"],
  [["yellow tomato", "گوجه زرد"], "tomato", "yellow"],
  [["green plum", "گوجه سبز"], "stone", "plum"],
  [["tomato", "tomatoes", "گوجه فرنگی", "گوجه‌فرنگی", "گوجه"], "tomato", "red"],
  [["sour cherry", "morello", "آلبالو"], "cherry", "sour"],
  [["cherry", "cherries", "گیلاس"], "cherry", "sweet"],
  [["apricot", "زردآلو", "زرد آلو"], "stone", "apricot"],
  [["nectarine", "شلیل"], "stone", "nectarine"],
  [["peach", "هلو"], "stone", "peach"],
  [["plum", "prune", "آلو", "آلوچه"], "stone", "plum"],
  [["watermelon", "هندوانه", "هندونه"], "watermelon", "watermelon"],
  [["honeydew", "گرمک"], "melon", "honeydew"],
  [["melon", "cantaloupe", "muskmelon", "خربزه", "طالبی"], "melon", "cantaloupe"],
  [["grapefruit", "گریپ فروت", "گریپفروت"], "citrus", "grapefruit"],
  [["tangerine", "mandarin", "clementine", "نارنگی"], "citrus", "tangerine"],
  [["lime", "لیمو ترش", "لیموترش", "لیمو عمانی"], "citrus", "lime"],
  [["lemon", "لیمو", "لیمو شیرین"], "citrus", "lemon"],
  [["orange", "oranges", "پرتقال", "پرتغال"], "citrus", "orange"],
  [["green banana", "plantain"], "banana", "green"],
  [["banana", "bananas", "موز"], "banana", "ripe"],
  [["green grape", "white grape", "انگور سبز", "انگور سفید", "انگور عسگری", "انگور بی دانه"], "grapes", "green"],
  [["grape", "grapes", "انگور"], "grapes", "purple"],
  [["strawberry", "strawberries", "توت فرنگی", "توت‌فرنگی", "توتفرنگی"], "strawberry", "red"],
  [["pomegranate", "انار"], "pomegranate", "red"],
  [["kiwi", "کیوی"], "kiwi", "kiwi"],
  [["pineapple", "آناناس"], "pineapple", "pineapple"],
  [["mango", "انبه"], "mango", "mango"],
  [["avocado", "آووکادو", "آوکادو"], "avocado", "hass"],
  [["fig", "figs", "انجیر"], "fig", "fig"],
  [["pear", "pears", "گلابی"], "pear", "pear"],
  [["persimmon", "خرمالو"], "tomato", "yellow"],
  [["quince"], "pear", "pear"],
  [["cucumber", "خیار"], "cucumber", "cucumber"],
  [["zucchini", "courgette", "کدو سبز", "کدو مسمایی"], "cucumber", "zucchini"],
  [["butternut"], "pumpkin", "butternut"],
  [["pumpkin", "squash", "کدو حلوایی", "کدو تنبل", "کدو"], "pumpkin", "pumpkin"],
  [["eggplant", "aubergine", "بادمجان", "بادنجان"], "eggplant", "eggplant"],
  [["red bell pepper", "red pepper", "فلفل دلمه قرمز"], "pepper", "red"],
  [["yellow bell pepper", "yellow pepper", "فلفل دلمه زرد"], "pepper", "yellow"],
  [["orange bell pepper", "orange pepper", "فلفل دلمه نارنجی"], "pepper", "orange"],
  [["green bell pepper", "green pepper", "فلفل دلمه سبز", "فلفل دلمه ای"], "pepper", "green"],
  [["bell pepper", "capsicum", "فلفل دلمه", "فلفل دلمه‌ای"], "pepper", "red"],
  [["green chili", "jalapeno", "jalapeño", "فلفل سبز تند", "فلفل سبز"], "chili", "green"],
  [["chili", "chilli", "hot pepper", "فلفل تند", "فلفل قرمز", "فلفل"], "chili", "red"],
  [["carrot", "carrots", "هویج"], "carrot", "carrot"],
  [["red onion", "پیاز قرمز"], "onion", "red"],
  [["white onion", "پیاز سفید"], "onion", "white"],
  [["green onion", "spring onion", "scallion", "پیازچه"], "leek", "scallion"],
  [["onion", "onions", "پیاز"], "onion", "yellow"],
  [["garlic", "سیر"], "onion", "garlic"],
  [["ginger", "زنجبیل"], "potato", "ginger"],
  [["red cabbage", "کلم قرمز", "کلم بنفش"], "cabbage", "red"],
  [["iceberg", "کاهو پیچ"], "cabbage", "iceberg"],
  [["romaine", "کاهو رسمی", "کاهو رومی"], "cabbage", "romaine"],
  [["red lettuce", "کاهو قرمز", "کاهو لولو"], "cabbage", "red"],
  [["lettuce", "salad", "کاهو"], "cabbage", "lettuce"],
  [["broccoli", "بروکلی", "کلم بروکلی"], "broccoli", "broccoli"],
  [["cauliflower", "گل کلم"], "broccoli", "cauliflower"],
  [["cabbage", "کلم"], "cabbage", "cabbage"],
  [["corn", "maize", "ذرت", "بلال"], "corn", "corn"],
  [["mushroom", "قارچ"], "mushroom", "white"],
  [["radish", "تربچه"], "radish", "radish"],
  [["beet", "beetroot", "چغندر", "لبو"], "radish", "beet"],
  [["celery", "کرفس"], "leek", "celery"],
  [["leek", "تره فرنگی", "تره‌فرنگی"], "leek", "leek"],
  [["spinach", "اسفناج"], "herbs", "spinach"],
  [["mint", "نعناع", "نعنا"], "herbs", "mint"],
  [["basil", "ریحان"], "herbs", "basil"],
  [["dill", "شوید"], "herbs", "dill"],
  [["parsley", "جعفری", "جعفرى"], "herbs", "parsley"],
  [["cilantro", "coriander", "گشنیز"], "herbs", "parsley"],
  [["tarragon", "ترخون", "تره", "chives", "herb", "herbs", "greens", "سبزی", "سبزیجات معطر", "سبزی خوردن", "سبزی آش", "سبزی قورمه"], "herbs", "parsley"],
];

const FLAT: Array<{ kw: string; kind: string; variant: string }> = RULES.flatMap(([kws, kind, variant]) =>
  kws.map((kw) => ({ kw: normalize(kw), kind, variant })),
).sort((a, b) => b.kw.length - a.kw.length);

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[‌‏‎]/g, " ") // ZWNJ & marks
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchText(text: string): KindRef | null {
  const t = ` ${normalize(text)} `;
  if (!t.trim()) return null;
  for (const r of FLAT) {
    // whole-word match (space delimited) — works for Persian and English plurals listed explicitly
    if (t.includes(` ${r.kw} `) || (r.kw.length >= 5 && t.includes(r.kw))) return { kind: r.kind, variant: r.variant };
  }
  return null;
}

/** Explicit override: `3d:kind` or `3d:kind-variant` in tags / spec / title_en. */
function explicitOverride(product: any): KindRef | null {
  const pool: string[] = [];
  if (Array.isArray(product?.tags)) pool.push(...product.tags.map((t: any) => (typeof t === "string" ? t : t?.tag || t?.name || "")));
  if (product?.spec && typeof product.spec === "object") {
    try {
      pool.push(JSON.stringify(product.spec));
    } catch (e) {
      /* ignore */
    }
  }
  for (const s of pool) {
    const m = /3d[:=]\s*([a-z]+)(?:-([a-z]+))?/i.exec(s || "");
    if (m && BUILDERS[m[1].toLowerCase()]) return { kind: m[1].toLowerCase(), variant: (m[2] || "").toLowerCase() || "default" };
  }
  return null;
}

export function detectKind(product: any, categoryTitle?: string | null): KindRef {
  return (
    explicitOverride(product) ||
    matchText(product?.title_en || "") ||
    matchText(product?.title || "") ||
    matchText(product?.title_en ? `${product.title_en} ${product.title}` : "") ||
    matchText(categoryTitle || "") || { kind: "bag", variant: "generic" }
  );
}

// ───────────────────────────── Model cache ─────────────────────────────

const modelCache = new Map<string, ProduceModel>();

export function getProduceModel(ref: KindRef, detail: Detail, seedKey = ""): ProduceModel {
  const key = `${ref.kind}:${ref.variant}:${detail}:${seedKey}`;
  let m = modelCache.get(key);
  if (m) return m;
  const builder = BUILDERS[ref.kind] || BUILDERS.bag;
  const seed = hashString(key) % 1000;
  m = builder({ detail, variant: ref.variant, rng: new Rng(seed + 1), seed });
  // a real photo-scan of this kind replaces the procedural model (same size, same resting style)
  const scan = scanFor(ref.kind, ref.variant);
  if (scan) {
    const maxSide = Math.max(m.size.x, m.size.y, m.size.z);
    m.parts.forEach((p) => p.geometry.dispose());
    const geometry = scanGeometry(scan, detail === "hero" ? 1 : 0, maxSide);
    const size = new Vector3();
    geometry.boundingBox!.getSize(size);
    m = { parts: [{ geometry, material: scan.material }], size, rest: m.rest };
  }
  modelCache.set(key, m);
  return m;
}

/**
 * Universal fallback for non-produce products: a package whose front face shows the product photo.
 * Lets the market work for any Selldone shop, not only grocers.
 */
const labeledCache = new Map<string, ProduceModel>();
export function getLabeledModel(imageUrl: string, fallbackUrl?: string | null): ProduceModel {
  let m = labeledCache.get(imageUrl);
  if (m) return m;
  const W = 0.15, H = 0.19, D = 0.07;
  const g = new BoxGeometry(W, H, D);
  g.translate(0, H / 2, 0);
  const k = kraftSet();
  const side = new MeshStandardMaterial({ map: k.map, normalMap: k.normalMap, roughness: 0.85 });
  const front = new MeshStandardMaterial({ color: "#f4efe6", roughness: 0.55 });
  const loader = new TextureLoader().setCrossOrigin("anonymous");
  const apply = (t: any) => {
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    front.map = t;
    front.needsUpdate = true;
  };
  // Some shops' CDNs only serve the generated thumbnails, so fall back to the thumbnail.
  loader.load(imageUrl, apply, undefined, () => {
    if (fallbackUrl) loader.load(fallbackUrl, apply, undefined, () => {});
  });
  const mats: Material[] = [side, side, side, side, front, side];
  m = { parts: [{ geometry: g, material: mats as any }], size: new Vector3(W, H, D), rest: "package" };
  labeledCache.set(imageUrl, m);
  return m;
}

export function disposeProduceModels() {
  modelCache.forEach((m) => m.parts.forEach((p) => (p.material as any).name?.startsWith("scan-") || p.geometry.dispose()));
  modelCache.clear();
}

/** Demo/test list of every model (used by the dev showroom). */
export const ALL_KIND_SAMPLES: KindRef[] = [
  { kind: "apple", variant: "red" },
  { kind: "apple", variant: "green" },
  { kind: "pear", variant: "pear" },
  { kind: "citrus", variant: "orange" },
  { kind: "citrus", variant: "tangerine" },
  { kind: "citrus", variant: "lemon" },
  { kind: "citrus", variant: "lime" },
  { kind: "banana", variant: "ripe" },
  { kind: "grapes", variant: "purple" },
  { kind: "grapes", variant: "green" },
  { kind: "strawberry", variant: "red" },
  { kind: "cherry", variant: "sweet" },
  { kind: "stone", variant: "peach" },
  { kind: "stone", variant: "apricot" },
  { kind: "stone", variant: "plum" },
  { kind: "watermelon", variant: "watermelon" },
  { kind: "melon", variant: "cantaloupe" },
  { kind: "pomegranate", variant: "red" },
  { kind: "kiwi", variant: "kiwi" },
  { kind: "pineapple", variant: "pineapple" },
  { kind: "mango", variant: "mango" },
  { kind: "avocado", variant: "hass" },
  { kind: "fig", variant: "fig" },
  { kind: "tomato", variant: "red" },
  { kind: "cucumber", variant: "cucumber" },
  { kind: "cucumber", variant: "zucchini" },
  { kind: "eggplant", variant: "eggplant" },
  { kind: "pepper", variant: "red" },
  { kind: "pepper", variant: "yellow" },
  { kind: "pepper", variant: "green" },
  { kind: "chili", variant: "red" },
  { kind: "carrot", variant: "carrot" },
  { kind: "potato", variant: "potato" },
  { kind: "onion", variant: "yellow" },
  { kind: "onion", variant: "red" },
  { kind: "onion", variant: "garlic" },
  { kind: "cabbage", variant: "cabbage" },
  { kind: "cabbage", variant: "lettuce" },
  { kind: "broccoli", variant: "broccoli" },
  { kind: "broccoli", variant: "cauliflower" },
  { kind: "corn", variant: "corn" },
  { kind: "pumpkin", variant: "pumpkin" },
  { kind: "mushroom", variant: "white" },
  { kind: "radish", variant: "radish" },
  { kind: "herbs", variant: "parsley" },
  { kind: "herbs", variant: "mint" },
  { kind: "herbs", variant: "basil" },
  { kind: "herbs", variant: "spinach" },
  { kind: "leek", variant: "leek" },
  { kind: "leek", variant: "celery" },
  { kind: "potato", variant: "ginger" },
];
