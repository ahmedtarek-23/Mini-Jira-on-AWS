# Start Here (Architecture Diagram — Your Part)

Repo: https://github.com/ahmedtarek-23/Mini-Jira-on-AWS

You do **not** need to understand all the code. Your deliverable is **one PNG diagram** in this folder.

---

## Step 1 — Open the template (15 min)

1. Go to **https://app.diagrams.net**
2. **File → Open from → Device**
3. Open this file on your Mac:

   `Mini-Jira-on-AWS/docs/mini-jira-architecture.drawio`

4. Left sidebar: **More Shapes** → search **AWS** → enable **AWS19** (or AWS Architecture)
5. Replace the colored boxes with real AWS icons (drag from the AWS shape library onto each box)

Full checklist and arrow labels: read **ARCHITECTURE_DIAGRAM_GUIDE.md** in this same folder.

---

## Step 2 — Ask teammates for 2 values

Paste these on the diagram title area:

| Info | Who to ask |
|------|------------|
| CloudFront URL | **Done:** https://d1f71pped3yvzi.cloudfront.net/ |
| AWS region | **us-east-1** |

---

## Step 3 — Export and upload to GitHub (20 min)

1. In draw.io: **File → Export as → PNG** (200% zoom, 10px border)
2. Save as: `docs/architecture-diagram.png` (inside this repo)
3. Push to GitHub:

```bash
cd ~/Desktop/Assignment2_DistributedSystem/Mini-Jira-on-AWS
git add docs/architecture-diagram.png docs/
git commit -m "Add AWS architecture diagram"
git push
```

(You need GitHub write access — ask Ahmed or a teammate to add you as collaborator if push fails.)

---

## What the diagram must show (assignment checklist)

- 2 Availability Zones, each with public + private subnet
- CloudFront → ALB → EC2 (Auto Scaling, min 2 instances)
- Internet Gateway + NAT Gateway
- Cognito, DynamoDB, S3 (2 buckets), SNS (2 topics), SQS, EventBridge
- 3 Lambdas: `imageResize`, `assignmentWorker`, `dailyDigest`
- CloudWatch dashboard + alarm
- Arrows with short labels (HTTPS, JWT, ObjectCreated, etc.)

---

## Real service names from this repo (use on diagram)

| Service | Name in project |
|---------|-----------------|
| S3 originals | `mini-jira-attachments` |
| S3 thumbnails | `mini-jira-attachments-resized` |
| SNS assignments | `mini-jira-assignments` |
| SNS digest | `mini-jira-digest` |
| SQS | `mini-jira-assignments-queue` |
| DynamoDB tables | Tasks, Projects, Teams, Comments, ActivityLog |

---

## After the diagram

Teammate adds **README.md** at repo root with:

- Live CloudFront URL
- Link to `docs/architecture-diagram.png`
- Demo video link

You can draft README text once you have the CloudFront URL.
