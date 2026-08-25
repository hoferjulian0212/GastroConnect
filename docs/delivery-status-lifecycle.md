# Delivery status lifecycle

## Two connected state machines

Order status is the commercial lifecycle. Delivery-assignment status is the
operational lifecycle for the driver. They are not interchangeable: a driver
never directly selects a commercial status, and a restaurant never advances a
driver stop.

| Commercial order status | Owner / next action | Operational assignment effect |
| --- | --- | --- |
| `pending` | Supplier confirms, partially confirms, or cancels. | No assignment. |
| `confirmed` / `partially_confirmed` | Supplier schedules or cancels. Restaurant may request permitted corrections. | An office assignment changes the order to `scheduled`. |
| `scheduled` | Driver starts the stop; supplier may replan or unassign. | `assigned` starts the driver flow. |
| `in_delivery` | Driver reports arrival, a problem, or completion. | `en_route` or `arriving`; office handles exceptions. |
| `to_review` | Supplier office replans, confirms again, cancels, or returns the delivery to a route. | `problem` / `rejected` stays auditable. |
| `delivered` | Terminal commercial outcome. | The assignment is `delivered` with proof of delivery. |
| `cancelled` | Supplier or restaurant corrects/reopens only through the guarded correction path. | Undelivered assignment is removed. |

| Assignment status | Owner / next action | Order bridge |
| --- | --- | --- |
| `assigned` | Driver picks up or starts an approved route. | Order remains `scheduled`. |
| `picked_up` | Driver starts delivery. | Order remains `scheduled`. |
| `en_route` | Driver marks arrival. | Order becomes `in_delivery`. |
| `arriving` | Driver records proof and completes. | Completion makes the order and assignment `delivered`. |
| `problem` | Supplier office authorizes continuation, replans, or sends to review. | Continuation restores the saved operational state; review changes the order to `to_review`. |
| `rejected` | Supplier office replans. | Order is `to_review` until replanned. |
| `delivered` | Terminal operational outcome. | Order must be `delivered`. |

## Enforcement

- The shared lifecycle policy validates every commercial transition in the
  stock-and-history transaction and validates driver progression in the driver
  status route.
- Authorization stays route-specific: restaurants/suppliers manage commercial
  orders; supplier offices assign/replan; drivers progress only their own stops;
  platform administrators use the same role permissions when viewing as a user.
- A state-changing route writes order history before it reports success. The
  route that owns the bridge also emits the matching restaurant/supplier
  notification, so commercial history and delivery tracking describe the same
  hand-off.
- A same-state retry is idempotent. Concurrent commercial changes are rejected
  by the order-row lock and expected-status comparison.