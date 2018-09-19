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
const fs = require("fs");
const file_read = require("./file_read");
const logging = require("./logging");
function loadFileConfig(filename) {
    const text = file_read.readFileIfExists(filename);
    let dataJson = {};
    if (text) {
        dataJson = JSON.parse(text);
    }
    return new FileConfig(filename, dataJson);
}
exports.loadFileConfig = loadFileConfig;
// FileConfig is a JsonConfig backed by a filesystem file.
class FileConfig {
    constructor(filename, dataJson) {
        this.filename = filename;
        this.dataJson = dataJson;
    }
    data() {
        return this.dataJson;
    }
    write() {
        // Write to temporary file, then move that temporary file to the
        // persistent location, to avoid accidentally breaking the metrics file.
        // Use *Sync calls for atomic operations, to guard against corrupting
        // these files.
        const tempFilename = `${this.filename}.${Date.now()}`;
        try {
            fs.writeFileSync(tempFilename, JSON.stringify(this.dataJson), { encoding: 'utf8' });
            fs.renameSync(tempFilename, this.filename);
        }
        catch (error) {
            // TODO: Stop swalling the exception and handle it in the callers.
            logging.error(`Error writing config ${this.filename} ${error}`);
        }
    }
}
exports.FileConfig = FileConfig;
// ChildConfig is a JsonConfig backed by another config.
class ChildConfig {
    constructor(parentConfig, dataJson) {
        this.parentConfig = parentConfig;
        this.dataJson = dataJson;
    }
    data() {
        return this.dataJson;
    }
    write() {
        this.parentConfig.write();
    }
}
exports.ChildConfig = ChildConfig;
// DelayedConfig is a JsonConfig that only writes the data in a periodic time interval.
// Calls to write() will mark the data as "dirty" for the next inverval.
class DelayedConfig {
    constructor(config, writePeriodMs) {
        this.config = config;
        this.dirty = false;
        // This repeated call will never be cancelled until the execution is terminated.
        setInterval(() => {
            if (!this.dirty) {
                return;
            }
            this.config.write();
            this.dirty = false;
        }, writePeriodMs);
    }
    data() {
        return this.config.data();
    }
    write() {
        this.dirty = true;
    }
}
exports.DelayedConfig = DelayedConfig;
// InMemoryConfig is a JsonConfig backed by an internal member variable. Useful for testing.
class InMemoryConfig {
    constructor(dataJson) {
        this.dataJson = dataJson;
        this.mostRecentWrite = this.dataJson;
    }
    data() {
        return this.dataJson;
    }
    write() {
        this.mostRecentWrite = JSON.parse(JSON.stringify(this.dataJson));
    }
}
exports.InMemoryConfig = InMemoryConfig;
