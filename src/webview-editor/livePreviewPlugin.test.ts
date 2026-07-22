import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { readCells, resolveImageSrc } from './livePreviewPlugin';

/** Builds a 2-row GFM table (header + one data row) from a list of cell values. */
function tableFor(cells: string[]): string {
	const header = cells.map((_, i) => `h${i}`).join(' | ');
	const separator = cells.map(() => '---').join(' | ');
	const row = cells.join(' | ');
	return `| ${header} |\n| ${separator} |\n| ${row} |`;
}

/** Parses markdown text (via the same GFM-extended parser the app uses) and
 * collects its TableHeader/TableRow nodes in document order, exactly as
 * `buildTableWidget` does in production. */
function parseTable(markdownText: string): { state: EditorState; rows: SyntaxNode[] } {
	const state = EditorState.create({ doc: markdownText, extensions: [markdown({ extensions: GFM })] });
	const tree = ensureSyntaxTree(state, state.doc.length, 5000);
	if (!tree) throw new Error('syntax tree did not finish parsing in time');
	const rows: SyntaxNode[] = [];
	tree.iterate({
		enter(node) {
			if (node.name === 'TableHeader' || node.name === 'TableRow') rows.push(node.node);
		},
	});
	return { state, rows };
}

// Domain generator (PBT-07): alphanumeric tokens, an escaped-pipe variant
// (a literal "\|" inside one cell, which GFM table syntax keeps as part of
// the cell rather than a column separator), and the empty string — the exact
// boundary value that caused the empty-middle-cell regression this test suite
// guards against (see aidlc-docs history, Cycle 1).
const cellToken = fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/);
const cellWithEscapedPipe = fc.tuple(cellToken, cellToken).map(([a, b]) => `${a}\\|${b}`);
const cellText = fc.oneof(cellToken, cellWithEscapedPipe, fc.constant(''));

describe('readCells', () => {
	it('keeps an empty middle cell in place instead of shifting later columns left (regression)', () => {
		const { state, rows } = parseTable(tableFor(['a', '', 'c']));
		expect(rows).toHaveLength(2); // [TableHeader, TableRow]
		expect(readCells(state, rows[1])).toEqual(['a', '', 'c']);
	});

	it('keeps multiple adjacent empty cells in place (regression)', () => {
		const { state, rows } = parseTable(tableFor(['', '', 'z']));
		expect(readCells(state, rows[1])).toEqual(['', '', 'z']);
	});

	it('never drops or shifts cells, even when several are empty (PBT-03 invariant)', () => {
		fc.assert(
			fc.property(fc.array(cellText, { minLength: 2, maxLength: 6 }), (cells) => {
				const { state, rows } = parseTable(tableFor(cells));
				expect(readCells(state, rows[1])).toHaveLength(cells.length);
			}),
		);
	});

	it('round-trips cell content through table markup, including empty and pipe-escaped cells (PBT-02)', () => {
		fc.assert(
			fc.property(fc.array(cellText, { minLength: 2, maxLength: 6 }), (cells) => {
				const { state, rows } = parseTable(tableFor(cells));
				expect(readCells(state, rows[1])).toEqual(cells);
			}),
		);
	});
});

describe('resolveImageSrc', () => {
	const baseUri = 'https://file+.vscode-resource.vscode-cdn.net/c%3A/work/repo/notes/';

	it('leaves absolute URLs (https, data) unchanged regardless of baseUri', () => {
		expect(resolveImageSrc('https://picsum.photos/id/1015/480/270', baseUri)).toBe(
			'https://picsum.photos/id/1015/480/270',
		);
		expect(resolveImageSrc('data:image/png;base64,AAAA', baseUri)).toBe('data:image/png;base64,AAAA');
	});

	it('resolves a relative path against baseUri (regression: pasted images not rendering)', () => {
		expect(resolveImageSrc('assets/foo.png', baseUri)).toBe(
			'https://file+.vscode-resource.vscode-cdn.net/c%3A/work/repo/notes/assets/foo.png',
		);
	});

	it('returns the src unchanged when no baseUri is set yet', () => {
		expect(resolveImageSrc('assets/foo.png', '')).toBe('assets/foo.png');
	});

	// Domain generator (PBT-07): realistic relative asset paths (no leading
	// slash, no scheme) alongside a fixed, realistic webview base URI.
	const relativePathArb = fc
		.array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,10}$/), { minLength: 1, maxLength: 3 })
		.map((segments) => segments.join('/'));

	it('always resolves a relative path to something starting with baseUri (PBT-03 invariant)', () => {
		fc.assert(
			fc.property(relativePathArb, (relPath) => {
				const resolved = resolveImageSrc(relPath, baseUri);
				expect(resolved.startsWith(baseUri)).toBe(true);
			}),
		);
	});
});
