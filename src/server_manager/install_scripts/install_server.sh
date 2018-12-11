# Copyright 2018 The Outline Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Script to install a shadowbox docker container, a watchtower docker container
# (to automatically update shadowbox), and to create a new shadowbox user.

# You may set the following environment variables, overriding their defaults:
# SB_IMAGE: Shadowbox Docker image to install, e.g. quay.io/outline/shadowbox:nightly
# SB_API_PORT: The port number of the management API.
# SHADOWBOX_DIR: Directory for persistent Shadowbox state.
# SB_PUBLIC_IP: The public IP address for Shadowbox.
# ACCESS_CONFIG: The location of the access config text file.
# SB_DEFAULT_SERVER_NAME: Default name for this server, e.g. "Outline server New York".
#     This name will be used for the server until the admins updates the name
#     via the REST API.
# SENTRY_LOG_FILE: File for writing logs which may be reported to Sentry, in case
#     of an install error. No PII should be written to this file. Intended to be set
#     only by do_install_server.sh.
# WATCHTOWER_REFRESH_SECONDS: refresh interval in seconds to check for updates,
#     defaults to 3600.

# Requires curl and docker to be installed

set -euo pipefail

readonly name=syncxplus/shadowbox

tag=$(curl -ks --connect-timeout 10 -m 10 https://registry.hub.docker.com/v1/repositories/${name}/tags |sed -e 's/[][]//g' -e 's/"//g' -e 's/ //g' | tr '}' '\n' | awk -F: '{print $3}'|grep -v '[A-Za-z]' | sort | awk 'END{print}')
if [[ "$?" != 0 ]]; then
  version=latest
else
  version=${tag}
fi

readonly image=${name}:${version}

echo Using ${image}

docker pull ${image}

readonly container=$(docker ps -a | grep shadowbox | awk '{print $1}')

[[ ! -z "${container}" ]] && docker rm -f -v ${container}

docker run --restart always --name shadowbox --net host -v /root/shadowbox:/root/shadowbox/persisted-state -d ${image}
