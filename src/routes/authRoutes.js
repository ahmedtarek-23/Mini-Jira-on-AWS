'use strict';

const { Router } = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

const router = Router();

// Public
router.post('/signup', authController.signup);
router.post('/signin', authController.signin);

// Protected — returns the caller's profile from Cognito
router.get('/me', authMiddleware, authController.me);

module.exports = router;
