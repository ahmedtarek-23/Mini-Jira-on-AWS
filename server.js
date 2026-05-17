'use strict';

require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Mini-Jira API running on port ${PORT}`);
  console.log(`DynamoDB endpoint: ${process.env.DYNAMODB_ENDPOINT || 'AWS (real)'}`);
});
