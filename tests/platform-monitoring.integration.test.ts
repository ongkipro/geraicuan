import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { PlatformContextDeniedError, withPlatformContext } from "@/db/platform-context";
import { listAuditEvents, listRegistrationDecisions, listTenantUsage, PLATFORM_HEALTH_THRESHOLDS, readPlatformCounts, readPlatformHealth, readTrend } from "@/db/platform-monitoring-repository";
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

  it("T-257: binds each status strip count to the rows its filter lists, the audit filters, trend totals and member counts",async()=>{
    await admin.query("INSERT INTO audit_events(actor_id,actor_role,tenant_id,action,target_type,target_id,outcome,created_at) VALUES ('monitor-super','SUPER_ADMIN',$1,'TENANT_SUSPENDED','TENANT',$2,'SUCCESS','2026-08-29T00:00:00Z'),('monitor-super','SUPER_ADMIN',NULL,'PLATFORM_MONITORING_VIEWED','PLATFORM','platform','SUCCESS','2026-08-29T01:00:00Z')",[tenantB,tenantB]);
    await admin.query("INSERT INTO audit_events(actor_id,actor_role,tenant_id,action,target_type,target_id,outcome,metadata,created_at) VALUES ('monitor-member','TENANT_MEMBER',$1,'SHIPMENT_HANDOVER_RECORDED','SHIPMENT','30000000-0000-4000-8000-000000000001','SUCCESS','{\"eventId\":\"50000000-0000-4000-8000-000000000001\"}','2026-08-29T02:00:00Z'),('monitor-member','TENANT_MEMBER',$1,'SHIPMENT_HANDOVER_UNDONE','SHIPMENT','30000000-0000-4000-8000-000000000001','SUCCESS','{\"eventId\":\"50000000-0000-4000-8000-000000000002\"}','2026-08-29T03:00:00Z')",[tenantA]);
    const range=parseAnalyticsRange({rentang:"30-hari",tz:"Asia/Jakarta"},now);
    const filters={range,scope:{kind:"global"} as const,outletId:null,courier:null,status:null,outcome:null,query:null,page:1};
    const r=await withPlatformContext(appDb,"monitor-super",async tx=>{
      const all=await listTenantUsage(tx,filters,25);
      const byStatus:Record<string,Awaited<ReturnType<typeof listTenantUsage>>>={};
      for(const status of ["ACTIVE","SUSPENDED","PROVISIONING","ARCHIVED"] as const)byStatus[status]=await listTenantUsage(tx,{...filters,tenantStatus:status},25);
      const searched=await listTenantUsage(tx,{...filters,query:"alp"},25);
      const suspended=await listAuditEvents(tx,{...filters,action:"TENANT_SUSPENDED"},25);
      const everything=await listAuditEvents(tx,filters,25);
      const feed=await listAuditEvents(tx,filters,25,{hideRoutineEvents:true});
      const handovers=await listAuditEvents(tx,{...filters,action:"SHIPMENT_HANDOVER_RECORDED"},25);
      const trend=await readTrend(tx,filters);const counts=await readPlatformCounts(tx,filters);
      const tenantCounts=await readPlatformCounts(tx,{...filters,scope:{kind:"tenant",tenantId:tenantA}});
      return{all,byStatus,searched,suspended,everything,feed,handovers,trend,counts,tenantCounts};
    });
    // PLT-TEN-*: each count equals the rows (and total) its status filter returns; the four sum to Semua.
    expect(r.all.statusCounts).toEqual({all:2,ACTIVE:1,SUSPENDED:1,PROVISIONING:0,ARCHIVED:0});
    for(const [status,page] of Object.entries(r.byStatus)){
      expect(page.total).toBe(r.all.statusCounts[status as "ACTIVE"]);expect(page.rows).toHaveLength(page.total);
      expect(page.rows.every(row=>row.status===status)).toBe(true);expect(page.statusCounts).toEqual(r.all.statusCounts);
    }
    expect(r.searched.statusCounts).toEqual({all:1,ACTIVE:1,SUSPENDED:0,PROVISIONING:0,ARCHIVED:0});
    // aksi filter and the Ringkasan/detail feed without monitoring views.
    expect(r.suspended.rows.map(row=>[row.action,row.tenantId])).toEqual([["TENANT_SUSPENDED",tenantB]]);
    expect(r.everything.rows.some(row=>row.action==="PLATFORM_MONITORING_VIEWED")).toBe(true);
    // T-268 (M2): the short feeds leave out page views and the per-parcel handover rows; the full
    // trail keeps both, and `aksi` finds a handover row.
    const routine=["PLATFORM_MONITORING_VIEWED","SHIPMENT_HANDOVER_RECORDED","SHIPMENT_HANDOVER_UNDONE"];
    for(const action of routine)expect(r.everything.rows.some(row=>row.action===action)).toBe(true);
    expect(r.feed.rows.filter(row=>routine.includes(row.action))).toEqual([]);
    expect(r.feed.total).toBe(r.everything.total-r.everything.rows.filter(row=>routine.includes(row.action)).length);
    expect(r.feed.rows.map(row=>row.action)).toContain("TENANT_SUSPENDED");
    expect(r.handovers.rows.map(row=>[row.action,row.tenantId])).toEqual([["SHIPMENT_HANDOVER_RECORDED",tenantA]]);
    // PLT-TREND-TOTALS equal SHP-CREATED / SHP-ISSUED of the same filters.
    expect(r.trend.reduce((sum,bucket)=>sum+bucket.created,0)).toBe(r.counts.lifecycle.shipments);
    expect(r.trend.reduce((sum,bucket)=>sum+bucket.issued,0)).toBe(r.counts.lifecycle.issued);
    // PLT-TD-MEMBER-ACTIVE: the gerai's own active members by role, never another gerai's.
    expect(r.tenantCounts.memberships).toMatchObject({active:1,tenantAdmins:1,operators:0});
    expect(r.tenantCounts.outlets).toMatchObject({total:1,configured:1});
  });
  it("T-268 (M1): Riwayat keputusan keeps a decision behind more than 500 later handover audit rows",async()=>{
    await admin.query("INSERT INTO audit_events(actor_id,actor_role,tenant_id,action,target_type,target_id,outcome,created_at) VALUES ('monitor-super','SUPER_ADMIN',$1,'TENANT_REGISTRATION_APPROVED','TENANT',$2,'SUCCESS',now()-interval '2 days'),('monitor-super','SUPER_ADMIN',$1,'TENANT_REGISTRATION_REJECTED','TENANT',$2,'DENIED',now()-interval '1 day')",[tenantA,tenantA]);
    await admin.query(`INSERT INTO audit_events(actor_id,actor_role,tenant_id,action,target_type,target_id,outcome,metadata,created_at)
      SELECT 'monitor-member','TENANT_MEMBER',$1,'SHIPMENT_HANDOVER_RECORDED','SHIPMENT','30000000-0000-4000-8000-000000000001','SUCCESS',jsonb_build_object('eventId',gen_random_uuid()::text),now()-interval '1 hour'-n*interval '1 second'
      FROM generate_series(1,600) n`,[tenantA]);
    const decisions=await withPlatformContext(appDb,"monitor-super",tx=>listRegistrationDecisions(tx,10));
    expect(decisions.map(row=>[row.action,row.outcome,row.tenantId])).toEqual([["TENANT_REGISTRATION_APPROVED","SUCCESS",tenantA]]);
    await admin.query("DELETE FROM audit_events WHERE action IN ('SHIPMENT_HANDOVER_RECORDED','TENANT_REGISTRATION_APPROVED','TENANT_REGISTRATION_REJECTED')");
  });
});
