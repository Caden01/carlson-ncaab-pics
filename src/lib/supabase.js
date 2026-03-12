import { createClient } from "@supabase/supabase-js";
import {
  createE2EState,
  E2E_USER,
  isE2EBypassEnabled,
} from "./e2eBypass";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set."
  );
}

const realSupabase = createClient(supabaseUrl, supabaseAnonKey);

let e2eState = createE2EState();

function cloneRows(rows) {
  return rows.map((row) => ({ ...row }));
}

function attachRelations(table, rows) {
  if (table === "picks") {
    return rows.map((row) => ({
      ...row,
      profiles: e2eState.profiles.find((profile) => profile.id === row.user_id)
        ? {
            username:
              e2eState.profiles.find((profile) => profile.id === row.user_id)
                .username,
            email:
              e2eState.profiles.find((profile) => profile.id === row.user_id)
                .email,
          }
        : null,
    }));
  }

  if (table === "weekly_winners") {
    return rows.map((row) => ({
      ...row,
      profiles: e2eState.profiles.find((profile) => profile.id === row.user_id)
        ? {
            username:
              e2eState.profiles.find((profile) => profile.id === row.user_id)
                .username,
            email:
              e2eState.profiles.find((profile) => profile.id === row.user_id)
                .email,
          }
        : null,
    }));
  }

  return rows;
}

function getTableRows(table) {
  const rows = e2eState[table] || [];
  return cloneRows(rows);
}

class MockQueryBuilder {
  constructor(table) {
    this.table = table;
    this.mode = "select";
    this.filters = [];
    this.orders = [];
    this.limitValue = null;
    this.selectOptions = {};
    this.payload = null;
    this.singleMode = null;
  }

  select(_columns, options = {}) {
    this.mode = "select";
    this.selectOptions = options;
    return this;
  }

  insert(payload) {
    const rows = Array.isArray(payload) ? payload : [payload];
    e2eState[this.table] = [...(e2eState[this.table] || []), ...rows];
    return Promise.resolve({ data: rows, error: null });
  }

  upsert(payload) {
    const rows = Array.isArray(payload) ? payload : [payload];
    const existingRows = [...(e2eState[this.table] || [])];

    rows.forEach((row) => {
      const matchIndex = existingRows.findIndex(
        (item) =>
          item.user_id === row.user_id &&
          item.game_id === row.game_id
      );

      if (matchIndex >= 0) {
        existingRows[matchIndex] = { ...existingRows[matchIndex], ...row };
      } else {
        existingRows.push(row);
      }
    });

    e2eState[this.table] = existingRows;
    return Promise.resolve({ data: rows, error: null });
  }

  update(payload) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }

  eq(field, value) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  neq(field, value) {
    this.filters.push((row) => row[field] !== value);
    return this;
  }

  gte(field, value) {
    this.filters.push((row) => row[field] >= value);
    return this;
  }

  lte(field, value) {
    this.filters.push((row) => row[field] <= value);
    return this;
  }

  in(field, values) {
    this.filters.push((row) => values.includes(row[field]));
    return this;
  }

  not(field, operator, value) {
    if (operator === "is" && value === null) {
      this.filters.push((row) => row[field] !== null && row[field] !== undefined);
    }
    return this;
  }

  order(field, { ascending = true } = {}) {
    this.orders.push({ field, ascending });
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybe";
    return this.execute();
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  async execute() {
    if (this.mode === "update") {
      const updatedRows = [];
      const nextRows = (e2eState[this.table] || []).map((row) => {
        const matches = this.filters.every((filter) => filter(row));
        if (!matches) return row;
        const updatedRow = { ...row, ...this.payload };
        updatedRows.push(updatedRow);
        return updatedRow;
      });

      e2eState[this.table] = nextRows;
      return { data: updatedRows, error: null };
    }

    let rows = attachRelations(this.table, getTableRows(this.table));
    rows = rows.filter((row) => this.filters.every((filter) => filter(row)));

    this.orders.forEach(({ field, ascending }) => {
      rows.sort((a, b) => {
        if (a[field] === b[field]) return 0;
        if (a[field] === null || a[field] === undefined) return 1;
        if (b[field] === null || b[field] === undefined) return -1;
        if (a[field] > b[field]) return ascending ? 1 : -1;
        return ascending ? -1 : 1;
      });
    });

    if (typeof this.limitValue === "number") {
      rows = rows.slice(0, this.limitValue);
    }

    if (this.singleMode === "maybe") {
      return { data: rows[0] || null, error: null };
    }

    if (this.selectOptions.head) {
      return { data: null, error: null, count: rows.length };
    }

    return { data: rows, error: null, count: rows.length };
  }
}

const mockSupabase = {
  auth: {
    getSession: async () => ({
      data: {
        session: {
          user: E2E_USER,
        },
      },
    }),
    onAuthStateChange: (callback) => {
      callback("SIGNED_IN", { user: E2E_USER });
      return {
        data: {
          subscription: {
            unsubscribe: () => {},
          },
        },
      };
    },
    signInWithOAuth: async () => ({ data: null, error: null }),
    signUp: async () => ({ data: null, error: null }),
    signInWithPassword: async () => ({ data: null, error: null }),
    signOut: async () => ({ error: null }),
  },
  from: (table) => new MockQueryBuilder(table),
  rpc: async (_name, _args) => ({ data: [], error: null }),
  channel: () => ({
    on: () => ({
      subscribe: () => ({
        unsubscribe: () => {},
      }),
    }),
  }),
  removeChannel: () => {},
  resetE2EState: () => {
    e2eState = createE2EState();
  },
};

export const supabase = new Proxy(mockSupabase, {
  get(target, prop) {
    if (isE2EBypassEnabled()) {
      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    }

    const value = realSupabase[prop];
    return typeof value === "function" ? value.bind(realSupabase) : value;
  },
});
