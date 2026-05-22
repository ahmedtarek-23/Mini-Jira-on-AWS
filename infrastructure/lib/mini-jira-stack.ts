import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elasticloadbalancingv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as events from "aws-cdk-lib/aws-events";
import * as eventsTargets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as path from "path";
import { fileURLToPath } from "url";
import { Construct } from "constructs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class MiniJiraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;
    const project = "minijira";
    const prefix = `${project}-`;
    const backendDistPath = path.join(__dirname, "../../../backend");
    const frontendDistPath = path.join(__dirname, "../../../frontend/dist");

    // Synthesize-time suffix – bucket names are predictable, so we construct
    // ARNs as literal strings to avoid CloudFormation DependsOn edges.
    const suffix = cdk.Names.uniqueId(this).toLowerCase().slice(-8);

    // ─── VPC ──────────────────────────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, "VPC", {
      vpcName: `${project}-vpc`,
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
      ],
    });

    // ─── Security Groups ──────────────────────────────────────────────────────
    const albSg = new ec2.SecurityGroup(this, "AlbSg", {
      vpc,
      securityGroupName: `${project}-alb-sg`,
      description: "ALB security group",
      allowAllOutbound: true,
    });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "Allow HTTP");

    const ec2Sg = new ec2.SecurityGroup(this, "Ec2Sg", {
      vpc,
      securityGroupName: `${project}-ec2-sg`,
      description: "EC2 security group",
      allowAllOutbound: true,
    });
    ec2Sg.addIngressRule(albSg, ec2.Port.tcp(3000), "Allow from ALB");

    // ─── Cognito ──────────────────────────────────────────────────────────────
    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${project}-users`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      customAttributes: {
        role: new cognito.StringAttribute({ mutable: true }),
        teamId: new cognito.StringAttribute({ mutable: true }),
      },
      standardAttributes: {
        email: { required: true, mutable: true },
        givenName: { required: true, mutable: true },
        familyName: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool,
      generateSecret: false,
      authFlows: { userPassword: true, userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true, implicitCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: ["https://d1f71pped3yvzi.cloudfront.net/callback"],
        logoutUrls: ["https://d1f71pped3yvzi.cloudfront.net/"],
      },
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true, emailVerified: true, fullname: true })
        .withCustomAttributes("role", "teamId"),
    });

    const userPoolDomain = new cognito.UserPoolDomain(this, "UserPoolDomain", {
      userPool,
      cognitoDomain: { domainPrefix: `${project}-auth` },
    });

    // ─── DynamoDB ─────────────────────────────────────────────────────────────
    new dynamodb.Table(this, "TeamsTable", {
      tableName: "Teams",
      partitionKey: { name: "teamId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    new dynamodb.Table(this, "ProjectsTable", {
      tableName: "Projects",
      partitionKey: { name: "projectId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const tasksTable = new dynamodb.Table(this, "TasksTable", {
      tableName: "Tasks",
      partitionKey: { name: "taskId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    tasksTable.addGlobalSecondaryIndex({
      indexName: "TeamIdIndex",
      partitionKey: { name: "teamId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });
    tasksTable.addGlobalSecondaryIndex({
      indexName: "StatusIndex",
      partitionKey: { name: "status", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });
    tasksTable.addGlobalSecondaryIndex({
      indexName: "AssigneeIndex",
      partitionKey: { name: "assignee", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });
    tasksTable.addGlobalSecondaryIndex({
      indexName: "AssigneeIdIndex",
      partitionKey: { name: "assigneeId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });

    const commentsTable = new dynamodb.Table(this, "CommentsTable", {
      tableName: "Comments",
      partitionKey: { name: "commentId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    commentsTable.addGlobalSecondaryIndex({
      indexName: "TaskIdIndex",
      partitionKey: { name: "taskId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });

    new dynamodb.Table(this, "ActivityLogTable", {
      tableName: "ActivityLog",
      partitionKey: { name: "logId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    new dynamodb.Table(this, "UsersTable", {
      tableName: "Users",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // ─── S3 Buckets (literal names to avoid token deps in IAM) ────────────────
    const frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      bucketName: `${prefix}frontend-${suffix}`,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "index.html",
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Use CfnBucket for originals so we can inline NotificationConfiguration
    // (avoids CDK's custom-resource notification handler, breaking the cycle).
    const originalsBucketName = `${prefix}originals-${suffix}`;
    const resizedBucketName = `${prefix}resized-${suffix}`;
    const deployBucketName = `${prefix}deploy-${suffix}`;

    const originalsBucket = new s3.CfnBucket(this, "OriginalsBucket", {
      bucketName: originalsBucketName,
      versioningConfiguration: { status: "Enabled" },
      publicAccessBlockConfiguration: {
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      },
      corsConfiguration: {
        corsRules: [{
          allowedMethods: ["PUT", "POST", "GET"],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          maxAge: 3000,
        }],
      },
    });

    const resizedBucket = new s3.Bucket(this, "ResizedBucket", {
      bucketName: resizedBucketName,
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const deployBucket = new s3.Bucket(this, "DeployBucket", {
      bucketName: deployBucketName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ─── IAM Roles ────────────────────────────────────────────────────────────
    // All ARNs below are constructed as literal strings so IAM policy documents
    // do NOT create CloudFormation DependsOn edges to the referenced resources.

    const lambdaRole = new iam.Role(this, "LambdaRole", {
      roleName: `${project}-lambda-role`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
      ],
    });

    const tableArns = ["Teams", "Projects", "Tasks", "Comments", "ActivityLog", "Users"]
      .map((t) => `arn:aws:dynamodb:${region}:${account}:table/${t}`);

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "dynamodb:BatchGetItem", "dynamodb:BatchWriteItem", "dynamodb:DeleteItem",
          "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:Scan",
          "dynamodb:UpdateItem",
        ],
        resources: [...tableArns, `${tableArns[2]}/*`],
      }),
    );

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
      }),
    );

    // Wildcard pattern – user pool ID is assigned by CloudFormation and can't
    // be predicted at synth time. Using a literal ARN avoids a DependsOn edge.
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cognito-idp:AdminGetUser", "cognito-idp:ListUsers"],
        resources: [`arn:aws:cognito-idp:${region}:${account}:userpool/*`],
      }),
    );

    // Separate role for the image-resize Lambda so lambdaRole doesn't need S3
    const imageResizeRole = new iam.Role(this, "ImageResizeRole", {
      roleName: `${project}-image-resize-role`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
      ],
    });

    imageResizeRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
        resources: [
          `arn:aws:s3:::${prefix}*`,
          `arn:aws:s3:::${prefix}*/*`,
        ],
      }),
    );

    // ─── SNS + SQS (literal ARNs, predictable names) ──────────────────────────
    const assignmentsTopic = new sns.Topic(this, "AssignmentsTopic", {
      topicName: `${project}-assignments`,
    });

    const assignmentsQueue = new sqs.Queue(this, "AssignmentsQueue", {
      queueName: `${project}-assignments`,
    });

    assignmentsTopic.addSubscription(new snsSubscriptions.SqsSubscription(assignmentsQueue));
    assignmentsTopic.addSubscription(new snsSubscriptions.EmailSubscription("amr.hediwy@gmail.com"));

    const assignmentsTopicArn = `arn:aws:sns:${region}:${account}:${project}-assignments`;
    const assignmentsQueueArn = `arn:aws:sqs:${region}:${account}:${project}-assignments`;

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sns:Publish", "sns:Subscribe"],
        resources: [assignmentsTopicArn],
      }),
    );
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
        resources: [assignmentsQueueArn],
      }),
    );

    // ─── Lambda Functions ─────────────────────────────────────────────────────
    const postConfirmationLambda = new lambda.Function(this, "PostConfirmationLambda", {
      functionName: `${project}-post-confirmation`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(backendDistPath, "dist/lambdas/post-confirmation.zip")),
      role: lambdaRole,
      timeout: cdk.Duration.seconds(10),
      environment: { TABLE_USERS: "Users", SNS_TOPIC_ARN: assignmentsTopicArn },
    });

    userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, postConfirmationLambda);

    const imageResizeLambda = new lambda.Function(this, "ImageResizeLambda", {
      functionName: `${project}-image-resize`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(backendDistPath, "dist/lambdas/image-resize.zip")),
      role: imageResizeRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
      environment: {
        ORIGINALS_BUCKET: originalsBucketName,
        RESIZED_BUCKET: resizedBucketName,
      },
    });

    // S3 invoke permission (required even with CfnBucket notification)
    new lambda.CfnPermission(this, "ImageResizeS3Permission", {
      action: "lambda:InvokeFunction",
      functionName: imageResizeLambda.functionArn,
      principal: "s3.amazonaws.com",
      sourceArn: `arn:aws:s3:::${originalsBucketName}`,
    });

    // Inline NotificationConfiguration on the CfnBucket – no custom resource
    originalsBucket.notificationConfiguration = {
      lambdaConfigurations: [{
        function: imageResizeLambda.functionArn,
        event: "s3:ObjectCreated:*",
      }],
    };

    const assignmentWorkerLambda = new lambda.Function(this, "AssignmentWorkerLambda", {
      functionName: `${project}-assignment-worker`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(backendDistPath, "dist/lambdas/assignment-worker.zip")),
      role: lambdaRole,
      timeout: cdk.Duration.seconds(10),
      environment: { TABLE_ACTIVITY_LOG: "ActivityLog" },
    });

    const dailyDigestLambda = new lambda.Function(this, "DailyDigestLambda", {
      functionName: `${project}-daily-digest`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(backendDistPath, "dist/lambdas/daily-digest.zip")),
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      environment: { TABLE_TASKS: "Tasks", SNS_TOPIC_ARN: assignmentsTopicArn },
    });

    assignmentWorkerLambda.addEventSource(new lambdaEventSources.SqsEventSource(assignmentsQueue));

    // ─── EventBridge ──────────────────────────────────────────────────────────
    const dailyDigestRule = new events.Rule(this, "DailyDigestRule", {
      ruleName: `${project}-daily-digest-rule`,
      schedule: events.Schedule.cron({ hour: "9", minute: "0" }),
    });
    dailyDigestRule.addTarget(new eventsTargets.LambdaFunction(dailyDigestLambda));

    // ─── EC2 + ALB ────────────────────────────────────────────────────────────
    const ec2Role = new iam.Role(this, "Ec2Role", {
      roleName: `${project}-ec2-role`,
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
      ],
    });

    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:ListBucket", "s3:GetObject"],
        resources: [`arn:aws:s3:::${deployBucketName}`, `arn:aws:s3:::${deployBucketName}/*`],
      }),
    );

    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "dynamodb:BatchGetItem", "dynamodb:BatchWriteItem", "dynamodb:DeleteItem",
          "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:Scan",
          "dynamodb:UpdateItem",
        ],
        resources: [...tableArns, `${tableArns[2]}/*`],
      }),
    );

    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sns:Publish", "sns:Subscribe"],
        resources: [assignmentsTopicArn],
      }),
    );

    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
      }),
    );

    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cognito-idp:AdminGetUser", "cognito-idp:AdminUpdateUserAttributes"],
        resources: [`arn:aws:cognito-idp:${region}:${account}:userpool/*`],
      }),
    );

    const ec2InstanceProfile = new iam.CfnInstanceProfile(this, "Ec2Profile", {
      instanceProfileName: `${project}-ec2-profile`,
      roles: [ec2Role.roleName],
    });

    // User data uses literal resource names – no CloudFormation tokens,
    // so the LaunchTemplate doesn't create DependsOn edges to other resources.
    const userDataScript = [
      "#!/bin/bash",
      "set -e",
      "exec > >(tee /var/log/user-data.log) 2>&1",
      "dnf install -y nodejs aws-cli",
      "mkdir -p /opt/app && cd /opt/app",
      `aws s3 sync s3://${deployBucketName}/ .`,
      "npm install --production",
      "export PORT=3000",
      `export AWS_REGION=${region}`,
      `export COGNITO_USER_POOL_ID=${userPool.userPoolId}`,
      `export COGNITO_CLIENT_ID=${userPoolClient.userPoolClientId}`,
      "export TABLE_TEAMS=Teams",
      "export TABLE_PROJECTS=Projects",
      "export TABLE_TASKS=Tasks",
      "export TABLE_COMMENTS=Comments",
      "export TABLE_ACTIVITY_LOG=ActivityLog",
      "export TABLE_USERS=Users",
      `export S3_BUCKET_ORIGINALS=${originalsBucketName}`,
      `export S3_BUCKET_RESIZED=${resizedBucketName}`,
      `export SNS_TOPIC_ARN=${assignmentsTopicArn}`,
      "node dist/index.js &",
    ].join("\n");

    const launchTemplate = new ec2.CfnLaunchTemplate(this, "LaunchTemplate", {
      launchTemplateName: `${project}-template`,
      launchTemplateData: {
        imageId: new ec2.AmazonLinuxImage({
          generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
        }).getImage(this).imageId,
        instanceType: "t3.micro",
        iamInstanceProfile: { arn: ec2InstanceProfile.attrArn },
        securityGroupIds: [ec2Sg.securityGroupId],
        userData: cdk.Fn.base64(userDataScript),
      },
    });

    const alb = new elasticloadbalancingv2.ApplicationLoadBalancer(this, "ALB", {
      loadBalancerName: `${project}-alb`,
      vpc,
      internetFacing: true,
      securityGroup: albSg,
    });

    const targetGroup = new elasticloadbalancingv2.ApplicationTargetGroup(this, "TargetGroup", {
      targetGroupName: `${project}-tg`,
      vpc,
      port: 3000,
      protocol: elasticloadbalancingv2.ApplicationProtocol.HTTP,
      healthCheck: {
        path: "/health",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
        timeout: cdk.Duration.seconds(5),
        interval: cdk.Duration.seconds(30),
      },
    });

    alb.addListener("HttpListener", {
      port: 80,
      protocol: elasticloadbalancingv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup],
    });

    const cfnAsg = new autoscaling.CfnAutoScalingGroup(this, "ASG", {
      autoScalingGroupName: `${project}-asg`,
      vpcZoneIdentifier: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds,
      targetGroupArns: [targetGroup.targetGroupArn],
      healthCheckType: "ELB",
      minSize: "2",
      maxSize: "4",
      desiredCapacity: "2",
      launchTemplate: {
        launchTemplateId: launchTemplate.ref,
        version: launchTemplate.attrLatestVersionNumber,
      },
      tags: [
        { key: "Name", value: `${project}-asg`, propagateAtLaunch: true },
        { key: "Project", value: project, propagateAtLaunch: true },
      ],
    });

    // ─── CloudFront ───────────────────────────────────────────────────────────
    const oai = new cloudfront.OriginAccessIdentity(this, "OAI", {
      comment: `${project}-frontend-oai`,
    });

    const cloudfrontDist = new cloudfront.CloudFrontWebDistribution(this, "CloudFront", {
      comment: `${project}-frontend`,
      originConfigs: [
        {
          s3OriginSource: { s3BucketSource: frontendBucket, originAccessIdentity: oai },
          behaviors: [{ isDefaultBehavior: true }],
        },
        {
          customOriginSource: {
            domainName: alb.loadBalancerDnsName,
            originProtocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          },
          behaviors: [{
            pathPattern: "/api/*",
            allowedMethods: cloudfront.CloudFrontAllowedMethods.ALL,
            cachedMethods: cloudfront.CloudFrontAllowedCachedMethods.GET_HEAD_OPTIONS,
            compress: false,
            minTtl: cdk.Duration.seconds(0),
            defaultTtl: cdk.Duration.seconds(0),
            maxTtl: cdk.Duration.seconds(0),
            forwardedValues: {
              queryString: true,
              headers: ["Authorization", "Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"],
              cookies: { forward: "all" },
            },
          }],
        },
      ],
      errorConfigurations: [
        { errorCode: 403, responseCode: 200, responsePagePath: "/index.html" },
        { errorCode: 404, responseCode: 200, responsePagePath: "/index.html" },
      ],
    });

    // ─── Deployments ──────────────────────────────────────────────────────────
    new s3deploy.BucketDeployment(this, "DeployFrontend", {
      sources: [s3deploy.Source.asset(frontendDistPath)],
      destinationBucket: frontendBucket,
      distribution: cloudfrontDist,
      distributionPaths: ["/*"],
    });

    new s3deploy.BucketDeployment(this, "DeployBackend", {
      sources: [s3deploy.Source.asset(path.join(backendDistPath, "deploy.zip"))],
      destinationBucket: deployBucket,
    });

    // ─── CloudWatch Dashboard ─────────────────────────────────────────────────
    new cloudwatch.Dashboard(this, "Dashboard", {
      dashboardName: `${project}-dashboard`,
      widgets: [
        [
          new cloudwatch.GraphWidget({
            title: "Tasks Created Per Day",
            left: [new cloudwatch.Metric({
              namespace: "MiniJira", metricName: "TasksCreated",
              statistic: "Sum", period: cdk.Duration.days(1),
            })],
          }),
          new cloudwatch.GraphWidget({
            title: "Tasks Closed Per Team Per Day",
            left: [new cloudwatch.MathExpression({
              expression: 'SEARCH(\'{MiniJira, Team} MetricName="TasksClosed"\', \'Sum\', 86400)',
              label: "",
            })],
            stacked: true,
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: "Average Time to Close",
            left: [new cloudwatch.Metric({
              namespace: "MiniJira", metricName: "TimeToClose",
              statistic: "Average", period: cdk.Duration.days(1),
            })],
          }),
          new cloudwatch.GraphWidget({
            title: "EC2 CPU Utilization",
            left: [new cloudwatch.Metric({
              namespace: "AWS/EC2", metricName: "CPUUtilization",
              statistic: "Average", period: cdk.Duration.minutes(5),
            })],
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: "Overdue Tasks",
            left: [new cloudwatch.Metric({
              namespace: "MiniJira", metricName: "OverdueTasks",
              statistic: "Maximum", period: cdk.Duration.hours(1),
            })],
          }),
        ],
      ],
    });

    // ─── Alarms ───────────────────────────────────────────────────────────────
    const highCpuAlarm = new cloudwatch.Alarm(this, "HighCpuAlarm", {
      alarmName: `${project}-high-cpu`,
      metric: new cloudwatch.Metric({
        namespace: "AWS/EC2", metricName: "CPUUtilization",
        statistic: "Average", period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    highCpuAlarm.addAlarmAction(new cloudwatchActions.SnsAction(assignmentsTopic));

    const overdueAlarm = new cloudwatch.Alarm(this, "OverdueTasksAlarm", {
      alarmName: `${project}-overdue-tasks`,
      metric: new cloudwatch.Metric({
        namespace: "MiniJira", metricName: "OverdueTasks",
        statistic: "Maximum", period: cdk.Duration.hours(1),
      }),
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    overdueAlarm.addAlarmAction(new cloudwatchActions.SnsAction(assignmentsTopic));

    // ─── Outputs ──────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "FrontendUrl", {
      description: "CloudFront URL for the frontend",
      value: `https://${cloudfrontDist.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, "ApiUrl", {
      description: "ALB DNS name for API calls",
      value: `http://${alb.loadBalancerDnsName}`,
    });
    new cdk.CfnOutput(this, "CognitoDomain", {
      description: "Cognito Hosted UI domain",
      value: `https://${userPoolDomain.domainName}.auth.${region}.amazoncognito.com`,
    });
    new cdk.CfnOutput(this, "UserPoolId", {
      description: "Cognito User Pool ID",
      value: userPool.userPoolId,
    });
    new cdk.CfnOutput(this, "ClientId", {
      description: "Cognito App Client ID",
      value: userPoolClient.userPoolClientId,
    });
  }
}
