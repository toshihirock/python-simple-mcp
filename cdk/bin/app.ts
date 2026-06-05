#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AgentCoreStack } from '../lib/agentcore-stack';
import { VpcStack } from '../lib/vpc-stack';
import { EcsStack } from '../lib/ecs-stack';
import { EcsApiKeyStack } from '../lib/ecs-apikey-stack';
import { GatewayStack } from '../lib/gateway-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// Shared VPC (used by ECS stacks and optionally by AgentCore)
const vpcStack = new VpcStack(app, 'McpVpcStack', { env });

// AgentCore Runtime (PUBLIC by default, VPC with -c agentCoreVpc=true)
const agentCoreVpc = app.node.tryGetContext('agentCoreVpc') === 'true';
new AgentCoreStack(app, 'PythonSimpleMcpStack', {
  env,
  ...(agentCoreVpc ? { vpc: vpcStack.vpc } : {}),
});

// ECS deployment (VPC + ALB + Fargate)
const publicAlb = app.node.tryGetContext('publicAlb') !== 'false';
new EcsStack(app, 'McpEcsStack', { env, vpc: vpcStack.vpc, publicLoadBalancer: publicAlb });

// ECS deployment with API Key auth (API Gateway + VPC Link + internal ALB + Fargate)
new EcsApiKeyStack(app, 'McpEcsApiKeyStack', { env, vpc: vpcStack.vpc });

// AgentCore Gateway (SigV4/IAM) + Lambda
new GatewayStack(app, 'McpGatewayStack', { env });
