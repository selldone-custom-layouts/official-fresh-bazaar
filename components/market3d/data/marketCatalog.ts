/*
 * Fresh Market 3D — catalog loader.
 * Turns any Selldone shop into market stalls using only the official Storefront SDK (window.$storefront):
 *   top-level categories → stalls, every product → a crate.
 * Nothing is hard-coded: categories, titles, images, prices, units, stock and variants all come from the
 * shop. Every product of every category is loaded (paged); a category with more products than one stall
 * holds is spread over neighbouring stalls under the same sign, like a big merchant in a real bazaar.
 */

export interface RawStall {
  id: string | number;
  title: string;
  name: string | null; // category slug used for routing / listing
  image: string | null;
  products: any[];
  total: number;
  /** 1-based part number when a category spans several stalls */
  part: number;
  parts: number;
}

/** crates on one stall */
export const PER_STALL = 8;
/** stalls the plaza ring can hold before the last ones show "+N more" (opens the classic listing) */
const MAX_STALLS = 24;
const PAGE = 48;
const MAX_PER_CATEGORY = 240;

function sdk() {
  return (window as any).$storefront;
}

/** Every product of a category (or of the shop root when `name` is null), page by page. */
async function listAll(name: string | null): Promise<{ products: any[]; total: number; folders: any[] }> {
  const products = sdk().products;
  const out: any[] = [];
  const seen = new Set<number>();
  let total = 0;
  let folders: any[] = [];
  for (let offset = 0; offset < MAX_PER_CATEGORY; offset += PAGE) {
    const r = await products.optimize(120).list(name, offset, PAGE, {
      with_total: true,
      products_only: name !== null,
      categories_count: name === null && offset === 0 ? 60 : undefined,
      sort: "most_popular",
    });
    if (offset === 0) folders = r.folders || [];
    const list = (r.products || []).filter((p: any) => p && p.id && !seen.has(p.id));
    list.forEach((p: any) => seen.add(p.id));
    out.push(...list);
    total = Math.max(total, Number(r.total) || 0);
    if (!list.length || (r.products || []).length < PAGE || (total && out.length >= total)) break;
  }
  return { products: out, total: Math.max(total, out.length), folders };
}

export async function loadMarketCatalog(shopTitle: string): Promise<RawStall[]> {
  const home = await listAll(null);
  const cats = await Promise.all(
    home.folders.map((f: any) =>
      listAll(f.name)
        .then((r) => ({ f, ...r }))
        .catch(() => ({ f, products: [] as any[], total: 0, folders: [] })),
    ),
  );
  const groups: Array<{ id: any; title: string; name: string | null; image: string | null; products: any[]; total: number }> = cats
    .filter((c) => c.products.length)
    .map((c) => ({ id: c.f.id, title: c.f.title || c.f.name, name: c.f.name, image: c.f.icon || null, products: c.products, total: c.total }));

  // products that live in the shop root (no category) get a stall of their own
  const inCats = new Set(groups.flatMap((g) => g.products.map((p) => p.id)));
  const root = home.products.filter((p) => !inCats.has(p.id));
  if (root.length) groups.push({ id: "root", title: shopTitle, name: null, image: null, products: root, total: root.length });

  // share the ring: one stall per category first, then extra stalls for big categories while room remains
  const want = groups.map((g) => Math.max(1, Math.ceil(g.products.length / PER_STALL)));
  const give: number[] = groups.map(() => (groups.length <= MAX_STALLS ? 1 : 0));
  let free = MAX_STALLS - give.reduce((a, b) => a + b, 0);
  for (let round = 1; free > 0 && round < 64; round++) {
    let grew = false;
    for (let i = 0; i < groups.length && free > 0; i++)
      if (give[i] < want[i] && (give[i] > 0 || groups.length > MAX_STALLS)) {
        give[i]++;
        free--;
        grew = true;
      }
    if (!grew) break;
  }

  const stalls: RawStall[] = [];
  groups.forEach((g, i) => {
    const parts = give[i];
    for (let k = 0; k < parts; k++) {
      const products = g.products.slice(k * PER_STALL, (k + 1) * PER_STALL);
      if (!products.length) break;
      const last = k === parts - 1;
      stalls.push({
        id: parts > 1 ? `${g.id}-${k + 1}` : g.id,
        title: g.title,
        name: g.name,
        image: g.image,
        products,
        // only the last stall of a category points at what could not be shown
        total: last ? products.length + Math.max(0, g.total - (k + 1) * PER_STALL) : products.length,
        part: k + 1,
        parts,
      });
    }
  });
  return stalls;
}

/** Full product details for the inspection panel: description, gallery, specs, variants, stock… */
export async function loadProductDetails(id: number): Promise<any> {
  const r = await sdk().products.optimize(60).get(id, {});
  return r?.product || r;
}
