'use strict';

require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const logger = require('./src/config/logger');
const authMiddleware = require('./src/middleware/auth');

const authRoutes = require('./src/routes/authRoutes');
const taskRoutes = require('./src/routes/taskRoutes');
const projectRoutes = require('./src/routes/projectRoutes');
const commentRoutes = require('./src/routes/commentRoutes');
const bootstrapRoutes = require('./src/routes/bootstrapRoutes');

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);

app.use(express.json());

// ── Request logging ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.info({ method: req.method, path: req.path, userId: req.user?.userId });
  next();
});

// ── Public routes (no token required) ────────────────────────────────────────
app.use('/auth', authRoutes);

// ── Protected routes ──────────────────────────────────────────────────────────
app.use('/bootstrap', authMiddleware, bootstrapRoutes);
app.use('/tasks', authMiddleware, taskRoutes);
app.use('/tasks/:taskId/comments', authMiddleware, commentRoutes);
app.use('/projects', authMiddleware, projectRoutes);

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.statusCode || 500;
  if (status === 500) logger.error({ err: err.message, stack: err.stack });
  res.status(status).json({ message: status === 500 ? 'Internal server error' : err.message });
});

module.exports = app;
