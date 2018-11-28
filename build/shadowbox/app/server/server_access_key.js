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
const dgram = require("dgram");
const randomstring = require("randomstring");
const uuidv4 = require("uuid/v4");
const get_port_1 = require("../infrastructure/get_port");
const logging = require("../infrastructure/logging");
const libev_shadowsocks_server_1 = require("./libev_shadowsocks_server");
// Generates a random password for Shadowsocks access keys.
function generatePassword() {
    return randomstring.generate(12);
}
function createServerAccessKeyRepository(proxyHostname, keyConfig, ipLocation, usageWriter, verbose) {
    // TODO: Set default values
    const reservedPorts = getReservedPorts(keyConfig.data().accessKeys || []);
    // Create and save the metrics socket.
    return createBoundUdpSocket(reservedPorts).then((metricsSocket) => {
        reservedPorts.add(metricsSocket.address().port);
        const shadowsocksServer = new libev_shadowsocks_server_1.LibevShadowsocksServer(proxyHostname, metricsSocket, ipLocation, usageWriter, verbose);
        return new ServerAccessKeyRepository(proxyHostname, keyConfig, shadowsocksServer);
    });
}
exports.createServerAccessKeyRepository = createServerAccessKeyRepository;
function makeAccessKey(hostname, accessKeyJson) {
    return {
        id: accessKeyJson.id,
        name: accessKeyJson.name,
        metricsId: accessKeyJson.metricsId,
        proxyParams: {
            hostname,
            portNumber: accessKeyJson.port,
            encryptionMethod: accessKeyJson.encryptionMethod,
            password: accessKeyJson.password,
        },
        rate: accessKeyJson.rate || 0
    };
}
// AccessKeyRepository that keeps its state in a config file and uses ShadowsocksServer
// to start and stop per-access-key Shadowsocks instances.
class ServerAccessKeyRepository {
    constructor(proxyHostname, keyConfig, shadowsocksServer) {
        this.proxyHostname = proxyHostname;
        this.keyConfig = keyConfig;
        this.shadowsocksServer = shadowsocksServer;
        // This is the max id + 1 among all access keys. Used to generate unique ids for new access keys.
        this.NEW_USER_ENCRYPTION_METHOD = 'chacha20-ietf-poly1305';
        this.reservedPorts = new Set();
        this.ssInstances = new Map();
        if (this.keyConfig.data().accessKeys === undefined) {
            this.keyConfig.data().accessKeys = [];
        }
        if (this.keyConfig.data().nextId === undefined) {
            this.keyConfig.data().nextId = 0;
        }
        for (const accessKeyJson of this.keyConfig.data().accessKeys) {
            this.startInstance(accessKeyJson).catch((error) => {
                logging.error(`Failed to start Shadowsocks instance for key ${accessKeyJson.id}: ${error}`);
            });
        }
    }
    createNewAccessKey(rate) {
        return get_port_1.getRandomUnusedPort(this.reservedPorts).then((port) => {
            const id = this.keyConfig.data().nextId.toString();
            this.keyConfig.data().nextId += 1;
            const metricsId = uuidv4();
            const password = generatePassword();
            // Save key
            const accessKeyJson = {
                id,
                metricsId,
                name: '',
                port,
                encryptionMethod: this.NEW_USER_ENCRYPTION_METHOD,
                password,
                rate: rate || 0
            };
            this.keyConfig.data().accessKeys.push(accessKeyJson);
            try {
                this.keyConfig.write();
            }
            catch (error) {
                throw new Error(`Failed to save config: ${error}`);
            }
            this.startInstance(accessKeyJson).catch((error) => {
                logging.error(`Failed to start Shadowsocks instance for key ${accessKeyJson.id}: ${error}`);
            });
            return makeAccessKey(this.proxyHostname, accessKeyJson);
        });
    }
    removeAccessKey(id) {
        for (let ai = 0; ai < this.keyConfig.data().accessKeys.length; ai++) {
            if (this.keyConfig.data().accessKeys[ai].id === id) {
                this.keyConfig.data().accessKeys.splice(ai, 1);
                this.keyConfig.write();
                this.ssInstances.get(id).stop();
                this.ssInstances.delete(id);
                return true;
            }
        }
        return false;
    }
    listAccessKeys() {
        return this.keyConfig.data().accessKeys.map(accessKeyJson => makeAccessKey(this.proxyHostname, accessKeyJson))[Symbol.iterator]();
    }
    renameAccessKey(id, name) {
        const accessKeyJson = this.getAccessKey(id);
        if (!accessKeyJson) {
            return false;
        }
        accessKeyJson.name = name;
        try {
            this.keyConfig.write();
        }
        catch (error) {
            return false;
        }
        return true;
    }
    getMetricsId(id) {
        const accessKeyJson = this.getAccessKey(id);
        return accessKeyJson ? accessKeyJson.metricsId : undefined;
    }
    getAccessKey(id) {
        for (const accessKeyJson of this.keyConfig.data().accessKeys) {
            if (accessKeyJson.id === id) {
                return accessKeyJson;
            }
        }
        return undefined;
    }
    startInstance(accessKeyJson) {
        return this.shadowsocksServer
            .startInstance(accessKeyJson.id, accessKeyJson.port, accessKeyJson.password, accessKeyJson.encryptionMethod)
            .then((ssInstance) => {
            this.ssInstances.set(accessKeyJson.id, ssInstance);
        });
    }
}
exports.ServerAccessKeyRepository = ServerAccessKeyRepository;
// Gets the set of port numbers reserved by the accessKeys.
function getReservedPorts(accessKeys) {
    const reservedPorts = new Set();
    for (const accessKeyJson of accessKeys) {
        reservedPorts.add(accessKeyJson.port);
    }
    return reservedPorts;
}
// Creates a bound UDP socket on a random unused port.
function createBoundUdpSocket(reservedPorts) {
    const socket = dgram.createSocket('udp4');
    return new Promise((fulfill, reject) => {
        get_port_1.getRandomUnusedPort(reservedPorts).then((portNumber) => {
            socket.bind(portNumber, 'localhost', () => {
                return fulfill(socket);
            });
        });
    });
}
