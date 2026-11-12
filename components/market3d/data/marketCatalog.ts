/*
 * Fresh Market 3D — catalog loader.
 * Turns any Selldone shop into market stalls: top-level categories → stalls, products → crates.
 * Uses only the official Storefront SDK (window.$storefront).
 */

export interface RawStall {
  id: string | number;
  title: string;
  name: string | null; // category slug used for routing / listing
  image: string | null;
  products: any[];
  total: number;
}

const PER_STALL = 8;
const MAX_STALLS = 12;

function sdk() {
  return (window as any).$storefront;
}

export async function loadMarketCatalog(shopTitle: string): Promise<RawStall[]> {
  const products = sdk().products;
  const home = await products.optimize(120).list(null, 0, 24, {
    categories_count: MAX_STALLS,
    with_total: true,
    sort: "most_popular",
  });
  const folders: any[] = (home.folders || []).slice(0, MAX_STALLS);
  const stalls: RawStall[] = [];

  const results = await Promise.all(
    folders.map((f) =>
      products
        .optimize(120)
        .list(f.name, 0, PER_STALL + 1, { with_total: true, products_only: true, sort: "most_popular" })
        .then((r: any) => ({ f, r }))
        .catch(() => ({ f, r: { products: [] } })),
    ),
  );
  for (const { f, r } of results) {
    const list = (r.products || []).filter((p: any) => p && p.id);
    if (!list.length) continue;
    stalls.push({
      id: f.id,
      title: f.title || f.name,
      name: f.name,
      image: f.icon || null,
      products: list.slice(0, PER_STALL),
      total: Math.max(r.total || 0, list.length),
    });
  }

  // Products that live in the root (no category) get their own stall(s).
  const root = (home.products || []).filter((p: any) => p && p.id && !stalls.some((s) => s.products.some((q) => q.id === p.id)));
  if (root.length && stalls.length < MAX_STALLS) {
    stalls.push({
      id: "root",
      title: shopTitle,
      name: null, // "+N more" opens the classic /shop listing
      image: null,
      products: root.slice(0, PER_STALL),
      total: home.total || root.length,
    });
  }
  return stalls;
}

/** Full product details (variants, stock…) for the inspection panel. */
export async function loadProductDetails(id: number): Promise<any> {
  const r = await sdk().products.optimize(60).get(id, { no_article: true });
  return r?.product || r;
}
