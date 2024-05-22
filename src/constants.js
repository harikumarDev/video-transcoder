const transcodeConfig = {
  FORMAT: "hls",
  HLS_SEGMENT_DURATION: 10,
  HLS_LIST_SIZE: 0,
  CODEC: {
    AUDIO: "aac",
    VIDEO: "h264",
  },
};

const ULD = "426x240";
const LD = "640x360";
const SD = "854x480";
const HD = "1280x720";
const FHD = "1920x1080";

const bandwidthLimits = {
  [ULD]: 400000,
  [LD]: 700000,
  [SD]: 1200000,
  [HD]: 2500000,
  [FHD]: 4500000,
};

const targetResolutions = [
  {
    name: "360p",
    resolution: LD,
    fps: 30,
    videoBitrate: "750k",
    audioBitrate: "64k",
  },
  {
    name: "480p",
    resolution: SD,
    fps: 30,
    videoBitrate: "1200k",
    audioBitrate: "96k",
  },
  {
    name: "720p",
    resolution: HD,
    fps: 60,
    videoBitrate: "2500k",
    audioBitrate: "128k",
  },
  {
    name: "1080p",
    resolution: FHD,
    fps: 60,
    videoBitrate: "4500k",
    audioBitrate: "192k",
  },
];

module.exports = {
  transcodeConfig,
  targetResolutions,
  bandwidthLimits,
  resolutions_named: {
    ULD,
    LD,
    SD,
    HD,
    FHD,
  },
};
