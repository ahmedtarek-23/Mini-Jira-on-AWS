'use strict';

const { Router } = require('express');
const { bootstrap } = require('../controllers/bootstrapController');

const router = Router();

router.get('/', bootstrap);

module.exports = router;
