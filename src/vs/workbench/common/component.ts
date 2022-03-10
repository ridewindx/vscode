/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Memento, MementoObject } from 'vs/workbench/common/memento';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';

// 组件基类
// 注意其 id 是大多数子类都需要明确定义的静态字符串标识，代表组件的类别
export class Component extends Themable {

	private readonly memento: Memento;

	constructor(
		private readonly id: string,
		themeService: IThemeService,
		storageService: IStorageService
	) {
		super(themeService);

		this.id = id;
		this.memento = new Memento(this.id, storageService);

		this._register(storageService.onWillSaveState(() => {

			// Ask the component to persist state into the memento
			this.saveState();

			// Then save the memento into storage
			this.memento.saveMemento();
		}));
	}

	getId(): string {
		return this.id;
	}

	protected getMemento(scope: StorageScope, target: StorageTarget): MementoObject {
		return this.memento.getMemento(scope, target);
	}

	protected saveState(): void {
		// Subclasses to implement for storing state
	}
}
