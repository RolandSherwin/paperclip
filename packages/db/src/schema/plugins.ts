import { pgTable, uuid, text, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { approvals } from "./approvals.js";

export const plugins = pgTable(
  "plugins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    description: text("description"),
    source: text("source").notNull(), // agent_created | manual
    status: text("status").notNull().default("pending_review"),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
    uiHtml: text("ui_html").notNull(),
    uiHtmlSha256: text("ui_html_sha256").notNull(),
    approvalId: uuid("approval_id").references(() => approvals.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("plugins_company_status_idx").on(table.companyId, table.status),
    companyNameUniq: unique("plugins_company_name_uniq").on(table.companyId, table.name),
  }),
);
