ALTER TABLE "shipments" DROP CONSTRAINT "shipments_status_valid";--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_status_valid" CHECK (status IN (
        'DRAFT',
        'ESTIMATED',
        'SUBMISSION_QUEUED',
        'SUBMISSION_UNKNOWN',
        'ISSUED',
        'AWAITING_UPSTREAM_PAYMENT',
        'FAILED',
        'RTS_QUEUED',
        'RTS_IN_TRANSIT',
        'RTS_RECEIVED',
        'IN_TRANSIT',
        'DELIVERED',
        'PROBLEM'
      ));