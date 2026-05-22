// src/lambdas/image-resize.ts
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Jimp } from "jimp";
var s3 = new S3Client({});
var ORIGINALS_BUCKET = process.env.ORIGINALS_BUCKET || "";
var RESIZED_BUCKET = process.env.RESIZED_BUCKET || "";
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
var handler = async (event) => {
  for (const record of event.Records || []) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    if (bucket !== ORIGINALS_BUCKET) continue;
    const getRes = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!getRes.Body) continue;
    const buffer = await streamToBuffer(getRes.Body);
    const image = await Jimp.read(buffer);
    image.resize({ w: 400 });
    const outBuffer = await image.getBuffer("image/jpeg");
    await s3.send(new PutObjectCommand({
      Bucket: RESIZED_BUCKET,
      Key: key,
      Body: outBuffer,
      ContentType: getRes.ContentType || "image/jpeg"
    }));
  }
  return { statusCode: 200 };
};
export {
  handler
};
