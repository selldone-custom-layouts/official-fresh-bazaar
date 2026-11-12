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
      <div class="fm-panel__thumb" v-if="image">
        <img :src="image" :alt="title" loading="lazy" />
      </div>
      <div class="fm-panel__titles">
        <div class="fm-panel__stall">{{ stallTitle }}</div>
        <h2 class="fm-panel__title">{{ title }}</h2>
        <div v-if="subtitle" class="fm-panel__subtitle" dir="auto">{{ subtitle }}</div>
        <div v-if="full && full.rate" class="fm-panel__rate">
          <span v-for="i in 5" :key="i" :class="{ on: i <= Math.round(full.rate) }">★</span>
          <small>{{ Number(full.rate).toFixed(1) }}</small>
        </div>
      </div>
    </div>

    <div class="fm-panel__price">
      <u-price :amount="price" class="fm-panel__price-main"></u-price>
      <span v-if="unit" class="fm-panel__unit">/ {{ unit }}</span>
      <u-price v-if="oldPrice" :amount="oldPrice" line-through class="fm-panel__price-old"></u-price>
      <span v-if="discountPercent" class="fm-panel__badge">−{{ discountPercent }}%</span>
    </div>

    <div class="fm-panel__stock" :class="{ out: soldOut }">
      <span class="fm-dot"></span>{{ soldOut ? T("sold_out") : T("in_stock") }}
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
  font-family: "Vazirmatn", "Segoe UI", Tahoma, sans-serif;
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
