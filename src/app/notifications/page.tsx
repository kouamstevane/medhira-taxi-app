"use client";

import { useRouter } from "next/navigation";
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { GlassCard } from '@/components/ui/GlassCard';
import { BottomNav } from '@/components/ui/BottomNav';
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
          <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
            <MaterialIcon name="notifications" size="md" />
          </div>
        );
      case "trip_started":
      case "food_order_update":
        return (
          <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-400">
            <MaterialIcon name="schedule" size="md" />
          </div>
        );
      case "trip_completed":
      case "payment_received":
        return (
          <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-400">
            <MaterialIcon name="check_circle" size="md" />
          </div>
        );
      case "alert":
        return (
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
            <MaterialIcon name="warning" size="md" />
          </div>
        );
      default:
        return (
          <div className="w-10 h-10 rounded-full bg-slate-500/10 flex items-center justify-center text-slate-400">
            <MaterialIcon name="notifications" size="md" />
          </div>
        );
    }
  };

  const handleNotificationClick = async (notif: NotificationCollection) => {
    if (!notif.read) await markAsRead(notif.notificationId);

    // Navigation contextuelle selon le type
    if (notif.metadata) {
      if (notif.type === "booking_request" || notif.type === "food_order") {
        router.push("/driver/dashboard");
      } else if (notif.type === "trip_started" || notif.type === "driver_arrived") {
        if (notif.metadata.tripId) router.push(`/taxi/confirmation?bookingId=${notif.metadata.tripId}`);
        else router.push("/taxi");
      } else if (notif.type === "payment_received") {
        router.push("/wallet");
      } else if (notif.type === "food_order_update") {
        if (notif.metadata.orderId) router.push(`/food/orders/${notif.metadata.orderId}`);
      }
    }
  };

  const formatDate = (dateOrTimestamp: { seconds?: number } | Date | number | string | null | undefined) => {
    if (!dateOrTimestamp) return "";
    const hasSeconds = typeof dateOrTimestamp === 'object' && !(dateOrTimestamp instanceof Date) && 'seconds' in dateOrTimestamp;
    const date = hasSeconds
      ? new Date((dateOrTimestamp as { seconds: number }).seconds * 1000)
      : new Date(dateOrTimestamp as string | number | Date);
    return date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0D0D0D] backdrop-blur-xl border-b border-white/5">
        <div className="max-w-[430px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={() => router.back()}
              className="p-2 mr-2 rounded-full hover:bg-white/5 transition touch-manipulation"
              aria-label="Retour"
            >
              <MaterialIcon name="arrow_back" className="text-white" />
            </button>
            <h1 className="text-xl font-bold text-white">Notifications</h1>
          </div>
          {hasUnread && (
            <button
              onClick={markAllAsRead}
              className="text-sm font-medium text-primary hover:text-[#ffae33] px-3 py-2 rounded-lg touch-manipulation transition"
            >
              Tout marquer lu
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[430px] mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <MaterialIcon name="refresh" className="animate-spin text-primary text-[40px]" />
          </div>
        ) : notifications.length > 0 ? (
          <div className="space-y-3">
            {notifications.map((notif) => (
              <GlassCard
                key={notif.notificationId}
                variant={!notif.read ? "bordered" : "default"}
                className={`p-4 cursor-pointer transition-all ${
                  !notif.read ? "border-l-primary" : ""
                }`}
                onClick={() => handleNotificationClick(notif)}
              >
                <div className="flex items-start">
                  <div className="mr-4 mt-1">{getNotificationIcon(notif.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <h3
                        className={`text-base truncate ${
                          !notif.read ? "font-bold text-white" : "font-semibold text-slate-300"
                        }`}
                      >
                        {notif.title}
                      </h3>
                      <span className="text-xs text-slate-500 whitespace-nowrap ml-2">
                        {formatDate(notif.createdAt)}
                      </span>
                    </div>
                    <p className={`text-sm ${!notif.read ? "text-slate-300" : "text-slate-400"}`}>
                      {notif.body}
                    </p>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        ) : (
          <GlassCard className="p-8 text-center">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <MaterialIcon name="notifications_off" className="text-slate-500 text-[40px]" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Aucune notification</h2>
            <p className="text-slate-500">
              Vous n&apos;avez pas de nouvelles notifications pour le moment.
            </p>
          </GlassCard>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
