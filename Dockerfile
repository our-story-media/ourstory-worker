FROM node:8-stretch

LABEL maintainer="Tom Bartindale <tom@bartindale.com>"

COPY . /usr/src/app

RUN mkdir -p /usr/src/app && \
    apt-get update -q && \
	apt-get install -q -y -o Dpkg::Options::="--force-confdef" -o \
    Dpkg::Options::="--force-confold" \
    libav-tools \
    melt && \
    npm i -g nodemon --silent && \
    npm i --silent && \
    npm cache clean --force && \
    mkdir ~/.fonts && cp -r /usr/src/app/fonts/* ~/.fonts && chmod -R 644 ~/.fonts && fc-cache

WORKDIR /usr/src/app 

CMD [ "npm", "start" ]