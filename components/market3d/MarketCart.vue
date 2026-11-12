<!--
  Fresh Market 3D — basket drawer. Reads the live Selldone baskets from the store and
  hands checkout over to the standard storefront basket page.
-->
<template>
  <transition name="fm-cart">
    <div v-if="modelValue" class="fm-cart-wrap" @click.self="$emit('update:modelValue', false)">
      <aside class="fm-cart" :class="{ rtl }" role="dialog" :aria-label="T('basket')">
        <header class="fm-cart__head">
          <div class="fm-cart__title">🧺 {{ T("basket") }}</div>
          <button class="fm-cart__close" :aria-label="T('close')" @click="$emit('update:modelValue', false)">✕</button>
        </header>

        <div v-if="!items.length" class="fm-cart__empty">
          <div class="fm-cart__empty-icon">🍎🥕🍋</div>
          {{ T("empty_basket") }}
        </div>

        <ul v-else class="fm-cart__list">
          <li v-for="it in items" :key="it.basket.type + '-' + it.item.id" class="fm-cart__item">
            <img v-if="it.item.product && it.item.product.icon" :src="getShopImagePath(it.item.product.icon, 128)" alt="" />
            <div class="fm-cart__info">
              <div class="fm-cart__name">{{ it.item.product ? it.item.product.title : "#" + it.item.product_id }}</div>
              <div v-if="variantLabel(it.item.variant)" class="fm-cart__variant">{{ variantLabel(it.item.variant) }}</div>
              <u-price :amount="lineTotal(it.item)" class="fm-cart__price"></u-price>
            </div>
            <div class="fm-cart__stepper">
              <button :disabled="busy === it.item.id" @click="setCount(it.item, it.item.count - 1)">−</button>
              <span>{{ it.item.count }}</span>
              <button :disabled="busy === it.item.id" @click="setCount(it.item, it.item.count + 1)">+</button>
            </div>
          </li>
        </ul>

        <footer v-if="items.length" class="fm-cart__foot">
          <div class="fm-cart__total">
            <span>{{ T("total") }}</span>
            <u-price :amount="total"></u-price>
          </div>
          <button class="fm-cart__checkout" @click="checkout">{{ T("checkout") }} ›</button>
        </footer>
      </aside>
    </div>
  </transition>
</template>

<script lang="ts">
import { marketT } from "./i18n";
import CurrencyMixin from "@selldone/components-vue/mixin/currency/CurrencyMixin.ts";
import ProductMixin from "@selldone/components-vue/mixin/product/ProductMixin.ts";
import AuthMixin from "@selldone/components-vue/mixin/auth/AuthMixin.ts";
import { ShopOptionsHelper } from "@selldone/core-js/helper/shop/ShopOptionsHelper";

export default {
  name: "MarketCart",
  mixins: [CurrencyMixin, ProductMixin, AuthMixin],
  inject: ["$shop"],
  props: { modelValue: Boolean, rtl: Boolean, locale: String },
  emits: ["update:modelValue"],
  data: () => ({ busy: null as number | null }),
  computed: {
    baskets(): any[] {
      return (this.getBaskets() || []).filter((b: any) => b && b.items && b.items.length);
    },
    items(): any[] {
      const out: any[] = [];
      this.baskets.forEach((b: any) => b.items.forEach((item: any) => out.push({ basket: b, item })));
      return out;
    },
    total(): number {
      let sum = 0;
      this.baskets.forEach((b: any) => {
        if (b.bill && typeof b.bill.sum === "number") sum += b.bill.sum - (b.bill.items_discount || 0);
        else b.items.forEach((i: any) => (sum += this.lineTotal(i)));
      });
      return sum;
    },
  },
  methods: {
    T(k: any) {
      return marketT(this.locale, k);
    },
    variantLabel(v: any): string {
      if (!v) return "";
      return [v.volume, v.weight, v.pack, v.type, v.style].filter(Boolean).join(" · ");
    },
    lineTotal(item: any): number {
      try {
        if (item.product) return this.CalcPriceProductCurrentCurrency(this.$shop, item.product, item.variant) * item.count;
      } catch (e) {
        /* fall through */
      }
      return ((item.price || 0) - (item.dis || 0)) * item.count;
    },
    setCount(item: any, count: number) {
      if (!this.USER() && !ShopOptionsHelper.HasGuestCheckout(this.getShop())) {
        this.NeedLogin();
        return;
      }
      this.busy = item.id;
      const done = () => (this.busy = null);
      if (count <= 0) {
        this.RemoveFromBasket(item.product_id, item.variant_id || null, done, done);
        return;
      }
      this.AddToBasket(this.$shop.name, item.product || { id: item.product_id }, item.variant || null, count, done, done, item.preferences || null, item.vendor_product || null);
    },
    checkout() {
      const type = this.baskets[0]?.type || "PHYSICAL";
      this.$emit("update:modelValue", false);
      this.$router.push({ name: (window as any).$storefront.routes.BASKET_PAGE, params: { type } });
    },
  },
};
</script>

<style scoped>
.fm-cart-wrap {
  position: absolute;
  inset: 0;
  z-index: 9;
  background: rgba(20, 12, 6, 0.35);
}
.fm-cart {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: min(400px, 100%);
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #fffaf2, #f6ead6);
  color: #2b1d12;
  box-shadow: -20px 0 50px rgba(40, 20, 6, 0.35);
}
.fm-cart.rtl {
  right: auto;
  left: 0;
  box-shadow: 20px 0 50px rgba(40, 20, 6, 0.35);
}
.fm-cart__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 12px;
  border-bottom: 1px dashed rgba(120, 80, 40, 0.25);
}
.fm-cart__title {
  font-size: 20px;
  font-weight: 900;
}
.fm-cart__close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 0;
  background: rgba(60, 36, 16, 0.08);
  cursor: pointer;
}
.fm-cart__empty {
  padding: 48px 28px;
  text-align: center;
  color: #7a5a3a;
  line-height: 1.6;
}
.fm-cart__empty-icon {
  font-size: 34px;
  margin-bottom: 10px;
}
.fm-cart__list {
  list-style: none;
  margin: 0;
  padding: 8px 14px;
  overflow: auto;
  flex: 1;
}
.fm-cart__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 6px;
  border-bottom: 1px solid rgba(120, 80, 40, 0.12);
}
.fm-cart__item img {
  width: 54px;
  height: 54px;
  border-radius: 14px;
  object-fit: cover;
  background: #fff;
  box-shadow: 0 4px 10px rgba(60, 30, 10, 0.15);
}
.fm-cart__info {
  flex: 1;
  min-width: 0;
}
.fm-cart__name {
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fm-cart__variant {
  font-size: 12px;
  color: #8a6a4a;
}
.fm-cart__price {
  font-weight: 800;
  color: #1f6b3a;
  font-size: 14px;
}
.fm-cart__stepper {
  display: inline-flex;
  align-items: center;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 6px rgba(60, 30, 10, 0.12);
}
.fm-cart__stepper button {
  width: 32px;
  height: 34px;
  border: 0;
  background: none;
  font-size: 18px;
  cursor: pointer;
  color: #4a2e18;
}
.fm-cart__stepper span {
  min-width: 26px;
  text-align: center;
  font-weight: 900;
}
.fm-cart__foot {
  padding: 16px 20px 22px;
  border-top: 1px dashed rgba(120, 80, 40, 0.25);
}
.fm-cart__total {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-weight: 800;
  font-size: 18px;
  margin-bottom: 12px;
}
.fm-cart__checkout {
  width: 100%;
  height: 54px;
  border: 0;
  border-radius: 16px;
  background: linear-gradient(180deg, #3a9a5a, #237a42);
  color: #fff;
  font-weight: 900;
  font-size: 17px;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(35, 122, 66, 0.35);
}
.fm-cart-enter-active,
.fm-cart-leave-active {
  transition: opacity 0.25s ease;
}
.fm-cart-enter-active .fm-cart,
.fm-cart-leave-active .fm-cart {
  transition: transform 0.32s cubic-bezier(0.2, 0.9, 0.25, 1);
}
.fm-cart-enter-from,
.fm-cart-leave-to {
  opacity: 0;
}
.fm-cart-enter-from .fm-cart:not(.rtl),
.fm-cart-leave-to .fm-cart:not(.rtl) {
  transform: translateX(100%);
}
.fm-cart-enter-from .fm-cart.rtl,
.fm-cart-leave-to .fm-cart.rtl {
  transform: translateX(-100%);
}
</style>
