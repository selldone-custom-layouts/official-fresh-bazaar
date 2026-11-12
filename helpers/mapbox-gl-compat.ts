/*
 * mapbox-gl compatibility shim.
 *
 * The storefront's map module (modules/components/ui/map/providers/mapbox/MapBox.ts) calls
 * `Mapbox.setRTLTextPlugin(...)` when it loads. mapbox-gl 3.x renders right-to-left text natively
 * and no longer exports that function, so the call throws and the map (and the checkout address
 * picker that uses it) fails to initialise. vite.config.ts routes the bare "mapbox-gl" import here;
 * we re-export the real library and add a harmless no-op only when the function is missing.
 */
import mapboxgl from "mapbox-gl/dist/mapbox-gl.js";

const lib = mapboxgl as any;
if (lib && typeof lib.setRTLTextPlugin !== "function") {
  lib.setRTLTextPlugin = (_url: string, callback?: (error?: Error | null) => void) => callback?.(null);
}

export default mapboxgl;
