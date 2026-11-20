CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "availability_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"venue_id" uuid NOT NULL,
	"candidate_id" uuid,
	"plan_id" uuid,
	"verifier" text NOT NULL,
	"tier" text NOT NULL,
	"source" text NOT NULL,
	"slot_start" timestamp with time zone NOT NULL,
	"duration_mins" integer,
	"party_size" integer NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"matched_slot" jsonb,
	"checked_at" timestamp with time zone NOT NULL,
	"checked_by_participant_id" uuid,
	"from_cache" boolean DEFAULT false NOT NULL,
	"raw_payload_id" uuid,
	"latency_ms" integer,
	"purpose" text NOT NULL,
	"job_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_handoffs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"method" text NOT NULL,
	"url" text NOT NULL,
	"prefilled" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clicked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"search_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"activity" text NOT NULL,
	"slot_start" timestamp with time zone NOT NULL,
	"duration_mins" integer NOT NULL,
	"party_size" integer NOT NULL,
	"score" real NOT NULL,
	"rationale" text,
	"ranker" text NOT NULL,
	"ranker_model" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"latest_snapshot_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"default_party_size" integer NOT NULL,
	"areas" text[] DEFAULT '{}'::text[] NOT NULL,
	"activity_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"budget_band" text,
	"weekly_picks_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"host_participant_id" uuid NOT NULL,
	"host_secret_hash" text NOT NULL,
	"search_id" uuid,
	"candidate_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"activity" text NOT NULL,
	"slot_start" timestamp with time zone NOT NULL,
	"duration_mins" integer NOT NULL,
	"party_size" integer NOT NULL,
	"quorum" text DEFAULT 'party_size' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"confirming_snapshot_id" uuid,
	"replaced_by_plan_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "plans_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "rsvps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "searches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"host_participant_id" uuid NOT NULL,
	"crew_id" uuid,
	"activity" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"party_size" integer NOT NULL,
	"areas" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"budget_band" text,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"error" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "searches_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"participant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"activity" text NOT NULL,
	"area" text NOT NULL,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"price_band" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"booking_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_payloads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sha256" text NOT NULL,
	"content_type" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_snapshots" ADD CONSTRAINT "availability_snapshots_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_snapshots" ADD CONSTRAINT "availability_snapshots_checked_by_participant_id_participants_id_fk" FOREIGN KEY ("checked_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_snapshots" ADD CONSTRAINT "availability_snapshots_raw_payload_id_verification_payloads_id_fk" FOREIGN KEY ("raw_payload_id") REFERENCES "public"."verification_payloads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_handoffs" ADD CONSTRAINT "booking_handoffs_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crews" ADD CONSTRAINT "crews_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_host_participant_id_participants_id_fk" FOREIGN KEY ("host_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "searches" ADD CONSTRAINT "searches_host_participant_id_participants_id_fk" FOREIGN KEY ("host_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "searches" ADD CONSTRAINT "searches_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "snapshots_slot_idx" ON "availability_snapshots" USING btree ("venue_id","slot_start","party_size","checked_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "snapshots_candidate_idx" ON "availability_snapshots" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "snapshots_plan_idx" ON "availability_snapshots" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_idem_uq" ON "candidates" USING btree ("search_id","venue_id","slot_start","party_size");--> statement-breakpoint
CREATE UNIQUE INDEX "rsvps_plan_participant_uq" ON "rsvps" USING btree ("plan_id","participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venues_provider_external_uq" ON "venues" USING btree ("provider","external_id");