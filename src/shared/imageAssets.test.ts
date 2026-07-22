import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { extensionForMimeType, generateImageFileName } from './imageAssets';

describe('extensionForMimeType', () => {
	it('maps known image MIME types to their extension', () => {
		expect(extensionForMimeType('image/png')).toBe('png');
		expect(extensionForMimeType('image/jpeg')).toBe('jpg');
		expect(extensionForMimeType('image/gif')).toBe('gif');
		expect(extensionForMimeType('image/webp')).toBe('webp');
		expect(extensionForMimeType('image/bmp')).toBe('bmp');
		expect(extensionForMimeType('image/svg+xml')).toBe('svg');
	});

	it('is case-insensitive', () => {
		expect(extensionForMimeType('IMAGE/PNG')).toBe('png');
	});

	it('returns undefined for an unrecognized MIME type', () => {
		expect(extensionForMimeType('application/pdf')).toBeUndefined();
		expect(extensionForMimeType('text/plain')).toBeUndefined();
	});
});

describe('generateImageFileName', () => {
	it('uses the plain "image-<timestamp>.<ext>" name when nothing collides', () => {
		expect(generateImageFileName(new Set(), 1700000000000, 'png')).toBe('image-1700000000000.png');
	});

	it('appends "-1" when the plain name is already taken', () => {
		const existing = new Set(['image-1700000000000.png']);
		expect(generateImageFileName(existing, 1700000000000, 'png')).toBe('image-1700000000000-1.png');
	});

	// Domain generators (PBT-07): realistic timestamps and known extensions,
	// with a controlled number of pre-existing collisions constructed to force
	// the counter loop through 0..N steps.
	const timestampArb = fc.integer({ min: 0, max: 9_999_999_999_999 });
	const extArb = fc.constantFrom('png', 'jpg', 'gif', 'webp', 'bmp', 'svg');
	const collisionCountArb = fc.integer({ min: 0, max: 5 });

	it('never returns a name already present, and picks the next free slot in sequence (PBT-03 invariant)', () => {
		fc.assert(
			fc.property(timestampArb, extArb, collisionCountArb, (timestamp, ext, collisions) => {
				const base = `image-${timestamp}`;
				const existing = new Set<string>([`${base}.${ext}`]);
				for (let i = 1; i <= collisions; i++) existing.add(`${base}-${i}.${ext}`);

				const name = generateImageFileName(existing, timestamp, ext);

				expect(existing.has(name)).toBe(false);
				expect(name).toBe(`${base}-${collisions + 1}.${ext}`);
			}),
		);
	});
});
