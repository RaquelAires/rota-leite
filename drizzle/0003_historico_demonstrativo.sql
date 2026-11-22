-- Histórico fictício e planejamento de novembro para a demonstração.
-- Os IDs são estáveis para que novas implantações não repitam os registros.
WITH RECURSIVE
  days(day) AS (
    VALUES (15)
    UNION ALL
    SELECT day + 1 FROM days WHERE day < 30
  ),
  routes(day, route_date, route_id, route_name) AS (
    SELECT day, printf('2026-11-%02d', day),
           printf('rota-demo-novembro-2026-%02d', day),
           CASE WHEN day % 2 = 0 THEN 'Rota Jatobá' ELSE 'Rota Barreiro' END
    FROM days WHERE day <> 21
  ),
  producers(producer_id, expected, route_name, stop_number, collection_time) AS (
    VALUES
      ('prod-01', 240, 'Rota Barreiro', 1, '07:10'),
      ('prod-02', 320, 'Rota Barreiro', 2, '07:45'),
      ('prod-03', 200, 'Rota Barreiro', 3, '08:20'),
      ('prod-04', 180, 'Rota Jatobá', 1, '07:15'),
      ('prod-05', 310, 'Rota Jatobá', 2, '08:05')
  ),
  stops AS (
    SELECT routes.*, producers.producer_id, producers.expected,
           producers.collection_time,
           route_id || '-parada-' || producers.stop_number AS stop_id,
           day IN (17, 20) AND producers.stop_number = 2 AS incident
    FROM routes JOIN producers USING (route_name)
  )
INSERT OR IGNORE INTO records (kind, id, payload)
SELECT 'route', route_id,
       json_object(
         'id', route_id, 'name', route_name, 'date', route_date,
         'driver', 'Equipe de coleta', 'demo', json('true'),
         'closedAt', CASE WHEN day < 22 THEN route_date || 'T09:00:00-03:00' END,
         'stops', json_group_array(json_object(
           'id', stop_id, 'producerId', producer_id, 'expected', expected
         ))
       )
FROM stops GROUP BY day, route_id, route_name, route_date
UNION ALL
SELECT 'event', 'registro-demo-' || stop_id,
       json_object(
         'id', 'registro-demo-' || stop_id, 'routeId', route_id, 'stopId', stop_id,
         'status', CASE WHEN incident THEN 'incident' ELSE 'collected' END,
         'liters', CASE WHEN NOT incident THEN expected - (day * 7 % 29) END,
         'reason', CASE WHEN incident THEN 'Acesso bloqueado' ELSE '' END,
         'notes', '', 'at', route_date || 'T' || collection_time || ':00-03:00',
         'demo', json('true')
       )
FROM stops
WHERE day < 22 OR (day = 22 AND producer_id = 'prod-04');
