import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { Construct } from 'constructs';

export interface EcsStackProps extends cdk.StackProps {
  readonly vpc: ec2.IVpc;
  readonly publicLoadBalancer?: boolean;
}

export class EcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    const isPublic = props.publicLoadBalancer ?? true;
    const cluster = new ecs.Cluster(this, 'McpCluster', {
      vpc: props.vpc,
    });

    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'McpService', {
      cluster,
      cpu: 256,
      memoryLimitMiB: 512,
      desiredCount: 1,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset(path.join(__dirname, '..', '..'), {
          platform: Platform.LINUX_ARM64,
        }),
        containerPort: 80,
        environment: {
          MCP_PORT: '80',
        },
      },
      publicLoadBalancer: isPublic,
      listenerPort: 80,
    });

    service.targetGroup.configureHealthCheck({
      path: '/healthz',
      healthyHttpCodes: '200',
    });

    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: service.loadBalancer.loadBalancerDnsName,
      description: 'ALB DNS Name',
    });

    new cdk.CfnOutput(this, 'McpEndpoint', {
      value: `http://${service.loadBalancer.loadBalancerDnsName}/mcp`,
      description: 'MCP Server Endpoint',
    });
  }
}
