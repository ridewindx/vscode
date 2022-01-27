/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IAddress } from 'vs/platform/remote/common/remoteAgentConnection';
import { extractLocalHostUriMetaDataForPortMapping, ITunnelService, RemoteTunnel } from 'vs/platform/tunnel/common/tunnel';

export interface IWebviewPortMapping {
	readonly webviewPort: number; // webview 直接访问的本地 port
	readonly extensionHostPort: number; // 扩展 start 的 web server 的 port
}

/**
 * Manages port mappings for a single webview.
 * 为统一访问本地扩展和远程扩展 start 的 web server，建立端口映射
 * 见 https://code.visualstudio.com/api/advanced-topics/remote-extensions#option-2-use-a-port-mapping
 */
export class WebviewPortMappingManager implements IDisposable {

	private readonly _tunnels = new Map<number, RemoteTunnel>();

	constructor(
		private readonly _getExtensionLocation: () => URI | undefined,
		private readonly _getMappings: () => readonly IWebviewPortMapping[],
		private readonly tunnelService: ITunnelService
	) { }

	public async getRedirect(resolveAuthority: IAddress | null | undefined, url: string): Promise<string | undefined> {
		const uri = URI.parse(url);
		const requestLocalHostInfo = extractLocalHostUriMetaDataForPortMapping(uri);
		if (!requestLocalHostInfo) {
			return undefined;
		}

		for (const mapping of this._getMappings()) {
			if (mapping.webviewPort === requestLocalHostInfo.port) { // 找到要访问的 webview 的 port
				const extensionLocation = this._getExtensionLocation();
				if (extensionLocation && extensionLocation.scheme === Schemas.vscodeRemote) { // 若是远程环境的扩展
					// 建立和远程扩展的 web server 的通信隧道
					const tunnel = resolveAuthority && await this.getOrCreateTunnel(resolveAuthority, mapping.extensionHostPort);
					if (tunnel) {
						if (tunnel.tunnelLocalPort === mapping.webviewPort) {
							// 如果恰好等于 webview 的 port，那就不用改
							return undefined;
						}
						// 改为访问隧道的本地 port
						return encodeURI(uri.with({
							authority: `127.0.0.1:${tunnel.tunnelLocalPort}`,
						}).toString(true));
					}
				}

				// 若是非远程扩展的情况，改为访问扩展的本地 port
				if (mapping.webviewPort !== mapping.extensionHostPort) {
					return encodeURI(uri.with({
						authority: `${requestLocalHostInfo.address}:${mapping.extensionHostPort}`
					}).toString(true));
				}
			}
		}

		return undefined;
	}

	async dispose() {
		for (const tunnel of this._tunnels.values()) {
			await tunnel.dispose();
		}
		this._tunnels.clear();
	}

	private async getOrCreateTunnel(remoteAuthority: IAddress, remotePort: number): Promise<RemoteTunnel | undefined> {
		const existing = this._tunnels.get(remotePort);
		if (existing) {
			return existing;
		}
		const tunnel = await this.tunnelService.openTunnel({ getAddress: async () => remoteAuthority }, undefined, remotePort);
		if (tunnel) {
			this._tunnels.set(remotePort, tunnel);
		}
		return tunnel;
	}
}
