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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const restify = require("restify");
const shadowsocks_config_1 = require("ShadowsocksConfig/shadowsocks_config");
const logging = require("../infrastructure/logging");
// Creates a AccessKey response.
function accessKeyToJson(accessKey) {
    return {
        // The unique identifier of this access key.
        id: accessKey.id,
        // Admin-controlled, editable name for this access key.
        name: accessKey.name,
        // Shadowsocks-specific details and credentials.
        password: accessKey.proxyParams.password,
        port: accessKey.proxyParams.portNumber,
        method: accessKey.proxyParams.encryptionMethod,
        accessUrl: shadowsocks_config_1.SIP002_URI.stringify(shadowsocks_config_1.makeConfig({
            host: accessKey.proxyParams.hostname,
            port: accessKey.proxyParams.portNumber,
            method: accessKey.proxyParams.encryptionMethod,
            password: accessKey.proxyParams.password,
            outline: 1,
        })),
        rate: accessKey.rate || 0
    };
}
function bindService(apiServer, apiPrefix, service) {
    apiServer.put(`${apiPrefix}/name`, service.renameServer.bind(service));
    apiServer.get(`${apiPrefix}/server`, service.getServer.bind(service));
    apiServer.get(`${apiPrefix}/info`, service.getInfo.bind(service));
    apiServer.post(`${apiPrefix}/access-keys`, service.createNewAccessKey.bind(service));
    apiServer.post(`${apiPrefix}/access-keys/:count`, service.createNewAccessKey.bind(service));
    apiServer.get(`${apiPrefix}/access-keys`, service.listAccessKeys.bind(service));
    apiServer.del(`${apiPrefix}/access-keys/:id`, service.removeAccessKey.bind(service));
    apiServer.del(`${apiPrefix}/access-keys`, service.removeAccessKeys.bind(service));
    apiServer.put(`${apiPrefix}/access-keys/:id/name`, service.renameAccessKey.bind(service));
    apiServer.get(`${apiPrefix}/metrics/transfer`, service.getDataUsage.bind(service));
    apiServer.get(`${apiPrefix}/metrics/enabled`, service.getShareMetrics.bind(service));
    apiServer.put(`${apiPrefix}/metrics/enabled`, service.setShareMetrics.bind(service));
}
exports.bindService = bindService;
// The ShadowsocksManagerService manages the access keys that can use the server
// as a proxy using Shadowsocks. It runs an instance of the Shadowsocks server
// for each existing access key, with the port and password assigned for that access key.
class ShadowsocksManagerService {
    constructor(defaultServerName, serverConfig, accessKeys, managerMetrics, metricsPublisher) {
        this.defaultServerName = defaultServerName;
        this.serverConfig = serverConfig;
        this.accessKeys = accessKeys;
        this.managerMetrics = managerMetrics;
        this.metricsPublisher = metricsPublisher;
    }
    renameServer(req, res, next) {
        const name = req.params.name;
        if (typeof name !== 'string' || name.length > 100) {
            res.send(400);
            next();
            return;
        }
        this.serverConfig.data().name = name;
        this.serverConfig.write();
        res.send(204);
        next();
    }
    getServer(req, res, next) {
        res.send(200, {
            name: this.serverConfig.data().name || this.defaultServerName,
            serverId: this.serverConfig.data().serverId,
            metricsEnabled: this.serverConfig.data().metricsEnabled || false,
            createdTimestampMs: this.serverConfig.data().createdTimestampMs
        });
        next();
    }
    getInfo(req, res, next) {
        const portMetrics = this.metricsPublisher.getPortMetrics();
        const accessKeys = [];
        let rate20 = 0;
        let rate80 = 0;
        for (const accessKey of this.accessKeys.listAccessKeys()) {
            accessKeys.push(accessKey);
            const port = accessKey.proxyParams.portNumber;
            if (portMetrics.has(port)) {
                logging.info(`active port ${port}, rate ${accessKey.rate}`);
                if (accessKey.rate.toString() === '20') {
                    rate20++;
                }
                else if (accessKey.rate.toString() === '80') {
                    rate80++;
                }
            }
        }
        res.send(200, {
            version: process.env.SB_VERSION,
            userCount: accessKeys.length,
            activePortCount: portMetrics.size,
            activePortRate20Count: rate20,
            activePortRate80Count: rate80,
        });
        next();
    }
    // Lists all access keys
    listAccessKeys(req, res, next) {
        logging.debug(`listAccessKeys request ${req.params}`);
        const response = { accessKeys: [], users: [] };
        for (const accessKey of this.accessKeys.listAccessKeys()) {
            response.accessKeys.push(accessKeyToJson(accessKey));
        }
        logging.debug(`listAccessKeys response ${response}`);
        res.send(200, response);
        return next();
    }
    // Creates a new access key
    createNewAccessKey(req, res, next) {
        try {
            logging.debug(`createNewAccessKey request ${req.params}`);
            const count = req.params.count || 1;
            if (count <= 0 || count > Number(process.env.MAX_POST_USER_COUNT || 10)) {
                return next(new restify.InternalServerError(`Invalid request param count: ${count}`));
            }
            else if (count === 1) {
                this.accessKeys.createNewAccessKey(req.params.rate || 0).then((accessKey) => {
                    const accessKeyJson = accessKeyToJson(accessKey);
                    res.send(201, accessKeyJson);
                    return next();
                });
            }
            else {
                const arr = [];
                for (let i = 0; i < count; ++i) {
                    arr.push(0);
                }
                const response = [];
                Promise
                    .all(arr.map(i => {
                    return this.accessKeys.createNewAccessKey(req.params.rate || i);
                }))
                    .then((keys) => {
                    for (const key of keys) {
                        response.push(accessKeyToJson(key));
                    }
                    res.send(201, response);
                    return next();
                })
                    .catch(error => {
                    return next(new restify.InternalServerError(error));
                });
            }
        }
        catch (error) {
            logging.error(error);
            return next(new restify.InternalServerError());
        }
    }
    // Removes an existing access key
    removeAccessKey(req, res, next) {
        try {
            logging.debug(`removeAccessKey request ${req.params}`);
            const accessKeyId = req.params.id;
            if (!this.accessKeys.removeAccessKey(accessKeyId)) {
                return next(new restify.NotFoundError(`No access key found with id ${accessKeyId}`));
            }
            res.send(204);
            return next();
        }
        catch (error) {
            logging.error(error);
            return next(new restify.InternalServerError());
        }
    }
    removeAccessKeys(req, res, next) {
        try {
            logging.debug(`removeAccessKeys request ${req.params.accessKeys}`);
            const accessKeys = req.params.accessKeys;
            Promise
                .all(accessKeys.map(accessKey => {
                this.accessKeys.removeAccessKey(accessKey.toString());
            }))
                .then(output => {
                res.send(204);
                return next();
            })
                .catch(error => {
                return next(new restify.InternalServerError(error));
            });
        }
        catch (error) {
            logging.error(error);
            return next(new restify.InternalServerError());
        }
    }
    renameAccessKey(req, res, next) {
        try {
            logging.debug(`renameAccessKey request ${req.params}`);
            const accessKeyId = req.params.id;
            if (!this.accessKeys.renameAccessKey(accessKeyId, req.params.name)) {
                return next(new restify.NotFoundError(`No access key found with id ${accessKeyId}`));
            }
            res.send(204);
            return next();
        }
        catch (error) {
            logging.error(error);
            return next(new restify.InternalServerError());
        }
    }
    getDataUsage(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                res.send(200, this.managerMetrics.get30DayByteTransfer());
                return next();
            }
            catch (error) {
                logging.error(error);
                return next(new restify.InternalServerError());
            }
        });
    }
    getShareMetrics(req, res, next) {
        res.send(200, { metricsEnabled: this.metricsPublisher.isSharingEnabled() });
        next();
    }
    setShareMetrics(req, res, next) {
        const params = req.params;
        if (typeof params.metricsEnabled === 'boolean') {
            if (params.metricsEnabled) {
                this.metricsPublisher.startSharing();
            }
            else {
                this.metricsPublisher.stopSharing();
            }
            res.send(204);
        }
        else {
            res.send(400);
        }
        next();
    }
}
exports.ShadowsocksManagerService = ShadowsocksManagerService;
