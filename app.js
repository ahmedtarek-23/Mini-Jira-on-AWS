'use strict';

require('dotenv').config();
require('express-async-errors');

const express = require('express');
const authMiddleware = require('./src/middleware/auth');

const authRoutes = require('./src/routes/authRoutes');
const taskRoutes = require('./src/routes/taskRoutes');
const projectRoutes = require('./src/routes/projectRoutes');
const commentRoutes = require('./src/routes/commentRoutes');

const app = express();

app.use(express.json());

// Public routes — no token required
app.use('/auth', authRoutes);

// Protected routes — every request must carry a valid Cognito ID token
app.use('/tasks', authMiddleware, taskRoutes);
app.use('/tasks/:taskId/comments', authMiddleware, commentRoutes); // nested comments
app.use('/projects', authMiddleware, projectRoutes);

// Global error handler — maps service-thrown errors to HTTP responses
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.statusCode || 500;
  const message = status === 500 ? 'Internal server error' : err.message;

  if (status === 500) {
    console.error(err);
  }

  res.status(status).json({ message });
});

module.exports = app;
