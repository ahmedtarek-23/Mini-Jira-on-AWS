#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MiniJiraStack } from '../lib/mini-jira-stack.js';

const app = new cdk.App();
new MiniJiraStack(app, 'MiniJiraStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});
