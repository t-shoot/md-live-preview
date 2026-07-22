import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { adaptMarkdownCss } from './cssAdapter';

// Tags the adapter deliberately leaves untouched (rendered with their real tag
// in the live preview, so no selector mapping applies to them).
const UNTOUCHED_TAGS = ['a', 'strong', 'em', 'del', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div'];

// Block-level tags mapped to a fixed replacement class, paired with the class
// each one is expected to contain in the output (PBT-07: domain-specific
// generator reflecting the adapter's own known mapping table, not raw strings).
const MAPPED_BLOCK_TAGS: Array<[string, string]> = [
	['h1', '.cm-line.mlp-line-h1'],
	['h2', '.cm-line.mlp-line-h2'],
	['h3', '.cm-line.mlp-line-h3'],
	['h4', '.cm-line.mlp-line-h4'],
	['h5', '.cm-line.mlp-line-h5'],
	['h6', '.cm-line.mlp-line-h6'],
	['blockquote', '.cm-line.mlp-line-quote'],
	['hr', '.mlp-hr'],
	['code', '.mlp-inline-code'],
];

// Realistic CSS property/value pairs (not arbitrary strings) so generated
// declarations stay parseable and don't accidentally exercise the box-model
// distribution logic (padding/margin/border), which is out of scope here.
const safeProp = fc.constantFrom('color', 'font-size', 'font-weight', 'line-height', 'background-color', 'opacity');
const safeValue = fc.constantFrom('red', '#333', '1rem', '14px', 'bold', '1.5', '0.8', 'inherit');
const declaration = fc.tuple(safeProp, safeValue).map(([p, v]) => `${p}: ${v};`);

describe('adaptMarkdownCss', () => {
	it('rewrites a simple heading selector to its .cm-line class', () => {
		const out = adaptMarkdownCss('h1 { color: red; }');
		expect(out).toContain('.cm-line.mlp-line-h1');
	});

	it('rewrites "pre code" to the block-code child selector', () => {
		const out = adaptMarkdownCss('pre code { color: red; }');
		expect(out).toContain('.cm-line.mlp-line-code > *');
	});

	it('maps a checkbox input selector to the checkbox span', () => {
		const out = adaptMarkdownCss('input[type="checkbox"] { accent-color: blue; }');
		expect(out).toContain('.mlp-checkbox');
	});

	it('maps every known block-level tag to its class regardless of declaration content (PBT-03 invariant)', () => {
		fc.assert(
			fc.property(fc.constantFrom(...MAPPED_BLOCK_TAGS), declaration, ([tag, expectedClass], decl) => {
				const out = adaptMarkdownCss(`${tag} { ${decl} }`);
				expect(out).toContain(expectedClass);
			}),
		);
	});

	it('leaves selector lists of untouched tags byte-for-byte identical (PBT-03 invariant)', () => {
		fc.assert(
			fc.property(fc.subarray(UNTOUCHED_TAGS, { minLength: 1, maxLength: 3 }), declaration, (tags, decl) => {
				const css = `${tags.join(', ')} { ${decl} }`;
				expect(adaptMarkdownCss(css)).toBe(css);
			}),
		);
	});
});
