import {
  GraphQLFieldResolver,
  GraphQLInputType,
  GraphQLInterfaceType,
  GraphQLIsTypeOfFn,
  GraphQLOutputType,
  GraphQLScalarType,
  GraphQLTypeResolver, ValueNode
} from 'graphql';

import { Hash } from './util/hash';

export type OutputType = (() => Function) | GraphQLOutputType | string | Object;
export type InputType = (() => Function) | GraphQLInputType | string | Object;

/**
 * @hidden
 */
export type ResolverInfo = {
  type: FieldInfo|OutputType;
  config: Partial<{
    args: Hash<ArgumentInfo>;
    resolve: GraphQLFieldResolver<any, any>;
    subscribe: GraphQLFieldResolver<any, any>;
    deprecationReason: string;
    description: string;
  }>;
}

/**
 * @hidden
 */
export type TypeInfo = {
  kind: 'interface' | 'type' | 'input' | 'scalar';
  target: Function;
  scalar?: GraphQLScalarType;
  description?: string;
  interfaces?: () => (GraphQLInterfaceType|Function|string)[];
  isTypeOf?: GraphQLIsTypeOfFn<any, any>;
  resolveType?: GraphQLTypeResolver<any, any>;
  fields: Hash<FieldInfo>;
  queries: Hash<ResolverInfo>;
  mutations: Hash<ResolverInfo>;
  subscriptions: Hash<ResolverInfo>;
}

export type ArgumentInfo = {
  type: InputType;
  defaultValue?: any;
  description?: string;
}

export type FieldInfo = {
  type: OutputType;
  args?: Hash<ArgumentInfo>;
  resolver?: GraphQLFieldResolver<any, any>;
  description?: string;
  list?: boolean;
  nonNull?: boolean;
  nonNullItems?: boolean;
}

export type EnumValueInfo = {
  description?: string;
  deprecationReason?: string;
  value: string | number;
}

/**
 * @hidden
 */
export type EnumInfo = {
  name: string;
  description?: string;
  target: Object;
  values: Hash<EnumValueInfo>;
}

export type ResolverArguments = {
  returnType: FieldInfo | InputType;
  description?: string;
  args?: Hash<ArgumentInfo>
}

export type SubscriptionArguments<R extends GraphQLFieldResolver<any, any>> = ResolverArguments & {
  subscribe: R;
}

export type ScalarArguments = {
  description?: string;
  serialize(value: any): any;
  parseValue?(value: any): any;
  parseLiteral?(valueNode: ValueNode): any;
};

export type InterfaceArguments<R extends GraphQLTypeResolver<any, any>> = {
  description?: string;
  interfaces?: () => any[];
  resolveType?: R;
};

export type TypeArguments<R extends GraphQLIsTypeOfFn<any, any>> = {
  description?: string;
  interfaces?: () => (GraphQLInterfaceType | Function | string)[];
  isTypeOf?: R;
};

export type InputArguments = {
  description?: string;
};

export type EnumDecorationArguments = {
  name: string;
  description?: string;
  values?: Hash<Partial<EnumValueInfo>>
};

export type FieldArguments = { args?: Hash<ArgumentInfo> };
