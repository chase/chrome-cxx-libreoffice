// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';

export class ComputedStyleModel extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
  private nodeInternal: SDK.DOMModel.DOMNode|null;
  private cssModelInternal: SDK.CSSModel.CSSModel|null;
  private eventListeners: Common.EventTarget.EventDescriptor[];
  private frameResizedTimer?: number;
  private computedStylePromise?: Promise<ComputedStyle|null>;
  constructor() {
    super();
    this.cssModelInternal = null;
    this.eventListeners = [];
    this.nodeInternal = UI.Context.Context.instance().flavor(SDK.DOMModel.DOMNode);
    UI.Context.Context.instance().addFlavorChangeListener(SDK.DOMModel.DOMNode, this.onNodeChanged, this);
  }

  node(): SDK.DOMModel.DOMNode|null {
    return this.nodeInternal;
  }

  cssModel(): SDK.CSSModel.CSSModel|null {
    return this.cssModelInternal && this.cssModelInternal.isEnabled() ? this.cssModelInternal : null;
  }

  private onNodeChanged(event: Common.EventTarget.EventTargetEvent<SDK.DOMModel.DOMNode|null>): void {
    this.nodeInternal = event.data;
    this.updateModel(this.nodeInternal ? this.nodeInternal.domModel().cssModel() : null);
    this.onCSSModelChanged(null);
  }

  private updateModel(cssModel: SDK.CSSModel.CSSModel|null): void {
    if (this.cssModelInternal === cssModel) {
      return;
    }
    Common.EventTarget.removeEventListeners(this.eventListeners);
    this.cssModelInternal = cssModel;
    const domModel = cssModel ? cssModel.domModel() : null;
    const resourceTreeModel = cssModel ? cssModel.target().model(SDK.ResourceTreeModel.ResourceTreeModel) : null;
    if (cssModel && domModel && resourceTreeModel) {
      this.eventListeners = [
        cssModel.addEventListener(SDK.CSSModel.Events.StyleSheetAdded, this.onCSSModelChanged, this),
        cssModel.addEventListener(SDK.CSSModel.Events.StyleSheetRemoved, this.onCSSModelChanged, this),
        cssModel.addEventListener(SDK.CSSModel.Events.StyleSheetChanged, this.onCSSModelChanged, this),
        cssModel.addEventListener(SDK.CSSModel.Events.FontsUpdated, this.onCSSModelChanged, this),
        cssModel.addEventListener(SDK.CSSModel.Events.MediaQueryResultChanged, this.onCSSModelChanged, this),
        cssModel.addEventListener(SDK.CSSModel.Events.PseudoStateForced, this.onCSSModelChanged, this),
        cssModel.addEventListener(SDK.CSSModel.Events.ModelWasEnabled, this.onCSSModelChanged, this),
        cssModel.addEventListener(SDK.CSSModel.Events.ComputedStyleUpdated, this.onCSSModelChanged, this),
        domModel.addEventListener(SDK.DOMModel.Events.DOMMutated, this.onDOMModelChanged, this),
        resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.FrameResized, this.onFrameResized, this),
      ];
    }
  }

  private onCSSModelChanged(event: Common.EventTarget.EventTargetEvent<CSSModelChangedEvent>|null): void {
    delete this.computedStylePromise;
    // If the event contains `nodeId` and that's not the same as this node's id
    // we don't emit the COMPUTED_STYLE_CHANGED event.
    if (event?.data && 'nodeId' in event.data && event.data.nodeId !== this.nodeInternal?.id) {
      return;
    }

    this.dispatchEventToListeners(Events.CSS_MODEL_CHANGED, event?.data ?? null);
  }

  private onDOMModelChanged(event: Common.EventTarget.EventTargetEvent<SDK.DOMModel.DOMNode>): void {
    // Any attribute removal or modification can affect the styles of "related" nodes.
    const node = event.data;
    if (!this.nodeInternal ||
        this.nodeInternal !== node && node.parentNode !== this.nodeInternal.parentNode &&
            !node.isAncestor(this.nodeInternal)) {
      return;
    }
    this.onCSSModelChanged(null);
  }

  private onFrameResized(): void {
    function refreshContents(this: ComputedStyleModel): void {
      this.onCSSModelChanged(null);
      delete this.frameResizedTimer;
    }

    if (this.frameResizedTimer) {
      clearTimeout(this.frameResizedTimer);
    }

    this.frameResizedTimer = window.setTimeout(refreshContents.bind(this), 100);
  }

  private elementNode(): SDK.DOMModel.DOMNode|null {
    const node = this.node();
    if (!node) {
      return null;
    }
    return node.enclosingElementOrSelf();
  }

  async fetchComputedStyle(): Promise<ComputedStyle|null> {
    const elementNode = this.elementNode();
    const cssModel = this.cssModel();
    if (!elementNode || !cssModel) {
      return null;
    }
    const nodeId = elementNode.id;
    if (!nodeId) {
      return null;
    }

    if (!this.computedStylePromise) {
      this.computedStylePromise = cssModel.getComputedStyle(nodeId).then(verifyOutdated.bind(this, elementNode));
    }

    return this.computedStylePromise;

    function verifyOutdated(
        this: ComputedStyleModel, elementNode: SDK.DOMModel.DOMNode, style: Map<string, string>|null): ComputedStyle|
        null {
      return elementNode === this.elementNode() && style ? new ComputedStyle(elementNode, style) :
                                                           null as ComputedStyle | null;
    }
  }
}

export const enum Events {
  CSS_MODEL_CHANGED = 'CSSModelChanged',
}

export type CSSModelChangedEvent = SDK.CSSStyleSheetHeader.CSSStyleSheetHeader|SDK.CSSModel.StyleSheetChangedEvent|
                                   SDK.CSSModel.PseudoStateForcedEvent|SDK.CSSModel.ComputedStyleUpdatedEvent|null|void;

export type EventTypes = {
  [Events.CSS_MODEL_CHANGED]: CSSModelChangedEvent,
};

export class ComputedStyle {
  node: SDK.DOMModel.DOMNode;
  computedStyle: Map<string, string>;
  constructor(node: SDK.DOMModel.DOMNode, computedStyle: Map<string, string>) {
    this.node = node;
    this.computedStyle = computedStyle;
  }
}
