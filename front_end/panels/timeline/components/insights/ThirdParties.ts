// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import './Table.js';

import * as i18n from '../../../../core/i18n/i18n.js';
import * as Platform from '../../../../core/platform/platform.js';
import type {ThirdPartiesInsightModel} from '../../../../models/trace/insights/ThirdParties.js';
import type * as Trace from '../../../../models/trace/trace.js';
import * as Lit from '../../../../ui/lit/lit.js';
import type * as Overlays from '../../overlays/overlays.js';

import {BaseInsightComponent} from './BaseInsightComponent.js';

const {html} = Lit;

const UIStrings = {
  /** Label for a table column that displays the name of a third-party provider. */
  columnThirdParty: 'Third party',
  /** Label for a column in a data table; entries will be the download size of a web resource in kilobytes. */
  columnTransferSize: 'Transfer size',
  /** Label for a table column that displays how much time each row spent blocking other work on the main thread, entries will be the number of milliseconds spent. */
  columnBlockingTime: 'Blocking time',
  /**
   * @description Text block indicating that no third party content was detected on the page
   */
  noThirdParties: 'No third parties found',
};

const str_ = i18n.i18n.registerUIStrings('panels/timeline/components/insights/ThirdParties.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

export class ThirdParties extends BaseInsightComponent<ThirdPartiesInsightModel> {
  static override readonly litTagName = Lit.StaticHtml.literal`devtools-performance-third-parties`;
  override internalName: string = 'third-parties';

  #overlaysForEntity = new Map<Trace.Extras.ThirdParties.Entity, Overlays.Overlays.TimelineOverlay[]>();

  override createOverlays(): Overlays.Overlays.TimelineOverlay[] {
    this.#overlaysForEntity.clear();

    if (!this.model) {
      return [];
    }

    const overlays: Overlays.Overlays.TimelineOverlay[] = [];
    for (const [entity, events] of this.model.eventsByEntity) {
      if (entity === this.model.firstPartyEntity) {
        continue;
      }

      const overlaysForThisEntity = [];
      for (const event of events) {
        const overlay: Overlays.Overlays.TimelineOverlay = {
          type: 'ENTRY_OUTLINE',
          entry: event,
          outlineReason: 'INFO',
        };
        overlaysForThisEntity.push(overlay);
        overlays.push(overlay);
      }

      this.#overlaysForEntity.set(entity, overlaysForThisEntity);
    }

    return overlays;
  }

  override renderContent(): Lit.LitTemplate {
    if (!this.model) {
      return Lit.nothing;
    }

    const entries = [...this.model.summaryByEntity.entries()].filter(kv => kv[0] !== this.model?.firstPartyEntity);
    if (!entries.length) {
      return html`<div class="insight-section">${i18nString(UIStrings.noThirdParties)}</div>`;
    }

    const topTransferSizeEntries = entries.sort((a, b) => b[1].transferSize - a[1].transferSize).slice(0, 6);
    const topMainThreadTimeEntries = entries.sort((a, b) => b[1].mainThreadTime - a[1].mainThreadTime).slice(0, 6);

    const sections = [];
    if (topTransferSizeEntries.length) {
      // clang-format off
      sections.push(html`
        <div class="insight-section">
          <devtools-performance-table
            .data=${{
              insight: this,
              headers: [i18nString(UIStrings.columnThirdParty), i18nString(UIStrings.columnTransferSize)],
              rows: topTransferSizeEntries.map(([entity, summary]) => ({
                values: [
                  entity.name,
                  i18n.ByteUtilities.bytesToString(summary.transferSize),
                ],
                overlays: this.#overlaysForEntity.get(entity),
              })),
            }}>
          </devtools-performance-table>
        </div>
      `);
      // clang-format on
    }

    if (topMainThreadTimeEntries.length) {
      // clang-format off
      sections.push(html`
        <div class="insight-section">
          <devtools-performance-table
            .data=${{
              insight: this,
              headers: [i18nString(UIStrings.columnThirdParty), i18nString(UIStrings.columnBlockingTime)],
              rows: topMainThreadTimeEntries.map(([entity, summary]) => ({
                values: [
                  entity.name,
                  i18n.TimeUtilities.millisToString(Platform.Timing.microSecondsToMilliSeconds(summary.mainThreadTime)),
                ],
                overlays: this.#overlaysForEntity.get(entity),
              })),
            }}>
          </devtools-performance-table>
        </div>
      `);
      // clang-format on
    }

    return html`${sections}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'devtools-performance-third-parties': ThirdParties;
  }
}

customElements.define('devtools-performance-third-parties', ThirdParties);
