/*
 * Fresh Market 3D — DEV ONLY showroom catalog (?market-demo in `npm run serve`).
 * Lets designers check every procedural model without a fruit shop. Never used in production builds.
 */
import type { RawStall } from "./marketCatalog";
import { ALL_KIND_SAMPLES } from "../engine/produce/catalog";

const NAMES: Record<string, string> = {
  "apple:red": "Red Apple", "apple:green": "Green Apple", "pear:pear": "Pear", "citrus:orange": "Orange",
  "citrus:tangerine": "Tangerine", "citrus:lemon": "Lemon", "citrus:lime": "Lime", "banana:ripe": "Banana",
  "grapes:purple": "Red Grapes", "grapes:green": "Green Grapes", "strawberry:red": "Strawberry", "cherry:sweet": "Cherry",
  "stone:peach": "Peach", "stone:apricot": "Apricot", "stone:plum": "Plum", "watermelon:watermelon": "Watermelon",
  "melon:cantaloupe": "Cantaloupe", "pomegranate:red": "Pomegranate", "kiwi:kiwi": "Kiwi", "pineapple:pineapple": "Pineapple",
  "mango:mango": "Mango", "avocado:hass": "Avocado", "fig:fig": "Fig", "tomato:red": "Tomato", "cucumber:cucumber": "Cucumber",
  "cucumber:zucchini": "Zucchini", "eggplant:eggplant": "Eggplant", "pepper:red": "Red Pepper", "pepper:yellow": "Yellow Pepper",
  "pepper:green": "Green Pepper", "chili:red": "Chili", "carrot:carrot": "Carrot", "potato:potato": "Potato",
  "onion:yellow": "Onion", "onion:red": "Red Onion", "onion:garlic": "Garlic", "cabbage:cabbage": "Cabbage",
  "cabbage:lettuce": "Lettuce", "broccoli:broccoli": "Broccoli", "broccoli:cauliflower": "Cauliflower", "corn:corn": "Corn",
  "pumpkin:pumpkin": "Pumpkin", "mushroom:white": "Mushroom", "radish:radish": "Radish", "herbs:parsley": "Parsley",
  "herbs:mint": "Mint", "herbs:basil": "Basil", "herbs:spinach": "Spinach", "leek:leek": "Leek", "leek:celery": "Celery",
  "potato:ginger": "Ginger",
};

export function demoCatalog(): RawStall[] {
  const groups = [
    { title: "Orchard Fruits", kinds: ["apple:red", "apple:green", "pear:pear", "stone:peach", "stone:apricot", "stone:plum", "cherry:sweet", "fig:fig"] },
    { title: "Citrus & Tropical", kinds: ["citrus:orange", "citrus:tangerine", "citrus:lemon", "citrus:lime", "banana:ripe", "pineapple:pineapple", "mango:mango", "kiwi:kiwi"] },
    { title: "Berries & Melons", kinds: ["strawberry:red", "grapes:purple", "grapes:green", "pomegranate:red", "watermelon:watermelon", "melon:cantaloupe", "avocado:hass"] },
    { title: "Garden Vegetables", kinds: ["tomato:red", "cucumber:cucumber", "cucumber:zucchini", "eggplant:eggplant", "pepper:red", "pepper:yellow", "pepper:green", "chili:red"] },
    { title: "Roots & Bulbs", kinds: ["carrot:carrot", "potato:potato", "onion:yellow", "onion:red", "onion:garlic", "radish:radish", "potato:ginger", "pumpkin:pumpkin"] },
    { title: "Leafy Greens", kinds: ["cabbage:cabbage", "cabbage:lettuce", "broccoli:broccoli", "broccoli:cauliflower", "corn:corn", "mushroom:white", "leek:leek", "leek:celery"] },
    { title: "Fresh Herbs", kinds: ["herbs:parsley", "herbs:mint", "herbs:basil", "herbs:spinach"] },
  ];
  let id = 1000;
  return groups.map((g, gi) => ({
    id: `demo-${gi}`,
    title: g.title,
    name: null,
    image: null,
    total: g.kinds.length,
    products: g.kinds.map((k) => {
      const [kind, variant] = k.split(":");
      const ref = ALL_KIND_SAMPLES.find((r) => r.kind === kind && r.variant === variant) || { kind, variant };
      return {
        id: id++,
        title: NAMES[k] || k,
        title_en: NAMES[k] || k,
        price: 1,
        currency: "USD",
        unit: "kg",
        type: "PHYSICAL",
        quantity: 20,
        __demoPrice: Math.round((1.2 + Math.random() * 5) * 100) / 100,
        __kind: ref,
      };
    }),
  }));
}
