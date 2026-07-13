import { EditorView } from '@codemirror/view';
import { CharCategory, Prec, type EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';

// Backtick is handled entirely by this dedicated handler rather than through
// `closeBrackets()`'s generic same-token pairing: a fenced code block needs
// its closing ``` on its *own* line below the cursor, which is a fundamentally
// different shape than closeBrackets' same-line pairing (its built-in "triple"
// support — see `@codemirror/autocomplete` — mirrors Python-style `'''x'''`,
// closing on the same line). Keeping both mechanisms on backtick would also
// race: closeBrackets would auto-pair the first backtick into an empty ``
// span before this handler ever sees a real "third backtick" keystroke.
const FENCE_OPEN_RE = /^ {0,3}``$/;

function isInsideFencedCode(state: EditorState, pos: number): boolean {
	for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
		if (node.name === 'FencedCode') return true;
	}
	return false;
}

export const backtickInputHandler = Prec.high(
	EditorView.inputHandler.of((view, from, to, text) => {
		if (text !== '`') return false;
		const { state } = view;

		// Selection: wrap the selected text in a backtick pair (inline code).
		if (from !== to) {
			view.dispatch({
				changes: [
					{ from, insert: '`' },
					{ from: to, insert: '`' },
				],
				selection: { anchor: from + 1, head: to + 1 },
				userEvent: 'input.type',
			});
			return true;
		}

		const line = state.doc.lineAt(from);
		const prefix = line.text.slice(0, from - line.from);
		if (FENCE_OPEN_RE.test(prefix) && !isInsideFencedCode(state, from)) {
			// Completing ``` at the start of a line: open a fenced code block with
			// the closing ``` on the line below, cursor left right after the
			// opening ``` so a language tag can be typed next.
			view.dispatch({
				changes: { from, to, insert: '`\n\n```' },
				selection: { anchor: from + 1 },
				userEvent: 'input.type',
			});
			return true;
		}

		const next = state.sliceDoc(from, from + 1);
		if (next === '`') {
			// Type over an adjacent closing backtick instead of inserting another
			// one, so a freshly opened empty `` pair doesn't grow every time the
			// user types its closing mark themselves.
			view.dispatch({ selection: { anchor: from + 1 }, userEvent: 'input.type' });
			return true;
		}

		// A fresh backtick: auto-pair into an empty inline-code span, but only
		// when it isn't being typed in the middle of a word on either side (the
		// same "not adjacent to a word character" heuristic `closeBrackets` uses
		// for other same-token pairs).
		const prev = state.sliceDoc(Math.max(0, from - 1), from);
		const category = state.charCategorizer(from);
		if (category(prev) !== CharCategory.Word && category(next) !== CharCategory.Word) {
			view.dispatch({
				changes: { from, to, insert: '``' },
				selection: { anchor: from + 1 },
				userEvent: 'input.type',
			});
			return true;
		}

		return false;
	}),
);
