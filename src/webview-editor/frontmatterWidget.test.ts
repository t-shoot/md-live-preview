import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { EditorState } from '@codemirror/state';
import { detectFrontmatter } from './frontmatterWidget';

function stateFor(text: string): EditorState {
	return EditorState.create({ doc: text });
}

// Domain generator (PBT-07): plain YAML-like body lines that never equal the
// closing "---" marker themselves — otherwise the property below would find
// a different (earlier) close than the one it constructed.
const bodyLine = fc.stringMatching(/^[a-zA-Z0-9_: ]*$/).filter((s) => s.trim() !== '---');

describe('detectFrontmatter', () => {
	it('returns null when the document does not start with a "---" line', () => {
		expect(detectFrontmatter(stateFor('# Hello\n\nBody text'))).toBeNull();
	});

	it('returns null for a single-line document (no closing marker possible)', () => {
		expect(detectFrontmatter(stateFor('---'))).toBeNull();
	});

	it('detects a minimal empty frontmatter block', () => {
		const range = detectFrontmatter(stateFor('---\n---\nbody'));
		expect(range).not.toBeNull();
		expect(range?.from).toBe(0);
		expect(range?.yamlText).toBe('');
	});

	it('extracts the exact YAML text between the markers (PBT-03 invariant)', () => {
		fc.assert(
			fc.property(fc.array(bodyLine, { minLength: 0, maxLength: 5 }), fc.string(), (lines, tail) => {
				const yaml = lines.join('\n');
				const doc = ['---', ...lines, '---', tail].join('\n');
				const state = stateFor(doc);
				const range = detectFrontmatter(state);
				expect(range).not.toBeNull();
				expect(range!.from).toBe(0);
				expect(range!.yamlText).toBe(yaml);
				// The detected range always ends exactly at the closing "---" line.
				const lastLineOfRange = state.doc.sliceString(range!.from, range!.to).split('\n').pop();
				expect(lastLineOfRange).toBe('---');
			}),
		);
	});

	it('returns null whenever the first line is not exactly "---" (PBT-03 invariant)', () => {
		fc.assert(
			fc.property(
				fc.string().filter((s) => s.trim() !== '---' && !s.includes('\n')),
				fc.array(bodyLine, { minLength: 1, maxLength: 3 }),
				(firstLine, rest) => {
					const doc = [firstLine, '---', ...rest, '---'].join('\n');
					expect(detectFrontmatter(stateFor(doc))).toBeNull();
				},
			),
		);
	});
});
