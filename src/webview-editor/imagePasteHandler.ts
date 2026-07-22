import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import type { EditorState } from '@codemirror/state';

export type ImagePasteCallback = (
	atPos: number,
	mimeType: string,
	dataBase64: string,
	needsOwnParagraph: boolean,
) => void;

export interface InsertionPoint {
	pos: number;
	/** True when `pos` was moved out of a table — the caller should separate
	 * the inserted text from surrounding content with a blank line. */
	needsOwnParagraph: boolean;
}

/**
 * If `pos` sits inside a `Table` block, relocates the insertion point to
 * just after the table instead. Inserting `![](...)` at a raw position
 * inside a table's source gets absorbed as literal cell/row text — it
 * doesn't render as an image, and the malformed row can make the table
 * appear to lose content the next time it's re-parsed (e.g. entering it to
 * edit again). Any other ancestor block (paragraph, list item, blockquote,
 * fenced code) is left alone; only a `Table` is structurally fragile enough
 * for a stray inserted line to corrupt.
 */
export function escapeTable(state: EditorState, pos: number): InsertionPoint {
	let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
	while (node) {
		if (node.name === 'Table') return { pos: node.to, needsOwnParagraph: true };
		node = node.parent;
	}
	return { pos, needsOwnParagraph: false };
}

// Only the first image among multiple pasted/dropped items is handled — the
// common case (a single screenshot) covers the vast majority of real use;
// sequential multi-image insertion is out of scope for this feature.
function findImageFile(items: DataTransferItemList | undefined | null): File | undefined {
	if (!items) return undefined;
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (item.kind === 'file' && item.type.startsWith('image/')) {
			const file = item.getAsFile();
			if (file) return file;
		}
	}
	return undefined;
}

function findImageFileInList(files: FileList | undefined | null): File | undefined {
	if (!files) return undefined;
	for (let i = 0; i < files.length; i++) {
		if (files[i].type.startsWith('image/')) return files[i];
	}
	return undefined;
}

// `FileReader.readAsDataURL` is used (rather than hand-rolling base64 from
// `arrayBuffer()`) because the browser implements the encoding natively —
// cheaper than building a giant string via `String.fromCharCode` per byte for
// a multi-megabyte screenshot.
function readAsBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			const comma = result.indexOf(',');
			resolve(comma === -1 ? result : result.slice(comma + 1));
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

/** Intercepts pasting/dropping an image, handing its position + MIME type + base64 data to `onImage`. */
export function createImagePasteHandler(onImage: ImagePasteCallback) {
	return EditorView.domEventHandlers({
		paste(event, view) {
			const file = findImageFile(event.clipboardData?.items);
			if (!file) return false; // not an image — let normal text paste proceed untouched
			event.preventDefault();
			const { pos, needsOwnParagraph } = escapeTable(view.state, view.state.selection.main.from);
			void readAsBase64(file).then((dataBase64) => onImage(pos, file.type, dataBase64, needsOwnParagraph));
			return true;
		},
		drop(event, view) {
			const file = findImageFileInList(event.dataTransfer?.files);
			if (!file) return false;
			event.preventDefault();
			const dropPos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.from;
			const { pos, needsOwnParagraph } = escapeTable(view.state, dropPos);
			void readAsBase64(file).then((dataBase64) => onImage(pos, file.type, dataBase64, needsOwnParagraph));
			return true;
		},
	});
}
