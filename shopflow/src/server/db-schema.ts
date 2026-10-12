/**
 * Postgres schema that holds the store tables: the `?schema=` value of DATABASE_URL (default "public").
 *
 * Raw SQL must name it explicitly. Prisma's generated queries are already schema-qualified, but
 * Supabase's transaction pooler hands each transaction an arbitrary server connection, so a
 * per-connection search_path is not reliable: unqualified raw SQL then fails intermittently.
 */
export function dbSchema(): string {
  let schema = "public";
  try {
    schema = new URL(process.env.DATABASE_URL || "").searchParams.get("schema") || "public";
  } catch {
    // DATABASE_URL missing or not a URL: keep the default
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(`Invalid schema name in DATABASE_URL: ${schema}`);
  }
  return schema;
}

/** Schema-qualified identifier for raw SQL, e.g. qualified("payments") -> "shopflow"."payments". */
export function qualified(name: string): string {
  return `"${dbSchema()}"."${name}"`;
}
