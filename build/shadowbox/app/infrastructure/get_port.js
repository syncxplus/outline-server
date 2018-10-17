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
const child_process = require("child_process");
const MAX_PORT = 65535;
const MIN_PORT = 1024;
function getRandomUnusedPort(reservedPorts, generatePort = getRandomPortOver1023, isPortUsed = isPortUsedLsof, maxRetries = MAX_PORT) {
    // TODO: consider using a set of available ports, so we don't randomly
    // try the same port multiple times.
    const port = generatePort();
    return isPortUsed(port).then((isUsed) => {
        if (!isUsed && !reservedPorts.has(port)) {
            return Promise.resolve(port);
        }
        else if (maxRetries === 0) {
            return Promise.reject(new Error('Could not find available port'));
        }
        return getRandomUnusedPort(reservedPorts, generatePort, isPortUsed, maxRetries - 1);
    });
}
exports.getRandomUnusedPort = getRandomUnusedPort;
function getRandomPortOver1023() {
    return Math.floor(Math.random() * (MAX_PORT + 1 - MIN_PORT) + MIN_PORT);
}
exports.getRandomPortOver1023 = getRandomPortOver1023;
function isPortUsedLsof(port) {
    return new Promise((fulfill, reject) => {
        const cmd = `lsof -P -i:${port} | grep LISTEN`;
        child_process.exec(cmd, (error, stdout, stderr) => {
            if (error && error.code === 1) {
                // lsof will return error code 1 if nothing is found.
                fulfill(false);
            }
            else if (stdout.trim() || stderr.trim()) {
                // Anything written to stdout or stderr indicates that this port
                // is in use.
                fulfill(true);
            }
            else {
                fulfill(false);
            }
        });
    });
}
