import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/db/client";
import { providerOrderSnapshots, shipments, shipmentStatuses } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const signature =
      req.headers.get("x-mengantar-signature") ||
      req.headers.get("x-webhook-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    const secret = process.env.MENGANTAR_WEBHOOK_SECRET;
    if (!secret) {
      console.error("MENGANTAR_WEBHOOK_SECRET is not configured");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    const rawBody = await req.text();

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    if (signature !== expectedSignature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    // Support both single object and array of updates
    const updates = Array.isArray(payload) ? payload : [payload];

    for (const update of updates) {
      const cnoteNo = update.cnote_no || update.awb || update.tracking_number;
      let status = update.status || update.tracking_status;

      if (!cnoteNo || !status) {
        continue;
      }

      status = status.toUpperCase();
      
      // Normalize common status strings to our DB enums
      let normalizedStatus: typeof shipmentStatuses[number] | null = null;
      
      if (status === "DELIVERED" || status === "SUCCESS") {
        normalizedStatus = "DELIVERED";
      } else if (status === "IN_TRANSIT" || status === "ON_PROCESS" || status === "MANIFESTED") {
        normalizedStatus = "IN_TRANSIT";
      } else if (status === "PROBLEM" || status === "UNDELIVERED" || status === "FAILED") {
        normalizedStatus = "PROBLEM";
      } else if (status === "RETURNED" || status === "RTS" || status === "RETURN_TO_SENDER") {
        normalizedStatus = "RTS_RECEIVED";
      } else if (status === "RTS_IN_TRANSIT") {
        normalizedStatus = "RTS_IN_TRANSIT";
      } else {
        // Fallback for valid literal statuses
        if ((shipmentStatuses as readonly string[]).includes(status)) {
          normalizedStatus = status as typeof shipmentStatuses[number];
        }
      }

      if (!normalizedStatus) {
        continue;
      }

      // Find the corresponding provider order snapshot
      const orderSnapshot = await db.query.providerOrderSnapshots.findFirst({
        where: eq(providerOrderSnapshots.cnoteNo, cnoteNo),
        columns: { shipmentId: true },
      });

      if (orderSnapshot) {
        // Update the shipment status
        await db
          .update(shipments)
          .set({ status: normalizedStatus, updatedAt: new Date() })
          .where(eq(shipments.id, orderSnapshot.shipmentId));
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
