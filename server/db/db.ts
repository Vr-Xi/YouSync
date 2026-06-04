import pg from "pg";
import "dotenv/config";

const Pool = pg.Pool;

export const db = new Pool({
    connectionString: process.env.DATABASE_URL,
});