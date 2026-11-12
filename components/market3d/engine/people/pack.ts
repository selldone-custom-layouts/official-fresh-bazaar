/*
 * Fresh Market 3D — reader for the compact "FMP1" asset packs (avatars and motion-capture clips).
 * Layout: "FMP1" | u32 header bytes | JSON header | 4-byte aligned typed-array sections.
 * Built offline from the Microsoft Rocketbox library (MIT) by the converter in /catalog/people-pipeline.
 */

const TYPES: Record<string, any> = {
  Uint8Array,
  Int8Array,
  Uint16Array,
  Int16Array,
  Uint32Array,
  Float32Array,
};

export interface Pack {
  header: any;
  get<T extends ArrayBufferView = any>(name: string): T;
}

export function parsePack(buf: ArrayBuffer): Pack {
  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
  if (magic !== "FMP1") throw new Error("Not an FMP1 pack");
  const hlen = new DataView(buf).getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hlen)));
  const base = 8 + hlen;
  return {
    header,
    get(name: string) {
      const s = header.sections[name];
      if (!s) throw new Error("Missing section " + name);
      const Ctor = TYPES[s.type];
      return new Ctor(buf, base + s.offset, s.count);
    },
  };
}

export async function fetchPack(url: string, signal?: AbortSignal): Promise<Pack> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return parsePack(await res.arrayBuffer());
}
