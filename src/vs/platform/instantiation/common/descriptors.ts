/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class SyncDescriptor<T> {

	readonly ctor: any;
	readonly staticArguments: any[];
	readonly supportsDelayedInstantiation: boolean;

	// ctor 是服务类的构造函数
	// staticArguments 是构造函数的入参中非服务依赖类型的参数，须放置在服务依赖类型参数前面
	// supportsDelayedInstantiation 表明是否在空闲时或在真正实际使用这个服务实例时创建它
	constructor(ctor: new (...args: any[]) => T, staticArguments: any[] = [], supportsDelayedInstantiation: boolean = false) {
		this.ctor = ctor;
		this.staticArguments = staticArguments;
		this.supportsDelayedInstantiation = supportsDelayedInstantiation;
	}
}

export interface SyncDescriptor0<T> {
	readonly ctor: new () => T;
}
