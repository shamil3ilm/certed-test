-- Drop finance_totals(text), and with it an EXECUTE grant to `authenticated`.
--
-- The app reached this through financeTotals -> callFinanceTotals, and nothing called
-- financeTotals: the dashboards moved to finance_totals_base (0056) when multi-currency
-- landed, because a per-currency list cannot be summed into one headline figure. The SQL
-- function stayed, still granted to `authenticated` by 0034 and re-allowlisted by the 0096
-- sweep.
--
-- That grant is the point of this migration. An unused function reachable by every signed-in
-- user is exactly the surface C-01 was about: it costs nothing to keep and nothing to call,
-- until a future change to it matters. Removing the caller without removing the grant would
-- leave the reachable half behind.
--
-- finance_totals_base is UNAFFECTED - it is the one the app actually uses, and it keeps its
-- own authenticated grant.

begin;

drop function if exists public.finance_totals(text);

commit;
