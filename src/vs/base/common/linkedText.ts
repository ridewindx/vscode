/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memoize } from 'vs/base/common/decorators';

export interface ILink {
	readonly label: string; // 中括号里的
	readonly href: string; // 小括号里第一部分的以 http:// 或 https:// 或 command: 开头的
	readonly title?: string; // 小括号里第二部分引号里的
}

export type LinkedTextNode = string | ILink;

export class LinkedText {

	// nodes 是解析后的一个个节点，可以是文本，也可以是 ILink
	constructor(readonly nodes: LinkedTextNode[]) { }

	@memoize
	toString(): string {
		return this.nodes.map(node => typeof node === 'string' ? node : node.label).join('');
	}
}

const LINK_REGEX = /\[([^\]]+)\]\(((?:https?:\/\/|command:|file:)[^\)\s]+)(?: ("|')([^\3]+)(\3))?\)/gi;

// 将类似 Markdown 中链接表示形式的文本解析为链接文本类实例
export function parseLinkedText(text: string): LinkedText {
	const result: LinkedTextNode[] = [];

	let index = 0;
	let match: RegExpExecArray | null;

	while (match = LINK_REGEX.exec(text)) {
		if (match.index - index > 0) {
			result.push(text.substring(index, match.index));
		}

		const [, label, href, , title] = match;

		if (title) {
			result.push({ label, href, title });
		} else {
			result.push({ label, href });
		}

		index = match.index + match[0].length;
	}

	if (index < text.length) {
		result.push(text.substring(index));
	}

	return new LinkedText(result);
}
