/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from 'vs/base/browser/dom';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { equals } from 'vs/base/common/arrays';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWebviewPortMapping } from 'vs/platform/webview/common/webviewPortMapping';

/**
 * Set when the find widget in a webview in a webview is visible.
 */
export const KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE = new RawContextKey<boolean>('webviewFindWidgetVisible', false);

/**
 * Set when the find widget in a webview is focused.
 */
export const KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED = new RawContextKey<boolean>('webviewFindWidgetFocused', false);

/**
 * Set when the find widget in a webview is enabled in a webview
 */
export const KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_ENABLED = new RawContextKey<boolean>('webviewFindWidgetEnabled', false);

export const IWebviewService = createDecorator<IWebviewService>('webviewService');

export interface IWebviewService {
	readonly _serviceBrand: undefined;

	/**
	 * The currently focused webview.
	 */
	readonly activeWebview: IWebview | undefined;

	/**
	 * All webviews.
	 */
	readonly webviews: Iterable<IWebview>;

	/**
	 * Fired when the currently focused webview changes.
	 */
	readonly onDidChangeActiveWebview: Event<IWebview | undefined>;

	/**
	 * Create a basic webview dom element.
	 */
	createWebviewElement(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescription | undefined,
	): IWebviewElement;

	/**
	 * Create a lazily created webview element that is overlaid on top of another element.
	 *
	 * Allows us to avoid re-parenting the webview (which destroys its contents) when
	 * moving webview around the workbench.
	 */
	createWebviewOverlay(
		id: string,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescription | undefined,
	): IOverlayWebview;
}

export const enum WebviewContentPurpose {
	NotebookRenderer = 'notebookRenderer',
	CustomEditor = 'customEditor',
	WebviewView = 'webviewView',
}

export type WebviewStyles = { readonly [key: string]: string | number };

export interface WebviewOptions {
	/**
	 * The purpose of the webview; this is (currently) only used for filtering in js-debug
	 */
	readonly purpose?: WebviewContentPurpose; // 此 webview 承载内容类型
	readonly customClasses?: string; // 此 webview 的 iframe 的额外类名列表
	readonly enableFindWidget?: boolean; // 是否使能查找 Widget
	readonly tryRestoreScrollPosition?: boolean;
	readonly retainContextWhenHidden?: boolean;
	transformCssVariables?(styles: WebviewStyles): WebviewStyles;
}

/**
 *
 */
export interface WebviewContentOptions {
	/**
	 * Should the webview allow `acquireVsCodeApi` to be called multiple times? Defaults to false.
	 */
	readonly allowMultipleAPIAcquire?: boolean;

	/**
	 * Should scripts be enabled in the webview? Defaults to false.
	 */
	readonly allowScripts?: boolean;

	/**
	 * Should forms be enabled in the webview? Defaults to the value of {@link allowScripts}.
	 */
	readonly allowForms?: boolean;

	/**
	 * Set of root paths from which the webview can load local resources.
	 * 允许 webview 加载本地资源的根路径
	 */
	readonly localResourceRoots?: readonly URI[];

	/**
	 * Set of localhost port mappings to apply inside the webview.
	 * 端口映射，用于 remote 模式时访问扩展建立的 localhost web server
	 * 此时扩展运行在 remote 环境中，localhost web server 也运行在 remote 环境中
	 * 而 webview 是在本地 VS Code 中打开，访问 localhost 的 URL 时就会出错
	 * 因此端口映射能把访问 localhost 的端口重定向为访问 remote 环境中 localhost web server 的端口
	 * 当然也会把 authority 从 localhost 改为 remote 环境的
	 */
	readonly portMapping?: readonly IWebviewPortMapping[];

	/**
	 * Are command uris enabled in the webview? Defaults to false.
	 */
	readonly enableCommandUris?: boolean;
}

/**
 * Check if two {@link WebviewContentOptions} are equal.
 */
export function areWebviewContentOptionsEqual(a: WebviewContentOptions, b: WebviewContentOptions): boolean {
	return (
		a.allowMultipleAPIAcquire === b.allowMultipleAPIAcquire
		&& a.allowScripts === b.allowScripts
		&& a.allowForms === b.allowForms
		&& equals(a.localResourceRoots, b.localResourceRoots, isEqual)
		&& equals(a.portMapping, b.portMapping, (a, b) => a.extensionHostPort === b.extensionHostPort && a.webviewPort === b.webviewPort)
		&& a.enableCommandUris === b.enableCommandUris
	);
}

export interface WebviewExtensionDescription {
	readonly location?: URI; // 扩展所在位置，本地的或远程的
	readonly id: ExtensionIdentifier; // 扩展 id
}

export interface IDataLinkClickEvent {
	readonly dataURL: string;
	readonly downloadName?: string;
}

export interface WebviewMessageReceivedEvent {
	readonly message: any;
	readonly transfer?: readonly ArrayBuffer[];
}

export interface IWebview extends IDisposable {

	readonly id: string;

	html: string;
	contentOptions: WebviewContentOptions;
	localResourcesRoot: readonly URI[];
	extension: WebviewExtensionDescription | undefined;
	initialScrollProgress: number;
	state: string | undefined;

	readonly isFocused: boolean;

	readonly onDidFocus: Event<void>;
	readonly onDidBlur: Event<void>;
	readonly onDidDispose: Event<void>;

	readonly onDidClickLink: Event<string>;
	readonly onDidScroll: Event<{ readonly scrollYPercentage: number }>;
	readonly onDidWheel: Event<IMouseWheelEvent>;
	readonly onDidUpdateState: Event<string | undefined>;
	readonly onDidReload: Event<void>;
	readonly onMessage: Event<WebviewMessageReceivedEvent>;
	readonly onMissingCsp: Event<ExtensionIdentifier>;

	postMessage(message: any, transfer?: readonly ArrayBuffer[]): void;

	focus(): void;
	reload(): void;

	showFind(): void;
	hideFind(): void;
	runFindAction(previous: boolean): void;

	selectAll(): void;
	copy(): void;
	paste(): void;
	cut(): void;
	undo(): void;
	redo(): void;

	windowDidDragStart(): void;
	windowDidDragEnd(): void;

	setContextKeyService(scopedContextKeyService: IContextKeyService): void;
}

/**
 * Basic webview rendered directly in the dom
 */
export interface IWebviewElement extends IWebview {
	/**
	 * Append the webview to a HTML element.
	 * 把这个 webview 添加为 parent 的子 HTML 元素
	 *
	 * Note that the webview content will be destroyed if any part of the parent hierarchy
	 * changes. You can avoid this by using a {@link IOverlayWebview} instead.
	 * 若 parent 元素的层次结构发生改变，此 webview 会被销毁
	 *
	 * @param parent Element to append the webview to.
	 */
	mountTo(parent: HTMLElement): void;
}

/**
 * Lazily created {@link IWebview} that is absolutely positioned over another element.
 *
 * Absolute positioning lets us avoid having the webview be re-parented, which would destroy the
 * webview's content.
 *
 * Note that the underlying webview owned by a `WebviewOverlay` can be dynamically created
 * and destroyed depending on who has {@link IOverlayWebview.claim claimed} or {@link IOverlayWebview.release released} it.
 */
export interface IOverlayWebview extends IWebview {
	/**
	 * The HTML element that holds the webview.
	 */
	readonly container: HTMLElement;

	options: WebviewOptions;

	/**
	 * Take ownership of the webview.
	 *
	 * This will create the underlying webview element.
	 *
	 * @param claimant Identifier for the object claiming the webview.
	 *   This must match the `claimant` passed to {@link IOverlayWebview.release}.
	 */
	claim(claimant: any, scopedContextKeyService: IContextKeyService | undefined): void;

	/**
	 * Release ownership of the webview.
	 *
	 * If the {@link claimant} is still the current owner of the webview, this will
	 * cause the underlying webview element to be destoryed.
	 *
	 * @param claimant Identifier for the object releasing its claim on the webview.
	 *   This must match the `claimant` passed to {@link IOverlayWebview.claim}.
	 */
	release(claimant: any): void;

	/**
	 * Absolutely position the webview on top of another element in the DOM.
	 *
	 * @param element Element to position the webview on top of. This element should
	 *   be an placeholder for the webview since the webview will entirely cover it.
	 *   完全覆盖 webview 元素在指定的 element 这个占位符元素上
	 * @param dimension Optional explicit dimensions to use for sizing the webview.
	 * 可选的长宽尺寸；若空，则实用 element 的长宽
	 */
	layoutWebviewOverElement(element: HTMLElement, dimension?: Dimension): void;
}
