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

const secondsToHMS = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const formattedMinutes = String(minutes).padStart(2, "0");
  const formattedSeconds = String(secs).padStart(2, "0");

  if (hours > 0) {
    const formattedHours = String(hours).padStart(2, "0");
    return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
  } else if (minutes > 0) {
    return `${minutes}:${formattedSeconds}`;
  } else {
    return `0:${formattedSeconds}`;
  }
};

const getVideoDuration = (filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        return reject("Error getting video duration: ", err.message);
      }

      const duration = Math.max(metadata.format.duration, 1); // To avoid edgecases

      resolve(duration);
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
  getVideoDuration,
  secondsToHMS,
};
