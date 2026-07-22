import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { extractHeadings } from './headings';

describe('extractHeadings', () => {
	it('extracts a simple heading with its level and 1-based line number', () => {
		expect(extractHeadings('# Title\n\nBody text')).toEqual([{ level: 1, text: 'Title', line: 1 }]);
	});

	it('extracts multiple headings of different levels in document order', () => {
		const doc = '# One\ntext\n## Two\nmore text\n### Three';
		expect(extractHeadings(doc)).toEqual([
			{ level: 1, text: 'One', line: 1 },
			{ level: 2, text: 'Two', line: 3 },
			{ level: 3, text: 'Three', line: 5 },
		]);
	});

	it('strips an optional trailing closing sequence of "#"', () => {
		expect(extractHeadings('## Hello ##')).toEqual([{ level: 2, text: 'Hello', line: 1 }]);
	});

	it('does not treat "#Hello" (no space) as a heading', () => {
		expect(extractHeadings('#Hello')).toEqual([]);
	});

	it('does not treat 7 or more "#" characters as a heading', () => {
		expect(extractHeadings('####### not a heading')).toEqual([]);
	});

	it('ignores "#" lines inside a fenced code block', () => {
		const doc = ['```', '# not a heading', '```', '# a real heading'].join('\n');
		expect(extractHeadings(doc)).toEqual([{ level: 1, text: 'a real heading', line: 4 }]);
	});

	// Domain generators (PBT-07): heading lines built from a level (1-6) and
	// plain alphanumeric text, interleaved with plain (non-heading) lines. The
	// charset deliberately excludes "#", "`" and "~" so generated text never
	// accidentally forms a heading marker or fence marker of its own.
	type HeadingBlock = { kind: 'heading'; level: number; text: string };
	type PlainBlock = { kind: 'plain'; text: string };
	type Block = HeadingBlock | PlainBlock;

	const levelArb = fc.integer({ min: 1, max: 6 });
	const nonEmptyTextArb = fc
		.stringMatching(/^[a-zA-Z0-9 ]{1,15}$/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	const plainLineArb = fc.stringMatching(/^[a-zA-Z0-9 ]{0,15}$/);

	const headingBlockArb: fc.Arbitrary<HeadingBlock> = fc
		.tuple(levelArb, nonEmptyTextArb)
		.map(([level, text]) => ({ kind: 'heading', level, text }));
	const plainBlockArb: fc.Arbitrary<PlainBlock> = plainLineArb.map((text) => ({ kind: 'plain', text }));
	const blockArb: fc.Arbitrary<Block> = fc.oneof(headingBlockArb, plainBlockArb);

	function lineFor(block: Block): string {
		return block.kind === 'heading' ? `${'#'.repeat(block.level)} ${block.text}` : block.text;
	}

	it('extracts exactly the heading lines, with correct level/text/line, ignoring plain lines (PBT-03 invariant)', () => {
		fc.assert(
			fc.property(fc.array(blockArb, { minLength: 0, maxLength: 10 }), (blocks) => {
				const doc = blocks.map(lineFor).join('\n');
				const expected = blocks
					.map((block, index) => ({ block, line: index + 1 }))
					.filter((entry): entry is { block: HeadingBlock; line: number } => entry.block.kind === 'heading')
					.map(({ block, line }) => ({ level: block.level, text: block.text, line }));
				expect(extractHeadings(doc)).toEqual(expected);
			}),
		);
	});

	it('never extracts a "#" line that sits inside a fenced code block (PBT-03 invariant)', () => {
		fc.assert(
			fc.property(fc.array(blockArb, { minLength: 0, maxLength: 6 }), fc.constantFrom('```', '~~~'), (blocks, fence) => {
				const doc = [fence, ...blocks.map(lineFor), fence].join('\n');
				expect(extractHeadings(doc)).toEqual([]);
			}),
		);
	});
});
