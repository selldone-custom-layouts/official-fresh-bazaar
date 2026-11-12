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
    // indigo pearl-roundel silk qaba, gold tiraz bands, a tall cream felt kolah with a fur brim
    costume: {
      cloak: "#1d2340",
      fabric: { kind: "roundel", ground: "#1b2140", colors: ["#a8843a", "#2b3463", "#c9a24a", "#e8dcc4"] },
      trim: "#b8913f",
      tiraz: "#c9a24a",
      sash: "#7a2a22",
      turban: "#6a1d22",
      fur: "#2a1d16",
      hat: "kolah",
      length: "ankle",
      open: 0,
      sleeve: "tailored",
    },
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
    // green pearl-roundel silk, crimson sharbush with a sable brim and a gold plate
    costume: {
      cloak: "#1f3a2c",
      fabric: { kind: "roundel", ground: "#1d3a2b", colors: ["#b8913f", "#2c4d3a", "#d8b062", "#e8dcc4"] },
      trim: "#c9a24a",
      tiraz: "#c9a24a",
      sash: "#6e2c25",
      turban: "#7a1f24",
      fur: "#1e1814",
      hat: "sharbush",
      length: "ankle",
      open: 0,
      sleeve: "tailored",
    },
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
    // wine-red pearl-roundel silk, a brown felt kolah with a fur brim
    costume: {
      cloak: "#5a1a20",
      fabric: { kind: "roundel", ground: "#561820", colors: ["#c9a24a", "#6e242b", "#d8b062", "#e8dcc4"] },
      trim: "#d8b062",
      tiraz: "#d8b062",
      sash: "#2f4a36",
      turban: "#2f2620",
      fur: "#5a4430",
      hat: "kolah",
      length: "ankle",
      open: 0,
      sleeve: "tailored",
    },
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
