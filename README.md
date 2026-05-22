# Mini-Jira on AWS

**Live URL:** https://d1f71pped3yvzi.cloudfront.net/

**Demo Video:** [Add link when recorded]

**Architecture Diagram:** [docs/architecture-diagram.png](docs/architecture-diagram.png) · [Editable source](docs/mini-jira-architecture.drawio)

---

## Overview

Mini-Jira is a lightweight team task-management web application (Jira/Trello-style) deployed on AWS with high availability across two Availability Zones. Managers assign tasks across teams; employees only see tasks for their own team (enforced server-side via DynamoDB GSIs).

**Region:** `us-east-1`

---

## Demo accounts

| User | Role | Team |
|------|------|------|
| Ali | Manager | — (sees all teams) |
| Sara | Employee | Frontend |
| Omar | Employee | Backend |

**Demo scenario:** Ali creates Task A (Sara / Frontend) and Task B (Omar / Backend). Sara sees only Task A; Omar sees only Task B; Ali sees both and can filter by team.

---

## Architecture

Traffic flows: **Users → CloudFront → ALB → EC2 (Auto Scaling, 2 AZs) → DynamoDB / Cognito / S3 / SNS**.

Event-driven components:

- **S3** upload → **imageResize** Lambda → resized S3 bucket
- Task assignment → **SNS** → email + **SQS** → **assignmentWorker** Lambda → ActivityLog + CloudWatch metrics
- **EventBridge** (9:00 UTC daily) → **dailyDigest** Lambda → digest email via SNS

See the full diagram: [docs/architecture-diagram.png](docs/architecture-diagram.png)

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js, Tailwind, Kanban drag-and-drop |
| Backend | Node.js, Express |
| Auth | AWS Cognito (JWT validation on every request) |
| Database | DynamoDB (Tasks, Projects, Teams, Comments, ActivityLog) |
| Storage | S3 (`mini-jira-attachments`, `mini-jira-attachments-resized`) |
| Compute | EC2 Auto Scaling Group behind ALB |
| CDN | CloudFront |
| Async | SNS, SQS, Lambda, EventBridge |
| Monitoring | CloudWatch dashboards, custom metrics, alarms |

---

## Local development

```bash
# Backend
npm install
cp .env.example .env   # configure Cognito, DynamoDB, S3, etc.
node scripts/createTables.js
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
cp .env.example .env.local
# NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
npm run dev
```

---

## AWS services used

EC2 (ASG), Application Load Balancer, CloudFront, VPC (2 AZs, public/private subnets, NAT Gateway), DynamoDB, S3, Cognito, SNS, SQS, Lambda (imageResize, assignmentWorker, dailyDigest), EventBridge, CloudWatch, IAM.

---

## Repository structure

```
├── src/              # Express API
├── frontend/         # Next.js app
├── lambdas/          # imageResize, assignmentWorker, dailyDigest
├── scripts/          # DynamoDB table creation
└── docs/             # Architecture diagram
```

---

## Team

GIU Software Cloud Computing 2026 — Mini-Jira on AWS
