-- Backfill districts.ocd_id for the seeded races.
-- calibrate_district_alignment and the civic fence look districts up by OCD
-- division, so a NULL ocd_id meant TX-37 could only be matched by raw uuid.
-- Values mirror elections.ocd_id for the same district. Only NULLs are filled.

update public.districts as d
set ocd_id = v.ocd_id
from (
  values
    ('d1570001-0037-4000-8000-000000000037'::uuid, 'ocd-division/country:us/state:tx/cd:37'),
    ('d1570001-0014-4000-8000-000000000014'::uuid, 'ocd-division/country:us/state:tx/sldu:14'),
    ('d1570001-0009-4000-8000-000000000009'::uuid, 'ocd-division/country:us/state:tx/place:austin/council_district:9'),
    ('d1570001-0010-4000-8000-000000000010'::uuid, 'ocd-division/country:us/state:tx/cd:10'),
    ('d1570001-0707-4000-8000-000000000707'::uuid, 'ocd-division/country:us/state:mi/cd:7')
) as v(id, ocd_id)
where d.id = v.id
  and d.ocd_id is null;

notify pgrst, 'reload schema';
