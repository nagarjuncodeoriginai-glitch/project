/**
 * Utility Functions Module
 * Shared math and helper functions used across all systems
 */

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

export function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

export function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

export function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function noise(x) {
    return Math.sin(x * 12.9898 + x * 78.233) * 0.5 + 0.5;
}

export function perlin1D(x) {
    return (Math.sin(x * 1.1) + Math.sin(x * 2.3) * 0.5 + Math.sin(x * 4.7) * 0.25) / 1.75;
}
