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
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export class MiniJiraStack extends cdk.Stack {
    constructor(scope, id, props) {
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
        lambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                "dynamodb:BatchGetItem", "dynamodb:BatchWriteItem", "dynamodb:DeleteItem",
                "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:Scan",
                "dynamodb:UpdateItem",
            ],
            resources: [...tableArns, `${tableArns[2]}/*`],
        }));
        lambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: ["cloudwatch:PutMetricData"],
            resources: ["*"],
        }));
        // Wildcard pattern – user pool ID is assigned by CloudFormation and can't
        // be predicted at synth time. Using a literal ARN avoids a DependsOn edge.
        lambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: ["cognito-idp:AdminGetUser", "cognito-idp:ListUsers"],
            resources: [`arn:aws:cognito-idp:${region}:${account}:userpool/*`],
        }));
        // Separate role for the image-resize Lambda so lambdaRole doesn't need S3
        const imageResizeRole = new iam.Role(this, "ImageResizeRole", {
            roleName: `${project}-image-resize-role`,
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
            ],
        });
        imageResizeRole.addToPolicy(new iam.PolicyStatement({
            actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
            resources: [
                `arn:aws:s3:::${prefix}*`,
                `arn:aws:s3:::${prefix}*/*`,
            ],
        }));
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
        lambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: ["sns:Publish", "sns:Subscribe"],
            resources: [assignmentsTopicArn],
        }));
        lambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
            resources: [assignmentsQueueArn],
        }));
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
        ec2Role.addToPolicy(new iam.PolicyStatement({
            actions: ["s3:ListBucket", "s3:GetObject"],
            resources: [`arn:aws:s3:::${deployBucketName}`, `arn:aws:s3:::${deployBucketName}/*`],
        }));
        ec2Role.addToPolicy(new iam.PolicyStatement({
            actions: [
                "dynamodb:BatchGetItem", "dynamodb:BatchWriteItem", "dynamodb:DeleteItem",
                "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:Scan",
                "dynamodb:UpdateItem",
            ],
            resources: [...tableArns, `${tableArns[2]}/*`],
        }));
        ec2Role.addToPolicy(new iam.PolicyStatement({
            actions: ["sns:Publish", "sns:Subscribe"],
            resources: [assignmentsTopicArn],
        }));
        ec2Role.addToPolicy(new iam.PolicyStatement({
            actions: ["cloudwatch:PutMetricData"],
            resources: ["*"],
        }));
        ec2Role.addToPolicy(new iam.PolicyStatement({
            actions: ["cognito-idp:AdminGetUser", "cognito-idp:AdminUpdateUserAttributes"],
            resources: [`arn:aws:cognito-idp:${region}:${account}:userpool/*`],
        }));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWluaS1qaXJhLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL21pbmktamlyYS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEtBQUssR0FBRyxNQUFNLGFBQWEsQ0FBQztBQUNuQyxPQUFPLEtBQUssVUFBVSxNQUFNLDRCQUE0QixDQUFDO0FBQ3pELE9BQU8sS0FBSyxPQUFPLE1BQU0seUJBQXlCLENBQUM7QUFDbkQsT0FBTyxLQUFLLFFBQVEsTUFBTSwwQkFBMEIsQ0FBQztBQUNyRCxPQUFPLEtBQUssR0FBRyxNQUFNLHFCQUFxQixDQUFDO0FBQzNDLE9BQU8sS0FBSyxzQkFBc0IsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRixPQUFPLEtBQUssTUFBTSxNQUFNLHdCQUF3QixDQUFDO0FBQ2pELE9BQU8sS0FBSyxhQUFhLE1BQU0sZ0NBQWdDLENBQUM7QUFDaEUsT0FBTyxLQUFLLEdBQUcsTUFBTSxxQkFBcUIsQ0FBQztBQUMzQyxPQUFPLEtBQUssTUFBTSxNQUFNLHdCQUF3QixDQUFDO0FBQ2pELE9BQU8sS0FBSyxrQkFBa0IsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRSxPQUFPLEtBQUssRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pDLE9BQU8sS0FBSyxRQUFRLE1BQU0sK0JBQStCLENBQUM7QUFDMUQsT0FBTyxLQUFLLEdBQUcsTUFBTSxxQkFBcUIsQ0FBQztBQUMzQyxPQUFPLEtBQUssZ0JBQWdCLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxLQUFLLEdBQUcsTUFBTSxxQkFBcUIsQ0FBQztBQUMzQyxPQUFPLEtBQUssVUFBVSxNQUFNLDRCQUE0QixDQUFDO0FBQ3pELE9BQU8sS0FBSyxpQkFBaUIsTUFBTSxvQ0FBb0MsQ0FBQztBQUN4RSxPQUFPLEtBQUssV0FBVyxNQUFNLDZCQUE2QixDQUFDO0FBQzNELE9BQU8sS0FBSyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQzdCLE9BQU8sRUFB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LFNBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ3ZDLFdBQVcsRUFBRSwwQkFBMEI7WUFDdkMsS0FBSyxFQUFFLFdBQVcsY0FBYyxDQUFDLFVBQVUsU0FBUyxNQUFNLG9CQUFvQjtTQUMvRSxDQUFDLENBQUM7UUFDSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxXQUFXLEVBQUUsc0JBQXNCO1lBQ25DLEtBQUssRUFBRSxRQUFRLENBQUMsVUFBVTtTQUMzQixDQUFDLENBQUM7UUFDSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRTtZQUNsQyxXQUFXLEVBQUUsdUJBQXVCO1lBQ3BDLEtBQUssRUFBRSxjQUFjLENBQUMsZ0JBQWdCO1NBQ3ZDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSBcImF3cy1jZGstbGliL2F3cy1jbG91ZGZyb250XCI7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtY29nbml0b1wiO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSBcImF3cy1jZGstbGliL2F3cy1keW5hbW9kYlwiO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZWMyXCI7XG5pbXBvcnQgKiBhcyBlbGFzdGljbG9hZGJhbGFuY2luZ3YyIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZWxhc3RpY2xvYWRiYWxhbmNpbmd2MlwiO1xuaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZXZlbnRzXCI7XG5pbXBvcnQgKiBhcyBldmVudHNUYXJnZXRzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZXZlbnRzLXRhcmdldHNcIjtcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWlhbVwiO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhXCI7XG5pbXBvcnQgKiBhcyBsYW1iZGFFdmVudFNvdXJjZXMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGEtZXZlbnQtc291cmNlc1wiO1xuaW1wb3J0ICogYXMgczMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zM1wiO1xuaW1wb3J0ICogYXMgczNkZXBsb3kgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zMy1kZXBsb3ltZW50XCI7XG5pbXBvcnQgKiBhcyBzbnMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zbnNcIjtcbmltcG9ydCAqIGFzIHNuc1N1YnNjcmlwdGlvbnMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zbnMtc3Vic2NyaXB0aW9uc1wiO1xuaW1wb3J0ICogYXMgc3FzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtc3FzXCI7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaFwiO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaEFjdGlvbnMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoLWFjdGlvbnNcIjtcbmltcG9ydCAqIGFzIGF1dG9zY2FsaW5nIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtYXV0b3NjYWxpbmdcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IGZpbGVVUkxUb1BhdGggfSBmcm9tIFwidXJsXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuXG5jb25zdCBfX2Rpcm5hbWUgPSBwYXRoLmRpcm5hbWUoZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpKTtcblxuZXhwb3J0IGNsYXNzIE1pbmlKaXJhU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCByZWdpb24gPSBjZGsuU3RhY2sub2YodGhpcykucmVnaW9uO1xuICAgIGNvbnN0IGFjY291bnQgPSBjZGsuU3RhY2sub2YodGhpcykuYWNjb3VudDtcbiAgICBjb25zdCBwcm9qZWN0ID0gXCJtaW5pamlyYVwiO1xuICAgIGNvbnN0IHByZWZpeCA9IGAke3Byb2plY3R9LWA7XG4gICAgY29uc3QgYmFja2VuZERpc3RQYXRoID0gcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi8uLi8uLi9iYWNrZW5kXCIpO1xuICAgIGNvbnN0IGZyb250ZW5kRGlzdFBhdGggPSBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uLy4uLy4uL2Zyb250ZW5kL2Rpc3RcIik7XG5cbiAgICAvLyBTeW50aGVzaXplLXRpbWUgc3VmZml4IOKAkyBidWNrZXQgbmFtZXMgYXJlIHByZWRpY3RhYmxlLCBzbyB3ZSBjb25zdHJ1Y3RcbiAgICAvLyBBUk5zIGFzIGxpdGVyYWwgc3RyaW5ncyB0byBhdm9pZCBDbG91ZEZvcm1hdGlvbiBEZXBlbmRzT24gZWRnZXMuXG4gICAgY29uc3Qgc3VmZml4ID0gY2RrLk5hbWVzLnVuaXF1ZUlkKHRoaXMpLnRvTG93ZXJDYXNlKCkuc2xpY2UoLTgpO1xuXG4gICAgLy8g4pSA4pSA4pSAIFZQQyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICBjb25zdCB2cGMgPSBuZXcgZWMyLlZwYyh0aGlzLCBcIlZQQ1wiLCB7XG4gICAgICB2cGNOYW1lOiBgJHtwcm9qZWN0fS12cGNgLFxuICAgICAgaXBBZGRyZXNzZXM6IGVjMi5JcEFkZHJlc3Nlcy5jaWRyKFwiMTAuMC4wLjAvMTZcIiksXG4gICAgICBtYXhBenM6IDIsXG4gICAgICBuYXRHYXRld2F5czogMSxcbiAgICAgIHN1Ym5ldENvbmZpZ3VyYXRpb246IFtcbiAgICAgICAgeyBuYW1lOiBcInB1YmxpY1wiLCBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QVUJMSUMsIGNpZHJNYXNrOiAyNCB9LFxuICAgICAgICB7IG5hbWU6IFwicHJpdmF0ZVwiLCBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLCBjaWRyTWFzazogMjQgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyDilIDilIDilIAgU2VjdXJpdHkgR3JvdXBzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgIGNvbnN0IGFsYlNnID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsIFwiQWxiU2dcIiwge1xuICAgICAgdnBjLFxuICAgICAgc2VjdXJpdHlHcm91cE5hbWU6IGAke3Byb2plY3R9LWFsYi1zZ2AsXG4gICAgICBkZXNjcmlwdGlvbjogXCJBTEIgc2VjdXJpdHkgZ3JvdXBcIixcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWUsXG4gICAgfSk7XG4gICAgYWxiU2cuYWRkSW5ncmVzc1J1bGUoZWMyLlBlZXIuYW55SXB2NCgpLCBlYzIuUG9ydC50Y3AoODApLCBcIkFsbG93IEhUVFBcIik7XG5cbiAgICBjb25zdCBlYzJTZyA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCBcIkVjMlNnXCIsIHtcbiAgICAgIHZwYyxcbiAgICAgIHNlY3VyaXR5R3JvdXBOYW1lOiBgJHtwcm9qZWN0fS1lYzItc2dgLFxuICAgICAgZGVzY3JpcHRpb246IFwiRUMyIHNlY3VyaXR5IGdyb3VwXCIsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgIH0pO1xuICAgIGVjMlNnLmFkZEluZ3Jlc3NSdWxlKGFsYlNnLCBlYzIuUG9ydC50Y3AoMzAwMCksIFwiQWxsb3cgZnJvbSBBTEJcIik7XG5cbiAgICAvLyDilIDilIDilIAgQ29nbml0byDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICBjb25zdCB1c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsIFwiVXNlclBvb2xcIiwge1xuICAgICAgdXNlclBvb2xOYW1lOiBgJHtwcm9qZWN0fS11c2Vyc2AsXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHsgZW1haWw6IHRydWUgfSxcbiAgICAgIGN1c3RvbUF0dHJpYnV0ZXM6IHtcbiAgICAgICAgcm9sZTogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcbiAgICAgICAgdGVhbUlkOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoeyBtdXRhYmxlOiB0cnVlIH0pLFxuICAgICAgfSxcbiAgICAgIHN0YW5kYXJkQXR0cmlidXRlczoge1xuICAgICAgICBlbWFpbDogeyByZXF1aXJlZDogdHJ1ZSwgbXV0YWJsZTogdHJ1ZSB9LFxuICAgICAgICBnaXZlbk5hbWU6IHsgcmVxdWlyZWQ6IHRydWUsIG11dGFibGU6IHRydWUgfSxcbiAgICAgICAgZmFtaWx5TmFtZTogeyByZXF1aXJlZDogdHJ1ZSwgbXV0YWJsZTogdHJ1ZSB9LFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkUG9saWN5OiB7XG4gICAgICAgIG1pbkxlbmd0aDogOCxcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVVwcGVyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIGFjY291bnRSZWNvdmVyeTogY29nbml0by5BY2NvdW50UmVjb3ZlcnkuRU1BSUxfT05MWSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHVzZXJQb29sQ2xpZW50ID0gbmV3IGNvZ25pdG8uVXNlclBvb2xDbGllbnQodGhpcywgXCJVc2VyUG9vbENsaWVudFwiLCB7XG4gICAgICB1c2VyUG9vbCxcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSxcbiAgICAgIGF1dGhGbG93czogeyB1c2VyUGFzc3dvcmQ6IHRydWUsIHVzZXJTcnA6IHRydWUgfSxcbiAgICAgIG9BdXRoOiB7XG4gICAgICAgIGZsb3dzOiB7IGF1dGhvcml6YXRpb25Db2RlR3JhbnQ6IHRydWUsIGltcGxpY2l0Q29kZUdyYW50OiB0cnVlIH0sXG4gICAgICAgIHNjb3BlczogW2NvZ25pdG8uT0F1dGhTY29wZS5PUEVOSUQsIGNvZ25pdG8uT0F1dGhTY29wZS5FTUFJTCwgY29nbml0by5PQXV0aFNjb3BlLlBST0ZJTEVdLFxuICAgICAgICBjYWxsYmFja1VybHM6IFtcImh0dHBzOi8vZDFmNzFwcGVkM3l2emkuY2xvdWRmcm9udC5uZXQvY2FsbGJhY2tcIl0sXG4gICAgICAgIGxvZ291dFVybHM6IFtcImh0dHBzOi8vZDFmNzFwcGVkM3l2emkuY2xvdWRmcm9udC5uZXQvXCJdLFxuICAgICAgfSxcbiAgICAgIHJlYWRBdHRyaWJ1dGVzOiBuZXcgY29nbml0by5DbGllbnRBdHRyaWJ1dGVzKClcbiAgICAgICAgLndpdGhTdGFuZGFyZEF0dHJpYnV0ZXMoeyBlbWFpbDogdHJ1ZSwgZW1haWxWZXJpZmllZDogdHJ1ZSwgZnVsbG5hbWU6IHRydWUgfSlcbiAgICAgICAgLndpdGhDdXN0b21BdHRyaWJ1dGVzKFwicm9sZVwiLCBcInRlYW1JZFwiKSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHVzZXJQb29sRG9tYWluID0gbmV3IGNvZ25pdG8uVXNlclBvb2xEb21haW4odGhpcywgXCJVc2VyUG9vbERvbWFpblwiLCB7XG4gICAgICB1c2VyUG9vbCxcbiAgICAgIGNvZ25pdG9Eb21haW46IHsgZG9tYWluUHJlZml4OiBgJHtwcm9qZWN0fS1hdXRoYCB9LFxuICAgIH0pO1xuXG4gICAgLy8g4pSA4pSA4pSAIER5bmFtb0RCIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgIG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIlRlYW1zVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIlRlYW1zXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ0ZWFtSWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgfSk7XG5cbiAgICBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJQcm9qZWN0c1RhYmxlXCIsIHtcbiAgICAgIHRhYmxlTmFtZTogXCJQcm9qZWN0c1wiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwicHJvamVjdElkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgIH0pO1xuXG4gICAgY29uc3QgdGFza3NUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIlRhc2tzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIlRhc2tzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJ0YXNrSWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJjcmVhdGVkQXRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgfSk7XG4gICAgdGFza3NUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6IFwiVGVhbUlkSW5kZXhcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcInRlYW1JZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcImNyZWF0ZWRBdFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgIH0pO1xuICAgIHRhc2tzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiBcIlN0YXR1c0luZGV4XCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJzdGF0dXNcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogXCJjcmVhdGVkQXRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICB9KTtcbiAgICB0YXNrc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogXCJBc3NpZ25lZUluZGV4XCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJhc3NpZ25lZVwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcImNyZWF0ZWRBdFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgIH0pO1xuICAgIHRhc2tzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiBcIkFzc2lnbmVlSWRJbmRleFwiLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwiYXNzaWduZWVJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcImNyZWF0ZWRBdFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgY29tbWVudHNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIkNvbW1lbnRzVGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcIkNvbW1lbnRzXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJjb21tZW50SWRcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgfSk7XG4gICAgY29tbWVudHNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6IFwiVGFza0lkSW5kZXhcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcInRhc2tJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiBcImNyZWF0ZWRBdFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgIH0pO1xuXG4gICAgbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwiQWN0aXZpdHlMb2dUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiQWN0aXZpdHlMb2dcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcImxvZ0lkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgIH0pO1xuXG4gICAgbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwiVXNlcnNUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwiVXNlcnNcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcInVzZXJJZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICB9KTtcblxuICAgIC8vIOKUgOKUgOKUgCBTMyBCdWNrZXRzIChsaXRlcmFsIG5hbWVzIHRvIGF2b2lkIHRva2VuIGRlcHMgaW4gSUFNKSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICBjb25zdCBmcm9udGVuZEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgXCJGcm9udGVuZEJ1Y2tldFwiLCB7XG4gICAgICBidWNrZXROYW1lOiBgJHtwcmVmaXh9ZnJvbnRlbmQtJHtzdWZmaXh9YCxcbiAgICAgIHdlYnNpdGVJbmRleERvY3VtZW50OiBcImluZGV4Lmh0bWxcIixcbiAgICAgIHdlYnNpdGVFcnJvckRvY3VtZW50OiBcImluZGV4Lmh0bWxcIixcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IHRydWUsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogbmV3IHMzLkJsb2NrUHVibGljQWNjZXNzKHtcbiAgICAgICAgYmxvY2tQdWJsaWNBY2xzOiBmYWxzZSxcbiAgICAgICAgYmxvY2tQdWJsaWNQb2xpY3k6IGZhbHNlLFxuICAgICAgICBpZ25vcmVQdWJsaWNBY2xzOiBmYWxzZSxcbiAgICAgICAgcmVzdHJpY3RQdWJsaWNCdWNrZXRzOiBmYWxzZSxcbiAgICAgIH0pLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gVXNlIENmbkJ1Y2tldCBmb3Igb3JpZ2luYWxzIHNvIHdlIGNhbiBpbmxpbmUgTm90aWZpY2F0aW9uQ29uZmlndXJhdGlvblxuICAgIC8vIChhdm9pZHMgQ0RLJ3MgY3VzdG9tLXJlc291cmNlIG5vdGlmaWNhdGlvbiBoYW5kbGVyLCBicmVha2luZyB0aGUgY3ljbGUpLlxuICAgIGNvbnN0IG9yaWdpbmFsc0J1Y2tldE5hbWUgPSBgJHtwcmVmaXh9b3JpZ2luYWxzLSR7c3VmZml4fWA7XG4gICAgY29uc3QgcmVzaXplZEJ1Y2tldE5hbWUgPSBgJHtwcmVmaXh9cmVzaXplZC0ke3N1ZmZpeH1gO1xuICAgIGNvbnN0IGRlcGxveUJ1Y2tldE5hbWUgPSBgJHtwcmVmaXh9ZGVwbG95LSR7c3VmZml4fWA7XG5cbiAgICBjb25zdCBvcmlnaW5hbHNCdWNrZXQgPSBuZXcgczMuQ2ZuQnVja2V0KHRoaXMsIFwiT3JpZ2luYWxzQnVja2V0XCIsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IG9yaWdpbmFsc0J1Y2tldE5hbWUsXG4gICAgICB2ZXJzaW9uaW5nQ29uZmlndXJhdGlvbjogeyBzdGF0dXM6IFwiRW5hYmxlZFwiIH0sXG4gICAgICBwdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgYmxvY2tQdWJsaWNBY2xzOiBmYWxzZSxcbiAgICAgICAgYmxvY2tQdWJsaWNQb2xpY3k6IGZhbHNlLFxuICAgICAgICBpZ25vcmVQdWJsaWNBY2xzOiBmYWxzZSxcbiAgICAgICAgcmVzdHJpY3RQdWJsaWNCdWNrZXRzOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBjb3JzQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBjb3JzUnVsZXM6IFt7XG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtcIlBVVFwiLCBcIlBPU1RcIiwgXCJHRVRcIl0sXG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IFtcIipcIl0sXG4gICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFtcIipcIl0sXG4gICAgICAgICAgbWF4QWdlOiAzMDAwLFxuICAgICAgICB9XSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCByZXNpemVkQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcIlJlc2l6ZWRCdWNrZXRcIiwge1xuICAgICAgYnVja2V0TmFtZTogcmVzaXplZEJ1Y2tldE5hbWUsXG4gICAgICBwdWJsaWNSZWFkQWNjZXNzOiB0cnVlLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IG5ldyBzMy5CbG9ja1B1YmxpY0FjY2Vzcyh7XG4gICAgICAgIGJsb2NrUHVibGljQWNsczogZmFsc2UsXG4gICAgICAgIGJsb2NrUHVibGljUG9saWN5OiBmYWxzZSxcbiAgICAgICAgaWdub3JlUHVibGljQWNsczogZmFsc2UsXG4gICAgICAgIHJlc3RyaWN0UHVibGljQnVja2V0czogZmFsc2UsXG4gICAgICB9KSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGRlcGxveUJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgXCJEZXBsb3lCdWNrZXRcIiwge1xuICAgICAgYnVja2V0TmFtZTogZGVwbG95QnVja2V0TmFtZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIOKUgOKUgOKUgCBJQU0gUm9sZXMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgLy8gQWxsIEFSTnMgYmVsb3cgYXJlIGNvbnN0cnVjdGVkIGFzIGxpdGVyYWwgc3RyaW5ncyBzbyBJQU0gcG9saWN5IGRvY3VtZW50c1xuICAgIC8vIGRvIE5PVCBjcmVhdGUgQ2xvdWRGb3JtYXRpb24gRGVwZW5kc09uIGVkZ2VzIHRvIHRoZSByZWZlcmVuY2VkIHJlc291cmNlcy5cblxuICAgIGNvbnN0IGxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJMYW1iZGFSb2xlXCIsIHtcbiAgICAgIHJvbGVOYW1lOiBgJHtwcm9qZWN0fS1sYW1iZGEtcm9sZWAsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbChcImxhbWJkYS5hbWF6b25hd3MuY29tXCIpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcInNlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGVcIiksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdGFibGVBcm5zID0gW1wiVGVhbXNcIiwgXCJQcm9qZWN0c1wiLCBcIlRhc2tzXCIsIFwiQ29tbWVudHNcIiwgXCJBY3Rpdml0eUxvZ1wiLCBcIlVzZXJzXCJdXG4gICAgICAubWFwKCh0KSA9PiBgYXJuOmF3czpkeW5hbW9kYjoke3JlZ2lvbn06JHthY2NvdW50fTp0YWJsZS8ke3R9YCk7XG5cbiAgICBsYW1iZGFSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgXCJkeW5hbW9kYjpCYXRjaEdldEl0ZW1cIiwgXCJkeW5hbW9kYjpCYXRjaFdyaXRlSXRlbVwiLCBcImR5bmFtb2RiOkRlbGV0ZUl0ZW1cIixcbiAgICAgICAgICBcImR5bmFtb2RiOkdldEl0ZW1cIiwgXCJkeW5hbW9kYjpQdXRJdGVtXCIsIFwiZHluYW1vZGI6UXVlcnlcIiwgXCJkeW5hbW9kYjpTY2FuXCIsXG4gICAgICAgICAgXCJkeW5hbW9kYjpVcGRhdGVJdGVtXCIsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogWy4uLnRhYmxlQXJucywgYCR7dGFibGVBcm5zWzJdfS8qYF0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgbGFtYmRhUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1wiY2xvdWR3YXRjaDpQdXRNZXRyaWNEYXRhXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtcIipcIl0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gV2lsZGNhcmQgcGF0dGVybiDigJMgdXNlciBwb29sIElEIGlzIGFzc2lnbmVkIGJ5IENsb3VkRm9ybWF0aW9uIGFuZCBjYW4ndFxuICAgIC8vIGJlIHByZWRpY3RlZCBhdCBzeW50aCB0aW1lLiBVc2luZyBhIGxpdGVyYWwgQVJOIGF2b2lkcyBhIERlcGVuZHNPbiBlZGdlLlxuICAgIGxhbWJkYVJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcImNvZ25pdG8taWRwOkFkbWluR2V0VXNlclwiLCBcImNvZ25pdG8taWRwOkxpc3RVc2Vyc1wiXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6Y29nbml0by1pZHA6JHtyZWdpb259OiR7YWNjb3VudH06dXNlcnBvb2wvKmBdLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIFNlcGFyYXRlIHJvbGUgZm9yIHRoZSBpbWFnZS1yZXNpemUgTGFtYmRhIHNvIGxhbWJkYVJvbGUgZG9lc24ndCBuZWVkIFMzXG4gICAgY29uc3QgaW1hZ2VSZXNpemVSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiSW1hZ2VSZXNpemVSb2xlXCIsIHtcbiAgICAgIHJvbGVOYW1lOiBgJHtwcm9qZWN0fS1pbWFnZS1yZXNpemUtcm9sZWAsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbChcImxhbWJkYS5hbWF6b25hd3MuY29tXCIpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcInNlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGVcIiksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgaW1hZ2VSZXNpemVSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXCJzMzpHZXRPYmplY3RcIiwgXCJzMzpQdXRPYmplY3RcIiwgXCJzMzpEZWxldGVPYmplY3RcIl0sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOnMzOjo6JHtwcmVmaXh9KmAsXG4gICAgICAgICAgYGFybjphd3M6czM6Ojoke3ByZWZpeH0qLypgLFxuICAgICAgICBdLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIOKUgOKUgOKUgCBTTlMgKyBTUVMgKGxpdGVyYWwgQVJOcywgcHJlZGljdGFibGUgbmFtZXMpIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgIGNvbnN0IGFzc2lnbm1lbnRzVG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsIFwiQXNzaWdubWVudHNUb3BpY1wiLCB7XG4gICAgICB0b3BpY05hbWU6IGAke3Byb2plY3R9LWFzc2lnbm1lbnRzYCxcbiAgICB9KTtcblxuICAgIGNvbnN0IGFzc2lnbm1lbnRzUXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsIFwiQXNzaWdubWVudHNRdWV1ZVwiLCB7XG4gICAgICBxdWV1ZU5hbWU6IGAke3Byb2plY3R9LWFzc2lnbm1lbnRzYCxcbiAgICB9KTtcblxuICAgIGFzc2lnbm1lbnRzVG9waWMuYWRkU3Vic2NyaXB0aW9uKG5ldyBzbnNTdWJzY3JpcHRpb25zLlNxc1N1YnNjcmlwdGlvbihhc3NpZ25tZW50c1F1ZXVlKSk7XG4gICAgYXNzaWdubWVudHNUb3BpYy5hZGRTdWJzY3JpcHRpb24obmV3IHNuc1N1YnNjcmlwdGlvbnMuRW1haWxTdWJzY3JpcHRpb24oXCJhbXIuaGVkaXd5QGdtYWlsLmNvbVwiKSk7XG5cbiAgICBjb25zdCBhc3NpZ25tZW50c1RvcGljQXJuID0gYGFybjphd3M6c25zOiR7cmVnaW9ufToke2FjY291bnR9OiR7cHJvamVjdH0tYXNzaWdubWVudHNgO1xuICAgIGNvbnN0IGFzc2lnbm1lbnRzUXVldWVBcm4gPSBgYXJuOmF3czpzcXM6JHtyZWdpb259OiR7YWNjb3VudH06JHtwcm9qZWN0fS1hc3NpZ25tZW50c2A7XG5cbiAgICBsYW1iZGFSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXCJzbnM6UHVibGlzaFwiLCBcInNuczpTdWJzY3JpYmVcIl0sXG4gICAgICAgIHJlc291cmNlczogW2Fzc2lnbm1lbnRzVG9waWNBcm5dLFxuICAgICAgfSksXG4gICAgKTtcbiAgICBsYW1iZGFSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXCJzcXM6UmVjZWl2ZU1lc3NhZ2VcIiwgXCJzcXM6RGVsZXRlTWVzc2FnZVwiLCBcInNxczpHZXRRdWV1ZUF0dHJpYnV0ZXNcIl0sXG4gICAgICAgIHJlc291cmNlczogW2Fzc2lnbm1lbnRzUXVldWVBcm5dLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIOKUgOKUgOKUgCBMYW1iZGEgRnVuY3Rpb25zIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgIGNvbnN0IHBvc3RDb25maXJtYXRpb25MYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiUG9zdENvbmZpcm1hdGlvbkxhbWJkYVwiLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGAke3Byb2plY3R9LXBvc3QtY29uZmlybWF0aW9uYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKGJhY2tlbmREaXN0UGF0aCwgXCJkaXN0L2xhbWJkYXMvcG9zdC1jb25maXJtYXRpb24uemlwXCIpKSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICBlbnZpcm9ubWVudDogeyBUQUJMRV9VU0VSUzogXCJVc2Vyc1wiLCBTTlNfVE9QSUNfQVJOOiBhc3NpZ25tZW50c1RvcGljQXJuIH0sXG4gICAgfSk7XG5cbiAgICB1c2VyUG9vbC5hZGRUcmlnZ2VyKGNvZ25pdG8uVXNlclBvb2xPcGVyYXRpb24uUE9TVF9DT05GSVJNQVRJT04sIHBvc3RDb25maXJtYXRpb25MYW1iZGEpO1xuXG4gICAgY29uc3QgaW1hZ2VSZXNpemVMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiSW1hZ2VSZXNpemVMYW1iZGFcIiwge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtwcm9qZWN0fS1pbWFnZS1yZXNpemVgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oYmFja2VuZERpc3RQYXRoLCBcImRpc3QvbGFtYmRhcy9pbWFnZS1yZXNpemUuemlwXCIpKSxcbiAgICAgIHJvbGU6IGltYWdlUmVzaXplUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDEwMjQsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBPUklHSU5BTFNfQlVDS0VUOiBvcmlnaW5hbHNCdWNrZXROYW1lLFxuICAgICAgICBSRVNJWkVEX0JVQ0tFVDogcmVzaXplZEJ1Y2tldE5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gUzMgaW52b2tlIHBlcm1pc3Npb24gKHJlcXVpcmVkIGV2ZW4gd2l0aCBDZm5CdWNrZXQgbm90aWZpY2F0aW9uKVxuICAgIG5ldyBsYW1iZGEuQ2ZuUGVybWlzc2lvbih0aGlzLCBcIkltYWdlUmVzaXplUzNQZXJtaXNzaW9uXCIsIHtcbiAgICAgIGFjdGlvbjogXCJsYW1iZGE6SW52b2tlRnVuY3Rpb25cIixcbiAgICAgIGZ1bmN0aW9uTmFtZTogaW1hZ2VSZXNpemVMYW1iZGEuZnVuY3Rpb25Bcm4sXG4gICAgICBwcmluY2lwYWw6IFwiczMuYW1hem9uYXdzLmNvbVwiLFxuICAgICAgc291cmNlQXJuOiBgYXJuOmF3czpzMzo6OiR7b3JpZ2luYWxzQnVja2V0TmFtZX1gLFxuICAgIH0pO1xuXG4gICAgLy8gSW5saW5lIE5vdGlmaWNhdGlvbkNvbmZpZ3VyYXRpb24gb24gdGhlIENmbkJ1Y2tldCDigJMgbm8gY3VzdG9tIHJlc291cmNlXG4gICAgb3JpZ2luYWxzQnVja2V0Lm5vdGlmaWNhdGlvbkNvbmZpZ3VyYXRpb24gPSB7XG4gICAgICBsYW1iZGFDb25maWd1cmF0aW9uczogW3tcbiAgICAgICAgZnVuY3Rpb246IGltYWdlUmVzaXplTGFtYmRhLmZ1bmN0aW9uQXJuLFxuICAgICAgICBldmVudDogXCJzMzpPYmplY3RDcmVhdGVkOipcIixcbiAgICAgIH1dLFxuICAgIH07XG5cbiAgICBjb25zdCBhc3NpZ25tZW50V29ya2VyTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIkFzc2lnbm1lbnRXb3JrZXJMYW1iZGFcIiwge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtwcm9qZWN0fS1hc3NpZ25tZW50LXdvcmtlcmAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihiYWNrZW5kRGlzdFBhdGgsIFwiZGlzdC9sYW1iZGFzL2Fzc2lnbm1lbnQtd29ya2VyLnppcFwiKSksXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTApLFxuICAgICAgZW52aXJvbm1lbnQ6IHsgVEFCTEVfQUNUSVZJVFlfTE9HOiBcIkFjdGl2aXR5TG9nXCIgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGRhaWx5RGlnZXN0TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIkRhaWx5RGlnZXN0TGFtYmRhXCIsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYCR7cHJvamVjdH0tZGFpbHktZGlnZXN0YCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKGJhY2tlbmREaXN0UGF0aCwgXCJkaXN0L2xhbWJkYXMvZGFpbHktZGlnZXN0LnppcFwiKSksXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgZW52aXJvbm1lbnQ6IHsgVEFCTEVfVEFTS1M6IFwiVGFza3NcIiwgU05TX1RPUElDX0FSTjogYXNzaWdubWVudHNUb3BpY0FybiB9LFxuICAgIH0pO1xuXG4gICAgYXNzaWdubWVudFdvcmtlckxhbWJkYS5hZGRFdmVudFNvdXJjZShuZXcgbGFtYmRhRXZlbnRTb3VyY2VzLlNxc0V2ZW50U291cmNlKGFzc2lnbm1lbnRzUXVldWUpKTtcblxuICAgIC8vIOKUgOKUgOKUgCBFdmVudEJyaWRnZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICBjb25zdCBkYWlseURpZ2VzdFJ1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgXCJEYWlseURpZ2VzdFJ1bGVcIiwge1xuICAgICAgcnVsZU5hbWU6IGAke3Byb2plY3R9LWRhaWx5LWRpZ2VzdC1ydWxlYCxcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUuY3Jvbih7IGhvdXI6IFwiOVwiLCBtaW51dGU6IFwiMFwiIH0pLFxuICAgIH0pO1xuICAgIGRhaWx5RGlnZXN0UnVsZS5hZGRUYXJnZXQobmV3IGV2ZW50c1RhcmdldHMuTGFtYmRhRnVuY3Rpb24oZGFpbHlEaWdlc3RMYW1iZGEpKTtcblxuICAgIC8vIOKUgOKUgOKUgCBFQzIgKyBBTEIg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgY29uc3QgZWMyUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCBcIkVjMlJvbGVcIiwge1xuICAgICAgcm9sZU5hbWU6IGAke3Byb2plY3R9LWVjMi1yb2xlYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKFwiZWMyLmFtYXpvbmF3cy5jb21cIiksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFwiQW1hem9uU1NNTWFuYWdlZEluc3RhbmNlQ29yZVwiKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICBlYzJSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXCJzMzpMaXN0QnVja2V0XCIsIFwiczM6R2V0T2JqZWN0XCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpzMzo6OiR7ZGVwbG95QnVja2V0TmFtZX1gLCBgYXJuOmF3czpzMzo6OiR7ZGVwbG95QnVja2V0TmFtZX0vKmBdLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIGVjMlJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcImR5bmFtb2RiOkJhdGNoR2V0SXRlbVwiLCBcImR5bmFtb2RiOkJhdGNoV3JpdGVJdGVtXCIsIFwiZHluYW1vZGI6RGVsZXRlSXRlbVwiLFxuICAgICAgICAgIFwiZHluYW1vZGI6R2V0SXRlbVwiLCBcImR5bmFtb2RiOlB1dEl0ZW1cIiwgXCJkeW5hbW9kYjpRdWVyeVwiLCBcImR5bmFtb2RiOlNjYW5cIixcbiAgICAgICAgICBcImR5bmFtb2RiOlVwZGF0ZUl0ZW1cIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbLi4udGFibGVBcm5zLCBgJHt0YWJsZUFybnNbMl19LypgXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBlYzJSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXCJzbnM6UHVibGlzaFwiLCBcInNuczpTdWJzY3JpYmVcIl0sXG4gICAgICAgIHJlc291cmNlczogW2Fzc2lnbm1lbnRzVG9waWNBcm5dLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIGVjMlJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcImNsb3Vkd2F0Y2g6UHV0TWV0cmljRGF0YVwiXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIGVjMlJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcImNvZ25pdG8taWRwOkFkbWluR2V0VXNlclwiLCBcImNvZ25pdG8taWRwOkFkbWluVXBkYXRlVXNlckF0dHJpYnV0ZXNcIl0sXG4gICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmNvZ25pdG8taWRwOiR7cmVnaW9ufToke2FjY291bnR9OnVzZXJwb29sLypgXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zdCBlYzJJbnN0YW5jZVByb2ZpbGUgPSBuZXcgaWFtLkNmbkluc3RhbmNlUHJvZmlsZSh0aGlzLCBcIkVjMlByb2ZpbGVcIiwge1xuICAgICAgaW5zdGFuY2VQcm9maWxlTmFtZTogYCR7cHJvamVjdH0tZWMyLXByb2ZpbGVgLFxuICAgICAgcm9sZXM6IFtlYzJSb2xlLnJvbGVOYW1lXSxcbiAgICB9KTtcblxuICAgIC8vIFVzZXIgZGF0YSB1c2VzIGxpdGVyYWwgcmVzb3VyY2UgbmFtZXMg4oCTIG5vIENsb3VkRm9ybWF0aW9uIHRva2VucyxcbiAgICAvLyBzbyB0aGUgTGF1bmNoVGVtcGxhdGUgZG9lc24ndCBjcmVhdGUgRGVwZW5kc09uIGVkZ2VzIHRvIG90aGVyIHJlc291cmNlcy5cbiAgICBjb25zdCB1c2VyRGF0YVNjcmlwdCA9IFtcbiAgICAgIFwiIyEvYmluL2Jhc2hcIixcbiAgICAgIFwic2V0IC1lXCIsXG4gICAgICBcImV4ZWMgPiA+KHRlZSAvdmFyL2xvZy91c2VyLWRhdGEubG9nKSAyPiYxXCIsXG4gICAgICBcImRuZiBpbnN0YWxsIC15IG5vZGVqcyBhd3MtY2xpXCIsXG4gICAgICBcIm1rZGlyIC1wIC9vcHQvYXBwICYmIGNkIC9vcHQvYXBwXCIsXG4gICAgICBgYXdzIHMzIHN5bmMgczM6Ly8ke2RlcGxveUJ1Y2tldE5hbWV9LyAuYCxcbiAgICAgIFwibnBtIGluc3RhbGwgLS1wcm9kdWN0aW9uXCIsXG4gICAgICBcImV4cG9ydCBQT1JUPTMwMDBcIixcbiAgICAgIGBleHBvcnQgQVdTX1JFR0lPTj0ke3JlZ2lvbn1gLFxuICAgICAgYGV4cG9ydCBDT0dOSVRPX1VTRVJfUE9PTF9JRD0ke3VzZXJQb29sLnVzZXJQb29sSWR9YCxcbiAgICAgIGBleHBvcnQgQ09HTklUT19DTElFTlRfSUQ9JHt1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkfWAsXG4gICAgICBcImV4cG9ydCBUQUJMRV9URUFNUz1UZWFtc1wiLFxuICAgICAgXCJleHBvcnQgVEFCTEVfUFJPSkVDVFM9UHJvamVjdHNcIixcbiAgICAgIFwiZXhwb3J0IFRBQkxFX1RBU0tTPVRhc2tzXCIsXG4gICAgICBcImV4cG9ydCBUQUJMRV9DT01NRU5UUz1Db21tZW50c1wiLFxuICAgICAgXCJleHBvcnQgVEFCTEVfQUNUSVZJVFlfTE9HPUFjdGl2aXR5TG9nXCIsXG4gICAgICBcImV4cG9ydCBUQUJMRV9VU0VSUz1Vc2Vyc1wiLFxuICAgICAgYGV4cG9ydCBTM19CVUNLRVRfT1JJR0lOQUxTPSR7b3JpZ2luYWxzQnVja2V0TmFtZX1gLFxuICAgICAgYGV4cG9ydCBTM19CVUNLRVRfUkVTSVpFRD0ke3Jlc2l6ZWRCdWNrZXROYW1lfWAsXG4gICAgICBgZXhwb3J0IFNOU19UT1BJQ19BUk49JHthc3NpZ25tZW50c1RvcGljQXJufWAsXG4gICAgICBcIm5vZGUgZGlzdC9pbmRleC5qcyAmXCIsXG4gICAgXS5qb2luKFwiXFxuXCIpO1xuXG4gICAgY29uc3QgbGF1bmNoVGVtcGxhdGUgPSBuZXcgZWMyLkNmbkxhdW5jaFRlbXBsYXRlKHRoaXMsIFwiTGF1bmNoVGVtcGxhdGVcIiwge1xuICAgICAgbGF1bmNoVGVtcGxhdGVOYW1lOiBgJHtwcm9qZWN0fS10ZW1wbGF0ZWAsXG4gICAgICBsYXVuY2hUZW1wbGF0ZURhdGE6IHtcbiAgICAgICAgaW1hZ2VJZDogbmV3IGVjMi5BbWF6b25MaW51eEltYWdlKHtcbiAgICAgICAgICBnZW5lcmF0aW9uOiBlYzIuQW1hem9uTGludXhHZW5lcmF0aW9uLkFNQVpPTl9MSU5VWF8yMDIzLFxuICAgICAgICB9KS5nZXRJbWFnZSh0aGlzKS5pbWFnZUlkLFxuICAgICAgICBpbnN0YW5jZVR5cGU6IFwidDMubWljcm9cIixcbiAgICAgICAgaWFtSW5zdGFuY2VQcm9maWxlOiB7IGFybjogZWMySW5zdGFuY2VQcm9maWxlLmF0dHJBcm4gfSxcbiAgICAgICAgc2VjdXJpdHlHcm91cElkczogW2VjMlNnLnNlY3VyaXR5R3JvdXBJZF0sXG4gICAgICAgIHVzZXJEYXRhOiBjZGsuRm4uYmFzZTY0KHVzZXJEYXRhU2NyaXB0KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBhbGIgPSBuZXcgZWxhc3RpY2xvYWRiYWxhbmNpbmd2Mi5BcHBsaWNhdGlvbkxvYWRCYWxhbmNlcih0aGlzLCBcIkFMQlwiLCB7XG4gICAgICBsb2FkQmFsYW5jZXJOYW1lOiBgJHtwcm9qZWN0fS1hbGJgLFxuICAgICAgdnBjLFxuICAgICAgaW50ZXJuZXRGYWNpbmc6IHRydWUsXG4gICAgICBzZWN1cml0eUdyb3VwOiBhbGJTZyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHRhcmdldEdyb3VwID0gbmV3IGVsYXN0aWNsb2FkYmFsYW5jaW5ndjIuQXBwbGljYXRpb25UYXJnZXRHcm91cCh0aGlzLCBcIlRhcmdldEdyb3VwXCIsIHtcbiAgICAgIHRhcmdldEdyb3VwTmFtZTogYCR7cHJvamVjdH0tdGdgLFxuICAgICAgdnBjLFxuICAgICAgcG9ydDogMzAwMCxcbiAgICAgIHByb3RvY29sOiBlbGFzdGljbG9hZGJhbGFuY2luZ3YyLkFwcGxpY2F0aW9uUHJvdG9jb2wuSFRUUCxcbiAgICAgIGhlYWx0aENoZWNrOiB7XG4gICAgICAgIHBhdGg6IFwiL2hlYWx0aFwiLFxuICAgICAgICBoZWFsdGh5VGhyZXNob2xkQ291bnQ6IDIsXG4gICAgICAgIHVuaGVhbHRoeVRocmVzaG9sZENvdW50OiAyLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg1KSxcbiAgICAgICAgaW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBhbGIuYWRkTGlzdGVuZXIoXCJIdHRwTGlzdGVuZXJcIiwge1xuICAgICAgcG9ydDogODAsXG4gICAgICBwcm90b2NvbDogZWxhc3RpY2xvYWRiYWxhbmNpbmd2Mi5BcHBsaWNhdGlvblByb3RvY29sLkhUVFAsXG4gICAgICBkZWZhdWx0VGFyZ2V0R3JvdXBzOiBbdGFyZ2V0R3JvdXBdLFxuICAgIH0pO1xuXG4gICAgY29uc3QgY2ZuQXNnID0gbmV3IGF1dG9zY2FsaW5nLkNmbkF1dG9TY2FsaW5nR3JvdXAodGhpcywgXCJBU0dcIiwge1xuICAgICAgYXV0b1NjYWxpbmdHcm91cE5hbWU6IGAke3Byb2plY3R9LWFzZ2AsXG4gICAgICB2cGNab25lSWRlbnRpZmllcjogdnBjLnNlbGVjdFN1Ym5ldHMoeyBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTIH0pLnN1Ym5ldElkcyxcbiAgICAgIHRhcmdldEdyb3VwQXJuczogW3RhcmdldEdyb3VwLnRhcmdldEdyb3VwQXJuXSxcbiAgICAgIGhlYWx0aENoZWNrVHlwZTogXCJFTEJcIixcbiAgICAgIG1pblNpemU6IFwiMlwiLFxuICAgICAgbWF4U2l6ZTogXCI0XCIsXG4gICAgICBkZXNpcmVkQ2FwYWNpdHk6IFwiMlwiLFxuICAgICAgbGF1bmNoVGVtcGxhdGU6IHtcbiAgICAgICAgbGF1bmNoVGVtcGxhdGVJZDogbGF1bmNoVGVtcGxhdGUucmVmLFxuICAgICAgICB2ZXJzaW9uOiBsYXVuY2hUZW1wbGF0ZS5hdHRyTGF0ZXN0VmVyc2lvbk51bWJlcixcbiAgICAgIH0sXG4gICAgICB0YWdzOiBbXG4gICAgICAgIHsga2V5OiBcIk5hbWVcIiwgdmFsdWU6IGAke3Byb2plY3R9LWFzZ2AsIHByb3BhZ2F0ZUF0TGF1bmNoOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiBcIlByb2plY3RcIiwgdmFsdWU6IHByb2plY3QsIHByb3BhZ2F0ZUF0TGF1bmNoOiB0cnVlIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8g4pSA4pSA4pSAIENsb3VkRnJvbnQg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgY29uc3Qgb2FpID0gbmV3IGNsb3VkZnJvbnQuT3JpZ2luQWNjZXNzSWRlbnRpdHkodGhpcywgXCJPQUlcIiwge1xuICAgICAgY29tbWVudDogYCR7cHJvamVjdH0tZnJvbnRlbmQtb2FpYCxcbiAgICB9KTtcblxuICAgIGNvbnN0IGNsb3VkZnJvbnREaXN0ID0gbmV3IGNsb3VkZnJvbnQuQ2xvdWRGcm9udFdlYkRpc3RyaWJ1dGlvbih0aGlzLCBcIkNsb3VkRnJvbnRcIiwge1xuICAgICAgY29tbWVudDogYCR7cHJvamVjdH0tZnJvbnRlbmRgLFxuICAgICAgb3JpZ2luQ29uZmlnczogW1xuICAgICAgICB7XG4gICAgICAgICAgczNPcmlnaW5Tb3VyY2U6IHsgczNCdWNrZXRTb3VyY2U6IGZyb250ZW5kQnVja2V0LCBvcmlnaW5BY2Nlc3NJZGVudGl0eTogb2FpIH0sXG4gICAgICAgICAgYmVoYXZpb3JzOiBbeyBpc0RlZmF1bHRCZWhhdmlvcjogdHJ1ZSB9XSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGN1c3RvbU9yaWdpblNvdXJjZToge1xuICAgICAgICAgICAgZG9tYWluTmFtZTogYWxiLmxvYWRCYWxhbmNlckRuc05hbWUsXG4gICAgICAgICAgICBvcmlnaW5Qcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5PcmlnaW5Qcm90b2NvbFBvbGljeS5IVFRQX09OTFksXG4gICAgICAgICAgfSxcbiAgICAgICAgICBiZWhhdmlvcnM6IFt7XG4gICAgICAgICAgICBwYXRoUGF0dGVybjogXCIvYXBpLypcIixcbiAgICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkNsb3VkRnJvbnRBbGxvd2VkTWV0aG9kcy5BTEwsXG4gICAgICAgICAgICBjYWNoZWRNZXRob2RzOiBjbG91ZGZyb250LkNsb3VkRnJvbnRBbGxvd2VkQ2FjaGVkTWV0aG9kcy5HRVRfSEVBRF9PUFRJT05TLFxuICAgICAgICAgICAgY29tcHJlc3M6IGZhbHNlLFxuICAgICAgICAgICAgbWluVHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICAgICAgICAgIGRlZmF1bHRUdGw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLFxuICAgICAgICAgICAgbWF4VHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICAgICAgICAgIGZvcndhcmRlZFZhbHVlczoge1xuICAgICAgICAgICAgICBxdWVyeVN0cmluZzogdHJ1ZSxcbiAgICAgICAgICAgICAgaGVhZGVyczogW1wiQXV0aG9yaXphdGlvblwiLCBcIk9yaWdpblwiLCBcIkFjY2Vzcy1Db250cm9sLVJlcXVlc3QtSGVhZGVyc1wiLCBcIkFjY2Vzcy1Db250cm9sLVJlcXVlc3QtTWV0aG9kXCJdLFxuICAgICAgICAgICAgICBjb29raWVzOiB7IGZvcndhcmQ6IFwiYWxsXCIgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfV0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgZXJyb3JDb25maWd1cmF0aW9uczogW1xuICAgICAgICB7IGVycm9yQ29kZTogNDAzLCByZXNwb25zZUNvZGU6IDIwMCwgcmVzcG9uc2VQYWdlUGF0aDogXCIvaW5kZXguaHRtbFwiIH0sXG4gICAgICAgIHsgZXJyb3JDb2RlOiA0MDQsIHJlc3BvbnNlQ29kZTogMjAwLCByZXNwb25zZVBhZ2VQYXRoOiBcIi9pbmRleC5odG1sXCIgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyDilIDilIDilIAgRGVwbG95bWVudHMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgbmV3IHMzZGVwbG95LkJ1Y2tldERlcGxveW1lbnQodGhpcywgXCJEZXBsb3lGcm9udGVuZFwiLCB7XG4gICAgICBzb3VyY2VzOiBbczNkZXBsb3kuU291cmNlLmFzc2V0KGZyb250ZW5kRGlzdFBhdGgpXSxcbiAgICAgIGRlc3RpbmF0aW9uQnVja2V0OiBmcm9udGVuZEJ1Y2tldCxcbiAgICAgIGRpc3RyaWJ1dGlvbjogY2xvdWRmcm9udERpc3QsXG4gICAgICBkaXN0cmlidXRpb25QYXRoczogW1wiLypcIl0sXG4gICAgfSk7XG5cbiAgICBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCBcIkRlcGxveUJhY2tlbmRcIiwge1xuICAgICAgc291cmNlczogW3MzZGVwbG95LlNvdXJjZS5hc3NldChwYXRoLmpvaW4oYmFja2VuZERpc3RQYXRoLCBcImRlcGxveS56aXBcIikpXSxcbiAgICAgIGRlc3RpbmF0aW9uQnVja2V0OiBkZXBsb3lCdWNrZXQsXG4gICAgfSk7XG5cbiAgICAvLyDilIDilIDilIAgQ2xvdWRXYXRjaCBEYXNoYm9hcmQg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgbmV3IGNsb3Vkd2F0Y2guRGFzaGJvYXJkKHRoaXMsIFwiRGFzaGJvYXJkXCIsIHtcbiAgICAgIGRhc2hib2FyZE5hbWU6IGAke3Byb2plY3R9LWRhc2hib2FyZGAsXG4gICAgICB3aWRnZXRzOiBbXG4gICAgICAgIFtcbiAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XG4gICAgICAgICAgICB0aXRsZTogXCJUYXNrcyBDcmVhdGVkIFBlciBEYXlcIixcbiAgICAgICAgICAgIGxlZnQ6IFtuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICAgICAgICBuYW1lc3BhY2U6IFwiTWluaUppcmFcIiwgbWV0cmljTmFtZTogXCJUYXNrc0NyZWF0ZWRcIixcbiAgICAgICAgICAgICAgc3RhdGlzdGljOiBcIlN1bVwiLCBwZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDEpLFxuICAgICAgICAgICAgfSldLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcbiAgICAgICAgICAgIHRpdGxlOiBcIlRhc2tzIENsb3NlZCBQZXIgVGVhbSBQZXIgRGF5XCIsXG4gICAgICAgICAgICBsZWZ0OiBbbmV3IGNsb3Vkd2F0Y2guTWF0aEV4cHJlc3Npb24oe1xuICAgICAgICAgICAgICBleHByZXNzaW9uOiAnU0VBUkNIKFxcJ3tNaW5pSmlyYSwgVGVhbX0gTWV0cmljTmFtZT1cIlRhc2tzQ2xvc2VkXCJcXCcsIFxcJ1N1bVxcJywgODY0MDApJyxcbiAgICAgICAgICAgICAgbGFiZWw6IFwiXCIsXG4gICAgICAgICAgICB9KV0sXG4gICAgICAgICAgICBzdGFja2VkOiB0cnVlLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgICBbXG4gICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xuICAgICAgICAgICAgdGl0bGU6IFwiQXZlcmFnZSBUaW1lIHRvIENsb3NlXCIsXG4gICAgICAgICAgICBsZWZ0OiBbbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICAgICAgbmFtZXNwYWNlOiBcIk1pbmlKaXJhXCIsIG1ldHJpY05hbWU6IFwiVGltZVRvQ2xvc2VcIixcbiAgICAgICAgICAgICAgc3RhdGlzdGljOiBcIkF2ZXJhZ2VcIiwgcGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxKSxcbiAgICAgICAgICAgIH0pXSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XG4gICAgICAgICAgICB0aXRsZTogXCJFQzIgQ1BVIFV0aWxpemF0aW9uXCIsXG4gICAgICAgICAgICBsZWZ0OiBbbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICAgICAgbmFtZXNwYWNlOiBcIkFXUy9FQzJcIiwgbWV0cmljTmFtZTogXCJDUFVVdGlsaXphdGlvblwiLFxuICAgICAgICAgICAgICBzdGF0aXN0aWM6IFwiQXZlcmFnZVwiLCBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICAgICAgfSldLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgICBbXG4gICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xuICAgICAgICAgICAgdGl0bGU6IFwiT3ZlcmR1ZSBUYXNrc1wiLFxuICAgICAgICAgICAgbGVmdDogW25ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICAgIG5hbWVzcGFjZTogXCJNaW5pSmlyYVwiLCBtZXRyaWNOYW1lOiBcIk92ZXJkdWVUYXNrc1wiLFxuICAgICAgICAgICAgICBzdGF0aXN0aWM6IFwiTWF4aW11bVwiLCBwZXJpb2Q6IGNkay5EdXJhdGlvbi5ob3VycygxKSxcbiAgICAgICAgICAgIH0pXSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyDilIDilIDilIAgQWxhcm1zIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgIGNvbnN0IGhpZ2hDcHVBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIFwiSGlnaENwdUFsYXJtXCIsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7cHJvamVjdH0taGlnaC1jcHVgLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6IFwiQVdTL0VDMlwiLCBtZXRyaWNOYW1lOiBcIkNQVVV0aWxpemF0aW9uXCIsXG4gICAgICAgIHN0YXRpc3RpYzogXCJBdmVyYWdlXCIsIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogODAsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX1RIUkVTSE9MRCxcbiAgICB9KTtcbiAgICBoaWdoQ3B1QWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhc3NpZ25tZW50c1RvcGljKSk7XG5cbiAgICBjb25zdCBvdmVyZHVlQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBcIk92ZXJkdWVUYXNrc0FsYXJtXCIsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7cHJvamVjdH0tb3ZlcmR1ZS10YXNrc2AsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogXCJNaW5pSmlyYVwiLCBtZXRyaWNOYW1lOiBcIk92ZXJkdWVUYXNrc1wiLFxuICAgICAgICBzdGF0aXN0aWM6IFwiTWF4aW11bVwiLCBwZXJpb2Q6IGNkay5EdXJhdGlvbi5ob3VycygxKSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxMCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fVEhSRVNIT0xELFxuICAgIH0pO1xuICAgIG92ZXJkdWVBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKGFzc2lnbm1lbnRzVG9waWMpKTtcblxuICAgIC8vIOKUgOKUgOKUgCBPdXRwdXRzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiRnJvbnRlbmRVcmxcIiwge1xuICAgICAgZGVzY3JpcHRpb246IFwiQ2xvdWRGcm9udCBVUkwgZm9yIHRoZSBmcm9udGVuZFwiLFxuICAgICAgdmFsdWU6IGBodHRwczovLyR7Y2xvdWRmcm9udERpc3QuZGlzdHJpYnV0aW9uRG9tYWluTmFtZX1gLFxuICAgIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiQXBpVXJsXCIsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkFMQiBETlMgbmFtZSBmb3IgQVBJIGNhbGxzXCIsXG4gICAgICB2YWx1ZTogYGh0dHA6Ly8ke2FsYi5sb2FkQmFsYW5jZXJEbnNOYW1lfWAsXG4gICAgfSk7XG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJDb2duaXRvRG9tYWluXCIsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkNvZ25pdG8gSG9zdGVkIFVJIGRvbWFpblwiLFxuICAgICAgdmFsdWU6IGBodHRwczovLyR7dXNlclBvb2xEb21haW4uZG9tYWluTmFtZX0uYXV0aC4ke3JlZ2lvbn0uYW1hem9uY29nbml0by5jb21gLFxuICAgIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVXNlclBvb2xJZFwiLCB7XG4gICAgICBkZXNjcmlwdGlvbjogXCJDb2duaXRvIFVzZXIgUG9vbCBJRFwiLFxuICAgICAgdmFsdWU6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgfSk7XG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJDbGllbnRJZFwiLCB7XG4gICAgICBkZXNjcmlwdGlvbjogXCJDb2duaXRvIEFwcCBDbGllbnQgSURcIixcbiAgICAgIHZhbHVlOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgIH0pO1xuICB9XG59XG4iXX0=