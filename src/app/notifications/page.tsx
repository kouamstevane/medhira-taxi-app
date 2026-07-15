"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useDocumentStatus } from '@/hooks/useDocumentStatus';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { GlassCard } from '@/components/ui/GlassCard';
import { BottomNav } from '@/components/ui/BottomNav';
import { useNotifications } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import { NotificationCollection } from "@/services/notification.service";
import { driverNavItems, adminNavItems } from "@/components/ui/BottomNav";

export default function NotificationsPage() {
  const router = useRouter();
  const { userData, currentUser } = useAuth();
  const { notifications, isLoading, markAsRead, markAllAsRead } = useNotifications();
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  useEffect(() => {
    if (!currentUser) return;
    const checkAdmin = async () => {
      try {
        const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid));
        setIsAdmin(adminDoc.exists());
      } catch {
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, [currentUser]);

  // Capacité conducteur (spec §6.2) : présence de roles.driver
  const isDriver = userData?.roles?.driver != null;
  const navItems = isDriver ? driverNavItems : isAdmin ? adminNavItems : undefined;

  const { documents: driverDocs } = useDocumentStatus(isDriver ? (currentUser?.uid ?? null) : null);
  const approvedDocsCount = driverDocs.filter(d => d.status === 'approved').length;
  const [driverData, setDriverData] = useState<any>(null);

  useEffect(() => {
    if (!currentUser || !isDriver) return;
    const unsub = onSnapshot(doc(db, 'drivers', currentUser.uid), (snap) => {
      if (snap.exists()) {
        setDriverData(snap.data());
      }
    }, (err) => {
      console.error('[NOTIFICATIONS] Error listening to driver:', err);
    });
    return () => unsub();
  }, [currentUser, isDriver]);

  // Construire les notifications système dynamiques
  const systemNotifications: NotificationCollection[] = [];

  if (isDriver && driverData) {
    // 1. Candidature en cours d'examen
    if (driverData.status === 'pending') {
      systemNotifications.push({
        notificationId: 'sys_pending',
        userId: currentUser?.uid ?? '',
        title: "Candidature en cours d'examen",
        body: "Vos données sont en lecture seule jusqu'à approbation par notre équipe.",
        type: 'sys_pending',
        read: false,
        createdAt: driverData.createdAt || new Date().toISOString(),
      } as any);

      // 2. Votre adresse email est validée
      if (currentUser?.emailVerified) {
        systemNotifications.push({
          notificationId: 'sys_email_verified',
          userId: currentUser?.uid ?? '',
          title: "Adresse email validée",
          body: "Votre adresse email est validée. Votre candidature est en cours d'étude par notre équipe. Vous recevrez une confirmation dès que votre compte sera approuvé.",
          type: 'sys_email',
          read: true,
          createdAt: driverData.createdAt || new Date().toISOString(),
        } as any);
      }
    }

    // 3. Configuration des paiements requise
    const stripeStatus = driverData.stripeAccountStatus || 'not_created';
    const payoutsEnabled = !!driverData.stripePayoutsEnabled;
    const due = driverData.requirements?.currently_due;
    const requirementsCount = Array.isArray(due) ? due.length : 0;

    if (stripeStatus !== 'active' || !payoutsEnabled) {
      let stripeLabel = '';
      let stripeSublabel = '';
      let stripeType = 'sys_stripe_amber';

      if (stripeStatus === 'disabled') {
        stripeLabel = 'Compte de paiement désactivé';
        stripeSublabel = 'Contactez le support pour réactiver vos virements.';
        stripeType = 'sys_stripe_red';
      } else if (stripeStatus === 'restricted') {
        stripeLabel = 'Compte de paiement restreint';
        stripeSublabel = requirementsCount
          ? `${requirementsCount} information(s) à fournir pour débloquer vos virements.`
          : 'Vos virements sont bloqués. Vérifiez votre compte Stripe.';
        stripeType = 'sys_stripe_red';
      } else if (stripeStatus === 'not_created') {
        stripeLabel = 'Configuration des paiements requise';
        stripeSublabel = 'Vous ne pourrez pas être payé tant que votre compte Stripe n\'est pas configuré.';
        stripeType = 'sys_stripe_amber';
      } else { // pending
        stripeLabel = 'Configuration des paiements à terminer';
        stripeSublabel = requirementsCount
          ? `${requirementsCount} information(s) demandée(s) par Stripe.`
          : 'Vérification Stripe en cours.';
        stripeType = 'sys_stripe_amber';
      }

      systemNotifications.push({
        notificationId: 'sys_stripe',
        userId: currentUser?.uid ?? '',
        title: stripeLabel,
        body: stripeSublabel,
        type: stripeType,
        read: false,
        createdAt: driverData.updatedAt || new Date().toISOString(),
      } as any);
    }

    // 4. Disponible — En attente
    if (driverData.isAvailable) {
      systemNotifications.push({
        notificationId: 'sys_available',
        userId: currentUser?.uid ?? '',
        title: "Disponible — En attente",
        body: "Votre position est visible par les clients. Restez à proximité des zones animées.",
        type: 'sys_available',
        read: true,
        createdAt: new Date().toISOString(),
      } as any);
    }
  }

  const allNotifications = [...systemNotifications, ...notifications];
  const hasUnread = allNotifications.some((n) => !n.read);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "sys_pending":
        return (
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 animate-pulse">
            <MaterialIcon name="hourglass_top" size="md" />
          </div>
        );
      case "sys_stripe_amber":
        return (
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400">
            <MaterialIcon name="warning" size="md" />
          </div>
        );
      case "sys_stripe_red":
        return (
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
            <MaterialIcon name="block" size="md" />
          </div>
        );
      case "sys_email":
        return (
          <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
            <MaterialIcon name="mark_email_read" size="md" />
          </div>
        );
      case "sys_available":
        return (
          <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-400">
            <MaterialIcon name="check_circle" size="md" />
          </div>
        );
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
    if (notif.notificationId.startsWith('sys_')) {
      if (notif.notificationId === 'sys_stripe') {
        router.push('/driver/payments/setup');
      } else if (notif.notificationId === 'sys_pending') {
        router.push('/driver/documents');
      }
      return;
    }

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
      <main className="max-w-[430px] mx-auto px-4 pt-6 pb-28">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <MaterialIcon name="refresh" className="animate-spin text-primary text-[40px]" />
          </div>
        ) : allNotifications.length > 0 ? (
          <div className="space-y-3">
            {allNotifications.map((notif) => (
              <GlassCard
                key={notif.notificationId}
                variant={!notif.read ? "bordered" : "default"}
                className={`p-4 cursor-pointer transition-all ${
                  (notif.type as string) === "sys_stripe_red"
                    ? "border-l-red-500 border-l-2 bg-red-500/5 hover:bg-red-500/10"
                    : (notif.type as string) === "sys_stripe_amber" || (notif.type as string) === "sys_pending"
                    ? "border-l-amber-500 border-l-2 bg-amber-500/5 hover:bg-amber-500/10"
                    : (notif.type as string) === "sys_available"
                    ? "border-l-green-500 border-l-2 bg-green-500/5 hover:bg-green-500/10"
                    : !notif.read
                    ? "border-l-primary"
                    : ""
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
      <BottomNav items={navItems} />
    </div>
  );
}
