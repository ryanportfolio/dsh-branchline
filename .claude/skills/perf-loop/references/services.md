# Services and resources

## Define comparable work

Record dataset size and shape, operation mix, arrival rate or client concurrency, connection pools, process count, warmup, and cache hit/miss state. Use representative fixtures and isolate write workloads. Run local or approved test environments by default; production load and destructive data changes require authorization.

Measure latency distributions with enough samples, completed useful operations per unit time, and errors/timeouts together. Count failed work in the result. Lower latency caused by rejecting work or serving incomplete results is a regression.

Check that the load generator is not saturated. Record whether it sends at a fixed arrival rate or waits for responses; a client that waits can reduce offered load during stalls and hide queuing delay. Include queues and timed-out requests in the interpretation. Compare at equal load before exploring capacity limits.

## Locate the constraint

Use traces and profiles to separate application CPU, queueing, locks, network, database, and disk. Inspect query count, execution plans, returned rows, and payload only when they contribute to measured delay. Consider algorithmic scaling across representative data sizes when the small fixture hides the complaint.

For memory, distinguish peak usage, retained usage after idle/collection where observable, and growth over repeated cycles. Compare equivalent lifecycle points. Allocation volume alone cannot establish a leak. Use a sustained scenario long enough to expose the suspected behavior and state the duration limitation.

Measure CPU time, I/O volume, cache size, and resource peaks when changes could shift costs. Faster responses achieved by unbounded memory, more workers, or extra infrastructure need an explicit tradeoff and representative capacity measurements.

## Check correctness under pressure

After changes to caching, concurrency, queries, or storage, verify relevant freshness, invalidation, permissions, ordering, pagination, cancellation, retries, and transaction behavior. Preserve persistence and isolation guarantees. Include repeated operations and failure paths where the change could alter their behavior.

Record both startup and steady-state effects. Confirm that one faster endpoint has not pushed load onto a dependency or made another protected operation slower. Keep performance conclusions scoped to the measured load and data distribution.
