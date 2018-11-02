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
const request = require("request-lite");
// Makes an http(s) request, and follows any redirect with the same request
// without changing the request method or body.  This is used because typical
// http(s) clients follow redirects for POST/PUT/DELETE requests by changing the
// method to GET and removing the request body.  Function signature matches the
// request/request-lite function.
function requestFollowRedirectsWithSameMethodAndBody(options, callback) {
    // Make a copy of options to modify parameters.
    const modifiedOptions = Object.assign({}, options);
    modifiedOptions.followAllRedirects = false;
    modifiedOptions.followRedirect = false;
    request(modifiedOptions, (error, response, body) => {
        if (!error && response.statusCode >= 300 && response.statusCode < 400 &&
            response.headers.location) {
            // Request has been redirected, try again at the new location.
            modifiedOptions.url = response.headers.location;
            return requestFollowRedirectsWithSameMethodAndBody(modifiedOptions, callback);
        }
        else {
            // Request has not been redirected, invoke callback.
            return callback(error, response, body);
        }
    });
}
exports.requestFollowRedirectsWithSameMethodAndBody = requestFollowRedirectsWithSameMethodAndBody;
