import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
const cw = new CloudWatchClient({ region: process.env.AWS_REGION });
export async function putMetric(metricName, value, dimensions) {
    try {
        await cw.send(new PutMetricDataCommand({
            Namespace: 'MiniJira',
            MetricData: [{
                    MetricName: metricName,
                    Value: value,
                    Unit: 'Count',
                    Dimensions: dimensions,
                    Timestamp: new Date(),
                }],
        }));
    }
    catch (e) {
        console.error('CloudWatch metric error:', e);
    }
}
//# sourceMappingURL=cloudwatch.js.map