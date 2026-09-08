import { Prisma } from "@prisma/client";

export function normalizedPhoneKeySql(column: Prisma.Sql) {
  const digits = Prisma.sql`regexp_replace(${column}, '[^0-9]', '', 'g')`;
  return Prisma.sql`right(CASE WHEN length(${digits}) > 11 AND left(${digits}, 2) = '55'
    THEN substring(${digits} from 3) ELSE ${digits} END, 11)`;
}
