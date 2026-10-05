-- FIXTURE ONLY. Never a production/staging migration. Provision only inside
-- the independently verified, isolated privacy_05f_disposable database.
create table private_privacy_ops.disposable_fixture_identity (
  singleton boolean primary key check(singleton),
  fingerprint text not null check(fingerprint='mediatracker-privacy-disposable-v1')
);
revoke all on private_privacy_ops.disposable_fixture_identity from public,anon,authenticated,service_role;
insert into private_privacy_ops.disposable_fixture_identity values(true,'mediatracker-privacy-disposable-v1');
