// Copyright 2024 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {type SourceMap, type SourceMapV3Object} from './SourceMap.js';
import {
  decodeGeneratedRanges,
  decodeOriginalScopes,
  type GeneratedRange,
  type OriginalPosition,
  type OriginalScope,
} from './SourceMapScopes.js';

export class SourceMapScopesInfo {
  /* eslint-disable-next-line no-unused-private-class-members */
  readonly #sourceMap: SourceMap;
  readonly #originalScopes: OriginalScope[];
  readonly #generatedRanges: GeneratedRange[];

  #cachedVariablesAndBindingsPresent: boolean|null = null;

  constructor(sourceMap: SourceMap, originalScopes: OriginalScope[], generatedRanges: GeneratedRange[]) {
    this.#sourceMap = sourceMap;
    this.#originalScopes = originalScopes;
    this.#generatedRanges = generatedRanges;
  }

  static parseFromMap(
      sourceMap: SourceMap,
      sourceMapJson: Pick<SourceMapV3Object, 'names'|'originalScopes'|'generatedRanges'>): SourceMapScopesInfo {
    if (!sourceMapJson.originalScopes || !sourceMapJson.generatedRanges) {
      throw new Error('Cant create SourceMapScopesInfo without encoded scopes');
    }
    const scopeTrees = decodeOriginalScopes(sourceMapJson.originalScopes, sourceMapJson.names ?? []);
    const originalScopes = scopeTrees.map(tree => tree.root);
    const generatedRanges = decodeGeneratedRanges(sourceMapJson.generatedRanges, scopeTrees, sourceMapJson.names ?? []);
    return new SourceMapScopesInfo(sourceMap, originalScopes, generatedRanges);
  }

  /**
   * Given a generated position, returns the original name of the surrounding function as well as
   * all the original function names that got inlined into the surrounding generated function and their
   * respective callsites in the original code (ordered from inner to outer).
   *
   * @returns a list with inlined functions. Every entry in the list has a callsite in the orignal code,
   * except the last function (since the last function didn't get inlined).
   */
  findInlinedFunctions(generatedLine: number, generatedColumn: number): {name: string, callsite?: OriginalPosition}[] {
    const result: {name: string, callsite?: OriginalPosition}[] = [];
    const rangeChain = this.#findGeneratedRangeChain(generatedLine, generatedColumn);

    // Walk the generated ranges from the innermost containing range outwards as long as we don't
    // encounter a range that is a scope in the generated code and a function scope originally.
    for (let i = rangeChain.length - 1; i >= 0; --i) {
      const range = rangeChain[i];
      const originalScope = range.originalScope;

      // Record the name if the range corresponds to a function scope in the authored code. And it's either a scope in the
      // generated code as well or it has a callsite info (which indicates inlining).
      if (originalScope?.kind === 'function' && (range.isScope || range.callsite)) {
        result.push({name: originalScope.name ?? '', callsite: range.callsite});

        if (range.isScope) {
          break;
        }
      }
    }

    return result;
  }

  /**
   * Given a generated position, this returns all the surrounding generated ranges from outer
   * to inner.
   */
  #findGeneratedRangeChain(line: number, column: number): GeneratedRange[] {
    const result: GeneratedRange[] = [];

    (function walkRanges(ranges: GeneratedRange[]) {
      for (const range of ranges) {
        if (!contains(range, line, column)) {
          continue;
        }
        result.push(range);
        walkRanges(range.children);
      }
    })(this.#generatedRanges);

    return result;
  }

  /**
   * @returns true if we have enough info (i.e. variable and binding expressions) to build
   * a scope view.
   */
  hasVariablesAndBindings(): boolean {
    if (this.#cachedVariablesAndBindingsPresent === null) {
      this.#cachedVariablesAndBindingsPresent = this.#areVariablesAndBindingsPresent();
    }
    return this.#cachedVariablesAndBindingsPresent;
  }

  #areVariablesAndBindingsPresent(): boolean {
    // We check whether any original scope has a non-empty list of variables, and
    // generated ranges with a non-empty binding list.

    function walkTree(nodes: OriginalScope[]|GeneratedRange[]): boolean {
      for (const node of nodes) {
        if ('variables' in node && node.variables.length > 0) {
          return true;
        }

        if ('values' in node && node.values.some(v => v !== undefined)) {
          return true;
        }

        if (walkTree(node.children)) {
          return true;
        }
      }
      return false;
    }
    return walkTree(this.#originalScopes) && walkTree(this.#generatedRanges);
  }
}

export function contains(range: Pick<GeneratedRange, 'start'|'end'>, line: number, column: number): boolean {
  if (range.start.line > line || (range.start.line === line && range.start.column > column)) {
    return false;
  }

  if (range.end.line < line || (range.end.line === line && range.end.column <= column)) {
    return false;
  }

  return true;
}
