const ffmpeg = require("fluent-ffmpeg");

const generateThumbnail = async (filePath, timestamp, outputDir, fileName) => {
  console.log("Generating Thumbnail...");

  const thumbnailPath = `${outputDir}/${fileName}`;

  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .seekInput(timestamp)
      .frames(1)
      .size("1280x720")
      .output(thumbnailPath)
      .on("end", () => {
        resolve();
      })
      .on("error", (err) => {
        reject(err);
      })
      .run();
  });
};

module.exports = {
  generateThumbnail,
};
