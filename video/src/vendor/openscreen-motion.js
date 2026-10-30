// Adapted from getopenscreen/openscreen v2.1.2, src/lib/zoomMath/mathUtils.ts.
// Copyright (c) 2025 Siddharth Vaddem; 2025-2026 OpenScreen contributors.
// MIT license: ../../licenses/OpenScreen-MIT.txt. Types removed; clamp inlined.
const clamp01 = (x) => Math.min(1, Math.max(0, x));

function sampleCubicBezier(a1, a2, t) {
	const oneMinusT = 1 - t;
	return 3 * a1 * oneMinusT * oneMinusT * t + 3 * a2 * oneMinusT * t * t + t * t * t;
}

function sampleCubicBezierDerivative(a1, a2, t) {
	const oneMinusT = 1 - t;
	return 3 * a1 * oneMinusT * oneMinusT + 6 * (a2 - a1) * oneMinusT * t + 3 * (1 - a2) * t * t;
}

export function cubicBezier(x1, y1, x2, y2, t) {
	const targetX = clamp01(t);
	let solvedT = targetX;

	for (let i = 0; i < 8; i += 1) {
		const currentX = sampleCubicBezier(x1, x2, solvedT) - targetX;
		const currentDerivative = sampleCubicBezierDerivative(x1, x2, solvedT);

		if (Math.abs(currentX) < 1e-6 || Math.abs(currentDerivative) < 1e-6) {
			break;
		}

		solvedT -= currentX / currentDerivative;
	}

	let lower = 0;
	let upper = 1;
	solvedT = clamp01(solvedT);

	for (let i = 0; i < 10; i += 1) {
		const currentX = sampleCubicBezier(x1, x2, solvedT);
		if (Math.abs(currentX - targetX) < 1e-6) {
			break;
		}

		if (currentX < targetX) {
			lower = solvedT;
		} else {
			upper = solvedT;
		}

		solvedT = (lower + upper) / 2;
	}

	return sampleCubicBezier(y1, y2, solvedT);
}

export function easeOutScreenStudio(t) {
	return cubicBezier(0.16, 1, 0.3, 1, t);
}

const SPRING_OMEGA_T = 7;
const SPRING_END = 1 - (1 + SPRING_OMEGA_T) * Math.exp(-SPRING_OMEGA_T);

/**
 * Critically damped spring rise, scaled to land exactly on 1 at the end of the window: it
 * leaves at zero velocity and settles without overshoot. Mirror of `ease_spring` (Rust).
 */
export function easeSpring(t) {
	const x = SPRING_OMEGA_T * clamp01(t);
	return (1 - (1 + x) * Math.exp(-x)) / SPRING_END;
}

/** Zoom scale between `a` and `b`, interpolated in log space — the way a zoom is perceived. */
export function scaleLerp(a, b, t) {
	const from = Math.max(a, 1e-3);
	return from * (Math.max(b, 1e-3) / from) ** t;
}

/**
 * Ease-out cubic. Used for zoom-out transitions so strength eases to zero.
 */
export function easeOutCubic(t) {
	const x = clamp01(t);
	return 1 - Math.pow(1 - x, 3);
}
