import {
  GraphQLEnumType,
  GraphQLFieldConfigMap,
  GraphQLFieldResolver,
  GraphQLInputObjectType,
  GraphQLInputType,
  GraphQLInterfaceType,
  GraphQLIsTypeOfFn,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLTypeResolver
} from 'graphql';
import {
  ArgumentInfo,
  EnumDecorationArguments,
  EnumInfo,
  FieldArguments,
  FieldInfo,
  InputArguments,
  InputType,
  InterfaceArguments,
  OutputType,
  ResolverArguments,
  ScalarArguments,
  SubscriptionArguments,
  TypeArguments,
  TypeInfo
} from './types';
import { Hash } from './util/hash';
import { getInheritanceTree } from './util/tree';

export interface ISchemaBuilder {
  /**
   * Attach a description to a field.
   * @param {string} text
   * @returns {PropertyDecorator}
   */
  description(text: string): PropertyDecorator;

  /**
   * Declare a class property as a GraphQL field.
   * @param {OutputType} type
   * @param {FieldArguments?} args
   * @returns {PropertyDecorator}
   */
  field(type: OutputType | InputType, args?: FieldArguments): PropertyDecorator;

  /**
   * Attach a custom `resolver` to a GraphQL field.
   * @param {R} resolver
   * @returns {PropertyDecorator}
   */
  resolve<R extends GraphQLFieldResolver<any, any>>(resolver: R): PropertyDecorator;

  /**
   * Declare a class property as a GraphQL list field.
   * @param {OutputType} type
   * @param {{args?: Hash<ArgumentInfo>}} args
   * @returns {PropertyDecorator}
   */
  list(type: OutputType, args?: { args?: Hash<ArgumentInfo> }): PropertyDecorator;

  /**
   * Declare a field to be non-null.
   * @returns {PropertyDecorator}
   */
  nonNull(): PropertyDecorator;

  /**
   * Declare a list to have non-null items.
   * @returns {PropertyDecorator}
   */
  nonNullItems(): PropertyDecorator;

  /**
   * Declare a TypeScript class to be a GraphQL interface.
   * @param {InterfaceArguments<R extends GraphQLTypeResolver<any, any>>} args
   * @returns {ClassDecorator}
   */
  interface<R extends GraphQLTypeResolver<any, any>>(args?: InterfaceArguments<R>): ClassDecorator;

  /**
   * Declare a TypeScript class to be a GraphQL type.
   * @param {TypeArguments<R extends GraphQLIsTypeOfFn<any, any>>} args
   * @returns {ClassDecorator}
   */
  type<R extends GraphQLIsTypeOfFn<any, any>>(args?: TypeArguments<R>): ClassDecorator;

  /**
   * Declare a TypeScript class to be a GraphQL input.
   * @param {{description?: string}} args
   * @returns {ClassDecorator}
   */
  input(args?: InputArguments): ClassDecorator;

  /**
   * Declare a static class method to be a query.
   * @param {ResolverArguments} args
   * @returns {MethodDecorator}
   */
  query(args: ResolverArguments): MethodDecorator;

  /**
   * Declare a static class method to be a mutation.
   * @param {ResolverArguments} args
   * @returns {MethodDecorator}
   */
  mutation(args: ResolverArguments): MethodDecorator;

  /**
   * Declare a static class method to be a subscription.
   * @param {SubscriptionArguments<R extends GraphQLFieldResolver<any, any>>} args
   * @returns {MethodDecorator}
   */
  subscription<R extends GraphQLFieldResolver<any, any>>(args: SubscriptionArguments<R>): MethodDecorator;

  /**
   * Declare a TypeScript enum to be a GraphQL enum.
   * @param {T} object
   * @param {EnumDecorationArguments} args
   */
  decorateEnum<T>(object: T, args: EnumDecorationArguments): void;

  /**
   * Declare a scalar type.
   * @param {ScalarArguments} args
   * @returns {ClassDecorator}
   */
  scalar(args: ScalarArguments): ClassDecorator;

  /**
   * Build the final executable schema from all the collected metadata.
   * @returns {GraphQLSchema}
   */
  build(): GraphQLSchema;
}

export class SchemaBuilder implements ISchemaBuilder {
  private _types: Hash<TypeInfo> = {};
  private _enums: Map<Object, EnumInfo> = new Map();

  protected findByClass(target: Function): TypeInfo | undefined {
    return Object.values(this._types).find(type => type.target === target);
  }

  protected getOrAddType(name: string): TypeInfo {
    return this._types[name] = this._types[name] || { name, fields: {}, queries: {}, mutations: {}, subscriptions: {} };
  }

  protected getOrAddField(typeName: string, name: string): FieldInfo {
    const type = this.getOrAddType(typeName);
    return type.fields[name] = type.fields[name] || { name };
  }

  protected getOrAddEnum(_enum: Object, name?: string): EnumInfo {
    if (!name || !name.trim().length) {
      throw new Error(`Invalid name specified for enum '${name}'`);
    }
    if (this._enums.has(_enum)) {
      return this._enums.get(_enum)!;
    }
    const values = Object.entries(_enum).map(([name, value]) => ({ [name]: { value } })).reduce((p, c) => ({ ...p, ...c }));
    const info = {
      name: name.trim(),
      target: _enum,
      values
    };
    this._enums.set(_enum, info);
    return info;
  }

  protected hasType(name: string) {
    return name in this._types;
  }

  protected hasEnum(_enum: Object) {
    return this._enums.has(_enum);
  }

  protected get types() {
    return this._types;
  }

  protected get enums() {
    return this._enums;
  }

  description(text: string): PropertyDecorator {
    const builder = this;
    return function <T>(object: T, propertyName: string | symbol) {
      builder.getOrAddField(object.constructor.name, propertyName.toString()).description = text;
    };
  }

  field(type: OutputType | InputType, args?: FieldArguments): PropertyDecorator {
    const builder = this;
    return function <T>(object: T, propertyName: string | symbol) {
      const target = builder.getOrAddType(object.constructor.name);
      builder.getOrAddField(object.constructor.name, propertyName.toString()).type = type;
      if (args && target.kind !== 'input') {
        builder.getOrAddField(object.constructor.name, propertyName.toString()).args = args.args;
      }
    };
  }

  resolve<R extends GraphQLFieldResolver<any, any>>(resolver: R): PropertyDecorator {
    const builder = this;
    return function <T>(object: T, propertyName: string | symbol) {
      builder.getOrAddField(object.constructor.name, propertyName.toString()).resolver = resolver;
    };
  }

  list(type: OutputType, args?: { args?: Hash<ArgumentInfo> }): PropertyDecorator {
    const builder = this;
    return function <T>(object: T, propertyName: string | symbol) {
      builder.getOrAddField(object.constructor.name, propertyName.toString()).type = type;
      builder.getOrAddField(object.constructor.name, propertyName.toString()).list = true;
      if (args) {
        builder.getOrAddField(object.constructor.name, propertyName.toString()).args = args.args;
      }
    };
  }

  nonNull(): PropertyDecorator {
    const builder = this;
    return function <T>(object: T, propertyName: string | symbol) {
      builder.getOrAddField(object.constructor.name, propertyName.toString()).nonNull = true;
    };
  }

  nonNullItems(): PropertyDecorator {
    const builder = this;
    return function <T>(object: T, propertyName: string | symbol) {
      builder.getOrAddField(object.constructor.name, propertyName.toString()).nonNullItems = true;
    };
  }

  interface<R extends GraphQLTypeResolver<any, any>>(args?: InterfaceArguments<R>): ClassDecorator {
    const builder = this;
    return function <T extends Function>(object: T) {
      const type = builder.getOrAddType(object.name);
      type.kind = 'interface';
      type.target = object;
      if (args) {
        type.description = args.description;
        type.interfaces = args.interfaces;
        type.resolveType = args.resolveType;
      }
    };
  }

  type<R extends GraphQLIsTypeOfFn<any, any>>(args?: TypeArguments<R>): ClassDecorator {
    const builder = this;
    return function <T extends Function>(object: T) {
      const type = builder.getOrAddType(object.name);
      type.kind = 'type';
      type.target = object;
      if (args) {
        type.description = args.description;
        type.interfaces = args.interfaces;
        type.isTypeOf = args.isTypeOf;
      }
    };
  }

  input(args?: InputArguments): ClassDecorator {
    const builder = this;
    return function <T extends Function>(object: T) {
      const type = builder.getOrAddType(object.name);
      type.kind = 'input';
      type.target = object;
      if (args) {
        type.description = args.description;
      }
    };
  }

  query(args: ResolverArguments): MethodDecorator {
    const builder = this;
    return function <T>(object: T, methodName: string | symbol, descriptor: PropertyDescriptor) {
      const type = builder.getOrAddType(object.constructor.name);
      type.queries[methodName.toString()] = {
        type: args.returnType,
        config: {
          description: args.description,
          args: args.args,
          resolve: descriptor.value
        }
      };
      return descriptor;
    };
  }

  mutation(args: ResolverArguments): MethodDecorator {
    const builder = this;
    return function <T>(object: T, methodName: string | symbol, descriptor: PropertyDescriptor) {
      const type = builder.getOrAddType(object.constructor.name);
      type.mutations[methodName.toString()] = {
        type: args.returnType,
        config: {
          description: args.description,
          args: args.args,
          resolve: descriptor.value
        }
      };
      return descriptor;
    };
  }

  subscription<R extends GraphQLFieldResolver<any, any>>(args: SubscriptionArguments<R>): MethodDecorator {
    const builder = this;
    return function <T>(object: T, methodName: string | symbol, descriptor: PropertyDescriptor) {
      const type = builder.getOrAddType(object.constructor.name);
      type.subscriptions[methodName.toString()] = {
        type: args.returnType,
        config: {
          description: args.description,
          args: args.args,
          resolve: descriptor.value,
          subscribe: args.subscribe
        }
      };
      return descriptor;
    };
  }

  decorateEnum<T>(object: T, args: EnumDecorationArguments) {
    const info = this.getOrAddEnum(object, args.name);
    info.description = args.description;
    if (args && args.values) {
      Object.entries(args.values).forEach(([name, value]) => {
        info.values[name] = info.values[name] || {};
        info.values[name].description = value.description;
        info.values[name].deprecationReason = value.deprecationReason;
      });
    }
  }

  scalar(args: ScalarArguments): ClassDecorator {
    const builder = this;
    return function <T extends Function>(object: T) {
      const scalar = builder.getOrAddType(object.name);
      scalar.kind = 'scalar';
      scalar.target = object;
      scalar.scalar = new GraphQLScalarType({
        name: object.name,
        description: args.description,
        serialize: args.serialize,
        parseValue: args.parseValue,
        parseLiteral: args.parseLiteral
      });
    };
  }

  build(): GraphQLSchema {
    const interfaces: Hash<GraphQLInterfaceType> = {};
    const objects: Hash<GraphQLObjectType> = {};
    const inputs: Hash<GraphQLInputType> = {};
    const enums: Hash<GraphQLEnumType> = {};
    const scalars: Hash<GraphQLScalarType> = {};
    const builder = this;

    builder.enums.forEach(e => {
      enums[e.name] = new GraphQLEnumType({
        name: e.name,
        description: e.description,
        values: Object.entries(e.values).map(([name, { value, description, deprecationReason }]) =>
          ({ [name]: { value, description, deprecationReason } }))
          .reduce((p, c) => ({ ...p, ...c }), {})
      });
    });

    function convertOutputType(type: OutputType): GraphQLOutputType {
      let name;
      if (typeof type === 'function') {
        name = type().name;
      }
      else if (typeof type === 'string') {
        name = type;
      } else if (builder.hasEnum(type)) {
        return enums[builder.enums.get(type)!.name];
      } else {
        return type as GraphQLOutputType;
      }
      if (enums[name]) {
        return enums[name];
      } else if (interfaces[name]) {
        return interfaces[name];
      } else if (scalars[name]) {
        return scalars[name];
      } else {
        if (!builder.hasType(name)) {
          throw new Error(`Type '${name}' not defined`);
        }
        return objects[name];
      }
    }

    function convertInputType(type: InputType): GraphQLInputType {
      let name;
      if (typeof type === 'function') {
        name = type().name;
      }
      else if (typeof type === 'string') {
        name = type;
      } else if (builder.hasEnum(type)) {
        name = builder.enums.get(type)!.name;
      } else {
        return type as GraphQLInputType;
      }
      if (enums[name]) {
        return enums[name];
      } else if (scalars[name]) {
        return scalars[name];
      } else {
        return inputs[name];
      }
    }

    function convertFieldInfoToType(fieldInfo: FieldInfo | InputType, converter: Function) {
      if (typeof fieldInfo === 'object' && 'type' in fieldInfo) {
        let type = converter(fieldInfo.type);
        if (fieldInfo.nonNullItems) {
          type = new GraphQLNonNull(type);
        }
        if (fieldInfo.list) {
          type = new GraphQLList(type);
        }
        if (fieldInfo.nonNull && !(type instanceof GraphQLNonNull)) {
          type = new GraphQLNonNull(type);
        }
        return type;
      }
      return converter(fieldInfo);
    }

    function convertArguments(args: Hash<ArgumentInfo>) {
      return Object.entries(args).map(([name, arg]) => ({
        [name]: {
          ...arg,
          type: convertInputType(arg.type)
        }
      })).reduce((p, n) => ({ ...p, ...n }), {});
    }

    Object.entries(builder.types).forEach(([name, info]) => {
      function getFields(converter: Function) {
        return function () {
          const parents = getInheritanceTree(info.target).reverse().map(c => builder.findByClass(c))
            .filter(parent => !!parent);
          let fields = Object.entries(parents.map(parent => parent!.fields)
            .reduce((p, c) => ({ ...p, ...c }), {}));
          return fields.map(([name, fieldInfo]) => {
            const type = convertFieldInfoToType(fieldInfo, converter);
            const result = {
              name,
              type,
              args: fieldInfo.args ? convertArguments(fieldInfo.args) : undefined,
              resolve: fieldInfo.resolver,
              description: fieldInfo.description!
            };
            if (info.kind === 'input') delete result.resolve;
            return { [name]: result };
          }).reduce((p, c) => ({ ...p, ...c }), {});
        };
      }

      switch (info.kind) {
        case 'scalar':
          scalars[name] = info.scalar!;
          break;
        case 'input':
          inputs[name] = new GraphQLInputObjectType({
            name,
            description: info.description,
            fields: getFields(convertInputType)
          });
          break;
        case 'interface':
          interfaces[name] = new GraphQLInterfaceType({
            name,
            description: info.description,
            resolveType: info.resolveType,
            fields: getFields(convertOutputType)
          });
          break;
        case 'type':
          objects[name] = new GraphQLObjectType({
            name,
            description: info.description,
            isTypeOf: info.isTypeOf,
            fields: getFields(convertOutputType),
            interfaces: () => {
              if (info.interfaces) {
                return info.interfaces()
                  .map(_interface => {
                    if (typeof _interface === 'string' && interfaces[_interface]) {
                      return interfaces[_interface];
                    } else if (typeof _interface === 'function' && interfaces[_interface.name]) {
                      return interfaces[_interface.name];
                    } else {
                      throw new Error(`Interface '${_interface}' not defined`);
                    }
                  });
              } else return [];
            }
          });
          break;
      }
    });
    const queries: GraphQLFieldConfigMap<any, any> = {};
    const mutations: GraphQLFieldConfigMap<any, any> = {};
    const subscriptions: GraphQLFieldConfigMap<any, any> = {};
    Object.entries(builder.types).forEach(([_name, info]) => {
      Object.entries(info.queries).forEach(([key, value]) => {
        queries[key] = {
          ...value.config,
          type: convertFieldInfoToType(value.type, convertOutputType),
          args: value.config.args ? convertArguments(value.config.args) : {}
        };
      });
      Object.entries(info.mutations).forEach(([key, value]) => {
        mutations[key] = {
          ...value.config,
          type: convertFieldInfoToType(value.type, convertOutputType),
          args: value.config.args ? convertArguments(value.config.args) : {}
        };
      });
      Object.entries(info.subscriptions).forEach(([key, value]) => {
        subscriptions[key] = {
          ...value.config,
          type: convertFieldInfoToType(value.type, convertOutputType),
          args: value.config.args ? convertArguments(value.config.args) : {}
        };
      });
    });
    const query = new GraphQLObjectType({
      name: 'Query',
      fields: () => queries
    });
    const mutation = Object.keys(mutations).length ? new GraphQLObjectType({
      name: 'Mutation',
      fields: () => mutations
    }) : null;
    const subscription = Object.keys(subscriptions).length ? new GraphQLObjectType({
      name: 'Subscriptions',
      fields: () => subscriptions
    }) : null;
    return new GraphQLSchema({
      query,
      mutation,
      subscription
    });
  }

}
