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
const follow_redirects = require("../infrastructure/follow_redirects");
const logging = require("../infrastructure/logging");
const MS_PER_HOUR = 60 * 60 * 1000;
const SANCTIONED_COUNTRIES = new Set(['CU', 'IR', 'KP', 'SY']);
// Tracks usage metrics since the server started.
// TODO: migrate to an implementation that uses Prometheus.
class InMemoryUsageMetrics {
    constructor() {
        // Map from the metrics AccessKeyId to its usage.
        this.totalUsage = new Map();
        this.lastTimePortStat = new Map();
        this.activePort = new Map();
    }
    getUsage() {
        return [...this.totalUsage.values()];
    }
    addPort(port) {
        this.activePort.set(port, (this.activePort.get(port) || 0) + 1);
    }
    clearPort() {
        if (this.lastTimePortStat.size > 0) {
            this.lastTimePortStat.forEach((v, k) => {
                if (this.activePort.get(k) === v) {
                    this.activePort.delete(k);
                }
            });
        }
        this.lastTimePortStat.clear();
        this.activePort.forEach((v, k) => {
            this.lastTimePortStat.set(k, v);
        });
    }
    getPortMap() {
        return this.activePort;
    }
    // We use a separate metrics id so the accessKey id is not disclosed.
    writeBytesTransferred(accessKeyId, numBytes, countries) {
        // Don't record data for sanctioned countries.
        for (const country of countries) {
            if (SANCTIONED_COUNTRIES.has(country)) {
                return;
            }
        }
        if (numBytes === 0) {
            return;
        }
        const sortedCountries = new Array(...countries).sort();
        const entryKey = JSON.stringify([accessKeyId, sortedCountries]);
        let keyUsage = this.totalUsage.get(entryKey);
        if (!keyUsage) {
            keyUsage = { accessKeyId, inboundBytes: 0, countries: sortedCountries };
            this.totalUsage.set(entryKey, keyUsage);
        }
        keyUsage.inboundBytes += numBytes;
    }
    reset() {
        this.totalUsage.clear();
    }
}
exports.InMemoryUsageMetrics = InMemoryUsageMetrics;
class RestMetricsCollectorClient {
    constructor(serviceUrl) {
        this.serviceUrl = serviceUrl;
    }
    collectMetrics(reportJson) {
        const options = {
            url: this.serviceUrl,
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            body: JSON.stringify(reportJson)
        };
        logging.info('Posting metrics: ' + JSON.stringify(options));
        return new Promise((resolve, reject) => {
            follow_redirects.requestFollowRedirectsWithSameMethodAndBody(options, (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }
                logging.info('Metrics server responded with status ' + response.statusCode);
                resolve();
            });
        });
    }
}
exports.RestMetricsCollectorClient = RestMetricsCollectorClient;
// Keeps track of the connection metrics per user, since the startDatetime.
// This is reported to the Outline team if the admin opts-in.
class OutlineSharedMetricsPublisher {
    // serverConfig: where the enabled/disable setting is persisted
    // usageMetrics: where we get the metrics from
    // toMetricsId: maps Access key ids to metric ids
    // metricsUrl: where to post the metrics
    constructor(clock, serverConfig, usageMetrics, toMetricsId, metricsCollector) {
        this.clock = clock;
        this.serverConfig = serverConfig;
        this.usageMetrics = usageMetrics;
        this.toMetricsId = toMetricsId;
        this.metricsCollector = metricsCollector;
        // Start timer
        this.reportStartTimestampMs = this.clock.now();
        this.clock.setInterval(() => {
            /*if (!this.isSharingEnabled()) {
              return;
            }
            this.reportMetrics(usageMetrics.getUsage());
            usageMetrics.reset();*/
            usageMetrics.clearPort();
        }, 300000);
        // TODO(fortuna): also trigger report on shutdown, so data loss is minimized.
    }
    startSharing() {
        this.serverConfig.data().metricsEnabled = true;
        this.serverConfig.write();
    }
    stopSharing() {
        this.serverConfig.data().metricsEnabled = false;
        this.serverConfig.write();
    }
    isSharingEnabled() {
        return this.serverConfig.data().metricsEnabled || false;
    }
    getPortMetrics() {
        return this.usageMetrics.getPortMap();
    }
    reportMetrics(usageMetrics) {
        const reportEndTimestampMs = this.clock.now();
        const userReports = [];
        for (const keyUsage of usageMetrics) {
            if (keyUsage.inboundBytes === 0) {
                continue;
            }
            userReports.push({
                userId: this.toMetricsId(keyUsage.accessKeyId) || '',
                bytesTransferred: keyUsage.inboundBytes,
                countries: [...keyUsage.countries]
            });
        }
        const report = {
            serverId: this.serverConfig.data().serverId,
            startUtcMs: this.reportStartTimestampMs,
            endUtcMs: reportEndTimestampMs,
            userReports
        };
        this.reportStartTimestampMs = reportEndTimestampMs;
        if (userReports.length === 0) {
            return;
        }
        this.metricsCollector.collectMetrics(report);
    }
}
exports.OutlineSharedMetricsPublisher = OutlineSharedMetricsPublisher;
