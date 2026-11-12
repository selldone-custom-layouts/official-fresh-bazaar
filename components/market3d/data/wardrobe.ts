/*
 * Fresh Market 3D — wardrobe: chic, Iranian-inspired outfits for the vendors and shoppers.
 *
 * Coats and coat-dresses in termeh (Yazd brocade with boteh), suzani needlework, ikat and felted wool,
 * with contrasting trims, woven sashes and felt caps (kolah namadi). Hair stays uncovered.
 * Keys are Rocketbox avatar ids; anyone not listed wears their own clothes.
 */
import type { Costume } from "../engine/people/costume";

const termeh = (ground: string, motif: string, inner: string, flower: string, thread: string) => ({ kind: "termeh" as const, ground, colors: [motif, inner, flower, thread] });
const suzani = (ground: string, outer: string, ring: string, vine: string, heart: string) => ({ kind: "suzani" as const, ground, colors: [outer, ring, vine, heart] });
const ikat = (ground: string, ...bands: string[]) => ({ kind: "ikat" as const, ground, colors: bands });
const wool = (ground: string) => ({ kind: "wool" as const, ground, colors: [ground] });

export const WARDROBE: Record<string, Costume> = {
  // ── vendors
  Gardener_Male_01: { cloak: "#1d2340", fabric: termeh("#171c33", "#6e2424", "#a8843a", "#c9b993", "#a8843a"), trim: "#b8913f", sash: "#7a2a22", turban: "#5a3a24", hat: "felt", length: "calf", open: 0, sleeve: "tailored" },
  Delivery_Male_01: { cloak: "#4a1219", fabric: termeh("#4a1219", "#9a7a3c", "#22325a", "#cdbb92", "#b8974e"), trim: "#b8974e", sash: "#1f3a5a", turban: "#e8dcc4", hat: "none", length: "knee", open: 0, sleeve: "tailored" },
  Wood_Male_01: { cloak: "#2b2b30", fabric: ikat("#2b2b30", "#c25a2a", "#e0c98a", "#2f6b6a", "#8a3a5a"), trim: "#c25a2a", sash: "#d6b25a", turban: "#ffffff", hat: "none", length: "knee", open: 0, sleeve: "tailored" },
  Male_Adult_14: { cloak: "#5a4030", fabric: wool("#5a4030"), trim: "#c9a24a", sash: "#2f4a36", turban: "#3a2a1e", hat: "felt", length: "calf", open: 0, sleeve: "tailored" },
  Male_Adult_04: { cloak: "#e9dfc8", fabric: suzani("#e9dfc8", "#b8322b", "#d97a2a", "#2f5a3a", "#1d2a4a"), trim: "#b8322b", sash: "#1d2a4a", turban: "#ffffff", hat: "none", length: "knee", open: 0, sleeve: "tailored" },
  Female_Adult_11: { cloak: "#f0e6d0", fabric: suzani("#f0e6d0", "#a8202c", "#d9822b", "#1f5a4a", "#2a1d14"), trim: "#a8202c", sash: "#1f5a4a", turban: "#ffffff", hat: "none", length: "ankle", open: 0, sleeve: "tailored" },
  // ── shoppers
  Female_Adult_05: { cloak: "#0f4a52", fabric: termeh("#0d3d44", "#a8894a", "#7e2a25", "#d2c49e", "#b8974e"), trim: "#d8b062", sash: "#a8322b", turban: "#ffffff", hat: "none", length: "ankle", open: 0, sleeve: "tailored" },
  Female_Adult_03: { cloak: "#4a1426", fabric: termeh("#3d1020", "#a8894a", "#24495a", "#d2c49e", "#b8974e"), trim: "#e2c27a", sash: "#2a5a6a", turban: "#ffffff", hat: "none", length: "ankle", open: 0, sleeve: "tailored" },
  Female_Adult_02: { cloak: "#efe6d2", fabric: suzani("#efe6d2", "#2a4a8a", "#c23a2a", "#3a7a5a", "#2a1d14"), trim: "#2a4a8a", sash: "#c23a2a", turban: "#ffffff", hat: "none", length: "ankle", open: 0, sleeve: "tailored" },
  Female_Adult_15: { cloak: "#1b2148", fabric: ikat("#1b2148", "#e0c98a", "#b8322b", "#2f8a8a", "#f0e6d0"), trim: "#e0c98a", sash: "#b8322b", turban: "#ffffff", hat: "none", length: "ankle", open: 0, sleeve: "tailored" },
  Female_Adult_07: { cloak: "#b8873a", fabric: wool("#b8873a"), trim: "#5a1820", sash: "#5a1820", turban: "#ffffff", hat: "none", length: "ankle", open: 0, sleeve: "tailored" },
  Male_Adult_07: { cloak: "#22252e", fabric: termeh("#1c1f27", "#7a2424", "#a8894a", "#c9bb98", "#a8894a"), trim: "#c9a24a", sash: "#9a2a2a", turban: "#ffffff", hat: "none", length: "knee", open: 0, sleeve: "tailored" },
  // ── locals chatting by the entrance
  Male_Adult_03: { cloak: "#4a3426", fabric: termeh("#3d2b20", "#9a7a3c", "#1d3350", "#cdbb92", "#b8974e"), trim: "#b8913f", sash: "#1d3a5a", turban: "#e8dcc4", hat: "felt", length: "calf", open: 0, sleeve: "tailored" },
  Male_Adult_02: { cloak: "#3a4228", fabric: ikat("#3a4228", "#d9a53a", "#8a2a2a", "#e8dcc4", "#2f5a6a"), trim: "#d9a53a", sash: "#8a2a2a", turban: "#ffffff", hat: "none", length: "knee", open: 0, sleeve: "tailored" },
};
