# The reader zone is a procedure input, not server context

Procedures that bucket by day take the reader zone as an explicit input (parsed once into a reader calendar), and the server treats that input as authoritative. The `tz` cookie exists only so server-side prefetches can build the same query keys the client will; it is never read into the oRPC context. Reading it into context would drop the zone from query keys (so caches could not tell zones apart) and would be wrong on a first visit, before the cookie is written.
