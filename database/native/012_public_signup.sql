-- Public email signup only. HTTP admission remains disabled until release gates close.
-- Existing initialize_account and account/session guards retain freeze/lifecycle admission.
BEGIN;
SET LOCAL ROLE mt_auth_owner;
GRANT INSERT ON native_auth."user" TO mt_auth_access;
-- No DELETE, privileged role membership, business RLS or ownership changes.
RESET ROLE;
COMMIT;
