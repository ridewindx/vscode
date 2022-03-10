/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IStateMainService = createDecorator<IStateMainService>('stateMainService');

// 主进程的状态管理服务
// 默认实现是写入用户数据目录下的 storage.json 文件
// 每次设置或删除操作都会直接写整个文件，所以只适合一些配置类型的状态存储吧
export interface IStateMainService {

	readonly _serviceBrand: undefined;

	getItem<T>(key: string, defaultValue: T): T;
	getItem<T>(key: string, defaultValue?: T): T | undefined;

	// 当 data 为 undefined 或 null 时，其实相当于删除 key
	setItem(key: string, data?: object | string | number | boolean | undefined | null): void;
	setItems(items: readonly { key: string; data?: object | string | number | boolean | undefined | null }[]): void;

	removeItem(key: string): void;

	close(): Promise<void>;
}
