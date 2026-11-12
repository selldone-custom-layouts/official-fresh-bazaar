<!--
  Fresh Market 3D — on-screen joystick for touch devices.
  Emits `move` with {x, y} in -1..1 (x: strafe right, y: forward).
-->
<template>
  <div
    ref="pad"
    class="fm-joy"
    @pointerdown.prevent="down"
    @pointermove.prevent="moveH"
    @pointerup.prevent="up"
    @pointercancel.prevent="up"
    aria-label="Walk"
    role="slider"
  >
    <div class="fm-joy__ring"></div>
    <div class="fm-joy__knob" :style="{ transform: `translate(${kx}px, ${ky}px)` }"></div>
  </div>
</template>

<script lang="ts">
export default {
  name: "MarketJoystick",
  emits: ["move"],
  data: () => ({ kx: 0, ky: 0, id: null as number | null }),
  methods: {
    down(e: PointerEvent) {
      this.id = e.pointerId;
      (this.$refs.pad as HTMLElement).setPointerCapture?.(e.pointerId);
      this.moveH(e);
    },
    moveH(e: PointerEvent) {
      if (this.id !== e.pointerId) return;
      const r = (this.$refs.pad as HTMLElement).getBoundingClientRect();
      const R = r.width / 2;
      let x = e.clientX - (r.left + R);
      let y = e.clientY - (r.top + R);
      const d = Math.hypot(x, y);
      const max = R * 0.62;
      if (d > max) {
        x = (x / d) * max;
        y = (y / d) * max;
      }
      this.kx = x;
      this.ky = y;
      this.$emit("move", { x: x / max, y: -y / max });
    },
    up(e: PointerEvent) {
      if (this.id !== e.pointerId) return;
      this.id = null;
      this.kx = 0;
      this.ky = 0;
      this.$emit("move", { x: 0, y: 0 });
    },
  },
};
</script>

<style scoped>
.fm-joy {
  position: absolute;
  left: 22px;
  bottom: 104px;
  width: 124px;
  height: 124px;
  border-radius: 50%;
  touch-action: none;
  z-index: 6;
  user-select: none;
}
.fm-joy__ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 40%, rgba(255, 255, 255, 0.22), rgba(20, 16, 12, 0.35));
  border: 1px solid rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.fm-joy__knob {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 52px;
  height: 52px;
  margin: -26px 0 0 -26px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff8ec, #f1c27a 70%, #c98b3a);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35), inset 0 -3px 6px rgba(120, 70, 20, 0.35);
  transition: transform 0.06s linear;
}
</style>
