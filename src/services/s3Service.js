'use strict';

const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client } = require('../config/aws');

const BUCKET = process.env.S3_BUCKET_NAME;
const RESIZED_BUCKET = process.env.S3_RESIZED_BUCKET_NAME;
const REGION = process.env.AWS_REGION || 'us-east-1';

/**
 * Generate a pre-signed PUT URL so the browser uploads directly to S3.
 * The backend never touches the file bytes — only the URL.
 */
async function getPresignedUploadUrl(taskId, contentType) {
  const ext = contentType.split('/')[1] || 'jpg';
  const key = `tasks/${taskId}/original.${ext}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 }); // 15 min

  return {
    uploadUrl,
    key,
    imageUrl: `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`,
  };
}

/**
 * Delete an object from the originals bucket (called on task image replace / task delete).
 */
async function deleteObject(key) {
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Delete a resized thumbnail (called when a task is deleted).
 */
async function deleteResizedObject(key) {
  if (!RESIZED_BUCKET) return;
  await s3Client.send(new DeleteObjectCommand({ Bucket: RESIZED_BUCKET, Key: key })).catch(() => {});
}

/**
 * Build the public URL for a known S3 key.
 */
function getPublicUrl(key) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

module.exports = { getPresignedUploadUrl, deleteObject, deleteResizedObject, getPublicUrl };
