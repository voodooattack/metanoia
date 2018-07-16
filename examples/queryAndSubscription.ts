import {
  ExecutionResult,
  graphql,
  GraphQLBoolean,
  GraphQLID,
  GraphQLString,
  parse,
  printSchema,
  subscribe
} from 'graphql';
import { PubSub, withFilter } from 'graphql-subscriptions';
import { ISchemaBuilder, SchemaBuilder } from '../src';

const builder: ISchemaBuilder = new SchemaBuilder();

// resolveType will lookup types from the variable `entityTypes`, which is located near the
// bottom of the class definitions (a hoisted function because we don't want to import self)
// Alternatively, you can return the value of `Node.kind` directly.
@builder.interface({ resolveType: resolveNodeType })
export class Node {
  /**
   * The most basic attribute identifying a node: its type.
   * @type {string}
   */
  @builder.nonNull() // not nullable
  @builder.field(GraphQLString) // field is a String
  @builder.description('Type of this Node.') // this will appear in your schema definition
  kind = this.constructor.name;

  /**
   * The unique ID of this node.
   * @type {string}
   */
  @builder.nonNull() // this can not be null!
  @builder.field(GraphQLID) // define the field with a type of ID
  @builder.description('A unique ID for this object.')
  id: string|number;
}

export enum UserRoleEnum {
  administrator = 'administrator',
  moderator = 'moderator',
  subscriber = 'subscriber'
}

builder.decorateEnum(UserRoleEnum, {
  name: 'UserRole',
  description: 'A user\'s role.',
  values: {
    subscriber: { description: 'A subscriber.' },
    moderator: { description: 'A moderator.' },
    administrator: { description: 'An administrator.' },
  }
});

let fakeUser: User|null = null;

@builder.type({ description: 'A user.', interfaces: () => [Node] })
export class User extends Node {
  @builder.nonNull()
  @builder.field(GraphQLString)
  firstName: string;
  @builder.nonNull()
  @builder.field(GraphQLString)
  lastName: string;

  @builder.nonNull()
  @builder.field(UserRoleEnum)
  @builder.description('The role of this user.')
  role: UserRoleEnum;

  @builder.nonNull()
  @builder.nonNullItems()
  @builder.list(() => User)
  friends: User[];

  @builder.query({ returnType: { type: () => User }, description: 'Get the currently logged in user.' })
  static async currentUser(_: any, __: any, _context: any): Promise<User | null> {
    console.log('currentUser called!');
    return fakeUser;
  }

  @builder.mutation({ returnType: { type: GraphQLBoolean }, description: 'Ends the current session.' })
  static async logout(_: any, __: any, _context: any): Promise<boolean> {
    fakeUser = null;
    return true;
  }
}

fakeUser = new User();
fakeUser.id = 0;
fakeUser.firstName = 'Abdullah';
fakeUser.lastName = 'Hassan';
fakeUser.friends = [];
fakeUser.role = UserRoleEnum.administrator;

const pubSub = new PubSub();

@builder.type({ description: 'A chat message. ', interfaces: () => [Node] })
export class ChatMessage extends Node {
  @builder.field(GraphQLString)
  @builder.nonNull()
  text: string;

  @builder.field(() => User)
  user: User | null;

  @builder.nonNull()
  @builder.field(GraphQLString)
  room: string = 'lobby';

  @builder.subscription({
    returnType: { type: () => ChatMessage },
    args: { room: { type: GraphQLString, defaultValue: 'lobby' } },
    description: 'Fired when a user sends a message.',
    subscribe: withFilter(() => pubSub.asyncIterator('message'), (payload, variables) => {
      return payload.message.room === variables.room;
    })
  })
  static async chatMessage({ message }: { message: ChatMessage }, args: any) {
    // Make sure the room matches, already performed by `withFilter` above but we make double sure.
    return message.room === args.room ? message : null;
  }
}

function resolveNodeType(node: Node) {
  // important to keep a collection of every type implementing `Node` here!
  const types = { User, ChatMessage } as any;
  return types[node.kind];
}

const schema = builder.build(); // build the schema

console.log(printSchema(schema));

testGraphQL().then(console.log, console.error);

async function testGraphQL() {

  console.log(await graphql(schema, `
    query testQuery {
      currentUser {
        id
        firstName
        lastName
        role
      }
    }
  `));

  const subscription = await subscribe(schema, parse(`
    subscription testSub {
      chatMessage(room: "lobby") {
        text
        room
        user {
          id
          firstName
          lastName
        }
      }
    }
  `)) as AsyncIterator<ExecutionResult<any>>;

  pubSub.publish('message', { message: { text: 'This is message 1!', user: fakeUser, room: 'lobby' } });
  pubSub.publish('message', { message: { text: 'This is message 2!', user: fakeUser, room: 'lobby' } });
  pubSub.publish('message', { message: { text: 'This is message 3!', user: fakeUser, room: 'private' } });
  pubSub.publish('message', { message: { text: 'This is message 4!', user: fakeUser, room: 'lobby' } });

  let i = 0;
  while (true) {
    let { value, done } = await subscription.next();
    console.log(++i, value);
    if (i === 6) {
      // log out the user, thus making all messages above #6 anonymous
      graphql(schema, `mutation { logout }`).then(console.log, console.error);
    }
    if (i <= 10) {
      pubSub.publish('message', {
        message: {
          text: `This is message ${i+4}!`,
          user: fakeUser,
          room: 'lobby'
        }
      });
      done = false;
    }
    if (done) {
      break;
    }
  }
}


