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
// Generates a random password for Shadowsocks access keys.
function generatePassword() {
    return randomstring.generate(12);
}
// AccessKeyConfigFile can load and save ConfigJsons from and to a file.
class AccessKeyConfigFile {
    constructor(configFile) {
        this.configFile = configFile;
    }
    loadConfig() {
        const EMPTY_CONFIG = { accessKeys: [], nextId: 0 };
        // Try to read the file from disk.
        let configText;
        try {
            configText = this.configFile.readFileSync();
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                // File not found (e.g. this is a new server), return an empty config.
                return EMPTY_CONFIG;
            }
            throw err;
        }
        // Ignore if the config file is empty.
        if (!configText) {
            return EMPTY_CONFIG;
        }
        return JSON.parse(configText);
    }
    // Save the repository to the local disk.
    // Throws an error in case of failure.
    // TODO(fortuna): Fix race condition. This can break if there are two modifications in parallel.
    // TODO: this method should return an error if it fails to write to disk,
    // then this error can be propagated back to the manager via the REST
    // API, so users know there was an error and access keys may not be
    // persisted.
    saveConfig(config) {
        const text = JSON.stringify(config);
        logging.info(`Persisting: ${text}`);
        this.configFile.writeFileSync(text);
    }
}
function createServerAccessKeyRepository(proxyHostname, textFile, shadowsocksServer, managerMetrics, sharedMetrics) {
    const configFile = new AccessKeyConfigFile(textFile);
    const configJson = configFile.loadConfig();
    const reservedPorts = getReservedPorts(configJson.accessKeys);
    // Create and save the metrics socket.
    return createBoundUdpSocket(reservedPorts).then((metricsSocket) => {
        reservedPorts.add(metricsSocket.address().port);
        return new ServerAccessKeyRepository(proxyHostname, configFile, configJson, shadowsocksServer, metricsSocket, managerMetrics, sharedMetrics);
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
        }
    };
}
// AccessKeyRepository that keeps its state in a config file and uses ShadowsocksServer
// to start and stop per-access-key Shadowsocks instances.
class ServerAccessKeyRepository {
    constructor(proxyHostname, configFile, configJson, shadowsocksServer, metricsSocket, managerMetrics, sharedMetrics) {
        this.proxyHostname = proxyHostname;
        this.configFile = configFile;
        this.configJson = configJson;
        this.shadowsocksServer = shadowsocksServer;
        this.metricsSocket = metricsSocket;
        this.managerMetrics = managerMetrics;
        this.sharedMetrics = sharedMetrics;
        // This is the max id + 1 among all access keys. Used to generate unique ids for new access keys.
        this.NEW_USER_ENCRYPTION_METHOD = 'chacha20-ietf-poly1305';
        this.reservedPorts = new Set();
        this.ssInstances = new Map();
        for (const accessKeyJson of this.configJson.accessKeys) {
            this.startInstance(accessKeyJson).catch((error) => {
                logging.error(`Failed to start Shadowsocks instance for key ${accessKeyJson.id}: ${error}`);
            });
        }
    }
    createNewAccessKey() {
        return get_port_1.getRandomUnusedPort(this.reservedPorts).then((port) => {
            const id = this.configJson.nextId.toString();
            this.configJson.nextId += 1;
            const metricsId = uuidv4();
            const password = generatePassword();
            // Save key
            const accessKeyJson = {
                id,
                metricsId,
                name: '',
                port,
                encryptionMethod: this.NEW_USER_ENCRYPTION_METHOD,
                password
            };
            this.configJson.accessKeys.push(accessKeyJson);
            try {
                this.saveConfig();
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
        for (let ai = 0; ai < this.configJson.accessKeys.length; ai++) {
            if (this.configJson.accessKeys[ai].id === id) {
                this.configJson.accessKeys.splice(ai, 1);
                this.saveConfig();
                this.ssInstances.get(id).stop();
                this.ssInstances.delete(id);
                return true;
            }
        }
        return false;
    }
    listAccessKeys() {
        return this.configJson.accessKeys.map(accessKeyJson => makeAccessKey(this.proxyHostname, accessKeyJson))[Symbol.iterator]();
    }
    renameAccessKey(id, name) {
        for (const accessKeyJson of this.configJson.accessKeys) {
            if (accessKeyJson.id === id) {
                accessKeyJson.name = name;
                try {
                    this.saveConfig();
                }
                catch (error) {
                    return false;
                }
                return true;
            }
        }
        return false;
    }
    startInstance(accessKeyJson) {
        return this.shadowsocksServer
            .startInstance(accessKeyJson.port, accessKeyJson.password, this.metricsSocket, accessKeyJson.encryptionMethod)
            .then((ssInstance) => {
            ssInstance.onInboundBytes(this.handleInboundBytes.bind(this, accessKeyJson.id, accessKeyJson.metricsId));
            this.ssInstances.set(accessKeyJson.id, ssInstance);
        });
    }
    handleInboundBytes(accessKeyId, metricsId, inboundBytes, ipAddresses) {
        this.managerMetrics.recordBytesTransferred(new Date(), accessKeyId, inboundBytes);
        this.sharedMetrics.recordBytesTransferred(metricsId, inboundBytes, ipAddresses);
    }
    saveConfig() {
        this.configFile.saveConfig(this.configJson);
    }
}
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
