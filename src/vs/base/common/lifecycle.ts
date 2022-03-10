/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { once } from 'vs/base/common/functional';
import { Iterable } from 'vs/base/common/iterator';

/**
 * Enables logging of potentially leaked disposables.
 *
 * A disposable is considered leaked if it is not disposed or not registered as the child of
 * another disposable. This tracking is very simple an only works for classes that either
 * extend Disposable or use a DisposableStore. This means there are a lot of false positives.
 */
const TRACK_DISPOSABLES = false;
let disposableTracker: IDisposableTracker | null = null;

export interface IDisposableTracker {
	/**
	 * Is called on construction of a disposable.
	*/
	trackDisposable(disposable: IDisposable): void;

	/**
	 * Is called when a disposable is registered as child of another disposable (e.g. {@link DisposableStore}).
	 * If parent is `null`, the disposable is removed from its former parent.
	*/
	setParent(child: IDisposable, parent: IDisposable | null): void;

	/**
	 * Is called after a disposable is disposed.
	*/
	markAsDisposed(disposable: IDisposable): void;

	/**
	 * Indicates that the given object is a singleton which does not need to be disposed.
	*/
	markAsSingleton(disposable: IDisposable): void;
}

// 设置 disposable 跟踪器
export function setDisposableTracker(tracker: IDisposableTracker | null): void {
	disposableTracker = tracker;
}

if (TRACK_DISPOSABLES) {
	// 这段不会被执行到
	const __is_disposable_tracked__ = '__is_disposable_tracked__';
	setDisposableTracker(new class implements IDisposableTracker {
		trackDisposable(x: IDisposable): void {
			const stack = new Error('Potentially leaked disposable').stack!;
			setTimeout(() => {
				if (!(x as any)[__is_disposable_tracked__]) {
					console.log(stack);
				}
			}, 3000);
		}

		setParent(child: IDisposable, parent: IDisposable | null): void {
			if (child && child !== Disposable.None) {
				try {
					(child as any)[__is_disposable_tracked__] = true;
				} catch {
					// noop
				}
			}
		}

		markAsDisposed(disposable: IDisposable): void {
			if (disposable && disposable !== Disposable.None) {
				try {
					(disposable as any)[__is_disposable_tracked__] = true;
				} catch {
					// noop
				}
			}
		}
		markAsSingleton(disposable: IDisposable): void { }
	});
}

function trackDisposable<T extends IDisposable>(x: T): T {
	disposableTracker?.trackDisposable(x);
	return x;
}

function markAsDisposed(disposable: IDisposable): void {
	disposableTracker?.markAsDisposed(disposable);
}

function setParentOfDisposable(child: IDisposable, parent: IDisposable | null): void {
	disposableTracker?.setParent(child, parent);
}

function setParentOfDisposables(children: IDisposable[], parent: IDisposable | null): void {
	if (!disposableTracker) {
		return;
	}
	for (const child of children) {
		disposableTracker.setParent(child, parent);
	}
}

/**
 * Indicates that the given object is a singleton which does not need to be disposed.
*/
export function markAsSingleton<T extends IDisposable>(singleton: T): T {
	disposableTracker?.markAsSingleton(singleton);
	return singleton;
}

export class MultiDisposeError extends Error {
	constructor(
		public readonly errors: any[]
	) {
		super(`Encountered errors while disposing of store. Errors: [${errors.join(', ')}]`);
	}
}

// Dispose 模式的核心接口
// 应用 Dispose 模式的类需要实现此接口
// 实现了此接口的类实例，可称之为 disposable
export interface IDisposable {
	dispose(): void;
}

export function isDisposable<E extends object>(thing: E): thing is E & IDisposable {
	return typeof (<IDisposable>thing).dispose === 'function' && (<IDisposable>thing).dispose.length === 0;
}

// dispose 一个 disposable 对象或 disposable 数组/迭代器
export function dispose<T extends IDisposable>(disposable: T): T;
export function dispose<T extends IDisposable>(disposable: T | undefined): T | undefined;
export function dispose<T extends IDisposable, A extends IterableIterator<T> = IterableIterator<T>>(disposables: IterableIterator<T>): A;
export function dispose<T extends IDisposable>(disposables: Array<T>): Array<T>;
export function dispose<T extends IDisposable>(disposables: ReadonlyArray<T>): ReadonlyArray<T>;
export function dispose<T extends IDisposable>(arg: T | IterableIterator<T> | undefined): any {
	if (Iterable.is(arg)) {
		let errors: any[] = [];

		for (const d of arg) {
			if (d) {
				try {
					d.dispose();
				} catch (e) {
					errors.push(e);
				}
			}
		}

		if (errors.length === 1) {
			throw errors[0];
		} else if (errors.length > 1) {
			throw new MultiDisposeError(errors);
		}

		return Array.isArray(arg) ? [] : arg;
	} else if (arg) {
		arg.dispose();
		return arg;
	}
}


// 把传入的多个 disposable 包装成一个组合型 disposable
export function combinedDisposable(...disposables: IDisposable[]): IDisposable {
	const parent = toDisposable(() => dispose(disposables));
	setParentOfDisposables(disposables, parent);
	return parent;
}

// 把函数包装成 disposable，后面 dispose 只会调用此函数一次
export function toDisposable(fn: () => void): IDisposable {
	const self = trackDisposable({
		dispose: once(() => {
			markAsDisposed(self);
			fn();
		})
	});
	return self;
}

// 存储 disposable 的集合类，它自己是个 disposable，在 dispose 的时候会 dispose 所有添加的子 disposable
export class DisposableStore implements IDisposable {

	static DISABLE_DISPOSED_WARNING = false;

	private _toDispose = new Set<IDisposable>();
	private _isDisposed = false;

	constructor() {
		trackDisposable(this);
	}

	/**
	 * Dispose of all registered disposables and mark this object as disposed.
	 *
	 * Any future disposables added to this object will be disposed of on `add`.
	 */
	public dispose(): void {
		if (this._isDisposed) {
			return;
		}

		markAsDisposed(this);
		this._isDisposed = true;
		this.clear();
	}

	/**
	 * Returns `true` if this object has been disposed
	 */
	public get isDisposed(): boolean {
		return this._isDisposed;
	}

	/**
	 * Dispose of all registered disposables but do not mark this object as disposed.
	 */
	public clear(): void {
		try {
			dispose(this._toDispose.values());
		} finally {
			this._toDispose.clear();
		}
	}

	public add<T extends IDisposable>(o: T): T {
		if (!o) {
			return o;
		}
		if ((o as unknown as DisposableStore) === this) {
			// 不能注册自己
			throw new Error('Cannot register a disposable on itself!');
		}

		setParentOfDisposable(o, this);
		if (this._isDisposed) {
			if (!DisposableStore.DISABLE_DISPOSED_WARNING) {
				// 警告日志，不能添加 disposable 了，否则它将泄露
				console.warn(new Error('Trying to add a disposable to a DisposableStore that has already been disposed of. The added object will be leaked!').stack);
			}
		} else {
			this._toDispose.add(o);
		}

		return o;
	}
}

// 抽象类，内含了 DisposableStore 实例
// 和 DisposableStore 不一样的地方在于，Disposable 是抽象类，用于被继承；
// 继承它的子类可以调用 _register 方法来添加 disposable
export abstract class Disposable implements IDisposable {

	// dispose 时不做任何事情的 disposable，通常作为占位符用于需要 IDisposable 的地方
	static readonly None = Object.freeze<IDisposable>({ dispose() { } });

	protected readonly _store = new DisposableStore();

	constructor() {
		trackDisposable(this);
		setParentOfDisposable(this._store, this);
	}

	public dispose(): void {
		markAsDisposed(this);

		this._store.dispose();
	}

	protected _register<T extends IDisposable>(o: T): T {
		if ((o as unknown as Disposable) === this) {
			// 不能注册自己
			throw new Error('Cannot register a disposable on itself!');
		}
		return this._store.add(o);
	}
}

/**
 * Manages the lifecycle of a disposable value that may be changed.
 * 可变 disposable，也就是可以丢弃旧的 disposable 而换成新的 disposable
 *
 * This ensures that when the disposable value is changed, the previously held disposable is disposed of. You can
 * also register a `MutableDisposable` on a `Disposable` to ensure it is automatically cleaned up.
 */
export class MutableDisposable<T extends IDisposable> implements IDisposable {
	private _value?: T;
	private _isDisposed = false;

	constructor() {
		trackDisposable(this);
	}

	get value(): T | undefined {
		return this._isDisposed ? undefined : this._value;
	}

	// 设置新的 disposable
	set value(value: T | undefined) {
		if (this._isDisposed || value === this._value) {
			return;
		}

		this._value?.dispose(); // dispose 旧的 disposable
		if (value) {
			setParentOfDisposable(value, this);
		}
		this._value = value;
	}

	clear() {
		this.value = undefined;
	}

	dispose(): void {
		this._isDisposed = true;
		markAsDisposed(this);
		this._value?.dispose();
		this._value = undefined;
	}

	/**
	 * Clears the value, but does not dispose it.
	 * The old value is returned.
	 * 把子 disposable 从此实例中泄露出来
	*/
	clearAndLeak(): T | undefined {
		const oldValue = this._value;
		this._value = undefined;
		if (oldValue) {
			setParentOfDisposable(oldValue, null);
		}
		return oldValue;
	}
}

// 引用计数 disposable
export class RefCountedDisposable {

	private _counter: number = 1;

	constructor(
		private readonly _disposable: IDisposable,
	) { }

	acquire() {
		this._counter++;
		return this;
	}

	release() {
		if (--this._counter === 0) {
			this._disposable.dispose();
		}
		return this;
	}
}

/**
 * A safe disposable can be `unset` so that a leaked reference (listener)
 * can be cut-off.
 */
export class SafeDisposable implements IDisposable {

	dispose: () => void = () => { };
	unset: () => void = () => { };
	isset: () => boolean = () => false;

	constructor() {
		trackDisposable(this);
	}

	set(fn: Function) {
		let callback: Function | undefined = fn;
		this.unset = () => callback = undefined;
		this.isset = () => callback !== undefined;
		this.dispose = () => {
			if (callback) {
				callback();
				callback = undefined;
				markAsDisposed(this);
			}
		};
		return this;
	}
}

// 引用对象接口，调用 dispose 方法就是消减一次引用
export interface IReference<T> extends IDisposable {
	readonly object: T;
}

// 引用对象集合抽象类
export abstract class ReferenceCollection<T> {

	private readonly references: Map<string, { readonly object: T; counter: number }> = new Map();

	// acquire 一次 key 对应的被引用对象，dispose 一次则消减此引用
	// 对于指定 key 而言，acquire 和 dispose 是成对的
	// key 对应的被引用对象不存在时，可以构造
	acquire(key: string, ...args: any[]): IReference<T> {
		// key 是被引用对象的标识
		let reference = this.references.get(key);

		if (!reference) {
			// 构造被引用对象
			reference = { counter: 0, object: this.createReferencedObject(key, ...args) };
			this.references.set(key, reference);
		}

		const { object } = reference;
		const dispose = once(() => {
			// 引用计数为 0 时，就会 destroy 此被引用对象
			if (--reference!.counter === 0) {
				this.destroyReferencedObject(key, reference!.object);
				this.references.delete(key);
			}
		});

		reference.counter++;

		// 既返回被引用对象，也返回 dispose 函数，它可用于递减一次引用计数
		return { object, dispose };
	}

	protected abstract createReferencedObject(key: string, ...args: any[]): T;
	protected abstract destroyReferencedObject(key: string, object: T): void;
}

/**
 * Unwraps a reference collection of promised values. Makes sure
 * references are disposed whenever promises get rejected.
 */
export class AsyncReferenceCollection<T> {

	constructor(private referenceCollection: ReferenceCollection<Promise<T>>) { }

	async acquire(key: string, ...args: any[]): Promise<IReference<T>> {
		const ref = this.referenceCollection.acquire(key, ...args);

		try {
			const object = await ref.object;

			return {
				object,
				dispose: () => ref.dispose()
			};
		} catch (error) {
			ref.dispose(); // 即使被引用对象 promise 被 reject，也 dispose 引用
			throw error;
		}
	}
}

// 永远不会消减引用的引用对象类
export class ImmortalReference<T> implements IReference<T> {
	constructor(public object: T) { }
	dispose(): void { /* noop */ }
}

// 执行传入的函数，函数入场是 DisposableStore 实例，函数执行完后会自动 dispose 此 DisposableStore 实例
export function disposeOnReturn(fn: (store: DisposableStore) => void): void {
	const store = new DisposableStore();
	try {
		fn(store);
	} finally {
		store.dispose();
	}
}
