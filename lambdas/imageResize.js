'use strict';

/**
 * Lambda — Image Resize
 * Trigger: S3 PUT event on the originals bucket (mini-jira-attachments)
 * Action:  Reads the uploaded image, resizes it to a thumbnail, writes to the
 *          resized bucket (mini-jira-attachments-resized).
 *
 * Requires: sharp (add as a Lambda layer or bundle with the deployment package)
 *   npm install sharp
 */

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const RESIZED_BUCKET = process.env.S3_RESIZED_BUCKET_NAME;
const THUMBNAIL_WIDTH = 400;

// Lazy-require sharp so the function still deploys even if sharp is on a layer
let sharp;
try { sharp = require('sharp'); } catch {}

exports.handler = async (event) => {
  for (const record of event.Records) {
    const sourceBucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    // Stream original image from S3
    const { Body, ContentType } = await s3.send(
      new GetObjectCommand({ Bucket: sourceBucket, Key: key })
    );

    const chunks = [];
    for await (const chunk of Body) chunks.push(chunk);
    const inputBuffer = Buffer.concat(chunks);

    // Resize with sharp
    const outputBuffer = await sharp(inputBuffer)
      .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
      .toBuffer();

    // Write thumbnail to resized bucket under same key
    await s3.send(
      new PutObjectCommand({
        Bucket: RESIZED_BUCKET,
        Key: key,
        Body: outputBuffer,
        ContentType: ContentType || 'image/jpeg',
      })
    );

    console.log(`Resized ${key} → ${RESIZED_BUCKET}/${key}`);
  }
};
