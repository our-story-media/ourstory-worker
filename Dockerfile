FROM node:8-stretch

LABEL maintainer="Tom Bartindale <tom@bartindale.com>"

COPY . /usr/src/app

WORKDIR /usr/src/app

RUN mkdir -p /usr/src/app && \
    apt-get update -q && \
	apt-get install -q -y -o Dpkg::Options::="--force-confdef" -o \
    Dpkg::Options::="--force-confold" \
    libav-tools \
    melt && \
    npm i --silent && \
    mkdir ~/.fonts && cp -r /usr/src/app/fonts/* ~/.fonts && chmod -R 644 ~/.fonts && fc-cache

CMD [ "npm", "start" ]