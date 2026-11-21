CREATE TABLE IF NOT EXISTS api_limits (
  profile_id TEXT NOT NULL,
  bucket TEXT NOT NULL CHECK (bucket IN ('state', 'write')),
  minute INTEGER NOT NULL,
  hits INTEGER NOT NULL,
  PRIMARY KEY (profile_id, bucket)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS records_event_route_stop ON records (
  json_extract(payload, '$.routeId'), json_extract(payload, '$.stopId')
) WHERE kind = 'event';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS records_route_driver ON records (json_extract(payload, '$.driverId'))
  WHERE kind = 'route';
