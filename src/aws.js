const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const fs = require("fs");

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucketRegion = process.env.AWS_BUCKET_REGION;
const bucketName = process.env.AWS_BUCKET_NAME;

const s3 = new S3Client({
  region: bucketRegion,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const getObject = async (key, downloadPath) => {
  console.log("Get object: ", key);

  const params = {
    Bucket: bucketName,
    Key: key,
  };

  const command = new GetObjectCommand(params);

  const { Body } = await s3.send(command);

  return new Promise((resolve, reject) => {
    const writable = fs.createWriteStream(downloadPath);

    Body.pipe(writable);

    writable.on("finish", resolve);

    // Reject if any error in Body or write stream
    Body.on("error", reject);
    writable.on("error", reject);
  });
};

const upload = async (s3Path, filePath, contentType) => {
  console.log("Put Object: ", filePath);

  const fileStream = fs.createReadStream(filePath);

  const params = {
    Bucket: bucketName,
    Key: s3Path,
    Body: fileStream,
    ContentType: contentType,
  };

  const command = new PutObjectCommand(params);

  const uploadResp = await s3.send(command);

  return uploadResp;
};

const uploadDir = async (path, localDir) => {
  const files = fs.readdirSync(localDir);

  files.forEach(async (file) => {
    const s3Path = `${path}/${file}`;
    const filePath = `${localDir}/${file}`;
    const contentType = file.endsWith(".ts")
      ? "video/mp2t"
      : "application/x-mpegURL";

    await upload(s3Path, filePath, contentType);

    fs.unlinkSync(filePath);
  });
};

module.exports = {
  getObject,
  upload,
  uploadDir,
};
