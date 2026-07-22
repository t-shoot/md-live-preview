import { EditorSelection } from '@codemirror/state';
import type { Command } from '@codemirror/view';

export interface EmphasisEdit {
	from: number;
	to: number;
	insert: string;
	selFrom: number;
	selTo: number;
}

/**
 * Computes the single-edit toggle for wrapping/unwrapping a selection in a
 * Markdown emphasis marker ("**" for bold, "*" for italic). Pure function:
 * takes only the three text fragments the decision needs (the selected text,
 * plus exactly `marker.length` characters immediately before and after it),
 * not the whole document, so it can be tested without a CodeMirror instance.
 *
 * Known limitation: nested bold+italic ("***text***") isn't specially
 * unwrapped — each marker only recognizes its own exact wrap, matching the
 * plain toggle behavior requested (no cross-marker inference).
 */
export function computeEmphasisToggle(
	selected: string,
	before: string,
	after: string,
	from: number,
	to: number,
	marker: string,
): EmphasisEdit {
	// The selection includes the markers themselves (e.g. the user selected
	// "**bold**" whole) — strip them from inside the selection.
	if (selected.length >= marker.length * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
		const inner = selected.slice(marker.length, selected.length - marker.length);
		return { from, to, insert: inner, selFrom: from, selTo: from + inner.length };
	}

	// The markers sit just outside the selection — the common case — strip them.
	if (before === marker && after === marker) {
		const start = from - marker.length;
		const end = to + marker.length;
		return { from: start, to: end, insert: selected, selFrom: start, selTo: start + selected.length };
	}

	// Not wrapped — add the marker. An empty selection becomes an empty pair
	// with the cursor placed between the two marker halves.
	const insert = `${marker}${selected}${marker}`;
	return { from, to, insert, selFrom: from + marker.length, selTo: from + marker.length + selected.length };
}

/** Builds a CodeMirror command that toggles `marker` around every selection range. */
export function toggleEmphasisCommand(marker: string): Command {
	return (view) => {
		const { state } = view;
		const changes = state.changeByRange((range) => {
			const selected = state.sliceDoc(range.from, range.to);
			const before = state.sliceDoc(Math.max(0, range.from - marker.length), range.from);
			const after = state.sliceDoc(range.to, Math.min(state.doc.length, range.to + marker.length));
			const edit = computeEmphasisToggle(selected, before, after, range.from, range.to, marker);
			return {
				changes: { from: edit.from, to: edit.to, insert: edit.insert },
				range: EditorSelection.range(edit.selFrom, edit.selTo),
			};
		});
		view.dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
		return true;
	};
}
