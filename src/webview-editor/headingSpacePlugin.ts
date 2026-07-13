import { EditorView } from '@codemirror/view';
import { Prec } from '@codemirror/state';

const ATX_MARK_RE = /^#{1,6}$/;

/**
 * When the text typed so far on the current line is *only* an ATX heading
 * marker (`#` through `######`) with no trailing space yet, typing any
 * non-space character right after it inserts a space first — matching how
 * other Markdown editors auto-format `#Heading` into `# Heading` as you type,
 * instead of leaving an unrecognized (space-less) heading marker.
 */
export const headingSpaceInputHandler = Prec.high(
	EditorView.inputHandler.of((view, from, to, text) => {
		if (from !== to || text.length !== 1 || text === ' ' || text === '#') return false;
		const { state } = view;
		const line = state.doc.lineAt(from);
		const prefix = line.text.slice(0, from - line.from);
		if (!ATX_MARK_RE.test(prefix)) return false;
		view.dispatch({
			changes: { from, to, insert: ' ' + text },
			selection: { anchor: from + 1 + text.length },
			userEvent: 'input.type',
		});
		return true;
	}),
);
