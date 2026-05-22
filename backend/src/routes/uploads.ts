import { Router } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const router = Router();
const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET_ORIGINALS || '';

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

router.post('/presigned', async (req, res) => {
  try {
    const { key, contentType } = req.body;
    if (!key) { res.status(400).json({ error: 'Missing key' }); return; }
    if (!key.startsWith('tasks/')) {
      res.status(400).json({ error: 'Key must start with tasks/' });
      return;
    }
    if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
      res.status(400).json({ error: 'Invalid content type. Allowed: image/jpeg, image/png, image/gif, image/webp, image/avif' });
      return;
    }
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 300 });
    res.json({ url, bucket: BUCKET, key });
  } catch (err: any) {
    console.error('Presigned URL error:', err);
    res.status(500).json({ error: 'Failed to generate upload URL', detail: err.message });
  }
});

router.get('/buckets', async (_req, res) => {
  res.json({
    originals: `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`,
    resized: `https://${process.env.S3_BUCKET_RESIZED}.s3.${process.env.AWS_REGION}.amazonaws.com`,
  });
});

export default router;
