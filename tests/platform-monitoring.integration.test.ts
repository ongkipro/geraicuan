import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { PlatformContextDeniedError, withPlatformContext } from "@/db/platform-context";
import { listTenantUsage, PLATFORM_HEALTH_THRESHOLDS, readPlatformCounts, readPlatformHealth } from "@/db/platform-monitoring-repository";
import * as schema from "@/db/schema";
import { parseAnalyticsRange } from "@/lib/analytics-range";
import { parsePlatformFilters } from "@/lib/platform-monitoring-filters";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminUrl=process.env.DATABASE_URL;const appUrl=process.env.APP_DATABASE_URL;
if(!adminUrl||!appUrl)throw new Error("DATABASE_URL and APP_DATABASE_URL are required.");
if(new URL(adminUrl).pathname!=="/geraicuan_test")throw new Error("Monitoring tests require geraicuan_test.");
const admin=new Pool({connectionString:adminUrl});const app=new Pool({connectionString:appUrl});const appDb=drizzle({client:app,schema});
const tenantA="10000000-0000-4000-8000-000000000001",tenantB="10000000-0000-4000-8000-000000000002";
const outletA="20000000-0000-4000-8000-000000000001",outletB="20000000-0000-4000-8000-000000000002";
const now=new Date("2026-08-30T12:00:00.000Z");

beforeAll(async()=>{
  await ensureIntegrationRuntimeRole(admin, appUrl);
  await admin.query("TRUNCATE audit_events, platform_roles, provider_unpaid_recoveries, provider_order_snapshots, provider_batches, shipment_estimate_snapshots, shipments, mengantar_connections, outlets, memberships, tenants, users CASCADE");
  await admin.query("INSERT INTO users(id,name,email,status) VALUES ('monitor-super','Super','monitor-super@example.test','ACTIVE'),('monitor-member','Member','monitor-member@example.test','ACTIVE')");
  await admin.query("INSERT INTO platform_roles(user_id) VALUES ('monitor-super')");
  await admin.query("INSERT INTO tenants(id,name,status,created_at) VALUES ($1,'Alpha','ACTIVE',$3),($2,'Beta','SUSPENDED',$3)",[tenantA,tenantB,new Date("2026-08-01T00:00:00Z")]);
  await admin.query("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES ($1,'monitor-member','TENANT_ADMIN','ACTIVE')",[tenantA]);
  await admin.query("INSERT INTO outlets(id,tenant_id,name,default_pickup_address_id,default_origin_area_id) VALUES ($1,$2,'Alpha Utama','pickup-a','origin-a'),($3,$4,'Beta Utama',NULL,'origin-b')",[outletA,tenantA,outletB,tenantB]);
  await admin.query("INSERT INTO shipments(id,tenant_id,outlet_id,status,created_at) VALUES ('30000000-0000-4000-8000-000000000001',$1,$2,'DRAFT','2026-08-20T00:00:00Z'),('30000000-0000-4000-8000-000000000002',$3,$4,'FAILED','2026-08-21T00:00:00Z')",[tenantA,outletA,tenantB,outletB]);
  await admin.query("INSERT INTO provider_batches(id,tenant_id,outlet_id,pickup_address_id,courier,credential_source,provider_account_key,idempotency_key,status,created_at) VALUES ('40000000-0000-4000-8000-000000000001',$1,$2,'pickup-a','JNE','platform_default',$3,$4,'SUBMISSION_QUEUED',$5)",[tenantA,outletA,"a".repeat(64),"b".repeat(64),new Date(now.getTime()-90*86_400_000)]);
});
afterAll(async()=>{await admin.query("TRUNCATE audit_events, platform_roles, provider_batches, shipments, outlets, memberships, tenants, users CASCADE");await Promise.all([app.end(),admin.end()]);});

describe("platform monitoring trust boundary",()=>{
  it("guards every view and leaves tenant RLS unchanged",async()=>{
    const client=await app.connect();try{
      await client.query("BEGIN");
      expect(Number((await client.query("SELECT count(*) n FROM platform_monitoring_tenant")).rows[0].n)).toBe(0);
      await client.query("SET LOCAL app.platform_admin='true'");
      expect(Number((await client.query("SELECT count(*) n FROM platform_monitoring_tenant")).rows[0].n)).toBe(2);
      await client.query("ROLLBACK");
      await client.query("BEGIN");await client.query("SET LOCAL app.user_id='monitor-member'");await client.query(`SET LOCAL app.tenant_id='${tenantA}'`);
      const rows=await client.query("SELECT id FROM outlets ORDER BY id");expect(rows.rows.map(row=>row.id)).toEqual([outletA]);
      await client.query("ROLLBACK");
    }finally{client.release();}
  });

  it("exposes only the allowlisted, redacted view columns",async()=>{
    const rows=await admin.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'platform_monitoring_%'");
    const names=rows.rows.map(row=>row.column_name);
    for(const prohibited of ["secret_reference","provider_account_key","idempotency_key","cnote_no","provider_order_id","metadata","correlation_id","pickup_address_id","origin_area_id"]){expect(names).not.toContain(prohibited);}
    expect(rows.rows.filter(row=>row.table_name==="platform_monitoring_tenant").map(row=>row.column_name).sort()).toEqual(["created_at","id","name","status","updated_at"]);
  });

  it("requires an active platform role, audits denial, and makes authorized work read-only",async()=>{
    await expect(withPlatformContext(appDb,"monitor-member",async()=>"unreachable")).rejects.toBeInstanceOf(PlatformContextDeniedError);
    const denied=await admin.query("SELECT outcome FROM audit_events WHERE actor_id='monitor-member' AND action='PLATFORM_MONITORING_VIEWED'");expect(denied.rows).toEqual([{outcome:"DENIED"}]);
    const mode=await withPlatformContext(appDb,"monitor-super",tx=>tx.execute<{transaction_read_only:string}>("SHOW transaction_read_only"));expect(mode.rows[0]?.transaction_read_only).toBe("on");
    await expect(withPlatformContext(appDb,"monitor-super",tx=>tx.insert(schema.tenants).values({name:"Forbidden"}))).rejects.toThrow();
  });

  it("keeps scoped counts, pagination, health, and canonical filters consistent",async()=>{
    const range=parseAnalyticsRange({rentang:"30-hari",tz:"Asia/Jakarta"},now);
    const filters={range,scope:{kind:"global"} as const,outletId:null,courier:null,status:null,outcome:null,query:null,page:1};
    const result=await withPlatformContext(appDb,"monitor-super",async tx=>{
      const counts=await readPlatformCounts(tx,filters);const usage=await listTenantUsage(tx,filters,1);const second=await listTenantUsage(tx,{...filters,page:2},1);const health=await readPlatformHealth(tx,filters,now);return{counts,rows:[...usage.rows,...second.rows],total:usage.total,health};
    });
    expect(result.total).toBe(2);expect(result.rows.reduce((sum,row)=>sum+row.shipments,0)).toBe(result.counts.lifecycle.shipments);
    expect(result.rows.reduce((sum,row)=>sum+row.batches,0)).toBe(result.counts.lifecycle.batches);
    expect(result.health.queue.count).toBe(1);expect(result.health.queue.oldestMs).toBeGreaterThan(PLATFORM_HEALTH_THRESHOLDS.queueCriticalAgeMs);expect(result.health.queue.severity).toBe("kritis");
    const parsed=parsePlatformFilters({tz:"Mars/Base",status:"mystery",outlet:outletA,q:"x",extra:"1"},{route:"/platform/tenant",now,knownTenantIds:[tenantA,tenantB],knownOutletIds:[outletA],knownCouriers:["JNE"]});
    expect(parsed.issues).toEqual(expect.arrayContaining(["tz_tidak_dikenal","status_tidak_dikenal","outlet_tanpa_tenant","kata_kunci_terlalu_pendek","parameter_tidak_dikenal"]));
    const stable=parsePlatformFilters(Object.fromEntries(parsed.canonicalQuery),{route:"/platform/tenant",now,knownTenantIds:[tenantA,tenantB],knownOutletIds:[outletA],knownCouriers:["JNE"]});expect(stable.canonicalQuery.toString()).toBe(parsed.canonicalQuery.toString());
  });
});
