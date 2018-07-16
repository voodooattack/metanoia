# Metanoia

TypeScript decorators for GraphQL.

### Installation

`npm install metanoia`

### Usage

First, let's define a GraphQL interface:

```ts

import { SchemaBuilder } from 'metanoia';

// Create a new Schema builder, this is the centrepiece of this library.
const builder = new SchemaBuilder();

@builder.interfaceType({ resolveType: (value: Node) => value.kind })
export class Node {
  /**
   * The most basic attribute identifying a node: its type (class name).
   * @type {string}
   */
  @builder.field(GraphQLString) // define as a `String` field
  @builder.nonNull() // define as not nullable
  // attach a description, this will appear in your schema definition
  @builder.description('Type of this Node.')
  kind: string = this.constructor.name;

  /**
   * The unique ID of this node.
   * @type {string}
   */
  @builder.nonNull() // this can not be null!
  @builder.field(GraphQLID) // define the field with a type of ID
  @builder.description('A unique ID for this object.')
  id: string|number;
}

```

Now we that we've defined our interface, we can define a type that implements it!

```ts

// Define an enum for user roles.
export enum UserRoleEnum {
  administrator = 'administrator',
  moderator = 'moderator',
  subscriber = 'subscriber'
}

// We have to use this method to decorate it, since TypeScript does
// not allow decorators on enums yet.
builder.decorateEnum(UserRoleEnum, {
  name: 'UserRole', // The name to use in the GraphQL schema.
  description: 'A user\'s role.',
  // Describe individual values here.
  // Anything not included here is not part of the schema!
  values: {
    subscriber: { description: 'A subscriber.' },
    moderator: { description: 'A moderator.' },
    administrator: { description: 'An administrator.' },
  }
});

@builder.type({
  description: 'A user.',
  // list of interfaces to inherit,
  // note that `User` will actually inherit all the fields from `Node`
  // through TypeScript inheritance
  interfaces: () => [Node]
})
export class User extends Node {

  // Define a `role` field of our enum type, you must pass the enum itself here.
  @builder.field(UserRoleEnum)
  @builder.nonNull()
  @builder.description('The role of this user.')
  role: UserRoleEnum;

  @builder.nonNull()
  @builder.field(GraphQLString)
  firstName: string;

  @builder.nonNull()
  @builder.field(GraphQLString)
  lastName: string;

  @builder.nonNull()
  // This special modifier makes sure our list items can't be nulls.
  @builder.nonNullItems() // for use with lists only!
  // Use this instead of `@field()` when defining lists!
  // This defines a list of Users that accepts a filter argument.
  @builder.list(() => User, { args: { filter: { type: GraphQLString, defaultValue: null } } })
  // Define a custom resolver to filter the friends list! 
  // Can be done more efficiently if you do this in the query instead. Since in that case, 
  //   you'll have the chance to filter using a database query instead of searching the array. 
  @builder.resolver((user: User, args: { filter: string }) => {
    if (args.filter !== null)
      // Only return friends with a first name containing the filter string. 
      return user.friends.filter(friend => friend.firstName.toLowerCase().indexOf(filter.toLowerCase()) >= 0);
    else // no filter supplied
      return user.friends;
  })
  friends: User[];

  // You can define queries as static members of your classes,
  // they will be moved to the schema's `Query` type automatically.
  @builder.query({
    // This defines the return type of your query.
    // Notice how we return a custom type (User) and not a primitive one here.
    // You can do this anywhere where a type is expected by passing
    //    a thunk that returns your custom type!
    returnType: { type: () => User },
    description: 'Get the currently logged in user.'
  })
  static async currentUser(rootValue: any, args: any, context: TheoreticalContextInterface): Promise<User | null> {
    // You'll have to set up the context/services yourself, 
    // this is just a basic example that assumes an imaginary API.
    return (await context.getCurrentUser()) || null;
  }

  // Mutations too!
  @builder.mutation({
    returnType: { type: GraphQLBoolean },
    description: 'Ends the current session.',
    args: { 
      confirmation: { 
        type: GraphQLBoolean,
        description: 'This argument must be supplied, and must be true to really log out' 
      } 
    }
  })
  static async logout(rootValue: any, args: { confirmation: boolean }, context: TheoreticalContextInterface): Promise<boolean> {
    if (args.confirmation)
      return await context.logOut();
    else
      return false;
  }
}
```

Next, let's try our hand at defining a subscription!

```ts

import { PubSub, withFilter } from 'graphql-subscriptions';

const pubSub = new PubSub();

// This type will hold all the information we have about a chat message.
@builder.type({ description: 'A chat message.', interfaces: () => [Node] })
export class ChatMessage extends Node {

  // The text of the message
  @builder.field(GraphQLString)
  @builder.nonNull()
  text: string;

  // The source user, or `null` for anonymous messages.
  @builder.field(() => User)
  user: User | null;

  // The name of the chat room this message was posted in.
  @builder.nonNull()
  @builder.field(GraphQLString)
  room: string;

  // Define the subscription. Note how there's an extra `subscribe` function
  // we have to supply here.
  @builder.subscription({
    returnType: { type: () => ChatMessage },
    args: { room: { type: GraphQLString, defaultValue: 'lobby' } },
    description: 'Fired when a user sends a message.',
    // This callback is responsible for hooking the subscription.
    // See docs for `graphql-subscriptions` for more information.
    subscribe: withFilter(() => pubSub.asyncIterator('message'), (payload, variables) => {
      return payload.message.room === variables.room;
    })
  })
  static async chatMessage({ message }: { message: ChatMessage }, args: any) {
    // This resolver can be used to transform the messages
    // before sending them to the client.
    // We'll just make double sure that the room matches,
    // which is already performed by `withFilter`
    // above but there's not much else to do.
    return message.room === args.room ? message : null;
  }
}
```

We're almost done! We have everything properly defined.
 
Now let's do the last step and build the schema!

```ts
const schema = builder.build(); returns an instance of GraphQLSchema

console.log(printSchema(schema));
```

At this junction our schema will be printed to the console, and it will look like this:

```graphqls
schema {
  query: Query
  mutation: Mutation
  subscription: Subscriptions
}

"""A chat message. """
type ChatMessage implements Node {
  """Base type of this Node."""
  kind: String!
  """A unique ID for this object."""
  id: ID!
  text: String!
  user: User
  room: String!
}

"""The root mutation object."""
type Mutation {
  """Ends the current session."""
  logout: Boolean
}

interface Node {
  """Base type of this Node."""
  kind: String!
  """A unique ID for this object."""
  id: ID!
}

"""The root query object."""
type Query {
  """Get the currently logged in user."""
  currentUser: User
}

"""The root subscriptions object."""
type Subscriptions {
  """Fired when a user sends a message."""
  chatMessage(room: String = "lobby"): ChatMessage
}

"""A user."""
type User implements Node {
  """Base type of this Node."""
  kind: String!
  """A unique ID for this object."""
  id: ID!
  firstName: String!
  lastName: String!

  """The role of this user."""
  role: UserRole!
}

"""A user's role."""
enum UserRole {
  """An administrator."""
  administrator

  """A moderator."""
  moderator

  """A subscriber."""
  subscriber
}
```

At this point you can use the schema as normal.

```ts
graphql(schema, `
  query testQuery {
    currentUser {
      id
      firstName
      lastName
      role
    }
  }
`).then(console.log, console.error);
```

##### What about GraphQL Unions?

GraphQL unions are not currently supported in version `1.0.0`. 

I might decide to add this feature later if there's enough demand for it, or if somebody else submits a pull request! That's always welcome!

### Contributions

All contributions and pull requests are welcome. 

Please make sure that test coverage does not drop below the set limits in `package.json`.

### License (MIT)

Copyright (c) 2018 Abdullah A. Hassan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
