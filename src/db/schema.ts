import type { DbSchema } from '../interfaces';

export const DEMO_SCHEMA: DbSchema = {
  tables: [
    {
      name: 'users',
      fields: [
        { name: 'id', type: 'integer' },
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string' },
        { name: 'created_at', type: 'timestamp' },
      ],
    },
    {
      name: 'orders',
      fields: [
        { name: 'id', type: 'integer' },
        { name: 'user_id', type: 'integer' },
        { name: 'total', type: 'decimal' },
        { name: 'created_at', type: 'timestamp' },
      ],
    },
  ],
};
