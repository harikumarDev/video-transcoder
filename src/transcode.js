const { existsSync, mkdirSync, writeFileSync, unlinkSync } = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

dotenv.config();
ffmpeg.setFfmpegPath(ffmpegPath);

const { getObject, uploadDir } = require("./aws");
const {
  transcodeConfig,
  targetResolutions,
  bandwidthLimits,
  resolutions_named,
} = require("./constants");

const transcodeVideo = (inputPath, outputDir, resolutionOptions) => {
  const { resolution, fps, videoBitrate, audioBitrate } = resolutionOptions;
  const { FORMAT, HLS_SEGMENT_DURATION, HLS_LIST_SIZE, CODEC } =
    transcodeConfig;

  const manifestPath = `${outputDir}/manifest_${resolution}.m3u8`;

  console.log(`Trascoding into ${resolution}...`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        `-vf scale=${resolution}`,
        `-r ${fps}`,
        `-b:v ${videoBitrate}`,
        `-b:a ${audioBitrate}`,
        `-f ${FORMAT}`,
        `-hls_time ${HLS_SEGMENT_DURATION}`,
        `-hls_list_size ${HLS_LIST_SIZE}`,
        `-hls_segment_filename ${outputDir}/${resolution}_%03d.ts`,
        `-c:v ${CODEC.VIDEO}`,
        `-c:a ${CODEC.AUDIO}`,
      ])
      .output(manifestPath)
      .on("end", () => {
        console.log(`Transcoding complete for ${resolution}.`);
        resolve();
      })
      .on("error", (err) => {
        console.log(`Err transcoding ${resolution}`);
        reject(err);
      })
      .run();
  });
};

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

async function start() {
  // Body of SQS message
  const messageBody = process.env.MSG_BODY;

  if (!messageBody) {
    console.log("No message body.");
    return;
  }

  if (!messageBody["Records"] || messageBody["Records"].length === 0) {
    console.log("No records in message body: ", messageBody);
    return;
  }

  // Records in body holds the event (upload complete) details
  const event = messageBody["Records"][0]; // Taking the first event - we receive only 1 event and 1 message per batch

  const s3 = event?.s3;

  // Followed Key format (raw file): <user_id>/videos/<video_id>/raw
  const objectKey = s3?.object?.key;

  if (!objectKey) {
    console.log("No object key found in event: ", event);
    return;
  }

  const downloadDir = path.join(__dirname, `./raw_files`);
  if (!existsSync(downloadDir)) {
    mkdirSync(downloadDir, { recursive: true });
  }

  const keyArr = objectKey.split("/"); // => [user_id, videos, video_id, raw]
  const videoId = keyArr[keyArr.length - 2]; // => video_id

  const filePath = `${downloadDir}/${videoId}`;

  try {
    console.log("Downloading video from S3...: ", videoId);
    await getObject(objectKey, filePath);
    console.log("Video downloaded: ", videoId);

    const videoResolution = await getVideoResolution(filePath);
    console.log(
      `Raw video resolution: ${videoResolution.width}x${videoResolution.height}`
    );

    const resolutionsToTranscode = targetResolutions.filter((res) => {
      const [width, height] = res.resolution.split("x").map(Number);

      return (
        (width <= videoResolution.width) & (height <= videoResolution.height)
      );
    });
    console.log("Transcoding to: ", resolutionsToTranscode);

    if (resolutionsToTranscode.length === 0) {
      resolutionsToTranscode.push({
        name: "240p",
        resolution: resolutions_named.ULD,
        fps: 24,
        videoBitrate: "400k",
        audioBitrate: "64k",
      });
    }

    const outputDir = path.join(__dirname, `./transcoded/${videoId}`);

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    console.log("Transcoding: ", videoId);

    const transcodingPromises = resolutionsToTranscode.map((res) =>
      transcodeVideo(filePath, outputDir, res)
    );

    await Promise.all(transcodingPromises);

    console.log("Creating master manifest...");
    const masterManifestContent = getMasterManifestContent(
      resolutionsToTranscode
    );

    const masterManifestPath = `${outputDir}/master.m3u8`;
    writeFileSync(masterManifestPath, masterManifestContent.join("\n"));

    console.log("Master manifest created.");

    console.log("Uploading transcoded files to S3...");
    const videoPath = keyArr.slice(0, keyArr.length - 1).join("/");
    const hlsPath = `${videoPath}/hls`;

    await uploadDir(hlsPath, outputDir);

    console.log("Uploaded files to S3");
  } catch (err) {
    console.log("Error transcoding the video: ", err);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}

start();
