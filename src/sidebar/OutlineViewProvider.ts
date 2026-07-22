import * as vscode from 'vscode';
import type { HostToOutlineMessage, OutlineToHostMessage } from '../shared/messages';
import type { MarkdownLivePreviewProvider } from '../editor/MarkdownLivePreviewProvider';

const REFRESH_DEBOUNCE_MS = 150;

export class OutlineViewProvider implements vscode.WebviewViewProvider {
	static readonly viewType = 'mdLivePreview.outline';

	private view: vscode.WebviewView | undefined;
	private refreshTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly editorProvider: MarkdownLivePreviewProvider,
	) {
		this.context.subscriptions.push(
			vscode.window.tabGroups.onDidChangeTabs(() => this.scheduleRefresh()),
			vscode.workspace.onDidChangeTextDocument(() => this.scheduleRefresh()),
		);
	}

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
				vscode.Uri.joinPath(this.context.extensionUri, 'media'),
			],
		};
		webviewView.webview.html = this.buildHtml(webviewView.webview);
		webviewView.webview.onDidReceiveMessage((message: OutlineToHostMessage) => this.handleMessage(message));
		webviewView.onDidDispose(() => {
			if (this.view === webviewView) {
				this.view = undefined;
			}
		});
	}

	private handleMessage(message: OutlineToHostMessage): void {
		switch (message.type) {
			case 'ready':
				this.refresh();
				break;
			case 'jumpToHeading':
				this.editorProvider.jumpToActiveHeading(message.line);
				break;
		}
	}

	private scheduleRefresh(): void {
		if (this.refreshTimer) clearTimeout(this.refreshTimer);
		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = undefined;
			this.refresh();
		}, REFRESH_DEBOUNCE_MS);
	}

	private refresh(): void {
		if (!this.view) return;
		const headings = this.editorProvider.getActiveHeadings();
		const message: HostToOutlineMessage = headings ? { type: 'update', headings } : { type: 'noDocument' };
		void this.view.webview.postMessage(message);
	}

	private buildHtml(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview-outline.js'));
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview-outline-style.css'),
		);
		const nonce = getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
	<link rel="stylesheet" href="${styleUri}" />
	<title>アウトライン</title>
</head>
<body>
	<div id="mlp-outline-root"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
