#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AgentCoreStack } from '../lib/agentcore-stack';
import { VpcStack } from '../lib/vpc-stack';
import { EcsStack } from '../lib/ecs-stack';
import { EcsApiKeyStack } from '../lib/ecs-apikey-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// AgentCore Runtime (standalone)
new AgentCoreStack(app, 'PythonSimpleMcpStack', { env });

// ECS deployment (VPC + ALB + Fargate)
const vpcStack = new VpcStack(app, 'McpVpcStack', { env });
new EcsStack(app, 'McpEcsStack', { env, vpc: vpcStack.vpc });

// ECS deployment with API Key auth (API Gateway + VPC Link + internal ALB + Fargate)
new EcsApiKeyStack(app, 'McpEcsApiKeyStack', { env, vpc: vpcStack.vpc });
