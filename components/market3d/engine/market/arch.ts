/*
 * Fresh Market 3D — the Persian arch profile shared by the arcades and the bazaar gate.
 */

/** Four-centred Persian arch as a list of points (opening outline), base at y0. */
export function archPoints(w: number, y0: number, spring: number, apex: number, steps = 24): Array<[number, number]> {
  const pts: Array<[number, number]> = [[-w / 2, y0], [-w / 2, spring]];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // cubic bezier from (-w/2, spring) to (0, apex)
    const p0 = [-w / 2, spring], p1 = [-w / 2, spring + (apex - spring) * 0.62], p2 = [-w * 0.16, apex - (apex - spring) * 0.12], p3 = [0, apex];
    const u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  const right = pts.slice(0, -1).reverse().map(([x, y]) => [-x, y] as [number, number]);
  return [...pts, ...right];
}

/** Half-width of the arch opening at height y (spring ≤ y ≤ apex), from the same profile. */
export function archHalfWidth(w: number, spring: number, apex: number, steps = 96): (y: number) => number {
  const pts = archPoints(w, 0, spring, apex, steps).slice(1, steps + 2); // springing point → apex
  return (y: number) => {
    if (y <= spring) return w / 2;
    if (y >= apex) return 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      if (y >= y0 && y <= y1) return -(x0 + ((y - y0) / Math.max(1e-6, y1 - y0)) * (x1 - x0));
    }
    return 0;
  };
}
