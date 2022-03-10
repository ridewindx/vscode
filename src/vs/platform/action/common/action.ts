/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriDto } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ContextKeyExpression } from 'vs/platform/contextkey/common/contextkey';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';

export interface ILocalizedString {

	/**
	 * The localized value of the string.
	 */
	value: string;

	/**
	 * The original (non localized value of the string)
	 */
	original: string;
}

export interface ICommandActionTitle extends ILocalizedString {

	/**
	 * The title with a mnemonic designation. && precedes the mnemonic.
	 */
	mnemonicTitle?: string;
}

export type Icon = { dark?: URI; light?: URI } | ThemeIcon;

export interface ICommandAction {
	id: string;
	title: string | ICommandActionTitle;
	shortTitle?: string | ICommandActionTitle;
	category?: string | ILocalizedString;
	tooltip?: string | ILocalizedString;
	icon?: Icon;
	source?: string;
	precondition?: ContextKeyExpression; // 匹配上下文以是否使能 enabled 此命令
	toggled?: ContextKeyExpression | { condition: ContextKeyExpression; icon?: Icon; tooltip?: string; title?: string | ILocalizedString }; // 匹配上下文以是否 checked 此命令
}

export type ISerializableCommandAction = UriDto<ICommandAction>;
