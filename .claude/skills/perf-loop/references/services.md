# Services and resources

## Comparable work

Record dataset size + shape, operation mix, arrival rate or client concurrency, connection pools, process count, warmup, cache hit/miss state. Representative fixtures; isolate write workloads. Default: local or approved test envs; prod load + destructive data changes need authorization.

Measure together: latency distributions w/ enough samples, completed useful ops per unit time, errors/timeouts. Count failed work in result. Lower latency from rejecting work or serving incomplete results = regression.

Check load generator not saturated. Record whether it sends at fixed arrival rate or waits for responses; waiting client lowers offered load during stalls → hides queuing delay (coordinated omission). Include queues + timed-out requests in interpretation. Compare at equal load before exploring capacity limits.

## Locate constraint

Traces + profiles → separate app CPU, queueing, locks, network, DB, disk. Inspect query count, execution plans, returned rows, payload only when they contribute to measured delay. Small fixture hides complaint → consider algorithmic scaling across representative data sizes.

Memory: distinguish peak, retained after idle/collection where observable, growth over repeated cycles. Compare equivalent lifecycle points. Allocation volume alone ≠ leak. Sustained scenario long enough to expose suspected behavior; state duration limitation.

Change could shift costs → measure CPU time, I/O volume, cache size, resource peaks. Faster responses via unbounded memory, more workers, or extra infra → explicit tradeoff + representative capacity measurements.

## Browser lifecycle and memory

For an idle or retention complaint, pilot a representative navigation cycle early. Wait for actual transition/teardown completion; rapid interrupted navigation is a separate stress scenario. Sample equivalent points after warmup, then expand the cycle count if accumulation remains measurable. Keep natural-idle and forced-collection series separate.

Distinguish three claims: old work stopped (callbacks/timers/listeners), resources disposed (scenes/textures/observers/workers), and objects collected. Balanced create/dispose counts, zero active loops or one heap drop cannot prove all three. Report each measured claim and its remaining limits; total process memory, JS heap and GPU allocations are not interchangeable.

If historical objects persist, inspect retaining paths before further teardown edits. Check both application references and measurement references, including console variables, remote handles and diagnostic arrays. Release inspection handles before collection checks. WeakRefs surviving without a known collection opportunity do not alone prove a leak. If collection or retaining-path evidence is unavailable, bound the activity/disposal result and leave overall release unresolved.

## Correctness under pressure

After caching, concurrency, query, or storage changes → verify relevant freshness, invalidation, permissions, ordering, pagination, cancellation, retries, transaction behavior. Preserve persistence + isolation guarantees. Include repeated ops + failure paths where change could alter them.

Record startup + steady-state effects. Confirm 1 faster endpoint hasn't pushed load onto a dependency or slowed another protected op. Scope perf conclusions to measured load + data distribution.
