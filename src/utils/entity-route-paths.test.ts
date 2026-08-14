import {
  getAdminDriverPath,
  getClientOrderRatePath,
  getClientOrderTrackingPath,
  getClientParcelTrackingPath,
  getDriverDeliveryPath,
  getDriverDocumentReuploadPath,
  getDriverParcelPath,
  getFoodOrderDetailPath,
  getFoodRestaurantPath,
  getTaxiRatePath,
} from './entity-route-paths';

describe('entity route paths', () => {
  it('encodes identifiers in static-compatible routes', () => {
    const id = 'id/with spaces';

    expect(getAdminDriverPath(id)).toBe('/admin/drivers/detail?uid=id%2Fwith%20spaces');
    expect(getClientOrderRatePath(id)).toBe('/client/rate?orderId=id%2Fwith%20spaces');
    expect(getClientOrderTrackingPath(id)).toBe('/client/order/tracking?orderId=id%2Fwith%20spaces');
    expect(getClientParcelTrackingPath(id)).toBe('/client/parcel/tracking?parcelId=id%2Fwith%20spaces');
    expect(getDriverDeliveryPath(id)).toBe('/driver/delivery?orderId=id%2Fwith%20spaces');
    expect(getDriverDocumentReuploadPath(id)).toBe('/driver/documents/reupload?docKey=id%2Fwith%20spaces');
    expect(getDriverParcelPath(id)).toBe('/driver/parcel?parcelId=id%2Fwith%20spaces');
    expect(getFoodOrderDetailPath(id)).toBe('/food/orders/detail?id=id%2Fwith%20spaces');
    expect(getFoodRestaurantPath(id)).toBe('/food/restaurant?id=id%2Fwith%20spaces');
    expect(getTaxiRatePath(id)).toBe('/taxi/rate?bookingId=id%2Fwith%20spaces');
  });
});
