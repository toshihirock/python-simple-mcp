import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';
import {
  Runtime,
  AgentRuntimeArtifact,
  ProtocolType,
  RuntimeAuthorizerConfiguration,
} from '@aws-cdk/aws-bedrock-agentcore-alpha';
import { Construct } from 'constructs';

/**
 * AgentCore Runtime + Cognito JWT authentication stack
 * - Cognito User Pool with Client Credentials flow
 * - AgentCore Runtime running python-simple-mcp container
 */
export class AgentCoreStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- Cognito User Pool ---
    const userPool = new cognito.UserPool(this, 'McpUserPool', {
      selfSignUpEnabled: false,
      userPoolName: `python-simple-mcp-pool-${cdk.Aws.ACCOUNT_ID}`,
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
    });

    const domain = userPool.addDomain('McpDomain', {
      cognitoDomain: {
        domainPrefix: `python-simple-mcp-${cdk.Aws.ACCOUNT_ID}`,
      },
    });

    const resourceServer = userPool.addResourceServer('McpResourceServer', {
      identifier: 'mcp-api',
      scopes: [{ scopeName: 'access', scopeDescription: 'MCP API access' }],
    });

    const client = userPool.addClient('McpClient', {
      generateSecret: true,
      oAuth: {
        flows: { clientCredentials: true },
        scopes: [
          cognito.OAuthScope.resourceServer(resourceServer, {
            scopeName: 'access',
            scopeDescription: 'MCP API access',
          }),
        ],
      },
    });

    // --- AgentCore Runtime ---
    const runtime = new Runtime(this, 'McpRuntime', {
      runtimeName: 'python_simple_mcp',
      description: 'Python Simple MCP Server on AgentCore Runtime',
      protocolConfiguration: ProtocolType.MCP,
      authorizerConfiguration: RuntimeAuthorizerConfiguration.usingCognito(
        userPool,
        [client],
        undefined,
        ['mcp-api/access'],
      ),
      agentRuntimeArtifact: AgentRuntimeArtifact.fromAsset(
        path.join(__dirname, '..', '..'),
      ),
    });

    // --- CloudWatch Logs ---
    const logGroup = new logs.LogGroup(this, 'RuntimeLogGroup', {
      logGroupName: `/aws/bedrock-agentcore/runtime/${runtime.agentRuntimeId}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const deliverySource = new cdk.CfnResource(this, 'LogDeliverySource', {
      type: 'AWS::Logs::DeliverySource',
      properties: {
        Name: 'python-simple-mcp-logs',
        LogType: 'APPLICATION_LOGS',
        ResourceArn: runtime.agentRuntimeArn,
      },
    });

    const deliveryDestination = new cdk.CfnResource(this, 'LogDeliveryDestination', {
      type: 'AWS::Logs::DeliveryDestination',
      properties: {
        Name: 'python-simple-mcp-cwl-dest',
        DestinationResourceArn: logGroup.logGroupArn,
      },
    });

    const delivery = new cdk.CfnResource(this, 'LogDelivery', {
      type: 'AWS::Logs::Delivery',
      properties: {
        DeliverySourceName: 'python-simple-mcp-logs',
        DeliveryDestinationArn: deliveryDestination.getAtt('Arn').toString(),
      },
    });
    delivery.addDependency(deliverySource);
    delivery.addDependency(deliveryDestination);

    // --- Outputs ---
    new cdk.CfnOutput(this, 'RuntimeId', {
      value: runtime.agentRuntimeId,
      description: 'AgentCore Runtime ID',
    });

    new cdk.CfnOutput(this, 'RuntimeArn', {
      value: runtime.agentRuntimeArn,
      description: 'AgentCore Runtime ARN',
    });

    new cdk.CfnOutput(this, 'CognitoUserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'CognitoClientId', {
      value: client.userPoolClientId,
      description: 'Cognito App Client ID',
    });

    new cdk.CfnOutput(this, 'CognitoTokenEndpoint', {
      value: `https://${domain.domainName}.auth.${this.region}.amazoncognito.com/oauth2/token`,
      description: 'Cognito Token Endpoint URL',
    });
  }
}
