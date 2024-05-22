FROM jrottenberg/ffmpeg:4.3-ubuntu2204

RUN apt-get update && apt-get install -y curl \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs

WORKDIR /usr/src/transcoder

COPY package*.json .

RUN npm install

COPY . .

ENTRYPOINT [ "node", "src/transcode.js" ]
