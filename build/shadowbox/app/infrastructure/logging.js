"use strict";
// Copyright 2018 The Outline Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
// Returns the Callsite object of the caller.
// This relies on the V8 stack trace API: https://github.com/v8/v8/wiki/Stack-Trace-API
function getCallsite() {
    const originalPrepareStackTrace = Error.prepareStackTrace;
    Error.prepareStackTrace = (_, stack) => {
        return stack;
    };
    const error = new Error();
    Error.captureStackTrace(error, getCallsite);
    // tslint:disable-next-line:no-any
    const stack = error.stack;
    Error.prepareStackTrace = originalPrepareStackTrace;
    return stack[1];
}
// Formats the log message. Example:
// I2018-08-16T16:46:21.577Z 167288 main.js:86] ...
function makeLogMessage(level, callsite, message) {
    // This creates a string in the UTC timezone
    // See
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
    const timeStr = new Date().toISOString();
    return `${level}${timeStr} ${process.pid} ${path.basename(callsite.getFileName())}:${callsite.getLineNumber()}] ${message}`;
}
function error(message) {
    console.error(makeLogMessage('E', getCallsite(), message));
}
exports.error = error;
function warn(message) {
    console.warn(makeLogMessage('W', getCallsite(), message));
}
exports.warn = warn;
function info(message) {
    console.info(makeLogMessage('I', getCallsite(), message));
}
exports.info = info;
function debug(message) {
    console.debug(makeLogMessage('D', getCallsite(), message));
}
exports.debug = debug;
