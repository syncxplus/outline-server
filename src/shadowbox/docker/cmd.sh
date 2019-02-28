#!/bin/sh
#
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

[[ -e '/env' ]] && source /env

ip=${SB_PUBLIC_IP:-$(curl -ks --connect-timeout 1 -m 1 https://ipinfo.io/ip)}
[[ "$?" != 0 ]] && {
  inet=$(ip addr show eth0|grep inet\\s|awk '{print $2}')
  ip=${inet%/*}
}

export SB_PUBLIC_IP=${ip}
export SB_API_PORT=1023
export SB_API_PREFIX=api
export SB_METRICS_URL=${SB_METRICS_URL:-https://metrics-prod.uproxy.org}
export SB_STATE_DIR=/root/shadowbox/persisted-state
export SB_CERTIFICATE_FILE="${SB_STATE_DIR}/shadowbox-selfsigned.crt"
export SB_PRIVATE_KEY_FILE="${SB_STATE_DIR}/shadowbox-selfsigned.key"


# The maximum number of files that can be opened by ss-server greatly
# influence on performance, as described here:
#   https://shadowsocks.org/en/config/advanced.html
#
# The steps described in that page do *not* work for processes running
# under Docker, at least on modern Debian/Ubuntu-like systems whose init
# daemons allow per-service limits and ignore completely
# /etc/security/limits.conf. On those systems, the Shadowbox container
# will, by default, inherit the limits configured for the Docker service:
#   https://docs.docker.com/engine/reference/commandline/run/#set-ulimits-in-container-ulimit
#
# Interestingly, we observed poor performance with large values such as 524288
# and 1048576, the default values in recent releases of Ubuntu. Our
# non-exhaustive testing indicates a performance cliff for Outline after values
# around 270k; to stay well bekow of this cliff we've semi-handwaved-ly settled
# upon a limit of 32k files.
ulimit -n 32768

# Start cron, which is used to check for updates to the GeoIP database
crond

openssl req -x509 -nodes -days 36500 -newkey rsa:2048 -subj "/CN=${SB_PUBLIC_IP}" \
  -keyout "${SB_PRIVATE_KEY_FILE}" -out "${SB_CERTIFICATE_FILE}" >/dev/null 2>&1 \
  && CERT_OPENSSL_FINGERPRINT=$(openssl x509 -in "${SB_CERTIFICATE_FILE}" -noout -sha256 -fingerprint) \
  && CERT_HEX_FINGERPRINT=$(echo ${CERT_OPENSSL_FINGERPRINT#*=} | tr -d :) \
  && echo "certSha256:$CERT_HEX_FINGERPRINT" > "${SB_STATE_DIR}/access.txt" \
  && echo "apiUrl:https://${SB_PUBLIC_IP}:${SB_API_PORT}/${SB_API_PREFIX}" >> "${SB_STATE_DIR}/access.txt"

readonly user_config="${SB_STATE_DIR}/shadowbox_config.json"
if [[ ! -e "${user_config}" ]]; then
  echo -n '{"accessKeys":[{"id":"0","metricsId":"'>${user_config}
  uuid=$(cat /proc/sys/kernel/random/uuid) && echo -n ${uuid}>>${user_config}
  echo -n '","name":"","port":443,"encryptionMethod":"chacha20-ietf-poly1305","password":"shadowbox123"}],"nextId":1}'>>${user_config}
fi

node app/server/main.js
