// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
* WARNING: do not modify this file by hand!
* it was automatically generated by the bridge generator
* if you made changes to the source code and need to update this file, run:
*  npm run generate-bridge-file test/unittests/scripts/component_bridges/fixtures/complex-types-imported.ts
*/

import './complex-types-imported.js';
/**
* @typedef {{
* smth:string,
* }}
*/
// @ts-ignore we export this for Closure not TS
export let DOMNode;
/**
* @typedef {EnumSetting|BooleanSetting}
*/
// @ts-ignore we export this for Closure not TS
export let Setting;
/**
* @typedef {{
* name:string,
* type:"enum",
* title:string,
* options:Array.<!EnumSettingOption>,
* value:string,
* }}
*/
// @ts-ignore we export this for Closure not TS
export let EnumSetting;
/**
* @typedef {{
* name:string,
* type:"boolean",
* title:string,
* options:Array.<!BooleanSettingOption>,
* value:boolean,
* }}
*/
// @ts-ignore we export this for Closure not TS
export let BooleanSetting;
/**
* @typedef {"boolean"|"enum"}
*/
// @ts-ignore we export this for Closure not TS
export let SettingType;
/**
* @typedef {{
* title:string,
* value:string,
* }}
*/
// @ts-ignore we export this for Closure not TS
export let EnumSettingOption;
/**
* @typedef {{
* title:string,
* value:boolean,
* }}
*/
// @ts-ignore we export this for Closure not TS
export let BooleanSettingOption;
// eslint-disable-next-line no-unused-vars
export class LayoutPaneClosureInterface extends HTMLElement {
  /**
  * @param {{selectedNode: ?DOMNode, settings: !Array.<!Setting>}} data
  */
  set data(data) {
  }
}
/**
* @return {!LayoutPaneClosureInterface}
*/
export function createLayoutPane() {
  return /** @type {!LayoutPaneClosureInterface} */ (document.createElement('devtools-layout-pane'));
}
