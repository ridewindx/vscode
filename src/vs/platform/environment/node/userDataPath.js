/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="../../../../typings/require.d.ts" />

//@ts-check
(function () {
	'use strict';

	/**
	 * @typedef {import('../../environment/common/argv').NativeParsedArgs} NativeParsedArgs
	 *
	 * @param {typeof import('path')} path
	 * @param {typeof import('os')} os
	 * @param {string} productName
	 * @param {string} cwd
	 */
	function factory(path, os, productName, cwd) {

		/**
		 * @param {NativeParsedArgs} cliArgs
		 *
		 * @returns {string}
		 */
		function getUserDataPath(cliArgs) {
			const userDataPath = doGetUserDataPath(cliArgs);
			const pathsToResolve = [userDataPath];

			// If the user-data-path is not absolute, make
			// sure to resolve it against the passed in
			// current working directory. We cannot use the
			// node.js `path.resolve()` logic because it will
			// not pick up our `VSCODE_CWD` environment variable
			// (https://github.com/microsoft/vscode/issues/120269)
			if (!path.isAbsolute(userDataPath)) {
				pathsToResolve.unshift(cwd);
			}

			return path.resolve(...pathsToResolve);
		}

		/**
		 * @param {NativeParsedArgs} cliArgs
		 *
		 * @returns {string}
		 */
		function doGetUserDataPath(cliArgs) {

			// 1. Support portable mode
			// 若有 VSCODE_PORTABLE 环境变量，说明是可移植模式，则取可移植目录下的 user-data 目录
			const portablePath = process.env['VSCODE_PORTABLE'];
			if (portablePath) {
				return path.join(portablePath, 'user-data');
			}

			// 2. Support global VSCODE_APPDATA environment variable
			// 若有 VSCODE_APPDATA 环境变量，则取这个目录下的产品名目录
			let appDataPath = process.env['VSCODE_APPDATA'];
			if (appDataPath) {
				return path.join(appDataPath, productName);
			}

			// With Electron>=13 --user-data-dir switch will be propagated to
			// all processes https://github.com/electron/electron/blob/1897b14af36a02e9aa7e4d814159303441548251/shell/browser/electron_browser_client.cc#L546-L553
			// Check VSCODE_PORTABLE and VSCODE_APPDATA before this case to get correct values.
			// 3. Support explicit --user-data-dir
			// 取命令行参数 --user-data-dir 指定的目录
			// 若不是绝对目录，则会相对于当前目录
			const cliPath = cliArgs['user-data-dir'];
			if (cliPath) {
				return cliPath;
			}

			// 4. Otherwise check per platform
			switch (process.platform) {
				case 'win32':
					appDataPath = process.env['APPDATA'];
					if (!appDataPath) {
						const userProfile = process.env['USERPROFILE'];
						if (typeof userProfile !== 'string') {
							throw new Error('Windows: Unexpected undefined %USERPROFILE% environment variable');
						}

						appDataPath = path.join(userProfile, 'AppData', 'Roaming');
					}
					break;
				case 'darwin':
					appDataPath = path.join(os.homedir(), 'Library', 'Application Support');
					break;
				case 'linux':
					appDataPath = process.env['XDG_CONFIG_HOME'] || path.join(os.homedir(), '.config');
					break;
				default:
					throw new Error('Platform not supported');
			}

			// 取特定平台的 App 数据目录下的产品名目录
			return path.join(appDataPath, productName);
		}

		return {
			getUserDataPath
		};
	}

	if (typeof define === 'function') {
		define(['require', 'path', 'os', 'vs/base/common/network', 'vs/base/common/resources', 'vs/base/common/process'], function (
			require,
			/** @type {typeof import('path')} */ path,
			/** @type {typeof import('os')} */ os,
			/** @type {typeof import('../../../base/common/network')} */ network,
			/** @type {typeof import("../../../base/common/resources")} */ resources,
			/** @type {typeof import("../../../base/common/process")} */ process
		) {
			const rootPath = resources.dirname(network.FileAccess.asFileUri('', require));
			const pkg = require.__$__nodeRequire(resources.joinPath(rootPath, 'package.json').fsPath);

			return factory(path, os, pkg.name, process.cwd());
		}); // amd
	} else if (typeof module === 'object' && typeof module.exports === 'object') {
		const pkg = require('../../../../../package.json');
		const path = require('path');
		const os = require('os');

		// 注意这里的 VSCODE_CWD 环境变量指定当前目录
		module.exports = factory(path, os, pkg.name, process.env['VSCODE_CWD'] || process.cwd()); // commonjs
	} else {
		throw new Error('Unknown context');
	}
}());
