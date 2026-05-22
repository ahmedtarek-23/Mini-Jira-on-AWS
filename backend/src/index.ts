import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { requireAuth } from './auth.js';
import teamsRouter from './routes/teams.js';
import usersRouter from './routes/users.js';
import projectsRouter from './routes/projects.js';
import tasksRouter from './routes/tasks.js';
import commentsRouter from './routes/comments.js';
import uploadsRouter from './routes/uploads.js';

dotenv.config();

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/me', requireAuth, (req, res) => {
  res.json({
    userId: req.user!.userId,
    email: req.user!.email,
    role: req.user!.role,
    teamId: req.user!.teamId,
  });
});

app.use('/api', requireAuth);
app.use('/api/teams', teamsRouter);
app.use('/api/users', usersRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/uploads', uploadsRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', detail: err?.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
