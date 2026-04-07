#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AgentCoreStack } from '../lib/agentcore-stack';
import { VpcStack } from '../lib/vpc-stack';
import { EcsStack } from '../lib/ecs-stack';

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
