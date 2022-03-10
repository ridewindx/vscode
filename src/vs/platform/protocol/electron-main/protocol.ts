/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IProtocolMainService = createDecorator<IProtocolMainService>('protocolMainService');

export interface IIPCObjectUrl<T> extends IDisposable {

	/**
	 * A `URI` that a renderer can use to retrieve the
	 * object via `ipcRenderer.invoke(resource.toString())`
	 * 渲染进程中可以使用 ipcRenderer 得到 object
	 * resource 这个 URI 是创建此 IIPCObjectUrl 时随机生成的
	 */
	resource: URI;

	/**
	 * Allows to update the value of the object after it
	 * has been created.
	 * 更新 object
	 *
	 * @param obj the object to make accessible to the
	 * renderer.
	 */
	update(obj: T): void;
}

export interface IProtocolMainService {

	readonly _serviceBrand: undefined;

	/**
	 * Allows to make an object accessible to a renderer
	 * via `ipcRenderer.invoke(resource.toString())`.
	 * 创建 IIPCObjectUrl 实例，它含有的 object 可以被渲染进程通过 IPC 得到
	 */
	createIPCObjectUrl<T>(): IIPCObjectUrl<T>;

	/**
	 * Adds a path as root to the list of allowed
	 * resources for file access.
	 * 添加目录作为根，使得目录下的文件能被访问
	 *
	 * @param root the path to allow for file access
	 */
	addValidFileRoot(root: string): IDisposable;
}
