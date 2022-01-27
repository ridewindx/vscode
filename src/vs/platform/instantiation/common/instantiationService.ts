/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IdleValue } from 'vs/base/common/async';
import { illegalState } from 'vs/base/common/errors';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Graph } from 'vs/platform/instantiation/common/graph';
import { IInstantiationService, ServiceIdentifier, ServicesAccessor, _util } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';

// TRACING
const _enableTracing = false;

class CyclicDependencyError extends Error {
	constructor(graph: Graph<any>) {
		super('cyclic dependency between services');
		this.message = graph.findCycleSlow() ?? `UNABLE to detect cycle, dumping graph: \n${graph.toString()}`;
	}
}

// 服务实例化服务类，它是服务容器
export class InstantiationService implements IInstantiationService {

	declare readonly _serviceBrand: undefined;

	private readonly _services: ServiceCollection;
	private readonly _strict: boolean;
	private readonly _parent?: InstantiationService;

	// strict 决定了是否在找不到非可选的服务依赖时报错
	constructor(services: ServiceCollection = new ServiceCollection(), strict: boolean = false, parent?: InstantiationService) {
		this._services = services;
		this._strict = strict;
		this._parent = parent;

		this._services.set(IInstantiationService, this);
	}

	// 创建子服务容器
	// 使用它可以创建多层次式的服务容器层级，子服务容器中的服务可以依赖父服务容器中的服务，反之则不行
	createChild(services: ServiceCollection): IInstantiationService {
		return new InstantiationService(services, this._strict, this);
	}

	// 调用函数，传入服务访问器，在被调用函数中可以获取任何服务实例
	// 若访问还没实例化的服务，会被自动实例化
	invokeFunction<R, TS extends any[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R {
		let _trace = Trace.traceInvocation(fn);
		let _done = false;
		try {
			const accessor: ServicesAccessor = {
				get: <T>(id: ServiceIdentifier<T>) => {

					if (_done) {
						throw illegalState('service accessor is only valid during the invocation of its target method');
					}

					const result = this._getOrCreateServiceInstance(id, _trace);
					if (!result) {
						throw new Error(`[invokeFunction] unknown service '${id}'`);
					}
					return result;
				}
			};
			return fn(accessor, ...args);
		} finally {
			_done = true;
			_trace.stop();
		}
	}

	// 手动实例化服务
	createInstance(ctorOrDescriptor: any | SyncDescriptor<any>, ...rest: any[]): any {
		let _trace: Trace;
		let result: any;
		if (ctorOrDescriptor instanceof SyncDescriptor) {
			_trace = Trace.traceCreation(ctorOrDescriptor.ctor);
			// 把 SyncDescriptor 的 staticArguments 和这里的 rest 拼接起来，作为实例化服务的构造函数里非服务依赖的参数
			// 也就是既可以在创建 SyncDescriptor 的时候传入非服务依赖参数，也可以在调用 createInstance 的时候传入
			result = this._createInstance(ctorOrDescriptor.ctor, ctorOrDescriptor.staticArguments.concat(rest), _trace);
		} else {
			_trace = Trace.traceCreation(ctorOrDescriptor);
			// 没有服务依赖的服务构造函数
			result = this._createInstance(ctorOrDescriptor, rest, _trace);
		}
		_trace.stop();
		return result;
	}

	private _createInstance<T>(ctor: any, args: any[] = [], _trace: Trace): T {

		// arguments defined by service decorators
		let serviceDependencies = _util.getServiceDependencies(ctor).sort((a, b) => a.index - b.index);
		let serviceArgs: any[] = [];
		for (const dependency of serviceDependencies) {
			let service = this._getOrCreateServiceInstance(dependency.id, _trace);
			if (!service && this._strict && !dependency.optional) {
				throw new Error(`[createInstance] ${ctor.name} depends on UNKNOWN service ${dependency.id}.`);
			}
			serviceArgs.push(service);
		}

		let firstServiceArgPos = serviceDependencies.length > 0 ? serviceDependencies[0].index : args.length;

		// check for argument mismatches, adjust static args if needed
		// 若传入的 args 参数个数和服务依赖参数所在位置发生冲突，
		// 则对 args 多删少补，补的是 undefined
		if (args.length !== firstServiceArgPos) {
			console.warn(`[createInstance] First service dependency of ${ctor.name} at position ${firstServiceArgPos + 1} conflicts with ${args.length} static arguments`);

			let delta = firstServiceArgPos - args.length;
			if (delta > 0) {
				args = args.concat(new Array(delta));
			} else {
				args = args.slice(0, firstServiceArgPos);
			}
		}

		// now create the instance
		// 使用构造函数实例化目标服务
		// 普通参数在前，服务依赖参数在后
		return <T>new ctor(...[...args, ...serviceArgs]);
	}

	private _setServiceInstance<T>(id: ServiceIdentifier<T>, instance: T): void {
		if (this._services.get(id) instanceof SyncDescriptor) {
			// 把存储的 SyncDescriptor 替换为真正的服务实例
			this._services.set(id, instance);
		} else if (this._parent) {
			this._parent._setServiceInstance(id, instance);
		} else {
			throw new Error('illegalState - setting UNKNOWN service instance');
		}
	}

	private _getServiceInstanceOrDescriptor<T>(id: ServiceIdentifier<T>): T | SyncDescriptor<T> {
		let instanceOrDesc = this._services.get(id);
		if (!instanceOrDesc && this._parent) {
			// 若此服务容器中没有，则到父服务容器中查找
			return this._parent._getServiceInstanceOrDescriptor(id);
		} else {
			return instanceOrDesc;
		}
	}

	protected _getOrCreateServiceInstance<T>(id: ServiceIdentifier<T>, _trace: Trace): T {
		let thing = this._getServiceInstanceOrDescriptor(id);
		if (thing instanceof SyncDescriptor) {
			return this._safeCreateAndCacheServiceInstance(id, thing, _trace.branch(id, true));
		} else {
			// 已实例化，直接返回它
			_trace.branch(id, false);
			return thing;
		}
	}

	private readonly _activeInstantiations = new Set<ServiceIdentifier<any>>();


	private _safeCreateAndCacheServiceInstance<T>(id: ServiceIdentifier<T>, desc: SyncDescriptor<T>, _trace: Trace): T {
		if (this._activeInstantiations.has(id)) {
			throw new Error(`illegal state - RECURSIVELY instantiating service '${id}'`);
		}
		this._activeInstantiations.add(id);
		try {
			return this._createAndCacheServiceInstance(id, desc, _trace);
		} finally {
			this._activeInstantiations.delete(id);
		}
	}

	private _createAndCacheServiceInstance<T>(id: ServiceIdentifier<T>, desc: SyncDescriptor<T>, _trace: Trace): T {

		type Triple = { id: ServiceIdentifier<any>, desc: SyncDescriptor<any>, _trace: Trace; };
		const graph = new Graph<Triple>(data => data.id.toString());

		// 自顶向下构建服务依赖的有向图，最顶上就是要实例化的目标服务
		let cycleCount = 0;
		const stack = [{ id, desc, _trace }]; // 要实例化的目标服务也要放入有向图
		while (stack.length) {
			const item = stack.pop()!;
			graph.lookupOrInsertNode(item);

			// a weak but working heuristic for cycle checks
			// 检查循环依赖的经验方法，就是看看是否循环了非常多次数
			if (cycleCount++ > 1000) {
				throw new CyclicDependencyError(graph);
			}

			// check all dependencies for existence and if they need to be created first
			// 遍历服务类的构造函数中存储的依赖
			for (let dependency of _util.getServiceDependencies(item.desc.ctor)) {

				let instanceOrDesc = this._getServiceInstanceOrDescriptor(dependency.id);
				if (!instanceOrDesc && !dependency.optional) {
					console.warn(`[createInstance] ${id} depends on ${dependency.id} which is NOT registered.`);
				}

				if (instanceOrDesc instanceof SyncDescriptor) {
					// 把还没有实例化的依赖服务放入有向图
					const d = { id: dependency.id, desc: instanceOrDesc, _trace: item._trace.branch(dependency.id, true) };
					graph.insertEdge(item, d);
					stack.push(d);
				}
			}
		}

		// 自底向上逐步实例化这些依赖服务，直到最顶上实例化目标服务
		// 最下面的 roots 节点们，要么不依赖其他服务，要么依赖的服务已经实例化
		while (true) {
			const roots = graph.roots();

			// if there is no more roots but still
			// nodes in the graph we have a cycle
			if (roots.length === 0) {
				if (!graph.isEmpty()) {
					throw new CyclicDependencyError(graph);
				}
				// 有向图中已经没有节点，说明所有依赖服务都已实例化完成
				break;
			}

			for (const { data } of roots) {
				// Repeat the check for this still being a service sync descriptor. That's because
				// instantiating a dependency might have side-effect and recursively trigger instantiation
				// so that some dependencies are now fullfilled already.
				const instanceOrDesc = this._getServiceInstanceOrDescriptor(data.id);
				if (instanceOrDesc instanceof SyncDescriptor) {
					// create instance and overwrite the service collections
					const instance = this._createServiceInstanceWithOwner(data.id, data.desc.ctor, data.desc.staticArguments, data.desc.supportsDelayedInstantiation, data._trace);
					// 把存储的 SyncDescriptor 替换为真正的服务实例
					this._setServiceInstance(data.id, instance);
				}
				graph.removeNode(data);
			}
		}
		return <T>this._getServiceInstanceOrDescriptor(id); // 返回的肯定是服务实例，而不再是 SyncDescriptor
	}

	private _createServiceInstanceWithOwner<T>(id: ServiceIdentifier<T>, ctor: any, args: any[] = [], supportsDelayedInstantiation: boolean, _trace: Trace): T {
		if (this._services.get(id) instanceof SyncDescriptor) {
			return this._createServiceInstance(ctor, args, supportsDelayedInstantiation, _trace);
		} else if (this._parent) {
			// 若服务不是注册在此服务容器中，则让父服务容器来实例化它
			return this._parent._createServiceInstanceWithOwner(id, ctor, args, supportsDelayedInstantiation, _trace);
		} else {
			throw new Error(`illegalState - creating UNKNOWN service instance ${ctor.name}`);
		}
	}

	private _createServiceInstance<T>(ctor: any, args: any[] = [], _supportsDelayedInstantiation: boolean, _trace: Trace): T {
		if (!_supportsDelayedInstantiation) {
			// eager instantiation
			return this._createInstance(ctor, args, _trace);

		} else {
			// Return a proxy object that's backed by an idle value. That
			// strategy is to instantiate services in our idle time or when actually
			// needed but not when injected into a consumer
			// 在空闲时或在真正实际使用这个服务实例时创建
			const idle = new IdleValue<any>(() => this._createInstance<T>(ctor, args, _trace));
			return <T>new Proxy(Object.create(null), {
				get(target: any, key: PropertyKey): any {
					if (key in target) {
						return target[key];
					}
					let obj = idle.value;
					let prop = obj[key];
					if (typeof prop !== 'function') {
						return prop;
					}
					prop = prop.bind(obj);
					target[key] = prop;
					return prop;
				},
				set(_target: T, p: PropertyKey, value: any): boolean {
					idle.value[p] = value;
					return true;
				}
			});
		}
	}
}

//#region -- tracing ---

const enum TraceType {
	Creation, Invocation, Branch
}

export class Trace {

	private static readonly _None = new class extends Trace {
		constructor() { super(-1, null); }
		override stop() { }
		override branch() { return this; }
	};

	static traceInvocation(ctor: any): Trace {
		return !_enableTracing ? Trace._None : new Trace(TraceType.Invocation, ctor.name || (ctor.toString() as string).substring(0, 42).replace(/\n/g, ''));
	}

	static traceCreation(ctor: any): Trace {
		return !_enableTracing ? Trace._None : new Trace(TraceType.Creation, ctor.name);
	}

	private static _totals: number = 0;
	private readonly _start: number = Date.now();
	private readonly _dep: [ServiceIdentifier<any>, boolean, Trace?][] = [];

	private constructor(
		readonly type: TraceType,
		readonly name: string | null
	) { }

	branch(id: ServiceIdentifier<any>, first: boolean): Trace {
		let child = new Trace(TraceType.Branch, id.toString());
		this._dep.push([id, first, child]);
		return child;
	}

	stop() {
		let dur = Date.now() - this._start;
		Trace._totals += dur;

		let causedCreation = false;

		function printChild(n: number, trace: Trace) {
			let res: string[] = [];
			let prefix = new Array(n + 1).join('\t');
			for (const [id, first, child] of trace._dep) {
				if (first && child) {
					causedCreation = true;
					res.push(`${prefix}CREATES -> ${id}`);
					let nested = printChild(n + 1, child);
					if (nested) {
						res.push(nested);
					}
				} else {
					res.push(`${prefix}uses -> ${id}`);
				}
			}
			return res.join('\n');
		}

		let lines = [
			`${this.type === TraceType.Creation ? 'CREATE' : 'CALL'} ${this.name}`,
			`${printChild(1, this)}`,
			`DONE, took ${dur.toFixed(2)}ms (grand total ${Trace._totals.toFixed(2)}ms)`
		];

		if (dur > 2 || causedCreation) {
			console.log(lines.join('\n'));
		}
	}
}

//#endregion
