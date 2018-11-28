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
const maxmind = require("maxmind");
// An IpLocationService that uses the node-maxmind package.
// The database is downloaded by scripts/update_mmdb.sh.
// The Dockerfile runs this script on boot and configures the system to run it weekly.
class MmdbLocationService {
    constructor(filename) {
        this.db = new Promise((fulfill, reject) => {
            // TODO: Change type to maxmind.Options once the type definition is updated
            // with these fields.
            const options = { watchForUpdates: true, watchForUpdatesNonPersistent: true };
            maxmind.open(filename, options, (err, reader) => {
                if (err) {
                    reject(err);
                }
                else {
                    fulfill(reader);
                }
            });
        });
    }
    countryForIp(ipAddress) {
        return this.db.then((reader) => {
            if (!reader) {
                throw new Error('MMDB reader is not valid');
            }
            if (!maxmind.validate(ipAddress)) {
                throw new Error('Invalid IP address');
            }
            const result = reader.get(ipAddress);
            return (result && result.country && result.country.iso_code) || 'ZZ';
        });
    }
}
exports.MmdbLocationService = MmdbLocationService;
