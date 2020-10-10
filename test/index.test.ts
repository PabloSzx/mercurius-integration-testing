import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import FastifyCookie from "fastify-cookie";
import gql from "graphql-tag";
import Mercurius from "mercurius";
import tap from "tap";

import { createMercuriusTestClient } from "../src";

const app = Fastify();

app.register(FastifyCookie);

const schema = `
  type Query {
    add(x: Int, y: Int): Int
    header(name: String!): String
    cookie(name: String!): String
  }
  type Mutation {
    substract(x: Int, y: Int): Int
  }
`;

type IContext = { req: FastifyRequest; reply: FastifyReply };

type AddQuery = { add: number };
type AddQueryVariables = { x: number; y: number };

type SubstractMutation = { substract: number };
type SubstractMutationVariables = { x: number; y: number };

type HeaderQuery = { header?: string | null };
type HeaderQueryVariables = { name: string };

type CookieQuery = { cookie?: string | null };
type CookieQueryVariables = { name: string };

const resolvers = {
  Query: {
    add: (_: {}, { x, y }: AddQueryVariables) => {
      return x + y;
    },
    header: (_: {}, { name }: HeaderQueryVariables, { req }: IContext) => {
      return req.headers[name];
    },
    cookie: (_: {}, { name }: CookieQueryVariables, { req }: IContext) => {
      return req.cookies[name];
    },
  },
  Mutation: {
    substract: (_: {}, { x, y }: SubstractMutationVariables) => {
      return x - y;
    },
  },
};

app.register(Mercurius, {
  schema,
  resolvers,
  allowBatchedQueries: true,
  context: async (req, reply): Promise<IContext> => {
    return {
      req,
      reply,
    };
  },
});

const client = createMercuriusTestClient(app);

tap.test("query", async (t) => {
  t.plan(2);

  t.equal(
    (
      await client.query<AddQuery>(`
        query {
            add(x: 1, y: 2)
        }
    `)
    ).data.add,
    3
  );

  t.equal(
    (
      await client.query<AddQuery>(gql`
        query {
          add(x: 1, y: 2)
        }
      `)
    ).data.add,
    3
  );
});

tap.test("mutation", async (t) => {
  t.plan(1);

  t.equal(
    (
      await client.mutate<SubstractMutation>(`
        mutation {
            substract(x: 10, y: 3)
        }
        `)
    ).data.substract,
    7
  );
});

tap.test("batched queries", async (t) => {
  t.plan(1);

  t.equivalent(
    await client.batchQueries([
      {
        query: `
              query {
                  add(x: 1, y: 2)
              }
          `,
      },
      {
        query: gql`
          query {
            add(x: 2, y: 2)
          }
        `,
      },
      {
        query: `
            query {
                add(x: 3, y: 2)
            }
        `,
      },
    ]),
    [
      {
        data: {
          add: 3,
        },
      },
      {
        data: {
          add: 4,
        },
      },
      {
        data: {
          add: 5,
        },
      },
    ]
  );
});

tap.test("cookies", async (t) => {
  const client = createMercuriusTestClient(app, {
    cookies: {
      foo: "a",
    },
  });
  t.plan(6);

  const cookieQuery = `
  query($name: String!) {
      cookie(name: $name)
  }
  `;

  const resp1 = await client.query<CookieQuery, CookieQueryVariables>(cookieQuery, {
    variables: {
      name: "foo",
    },
  });
  t.equal(resp1.data.cookie, "a");

  const resp2 = await client.query<CookieQuery, CookieQueryVariables>(cookieQuery, {
    variables: {
      name: "bar",
    },
  });
  t.equal(resp2.data.cookie, null);

  client.setCookies({
    foo: "b",
  });

  const resp3 = await client.query<CookieQuery, CookieQueryVariables>(cookieQuery, {
    variables: {
      name: "foo",
    },
  });
  t.equal(resp3.data.cookie, "b");

  const resp4 = await client.query<CookieQuery, CookieQueryVariables>(cookieQuery, {
    variables: {
      name: "lorem",
    },
    cookies: {
      lorem: "ipsum",
    },
  });

  t.equal(resp4.data.cookie, "ipsum");

  const resp5 = await client.query<CookieQuery, CookieQueryVariables>(cookieQuery, {
    variables: {
      name: "foo",
    },
    cookies: {
      foo: "z",
    },
  });
  t.equal(resp5.data.cookie, "z");

  const resp6 = await client.batchQueries(
    [
      {
        query: cookieQuery,
        variables: {
          name: "foo",
        },
      },
      {
        query: cookieQuery,
        variables: {
          name: "foo",
        },
      },
    ],
    {
      cookies: {
        foo: "y",
      },
    }
  );
  t.deepEqual(resp6, [{ data: { cookie: "y" } }, { data: { cookie: "y" } }]);
});

tap.test("headers", async (t) => {
  const client = createMercuriusTestClient(app, {
    headers: {
      foo: "a",
    },
  });
  t.plan(6);

  const headerQuery = `
    query($name: String!) {
        header(name: $name)
    }
    `;

  const resp1 = await client.query<HeaderQuery, HeaderQueryVariables>(headerQuery, {
    variables: {
      name: "foo",
    },
  });
  t.equal(resp1.data.header, "a");

  const resp2 = await client.query<HeaderQuery, HeaderQueryVariables>(headerQuery, {
    variables: {
      name: "bar",
    },
  });
  t.equal(resp2.data.header, null);

  client.setHeaders({
    foo: "b",
  });

  const resp3 = await client.query<HeaderQuery, HeaderQueryVariables>(headerQuery, {
    variables: {
      name: "foo",
    },
  });
  t.equal(resp3.data.header, "b");

  const resp4 = await client.query<HeaderQuery, HeaderQueryVariables>(headerQuery, {
    variables: {
      name: "lorem",
    },
    headers: {
      lorem: "ipsum",
    },
  });

  t.equal(resp4.data.header, "ipsum");

  const resp5 = await client.query<HeaderQuery, HeaderQueryVariables>(headerQuery, {
    variables: {
      name: "foo",
    },
    headers: {
      foo: "z",
    },
  });
  t.equal(resp5.data.header, "z");

  const resp6 = await client.batchQueries(
    [
      {
        query: headerQuery,
        variables: {
          name: "foo",
        },
      },
      {
        query: headerQuery,
        variables: {
          name: "foo",
        },
      },
    ],
    {
      headers: {
        foo: "y",
      },
    }
  );
  t.deepEqual(resp6, [{ data: { header: "y" } }, { data: { header: "y" } }]);
});
