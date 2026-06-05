import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import {
  Gateway,
  GatewayAuthorizer,
  GatewayTarget,
  ToolSchema,
  SchemaDefinitionType,
} from '@aws-cdk/aws-bedrock-agentcore-alpha';
import { Construct } from 'constructs';

/**
 * AgentCore Gateway (SigV4/IAM) + Lambda stack
 * - Lambda function implementing add_numbers, multiply_numbers, greet_user
 * - AgentCore Gateway with IAM authentication
 * - Gateway Target connecting Lambda with tool schema
 */
export class GatewayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- Lambda Function ---
    const fn = new lambda.Function(this, 'McpToolsFunction', {
      functionName: 'mcp-gateway-tools',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'gateway-handler.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', 'lambda')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      description: 'MCP tools handler for AgentCore Gateway',
    });

    // --- AgentCore Gateway (IAM auth) ---
    const gateway = new Gateway(this, 'McpGateway', {
      gatewayName: 'python-simple-mcp-gateway',
      description: 'AgentCore Gateway for python-simple-mcp tools (SigV4 auth)',
      authorizerConfiguration: GatewayAuthorizer.usingAwsIam(),
    });

    // --- Gateway Target (Lambda) ---
    const target = gateway.addLambdaTarget('McpToolsTarget', {
      gatewayTargetName: 'mcp-tools',
      description: 'Lambda target with add_numbers, multiply_numbers, greet_user',
      lambdaFunction: fn,
      toolSchema: ToolSchema.fromInline([
        {
          name: 'add_numbers',
          description: 'Add two numbers together',
          inputSchema: {
            type: SchemaDefinitionType.OBJECT,
            properties: {
              a: { type: SchemaDefinitionType.INTEGER, description: 'First number' },
              b: { type: SchemaDefinitionType.INTEGER, description: 'Second number' },
            },
            required: ['a', 'b'],
          },
        },
        {
          name: 'multiply_numbers',
          description: 'Multiply two numbers together',
          inputSchema: {
            type: SchemaDefinitionType.OBJECT,
            properties: {
              a: { type: SchemaDefinitionType.INTEGER, description: 'First number' },
              b: { type: SchemaDefinitionType.INTEGER, description: 'Second number' },
            },
            required: ['a', 'b'],
          },
        },
        {
          name: 'greet_user',
          description: 'Greet a user by name',
          inputSchema: {
            type: SchemaDefinitionType.OBJECT,
            properties: {
              name: { type: SchemaDefinitionType.STRING, description: 'The name of the user to greet' },
            },
            required: ['name'],
          },
        },
      ]),
    });

    // --- IAM Role for DevOps Agent (SigV4) ---
    const devopsAgentRole = new iam.Role(this, 'DevOpsAgentGatewayRole', {
      roleName: 'mcp-gateway-devops-agent-role',
      assumedBy: new iam.ServicePrincipal('aidevops.amazonaws.com', {
        conditions: {
          StringEquals: {
            'aws:SourceAccount': this.account,
          },
          ArnLike: {
            'aws:SourceArn': `arn:aws:aidevops:${this.region}:${this.account}:service/*`,
          },
        },
      }),
      description: 'IAM Role for DevOps Agent to invoke AgentCore Gateway via SigV4',
    });

    devopsAgentRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock-agentcore:InvokeGateway'],
      resources: [gateway.gatewayArn],
    }));

    // --- Outputs ---
    new cdk.CfnOutput(this, 'GatewayId', {
      value: gateway.gatewayId,
      description: 'AgentCore Gateway ID',
    });

    new cdk.CfnOutput(this, 'GatewayArn', {
      value: gateway.gatewayArn,
      description: 'AgentCore Gateway ARN',
    });

    new cdk.CfnOutput(this, 'GatewayEndpoint', {
      value: `https://${gateway.gatewayId}.gateway.bedrock-agentcore.${this.region}.amazonaws.com/mcp`,
      description: 'Gateway MCP Endpoint URL',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionArn', {
      value: fn.functionArn,
      description: 'Lambda function ARN',
    });

    new cdk.CfnOutput(this, 'DevOpsAgentRoleArn', {
      value: devopsAgentRole.roleArn,
      description: 'IAM Role ARN for DevOps Agent SigV4 authentication',
    });
  }
}
