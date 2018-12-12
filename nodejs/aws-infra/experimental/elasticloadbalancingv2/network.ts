// Copyright 2016-2018, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// tslint:disable:max-line-length

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import * as mod from ".";
import * as x from "..";
import { Network } from "./../../network";

import * as utils from "./../../utils";

export class NetworkLoadBalancer extends mod.LoadBalancer {
    public readonly listeners: NetworkListener[];
    public readonly targetGroups: NetworkTargetGroup[];

    constructor(name: string, args: NetworkLoadBalancerArgs = {}, opts?: pulumi.ComponentResourceOptions) {
        const argsCopy: x.elasticloadbalancingv2.LoadBalancerArgs = {
            ...args,
            loadBalancerType: "network",
        };

        super("awsinfra:x:elasticloadbalancingv2:NetworkLoadBalancer", name, argsCopy, opts);

        this.listeners = [];
        this.targetGroups = [];

        this.registerOutputs({
            instance: this.instance,
            network: this.network,
        });
    }

    public createListener(name: string, args: NetworkListenerArgs, opts?: pulumi.ComponentResourceOptions) {
        return new NetworkListener(name, this, args, opts);
    }

    public createTargetGroup(name: string, args: NetworkTargetGroupArgs, opts?: pulumi.ComponentResourceOptions) {
        return new NetworkTargetGroup(name, this, args, opts);
    }
}

export class NetworkTargetGroup extends mod.TargetGroup {
    public readonly loadBalancer: NetworkLoadBalancer;

    public readonly listeners: x.elasticloadbalancingv2.NetworkListener[];

    constructor(name: string, loadBalancer: NetworkLoadBalancer,
                args: NetworkTargetGroupArgs, opts?: pulumi.ComponentResourceOptions) {
        super("awsinfra:x:elasticloadbalancingv2:NetworkTargetGroup", name, {
            ...args,
            network: loadBalancer.network,
            protocol: "TCP",
        }, opts || { parent: loadBalancer });

        this.loadBalancer = loadBalancer;

        this.registerOutputs({
            instance: this.instance,
            network: this.network,
            loadBalancer: this.loadBalancer,
        });

        loadBalancer.targetGroups.push(this);
    }

    public createListener(name: string, args: NetworkListenerArgs,
                          opts?: pulumi.ComponentResourceOptions): NetworkListener {
        return new NetworkListener(name, this.loadBalancer, {
            defaultAction: this,
            ...args,
        }, opts || { parent: this });
    }
}

export class NetworkListener extends mod.Listener {
    public readonly loadBalancer: NetworkLoadBalancer;
    public readonly defaultTargetGroup?: x.elasticloadbalancingv2.NetworkTargetGroup;

    constructor(name: string,
                loadBalancer: NetworkLoadBalancer,
                args: NetworkListenerArgs,
                opts?: pulumi.ComponentResourceOptions) {
        const { defaultAction, targetGroup } = getDefaultAction(name, loadBalancer, args, opts);

        super("awsinfra:x:elasticloadbalancingv2:NetworkListener", name, targetGroup, {
            ...args,
            defaultAction,
            loadBalancer,
            protocol: "TCP",
        }, opts || { parent: loadBalancer });

        this.loadBalancer = loadBalancer;
        loadBalancer.listeners.push(this);

        this.registerOutputs({
            instance: this.instance,
            loadBalancer: this.loadBalancer,
        });
    }
}

function getDefaultAction(
        name: string,
        loadBalancer: NetworkLoadBalancer,
        args: NetworkListenerArgs,
        opts: pulumi.ComponentResourceOptions | undefined) {
    if (args.defaultAction) {
        const listenerAction = <x.elasticloadbalancingv2.ListenerDefaultAction>args.defaultAction;
        const defaultAction = listenerAction.listenerDefaultAction
            ? listenerAction.listenerDefaultAction()
            : <aws.elasticloadbalancingv2.ListenerArgs["defaultAction"]>args.defaultAction;

        const targetGroup = x.elasticloadbalancingv2.TargetGroup.isTargetGroup(listenerAction) ? listenerAction : undefined;
        return { defaultAction, targetGroup };
    }

    const targetGroup = new NetworkTargetGroup(name, loadBalancer, { port: args.port }, opts);
    return { defaultAction: targetGroup.listenerDefaultAction(), targetGroup };
}

export interface NetworkLoadBalancerArgs {
    // Properties from LoadBalancerArgs

    /**
     * The network this load balancer will be used with.  Defaults to `[Network.getDefault]` if
     * unspecified.
     */
    network?: Network;

    /**
     * Whether or not the load balancer is exposed to the internet. Defaults to `false` if
     * unspecified.
     */
    external?: boolean;

    /**
     * If true, deletion of the load balancer will be disabled via the AWS API. This will prevent
     * Terraform from deleting the load balancer. Defaults to `false`.
     */
    enableDeletionProtection?: pulumi.Input<boolean>;

    /**
     * The type of IP addresses used by the subnets for your load balancer. The possible values are
     * `ipv4` and `dualstack`
     */
    ipAddressType?: pulumi.Input<"ipv4" | "dualstack">;

    /**
     * A subnet mapping block as documented below.
     */
    subnetMappings?: aws.elasticloadbalancingv2.LoadBalancerArgs["subnetMappings"];

    /**
     * A list of subnet IDs to attach to the LB. Subnets cannot be updated for Load Balancers of
     * type `network`. Changing this value for load balancers of type `network` will force a
     * recreation of the resource.
     */
    subnets?: pulumi.Input<pulumi.Input<string>[]> | x.elasticloadbalancingv2.LoadBalancerSubnets;

    /**
     * A mapping of tags to assign to the resource.
     */
    tags?: pulumi.Input<aws.Tags>;

    // Properties added here.

    /**
     * If true, cross-zone load balancing of the load balancer will be enabled.  Defaults to `false`.
     */
    enableCrossZoneLoadBalancing?: pulumi.Input<boolean>;
}

export interface NetworkTargetGroupArgs {
    // Copied from TargetGroupArgs.

    /**
     * The port to use to connect with the target. Valid values are either ports 1-65536, or
     * `traffic-port`. Defaults to `traffic-port`.
     */
    port: pulumi.Input<number>;

    /**
     * The amount time for Elastic Load Balancing to wait before changing the state of a
     * deregistering target from draining to unused. The range is 0-3600 seconds. The default value
     * is 300 seconds.
     */
    deregistrationDelay?: pulumi.Input<number>;

    /**
     * A Health Check block. Health Check blocks are documented below.
     */
    healthCheck?: aws.elasticloadbalancingv2.TargetGroupArgs["healthCheck"];

    /**
     * Boolean to enable / disable support for proxy protocol v2 on Network Load Balancers. See
     * [doc](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-target-groups.html#proxy-protocol)
     * for more information.
     */
    proxyProtocolV2?: pulumi.Input<boolean>;

    /**
     * The amount time for targets to warm up before the load balancer sends them a full share of
     * requests. The range is 30-900 seconds or 0 to disable. The default value is 0 seconds.
     */
    slowStart?: pulumi.Input<number>;

    /**
     * A Stickiness block. Stickiness blocks are documented below. `stickiness` is only valid if
     * used with Load Balancers of type `Application`
     */
    stickiness?: aws.elasticloadbalancingv2.TargetGroupArgs["stickiness"];

    /**
     * A mapping of tags to assign to the resource.
     */
    tags?: pulumi.Input<aws.Tags>;

    /**
     * The type of target that you must specify when registering targets with this target group. The
     * possible values are `instance` (targets are specified by instance ID) or `ip` (targets are
     * specified by IP address). The default is `ip`.
     *
     * Note that you can't specify targets for a target group using both instance IDs and IP
     * addresses. If the target type is `ip`, specify IP addresses from the subnets of the virtual
     * private cloud (VPC) for the target group, the RFC 1918 range (10.0.0.0/8, 172.16.0.0/12, and
     * 192.168.0.0/16), and the RFC 6598 range (100.64.0.0/10). You can't specify publicly routable
     * IP addresses.
     */
    targetType?: pulumi.Input<"instance" | "ip">;
}

export interface NetworkListenerArgs {
    /**
     * The port. Specify a value from `1` to `65535`.
     */
    port: pulumi.Input<number>;

    /**
     * An Action block. Action blocks are documented below.  If not provided, a suitable
     * defaultAction will be chosen that forwards to a new [NetworkTargetGroup] created from [port].
     */
    defaultAction?: aws.elasticloadbalancingv2.ListenerArgs["defaultAction"] | x.elasticloadbalancingv2.ListenerDefaultAction;
}