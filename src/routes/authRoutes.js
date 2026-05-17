'use strict';

const { Router } = require('express');
const authController = require('../controllers/authController');

const router = Router();

// Public — no authMiddleware
router.post('/signup', authController.signup);
router.post('/signin', authController.signin);

module.exports = router;
