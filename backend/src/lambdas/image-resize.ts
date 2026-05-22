import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { Readable } from 'stream'

const s3 = new S3Client({})

const ORIGINALS_BUCKET = process.env.ORIGINALS_BUCKET || ''
const RESIZED_BUCKET = process.env.RESIZED_BUCKET || ''

const IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
]

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export const handler = async (event: any) => {
  for (const record of event.Records || []) {
    try {
      const bucket = record.s3.bucket.name
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '))
      if (bucket !== ORIGINALS_BUCKET) continue

      const getRes = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      if (!getRes.Body) continue

      const contentType = getRes.ContentType || ''
      if (!IMAGE_CONTENT_TYPES.includes(contentType)) {
        console.log(`Skipping non-image: ${key} (${contentType})`)
        continue
      }

      const buffer = await streamToBuffer(getRes.Body as Readable)

      const outBuffer = await sharp(buffer)
        .resize(400)
        .jpeg({ mozjpeg: true })
        .toBuffer()

      await s3.send(new PutObjectCommand({
        Bucket: RESIZED_BUCKET,
        Key: key,
        Body: outBuffer,
        ContentType: 'image/jpeg',
      }))
    } catch (err: any) {
      console.error(`Image resize error for record ${record.s3?.object?.key}:`, err.message)
    }
  }
  return { statusCode: 200 }
}
