/**
 * Canonical in-app / FCM notification type keys.
 * Used when persisting Notification.type and in FCM data payloads.
 */
const NOTIFICATION_TYPES = {
  // Picking
  ORDER_ASSIGNED: "order_assigned",
  ORDER_REASSIGNED: "order_reassigned",
  PICKER_AVAILABILITY: "picker_availability",
  ESCALATION: "escalation",
  ORDER_SENT_TO_SUPER_ADMIN: "order_sent_to_super_admin",

  // Delivery
  DELIVERY_READY: "delivery_ready",
  DELIVERY_ASSIGNED: "delivery_assigned",
  DELIVERY_REASSIGNED: "delivery_reassigned",
  DELIVERY_ROUTE_ASSIGNED: "delivery_route_assigned",
  DELIVERY_STARTED: "delivery_started",
  DELIVERY_COMPLETED: "delivery_completed",
  DELIVERY_FAILED: "delivery_failed",

  // General
  INFO: "info",
  NEW_ORDER: "new_order",
  ORDER_RECEIVED: "order_received",
};

const NOTIFICATION_TYPE_CATALOG = [
  { key: NOTIFICATION_TYPES.ORDER_ASSIGNED, label: "Order assigned to picker", group: "Picking" },
  { key: NOTIFICATION_TYPES.ORDER_REASSIGNED, label: "Order reassigned", group: "Picking" },
  { key: NOTIFICATION_TYPES.PICKER_AVAILABILITY, label: "Picker availability", group: "Picking" },
  { key: NOTIFICATION_TYPES.ESCALATION, label: "Escalation", group: "Picking" },
  { key: NOTIFICATION_TYPES.ORDER_SENT_TO_SUPER_ADMIN, label: "Order sent to admin", group: "Picking" },
  { key: NOTIFICATION_TYPES.NEW_ORDER, label: "New order", group: "Picking" },
  { key: NOTIFICATION_TYPES.ORDER_RECEIVED, label: "New order (manager)", group: "Picking" },
  { key: NOTIFICATION_TYPES.DELIVERY_READY, label: "Ready for delivery", group: "Delivery" },
  { key: NOTIFICATION_TYPES.DELIVERY_ASSIGNED, label: "Delivery assigned", group: "Delivery" },
  { key: NOTIFICATION_TYPES.DELIVERY_REASSIGNED, label: "Delivery reassigned", group: "Delivery" },
  { key: NOTIFICATION_TYPES.DELIVERY_ROUTE_ASSIGNED, label: "Delivery route assigned", group: "Delivery" },
  { key: NOTIFICATION_TYPES.DELIVERY_STARTED, label: "Out for delivery", group: "Delivery" },
  { key: NOTIFICATION_TYPES.DELIVERY_COMPLETED, label: "Delivery completed", group: "Delivery" },
  { key: NOTIFICATION_TYPES.DELIVERY_FAILED, label: "Delivery failed", group: "Delivery" },
  { key: NOTIFICATION_TYPES.INFO, label: "General info", group: "General" },
];

const VALID_TYPES = new Set(Object.values(NOTIFICATION_TYPES));

function isValidNotificationType(type) {
  return VALID_TYPES.has(type);
}

module.exports = {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_CATALOG,
  VALID_TYPES,
  isValidNotificationType,
};
