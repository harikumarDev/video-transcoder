const ffmpeg = require("fluent-ffmpeg");
const { bandwidthLimits } = require("./constants");

const getVideoResolution = (filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        return reject("Error getting video resolution: ", err.message);
      }

      const { width, height } = metadata.streams[0];

      resolve({
        width,
        height,
      });
    });
  });
};

const getMasterManifestContent = (resolutions) => {
  const manifestContent = ["#EXTM3U", "#EXT-X-VERSION:3\n"];

  resolutions.forEach((res) => {
    const { resolution } = res;
    const manifestFile = `manifest_${resolution}.m3u8`;

    const bandwidth = bandwidthLimits[resolution];

    manifestContent.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}`
    );
    manifestContent.push(manifestFile);
  });

  return manifestContent;
};

module.exports = {
  getVideoResolution,
  getMasterManifestContent,
};
