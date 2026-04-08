import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { Construct } from 'constructs';

export interface EcsApiKeyStackProps extends cdk.StackProps {
  readonly vpc: ec2.IVpc;
}

export class EcsApiKeyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsApiKeyStackProps) {
    super(scope, id, props);

    const cluster = new ecs.Cluster(this, 'McpCluster', { vpc: props.vpc });

    // Fargate task
    const taskDef = new ecs.FargateTaskDefinition(this, 'McpTaskDef', {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    taskDef.addContainer('mcp', {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, '..', '..'), {
        platform: Platform.LINUX_ARM64,
      }),
      portMappings: [{ containerPort: 80 }],
      environment: { MCP_PORT: '80' },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'mcp' }),
    });

    const fargateService = new ecs.FargateService(this, 'McpFargateService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
    });

    // Allow NLB health checks and traffic from VPC
    fargateService.connections.allowFromAnyIpv4(ec2.Port.tcp(80));

    // NLB (internal) for API Gateway VPC Link
    const nlb = new elb.NetworkLoadBalancer(this, 'McpNlb', {
      vpc: props.vpc,
      internetFacing: false,
    });

    const listener = nlb.addListener('McpListener', { port: 80 });
    listener.addTargets('McpTargets', {
      port: 80,
      targets: [fargateService],
      healthCheck: {
        path: '/healthz',
        protocol: elb.Protocol.HTTP,
        interval: cdk.Duration.seconds(30),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
      },
    });

    // --- API Gateway (REST API) with API Key auth ---

    const vpcLink = new apigw.VpcLink(this, 'McpVpcLink', {
      targets: [nlb],
    });

    const apiLogGroup = new logs.LogGroup(this, 'ApiGatewayAccessLog', {
      logGroupName: '/aws/apigateway/mcp-server-access',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const api = new apigw.RestApi(this, 'McpApi', {
      restApiName: 'mcp-server-api',
      description: 'API Gateway for MCP Server with API Key auth',
      deployOptions: {
        stageName: 'prod',
        accessLogDestination: new apigw.LogGroupLogDestination(apiLogGroup),
        accessLogFormat: apigw.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
        loggingLevel: apigw.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
    });

    const integration = new apigw.Integration({
      type: apigw.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'ANY',
      uri: `http://${nlb.loadBalancerDnsName}/{proxy}`,
      options: {
        connectionType: apigw.ConnectionType.VPC_LINK,
        vpcLink,
        requestParameters: {
          'integration.request.path.proxy': 'method.request.path.proxy',
        },
      },
    });

    const proxyResource = api.root.addProxy({
      anyMethod: false,
      defaultIntegration: integration,
    });

    proxyResource.addMethod('ANY', integration, {
      apiKeyRequired: true,
      requestParameters: {
        'method.request.path.proxy': true,
      },
    });

    // API Key + Usage Plan
    const apiKey = api.addApiKey('McpApiKey', {
      apiKeyName: 'mcp-server-key',
    });

    const usagePlan = api.addUsagePlan('McpUsagePlan', {
      name: 'mcp-server-plan',
      throttle: { rateLimit: 100, burstLimit: 200 },
    });

    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({ stage: api.deploymentStage });

    // --- Outputs ---
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'API Gateway Endpoint',
    });

    new cdk.CfnOutput(this, 'McpEndpoint', {
      value: `${api.url}mcp`,
      description: 'MCP Server Endpoint (via API Gateway)',
    });

    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'API Key ID (retrieve value with: aws apigateway get-api-key --api-key <ID> --include-value)',
    });
  }
}
