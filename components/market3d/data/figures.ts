/*
 * Fresh Market 3D — historical figures who wander into the bazaar.
 *
 * The Persian verses are classical texts (public domain). Lines traditionally attributed to a figure
 * are labelled as attributed. The English renderings are our own plain translations.
 */
import type { Costume } from "../engine/people/costume";

export interface Verse {
  kind: "poem" | "saying" | "fact";
  fa: string[];
  en: string[];
  source: { fa: string; en: string };
}

export interface HistoricalFigure {
  id: "khayyam" | "avicenna" | "razi";
  avatar: string;
  name: { fa: string; en: string };
  epithet: { fa: string; en: string };
  costume: Costume;
  seated?: boolean;
  /** where they like to be: next to a stall whose title matches, or by the pool */
  spot: "pool" | RegExp;
  verses: Verse[];
}

export const FIGURES: HistoricalFigure[] = [
  {
    id: "khayyam",
    avatar: "Male_Adult_05",
    name: { fa: "حکیم عمر خیام نیشابوری", en: "Omar Khayyam" },
    epithet: { fa: "شاعر، ریاضی‌دان و منجّم · نیشابور، ۱۰۴۸–۱۱۳۱ میلادی", en: "Poet, mathematician & astronomer · Nishapur, 1048–1131" },
    costume: { robe: "#ddd2ba", cloak: "#1f2742", trim: "#a8823a", sash: "#6e2c25", turban: "#eee8da" },
    seated: true,
    spot: "pool",
    verses: [
      {
        kind: "poem",
        fa: ["هر سبزه که بر کنار جویی رسته است", "گویی ز لب فرشته‌خویی رسته است", "پا بر سر سبزه تا به خواری ننهی", "کان سبزه ز خاک لاله‌رویی رسته است"],
        en: ["Each blade of green beside the stream", "seems grown from an angel's lips;", "do not tread it down in scorn —", "it rose from the dust of a tulip-cheeked one."],
        source: { fa: "رباعیات خیام", en: "Rubaiyat of Khayyam" },
      },
      {
        kind: "poem",
        fa: ["این قافلهٔ عمر عجب می‌گذرد", "دریاب دمی که با طرب می‌گذرد", "ساقی غم فردای حریفان چه خوری", "پیش آر پیاله را که شب می‌گذرد"],
        en: ["How strangely this caravan of life goes by —", "seize the moment that passes in joy.", "Why grieve, cup-bearer, for tomorrow's friends?", "Bring the cup: the night is passing."],
        source: { fa: "رباعیات خیام", en: "Rubaiyat of Khayyam" },
      },
      {
        kind: "poem",
        fa: ["از دی که گذشت هیچ از او یاد مکن", "فردا که نیامده است فریاد مکن", "بر نامده و گذشته بنیاد مکن", "حالی خوش باش و عمر بر باد مکن"],
        en: ["Yesterday is gone — do not dwell on it;", "tomorrow has not come — do not cry for it.", "Build nothing on what is past or yet to be:", "be glad now, and do not waste your life."],
        source: { fa: "رباعیات خیام", en: "Rubaiyat of Khayyam" },
      },
      {
        kind: "fact",
        fa: ["گاه‌شماری جلالی، دقیق‌تر از گاه‌شماری گریگوری،", "حاصل کار خیام و هم‌کارانش است."],
        en: ["The Jalali calendar — more accurate than the Gregorian —", "was the work of Khayyam and his fellow astronomers."],
        source: { fa: "دربارهٔ خیام", en: "About Khayyam" },
      },
    ],
  },
  {
    id: "avicenna",
    avatar: "Male_Adult_15",
    name: { fa: "ابوعلی سینا", en: "Avicenna (Ibn Sina)" },
    epithet: { fa: "پزشک و فیلسوف، نویسندهٔ «قانون در طب» · ۹۸۰–۱۰۳۷ میلادی", en: "Physician & philosopher, author of The Canon of Medicine · 980–1037" },
    costume: { cloak: "#2e4a37", trim: "#c9a24a", turban: "#f1ece2", turbanExtra: 0.5 },
    spot: /herb|سبزی|green|mint|basil|ریحان|نعناع/i,
    verses: [
      {
        kind: "poem",
        fa: ["از قعر گِل سیاه تا اوج زحل", "کردم همه مشکلات گیتی را حل", "بیرون جستم ز قید هر مکر و حیل", "هر بند گشاده شد مگر بند اجل"],
        en: ["From the depths of black clay to the height of Saturn", "I have untied every riddle of the world;", "I slipped the snare of every trick and ruse —", "every knot came loose, but the knot of death."],
        source: { fa: "رباعی منسوب به ابن‌سینا", en: "Quatrain attributed to Avicenna" },
      },
      {
        kind: "poem",
        fa: ["دل گرچه در این بادیه بسیار شتافت", "یک موی ندانست ولی موی شکافت", "اندر دل من هزار خورشید بتافت", "آخر به کمال ذره‌ای راه نیافت"],
        en: ["Though my heart raced far across this desert", "and split hairs, it never knew a single hair;", "a thousand suns have blazed within my heart,", "yet it never reached the whole of one mote."],
        source: { fa: "رباعی منسوب به ابن‌سینا", en: "Quatrain attributed to Avicenna" },
      },
      {
        kind: "fact",
        fa: ["کتاب «قانون» ابن‌سینا", "قرن‌ها در دانشگاه‌های اروپا درس پزشکی بود."],
        en: ["Avicenna's Canon of Medicine was the standard", "medical textbook of European universities for centuries."],
        source: { fa: "دربارهٔ ابن‌سینا", en: "About Avicenna" },
      },
    ],
  },
  {
    id: "razi",
    avatar: "Male_Adult_19",
    name: { fa: "محمد زکریای رازی", en: "Rhazes (al-Razi)" },
    epithet: { fa: "پزشک و شیمی‌دان · ری، ۸۶۵–۹۲۵ میلادی", en: "Physician & chemist · Rey, 865–925" },
    costume: { cloak: "#86643f", trim: "#d8c08a", sash: "#3f5136", turban: "#ece4d2", turbanExtra: 1.5 },
    spot: /fruit|orchard|میوه|apple|سیب/i,
    verses: [
      {
        kind: "saying",
        fa: ["تا آنجا که می‌توان با غذا درمان کرد،", "سراغ دارو مرو."],
        en: ["Where a cure can be had with food,", "do not reach for medicine."],
        source: { fa: "منسوب به رازی", en: "Attributed to al-Razi" },
      },
      {
        kind: "fact",
        fa: ["رازی نخستین پزشکی بود که", "آبله و سرخک را از هم بازشناخت."],
        en: ["Al-Razi was the first physician", "to tell smallpox and measles apart."],
        source: { fa: "دربارهٔ رازی", en: "About al-Razi" },
      },
    ],
  },
];

export function figureById(id: string) {
  return FIGURES.find((f) => f.id === id);
}
