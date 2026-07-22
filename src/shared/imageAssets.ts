const MIME_TO_EXTENSION: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/bmp': 'bmp',
	'image/svg+xml': 'svg',
};

/** Maps a known image MIME type to a file extension; `undefined` for anything unrecognized. */
export function extensionForMimeType(mimeType: string): string | undefined {
	return MIME_TO_EXTENSION[mimeType.toLowerCase()];
}

/**
 * Picks a file name that isn't already in `existingNames`: `image-<timestamp>.<ext>`,
 * falling back to `image-<timestamp>-1.<ext>`, `-2`, … on collision.
 */
export function generateImageFileName(existingNames: ReadonlySet<string>, timestampMs: number, ext: string): string {
	const base = `image-${timestampMs}`;
	let candidate = `${base}.${ext}`;
	let counter = 1;
	while (existingNames.has(candidate)) {
		candidate = `${base}-${counter}.${ext}`;
		counter++;
	}
	return candidate;
}
