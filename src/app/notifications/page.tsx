"use client";

import { useRouter } from "next/navigation";
import { FiArrowLeft, FiBell, FiCheck, FiClock } from "react-icons/fi";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationCollection } from "@/services/notification.service";

export default function NotificationsPage() {
  const router = useRouter();
  const { notifications, isLoading, markAsRead, markAllAsRead } = useNotifications();

  const hasUnread = notifications.some((n) => !n.read);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "booking_request":
      case "food_order":
        return (
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
            <FiBell />
          </div>
        );
      case "trip_started":
      case "food_order_update":
        return (
          <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600">
            <FiClock />
          </div>
        );
      case "trip_completed":
      case "payment_received":
        return (
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
            <FiCheck />
          </div>
        );
      case "alert":
        return (
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
            <FiBell />
          </div>
        );
      default:
        return (
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600">
            <FiBell />
          </div>
        );
    }
  };

  const handleNotificationClick = async (notif: NotificationCollection) => {
    if (!notif.read) await markAsRead(notif.notificationId);

    // Navigation contextuelle selon le type
    if (notif.metadata) {
      if (notif.type === "booking_request" || notif.type === "food_order") {
        router.push("/chauffeur/courses");
      } else if (notif.type === "trip_started" || notif.type === "driver_arrived") {
        if (notif.metadata.tripId) router.push(`/taxi/trip/${notif.metadata.tripId}`);
      } else if (notif.type === "payment_received") {
        router.push("/wallet");
      } else if (notif.type === "food_order_update") {
        if (notif.metadata.orderId) router.push(`/food/orders/${notif.metadata.orderId}`);
      }
    }
  };

  const formatDate = (dateOrTimestamp: any) => {
    if (!dateOrTimestamp) return "";
    const date = dateOrTimestamp.seconds
      ? new Date(dateOrTimestamp.seconds * 1000)
      : new Date(dateOrTimestamp);
    return date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      {/* Header */}
      <header className="bg-[#101010] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center">
          <button
            onClick={() => router.back()}
            className="p-2 mr-2 rounded-full hover:bg-[#333] transition touch-manipulation"
            aria-label="Retour"
          >
            <FiArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="text-xl font-bold">Notifications</h1>
        </div>
        {hasUnread && (
          <button
            onClick={markAllAsRead}
            className="text-sm font-medium text-[#f29200] hover:text-[#e08800] px-3 py-2 rounded-lg touch-manipulation"
          >
            Tout marquer lu
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#f29200]" />
          </div>
        ) : notifications.length > 0 ? (
          <div className="space-y-4">
            {notifications.map((notif) => (
              <div
                key={notif.notificationId}
                onClick={() => handleNotificationClick(notif)}
                className={`bg-white p-4 rounded-xl shadow-sm border cursor-pointer transition-all ${
                  !notif.read ? "border-[#f29200] border-l-4" : "border-gray-200"
                }`}
              >
                <div className="flex items-start">
                  <div className="mr-4 mt-1">{getNotificationIcon(notif.type)}</div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <h3
                        className={`text-base ${
                          !notif.read ? "font-bold text-[#101010]" : "font-semibold text-gray-800"
                        }`}
                      >
                        {notif.title}
                      </h3>
                      <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                        {formatDate(notif.createdAt)}
                      </span>
                    </div>
                    <p className={`text-sm ${!notif.read ? "text-gray-800" : "text-gray-600"}`}>
                      {notif.body}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiBell className="h-10 w-10 text-gray-400" />
            </div>
            <h2 className="text-xl font-bold text-[#101010] mb-2">Aucune notification</h2>
            <p className="text-gray-500">
              Vous n&apos;avez pas de nouvelles notifications pour le moment.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
