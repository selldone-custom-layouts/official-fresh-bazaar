<!--
  🍎 Fresh Market 3D — a walkable, photoreal open-air market storefront for Selldone.

  Every top-level category becomes a stall, every product a crate of procedurally modelled produce.
  Shoppers walk around, inspect products in a studio turntable and add them to the real Selldone basket.
  Checkout, account, product pages and every other route stay the standard storefront.
-->
<template>
  <div class="fm3d" :class="{ 'is-inspecting': !!selected, rtl, ready }" :dir="rtl ? 'rtl' : 'ltr'">
    <div ref="stage" class="fm3d__stage"></div>
    <div class="fm3d__vignette"></div>

    <!-- ── Loader -->
    <transition name="fm-fade">
      <div v-if="!ready" class="fm3d__loader">
        <div class="fm3d__loader-card">
          <img v-if="shopLogo" :src="shopLogo" class="fm3d__loader-logo" alt="" />
          <div v-else class="fm3d__loader-emoji">🧺</div>
          <h1>{{ shopTitle }}</h1>
          <p>{{ T("market") }}</p>
          <div class="fm3d__bar"><span :style="{ width: Math.round(progress * 100) + '%' }"></span></div>
          <small>{{ progressLabel }}</small>
          <div v-if="error" class="fm3d__error">{{ error }}</div>
        </div>
      </div>
    </transition>

    <!-- ── Top bar -->
    <header class="fm3d__top">
      <router-link :to="{ name: shopRoute }" class="fm3d__brand" :title="T('classic')">
        <img v-if="shopLogo" :src="shopLogo" alt="" />
        <div>
          <b>{{ shopTitle }}</b>
          <small>{{ T("market") }}</small>
        </div>
      </router-link>

      <transition name="fm-fade">
        <div v-if="ready && currentStallTitle" :key="currentStallTitle" class="fm3d__now">{{ currentStallTitle }}</div>
      </transition>

      <div class="fm3d__actions">
        <button class="fm3d__btn" :title="muted ? T('sound_on') : T('sound_off')" :aria-label="T('sound_off')" @click="toggleSound">
          <svg v-if="!muted" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
        </button>
        <router-link :to="{ name: shopRoute }" class="fm3d__btn" :title="T('classic')" :aria-label="T('classic')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h4v4H4zm6 0h10v4H10zM4 11h4v4H4zm6 0h10v4H10zm-6 6h4v4H4zm6 0h10v4H10z" fill="currentColor" /></svg>
        </router-link>
        <button class="fm3d__btn" :title="USER() ? T('account') : T('login')" :aria-label="T('account')" @click="openAccount">
          <img v-if="userAvatar" :src="userAvatar" alt="" class="fm3d__avatar" />
          <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4.4 0-8 2.4-8 5.4V21h16v-1.6c0-3-3.6-5.4-8-5.4z" fill="currentColor" /></svg>
        </button>
        <button class="fm3d__btn fm3d__btn--cart" :class="{ bump: cartBump }" :aria-label="T('basket')" @click="cartOpen = true">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14l-1.4 9.2A2 2 0 0 1 15.6 20H8.4a2 2 0 0 1-2-1.8zM8.5 9 12 3.5 15.5 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /><path d="M9 12.5v4M12 12.5v4M15 12.5v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
          <span v-if="basketCount" class="fm3d__badge">{{ basketCount }}</span>
        </button>
      </div>
    </header>

    <!-- ── Hover tooltip -->
    <div
      v-if="hoverProduct && !selected"
      class="fm3d__tip"
      :style="{ left: hover.x + 'px', top: hover.y + 'px' }"
    >
      <b>{{ hoverProduct.title }}</b>
      <em v-if="hoverProduct.title_en && hoverProduct.title_en !== hoverProduct.title" dir="auto">{{ hoverProduct.title_en }}</em>
      <span>{{ hoverProduct.price }}<template v-if="hoverProduct.unit"> / {{ hoverProduct.unit }}</template></span>
      <small>{{ T("inspect") }}</small>
    </div>

    <!-- ── Historical figure hover label -->
    <div v-if="hoverFigure && !selected && !verse" class="fm3d__tip fm3d__tip--figure" :style="{ left: hover.x + 'px', top: hover.y + 'px' }">
      <b dir="rtl">{{ hoverFigure.name.fa }}</b>
      <em>{{ hoverFigure.name.en }}</em>
      <small>{{ T("listen") }}</small>
    </div>

    <!-- ── Verse card: a historical figure recites -->
    <transition name="fm-verse">
      <div v-if="verse && verseFigure" class="fm3d__verse" :class="{ poem: verseItem.kind === 'poem' }" @pointerdown.stop>
        <button class="fm3d__verse-x" :aria-label="T('back')" @click="closeVerse">×</button>
        <div class="fm3d__verse-who">
          <b dir="rtl">{{ verseFigure.name.fa }}</b>
          <span>{{ verseFigure.name.en }}</span>
          <small :dir="locale === 'fa' ? 'rtl' : 'ltr'">{{ locale === "fa" ? verseFigure.epithet.fa : verseFigure.epithet.en }}</small>
        </div>
        <div class="fm3d__verse-fa" dir="rtl">
          <p v-for="(l, i) in verseItem.fa" :key="'fa' + i" :class="{ on: i <= verse.line }">{{ l }}</p>
        </div>
        <div v-if="locale !== 'fa'" class="fm3d__verse-en">
          <p v-for="(l, i) in verseItem.en" :key="'en' + i" :class="{ on: i <= verse.line }">{{ l }}</p>
        </div>
        <div class="fm3d__verse-foot">
          <span :dir="locale === 'fa' ? 'rtl' : 'ltr'">{{ locale === "fa" ? verseItem.source.fa : verseItem.source.en }}</span>
          <button @click="openVerse(verse.id, true)">{{ T("another") }} ›</button>
        </div>
      </div>
    </transition>

    <!-- ── Stall navigator -->
    <nav v-if="ready && stalls.length" class="fm3d__stalls" :aria-label="T('stalls')">
      <button
        v-for="(s, i) in stalls"
        :key="s.id"
        class="fm3d__stall"
        :class="{ active: i === currentStall }"
        @click="goStall(i)"
      >
        <img v-if="s.image" :src="s.image" alt="" />
        <span v-else class="fm3d__stall-dot" :style="{ background: stallColor(i) }"></span>
        {{ s.title }}
      </button>
    </nav>

    <!-- ── Hint -->
    <transition name="fm-fade">
      <div v-if="ready && showHint && !selected" class="fm3d__hint">{{ isTouch ? T("hint_touch") : T("hint_desktop") }}</div>
    </transition>

    <div v-if="ready && !stalls.length" class="fm3d__empty">{{ T("no_products") }}</div>

    <market-joystick v-if="ready && isTouch && !selected" @move="onJoystick" />

    <!-- ── Inspection -->
    <div ref="showcase" class="fm3d__showcase" v-show="selected"></div>
    <button v-if="selected" class="fm3d__back" @click="closeProduct">‹ {{ T("back") }}</button>
    <market-product-panel
      v-if="selected"
      :product="selected.raw"
      :stall-title="selectedStallTitle"
      :rtl="rtl"
      :locale="locale"
      @close="closeProduct"
      @added="onAdded"
    />

    <transition name="fm-toast">
      <div v-if="toast" class="fm3d__toast">✓ {{ toast }}</div>
    </transition>

    <market-cart v-model="cartOpen" :rtl="rtl" :locale="locale" />
  </div>
</template>

<script lang="ts">
import { markRaw } from "vue";
import CurrencyMixin from "@selldone/components-vue/mixin/currency/CurrencyMixin.ts";
import ProductMixin from "@selldone/components-vue/mixin/product/ProductMixin.ts";
import MarketProductPanel from "../../components/market3d/MarketProductPanel.vue";
import MarketCart from "../../components/market3d/MarketCart.vue";
import MarketJoystick from "../../components/market3d/MarketJoystick.vue";
import { figureById } from "../../components/market3d/data/figures";
import { marketT } from "../../components/market3d/i18n";
import { loadMarketCatalog, RawStall } from "../../components/market3d/data/marketCatalog";
import { AWNING_PALETTE } from "../../components/market3d/engine/market/stall";

/**
 * The engine survives page re-mounts (the storefront re-keys the app while it boots, and shoppers
 * come back from product / basket pages): it is paused and re-attached instead of rebuilt.
 */
let keep: { engine: any; raw: RawStall[]; stalls: any[]; timer: any; key: string } | null = null;
const KEEP_MS = 15 * 60 * 1000;

export default {
  name: "StorefrontPageMarket3D",
  mixins: [CurrencyMixin, ProductMixin],
  inject: ["$shop"],
  components: { MarketProductPanel, MarketCart, MarketJoystick },
  props: { shop: Object },
  data: () => ({
    ready: false,
    progress: 0,
    progressLabel: "",
    error: null as string | null,
    raw: [] as RawStall[],
    stalls: [] as any[],
    currentStall: -1,
    hover: null as any,
    selected: null as any,
    cartOpen: false,
    cartBump: false,
    toast: null as string | null,
    verse: null as null | { id: string; index: number; line: number },
    verseTimers: [] as any[],
    verseCount: {} as Record<string, number>,
    showHint: true,
    isTouch: false,
    engine: null as any,
    showcase: null as any,
    prevHeaderMode: null as any,
    unmounted: false,
    muted: false,
  }),
  computed: {
    locale(): string {
      return (this.$i18n && (this.$i18n.locale as any)) || "en";
    },
    rtl(): boolean {
      return !!(this.$vuetify && this.$vuetify.locale && this.$vuetify.locale.isRtl);
    },
    shopTitle(): string {
      return this.$shop?.title || this.$shop?.name || "";
    },
    shopLogo(): string | null {
      return this.$shop?.icon ? this.getShopImagePath(this.$shop.icon, 128) : null;
    },
    userAvatar(): string | null {
      const u: any = this.USER();
      return u && u.id ? this.getUserAvatar?.(u.id) || null : null;
    },
    basketCount(): number {
      return this.getTotalItemInBaskets();
    },
    shopRoute(): string {
      return (window as any).$storefront.routes.SHOP_PAGE;
    },
    currentStallTitle(): string {
      return this.stalls[this.currentStall]?.title || "";
    },
    hoverFigure(): any {
      if (!this.hover || this.hover.type !== "figure") return null;
      return figureById(this.hover.figureId);
    },
    verseFigure(): any {
      return this.verse ? figureById(this.verse.id) : null;
    },
    verseItem(): any {
      return this.verseFigure ? this.verseFigure.verses[this.verse!.index % this.verseFigure.verses.length] : null;
    },
    hoverProduct(): any {
      if (!this.hover || this.hover.type !== "product") return null;
      return this.findProduct(this.hover.productId, this.hover.stallIndex);
    },
    selectedStallTitle(): string {
      return this.selected ? this.stalls[this.selected.stallIndex]?.title || "" : "";
    },
    currencyKey(): string {
      return JSON.stringify(this.$store.getters.getUserCurrency || null);
    },
  },
  watch: {
    currencyKey() {
      if (!this.engine || !this.raw.length) return;
      this.stalls = this.mapStalls(this.raw);
      this.stalls.forEach((s: any, i: number) => this.engine.updateProducts(i, s.products));
    },
  },
  created() {
    try {
      this.muted = localStorage.getItem("fm3d-muted") === "1";
    } catch (e) {
      /* storage unavailable */
    }
    this.isTouch = window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window;
  },
  async mounted() {
    // Full-screen immersive page: hide the regular header / bottom navigation while we are here.
    this.prevHeaderMode = this.$store.getters.getGlobalStyle?.header_mode ?? null;
    this.$store.commit("setGlobalStyle", { header_mode: "hidden" });
    this.$store.commit("setForceHideNavigation", true);
    window.addEventListener("keydown", this.onKey);

    if (!this.hasWebGL()) {
      this.error = this.T("webgl");
      setTimeout(() => this.$router.replace({ name: this.shopRoute }), 1800);
      return;
    }

    this.progressLabel = this.T("loading");
    const key = `${this.$shop?.id}|${this.locale}|${window.location.search}`;
    if (keep && keep.key === key && !keep.engine.isDisposed) {
      clearTimeout(keep.timer);
      this.engine = keep.engine;
      this.raw = keep.raw;
      this.stalls = keep.stalls;
      keep = null;
      this.engine.attach(this.$refs.stage as HTMLElement, this.engineEvents());
      if (this.engine.ready) {
        this.ready = true;
        this.showHint = false;
      }
      if ((import.meta as any).env?.DEV) (window as any).__fm3d = this;
      return;
    }
    if (keep) {
      clearTimeout(keep.timer);
      keep.engine.dispose();
      keep = null;
    }
    try {
      const { MarketEngine } = await import("../../components/market3d/engine/MarketEngine");
      const raw = await this.loadData();
      if (this.unmounted || !this.$refs.stage) return; // page left (or app re-keyed) while loading
      this.raw = raw;
      this.stalls = this.mapStalls(raw);
      const engine = markRaw(new MarketEngine(this.$refs.stage as HTMLElement, this.engineEvents()));
      this.engine = engine;
      engine.setMuted(this.muted);
      if ((import.meta as any).env?.DEV) (window as any).__fm3d = this; // dev-only QA hook
      await engine.build(this.stalls.map((s: any) => ({ id: s.id, title: s.title, image: s.image, products: s.products, more: s.more, dir: this.rtl ? "rtl" : "ltr" })), { shopTitle: this.shopTitle, rtl: this.rtl });
    } catch (e: any) {
      console.error("Fresh Market 3D failed", e);
      this.error = e?.message || String(e);
    }
  },
  beforeUnmount() {
    this.unmounted = true;
    this.stopVerse();
    window.removeEventListener("keydown", this.onKey);
    this.$store.commit("setGlobalStyle", { header_mode: this.prevHeaderMode });
    this.$store.commit("setForceHideNavigation", false);
    this.showcase?.dispose();
    if (this.engine && !this.engine.isDisposed) {
      // keep the built market for a while instead of rebuilding it on the next visit
      this.engine.pause();
      const engine = this.engine;
      keep = {
        engine,
        raw: this.raw,
        stalls: this.stalls,
        key: `${this.$shop?.id}|${this.locale}|${window.location.search}`,
        timer: setTimeout(() => {
          engine.dispose();
          if (keep && keep.engine === engine) keep = null;
        }, KEEP_MS),
      };
    }
  },
  methods: {
    T(k: any) {
      return marketT(this.locale, k);
    },
    toggleSound() {
      this.muted = !this.muted;
      try {
        localStorage.setItem("fm3d-muted", this.muted ? "1" : "0");
      } catch (e) {
        /* storage unavailable */
      }
      this.engine?.startSound();
      this.engine?.setMuted(this.muted);
    },
    engineEvents() {
      return {
        onProgress: (p: number, label: string) => {
          this.progress = p;
          this.progressLabel = label === "sky" ? this.T("loading_sky") : label === "plaza" ? this.T("loading_plaza") : label === "bazaar" ? this.T("loading_bazaar") : label === "ready" ? this.T("ready") : `${this.T("loading")} · ${label}`;
        },
        onReady: () => {
          this.ready = true;
          setTimeout(() => (this.showHint = false), 9000);
        },
        onHover: (h: any) => (this.hover = h),
        onSelect: (productId: number, stallIndex: number) => this.openProduct(productId, stallIndex),
        onStallFocus: (i: number) => (this.currentStall = i),
        onMore: (i: number) => this.openCategory(i),
        onFirstMove: () => setTimeout(() => (this.showHint = false), 2500),
        onFigure: (id: string) => this.openVerse(id),
      };
    },
    /** A historical figure recites: the card reveals line by line, read aloud when a voice exists. */
    openVerse(id: string, next = false) {
      const fig = figureById(id);
      if (!fig) return;
      this.stopVerse();
      const n = this.verseCount[id] ?? 0;
      const index = next || this.verse?.id === id ? n : n;
      this.verseCount = { ...this.verseCount, [id]: n + 1 };
      this.verse = { id, index, line: -1 };
      const item = fig.verses[index % fig.verses.length];
      const spoken = this.speakVerse(item);
      const per = item.kind === "poem" ? 3.1 : 2.6;
      const total = item.fa.length * per + 1.2;
      this.engine?.figureSpeak(id, spoken ? total + 2 : total);
      if (!spoken) item.fa.forEach((_: string, i: number) => this.verseTimers.push(setTimeout(() => this.verse && (this.verse.line = i), 500 + i * per * 1000)));
      this.verseTimers.push(setTimeout(() => this.closeVerse(), (total + 9) * 1000));
    },
    speakVerse(item: any): boolean {
      try {
        const synth = window.speechSynthesis;
        if (!synth || this.muted) return false;
        const voices = synth.getVoices();
        const fa = voices.find((v) => /^fa/i.test(v.lang));
        const en = voices.find((v) => /^en/i.test(v.lang) && /male|david|guy|ryan|george|daniel|christopher|eric/i.test(v.name)) || voices.find((v) => /^en/i.test(v.lang));
        const voice = fa || en;
        if (!voice) return false;
        const lines: string[] = fa ? item.fa : item.en;
        lines.forEach((l, i) => {
          const u = new SpeechSynthesisUtterance(l);
          u.voice = voice;
          u.lang = voice.lang;
          u.rate = fa ? 0.8 : 0.86;
          u.pitch = 0.78;
          u.onstart = () => this.verse && (this.verse.line = i);
          synth.speak(u);
        });
        return true;
      } catch (e) {
        return false;
      }
    },
    stopVerse() {
      this.verseTimers.forEach((t: any) => clearTimeout(t));
      this.verseTimers = [];
      try {
        window.speechSynthesis?.cancel();
      } catch (e) {
        /* no speech */
      }
    },
    closeVerse() {
      if (this.verse) this.engine?.figureHush(this.verse.id);
      this.stopVerse();
      this.verse = null;
    },
    hasWebGL(): boolean {
      try {
        const c = document.createElement("canvas");
        return !!(c.getContext("webgl2") || c.getContext("webgl"));
      } catch (e) {
        return false;
      }
    },
    async loadData(): Promise<RawStall[]> {
      if ((import.meta as any).env?.DEV && /[?&]market-demo/.test(window.location.search)) {
        const { demoCatalog } = await import("../../components/market3d/data/demoCatalog");
        return demoCatalog();
      }
      return loadMarketCatalog(this.shopTitle);
    },
    formatPrice(amount: number | null): string {
      if (amount === null || amount === undefined || isNaN(amount as any)) return "";
      const code = this.GetUserSelectedCurrency()?.code;
      try {
        return this.getFormatPriceCurrency(amount, code);
      } catch (e) {
        return `${this.FormatNumberCurrency(amount, code)} ${this.GetUserSelectedCurrencyName(code, true)}`;
      }
    },
    mapStalls(raw: RawStall[]) {
      return raw.map((s) => ({
        id: s.id,
        name: s.name,
        title: s.title,
        image: s.image ? (/^https?:/.test(s.image) ? s.image : this.getShopImagePath(s.image, 128)) : null,
        more: Math.max(0, (s.total || 0) - s.products.length),
        products: s.products.map((p: any) => {
          let price: number | null = null;
          let old: number | null = null;
          try {
            price = p.__demoPrice ?? this.CalcPriceProductCurrentCurrency(this.$shop, p, null);
            const d = p.__demoPrice ? 0 : this.getProductDiscountAmount(this.$shop, p, null);
            old = d > 0 ? (price as number) + d : null;
          } catch (e) {
            price = p.price ?? null;
          }
          return {
            id: p.id,
            title: p.title || p.title_en || "",
            title_en: p.title_en,
            price: this.formatPrice(price),
            oldPrice: old ? this.formatPrice(old) : null,
            unit: p.unit || null,
            soldOut: p.type === "PHYSICAL" && p.quantity !== undefined && p.quantity !== null && Number(p.quantity) <= 0,
            kind: p.__kind || null,
            image: p.icon ? this.getShopImagePath(p.icon) : null, // original size
            thumb: p.icon ? this.getShopImagePath(p.icon, 128) : null, // always generated by the CDN
            raw: p,
          };
        }),
      }));
    },
    findProduct(id: number, stallIndex?: number) {
      const list = stallIndex != null && this.stalls[stallIndex] ? [this.stalls[stallIndex]] : this.stalls;
      for (const s of list) {
        const p = s.products.find((x: any) => x.id === id);
        if (p) return p;
      }
      return null;
    },
    stallColor(i: number) {
      return AWNING_PALETTE[i % AWNING_PALETTE.length][0];
    },
    goStall(i: number) {
      if (this.selected) this.closeProduct(false);
      this.engine?.focusStall(i);
      this.showHint = false;
    },
    async openProduct(productId: number, stallIndex: number) {
      const p = this.findProduct(productId, stallIndex);
      if (!p) return;
      this.selected = { ...p, stallIndex };
      this.hover = null;
      this.engine?.setInputEnabled(false);
      this.showHint = false;
      await this.$nextTick();
      if (!this.showcase) {
        const { Showcase } = await import("../../components/market3d/engine/Showcase");
        this.showcase = markRaw(new Showcase(this.$refs.showcase as HTMLElement));
      }
      const { detectKind } = await import("../../components/market3d/engine/produce/catalog");
      this.showcase.resize();
      this.showcase.show(p.kind || detectKind(p.raw, this.stalls[stallIndex]?.title), p.image, p.thumb);
    },
    closeProduct(back = true) {
      this.selected = null;
      this.showcase?.stop();
      this.engine?.setInputEnabled(true);
      if (back) this.engine?.backToStall();
    },
    onAdded({ product }: any) {
      this.engine?.hop(product.id);
      this.toast = this.T("added");
      this.cartBump = true;
      setTimeout(() => (this.cartBump = false), 700);
      setTimeout(() => (this.toast = null), 2200);
    },
    openCategory(i: number) {
      const s = this.stalls[i];
      if (s?.name) this.$router.push({ name: (window as any).$storefront.routes.SHOP_CATEGORY_PAGE, params: { category_name: s.name } });
      else this.$router.push({ name: this.shopRoute });
    },
    openAccount() {
      const routes = (window as any).$storefront.routes;
      if (this.USER()) this.$router.push({ name: routes.ORDERS_PAGE || routes.USER_PROFILE_PAGE });
      else this.$router.push({ name: routes.SHOP_LOGIN_PAGE });
    },
    onJoystick({ x, y }: any) {
      this.engine?.setMove(x, y);
    },
    onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (this.cartOpen) this.cartOpen = false;
        else if (this.selected) this.closeProduct();
      }
    },
  },
};
</script>

<style scoped>
.fm3d {
  position: fixed;
  inset: 0;
  z-index: 5;
  overflow: hidden;
  background: #d9b48e;
  color: #fff;
  font-feature-settings: "tnum";
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}
.fm3d__stage {
  position: absolute;
  inset: 0;
  transition: filter 0.5s ease, transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.fm3d.is-inspecting .fm3d__stage {
  filter: blur(7px) brightness(0.72) saturate(0.95);
  transform: scale(1.04);
}
.fm3d__vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 55%, transparent 55%, rgba(30, 14, 4, 0.38) 100%);
}

/* loader */
.fm3d__loader {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'><g fill='none' stroke='%23fff3dc' stroke-opacity='0.16' stroke-width='1.4'><path d='M36 6l8.5 21.5L66 36l-21.5 8.5L36 66l-8.5-21.5L6 36l21.5-8.5z'/><path d='M36 18l5 13 13 5-13 5-5 13-5-13-13-5 13-5z'/><circle cx='36' cy='36' r='4'/><path d='M0 0l12 12M72 0L60 12M0 72l12-12M72 72L60 60'/></g></svg>") center / 72px 72px repeat,
    radial-gradient(ellipse at 50% 30%, #ffd9a6 0%, #e89b5a 45%, #7a3d1c 100%);
}
.fm3d__loader-card {
  text-align: center;
  color: #fff8ee;
  padding: 24px;
  max-width: 420px;
}
.fm3d__loader-logo {
  width: 92px;
  height: 92px;
  border-radius: 26px;
  object-fit: cover;
  box-shadow: 0 16px 40px rgba(80, 30, 0, 0.45);
  background: #fff;
}
.fm3d__loader-emoji {
  font-size: 64px;
  filter: drop-shadow(0 10px 20px rgba(80, 30, 0, 0.4));
}
.fm3d__loader h1 {
  margin: 18px 0 2px;
  font-size: 34px;
  font-weight: 900;
  letter-spacing: -0.01em;
  text-shadow: 0 4px 18px rgba(80, 30, 0, 0.35);
}
.fm3d__loader p {
  margin: 0 0 22px;
  opacity: 0.85;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-size: 12px;
}
.fm3d__bar {
  height: 6px;
  width: 260px;
  margin: 0 auto 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.25);
  overflow: hidden;
}
.fm3d__bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #3cc0c8, #1a8f9a 60%, #f2c84a);
  transition: width 0.35s ease;
}
.fm3d__loader small {
  opacity: 0.85;
  font-size: 13px;
}
.fm3d__error {
  margin-top: 16px;
  background: rgba(60, 10, 0, 0.35);
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
}

/* top bar */
.fm3d__top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 7;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  pointer-events: none;
}
.fm3d__top > * {
  pointer-events: auto;
}
.fm3d__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px 6px 6px;
  border-radius: 999px;
  color: #fff;
  text-decoration: none;
  background: rgba(36, 20, 8, 0.38);
  border: 1px solid rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 8px 24px rgba(30, 14, 4, 0.25);
  max-width: 46vw;
}
.fm3d.rtl .fm3d__brand {
  padding: 6px 6px 6px 14px;
}
.fm3d__brand img {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  object-fit: cover;
  background: #fff;
}
.fm3d__brand b {
  display: block;
  font-size: 15px;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fm3d__brand small {
  display: block;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.8;
}
.fm3d__now {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  padding: 9px 18px;
  border-radius: 999px;
  font-weight: 800;
  font-size: 15px;
  color: #3a2410;
  background: rgba(255, 246, 230, 0.86);
  box-shadow: 0 8px 22px rgba(30, 14, 4, 0.22);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  white-space: nowrap;
}
.fm3d__actions {
  display: flex;
  gap: 10px;
}
.fm3d__btn {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(36, 20, 8, 0.38);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 8px 24px rgba(30, 14, 4, 0.25);
  transition: transform 0.15s ease, background 0.15s ease;
  text-decoration: none;
}
.fm3d__btn:hover {
  background: rgba(36, 20, 8, 0.55);
  transform: translateY(-1px);
}
.fm3d__btn svg {
  width: 22px;
  height: 22px;
}
.fm3d__btn--cart {
  background: linear-gradient(180deg, #3a9a5a, #237a42);
  border-color: rgba(255, 255, 255, 0.35);
}
.fm3d__btn--cart:hover {
  background: linear-gradient(180deg, #44a866, #26864a);
}
.fm3d__btn--cart.bump {
  animation: fm-bump 0.6s cubic-bezier(0.3, 1.6, 0.4, 1);
}
@keyframes fm-bump {
  30% {
    transform: scale(1.25) rotate(-8deg);
  }
  60% {
    transform: scale(0.95) rotate(4deg);
  }
}
.fm3d__badge {
  position: absolute;
  top: -4px;
  inset-inline-end: -4px;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: #ffcf4a;
  color: #3a2410;
  font-weight: 900;
  font-size: 12px;
  display: grid;
  place-items: center;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.25);
}
.fm3d__avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

/* tooltip */
.fm3d__tip {
  position: absolute;
  z-index: 6;
  pointer-events: none;
  transform: translate(16px, 16px);
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(255, 249, 240, 0.94);
  color: #2b1a0e;
  box-shadow: 0 12px 30px rgba(30, 14, 4, 0.3);
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 140px;
}
.fm3d.rtl .fm3d__tip {
  transform: translate(calc(-100% - 16px), 16px);
}
.fm3d__tip b {
  font-size: 15px;
}
.fm3d__tip--figure b {
  font-size: 17px;
}

/* verse card — a historical figure recites */
.fm3d__verse {
  position: absolute;
  z-index: 9;
  left: 50%;
  bottom: 92px;
  transform: translateX(-50%);
  width: min(560px, calc(100% - 32px));
  padding: 18px 22px 14px;
  border-radius: 20px;
  color: #f6ecd6;
  background: radial-gradient(120% 140% at 50% 0%, rgba(46, 34, 20, 0.92), rgba(18, 13, 8, 0.94));
  border: 1px solid rgba(218, 176, 92, 0.55);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45), inset 0 0 0 4px rgba(218, 176, 92, 0.08);
  backdrop-filter: blur(6px);
}
.fm3d__verse::before,
.fm3d__verse::after {
  content: "۞";
  position: absolute;
  top: 10px;
  color: rgba(218, 176, 92, 0.6);
  font-size: 16px;
}
.fm3d__verse::before {
  left: 14px;
}
.fm3d__verse::after {
  right: 44px;
}
.fm3d__verse-x {
  position: absolute;
  top: 8px;
  right: 12px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: #f6ecd6;
  font-size: 20px;
  line-height: 26px;
  background: rgba(255, 255, 255, 0.08);
}
.fm3d__verse-who {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  margin-bottom: 12px;
  text-align: center;
}
.fm3d__verse-who b {
  font-size: 19px;
  color: #e9c46a;
}
.fm3d__verse-who span {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.8;
}
.fm3d__verse-who small {
  font-size: 11.5px;
  opacity: 0.62;
}
.fm3d__verse-fa {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px 26px;
  font-family: "IranNastaliq", "Noto Nastaliq Urdu", "Vazirmatn", "B Nazanin", Tahoma, serif;
  font-size: 22px;
  line-height: 1.9;
  text-align: center;
}
.fm3d__verse.poem .fm3d__verse-fa {
  grid-template-columns: 1fr 1fr;
}
.fm3d__verse-fa p,
.fm3d__verse-en p {
  margin: 0;
  opacity: 0.18;
  transform: translateY(4px);
  transition: opacity 0.9s ease, transform 0.9s ease;
}
.fm3d__verse-fa p.on,
.fm3d__verse-en p.on {
  opacity: 1;
  transform: none;
}
.fm3d__verse-en {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(218, 176, 92, 0.25);
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-size: 14px;
  line-height: 1.55;
  text-align: center;
  color: rgba(246, 236, 214, 0.86);
}
.fm3d__verse-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  font-size: 11.5px;
  color: rgba(233, 196, 106, 0.8);
}
.fm3d__verse-foot button {
  color: #e9c46a;
  font-weight: 700;
  font-size: 12.5px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(233, 196, 106, 0.12);
}
.fm-verse-enter-active,
.fm-verse-leave-active {
  transition: opacity 0.45s ease, transform 0.45s ease;
}
.fm-verse-enter-from,
.fm-verse-leave-to {
  opacity: 0;
  transform: translate(-50%, 18px);
}
@media (max-width: 760px) {
  .fm3d__verse.poem .fm3d__verse-fa {
    grid-template-columns: 1fr;
    gap: 0;
    line-height: 1.75;
  }
  .fm3d__verse-fa {
    font-size: 19px;
  }
}
@media (max-width: 600px) {
  .fm3d__verse {
    bottom: 84px;
    padding: 16px 14px 12px;
  }
  .fm3d__verse-fa {
    font-size: 17px;
  }
}
.fm3d__tip em {
  font-style: normal;
  font-weight: 700;
  color: #1a8f9a;
  font-size: 13px;
}
.fm3d__tip span {
  font-weight: 900;
  color: #1f6b3a;
}
.fm3d__tip small {
  color: #9a6a3a;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* stall navigator */
.fm3d__stalls {
  position: absolute;
  z-index: 6;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  max-width: calc(100% - 32px);
  display: flex;
  gap: 8px;
  padding: 8px;
  border-radius: 20px;
  overflow-x: auto;
  scrollbar-width: none;
  background: rgba(36, 20, 8, 0.36);
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 14px 36px rgba(30, 14, 4, 0.3);
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.fm3d__stalls::-webkit-scrollbar {
  display: none;
}
.fm3d.is-inspecting .fm3d__stalls {
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 20px);
}
.fm3d__stall {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px 7px 7px;
  border-radius: 14px;
  border: 0;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s ease, color 0.2s ease;
}
.fm3d.rtl .fm3d__stall {
  padding: 7px 7px 7px 14px;
}
.fm3d__stall img {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  object-fit: cover;
  background: #fff;
}
.fm3d__stall-dot {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.5);
}
.fm3d__stall:hover {
  background: rgba(255, 255, 255, 0.22);
}
.fm3d__stall.active {
  background: #fff6e6;
  color: #3a2410;
}

/* hint & misc */
.fm3d__hint {
  position: absolute;
  z-index: 6;
  left: 50%;
  bottom: 96px;
  transform: translateX(-50%);
  padding: 10px 18px;
  border-radius: 999px;
  background: rgba(20, 10, 2, 0.55);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  pointer-events: none;
}
.fm3d__empty {
  position: absolute;
  z-index: 6;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  padding: 18px 24px;
  border-radius: 18px;
  background: rgba(255, 249, 240, 0.94);
  color: #3a2410;
  font-weight: 700;
}
.fm3d__showcase {
  position: absolute;
  z-index: 7;
  top: 70px;
  bottom: 0;
  left: 0;
  right: 420px;
}
.fm3d.rtl .fm3d__showcase {
  right: 0;
  left: 420px;
}
.fm3d__back {
  position: absolute;
  z-index: 8;
  top: 84px;
  inset-inline-start: 22px;
  padding: 10px 16px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(36, 20, 8, 0.45);
  color: #fff;
  font-weight: 800;
  cursor: pointer;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.fm3d__toast {
  position: absolute;
  z-index: 10;
  left: 50%;
  top: 84px;
  transform: translateX(-50%);
  padding: 12px 20px;
  border-radius: 999px;
  background: #237a42;
  color: #fff;
  font-weight: 800;
  box-shadow: 0 12px 30px rgba(20, 60, 30, 0.4);
}
.fm-toast-enter-active,
.fm-toast-leave-active {
  transition: all 0.3s cubic-bezier(0.3, 1.4, 0.5, 1);
}
.fm-toast-enter-from,
.fm-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -16px);
}
.fm-fade-enter-active,
.fm-fade-leave-active {
  transition: opacity 0.6s ease;
}
.fm-fade-enter-from,
.fm-fade-leave-to {
  opacity: 0;
}

@media (max-width: 760px) {
  .fm3d__top {
    padding: 10px 12px;
  }
  .fm3d__brand small {
    display: none;
  }
  .fm3d__now {
    top: 70px;
    font-size: 13px;
    padding: 7px 14px;
  }
  .fm3d__btn {
    width: 40px;
    height: 40px;
  }
  .fm3d__btn svg {
    width: 19px;
    height: 19px;
  }
  .fm3d__actions {
    gap: 6px;
  }
  .fm3d__brand {
    max-width: 38vw;
    padding: 4px 10px 4px 4px;
    gap: 7px;
  }
  .fm3d__brand img {
    width: 32px;
    height: 32px;
  }
  .fm3d__brand b {
    font-size: 13px;
  }
  .fm3d__stalls {
    bottom: 12px;
    border-radius: 16px;
  }
  .fm3d__stall {
    font-size: 13px;
  }
  .fm3d__hint {
    bottom: 240px;
    white-space: normal;
    width: calc(100% - 48px);
    text-align: center;
    border-radius: 16px;
  }
  .fm3d__showcase,
  .fm3d.rtl .fm3d__showcase {
    top: 60px;
    left: 0;
    right: 0;
    bottom: 56%;
  }
  .fm3d__back {
    top: 66px;
  }
}
</style>
