/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { generateUuid } from 'vs/base/common/uuid';
import { ipcMessagePort, ipcRenderer } from 'vs/base/parts/sandbox/electron-sandbox/globals';

interface IMessageChannelResult {
	nonce: string;
	port: MessagePort;
	source: unknown;
}

// 通过请求 channel 和响应 channel 结合 preload.js 中的 ipcMessagePort，从主进程拿到 MessagePort
// 参见：https://www.electronjs.org/docs/latest/tutorial/message-ports
export async function acquirePort(requestChannel: string | undefined, responseChannel: string, nonce = generateUuid()): Promise<MessagePort> {

	// Get ready to acquire the message port from the
	// provided `responseChannel` via preload helper.
	// 实现见 src/vs/base/parts/sandbox/electron-browser/preload.js
	ipcMessagePort.acquire(responseChannel, nonce);

	// If a `requestChannel` is provided, we are in charge
	// to trigger acquisition of the message port from main
	if (typeof requestChannel === 'string') {
		ipcRenderer.send(requestChannel, nonce);
	}

	// Wait until the main side has returned the `MessagePort`
	// We need to filter by the `nonce` to ensure we listen
	// to the right response.
	const onMessageChannelResult = Event.fromDOMEventEmitter<IMessageChannelResult>(window, 'message', (e: MessageEvent) => ({ nonce: e.data, port: e.ports[0], source: e.source }));
	// 核对 nonce 和 source
	const { port } = await Event.toPromise(Event.once(Event.filter(onMessageChannelResult, e => e.nonce === nonce && e.source === window)));

	return port;
}
