import { Router } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
const router = Router();
const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET_ORIGINALS || '';
router.post('/presigned', async (req, res) => {
    const { key, contentType } = req.body;
    if (!key) {
        res.status(400).json({ error: 'Missing key' });
        return;
    }
    const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType || 'application/octet-stream',
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 300 });
    res.json({ url, bucket: BUCKET, key });
});
export default router;
//# sourceMappingURL=uploads.js.map