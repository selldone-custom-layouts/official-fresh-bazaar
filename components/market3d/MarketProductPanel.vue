<!--
  Fresh Market 3D — product inspection panel.
  Uses the standard storefront basket flow (AddToBasket / RemoveFromBasket from the global mixin).
-->
<template>
  <aside class="fm-panel" :class="{ rtl }" role="dialog" :aria-label="title">
    <button class="fm-panel__close" :aria-label="T('close')" @click="$emit('close')">
      <span aria-hidden="true">✕</span>
    </button>

    <div class="fm-panel__head">
      <div class="fm-panel__thumb" v-if="shownImage">
        <img :src="shownImage" :alt="title" loading="lazy" @error="onImageError" />
      </div>
      <div class="fm-panel__titles">
        <div class="fm-panel__stall">{{ stallTitle }}</div>
        <h2 class="fm-panel__title">{{ title }}</h2>
        <div v-if="subtitle" class="fm-panel__subtitle" dir="auto">{{ subtitle }}</div>
        <div v-if="p.rate" class="fm-panel__rate">
          <span v-for="i in 5" :key="i" :class="{ on: i <= Math.round(p.rate) }">★</span>
          <small>{{ Number(p.rate).toFixed(1) }}<template v-if="p.rate_count"> · {{ p.rate_count }} {{ T("reviews") }}</template></small>
        </div>
      </div>
    </div>

    <div v-if="gallery.length > 1" class="fm-panel__gallery">
      <button v-for="(g, i) in gallery" :key="g.thumb" :class="{ active: i === galleryIndex }" @click="galleryIndex = i">
        <img :src="g.thumb" alt="" loading="lazy" />
      </button>
    </div>

    <div class="fm-panel__price">
      <u-price :amount="price" class="fm-panel__price-main"></u-price>
      <span v-if="unit" class="fm-panel__unit">/ {{ unit }}</span>
      <u-price v-if="oldPrice" :amount="oldPrice" line-through class="fm-panel__price-old"></u-price>
      <span v-if="discountPercent" class="fm-panel__badge">−{{ discountPercent }}%</span>
    </div>

    <div class="fm-panel__stock" :class="{ out: soldOut }">
      <span class="fm-dot"></span>{{ soldOut ? T("sold_out") : stock !== null && stock <= 10 ? T("only_left").replace("{n}", String(stock)) : T("in_stock") }}
    </div>

    <div v-if="description" class="fm-panel__desc" :class="{ open: descOpen }" dir="auto">
      <p>{{ description }}</p>
      <button v-if="description.length > 180" class="fm-link" @click="descOpen = !descOpen">{{ descOpen ? T("less") : T("more") }}</button>
    </div>

    <div v-if="variants.length" class="fm-panel__variants">
      <div class="fm-panel__label">{{ T("options") }}</div>
      <div class="fm-panel__chips">
        <button
          v-for="v in variants"
          :key="v.id"
          class="fm-chip"
          :class="{ active: variant && variant.id === v.id, disabled: !v.quantity }"
          :disabled="!v.quantity"
          @click="variant = v"
        >
          <span v-if="v.color" class="fm-chip__color" :style="{ background: v.color }"></span>
          {{ variantLabel(v) }}
        </button>
      </div>
    </div>

    <div class="fm-panel__qty">
      <div class="fm-panel__label">{{ T("quantity") }}</div>
      <div class="fm-stepper">
        <button :disabled="count <= 1 || busy" @click="count--" aria-label="−">−</button>
        <span>{{ count }}</span>
        <button :disabled="busy || (maxCount && count >= maxCount)" @click="count++" aria-label="+">+</button>
      </div>
      <div v-if="inBasket" class="fm-panel__inbasket">
        {{ T("in_basket") }}: <b>{{ inBasket.count }}</b>
        <button class="fm-link" :disabled="busy" @click="remove">{{ T("remove") }}</button>
      </div>
    </div>

    <button class="fm-buy" :disabled="busy || soldOut || (variants.length && !variant)" @click="add">
      <span v-if="busy" class="fm-spin"></span>
      <template v-else>
        <span class="fm-buy__icon" aria-hidden="true">🧺</span>
        {{ inBasket ? T("update") : T("add") }}
        <u-price v-if="!soldOut" :amount="price * count" class="fm-buy__sum"></u-price>
      </template>
    </button>

    <div v-if="facts.length" class="fm-panel__facts">
      <div v-for="f in facts" :key="f.label"><span>{{ f.label }}</span><b dir="auto">{{ f.value }}</b></div>
    </div>

    <div v-if="specRows.length" class="fm-panel__spec">
      <div class="fm-panel__label">{{ T("specs") }}</div>
      <template v-for="(r, i) in specRows" :key="i">
        <div v-if="r.group" class="fm-panel__spec-group" dir="auto">{{ r.group }}</div>
        <div v-else class="fm-panel__spec-row"><span dir="auto">{{ r.k }}</span><b dir="auto">{{ r.v }}</b></div>
      </template>
    </div>

    <div v-if="pros.length || cons.length" class="fm-panel__proscons">
      <ul v-if="pros.length" class="pros"><li v-for="(x, i) in pros" :key="'p' + i" dir="auto">{{ x }}</li></ul>
      <ul v-if="cons.length" class="cons"><li v-for="(x, i) in cons" :key="'c' + i" dir="auto">{{ x }}</li></ul>
    </div>

    <router-link class="fm-panel__details" :to="{ name: productRoute, params: { product_id: product.id } }">
      {{ T("details") }} ›
    </router-link>

    <p class="fm-panel__hint">{{ T("drag_rotate") }}</p>
  </aside>
</template>

<script lang="ts">
import { marketT } from "./i18n";
import CurrencyMixin from "@selldone/components-vue/mixin/currency/CurrencyMixin.ts";
import ProductMixin from "@selldone/components-vue/mixin/product/ProductMixin.ts";
import AuthMixin from "@selldone/components-vue/mixin/auth/AuthMixin.ts";
import { ShopOptionsHelper } from "@selldone/core-js/helper/shop/ShopOptionsHelper";
import { loadProductDetails } from "./data/marketCatalog";

export default {
  name: "MarketProductPanel",
  mixins: [CurrencyMixin, ProductMixin, AuthMixin],
  inject: ["$shop"],
  props: {
    product: { type: Object, required: true },
    stallTitle: { type: String, default: "" },
    rtl: Boolean,
    locale: String,
  },
  emits: ["close", "added"],
  data: () => ({
    full: null as any,
    variant: null as any,
    count: 1,
    busy: false,
    galleryIndex: 0,
    descOpen: false,
    failed: {} as Record<string, boolean>,
  }),
  computed: {
    p(): any {
      return this.full || this.product;
    },
    title(): string {
      return this.p.title || this.p.title_en || "";
    },
    image(): string | null {
      return this.p.icon ? this.getShopImagePath(this.p.icon, 128) : null;
    },
    /** main image + gallery from the shop (original size, falling back to the CDN thumbnail) */
    gallery(): Array<{ full: string; thumb: string }> {
      const paths: string[] = [];
      const add = (x: any) => {
        const path = typeof x === "string" ? x : x?.path || x?.src || x?.image;
        if (path && !paths.includes(path)) paths.push(path);
      };
      add(this.p.icon);
      (this.full?.images || []).forEach(add);
      return paths.map((path) => ({ full: /^https?:/.test(path) ? path : this.getShopImagePath(path), thumb: /^https?:/.test(path) ? path : this.getShopImagePath(path, 128) }));
    },
    shownImage(): string | null {
      const g = this.gallery[this.galleryIndex] || this.gallery[0];
      if (!g) return null;
      return this.failed[g.full] ? g.thumb : g.full;
    },
    description(): string {
      const body = this.full?.article_pack?.article?.body || this.full?.article?.body || "";
      if (!body) return "";
      try {
        const doc = new DOMParser().parseFromString(String(body), "text/html");
        return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
      } catch (e) {
        return String(body).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    },
    facts(): Array<{ label: string; value: string }> {
      const f = this.full || {};
      const out: Array<{ label: string; value: string }> = [];
      const txt = (v: any) => (v == null ? "" : typeof v === "object" ? v.title || v.name || "" : String(v));
      if (txt(f.brand)) out.push({ label: this.T("brand"), value: txt(f.brand) });
      if (f.condition && f.condition !== "new") out.push({ label: this.T("condition"), value: String(f.condition) });
      if (txt(f.warranty)) out.push({ label: this.T("warranty"), value: txt(f.warranty) });
      if (Number(f.return_warranty) > 0) out.push({ label: this.T("returns"), value: this.T("days").replace("{n}", String(f.return_warranty)) });
      if (f.sku) out.push({ label: "SKU", value: String(f.sku) });
      return out;
    },
    /** specification table, whatever shape the shop stored it in */
    specRows(): Array<{ group?: string; k?: string; v?: string }> {
      const spec = this.full?.spec;
      if (!spec) return [];
      const rows: Array<{ group?: string; k?: string; v?: string }> = [];
      const val = (v: any): string => (Array.isArray(v) ? v.map(val).join(", ") : v && typeof v === "object" ? v.value ?? v.title ?? JSON.stringify(v) : String(v ?? ""));
      const walk = (s: any) => {
        if (Array.isArray(s))
          s.forEach((it) => {
            if (Array.isArray(it) && it.length >= 2) rows.push({ k: String(it[0]), v: val(it[1]) });
            else if (it && typeof it === "object") {
              if (it.type === "group" || (it.group && !("value" in it))) rows.push({ group: String(it.title || it.group) });
              else if ("value" in it || "values" in it) rows.push({ k: String(it.key ?? it.title ?? it.name ?? ""), v: val(it.value ?? it.values) });
              else walk(it.items || it.children || []);
              if (Array.isArray(it.items)) walk(it.items);
            }
          });
        else if (s && typeof s === "object")
          Object.entries(s).forEach(([k, v]) => {
            if (v && typeof v === "object" && !Array.isArray(v)) {
              rows.push({ group: k });
              walk(v);
            } else if (Array.isArray(v) && v.some((x) => x && typeof x === "object")) {
              rows.push({ group: k });
              walk(v);
            } else rows.push({ k, v: val(v) });
          });
      };
      walk(spec);
      return rows.filter((r) => r.group || (r.k && r.v));
    },
    pros(): string[] {
      return this.list(this.full?.pros);
    },
    cons(): string[] {
      return this.list(this.full?.cons);
    },
    subtitle(): string | null {
      const t = this.p.title_en;
      return t && t !== this.title ? t : null;
    },
    unit(): string | null {
      return this.p.unit || null;
    },
    variants(): any[] {
      return (this.full?.variants || []).filter((v: any) => v && v.enable !== false);
    },
    price(): number {
      try {
        return this.CalcPriceProductCurrentCurrency(this.$shop, this.p, this.variant) || 0;
      } catch (e) {
        return this.p.price || 0;
      }
    },
    oldPrice(): number | null {
      try {
        const d = this.getProductDiscountAmount(this.$shop, this.p, this.variant);
        return d > 0 ? this.price + d : null;
      } catch (e) {
        return null;
      }
    },
    discountPercent(): number {
      return this.oldPrice ? Math.round((1 - this.price / this.oldPrice) * 100) : 0;
    },
    stock(): number | null {
      const q = this.variant ? this.variant.quantity : this.p.quantity;
      return q === undefined || q === null ? null : Number(q);
    },
    soldOut(): boolean {
      return this.stock !== null && this.stock <= 0;
    },
    maxCount(): number | null {
      return this.stock && this.stock > 0 ? this.stock : null;
    },
    type(): string {
      return this.p.type || "PHYSICAL";
    },
    basket(): any {
      return this.getBasket(this.type);
    },
    inBasket(): any {
      const items = this.basket?.items || [];
      return items.find((i: any) => i.product_id === this.product.id && (this.variant ? i.variant_id === this.variant.id : !i.variant_id)) || null;
    },
    productRoute(): string {
      return (window as any).$storefront.routes.PRODUCT_PAGE;
    },
  },
  watch: {
    "product.id": {
      immediate: true,
      handler() {
        this.full = null;
        this.variant = null;
        this.count = 1;
        this.galleryIndex = 0;
        this.descOpen = false;
        this.fetch();
      },
    },
    inBasket: {
      immediate: true,
      handler(v: any) {
        if (v && v.count) this.count = v.count;
      },
    },
  },
  methods: {
    T(k: any) {
      return marketT(this.locale, k);
    },
    async fetch() {
      const id = this.product.id;
      try {
        const full = await loadProductDetails(id);
        if (this.product.id !== id || !full) return;
        this.full = full;
        const vs = this.variants;
        if (vs.length) this.variant = vs.find((v: any) => v.quantity > 0) || vs[0];
      } catch (e) {
        /* keep list data */
      }
    },
    list(x: any): string[] {
      if (!x) return [];
      const arr = Array.isArray(x) ? x : typeof x === "string" ? x.split(/\n+/) : Object.values(x);
      return arr.map((i: any) => (typeof i === "string" ? i : i?.text || i?.title || i?.value || "")).map((s: string) => s.trim()).filter(Boolean);
    },
    onImageError() {
      const g = this.gallery[this.galleryIndex] || this.gallery[0];
      if (g) this.failed = { ...this.failed, [g.full]: true };
    },
    variantLabel(v: any): string {
      const parts = [v.volume, v.weight, v.pack, v.type, v.style].filter(Boolean);
      if (!parts.length && v.color) return "";
      return parts.join(" · ") || `#${v.id}`;
    },
    /** Same rule as the official buy button: guests need sign-in unless the shop allows guest checkout. */
    needsLogin(): boolean {
      if (!this.USER() && !ShopOptionsHelper.HasGuestCheckout(this.getShop())) {
        this.NeedLogin();
        return true;
      }
      return false;
    },
    add() {
      if (this.needsLogin()) return;
      this.busy = true;
      this.AddToBasket(
        this.$shop.name,
        this.p,
        this.variant,
        this.count,
        () => (this.busy = false),
        () => {
          this.busy = false;
          this.$emit("added", { product: this.p, count: this.count });
        },
      );
    },
    remove() {
      if (this.needsLogin()) return;
      this.busy = true;
      this.RemoveFromBasket(
        this.product.id,
        this.variant ? this.variant.id : null,
        () => (this.busy = false),
        () => {
          this.busy = false;
          this.count = 1;
        },
      );
    },
  },
};
</script>

<style scoped>
.fm-panel {
  position: absolute;
  z-index: 8;
  top: 84px;
  right: 22px;
  width: 380px;
  max-height: calc(100% - 110px);
  overflow: auto;
  padding: 22px 22px 18px;
  border-radius: 22px;
  color: #2b1d12;
  background: linear-gradient(180deg, rgba(255, 251, 244, 0.92), rgba(250, 240, 224, 0.9));
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 24px 60px rgba(40, 22, 8, 0.35), 0 2px 0 rgba(255, 255, 255, 0.6) inset;
  backdrop-filter: blur(18px) saturate(1.2);
  -webkit-backdrop-filter: blur(18px) saturate(1.2);
  animation: fm-panel-in 0.42s cubic-bezier(0.2, 0.9, 0.25, 1.1);
  text-align: start;
}
.fm-panel.rtl {
  right: auto;
  left: 22px;
}
@keyframes fm-panel-in {
  from {
    transform: translateY(18px) scale(0.98);
    opacity: 0;
  }
}
.fm-panel__close {
  position: absolute;
  top: 12px;
  inset-inline-end: 12px;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 0;
  background: rgba(60, 36, 16, 0.08);
  color: #4a2e18;
  cursor: pointer;
  font-size: 14px;
}
.fm-panel__close:hover {
  background: rgba(60, 36, 16, 0.16);
}
.fm-panel__gallery {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  overflow-x: auto;
}
.fm-panel__gallery button {
  flex: 0 0 44px;
  height: 44px;
  padding: 0;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid transparent;
  background: #fff;
  cursor: pointer;
}
.fm-panel__gallery button.active {
  border-color: #1a8f9a;
}
.fm-panel__gallery img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.fm-panel__desc {
  margin: 10px 0 4px;
  font-size: 13.5px;
  line-height: 1.55;
  color: #4a3424;
}
.fm-panel__desc p {
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.fm-panel__desc.open p {
  -webkit-line-clamp: unset;
}
.fm-panel__facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
  margin: 14px 0 4px;
  font-size: 12.5px;
}
.fm-panel__facts div {
  display: flex;
  flex-direction: column;
}
.fm-panel__facts span {
  color: #9a6a3a;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.fm-panel__spec {
  margin-top: 14px;
  font-size: 12.5px;
}
.fm-panel__spec-group {
  margin-top: 8px;
  font-weight: 800;
  color: #6a4426;
}
.fm-panel__spec-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  border-bottom: 1px dashed rgba(106, 68, 38, 0.18);
}
.fm-panel__spec-row span {
  color: #7a5a3e;
}
.fm-panel__proscons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 12px;
  font-size: 12.5px;
}
.fm-panel__proscons ul {
  margin: 0;
  padding-inline-start: 16px;
}
.fm-panel__proscons .pros li::marker {
  content: "+ ";
  color: #237a42;
}
.fm-panel__proscons .cons li::marker {
  content: "− ";
  color: #b5322b;
}
.fm-panel__head {
  display: flex;
  gap: 14px;
  align-items: center;
  padding-inline-end: 30px;
}
.fm-panel__thumb {
  flex: 0 0 64px;
  height: 64px;
  border-radius: 16px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 6px 14px rgba(60, 30, 10, 0.18);
}
.fm-panel__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.fm-panel__stall {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #9a6a3a;
  font-weight: 700;
}
.fm-panel__title {
  margin: 2px 0 0;
  font-size: 22px;
  line-height: 1.2;
  font-weight: 800;
  color: #2b1a0e;
}
.fm-panel__subtitle {
  margin-top: 2px;
  font-size: 15px;
  font-weight: 700;
  color: #1a8f9a;
  font-family: "lang-fa-iransans", "IRANSans", Tahoma, "Segoe UI", sans-serif;
}
.fm-panel__rate {
  color: #d0b090;
  font-size: 13px;
  margin-top: 2px;
}
.fm-panel__rate .on {
  color: #f2a51a;
}
.fm-panel__rate small {
  color: #8a6a4a;
  margin-inline-start: 6px;
}
.fm-panel__price {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin: 18px 0 6px;
}
.fm-panel__price-main {
  font-size: 30px;
  font-weight: 900;
  color: #1f6b3a;
}
.fm-panel__unit {
  color: #7a5a3a;
  font-weight: 600;
}
.fm-panel__price-old {
  color: #a08060;
  font-size: 15px;
}
.fm-panel__badge {
  background: #e2442f;
  color: #fff;
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 12px;
  font-weight: 800;
}
.fm-panel__stock {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 700;
  color: #2f7a48;
}
.fm-panel__stock .fm-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 4px rgba(47, 122, 72, 0.15);
}
.fm-panel__stock.out {
  color: #c0322b;
}
.fm-panel__label {
  font-size: 12px;
  font-weight: 800;
  color: #8a6440;
  margin: 18px 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.fm-panel__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.fm-chip {
  border: 1.5px solid rgba(90, 56, 26, 0.2);
  background: rgba(255, 255, 255, 0.7);
  border-radius: 12px;
  padding: 7px 12px;
  font-weight: 700;
  font-size: 13px;
  color: #4a2e18;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.fm-chip.active {
  border-color: #2f7a48;
  background: #eaf6ec;
  color: #1f5a34;
}
.fm-chip.disabled {
  opacity: 0.45;
  cursor: not-allowed;
  text-decoration: line-through;
}
.fm-chip__color {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.15);
}
.fm-stepper {
  display: inline-flex;
  align-items: center;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(60, 30, 10, 0.12);
  overflow: hidden;
}
.fm-stepper button {
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  font-size: 22px;
  color: #4a2e18;
  cursor: pointer;
}
.fm-stepper button:disabled {
  opacity: 0.3;
  cursor: default;
}
.fm-stepper span {
  min-width: 40px;
  text-align: center;
  font-weight: 900;
  font-size: 18px;
}
.fm-panel__inbasket {
  margin-top: 10px;
  font-size: 13px;
  color: #6a4a2a;
}
.fm-link {
  border: 0;
  background: none;
  color: #c0322b;
  font-weight: 700;
  cursor: pointer;
  margin-inline-start: 8px;
  text-decoration: underline;
}
.fm-buy {
  margin-top: 20px;
  width: 100%;
  height: 56px;
  border: 0;
  border-radius: 16px;
  background: linear-gradient(180deg, #3a9a5a, #237a42);
  color: #fff;
  font-size: 17px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(35, 122, 66, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.3);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.fm-buy:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 14px 30px rgba(35, 122, 66, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}
.fm-buy:disabled {
  background: #b8a898;
  box-shadow: none;
  cursor: not-allowed;
}
.fm-buy__sum {
  opacity: 0.85;
  font-weight: 700;
  font-size: 15px;
  margin-inline-start: 4px;
}
.fm-spin {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  animation: fm-rot 0.8s linear infinite;
}
@keyframes fm-rot {
  to {
    transform: rotate(360deg);
  }
}
.fm-panel__details {
  display: block;
  text-align: center;
  margin-top: 14px;
  font-weight: 700;
  color: #8a5a2a;
  text-decoration: none;
}
.fm-panel__details:hover {
  text-decoration: underline;
}
.fm-panel__hint {
  margin: 12px 0 0;
  text-align: center;
  font-size: 11px;
  color: #a08868;
}
@media (max-width: 760px) {
  .fm-panel,
  .fm-panel.rtl {
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    width: auto;
    max-height: 58%;
    border-radius: 24px 24px 0 0;
    padding: 18px 18px 14px;
    animation-name: fm-sheet-in;
  }
  .fm-panel__title {
    font-size: 19px;
  }
  .fm-panel__price {
    margin-top: 12px;
  }
  .fm-panel__price-main {
    font-size: 24px;
  }
  .fm-panel__label {
    margin-top: 12px;
  }
  .fm-buy {
    margin-top: 14px;
    height: 52px;
  }
}
@keyframes fm-sheet-in {
  from {
    transform: translateY(40px);
    opacity: 0;
  }
}
</style>
