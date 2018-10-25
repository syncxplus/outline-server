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
const fs = require("fs");
const path = require("path");
const process = require("process");
const restify = require("restify");
const clock_1 = require("../infrastructure/clock");
const ip_location = require("../infrastructure/ip_location");
const json_config = require("../infrastructure/json_config");
const logging = require("../infrastructure/logging");
const manager_metrics_1 = require("./manager_metrics");
const manager_service_1 = require("./manager_service");
const server_access_key_1 = require("./server_access_key");
const server_config = require("./server_config");
const shared_metrics_1 = require("./shared_metrics");
const DEFAULT_STATE_DIR = '/root/shadowbox/persisted-state';
const MAX_STATS_FILE_AGE_MS = 5000;
function readMetricsConfig(filename) {
    try {
        const metricsConfig = json_config.loadFileConfig(filename);
        // Make sure we have non-empty sub-configs.
        metricsConfig.data().transferStats =
            metricsConfig.data().transferStats || {};
        return new json_config.DelayedConfig(metricsConfig, MAX_STATS_FILE_AGE_MS);
    }
    catch (error) {
        throw new Error(`Failed to read metrics config at ${filename}: ${error}`);
    }
}
class MultiMetricsWriter {
    constructor(managerMetrics, sharedMetrics) {
        this.managerMetrics = managerMetrics;
        this.sharedMetrics = sharedMetrics;
    }
    writeBytesTransferred(accessKeyId, numBytes, countries) {
        this.managerMetrics.writeBytesTransferred(accessKeyId, numBytes);
        this.sharedMetrics.writeBytesTransferred(accessKeyId, numBytes, countries);
    }
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const verbose = process.env.LOG_LEVEL === 'debug';
        const proxyHostname = process.env.SB_PUBLIC_IP;
        // Default to production metrics, as some old Docker images may not have
        // SB_METRICS_URL properly set.
        const metricsUrl = process.env.SB_METRICS_URL || 'https://metrics-prod.uproxy.org';
        if (!process.env.SB_METRICS_URL) {
            logging.warn('process.env.SB_METRICS_URL not set, using default');
        }
        if (!proxyHostname) {
            logging.error('Need to specify SB_PUBLIC_IP for invite links');
            process.exit(1);
        }
        logging.debug(`=== Config ===`);
        logging.debug(`SB_PUBLIC_IP: ${proxyHostname}`);
        logging.debug(`SB_METRICS_URL: ${metricsUrl}`);
        logging.debug(`==============`);
        const DEFAULT_PORT = 8081;
        const portNumber = Number(process.env.SB_API_PORT || DEFAULT_PORT);
        if (isNaN(portNumber)) {
            logging.error(`Invalid SB_API_PORT: ${process.env.SB_API_PORT}`);
            process.exit(1);
        }
        const serverConfig = server_config.readServerConfig(getPersistentFilename('shadowbox_server_config.json'));
        const metricsConfig = readMetricsConfig(getPersistentFilename('shadowbox_stats.json'));
        const managerMetrics = new manager_metrics_1.ManagerMetrics(new clock_1.RealClock(), new json_config.ChildConfig(metricsConfig, metricsConfig.data().transferStats));
        logging.info('Starting...');
        const accessKeyConfig = json_config.loadFileConfig(getPersistentFilename('shadowbox_config.json'));
        const ipLocation = new ip_location.MmdbLocationService('/var/lib/libmaxminddb/GeoLite2-Country.mmdb');
        const usageMetrics = new shared_metrics_1.InMemoryUsageMetrics();
        const metricsWriter = new MultiMetricsWriter(managerMetrics, usageMetrics);
        const accessKeyRepository = yield server_access_key_1.createServerAccessKeyRepository(proxyHostname, accessKeyConfig, ipLocation, metricsWriter, verbose);
        const toMetricsId = (id) => {
            return accessKeyRepository.getMetricsId(id);
        };
        const metricsCollector = new shared_metrics_1.RestMetricsCollectorClient(metricsUrl);
        const metricsPublisher = new shared_metrics_1.OutlineSharedMetricsPublisher(new clock_1.RealClock(), serverConfig, usageMetrics, toMetricsId, metricsCollector);
        const managerService = new manager_service_1.ShadowsocksManagerService(process.env.SB_DEFAULT_SERVER_NAME || 'Outline Server', serverConfig, accessKeyRepository, managerMetrics, metricsPublisher);
        const certificateFilename = process.env.SB_CERTIFICATE_FILE;
        const privateKeyFilename = process.env.SB_PRIVATE_KEY_FILE;
        // TODO(bemasc): Remove casts once
        // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/15229 lands
        const apiServer = restify.createServer({
            certificate: fs.readFileSync(certificateFilename),
            key: fs.readFileSync(privateKeyFilename)
        });
        // Pre-routing handlers
        apiServer.pre(restify.CORS());
        // All routes handlers
        const apiPrefix = process.env.SB_API_PREFIX ? `/${process.env.SB_API_PREFIX}` : '';
        apiServer.pre(restify.pre.sanitizePath());
        apiServer.use(restify.jsonp());
        apiServer.use(restify.bodyParser());
        manager_service_1.bindService(apiServer, apiPrefix, managerService);
        apiServer.listen(portNumber, () => {
            logging.info(`Manager listening at ${apiServer.url}${apiPrefix}`);
        });
    });
}
function getPersistentFilename(file) {
    const stateDir = process.env.SB_STATE_DIR || DEFAULT_STATE_DIR;
    return path.join(stateDir, file);
}
process.on('unhandledRejection', (error) => {
    logging.error(`unhandledRejection: ${error.stack}`);
});
main().catch((error) => {
    logging.error(error.stack);
    process.exit(1);
});
