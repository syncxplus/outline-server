FROM alpine:3.8

RUN apk add --no-cache curl

WORKDIR /data

RUN SS_VER=$(curl -s https://api.github.com/repos/Jigsaw-Code/outline-ss-server/releases/latest | grep tag_name | awk '{print $2}' | sed 's/[",]//g') \
 && curl -sL https://github.com/Jigsaw-Code/outline-ss-server/releases/download/${SS_VER}/outline-ss-server_${SS_VER##*v}_linux_x86_64.tar.gz | tar xzv

ENTRYPOINT ["/data/outline-ss-server", "-verbose", "-metrics", "0.0.0.0:9090", "-config"]
