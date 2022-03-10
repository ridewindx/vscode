/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toLocalISOString } from 'vs/base/common/date';
import { memoize } from 'vs/base/common/decorators';
import { FileAccess } from 'vs/base/common/network';
import { dirname, join, normalize, resolve } from 'vs/base/common/path';
import { env } from 'vs/base/common/process';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { ExtensionKind, IDebugParams, IExtensionHostDebugParams, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IProductService } from 'vs/platform/product/common/productService';

export interface INativeEnvironmentPaths {

	/**
	 * The user data directory to use for anything that should be
	 * persisted except for the content that is meant for the `homeDir`.
	 *
	 * Only one instance of VSCode can use the same `userDataDir`.
	 * 同一个用户数据目录只能被一个 VS Code 实例使用
	 */
	userDataDir: string;

	/**
	 * The user home directory mainly used for persisting extensions
	 * and global configuration that should be shared across all
	 * versions.
	 * Windows 下用户的 HOME 目录
	 * 其下有 .vscode 目录：extensions 扩展持久化目录；argv.json 文件存放不随产品版本变更而变更的全局配置
	 */
	homeDir: string;

	/**
	 * OS tmp dir.
	 */
	tmpDir: string;
}

export abstract class AbstractNativeEnvironmentService implements INativeEnvironmentService {

	declare readonly _serviceBrand: undefined;

	@memoize
	get appRoot(): string { return dirname(FileAccess.asFileUri('', require).fsPath); }

	@memoize
	get userHome(): URI { return URI.file(this.paths.homeDir); }

	@memoize
	get userDataPath(): string { return this.paths.userDataDir; }

	// App 设置目录
	@memoize
	get appSettingsHome(): URI { return URI.file(join(this.userDataPath, 'User')); }

	@memoize
	get tmpDir(): URI { return URI.file(this.paths.tmpDir); }

	@memoize
	get cacheHome(): URI { return URI.file(this.userDataPath); }

	@memoize
	get userRoamingDataHome(): URI { return this.appSettingsHome; }

	@memoize
	get settingsResource(): URI { return joinPath(this.userRoamingDataHome, 'settings.json'); }

	@memoize
	get userDataSyncHome(): URI { return joinPath(this.userRoamingDataHome, 'sync'); }

	// 存放日志的目录，含有当时日期时间命名的子目录
	get logsPath(): string {
		if (!this.args.logsPath) {
			// 以当前日期时间生成子目录名
			const key = toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '');
			this.args.logsPath = join(this.userDataPath, 'logs', key);
		}

		return this.args.logsPath;
	}

	@memoize
	get userDataSyncLogResource(): URI { return URI.file(join(this.logsPath, 'userDataSync.log')); }

	@memoize
	get sync(): 'on' | 'off' | undefined { return this.args.sync; }

	// 机器设置文件，用于 remote 服务端环境
	@memoize
	get machineSettingsResource(): URI { return joinPath(URI.file(join(this.userDataPath, 'Machine')), 'settings.json'); }

	@memoize
	get globalStorageHome(): URI { return URI.joinPath(this.appSettingsHome, 'globalStorage'); }

	@memoize
	get workspaceStorageHome(): URI { return URI.joinPath(this.appSettingsHome, 'workspaceStorage'); }

	@memoize
	get keybindingsResource(): URI { return joinPath(this.userRoamingDataHome, 'keybindings.json'); }

	@memoize
	get keyboardLayoutResource(): URI { return joinPath(this.userRoamingDataHome, 'keyboardLayout.json'); }

	// 版本无关的全局配置文件，Windows 下是用户 HOME 目录下的 .vscode/argv.json
	@memoize
	get argvResource(): URI {
		const vscodePortable = env['VSCODE_PORTABLE'];
		if (vscodePortable) {
			return URI.file(join(vscodePortable, 'argv.json'));
		}

		return joinPath(this.userHome, this.productService.dataFolderName, 'argv.json');
	}

	@memoize
	get snippetsHome(): URI { return joinPath(this.userRoamingDataHome, 'snippets'); }

	@memoize
	get isExtensionDevelopment(): boolean { return !!this.args.extensionDevelopmentPath; }

	// 未命名工作区的目录
	@memoize
	get untitledWorkspacesHome(): URI { return URI.file(join(this.userDataPath, 'Workspaces')); }

	@memoize
	get installSourcePath(): string { return join(this.userDataPath, 'installSource'); }

	// 内置扩展的目录
	@memoize
	get builtinExtensionsPath(): string {
		const cliBuiltinExtensionsDir = this.args['builtin-extensions-dir'];
		if (cliBuiltinExtensionsDir) {
			return resolve(cliBuiltinExtensionsDir);
		}

		return normalize(join(FileAccess.asFileUri('', require).fsPath, '..', 'extensions'));
	}

	// 扩展下载的目录
	get extensionsDownloadPath(): string {
		const cliExtensionsDownloadDir = this.args['extensions-download-dir'];
		if (cliExtensionsDownloadDir) {
			return resolve(cliExtensionsDownloadDir);
		}

		return join(this.userDataPath, 'CachedExtensionVSIXs');
	}

	// 非内置扩展的目录
	@memoize
	get extensionsPath(): string {
		const cliExtensionsDir = this.args['extensions-dir'];
		if (cliExtensionsDir) {
			return resolve(cliExtensionsDir);
		}

		const vscodeExtensions = env['VSCODE_EXTENSIONS'];
		if (vscodeExtensions) {
			return vscodeExtensions;
		}

		const vscodePortable = env['VSCODE_PORTABLE'];
		if (vscodePortable) {
			return join(vscodePortable, 'extensions');
		}

		// Windows 下是用户 HOME 目录下的 .vscode/extensions 目录
		return joinPath(this.userHome, this.productService.dataFolderName, 'extensions').fsPath;
	}

	@memoize
	get extensionDevelopmentLocationURI(): URI[] | undefined {
		const extensionDevelopmentPaths = this.args.extensionDevelopmentPath;
		if (Array.isArray(extensionDevelopmentPaths)) {
			return extensionDevelopmentPaths.map(extensionDevelopmentPath => {
				if (/^[^:/?#]+?:\/\//.test(extensionDevelopmentPath)) {
					return URI.parse(extensionDevelopmentPath);
				}

				return URI.file(normalize(extensionDevelopmentPath));
			});
		}

		return undefined;
	}

	@memoize
	get extensionDevelopmentKind(): ExtensionKind[] | undefined {
		return this.args.extensionDevelopmentKind?.map(kind => kind === 'ui' || kind === 'workspace' || kind === 'web' ? kind : 'workspace');
	}

	@memoize
	get extensionTestsLocationURI(): URI | undefined {
		const extensionTestsPath = this.args.extensionTestsPath;
		if (extensionTestsPath) {
			if (/^[^:/?#]+?:\/\//.test(extensionTestsPath)) {
				return URI.parse(extensionTestsPath);
			}

			return URI.file(normalize(extensionTestsPath));
		}

		return undefined;
	}

	get disableExtensions(): boolean | string[] {
		if (this.args['disable-extensions']) {
			return true;
		}

		const disableExtensions = this.args['disable-extension'];
		if (disableExtensions) {
			if (typeof disableExtensions === 'string') {
				return [disableExtensions];
			}

			if (Array.isArray(disableExtensions) && disableExtensions.length > 0) {
				return disableExtensions;
			}
		}

		return false;
	}

	@memoize
	get debugExtensionHost(): IExtensionHostDebugParams { return parseExtensionHostPort(this.args, this.isBuilt); }
	get debugRenderer(): boolean { return !!this.args.debugRenderer; }

	get isBuilt(): boolean { return !env['VSCODE_DEV']; } // 非开发
	get verbose(): boolean { return !!this.args.verbose; }
	get logLevel(): string | undefined { return this.args.log; }

	// 存储 machine id 的文件路径
	@memoize
	get serviceMachineIdResource(): URI { return joinPath(URI.file(this.userDataPath), 'machineid'); }

	get crashReporterId(): string | undefined { return this.args['crash-reporter-id']; }
	get crashReporterDirectory(): string | undefined { return this.args['crash-reporter-directory']; }

	get driverHandle(): string | undefined { return this.args['driver']; }

	@memoize
	get telemetryLogResource(): URI { return URI.file(join(this.logsPath, 'telemetry.log')); }
	get disableTelemetry(): boolean { return !!this.args['disable-telemetry']; }

	@memoize
	get disableWorkspaceTrust(): boolean { return !!this.args['disable-workspace-trust']; }

	get args(): NativeParsedArgs { return this._args; }

	constructor(
		private readonly _args: NativeParsedArgs,
		private readonly paths: INativeEnvironmentPaths,
		protected readonly productService: IProductService
	) { }
}

export function parseExtensionHostPort(args: NativeParsedArgs, isBuild: boolean): IExtensionHostDebugParams {
	return parseDebugParams(args['inspect-extensions'], args['inspect-brk-extensions'], 5870, isBuild, args.debugId, args.extensionEnvironment);
}

export function parseSearchPort(args: NativeParsedArgs, isBuild: boolean): IDebugParams {
	return parseDebugParams(args['inspect-search'], args['inspect-brk-search'], 5876, isBuild, args.extensionEnvironment);
}

export function parsePtyHostPort(args: NativeParsedArgs, isBuild: boolean): IDebugParams {
	return parseDebugParams(args['inspect-ptyhost'], args['inspect-brk-ptyhost'], 5877, isBuild, args.extensionEnvironment);
}

function parseDebugParams(debugArg: string | undefined, debugBrkArg: string | undefined, defaultBuildPort: number, isBuild: boolean, debugId?: string, environmentString?: string): IExtensionHostDebugParams {
	const portStr = debugBrkArg || debugArg;
	const port = Number(portStr) || (!isBuild ? defaultBuildPort : null);
	const brk = port ? Boolean(!!debugBrkArg) : false;
	let env: Record<string, string> | undefined;
	if (environmentString) {
		try {
			env = JSON.parse(environmentString);
		} catch {
			// ignore
		}
	}

	return { port, break: brk, debugId, env };
}
