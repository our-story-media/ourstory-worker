FROM node:6-stretch
MAINTAINER Tom Bartindale <tom@bartindale.com>

RUN apt-get update -q && \
	apt-get install -q -y -o Dpkg::Options::="--force-confdef" -o \
    Dpkg::Options::="--force-confold" \
    libav-tools \
    melt \
    libxmu-dev \
    unzip

WORKDIR /usr/src/app
# https://uk.mathworks.com/supportfiles/MCR_Runtime/R2012b/MCR_R2012b_glnxa64_installer.zip
RUN wget https://uk.mathworks.com/supportfiles/MCR_Runtime/R2012b/MCR_R2012b_glnxa64_installer.zip -O matlabruntime.zip && mkdir matlabruntime && cd matlabruntime && unzip ../matlabruntime.zip && /usr/src/app/matlabruntime/install -mode silent -agreeToLicense yes

# RUN wget https://github.com/mltframework/mlt/releases/download/v6.6.0/mlt-6.6.0.tar.gz -O mlt.tar.gz
# RUN tar -xf mlt.tar.gz
# RUN cd mlt-6.6.0 && ./configure && make && make install

# RUN melt -query filter=avfilter.rotate

# RUN ln -s /usr/bin/avconv /usr/bin/ffmpeg
# RUN ln -s /usr/bin/avprobe /usr/bin/ffprobe

# COPY sync_audio/SyncClips /usr/src/app/SyncClips
# RUN chmod +x /usr/src/app/SyncClips

RUN mkdir -p /usr/src/app

RUN npm i -g nodemon --silent
COPY package.json /usr/src/app/
RUN npm i --silent

# COPY config/local.js /tmp
COPY . /usr/src/app

CMD [ "npm", "start" ]