import { createClient } from '@libsql/client';

export function createDatabase(config) {
  const client = createClient(config);
  const stmt = (sql, args) => ({ sql, args });
  const format = result => ({ results: [...result.rows], changes: result.rowsAffected });
  return {
    prepare(sql) {
      function bind(...args) {
        const statement = stmt(sql, args);
        return {
          statement,
          first: async () => (await client.execute(statement)).rows[0],
          all: async () => format(await client.execute(statement)),
          run: async () => format(await client.execute(statement))
        };
      }
      return { ...bind(), bind };
    },
    batch: async statements => (await client.batch(statements.map(item => item.statement), 'write')).map(format),
    migrate: async sql => client.executeMultiple(sql),
    close: () => client.close()
  };
}
