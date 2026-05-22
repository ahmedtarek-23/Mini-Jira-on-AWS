// src/lambdas/image-resize.ts
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
var s3 = new S3Client({});
var ORIGINALS_BUCKET = process.env.ORIGINALS_BUCKET || "";
var RESIZED_BUCKET = process.env.RESIZED_BUCKET || "";
var IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif"
];
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
var handler = async (event) => {
  for (const record of event.Records || []) {
    try {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
      if (bucket !== ORIGINALS_BUCKET) continue;
      const getRes = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!getRes.Body) continue;
      const contentType = getRes.ContentType || "";
      if (!IMAGE_CONTENT_TYPES.includes(contentType)) {
        console.log(`Skipping non-image: ${key} (${contentType})`);
        continue;
      }
      const buffer = await streamToBuffer(getRes.Body);
      const outBuffer = await sharp(buffer).resize(400).jpeg({ mozjpeg: true }).toBuffer();
      await s3.send(new PutObjectCommand({
        Bucket: RESIZED_BUCKET,
        Key: key,
        Body: outBuffer,
        ContentType: "image/jpeg"
      }));
    } catch (err) {
      console.error(`Image resize error for record ${record.s3?.object?.key}:`, err.message);
    }
  }
  return { statusCode: 200 };
};
export {
  handler
};
