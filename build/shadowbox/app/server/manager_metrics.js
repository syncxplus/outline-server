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
// ManagerMetrics keeps track of the number of bytes transferred per user, per day.
// Surfaced by the manager service to display on the Manager UI.
// TODO: Remove entries older than 30d.
class ManagerMetrics {
    constructor(clock, config) {
        this.clock = clock;
        this.config = config;
        const serializedObject = config.data();
        if (serializedObject) {
            this.dailyUserBytesTransferred = new Map(serializedObject.dailyUserBytesTransferred);
            this.userIdSet = new Set(serializedObject.userIdSet);
        }
        else {
            this.dailyUserBytesTransferred = new Map();
            this.userIdSet = new Set();
        }
    }
    writeBytesTransferred(userId, numBytes) {
        this.userIdSet.add(userId);
        const date = new Date(this.clock.now());
        const oldTotal = this.getBytes(userId, date);
        const newTotal = oldTotal + numBytes;
        this.dailyUserBytesTransferred.set(this.getKey(userId, date), newTotal);
        this.toJson(this.config.data());
        this.config.write();
    }
    get30DayByteTransfer() {
        const bytesTransferredByUserId = {};
        for (let i = 0; i < 30; ++i) {
            // Get Date from i days ago.
            const d = new Date(this.clock.now());
            d.setDate(d.getDate() - i);
            // Get transfer per userId and total
            for (const userId of this.userIdSet) {
                if (!bytesTransferredByUserId[userId]) {
                    bytesTransferredByUserId[userId] = 0;
                }
                const numBytes = this.getBytes(userId, d);
                bytesTransferredByUserId[userId] += numBytes;
            }
        }
        return { bytesTransferredByUserId };
    }
    // Returns the state of this object, e.g.
    // {"dailyUserBytesTransferred":[["0-20170816",100],["1-20170816",100]],"userIdSet":["0","1"]}
    toJson(target) {
        // Use [...] operator to serialize Map and Set objects to JSON.
        target.dailyUserBytesTransferred = [...this.dailyUserBytesTransferred];
        target.userIdSet = [...this.userIdSet];
    }
    getBytes(userId, d) {
        const key = this.getKey(userId, d);
        return this.dailyUserBytesTransferred.get(key) || 0;
    }
    getKey(userId, d) {
        const yyyymmdd = d.toISOString().substr(0, 'YYYY-MM-DD'.length).replace(/-/g, '');
        return `${userId}-${yyyymmdd}`;
    }
}
exports.ManagerMetrics = ManagerMetrics;
