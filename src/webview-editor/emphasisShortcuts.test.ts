import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeEmphasisToggle } from './emphasisShortcuts';

/** Applies one toggle to a plain string buffer, mirroring what the real
 * CodeMirror command does to a document — used only to drive the round-trip
 * property test below without needing an EditorView/DOM. */
function applyOnce(doc: string, from: number, to: number, marker: string) {
	const selected = doc.slice(from, to);
	const before = doc.slice(Math.max(0, from - marker.length), from);
	const after = doc.slice(to, Math.min(doc.length, to + marker.length));
	const edit = computeEmphasisToggle(selected, before, after, from, to, marker);
	const newDoc = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to);
	return { doc: newDoc, from: edit.selFrom, to: edit.selTo };
}

describe('computeEmphasisToggle', () => {
	it('inserts an empty marker pair and places the cursor inside when there is no selection', () => {
		const edit = computeEmphasisToggle('', '', '', 5, 5, '**');
		expect(edit).toEqual({ from: 5, to: 5, insert: '****', selFrom: 7, selTo: 7 });
	});

	it('wraps a plain selection in bold markers', () => {
		const doc = 'hello world';
		const edit = computeEmphasisToggle('world', 'lo', '', 6, 11, '**');
		expect(edit.insert).toBe('**world**');
		expect(doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)).toBe('hello **world**');
	});

	it('strips bold markers sitting just outside the selection', () => {
		const doc = '**world**';
		const edit = computeEmphasisToggle('world', '**', '**', 2, 7, '**');
		expect(edit).toEqual({ from: 0, to: 9, insert: 'world', selFrom: 0, selTo: 5 });
		expect(doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)).toBe('world');
	});

	it('strips italic markers sitting just outside the selection', () => {
		const doc = '*hi*';
		const edit = computeEmphasisToggle('hi', '*', '*', 1, 3, '*');
		expect(doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)).toBe('hi');
	});

	it('strips markers when the selection includes them (whole wrapped text selected)', () => {
		const doc = '**world**';
		const edit = computeEmphasisToggle('**world**', '', '', 0, 9, '**');
		expect(edit).toEqual({ from: 0, to: 9, insert: 'world', selFrom: 0, selTo: 5 });
		expect(doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)).toBe('world');
	});

	// Domain generators (PBT-07): alphanumeric/space text with no literal "*"
	// characters, so the generator never accidentally produces an
	// already-wrapped selection or marker-like context — that condition is
	// covered separately by the explicit example tests above.
	const wordArb = fc.stringMatching(/^[a-zA-Z0-9 ]{0,10}$/);
	const contextArb = fc.stringMatching(/^[a-zA-Z0-9]{0,5}$/);
	const markerArb = fc.constantFrom('**', '*');

	it('wrapping then unwrapping returns the original text and selection (PBT-02 round-trip)', () => {
		fc.assert(
			fc.property(contextArb, wordArb, contextArb, markerArb, (prefix, selected, suffix, marker) => {
				const doc = prefix + selected + suffix;
				const from = prefix.length;
				const to = from + selected.length;
				const wrapped = applyOnce(doc, from, to, marker);
				const unwrapped = applyOnce(wrapped.doc, wrapped.from, wrapped.to, marker);
				expect(unwrapped.doc).toBe(doc);
				expect(unwrapped.from).toBe(from);
				expect(unwrapped.to).toBe(to);
			}),
		);
	});

	it('wrapping an unwrapped selection always adds exactly marker.length * 2 characters (PBT-03 invariant)', () => {
		fc.assert(
			fc.property(contextArb, wordArb, contextArb, markerArb, (prefix, selected, suffix, marker) => {
				const doc = prefix + selected + suffix;
				const from = prefix.length;
				const to = from + selected.length;
				const before = doc.slice(Math.max(0, from - marker.length), from);
				const after = doc.slice(to, Math.min(doc.length, to + marker.length));
				const edit = computeEmphasisToggle(selected, before, after, from, to, marker);
				expect(edit.insert.length).toBe(selected.length + marker.length * 2);
				expect(edit.selTo - edit.selFrom).toBe(selected.length);
			}),
		);
	});
});
