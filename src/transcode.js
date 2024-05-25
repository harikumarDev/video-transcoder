const { existsSync, mkdirSync, writeFileSync, unlinkSync } = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

dotenv.config();
ffmpeg.setFfmpegPath(ffmpegPath);

const db = require("../config/db");
const Video = require("../models/video");
const { getObject, upload, uploadDir } = require("./aws");
const { generateThumbnail } = require("./thumbnail");
const {
  transcodeConfig,
  targetResolutions,
  resolutions_named,
} = require("./constants");
const {
  getMasterManifestContent,
  getVideoResolution,
  getVideoDuration,
  secondsToHMS,
} = require("./utils");

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

const getVideoDetails = async (videoId) => {
  console.log("Getting video details: ", videoId);

  try {
    await db.connect();

    const video = await Video.findById(videoId);

    await db.disconnect();

    return video;
  } catch (err) {
    console.log("Error getting video details: ", err);
  }
};

const updateVideo = async (videoId, videoUpdates) => {
  console.log("Updating video to processed: ", videoId);

  try {
    await db.connect();

    await Video.findByIdAndUpdate(videoId, videoUpdates);

    await db.disconnect();
  } catch (err) {
    console.log("Error setting video to processed: ", err);
  }
};

async function start() {
  // Body of SQS message
  let messageBody = process.env.MSG_BODY;

  if (!messageBody) {
    console.log("No message body.");
    return;
  }

  messageBody = JSON.parse(messageBody.replace(/\\"/g, '"'));

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
    const video = await getVideoDetails(videoId);

    if (!video) {
      throw new Error(`Video not found: ${videoId}`);
    }

    if (video.isProcessed) {
      throw new Error("Video is already processed");
    }

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

    const masterHlsPath = hlsPath + "/master.m3u8";
    const duration = await getVideoDuration(filePath); // duration in seconds
    const formattedDuration = secondsToHMS(duration); // duration in the format HH:MM:SS

    let videoUpdates = {
      isProcessed: true,
      hlsPath: masterHlsPath,
      duration: formattedDuration,
    };

    // Generate thumbnail if not uploaded by user
    if (!video.thumbnailPath) {
      const thumbnailsDir = path.join(__dirname, "./thumbnails");
      const thumbailFileName = videoId + ".jpg";

      if (!existsSync(thumbnailsDir)) {
        mkdirSync(thumbnailsDir, { recursive: true });
      }

      const randomTimestamp = Math.floor(Math.random() * duration);

      await generateThumbnail(
        filePath,
        randomTimestamp,
        thumbnailsDir,
        thumbailFileName
      );

      // Uploading to S3
      const thumbnailPath = `${thumbnailsDir}/${thumbailFileName}`;
      const s3Path = `thumbnails/${thumbailFileName}`;

      await upload(s3Path, thumbnailPath, "image/jpeg");

      videoUpdates = {
        ...videoUpdates,
        thumbnailPath: s3Path,
      };
    }

    await updateVideo(video._id, videoUpdates);

    console.log("Video processed.");
  } catch (err) {
    console.log("Error transcoding the video: ", err);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}

start();
