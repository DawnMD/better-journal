# Reader calendar is split into client and server modules

The reader's calendar day is owned by two modules on one shared core instead of one isomorphic module. Day-boundary arithmetic (TZDate / `@date-fns/tz`) stays server-only so the timezone database never enters the browser bundle; the shared core uses only `Intl`, and the client module exposes the reader zone and formatting. Merging them would mean either shipping the tz database to the browser or rewriting the DST-tested day-window arithmetic on bare `Intl`, and neither was worth it.
