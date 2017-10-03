FROM node:6
MAINTAINER Tom Bartindale <tom@bartindale.com>

RUN apt-get update -q && \
	apt-get install -q -y -o Dpkg::Options::="--force-confdef" -o \
    Dpkg::Options::="--force-confold" \
    melt \
    libav-tools \
    libxmu-dev \
    unzip

WORKDIR /usr/src/app
# https://uk.mathworks.com/supportfiles/MCR_Runtime/R2012b/MCR_R2012b_glnxa64_installer.zip
RUN wget https://uk.mathworks.com/supportfiles/MCR_Runtime/R2012b/MCR_R2012b_glnxa64_installer.zip -O matlabruntime.zip
RUN mkdir matlabruntime && cd matlabruntime && unzip ../matlabruntime.zip
RUN /usr/src/app/matlabruntime/install -mode silent -agreeToLicense yes
# RUN ls -la 

RUN ln -s /usr/bin/avconv /usr/bin/ffmpeg
RUN ln -s /usr/bin/avprobe /usr/bin/ffprobe

# COPY sync_audio/SyncClips /usr/src/app/SyncClips
# RUN chmod +x /usr/src/app/SyncClips

RUN mkdir -p /usr/src/app

RUN npm i -g nodemon --silent
COPY package.json /usr/src/app/
RUN npm i --silent

# COPY config/local.js /tmp
COPY . /usr/src/app

CMD [ "npm", "start" ]