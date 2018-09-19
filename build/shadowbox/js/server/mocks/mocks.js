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
class MockAccessKeyRepository {
    constructor() {
        this.accessKeys = [];
    }
    createNewAccessKey() {
        const id = this.accessKeys.length.toString();
        const key = {
            id,
            name: 'name',
            metricsId: 'metricsId',
            proxyParams: {
                hostname: 'hostname',
                portNumber: 12345,
                password: 'password',
                encryptionMethod: 'chacha20-ietf-poly1305'
            }
        };
        this.accessKeys.push(key);
        return Promise.resolve(key);
    }
    removeAccessKey(id) {
        for (let i = 0; i < this.accessKeys.length; ++i) {
            if (this.accessKeys[i].id === id) {
                this.accessKeys.splice(i, 1);
                return true;
            }
        }
        return false;
    }
    listAccessKeys() {
        return this.accessKeys[Symbol.iterator]();
    }
    renameAccessKey(id, name) {
        for (let i = 0; i < this.accessKeys.length; ++i) {
            if (this.accessKeys[i].id === id) {
                this.accessKeys[i].name = name;
                return true;
            }
        }
        return false;
    }
}
exports.MockAccessKeyRepository = MockAccessKeyRepository;
class MockShadowsocksInstance {
    constructor(portNumber = 12345, password = 'password', encryptionMethod = 'encryption', accessUrl = 'ss://somethingsomething') {
        this.portNumber = portNumber;
        this.password = password;
        this.encryptionMethod = encryptionMethod;
        this.accessUrl = accessUrl;
    }
    onInboundBytes(callback) { }
    stop() { }
}
class MockShadowsocksServer {
    startInstance(portNumber, password, metricsSocket, encryptionMethod) {
        const mock = new MockShadowsocksInstance(portNumber, password, encryptionMethod);
        return Promise.resolve(mock);
    }
}
exports.MockShadowsocksServer = MockShadowsocksServer;
class InMemoryFile {
    constructor(exists) {
        this.exists = exists;
    }
    readFileSync() {
        if (this.exists) {
            return this.savedText;
        }
        else {
            const err = new Error('no such file or directory');
            // tslint:disable-next-line:no-any
            err.code = 'ENOENT';
            throw err;
        }
    }
    writeFileSync(text) {
        this.savedText = text;
        this.exists = true;
    }
}
exports.InMemoryFile = InMemoryFile;
