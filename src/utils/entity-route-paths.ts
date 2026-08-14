const withQuery = (path: string, key: string, value: string): string =>
  `${path}?${key}=${encodeURIComponent(value)}`;

export const getAdminDriverPath = (uid: string) => withQuery('/admin/drivers/detail', 'uid', uid);
export const getClientOrderRatePath = (orderId: string) => withQuery('/client/rate', 'orderId', orderId);
export const getClientOrderTrackingPath = (orderId: string) => withQuery('/client/order/tracking', 'orderId', orderId);
export const getClientParcelTrackingPath = (parcelId: string) => withQuery('/client/parcel/tracking', 'parcelId', parcelId);
export const getDriverDeliveryPath = (orderId: string) => withQuery('/driver/delivery', 'orderId', orderId);
export const getDriverDocumentReuploadPath = (docKey: string) => withQuery('/driver/documents/reupload', 'docKey', docKey);
export const getDriverParcelPath = (parcelId: string) => withQuery('/driver/parcel', 'parcelId', parcelId);
export const getFoodOrderDetailPath = (id: string) => withQuery('/food/orders/detail', 'id', id);
export const getFoodRestaurantPath = (id: string) => withQuery('/food/restaurant', 'id', id);
export const getTaxiRatePath = (bookingId: string) => withQuery('/taxi/rate', 'bookingId', bookingId);
