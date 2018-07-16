import {
  ExecutionResult,
  GraphQLBoolean,
  GraphQLID,
  GraphQLInt, GraphQLNonNull,
  GraphQLSchema,
  GraphQLString,
  graphqlSync,
  Kind,
  parse,
  subscribe
} from 'graphql';
import { PubSub } from 'graphql-subscriptions';
import { SchemaBuilder } from '../src';

/**
 * SchemaBuilder test
 */
describe('SchemaBuilder test', () => {

  it('SchemaBuilder is instantiable', () => {
    expect(new SchemaBuilder()).toBeInstanceOf(SchemaBuilder);
  });

  it('schema generation', () => {
    const builder = new SchemaBuilder();
    expect(builder.build()).toBeInstanceOf(GraphQLSchema);
  });

  it('query definition', () => {
    const builder = new SchemaBuilder();

    class MyType {
      @builder.query({ returnType: GraphQLBoolean })
      static myQuery() {
        return;
      }
    }

    const schema = builder.build();
    const query = `{
      __schema {
        queryType {
          fields {
            name
          }
        }
      }
    }`;
    const expected = [{ name: 'myQuery' }];
    const result = graphqlSync(schema, query);
    expect(result).toHaveProperty('data.__schema.queryType.fields', expected);
  });

  it('type definition', () => {
    const builder = new SchemaBuilder();

    @builder.type({ description: 'My type!' })
    class MyType {
      @builder.field(GraphQLString)
      field: string;

      @builder.field(GraphQLString, { args: { arg1: { type: GraphQLString } } })
      fieldWithArguments: string;

      @builder.query({ returnType: { type: () => MyType } })
      static myQuery() {
        return;
      }
    }

    const schema = builder.build();
    const query = `{
      __type(name: "MyType") {
        name
        description
      }
    }`;
    const expected = { description: 'My type!', name: 'MyType' };
    const result = graphqlSync(schema, query);
    expect(result).toHaveProperty('data.__type', expected);
  });

  it('custom field resolver', () => {
    const builder = new SchemaBuilder();

    enum Case {
      Default = 'Default',
      Lower = 'Lower',
      Upper = 'Upper'
    }

    builder.decorateEnum(Case, {
      name: 'Case'
    });

    @builder.type({ description: 'My type!' })
    class MyType {

      @builder.description('This field has a basic resolver with fixed transform to upper-case.')
      @builder.field(GraphQLString)
      @builder.resolve(value => value.field.toUpperCase()) // transform `field` to uppercase
      field: string;

      @builder.description('This field\'s resolver accepts an argument for case transformation ' +
        'and a default mode.')
      @builder.field(GraphQLString, { args: { 'case': { type: Case, defaultValue: Case.Default } } })
      @builder.resolve((value: MyType, args) =>
        args.case === Case.Upper ? value.withCase.toUpperCase() :
          (args.case === Case.Lower ? value.withCase.toLowerCase() : value.withCase))
      withCase: string;

      @builder.query({ returnType: { type: () => MyType } })
      static myQuery() {
        return {
          field: 'This string will be turned to upper case.',
          withCase: 'iT\'s A bEaUtIfUl DaY!'
        };
      }
    }

    const schema = builder.build();

    const query = `{
      myQuery {
        field
        # use an alias to capture the value with a different case modifier
        withCaseLower: withCase(case: Lower)
        # 'withCase' will be fetched using "Case.Default"
        withCase
      }
    }`;
    const expected = {
      field: 'THIS STRING WILL BE TURNED TO UPPER CASE.',
      withCaseLower: 'it\'s a beautiful day!',
      withCase: 'iT\'s A bEaUtIfUl DaY!'
    };
    const result = graphqlSync(schema, query);
    expect(result).toHaveProperty('data.myQuery', expected);
  });

  it('interface definition', () => {
    const builder = new SchemaBuilder();

    @builder.interface({ description: 'My interface!' })
    class MyInterface {
      @builder.field(GraphQLString)
      field: string;

      @builder.query({ returnType: { type: () => MyInterface } })
      static myQuery() {
        return;
      }
    }

    const schema = builder.build();
    const query = `{
      __type(name: "MyInterface") {
        name
        description
      }
    }`;
    const expected = { description: 'My interface!', name: 'MyInterface' };
    const result = graphqlSync(schema, query);
    expect(result).toHaveProperty('data.__type', expected);
  });

  it('interface inheritance', () => {
    const builder = new SchemaBuilder();

    @builder.interface({
      description: 'My interface!',
      resolveType: (value) => {
        return value.kind;
      }
    })
    class Node {
      @builder.nonNull()
      @builder.field(GraphQLString)
      kind: string = this.constructor.name;
    }

    interface ISecondInterface {
      second: string;
    }

    interface IThirdInterface {
      third: string;
    }

    @builder.interface({
      description: 'My second interface!'
    })
    class SecondInterface implements ISecondInterface {
      @builder.nonNull()
      @builder.field(GraphQLString)
      second: string;
    }

    @builder.interface()
    class LeafInterface {
      @builder.nonNull()
      @builder.field(GraphQLString)
      leaf: string;
    }

    @builder.interface({
      description: 'My third interface!',
      resolveType: (value) => {
        return value.kind;
      },
      interfaces: () => [LeafInterface]
    })
    class ThirdInterface extends LeafInterface implements IThirdInterface {
      @builder.nonNull()
      @builder.field(GraphQLString)
      second: string;
    }

    @builder.type({ interfaces: () => [Node, 'SecondInterface', ThirdInterface] })
    class MyType extends Node implements ISecondInterface, IThirdInterface {

      // When trying to inherit multiple interfaces you have to redefine the fields in the derived type.
      // Sorry, TypeScript doesn't support multiple inheritance
      @builder.nonNull()
      @builder.field(GraphQLString)
      second: string;
      @builder.nonNull()
      @builder.field(GraphQLString)
      third: string;
      @builder.nonNull()
      @builder.field(GraphQLString)
      leaf: string;

      @builder.field(GraphQLBoolean)
      child: boolean;

      @builder.query({ returnType: { type: () => MyType } })
      static myQuery() {
        return;
      }
    }

    const schema = builder.build();

    const query = `{
      __type(name: "MyType") {
        name
        fields {
          name 
          type {
            name
            ofType { name }
          }
        }
      }
    }`;
    const expected = {
      name: 'MyType',
      fields: [
        { name: 'kind', type: { name: null, ofType: { name: 'String' } } },
        { name: 'second', type: { name: null, ofType: { name: 'String' } } },
        { name: 'third', type: { name: null, ofType: { name: 'String' } } },
        { name: 'leaf', type: { name: null, ofType: { name: 'String' } } },
        { name: 'child', type: { name: 'Boolean', ofType: null } }
      ]
    };
    const result = graphqlSync(schema, query);
    expect(result).toHaveProperty('data.__type', expected);
  });

  it('queries', () => {
    const builder = new SchemaBuilder();

    @builder.type({ description: 'My type!' })
    class MyType {
      @builder.field(GraphQLString)
      field: string;

      @builder.query({ returnType: { type: () => MyType } })
      static myQuery() {
        const test = new MyType();
        test.field = 'hello';
        return test;
      }

      @builder.query({
        returnType: { type: () => MyType },
        args: { arg1: { type: GraphQLBoolean }, arg2: { type: GraphQLInt } }
      })
      static myQueryWithArgs(_root: any, args: { arg1: boolean, arg2: number }) {
        const test = new MyType();
        test.field = `${args.arg1} ${args.arg2}`;
        return test;
      }
    }

    const schema = builder.build();
    const query = `{ 
      myQuery 
      { 
        field 
      }
      myQueryWithArgs(arg1: false, arg2: 122) {
        field
      }
    }`;
    const expected = { myQuery: { field: 'hello' }, myQueryWithArgs: { field: `false 122` } };
    const result = graphqlSync(schema, query);
    expect(result).toHaveProperty('data', expected);
  });

  it('mutation returns correct type', () => {
    const builder = new SchemaBuilder();

    @builder.type({ description: 'My type!' })
    class MyType {
      @builder.field(GraphQLString)
      field: string;

      @builder.query({ returnType: { type: () => MyType } })
      static myQuery() {
        const test = new MyType();
        test.field = 'hello';
        return test;
      }

      @builder.mutation({ returnType: { type: () => MyType } })
      static myMutation() {
        const test = new MyType();
        test.field = 'mutated';
        return test;
      }
    }

    const schema = builder.build();
    const query = `mutation { 
      myMutation
      { 
        field 
      } 
    }`;
    const expected = { field: 'mutated' };
    const result = graphqlSync(schema, query);
    expect(result).toHaveProperty('data.myMutation', expected);
  });

  it('inputs and resolver arguments', () => {
    const builder = new SchemaBuilder();

    @builder.input()
    class MyInput1 {
      @builder.nonNull()
      @builder.field(GraphQLID)
      id: string;
      @builder.field(GraphQLString)
      value: string;
    }

    @builder.input({ description: 'Test input type.' })
    class MyInput2 {
      @builder.nonNull()
      @builder.field(GraphQLString)
      input2Value: string;
    }

    @builder.type({ description: 'Dummy type!' })
    class DummyType {
      @builder.field(new GraphQLNonNull(GraphQLBoolean))
      dummy: boolean;
    }

    @builder.type({ description: 'My type!' })
    class MyType {
      @builder.field(GraphQLString)
      field: string;

      @builder.query({ returnType: 'DummyType' })
      static dummyQuery(): DummyType {
        return { dummy: false };
      }

      @builder.mutation({ returnType: () => MyType, args: { arg1: { type: () => MyInput1 }, arg2: { type: 'MyInput2' } } })
      static myMutation(_root: any, args: { arg1: MyInput1, arg2: MyInput2 }) {
        return { field: `${args.arg1.value} ${args.arg2.input2Value}` };
      }
    }

    const schema = builder.build();
    const query = `mutation { 
      myMutation(arg1: { id: "0", value: "TEST" }, arg2: { input2Value: "Hi!" }) 
      { 
        field 
      }
    }`;
    const expected = { field: 'TEST Hi!' };
    const result = graphqlSync(schema, query);
    expect(result).toHaveProperty('data.myMutation', expected);
  });

  it('custom scalars', () => {
    const builder = new SchemaBuilder();

    @builder.scalar({
      description: 'A date.',
      parseLiteral: ast =>
        ast.kind === Kind.INT ? new GraphQLDate(parseInt(ast.value, 10)) : null,
      parseValue: value => new GraphQLDate(parseInt(value, 10)),
      serialize: value => value.getTime()
    })
    class GraphQLDate extends Date {
      // empty
    }

    let stored = new GraphQLDate();

    class Query {
      @builder.query({ returnType: () => GraphQLDate })
      static now(): GraphQLDate {
        return stored;
      }

      @builder.mutation({ returnType: () => GraphQLDate, args: { arg1: { type: () => GraphQLDate } } })
      static setDate(_root: any, args: { arg1: GraphQLDate }) {
        return stored = args.arg1;
      }
    }

    const schema = builder.build();
    expect(graphqlSync(schema, `{ now }`)).toHaveProperty('data.now', stored.getTime());
    const newVal = new Date().getTime() + 1000;
    expect(graphqlSync(schema, `mutation { setDate(arg1: ${newVal}) }`))
      .toHaveProperty('data.setDate', newVal);
    expect(stored).toEqual(new GraphQLDate(newVal));
  });

  it('lists', () => {
    const builder = new SchemaBuilder();

    enum Parity {
      Odd = 'Odd',
      Even = 'Even'
    }

    builder.decorateEnum(Parity, { name: 'Parity' });

    @builder.type({ description: 'MyType!' })
    class MyType {

      @builder.field(GraphQLString)
      str: string;

      @builder.nonNull()
      @builder.nonNullItems()
      @builder.list(GraphQLInt)
      list: number[];

      @builder.nonNull()
      @builder.nonNullItems()
      @builder.list(GraphQLInt, { args: { parity: { type: Parity, defaultValue: Parity.Odd } } })
      @builder.resolve((item: MyType, args) =>
        item.listWithFilter.filter(i => args.parity === Parity.Odd ? i % 2 > 0 : i % 2 === 0))
      listWithFilter: number[];

      @builder.query({ returnType: { type: () => MyType, list: true, nonNullItems: true } })
      static myQuery(): MyType[] {
        return [{
          str: 'test', list: [0, 1], listWithFilter: [1, 2, 3, 4, 5, 6]
        }, {
          str: 'string', list: [3, 2], listWithFilter: [10, 11, 12, 13, 14, 15]
        }];
      }
    }

    const schema = builder.build();
    const query = `{ 
      myQuery 
      { 
        str
        list
        listWithFilter(parity: Odd)
      }
    }`;
    const expected = [{
      str: 'test', list: [0, 1], listWithFilter: [1, 3, 5]
    }, {
      str: 'string', list: [3, 2], listWithFilter: [11, 13, 15]
    }];
    const result = graphqlSync(schema, query);
    expect(result).toHaveProperty('data.myQuery', expected);
  });

  it('enums', () => {
    const builder = new SchemaBuilder();

    enum Role {
      admin = 'admin',
      moderator = 'moderator',
      user = 'user',
      guest = 'guest'
    }

    builder.decorateEnum(Role, {
      name: 'Role',
      description: 'An enum',
      values: {
        admin: { value: Role.admin },
        moderator: { value: Role.moderator },
        user: { value: Role.user },
        guest: { value: Role.guest },
        schemaSpecific: { value: 'UnknownRole' }
      }
    });

    // test double decorating enums. (second try will be ignored)
    builder.decorateEnum(Role, { name: 'Role' });

    @builder.type({ description: 'MyType!' })
    class MyType {

      @builder.field(Role)
      role: Role;

      @builder.nonNull()
      @builder.nonNullItems()
      @builder.list(Role)
      list: Role[];

      @builder.query({ returnType: { type: () => MyType, list: true, nonNullItems: true } })
      static myQuery(): MyType[] {
        return [{ role: Role.moderator, list: [Role.guest, Role.admin] }, { role: Role.user, list: [Role.moderator] }];
      }

      @builder.query({ returnType: Role })
      static returnsEnum(): Role {
        return Role.admin;
      }

      @builder.query({ returnType: 'Role' })
      static returnsEnum2(): Role {
        return Role.guest;
      }
    }

    const schema = builder.build();
    const query = `{ 
      myQuery 
      { 
        role
        list
      }
      returnsEnum
      returnsEnum2
    }`;
    const expected = [{ role: Role.moderator, list: [Role.guest, Role.admin] }, {
      role: Role.user,
      list: [Role.moderator]
    }];
    const result = graphqlSync(schema, query);
    expect(result).toHaveProperty('data.myQuery', expected);
    expect(result).toHaveProperty('data.returnsEnum', Role.admin);
    expect(result).toHaveProperty('data.returnsEnum2', Role.guest);
  });

  it('subscriptions', async () => {
    const builder = new SchemaBuilder();
    const pubSub = new PubSub();

    @builder.type({ description: 'My type!' })
    class Message {

      constructor(id: string | number, message: string) {
        this.id = id;
        this.message = message;
      }

      @builder.nonNull()
      @builder.field(GraphQLID)
      id: string | number;

      @builder.nonNull()
      @builder.field(GraphQLString)
      message: string;

      @builder.query({ returnType: { type: () => Message } })
      static myQuery() {
        return new Message(0, 'hello');
      }

      @builder.subscription({
        returnType: { type: () => Message },
        subscribe: () => pubSub.asyncIterator('basic')
      })
      static async basicSub(root: { message: Message }) {
        return root.message;
      }

      @builder.subscription({
        returnType: { type: () => Message },
        args: { channel: { type: GraphQLString } },
        subscribe: () => pubSub.asyncIterator('message')
      })
      static async newMessage(root: { message: Message }, args: { channel: string }) {
        expect(args.channel).toEqual('main');
        return root.message;
      }
    }

    const schema = builder.build();
    const query = `
      subscription { 
        newMessage(channel: "main")
        { 
          id
          message
        } 
      }
    `;
    const expected: Message[] = [
      { id: '0', message: 'here is a message!' },
      { id: '1', message: 'here is another message!' },
      { id: '2', message: 'and a third!' }
    ];
    const subscription = await subscribe(schema, parse(query)) as AsyncIterator<ExecutionResult<any>>;
    expected.forEach(m => pubSub.publish('message', { message: m }));
    let i = 0;
    while (i++ < expected.length) {
      const { value, done } = await subscription.next();
      if (done) break;
      expect(value).toHaveProperty('data.newMessage');
      expect(expected).toContainEqual(value.data.newMessage);
    }
  });

  it('.build() throws on undefined types/interfaces', () => {
    expect(() => {
      const builder = new SchemaBuilder();
      @builder.type()
      class Test {
        @builder.field('Unknown')
        test: any;
        @builder.query({ returnType: () => Test })
        myQuery() {
          return;
        }
      }
      builder.build();
    }).toThrow('Type \'Unknown\' not defined');

    expect(() => {
      const builder = new SchemaBuilder();
      @builder.type({ interfaces: () => ['Unknown'] })
      class Test {
        @builder.field(GraphQLBoolean)
        test: boolean;
        @builder.query({ returnType: () => Test })
        myQuery() {
          return;
        }
      }
      builder.build();
    }).toThrow('Interface \'Unknown\' not defined');

    expect(() => {
      const builder = new SchemaBuilder();
      enum Test {
        a = 'a',
        b = 'b'
      }
      builder.decorateEnum(Test, { name: '' });
    }).toThrow('Invalid name specified for enum \'\'');
  });

});
