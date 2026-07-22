import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { escapeTable } from './imagePasteHandler';

function stateFor(text: string): EditorState {
	const state = EditorState.create({ doc: text, extensions: [markdown({ extensions: GFM })] });
	const tree = ensureSyntaxTree(state, state.doc.length, 5000);
	if (!tree) throw new Error('syntax tree did not finish parsing in time');
	return state;
}

describe('escapeTable', () => {
	it('leaves a position inside a normal paragraph unchanged', () => {
		const text = 'Hello world.\n\nMore text.';
		const state = stateFor(text);
		const pos = text.indexOf('world');
		expect(escapeTable(state, pos)).toEqual({ pos, needsOwnParagraph: false });
	});

	it('relocates a position inside a table cell to just after the table (regression: pasting an image into a table cell)', () => {
		const text = '| a | b |\n| --- | --- |\n| 1 | 2 |\n\nAfter.';
		const state = stateFor(text);
		const tableEnd = text.indexOf('\n\nAfter.');
		const posInsideCell = text.indexOf('2');
		expect(escapeTable(state, posInsideCell)).toEqual({ pos: tableEnd, needsOwnParagraph: true });
	});

	it('relocates a position in the table header row too', () => {
		const text = '| a | b |\n| --- | --- |\n| 1 | 2 |\n\nAfter.';
		const state = stateFor(text);
		const tableEnd = text.indexOf('\n\nAfter.');
		const posInHeader = text.indexOf('a');
		expect(escapeTable(state, posInHeader)).toEqual({ pos: tableEnd, needsOwnParagraph: true });
	});

	it('leaves a position right after a table unchanged', () => {
		const text = '| a | b |\n| --- | --- |\n| 1 | 2 |\n\nAfter.';
		const state = stateFor(text);
		const pos = text.indexOf('After');
		expect(escapeTable(state, pos)).toEqual({ pos, needsOwnParagraph: false });
	});
});
