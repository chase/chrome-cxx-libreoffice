// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as i18n from '../../../../core/i18n/i18n.js';
import * as Platform from '../../../../core/platform/platform.js';
import type * as TraceEngine from '../../../../models/trace/trace.js';
import * as LitHtml from '../../../../ui/lit-html/lit-html.js';
import type * as Overlays from '../../overlays/overlays.js';

import {BaseInsight, md, shouldRenderForCategory} from './Helpers.js';
import * as SidebarInsight from './SidebarInsight.js';
import {Table, type TableData} from './Table.js';
import {InsightsCategories} from './types.js';

const UIStrings = {
  /** Title of an insight that provides details about the code on a web page that the user doesn't control (referred to as "third-party code"). */
  title: 'Third parties',
  /**
   * @description Description of a DevTools insight that identifies the code on the page that the user doesn't control.
   * This is displayed after a user expands the section to see more. No character length limits.
   * The last sentence starting with 'Learn' becomes link text to additional documentation.
   */
  description: 'Third party code can significantly impact load performance. ' +
      'Assess and reduce the ' +
      '[amount of third party code](https://developers.google.com/web/fundamentals/performance/optimizing-content-efficiency/loading-third-party-javascript/) on the page, and try to load what you can after the page has finished loading the main content.',
  /** Label for a table column that displays the name of a third-party provider. */
  columnThirdParty: 'Third party',
  /** Label for a column in a data table; entries will be the download size of a web resource in kilobytes. */
  columnTransferSize: 'Transfer size',
  /** Label for a table column that displays how much time each row spent blocking other work on the main thread, entries will be the number of milliseconds spent. */
  columnBlockingTime: 'Blocking time',
};

const str_ = i18n.i18n.registerUIStrings('panels/timeline/components/insights/ThirdParties.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

export function getThirdPartiesInsight(
    insights: TraceEngine.Insights.Types.TraceInsightData|null,
    navigationId: string|null): TraceEngine.Insights.Types.InsightResults['ThirdPartyWeb']|null {
  if (!insights || !navigationId) {
    return null;
  }

  const insightsByNavigation = insights.get(navigationId);
  if (!insightsByNavigation) {
    return null;
  }

  const thirdPartiesInsight = insightsByNavigation.ThirdPartyWeb;
  if (thirdPartiesInsight instanceof Error) {
    return null;
  }
  return thirdPartiesInsight;
}

export class ThirdParties extends BaseInsight {
  static readonly litTagName = LitHtml.literal`devtools-performance-third-parties`;
  override insightCategory: InsightsCategories = InsightsCategories.OTHER;
  override internalName: string = 'third-parties';
  override userVisibleTitle: string = i18nString(UIStrings.title);

  #overlaysForEntity =
      new Map<TraceEngine.Insights.InsightRunners.ThirdPartyWeb.Entity, Overlays.Overlays.TimelineOverlay[]>();
  #currentSelectedRowEl: HTMLElement|null = null;
  #currentSelectionIsSticky = false;

  override createOverlays(): Overlays.Overlays.TimelineOverlay[] {
    this.#overlaysForEntity.clear();

    const insight = getThirdPartiesInsight(this.data.insights, this.data.navigationId);
    if (!insight) {
      return [];
    }

    const overlays: Overlays.Overlays.TimelineOverlay[] = [];
    for (const [entity, requests] of insight.requestsByEntity) {
      if (entity === insight.firstPartyEntity) {
        continue;
      }

      const overlaysForThisEntity = [];
      for (const request of requests) {
        const overlay: Overlays.Overlays.TimelineOverlay = {
          type: 'ENTRY_OUTLINE',
          entry: request,
          outlineReason: 'INFO',
        };
        overlaysForThisEntity.push(overlay);
        overlays.push(overlay);
      }

      this.#overlaysForEntity.set(entity, overlaysForThisEntity);
    }

    return overlays;
  }

  #onSelectedRowChanged(
      entity: TraceEngine.Insights.InsightRunners.ThirdPartyWeb.Entity|null, rowEl: HTMLElement|null,
      sticky: boolean): void {
    if (this.#currentSelectionIsSticky && !sticky) {
      return;
    }

    // Unselect a sticky-selection when clicking it for a second time.
    if (this.#currentSelectionIsSticky && rowEl === this.#currentSelectedRowEl) {
      entity = null;
      rowEl = null;
      sticky = false;
    }

    if (entity) {
      const overlays = this.#overlaysForEntity.get(entity);
      if (overlays) {
        this.onOverlayOverride(overlays);
      }
    } else {
      this.onOverlayOverride(null);
    }

    this.#currentSelectedRowEl?.classList.remove('selected');
    rowEl?.classList.add('selected');
    this.#currentSelectedRowEl = rowEl;
    this.#currentSelectionIsSticky = sticky;
  }

  #render(data: TraceEngine.Insights.Types.InsightResults['ThirdPartyWeb']): LitHtml.TemplateResult {
    const entries = [...data.summaryByEntity.entries()].filter(kv => kv[0] !== data.firstPartyEntity);
    const topTransferSizeEntries = entries.sort((a, b) => b[1].transferSize - a[1].transferSize).slice(0, 6);
    const topMainThreadTimeEntries = entries.sort((a, b) => b[1].mainThreadTime - a[1].mainThreadTime).slice(0, 6);

    // clang-format off
    return LitHtml.html`
        <div class="insights">
            <${SidebarInsight.SidebarInsight.litTagName} .data=${{
            title: this.userVisibleTitle,
            expanded: this.isActive(),
            } as SidebarInsight.InsightDetails}
            @insighttoggleclick=${this.onSidebarClick}>
                <div slot="insight-description" class="insight-description">
                  ${md(i18nString(UIStrings.description))}
                </div>
                <div slot="insight-content">
                  ${LitHtml.html`<${Table.litTagName}
                    .data=${{
                      headers: [i18nString(UIStrings.columnThirdParty), i18nString(UIStrings.columnTransferSize)],
                      rows: topTransferSizeEntries.map(([entity, summary]) => [
                        entity.name,
                        Platform.NumberUtilities.bytesToString(summary.transferSize),
                      ]),
                      onHoverRow: (index: number, rowEl: HTMLElement) => this.#onSelectedRowChanged(topTransferSizeEntries[index][0], rowEl, false),
                      onClickRow: (index: number, rowEl: HTMLElement) => this.#onSelectedRowChanged(topTransferSizeEntries[index][0], rowEl, true),
                      onMouseLeave: () => this.#onSelectedRowChanged(null, null, false),
                    } as TableData}>
                  </${Table.litTagName}>`}
                  ${LitHtml.html`<${Table.litTagName}
                    .data=${{
                      headers: [i18nString(UIStrings.columnThirdParty), i18nString(UIStrings.columnBlockingTime)],
                      rows: topMainThreadTimeEntries.map(([entity, summary]) => [
                        entity.name,
                        i18n.TimeUtilities.millisToString(Platform.Timing.microSecondsToMilliSeconds(summary.mainThreadTime)),
                      ]),
                      onHoverRow: (index: number, rowEl: HTMLElement) => this.#onSelectedRowChanged(topMainThreadTimeEntries[index][0], rowEl, false),
                      onClickRow: (index: number, rowEl: HTMLElement) => this.#onSelectedRowChanged(topMainThreadTimeEntries[index][0], rowEl, true),
                      onMouseLeave: () => this.#onSelectedRowChanged(null, null, false),
                    } as TableData}>
                  </${Table.litTagName}>`}
                </div>
            </${SidebarInsight.SidebarInsight}>
        </div>`;
    // clang-format on
  }

  override render(): void {
    const insight = getThirdPartiesInsight(this.data.insights, this.data.navigationId);
    const shouldShow = insight && insight.summaryByEntity.size;

    const matchesCategory = shouldRenderForCategory({
      activeCategory: this.data.activeCategory,
      insightCategory: this.insightCategory,
    });
    const output = shouldShow && matchesCategory ? this.#render(insight) : LitHtml.nothing;
    LitHtml.render(output, this.shadow, {host: this});
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'devtools-performance-third-parties': ThirdParties;
  }
}

customElements.define('devtools-performance-third-parties', ThirdParties);
