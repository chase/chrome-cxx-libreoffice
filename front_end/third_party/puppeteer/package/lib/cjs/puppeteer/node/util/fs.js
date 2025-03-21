"use strict";
/**
 * @license
 * Copyright 2023 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rm = rm;
exports.rmSync = rmSync;
const fs_1 = __importDefault(require("fs"));
const rmOptions = {
    force: true,
    recursive: true,
    maxRetries: 5,
};
/**
 * @internal
 */
async function rm(path) {
    await fs_1.default.promises.rm(path, rmOptions);
}
/**
 * @internal
 */
function rmSync(path) {
    fs_1.default.rmSync(path, rmOptions);
}
//# sourceMappingURL=fs.js.map