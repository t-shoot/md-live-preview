import type { HostToOutlineMessage, OutlineToHostMessage } from '../shared/messages';

interface VsCodeApi {
	postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;
const api = acquireVsCodeApi();

function post(message: OutlineToHostMessage): void {
	api.postMessage(message);
}

const root = document.getElementById('mlp-outline-root')!;

function renderEmpty(text: string): void {
	root.replaceChildren();
	const p = document.createElement('p');
	p.className = 'mlp-empty';
	p.textContent = text;
	root.appendChild(p);
}

function renderHeadings(headings: Array<{ level: number; text: string; line: number }>): void {
	root.replaceChildren();
	if (headings.length === 0) {
		renderEmpty('見出しがありません。');
		return;
	}
	const list = document.createElement('ul');
	list.className = 'mlp-outline-list';
	for (const heading of headings) {
		const item = document.createElement('li');
		item.className = `mlp-outline-item mlp-outline-level-${heading.level}`;
		item.textContent = heading.text || '(無題の見出し)';
		item.setAttribute('role', 'button');
		item.setAttribute('tabindex', '0');
		item.addEventListener('click', () => post({ type: 'jumpToHeading', line: heading.line }));
		item.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				post({ type: 'jumpToHeading', line: heading.line });
			}
		});
		list.appendChild(item);
	}
	root.appendChild(list);
}

window.addEventListener('message', (event: MessageEvent<HostToOutlineMessage>) => {
	const message = event.data;
	switch (message.type) {
		case 'update':
			renderHeadings(message.headings);
			break;
		case 'noDocument':
			renderEmpty('Markdown Live Preview を開くと、ここに見出し一覧が表示されます。');
			break;
	}
});

renderEmpty('Markdown Live Preview を開くと、ここに見出し一覧が表示されます。');
post({ type: 'ready' });
